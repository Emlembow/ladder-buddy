import type { LadderSettings } from './ladder';
import type { UserAgentProfileId } from './user-agents';

export const OPEN_WITH_LADDER = 'openWithLadder';
export const OPEN_READER_WITH_LADDER = 'openReaderWithLadder';

export type OpenWithLadderMessage = {
  type: typeof OPEN_WITH_LADDER;
  settings: LadderSettings;
  targetUrl: string;
  tabId?: number;
};

export type OpenReaderWithLadderMessage = Omit<OpenWithLadderMessage, 'type'> & {
  type: typeof OPEN_READER_WITH_LADDER;
};

export type OpenWithLadderResponse = { url: string; selectedUserAgentProfile?: UserAgentProfileId } | { error: string };
