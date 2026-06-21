import type { LadderSettings } from './ladder';
import type { UserAgentProfileId } from './user-agents';

export type ReaderSession = {
  settings: LadderSettings;
  targetUrl: string;
  selectedUserAgentProfile?: UserAgentProfileId;
};

export const readerSessionKey = (id: string) => `reader:${id}`;
