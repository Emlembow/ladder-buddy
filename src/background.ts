import { LEGACY_DYNAMIC_RULE_ID, buildRequestHeadersRule, sessionRuleIdForTab } from './dnr';
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

// Older versions left a persistent, global credential rule behind. Remove it on every
// service-worker start before opening a page with a tab-scoped session rule.
const removeLegacyRule = chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [LEGACY_DYNAMIC_RULE_ID],
});

const openingTabs = new Set<number>();

const prepareTab = async (requestedTabId?: number): Promise<number> => {
  if (requestedTabId === undefined) {
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    if (tab.id === undefined) {
      throw new Error('Chrome did not create a tab');
    }
    return tab.id;
  }

  // Discard the source page before installing credentials for its tab.
  await chrome.tabs.update(requestedTabId, { url: 'about:blank' });
  return requestedTabId;
};

const openInPreparedTab = async (
  requestedTabId: number | undefined,
  targetUrl: string,
  settings: LadderSettings,
  selectedProfile: UserAgentProfileId | undefined,
  isReader: boolean,
) => {
  await removeLegacyRule;
  const tabId = await prepareTab(requestedTabId);
  openingTabs.add(tabId);
  const ruleId = sessionRuleIdForTab(tabId);
  const rule = buildRequestHeadersRule(
    settings,
    { tabId, ...(isReader ? { initiatorDomain: chrome.runtime.id } : {}) },
    selectedProfile,
  );

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: rule ? [rule] : [],
    });
    await chrome.tabs.update(tabId, { url: targetUrl });
  } catch (error) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
    throw error;
  } finally {
    openingTabs.delete(tabId);
  }
};

const openWithLadder = async (message: OpenWithLadderMessage): Promise<OpenWithLadderResponse> => {
  const selectedProfile = await selectUserAgentProfile(message);
  const url = buildProxyUrl(message.settings.baseUrl, message.targetUrl);
  await openInPreparedTab(message.tabId, url, message.settings, selectedProfile, false);

  return { url, selectedUserAgentProfile: selectedProfile };
};

const openReaderWithLadder = async (message: OpenReaderWithLadderMessage): Promise<OpenWithLadderResponse> => {
  if (isReaderHostBlocked(message.targetUrl, message.settings.readerBlockedHosts)) {
    throw new Error('This page is blocked from reader mode');
  }

  const selectedProfile = await selectUserAgentProfile(message);
  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    [readerSessionKey(id)]: {
      settings: message.settings,
      targetUrl: message.targetUrl,
      selectedUserAgentProfile: selectedProfile,
    } satisfies ReaderSession,
  });

  const url = chrome.runtime.getURL(`reader.html?id=${encodeURIComponent(id)}`);
  await openInPreparedTab(message.tabId, url, message.settings, selectedProfile, true);

  return { url, selectedUserAgentProfile: selectedProfile };
};

const isRuleTabUrl = (rule: chrome.declarativeNetRequest.Rule, url: string) => {
  if (rule.condition.initiatorDomains?.includes(chrome.runtime.id)) {
    return url.startsWith(chrome.runtime.getURL('reader.html'));
  }
  const filter = rule.condition.urlFilter;
  return filter?.startsWith('|') === true && url.startsWith(filter.slice(1));
};

const cleanupTabRuleIfNeeded = async (tabId: number, changedUrl?: string) => {
  if (openingTabs.has(tabId)) {
    return;
  }
  const ruleId = sessionRuleIdForTab(tabId);
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const rule = rules.find(candidate => candidate.id === ruleId);
  if (!rule) {
    return;
  }
  const tab = await chrome.tabs.get(tabId);
  if (changedUrl && tab.url && tab.url !== changedUrl) {
    return;
  }
  if (!tab.url || !isRuleTabUrl(rule, tab.url)) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url === undefined && changeInfo.status !== 'complete') {
    return;
  }
  void cleanupTabRuleIfNeeded(tabId, changeInfo.url).catch(() => {});
});

chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [sessionRuleIdForTab(tabId)],
  }).catch(() => {});
});

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
