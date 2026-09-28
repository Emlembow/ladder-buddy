import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalConnection,
  LocalConnectionError,
  NATIVE_HOST,
  NATIVE_PROTOCOL_VERSION,
  parseLocalConnection,
} from './native';

const connection = {
  protocolVersion: 1,
  baseUrl: 'http://127.0.0.1:48123',
  username: 'ladderbuddy',
  password: 'unique-secret',
  version: '0.2.0',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('native helper connection', () => {
  it('requests the live local connection from the registered host', async () => {
    const sendNativeMessage = vi.fn().mockResolvedValue(connection);
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage } });

    await expect(getLocalConnection()).resolves.toEqual({
      baseUrl: 'http://127.0.0.1:48123',
      username: 'ladderbuddy',
      password: 'unique-secret',
      version: '0.2.0',
    });
    expect(sendNativeMessage).toHaveBeenCalledWith(NATIVE_HOST, {
      type: 'getConnection',
      protocolVersion: NATIVE_PROTOCOL_VERSION,
    });
  });

  it('gives useful guidance when the native host is missing', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendNativeMessage: vi.fn().mockRejectedValue(new Error('Specified native messaging host not found.')),
      },
    });

    await expect(getLocalConnection()).rejects.toMatchObject({
      kind: 'missing',
      message: expect.stringContaining('helper is missing'),
    });
  });

  it('rejects incompatible helper protocols and malformed credentials', () => {
    expect(() => parseLocalConnection({ ...connection, protocolVersion: 2 })).toThrow(LocalConnectionError);
    expect(() => parseLocalConnection({ ...connection, password: '' })).toThrow('incomplete connection details');
  });

  it('never accepts a nonlocal or ambiguous proxy address', () => {
    for (const baseUrl of [
      'https://127.0.0.1:48123',
      'http://localhost:48123',
      'http://10.0.0.1:48123',
      'http://127.0.0.1',
      'http://127.0.0.1:48123/path',
      'http://127.0.0.1:48123/?token=abc',
    ]) {
      expect(() => parseLocalConnection({ ...connection, baseUrl }), baseUrl).toThrow(LocalConnectionError);
    }
  });

  it('passes through a helper failure without treating it as valid credentials', () => {
    expect(() =>
      parseLocalConnection({ protocolVersion: 1, error: { code: 'LADDER_DOWN', message: 'Ladder did not start' } }),
    ).toThrow('Ladder did not start');
  });
});
