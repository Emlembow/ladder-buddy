import { buildApiUrl, getAuthHeaders, getUserAgentHeaders } from './ladder';
import { extractReaderDocument } from './reader-extractor';
import { readerSessionKey, type ReaderSession } from './reader-session';

type LadderApiResponse = {
  body?: string;
  response?: {
    status?: number;
  };
};

const title = document.getElementById('title') as HTMLHeadingElement;
const meta = document.getElementById('meta') as HTMLParagraphElement;
const source = document.getElementById('source') as HTMLAnchorElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const content = document.getElementById('content') as HTMLElement;

const setStatus = (message: string, kind = '') => {
  status.textContent = message;
  status.dataset.kind = kind;
};

const getSessionId = () => new URLSearchParams(location.search).get('id') ?? '';

const loadSession = async (id: string) => {
  const result = (await chrome.storage.session.get(readerSessionKey(id))) as Record<string, ReaderSession | undefined>;
  return result[readerSessionKey(id)];
};

const buildHeaders = (session: ReaderSession) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const requestHeaders = [
    ...getAuthHeaders(session.settings),
    ...getUserAgentHeaders(session.settings, session.selectedUserAgentProfile),
  ];

  for (const { header, value } of requestHeaders) {
    if (value.trim() !== '') {
      headers.set(header, value);
    }
  }

  return headers;
};

const loadLadderHtml = async (session: ReaderSession) => {
  const response = await fetch(buildApiUrl(session.settings.baseUrl), {
    method: 'POST',
    headers: buildHeaders(session),
    body: JSON.stringify({
      url: session.targetUrl,
      userAgentProfile: session.selectedUserAgentProfile,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Ladder API returned ${response.status}. Check the configured Ladder auth.`);
  }
  if (!response.ok) {
    throw new Error(`Ladder API returned ${response.status}`);
  }

  const payload = (await response.json()) as LadderApiResponse;
  const upstreamStatus = payload.response?.status;
  if (upstreamStatus !== undefined && (upstreamStatus < 200 || upstreamStatus >= 400)) {
    throw new Error(`Upstream page returned ${upstreamStatus}`);
  }
  if (!payload.body?.trim()) {
    throw new Error('Ladder returned an empty page');
  }

  return payload.body;
};

const renderReader = async () => {
  const id = getSessionId();
  if (!id) {
    throw new Error('Missing reader session');
  }

  const session = await loadSession(id);
  if (!session) {
    throw new Error('Reader session expired');
  }

  source.href = session.targetUrl;
  source.textContent = new URL(session.targetUrl).hostname;
  setStatus('Fetching through Ladder...');

  const html = await loadLadderHtml(session);
  setStatus('Building reader view...');

  const article = extractReaderDocument(html, session.targetUrl, session.settings.baseUrl);
  document.title = `${article.title} - Ladder Buddy Reader`;
  title.textContent = article.title;
  source.href = article.sourceUrl;
  source.textContent = new URL(article.sourceUrl).hostname;

  const metadata = [article.byline, article.publishedAt].filter(Boolean).join(' · ');
  meta.textContent = metadata || article.excerpt;
  content.innerHTML = article.contentHtml;

  setStatus(`${article.textLength.toLocaleString()} characters · ${article.imageCount.toLocaleString()} images`);
};

void renderReader().catch(error => {
  title.textContent = 'Reader unavailable';
  meta.textContent = '';
  content.replaceChildren();
  setStatus(error instanceof Error ? error.message : String(error), 'error');
});
