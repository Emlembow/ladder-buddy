import {
  defaultSettings,
  getOriginPattern,
  needsLadderHostPermission,
  normalizeBaseUrl,
  type AuthMode,
  type LadderSettings,
} from './ladder';
import {
  OPEN_READER_WITH_LADDER,
  OPEN_WITH_LADDER,
  type OpenReaderWithLadderMessage,
  type OpenWithLadderMessage,
  type OpenWithLadderResponse,
} from './messages';
import { getLocalConnection, LocalConnectionError } from './native';
import { userAgentProfiles, type UserAgentMode } from './user-agents';

type ConnectionMode = 'local' | 'custom';

type SavedSettings = {
  connectionMode: ConnectionMode;
  userAgentMode: UserAgentMode;
  customUserAgent: string;
  readerBlockedHosts: string;
  customBaseUrl: string;
  customAuthMode: AuthMode;
  customBasicUsername: string;
  customBasicPassword: string;
  customCloudflareClientId: string;
  customCloudflareClientSecret: string;
};

const settingsKey = 'settings';
const defaultSavedSettings: SavedSettings = {
  connectionMode: 'local',
  userAgentMode: 'auto',
  customUserAgent: '',
  readerBlockedHosts: '',
  customBaseUrl: 'http://127.0.0.1:8080',
  customAuthMode: 'none',
  customBasicUsername: '',
  customBasicPassword: '',
  customCloudflareClientId: '',
  customCloudflareClientSecret: '',
};

const form = document.getElementById('settings-form') as HTMLFormElement;
const openButton = document.getElementById('open-button') as HTMLButtonElement;
const readerButton = document.getElementById('reader-button') as HTMLButtonElement;
const retryButton = document.getElementById('retry-button') as HTMLButtonElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLDetailsElement;
const settingsSummary = document.getElementById('settings-summary') as HTMLSpanElement;
const connectionMode = document.getElementById('connection-mode') as HTMLSelectElement;
const customConnectionFields = document.getElementById('custom-connection-fields') as HTMLFieldSetElement;
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

