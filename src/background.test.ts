import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_READER_WITH_LADDER, OPEN_WITH_LADDER, type OpenReaderWithLadderMessage, type OpenWithLadderMessage } from './messages';
import { defaultSettings } from './ladder';

type Listener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

describe('background message listener', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'chrome');
    vi.unstubAllGlobals();
  });

  it('opens the current tab through Ladder and syncs auth headers', async () => {
    let listener: Listener | undefined;
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue({});
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        declarativeNetRequest: { updateDynamicRules },
        runtime: {
          onMessage: {
            addListener: vi.fn((nextListener: Listener) => {
              listener = nextListener;
            }),
          },
        },
        tabs: { update },
      },
    });
    await import('./background');

    const message: OpenWithLadderMessage = {
      type: OPEN_WITH_LADDER,
      settings: {
        ...defaultSettings,
        authMode: 'basic',
        basicUsername: 'admin',
        basicPassword: 'pw',
        userAgentMode: 'server',
      },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    };
    const sendResponse = vi.fn();

    expect(listener?.(message, {}, sendResponse)).toBe(true);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ url: 'http://127.0.0.1:8080/https://example.com/story' }),
    );
    expect(update).toHaveBeenCalledWith(7, {
      url: 'http://127.0.0.1:8080/https://example.com/story',
    });
    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [1],
      addRules: [
        expect.objectContaining({
          condition: expect.objectContaining({ urlFilter: '|http://127.0.0.1:8080/' }),
        }),
      ],
    });
  });

  it('auto-selects the first upstream user agent profile that returns a usable page', async () => {
    let listener: Listener | undefined;
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue({});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          body: 'Error 54113 Varnish cache server',
          response: { status: 403 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          body: '<!doctype html><title>Article</title>',
          response: { status: 200 },
        }),
      });

    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        declarativeNetRequest: { updateDynamicRules },
        runtime: {
          onMessage: {
            addListener: vi.fn((nextListener: Listener) => {
              listener = nextListener;
            }),
          },
        },
        tabs: { update },
      },
    });
    await import('./background');

    const message: OpenWithLadderMessage = {
      type: OPEN_WITH_LADDER,
      settings: {
        ...defaultSettings,
        userAgentMode: 'auto',
      },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    };
    const sendResponse = vi.fn();

    expect(listener?.(message, {}, sendResponse)).toBe(true);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        url: 'http://127.0.0.1:8080/https://example.com/story',
        selectedUserAgentProfile: 'googlebot-desktop',
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [1],
      addRules: [
        expect.objectContaining({
          action: expect.objectContaining({
            requestHeaders: [{ header: 'X-Ladder-User-Agent-Profile', operation: 'set', value: 'googlebot-desktop' }],
          }),
        }),
      ],
    });
    expect(update).toHaveBeenCalledWith(7, {
      url: 'http://127.0.0.1:8080/https://example.com/story',
    });
  });

  it('opens a reader session unless the target host is blocked', async () => {
    let listener: Listener | undefined;
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue({});
    const sessionSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('crypto', { randomUUID: () => 'reader-id' });
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        declarativeNetRequest: { updateDynamicRules },
        runtime: {
          getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
          onMessage: {
            addListener: vi.fn((nextListener: Listener) => {
              listener = nextListener;
            }),
          },
        },
        storage: {
          session: { set: sessionSet },
        },
        tabs: { update },
      },
    });
    await import('./background');

    const message: OpenReaderWithLadderMessage = {
      type: OPEN_READER_WITH_LADDER,
      settings: {
        ...defaultSettings,
        readerBlockedHosts: 'blocked.example',
        userAgentMode: 'server',
      },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    };
    const sendResponse = vi.fn();

    expect(listener?.(message, {}, sendResponse)).toBe(true);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ url: 'chrome-extension://test/reader.html?id=reader-id' }),
    );
    expect(sessionSet).toHaveBeenCalledWith({
      'reader:reader-id': {
        settings: message.settings,
        targetUrl: 'https://example.com/story',
        selectedUserAgentProfile: undefined,
      },
    });
    expect(update).toHaveBeenCalledWith(7, {
      url: 'chrome-extension://test/reader.html?id=reader-id',
    });
  });

  it('does not open reader mode for blocklisted hosts', async () => {
    let listener: Listener | undefined;
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        declarativeNetRequest: { updateDynamicRules: vi.fn().mockResolvedValue(undefined) },
        runtime: {
          onMessage: {
            addListener: vi.fn((nextListener: Listener) => {
              listener = nextListener;
            }),
          },
        },
        storage: {
          session: { set: vi.fn().mockResolvedValue(undefined) },
        },
        tabs: { update: vi.fn().mockResolvedValue({}) },
      },
    });
    await import('./background');

    const message: OpenReaderWithLadderMessage = {
      type: OPEN_READER_WITH_LADDER,
      settings: {
        ...defaultSettings,
        readerBlockedHosts: '*.example.com',
        userAgentMode: 'server',
      },
      targetUrl: 'https://news.example.com/story',
      tabId: 7,
    };
    const sendResponse = vi.fn();

    expect(listener?.(message, {}, sendResponse)).toBe(true);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ error: 'This page is blocked from reader mode' }),
    );
  });
});
