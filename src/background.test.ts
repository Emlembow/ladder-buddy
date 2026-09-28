import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_READER_WITH_LADDER,
  OPEN_WITH_LADDER,
  type OpenReaderWithLadderMessage,
  type OpenWithLadderMessage,
} from './messages';
import { defaultSettings } from './ladder';

type MessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
type UpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];
type RemovedListener = Parameters<typeof chrome.tabs.onRemoved.addListener>[0];

const extensionId = 'pgfogjceniomjagflcagnnckcpmlanpf';
const extensionUrl = (path: string) => `chrome-extension://${extensionId}/${path}`;

const setupBackground = async () => {
  let messageListener: MessageListener | undefined;
  let updatedListener: UpdatedListener | undefined;
  let removedListener: RemovedListener | undefined;
  const order: string[] = [];
  const urls = new Map<number, string>([[7, 'https://example.com/story']]);
  const rules = new Map<number, chrome.declarativeNetRequest.Rule>();
  const updateSessionRules = vi.fn(async (options: chrome.declarativeNetRequest.UpdateRuleOptions) => {
    order.push('session-rule');
    for (const id of options.removeRuleIds ?? []) {
      rules.delete(id);
    }
    for (const rule of options.addRules ?? []) {
      rules.set(rule.id, rule);
    }
  });
  const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(async (tabId: number, properties: chrome.tabs.UpdateProperties) => {
    order.push(`navigate:${properties.url}`);
    urls.set(tabId, properties.url ?? '');
    return { id: tabId, url: properties.url };
  });
  const create = vi.fn(async (properties: chrome.tabs.CreateProperties) => {
    order.push(`create:${properties.url}`);
    urls.set(8, properties.url ?? '');
    return { id: 8, url: properties.url };
  });
  const sessionSet = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => [...rules.values()]),
      updateDynamicRules,
      updateSessionRules,
    },
    runtime: {
      id: extensionId,
      getURL: vi.fn(extensionUrl),
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListener = listener;
        }),
      },
    },
    storage: { session: { set: sessionSet } },
    tabs: {
      create,
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: urls.get(tabId) })),
      update,
      onUpdated: {
        addListener: vi.fn((listener: UpdatedListener) => {
          updatedListener = listener;
        }),
      },
      onRemoved: {
        addListener: vi.fn((listener: RemovedListener) => {
          removedListener = listener;
        }),
      },
    },
  });
  await import('./background');

  if (!messageListener || !updatedListener || !removedListener) {
    throw new Error('Background listeners were not registered');
  }
  return {
    messageListener,
    updatedListener,
    removedListener,
    urls,
    rules,
    order,
    update,
    create,
    updateSessionRules,
    updateDynamicRules,
    sessionSet,
  };
};

const send = async (
  listener: MessageListener,
  message: OpenWithLadderMessage | OpenReaderWithLadderMessage,
) => {
  const sendResponse = vi.fn();
  expect(listener(message, {}, sendResponse)).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0][0] as Record<string, unknown>;
};

describe('background message listener', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('opens the current tab with a temporary tab-scoped, exact-port credential rule', async () => {
    const background = await setupBackground();
    const response = await send(background.messageListener, {
      type: OPEN_WITH_LADDER,
      settings: {
        ...defaultSettings,
        baseUrl: 'http://127.0.0.1:48123',
        authMode: 'basic',
        basicUsername: 'private',
        basicPassword: 'secret',
        userAgentMode: 'server',
      },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    });

    expect(response).toEqual({ url: 'http://127.0.0.1:48123/https://example.com/story' });
    expect(background.order).toEqual([
      'navigate:about:blank',
      'session-rule',
      'navigate:http://127.0.0.1:48123/https://example.com/story',
    ]);
    expect([...background.rules.values()][0]).toMatchObject({
      id: 8,
      condition: { urlFilter: '|http://127.0.0.1:48123/', tabIds: [7] },
      action: {
        requestHeaders: [{ header: 'Authorization', operation: 'set', value: 'Basic cHJpdmF0ZTpzZWNyZXQ=' }],
      },
    });
    expect(background.updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [1] });
  });

  it('auto-selects a usable profile and opens a new tab through a blank page', async () => {
    const background = await setupBackground();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ body: 'Error 54113 Varnish cache server', response: { status: 403 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ body: '<!doctype html><title>Article</title>', response: { status: 200 } }),
      });
    vi.stubGlobal('fetch', fetch);

    const response = await send(background.messageListener, {
      type: OPEN_WITH_LADDER,
      settings: defaultSettings,
      targetUrl: 'https://example.com/story',
    });

    expect(response).toEqual({
      url: 'http://127.0.0.1:8080/https://example.com/story',
      selectedUserAgentProfile: 'googlebot-desktop',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(background.order).toEqual([
      'create:about:blank',
      'session-rule',
      'navigate:http://127.0.0.1:8080/https://example.com/story',
    ]);
    expect([...background.rules.values()][0]?.condition.tabIds).toEqual([8]);
  });

  it('scopes reader image credentials to the extension initiator and cleans up on navigation', async () => {
    const background = await setupBackground();
    vi.stubGlobal('crypto', { randomUUID: () => 'reader-id' });
    const response = await send(background.messageListener, {
      type: OPEN_READER_WITH_LADDER,
      settings: {
        ...defaultSettings,
        authMode: 'basic',
        basicUsername: 'private',
        basicPassword: 'secret',
        userAgentMode: 'server',
      },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    });

    expect(response).toEqual({ url: extensionUrl('reader.html?id=reader-id') });
    expect(background.sessionSet).toHaveBeenCalledWith({
      'reader:reader-id': {
        settings: expect.objectContaining({ authMode: 'basic' }),
        targetUrl: 'https://example.com/story',
        selectedUserAgentProfile: undefined,
      },
    });
    expect([...background.rules.values()][0]?.condition).toMatchObject({
      tabIds: [7],
      initiatorDomains: [extensionId],
    });

    background.updatedListener(7, { url: extensionUrl('reader.html?id=reader-id') }, { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(background.rules.size).toBe(1));
    background.urls.set(7, 'https://example.org/away');
    background.updatedListener(7, { url: 'https://example.org/away' }, { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(background.rules.size).toBe(0));
  });

  it('removes proxy credentials when the tab closes', async () => {
    const background = await setupBackground();
    await send(background.messageListener, {
      type: OPEN_WITH_LADDER,
      settings: { ...defaultSettings, authMode: 'basic', basicUsername: 'u', basicPassword: 'p', userAgentMode: 'server' },
      targetUrl: 'https://example.com/story',
      tabId: 7,
    });
    expect(background.rules.size).toBe(1);
    background.removedListener(7, { isWindowClosing: false, windowId: 1 });
    await vi.waitFor(() => expect(background.rules.size).toBe(0));
  });

  it('does not open reader mode for blocklisted hosts', async () => {
    const background = await setupBackground();
    const response = await send(background.messageListener, {
      type: OPEN_READER_WITH_LADDER,
      settings: {
        ...defaultSettings,
        readerBlockedHosts: '*.example.com',
        userAgentMode: 'server',
      },
      targetUrl: 'https://news.example.com/story',
      tabId: 7,
    });

    expect(response).toEqual({ error: 'This page is blocked from reader mode' });
    expect(background.update).not.toHaveBeenCalled();
    expect(background.rules.size).toBe(0);
  });
});