const setConnectionFields = () => {
  customConnectionFields.hidden = connectionMode.value !== 'custom';
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

const readSavedSettings = (): SavedSettings => ({
  connectionMode: connectionMode.value as ConnectionMode,
  userAgentMode: userAgentMode.value as UserAgentMode,
  customUserAgent: input('custom-user-agent').value,
  readerBlockedHosts: textarea('reader-blocked-hosts').value,
  customBaseUrl: input('base-url').value,
  customAuthMode: authMode.value as AuthMode,
  customBasicUsername: input('basic-username').value,
  customBasicPassword: input('basic-password').value,
  customCloudflareClientId: input('cloudflare-client-id').value,
  customCloudflareClientSecret: input('cloudflare-client-secret').value,
});

const updateSettingsSummary = (settings: SavedSettings) => {
  if (settings.connectionMode === 'local') {
    settingsSummary.textContent = 'This Mac';
    return;
  }
  try {
    settingsSummary.textContent = new URL(settings.customBaseUrl).host;
  } catch {
    settingsSummary.textContent = 'Custom server';
  }
};

const applySettings = (settings: SavedSettings) => {
  connectionMode.value = settings.connectionMode;
  userAgentMode.value = settings.userAgentMode;
  input('custom-user-agent').value = settings.customUserAgent;
  textarea('reader-blocked-hosts').value = settings.readerBlockedHosts;
  input('base-url').value = settings.customBaseUrl;
  authMode.value = settings.customAuthMode;
  input('basic-username').value = settings.customBasicUsername;
  input('basic-password').value = settings.customBasicPassword;
  input('cloudflare-client-id').value = settings.customCloudflareClientId;
  input('cloudflare-client-secret').value = settings.customCloudflareClientSecret;
  setConnectionFields();
  setAuthFields();
  setUserAgentFields();
  updateSettingsSummary(settings);
};

const migrateSettings = (stored: Partial<SavedSettings> | Partial<LadderSettings> | undefined): SavedSettings => {
  if (!stored) {
    return defaultSavedSettings;
  }
  if ('connectionMode' in stored) {
    return { ...defaultSavedSettings, ...stored } as SavedSettings;
  }

  // Keep an existing manually configured connection when this extension is updated.
  const legacy = stored as Partial<LadderSettings>;
  return {
    ...defaultSavedSettings,
    connectionMode: 'custom',
    userAgentMode: legacy.userAgentMode ?? defaultSavedSettings.userAgentMode,
    customUserAgent: legacy.customUserAgent ?? '',
    readerBlockedHosts: legacy.readerBlockedHosts ?? '',
    customBaseUrl: legacy.baseUrl ?? defaultSavedSettings.customBaseUrl,
    customAuthMode: legacy.authMode ?? 'none',
    customBasicUsername: legacy.basicUsername ?? '',
    customBasicPassword: legacy.basicPassword ?? '',
    customCloudflareClientId: legacy.cloudflareClientId ?? '',
    customCloudflareClientSecret: legacy.cloudflareClientSecret ?? '',
  };
};

const getConnectionErrorText = (error: LocalConnectionError) => {
  if (error.kind === 'incompatible') {
    return `${error.message} Update Ladder Buddy with the latest Mac installer, then click Retry connection.`;
  }
  if (error.kind === 'missing') {
    return `${error.message} Run the Mac installer, then click Retry connection.`;
  }
  return `${error.message} Run the Mac installer again if the problem continues, then click Retry connection.`;
};

let connectionCheck = 0;
const checkConnection = async () => {
  const currentCheck = ++connectionCheck;
  const settings = readSavedSettings();
  retryButton.hidden = true;
  if (settings.connectionMode === 'custom') {
    setActionsDisabled(false);
    setStatus('Custom Ladder server selected');
    return;
  }

  setActionsDisabled(true);
  setStatus('Connecting to Ladder Buddy on this Mac...');
  try {
    await getLocalConnection();
    if (currentCheck !== connectionCheck) {
      return;
    }
    setStatus('Connected to Ladder Buddy on this Mac');
    setActionsDisabled(false);
  } catch (error) {
    if (currentCheck !== connectionCheck) {
      return;
    }
    setStatus(error instanceof LocalConnectionError ? getConnectionErrorText(error) : String(error), 'error');
    retryButton.hidden = false;
  }
};

const loadSettings = async () => {
  applySettings(defaultSavedSettings);
  const stored = (await chrome.storage.local.get(settingsKey)) as {
    settings?: Partial<SavedSettings> | Partial<LadderSettings>;
  };
  applySettings(migrateSettings(stored.settings));
  await checkConnection();
};

const validateSettings = (settings: SavedSettings) => {
  if (settings.userAgentMode === 'custom' && !settings.customUserAgent.trim()) {
    throw new Error('Enter a custom user agent');
  }
  if (settings.connectionMode !== 'custom') {
    return;
  }
  normalizeBaseUrl(settings.customBaseUrl);
  if (settings.customAuthMode === 'basic' && (!settings.customBasicUsername || !settings.customBasicPassword)) {
    throw new Error('Enter Basic auth credentials');
  }
  if (
    settings.customAuthMode === 'cloudflareAccess' &&
    (!settings.customCloudflareClientId || !settings.customCloudflareClientSecret)
  ) {
    throw new Error('Enter Cloudflare Access credentials');
  }
};

const resolveLadderSettings = async (settings: SavedSettings): Promise<LadderSettings> => {
  const preferences = {
    userAgentMode: settings.userAgentMode,
    customUserAgent: settings.customUserAgent,
    readerBlockedHosts: settings.readerBlockedHosts,
  };
  if (settings.connectionMode === 'local') {
    const connection = await getLocalConnection();
    return {
      ...defaultSettings,
      ...preferences,
      baseUrl: connection.baseUrl,
      authMode: 'basic',
      basicUsername: connection.username,
      basicPassword: connection.password,
    };
  }
  return {
    ...defaultSettings,
    ...preferences,
    baseUrl: normalizeBaseUrl(settings.customBaseUrl),
    authMode: settings.customAuthMode,
    basicUsername: settings.customBasicUsername,
    basicPassword: settings.customBasicPassword,
    cloudflareClientId: settings.customCloudflareClientId,
    cloudflareClientSecret: settings.customCloudflareClientSecret,
  };
};

const requestLadderPermission = async (
  settings: LadderSettings,
  connection: ConnectionMode,
  isReaderMode: boolean,
) => {
  // The manifest includes host permission for the local helper's loopback address.
  if (connection === 'local' || (!isReaderMode && !needsLadderHostPermission(settings))) {
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
  const settings = readSavedSettings();
  validateSettings(settings);
  await chrome.storage.local.set({ [settingsKey]: settings });
  updateSettingsSummary(settings);
  return settings;
};

const openCurrentPage = (isReaderMode: boolean) => {
  setActionsDisabled(true);
  saveButton.disabled = true;
  retryButton.hidden = true;
  setStatus(isReaderMode ? 'Opening reader...' : 'Opening proxy...');

  void (async () => {
    const preferences = await saveSettings();
    const settings = await resolveLadderSettings(preferences);
    await requestLadderPermission(settings, preferences.connectionMode, isReaderMode);

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
    if (error instanceof LocalConnectionError) {
      setStatus(getConnectionErrorText(error), 'error');
      retryButton.hidden = false;
    } else {
      settingsPanel.open = true;
      setStatus(error instanceof Error ? error.message : String(error), 'error');
      setActionsDisabled(false);
    }
    saveButton.disabled = false;
  });
};

renderUserAgentOptions();
applySettings(defaultSavedSettings);
connectionMode.addEventListener('change', () => {
  setConnectionFields();
  updateSettingsSummary(readSavedSettings());
  void checkConnection();
});
authMode.addEventListener('change', setAuthFields);
userAgentMode.addEventListener('change', setUserAgentFields);
retryButton.addEventListener('click', () => void checkConnection());
readerButton.addEventListener('click', () => openCurrentPage(true));
openButton.addEventListener('click', () => openCurrentPage(false));
form.addEventListener('submit', event => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus('Saving settings...');

  void (async () => {
    await saveSettings();
    settingsPanel.open = false;
    await checkConnection();
  })().catch(error => {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }).finally(() => {
    saveButton.disabled = false;
  });
});

void loadSettings().catch(error => {
  setStatus(error instanceof Error ? error.message : String(error), 'error');
  settingsPanel.open = true;
});
