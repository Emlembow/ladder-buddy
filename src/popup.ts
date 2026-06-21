import { defaultSettings, getOriginPattern, needsLadderHostPermission, type AuthMode, type LadderSettings } from './ladder';
import {
  OPEN_READER_WITH_LADDER,
  OPEN_WITH_LADDER,
  type OpenReaderWithLadderMessage,
  type OpenWithLadderMessage,
  type OpenWithLadderResponse,
} from './messages';
import { userAgentProfiles, type UserAgentMode } from './user-agents';

const settingsKey = 'settings';
const form = document.getElementById('settings-form') as HTMLFormElement;
const openButton = document.getElementById('open-button') as HTMLButtonElement;
const readerButton = document.getElementById('reader-button') as HTMLButtonElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLDetailsElement;
const settingsSummary = document.getElementById('settings-summary') as HTMLSpanElement;
const authMode = document.getElementById('auth-mode') as HTMLSelectElement;
const userAgentMode = document.getElementById('user-agent-mode') as HTMLSelectElement;
const basicFields = document.getElementById('basic-fields') as HTMLFieldSetElement;
const cloudflareFields = document.getElementById('cloudflare-fields') as HTMLFieldSetElement;
const customUserAgentFields = document.getElementById('custom-user-agent-fields') as HTMLFieldSetElement;

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const textarea = (id: string) => document.getElementById(id) as HTMLTextAreaElement;

const setStatus = (message = '', kind = '') => {
  status.textContent = message;
  status.dataset.kind = kind;
};

const setActionsDisabled = (isDisabled: boolean) => {
  openButton.disabled = isDisabled;
  readerButton.disabled = isDisabled;
};

const setAuthFields = () => {
  basicFields.hidden = authMode.value !== 'basic';
  cloudflareFields.hidden = authMode.value !== 'cloudflareAccess';
};

const setUserAgentFields = () => {
  customUserAgentFields.hidden = userAgentMode.value !== 'custom';
};

const renderUserAgentOptions = () => {
  userAgentMode.replaceChildren(
    new Option('Auto try profiles', 'auto'),
    new Option('Server default', 'server'),
    new Option('Custom string', 'custom'),
  );

  const categories = new Map<string, HTMLOptGroupElement>();
  for (const profile of userAgentProfiles) {
    const group = categories.get(profile.category) ?? document.createElement('optgroup');
    group.label = profile.category;
    categories.set(profile.category, group);
    group.append(new Option(profile.label, profile.id));
  }

  userAgentMode.append(...categories.values());
};

const readSettings = (): LadderSettings => ({
  baseUrl: input('base-url').value,
  authMode: authMode.value as AuthMode,
  basicUsername: input('basic-username').value,
  basicPassword: input('basic-password').value,
  cloudflareClientId: input('cloudflare-client-id').value,
  cloudflareClientSecret: input('cloudflare-client-secret').value,
  userAgentMode: userAgentMode.value as UserAgentMode,
  customUserAgent: input('custom-user-agent').value,
  readerBlockedHosts: textarea('reader-blocked-hosts').value,
});

const updateSettingsSummary = (settings: LadderSettings) => {
  try {
    settingsSummary.textContent = new URL(settings.baseUrl).host;
  } catch {
    settingsSummary.textContent = 'Needs URL';
  }
};

const applySettings = (settings: LadderSettings) => {
  input('base-url').value = settings.baseUrl;
  authMode.value = settings.authMode;
  input('basic-username').value = settings.basicUsername;
  input('basic-password').value = settings.basicPassword;
  input('cloudflare-client-id').value = settings.cloudflareClientId;
  input('cloudflare-client-secret').value = settings.cloudflareClientSecret;
  userAgentMode.value = settings.userAgentMode;
  input('custom-user-agent').value = settings.customUserAgent;
  textarea('reader-blocked-hosts').value = settings.readerBlockedHosts;
  setAuthFields();
  setUserAgentFields();
  updateSettingsSummary(settings);
};

const loadSettings = async () => {
  applySettings(defaultSettings);
  const stored = (await chrome.storage.local.get(settingsKey)) as { settings?: Partial<LadderSettings> };
  const settings = { ...defaultSettings, ...stored.settings };
  applySettings(settings);
  settingsPanel.open = stored.settings === undefined;
  setActionsDisabled(false);
};

const validateSettings = (settings: LadderSettings) => {
  if (settings.authMode === 'basic' && (!settings.basicUsername || !settings.basicPassword)) {
    throw new Error('Enter Basic auth credentials');
  }
  if (settings.authMode === 'cloudflareAccess' && (!settings.cloudflareClientId || !settings.cloudflareClientSecret)) {
    throw new Error('Enter Cloudflare Access credentials');
  }
  if (settings.userAgentMode === 'custom' && !settings.customUserAgent.trim()) {
    throw new Error('Enter a custom user agent');
  }
};

const requestLadderPermission = async (settings: LadderSettings, isReaderMode: boolean) => {
  if (!isReaderMode && !needsLadderHostPermission(settings)) {
    return;
  }
  const origins = [getOriginPattern(settings.baseUrl)];
  if (await chrome.permissions.contains({ origins })) {
    return;
  }
  if (!(await chrome.permissions.request({ origins }))) {
    throw new Error('Ladder host permission was denied');
  }
};

const saveSettings = async () => {
  const settings = readSettings();
  validateSettings(settings);
  await chrome.storage.local.set({ [settingsKey]: settings });
  updateSettingsSummary(settings);
  return settings;
};

const openCurrentPage = (isReaderMode: boolean) => {
  setActionsDisabled(true);
  saveButton.disabled = true;
  setStatus(isReaderMode ? 'Opening reader...' : 'Opening proxy...');

  void (async () => {
    const settings = await saveSettings();
    await requestLadderPermission(settings, isReaderMode);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url) {
      throw new Error('No active tab URL found');
    }

    const response = (await chrome.runtime.sendMessage({
      type: isReaderMode ? OPEN_READER_WITH_LADDER : OPEN_WITH_LADDER,
      settings,
      targetUrl: tab.url,
      tabId: tab.id,
    } satisfies OpenReaderWithLadderMessage | OpenWithLadderMessage)) as OpenWithLadderResponse;

    if ('error' in response) {
      throw new Error(response.error);
    }
    window.close();
  })().catch(error => {
    settingsPanel.open = true;
    setStatus(error instanceof Error ? error.message : String(error), 'error');
    setActionsDisabled(false);
    saveButton.disabled = false;
  });
};

renderUserAgentOptions();
applySettings(defaultSettings);
authMode.addEventListener('change', setAuthFields);
userAgentMode.addEventListener('change', setUserAgentFields);
readerButton.addEventListener('click', () => openCurrentPage(true));
openButton.addEventListener('click', () => openCurrentPage(false));
form.addEventListener('submit', event => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus('Saving settings...');

  void (async () => {
    await saveSettings();
    settingsPanel.open = false;
    setStatus('Settings saved');
  })().catch(error => {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }).finally(() => {
    saveButton.disabled = false;
  });
});

void loadSettings();
