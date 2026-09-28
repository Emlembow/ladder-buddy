import { describe, expect, it } from 'vitest';
import { buildRequestHeadersRule, sessionRuleIdForTab } from './dnr';
import { defaultSettings } from './ladder';
import { USER_AGENT_PROFILE_HEADER } from './user-agents';

describe('buildRequestHeadersRule', () => {
  it('skips dynamic rules when auth is off', () => {
    expect(buildRequestHeadersRule({ ...defaultSettings, userAgentMode: 'server' }, { tabId: 7 })).toBeUndefined();
  });

  it('scopes auth headers to the configured Ladder origin', () => {
    expect(
      buildRequestHeadersRule(
        {
          ...defaultSettings,
          baseUrl: 'https://ladder.example.com/proxy',
          authMode: 'cloudflareAccess',
          cloudflareClientId: 'client.access',
          cloudflareClientSecret: 'secret',
          userAgentMode: 'server',
        },
        { tabId: 7 },
      ),
    ).toMatchObject({
      id: sessionRuleIdForTab(7),
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'CF-Access-Client-Id', operation: 'set', value: 'client.access' },
          { header: 'CF-Access-Client-Secret', operation: 'set', value: 'secret' },
        ],
      },
      condition: {
        urlFilter: '|https://ladder.example.com/',
        tabIds: [7],
      },
    });
  });

  it('adds the selected upstream user agent profile header', () => {
    expect(
      buildRequestHeadersRule(
        {
          ...defaultSettings,
          userAgentMode: 'googlebot-desktop',
        },
        { tabId: 7, initiatorDomain: 'pgfogjceniomjagflcagnnckcpmlanpf' },
      ),
    ).toMatchObject({
      id: sessionRuleIdForTab(7),
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: USER_AGENT_PROFILE_HEADER, operation: 'set', value: 'googlebot-desktop' }],
      },
      condition: {
        tabIds: [7],
        initiatorDomains: ['pgfogjceniomjagflcagnnckcpmlanpf'],
      },
    });
  });

  it('limits local Basic credentials to the live listener port and one tab', () => {
    expect(
      buildRequestHeadersRule(
        {
          ...defaultSettings,
          baseUrl: 'http://127.0.0.1:49152',
          authMode: 'basic',
          basicUsername: 'private',
          basicPassword: 'secret',
          userAgentMode: 'server',
        },
        { tabId: 18 },
      ),
    ).toMatchObject({
      id: sessionRuleIdForTab(18),
      condition: {
        urlFilter: '|http://127.0.0.1:49152/',
        tabIds: [18],
      },
    });
  });
});
