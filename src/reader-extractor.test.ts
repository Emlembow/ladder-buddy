import { describe, expect, it } from 'vitest';
import { safeReaderHref } from './reader-extractor';

describe('safeReaderHref', () => {
  const source = 'https://example.com/news/story';

  it('keeps ordinary absolute, relative, and email links', () => {
    expect(safeReaderHref('/other', source)).toBe('https://example.com/other');
    expect(safeReaderHref('https://example.net/page', source)).toBe('https://example.net/page');
    expect(safeReaderHref('mailto:writer@example.com', source)).toBe('mailto:writer@example.com');
  });

  it('restores the original URL from Ladder-rewritten article links', () => {
    expect(safeReaderHref('/https://example.com/news/next', source)).toBe('https://example.com/news/next');
    expect(safeReaderHref('/http://other.example/story?a=1', source)).toBe('http://other.example/story?a=1');
  });

  it('drops executable and unsupported schemes from article links', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:alert(1)', 'file:///etc/passwd']) {
      expect(safeReaderHref(href, source)).toBeUndefined();
    }
  });
});
