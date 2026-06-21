import { describe, expect, it } from 'vitest';
import {
  buildProxyUrl,
  defaultSettings,
  getAuthHeaders,
  getOriginPattern,
  getUserAgentHeaders,
  isReaderHostBlocked,
  needsLadderHostPermission,
  normalizeBaseUrl,
  parseReaderBlockedHosts,
  type LadderSettings,
} from './ladder';
import { USER_AGENT_HEADER, USER_AGENT_PROFILE_HEADER } from './user-agents';

const settings = (overrides: Partial<LadderSettings>): LadderSettings => ({
  ...defaultSettings,
  ...overrides,
});

describe('ladder helpers', () => {
  it('normalizes local and subpath Ladder URLs', () => {
    expect(normalizeBaseUrl(' http://127.0.0.1:8080/ ')).toBe('http://127.0.0.1:8080');
    expect(normalizeBaseUrl('https://ladder.example.com/proxy/')).toBe('https://ladder.example.com/proxy');
  });

  it('builds the URL shape Ladder expects', () => {
    expect(buildProxyUrl('http://127.0.0.1:8080/', 'https://example.com/story?a=1')).toBe(
      'http://127.0.0.1:8080/https://example.com/story?a=1',
    );
  });

  it('rejects unsupported target schemes', () => {
    expect(() => buildProxyUrl('http://127.0.0.1:8080', 'chrome://extensions')).toThrow('Only http://');
  });

  it('returns the exact origin pattern needed for runtime permission', () => {
    expect(getOriginPattern('https://ladder.example.com/proxy')).toBe('https://ladder.example.com/*');
  });

  it('builds basic and Cloudflare Access auth headers', () => {
    expect(getAuthHeaders(settings({ authMode: 'basic', basicUsername: 'admin', basicPassword: 'pw' }))).toEqual([
      { header: 'Authorization', value: 'Basic YWRtaW46cHc=' },
    ]);
    expect(
      getAuthHeaders(
        settings({
          authMode: 'cloudflareAccess',
          cloudflareClientId: 'client.access',
          cloudflareClientSecret: 'secret',
        }),
      ),
    ).toEqual([
      { header: 'CF-Access-Client-Id', value: 'client.access' },
      { header: 'CF-Access-Client-Secret', value: 'secret' },
    ]);
  });

  it('builds upstream user agent headers for profile and custom modes', () => {
    expect(getUserAgentHeaders(settings({ userAgentMode: 'bingbot-desktop' }))).toEqual([
      { header: USER_AGENT_PROFILE_HEADER, value: 'bingbot-desktop' },
    ]);
    expect(getUserAgentHeaders(settings({ userAgentMode: 'custom', customUserAgent: 'CustomBot/1.0' }))).toEqual([
      { header: USER_AGENT_HEADER, value: 'CustomBot/1.0' },
    ]);
    expect(getUserAgentHeaders(settings({ userAgentMode: 'server' }))).toEqual([]);
  });

  it('requires Ladder host permission for auth or request user agent controls', () => {
    expect(needsLadderHostPermission(settings({ userAgentMode: 'server', authMode: 'none' }))).toBe(false);
    expect(needsLadderHostPermission(settings({ userAgentMode: 'auto', authMode: 'none' }))).toBe(true);
    expect(needsLadderHostPermission(settings({ userAgentMode: 'server', authMode: 'basic' }))).toBe(true);
  });

  it('parses reader blocked hosts from hostnames, URLs, and wildcards', () => {
    expect(parseReaderBlockedHosts(' Example.com, https://News.Example.org/path\n*.internal.test:8443 ')).toEqual([
      'example.com',
      'news.example.org',
      '*.internal.test',
    ]);
  });

  it('blocks reader hosts by exact hostname or wildcard suffix', () => {
    expect(isReaderHostBlocked('https://example.com/story', 'example.com')).toBe(true);
    expect(isReaderHostBlocked('https://www.example.com/story', 'example.com')).toBe(false);
    expect(isReaderHostBlocked('https://news.example.com/story', '*.example.com')).toBe(true);
    expect(isReaderHostBlocked('https://example.com/story', '*.example.com')).toBe(true);
    expect(isReaderHostBlocked('https://example.net/story', '*.example.com')).toBe(false);
  });
});
