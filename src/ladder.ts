import {
  USER_AGENT_HEADER,
  USER_AGENT_PROFILE_HEADER,
  isProfileBackedMode,
  type UserAgentMode,
  type UserAgentProfileId,
} from './user-agents';

export type AuthMode = 'none' | 'basic' | 'cloudflareAccess';

export type LadderSettings = {
  baseUrl: string;
  authMode: AuthMode;
  basicUsername: string;
  basicPassword: string;
  cloudflareClientId: string;
  cloudflareClientSecret: string;
  userAgentMode: UserAgentMode;
  customUserAgent: string;
  readerBlockedHosts: string;
};

export type AuthHeader = {
  header: string;
  value: string;
};

export const defaultSettings: LadderSettings = {
  baseUrl: 'http://127.0.0.1:8080',
  authMode: 'none',
  basicUsername: '',
  basicPassword: '',
  cloudflareClientId: '',
  cloudflareClientSecret: '',
  userAgentMode: 'auto',
  customUserAgent: '',
  readerBlockedHosts: '',
};

export const normalizeBaseUrl = (value: string) => {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Ladder URL must start with http:// or https://');
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
};

export const buildProxyUrl = (baseUrl: string, targetUrl: string) => {
  const target = new URL(targetUrl);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Only http:// and https:// pages can be opened through Ladder');
  }
  return `${normalizeBaseUrl(baseUrl)}/${target.href}`;
};

export const getOriginPattern = (baseUrl: string) => `${new URL(normalizeBaseUrl(baseUrl)).origin}/*`;

export const getAuthHeaders = (settings: LadderSettings): AuthHeader[] => {
  if (settings.authMode === 'none') {
    return [];
  }
  if (settings.authMode === 'basic') {
    return [
      {
        header: 'Authorization',
        value: `Basic ${btoa(`${settings.basicUsername}:${settings.basicPassword}`)}`,
      },
    ];
  }
  return [
    { header: 'CF-Access-Client-Id', value: settings.cloudflareClientId },
    { header: 'CF-Access-Client-Secret', value: settings.cloudflareClientSecret },
  ];
};

export const buildApiUrl = (baseUrl: string) => `${normalizeBaseUrl(baseUrl)}/api`;

export const getUserAgentHeaders = (
  settings: LadderSettings,
  selectedProfile?: UserAgentProfileId,
): AuthHeader[] => {
  const profile = selectedProfile ?? (isProfileBackedMode(settings.userAgentMode) ? settings.userAgentMode : undefined);
  if (profile) {
    return [{ header: USER_AGENT_PROFILE_HEADER, value: profile }];
  }
  if (settings.userAgentMode === 'custom') {
    return [{ header: USER_AGENT_HEADER, value: settings.customUserAgent }];
  }
  return [];
};

export const needsLadderHostPermission = (settings: LadderSettings) =>
  getAuthHeaders(settings).length > 0 || settings.userAgentMode !== 'server';

export const parseReaderBlockedHosts = (value: string) =>
  value
    .split(/[\s,]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
    .map(entry => {
      try {
        return new URL(entry).hostname.toLowerCase();
      } catch {
        return entry.replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').toLowerCase();
      }
    })
    .filter(Boolean);

export const isReaderHostBlocked = (targetUrl: string, blockedHosts: string) => {
  const host = new URL(targetUrl).hostname.toLowerCase();
  return parseReaderBlockedHosts(blockedHosts).some(pattern => {
    if (pattern === host) {
      return true;
    }
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return false;
  });
};
