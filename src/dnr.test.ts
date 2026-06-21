import { describe, expect, it } from 'vitest';
import { REQUEST_HEADERS_RULE_ID, buildRequestHeadersRule } from './dnr';
import { defaultSettings } from './ladder';
import { USER_AGENT_PROFILE_HEADER } from './user-agents';

describe('buildRequestHeadersRule', () => {
  it('skips dynamic rules when auth is off', () => {
    expect(buildRequestHeadersRule({ ...defaultSettings, userAgentMode: 'server' })).toBeUndefined();
  });

  it('scopes auth headers to the configured Ladder origin', () => {
    expect(
      buildRequestHeadersRule({
        ...defaultSettings,
        baseUrl: 'https://ladder.example.com/proxy',
        authMode: 'cloudflareAccess',
        cloudflareClientId: 'client.access',
        cloudflareClientSecret: 'secret',
        userAgentMode: 'server',
      }),
    ).toMatchObject({
      id: REQUEST_HEADERS_RULE_ID,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'CF-Access-Client-Id', operation: 'set', value: 'client.access' },
          { header: 'CF-Access-Client-Secret', operation: 'set', value: 'secret' },
        ],
      },
      condition: {
        urlFilter: '|https://ladder.example.com/',
      },
    });
  });

  it('adds the selected upstream user agent profile header', () => {
    expect(
      buildRequestHeadersRule({
        ...defaultSettings,
        userAgentMode: 'googlebot-desktop',
      }),
    ).toMatchObject({
      id: REQUEST_HEADERS_RULE_ID,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: USER_AGENT_PROFILE_HEADER, operation: 'set', value: 'googlebot-desktop' }],
      },
    });
  });
});
