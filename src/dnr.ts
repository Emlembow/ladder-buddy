import { getAuthHeaders, getOriginPattern, getUserAgentHeaders, type LadderSettings } from './ladder';
import type { UserAgentProfileId } from './user-agents';

export const AUTH_RULE_ID = 1;
export const REQUEST_HEADERS_RULE_ID = AUTH_RULE_ID;

const resourceTypes: `${chrome.declarativeNetRequest.ResourceType}`[] = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
];

export const buildRequestHeadersRule = (
  settings: LadderSettings,
  selectedProfile?: UserAgentProfileId,
): chrome.declarativeNetRequest.Rule | undefined => {
  const requestHeaders = [...getAuthHeaders(settings), ...getUserAgentHeaders(settings, selectedProfile)]
    .filter(({ value }) => value.trim() !== '')
    .map(({ header, value }) => ({ header, operation: 'set' as const, value }));

  if (requestHeaders.length === 0) {
    return undefined;
  }

  return {
    id: REQUEST_HEADERS_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders,
    },
    condition: {
      urlFilter: `|${getOriginPattern(settings.baseUrl).slice(0, -1)}`,
      resourceTypes,
    },
  };
};

export const buildAuthRule = buildRequestHeadersRule;
