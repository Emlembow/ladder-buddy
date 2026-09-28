import { normalizeBaseUrl } from './ladder';

export const NATIVE_HOST = 'com.emlembow.ladderbuddy';
export const NATIVE_PROTOCOL_VERSION = 1;

export type LocalConnection = {
  baseUrl: string;
  username: string;
  password: string;
  version: string;
};

export class LocalConnectionError extends Error {
  constructor(
    message: string,
    readonly kind: 'missing' | 'incompatible' | 'unavailable',
  ) {
    super(message);
    this.name = 'LocalConnectionError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseLocalConnection = (response: unknown): LocalConnection => {
  if (!isRecord(response)) {
    throw new LocalConnectionError('The Ladder Buddy helper returned an invalid response.', 'incompatible');
  }
  if (response.protocolVersion !== NATIVE_PROTOCOL_VERSION) {
    throw new LocalConnectionError('The Ladder Buddy helper uses an incompatible protocol.', 'incompatible');
  }
  if (isRecord(response.error)) {
    const message = typeof response.error.message === 'string' ? response.error.message.trim() : '';
    throw new LocalConnectionError(message || 'The local Ladder proxy is unavailable.', 'unavailable');
  }
  if (
    typeof response.baseUrl !== 'string' ||
    typeof response.username !== 'string' ||
    typeof response.password !== 'string' ||
    typeof response.version !== 'string' ||
    !response.username ||
    !response.password
  ) {
    throw new LocalConnectionError('The Ladder Buddy helper returned incomplete connection details.', 'incompatible');
  }

  let parsed: URL;
  try {
    parsed = new URL(response.baseUrl);
  } catch {
    throw new LocalConnectionError('The Ladder Buddy helper returned an invalid local address.', 'incompatible');
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new LocalConnectionError('The Ladder Buddy helper returned a nonlocal address.', 'incompatible');
  }

  return {
    baseUrl: normalizeBaseUrl(response.baseUrl),
    username: response.username,
    password: response.password,
    version: response.version,
  };
};

export const getLocalConnection = async (): Promise<LocalConnection> => {
  let response: unknown;
  try {
    response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      type: 'getConnection',
      protocolVersion: NATIVE_PROTOCOL_VERSION,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/native messaging host.*not found|specified native messaging host|access to.*native messaging host.*forbidden/i.test(detail)) {
      throw new LocalConnectionError('The Ladder Buddy helper is missing.', 'missing');
    }
    throw new LocalConnectionError(`Could not reach the Ladder Buddy helper: ${detail}`, 'unavailable');
  }
  return parseLocalConnection(response);
};
