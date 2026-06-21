import { REQUEST_HEADERS_RULE_ID, buildRequestHeadersRule } from './dnr';
import {
  buildApiUrl,
  buildProxyUrl,
  getAuthHeaders,
  isReaderHostBlocked,
  type LadderSettings,
} from './ladder';
import {
  OPEN_READER_WITH_LADDER,
  OPEN_WITH_LADDER,
  type OpenReaderWithLadderMessage,
  type OpenWithLadderMessage,
  type OpenWithLadderResponse,
} from './messages';
import { readerSessionKey, type ReaderSession } from './reader-session';
import { USER_AGENT_PROFILE_HEADER, autoUserAgentProfiles, type UserAgentProfileId } from './user-agents';

const isOpenMessage = (message: unknown): message is OpenWithLadderMessage =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === OPEN_WITH_LADDER;

const isReaderMessage = (message: unknown): message is OpenReaderWithLadderMessage =>
  typeof message === 'object' &&
  message !== null &&
  (message as { type?: unknown }).type === OPEN_READER_WITH_LADDER;

type LadderProbeResponse = {
  body?: string;
  response?: {
    status?: number;
  };
};

type LadderTargetMessage = {
  settings: LadderSettings;
  targetUrl: string;
};

const blockPageMarkers = [
  '403 forbidden',
  'access denied',
  'access to this page has been denied',
  'are you a robot',
  'captcha',
  'checking your browser',
  'enable javascript and cookies',
  'error 54113',
  'varnish cache server',
];

const buildProbeHeaders = (message: LadderTargetMessage, profileId: UserAgentProfileId) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const { header, value } of getAuthHeaders(message.settings)) {
    if (value.trim() !== '') {
      headers.set(header, value);
    }
  }
  headers.set(USER_AGENT_PROFILE_HEADER, profileId);
  return headers;
};

const isSuccessfulProbe = (probe: LadderProbeResponse) => {
  const upstreamStatus = probe.response?.status;
  if (upstreamStatus === undefined || upstreamStatus < 200 || upstreamStatus >= 400) {
    return false;
  }

  const bodyPreview = (probe.body ?? '').slice(0, 4000).toLowerCase();
  return bodyPreview.trim() !== '' && !blockPageMarkers.some(marker => bodyPreview.includes(marker));
};

const findWorkingUserAgentProfile = async (message: LadderTargetMessage): Promise<UserAgentProfileId> => {
  const apiUrl = buildApiUrl(message.settings.baseUrl);

  for (const profile of autoUserAgentProfiles) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: buildProbeHeaders(message, profile.id),
      body: JSON.stringify({ url: message.targetUrl, userAgentProfile: profile.id }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Ladder API returned ${response.status}. Check the configured Ladder auth.`);
    }
    if (!response.ok) {
      continue;
    }

    let probe: LadderProbeResponse;
    try {
      probe = (await response.json()) as LadderProbeResponse;
    } catch {
      continue;
    }
    if (isSuccessfulProbe(probe)) {
      return profile.id;
    }
  }

  throw new Error('No configured upstream user agent returned a usable page');
};

const selectUserAgentProfile = async (message: LadderTargetMessage): Promise<UserAgentProfileId | undefined> => {
  if (message.settings.userAgentMode === 'auto') {
    return findWorkingUserAgentProfile(message);
  }
  if (
    message.settings.userAgentMode !== 'server' &&
    message.settings.userAgentMode !== 'custom'
  ) {
    return message.settings.userAgentMode;
  }
  return undefined;
};

const openWithLadder = async (message: OpenWithLadderMessage): Promise<OpenWithLadderResponse> => {
  const selectedProfile = await selectUserAgentProfile(message);
  const rule = buildRequestHeadersRule(message.settings, selectedProfile);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [REQUEST_HEADERS_RULE_ID],
    addRules: rule ? [rule] : [],
  });

  const url = buildProxyUrl(message.settings.baseUrl, message.targetUrl);

  if (message.tabId === undefined) {
    await chrome.tabs.create({ url });
  } else {
    await chrome.tabs.update(message.tabId, { url });
  }

  return { url, selectedUserAgentProfile: selectedProfile };
};

const openReaderWithLadder = async (message: OpenReaderWithLadderMessage): Promise<OpenWithLadderResponse> => {
  if (isReaderHostBlocked(message.targetUrl, message.settings.readerBlockedHosts)) {
    throw new Error('This page is blocked from reader mode');
  }

  const selectedProfile = await selectUserAgentProfile(message);
  const rule = buildRequestHeadersRule(message.settings, selectedProfile);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [REQUEST_HEADERS_RULE_ID],
    addRules: rule ? [rule] : [],
  });

  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    [readerSessionKey(id)]: {
      settings: message.settings,
      targetUrl: message.targetUrl,
      selectedUserAgentProfile: selectedProfile,
    } satisfies ReaderSession,
  });

  const url = chrome.runtime.getURL(`reader.html?id=${encodeURIComponent(id)}`);
  if (message.tabId === undefined) {
    await chrome.tabs.create({ url });
  } else {
    await chrome.tabs.update(message.tabId, { url });
  }

  return { url, selectedUserAgentProfile: selectedProfile };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOpenMessage(message) && !isReaderMessage(message)) {
    return false;
  }

  const action = isReaderMessage(message) ? openReaderWithLadder(message) : openWithLadder(message);
  void action.then(sendResponse, error => {
    sendResponse({ error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
