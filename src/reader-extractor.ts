import { buildProxyUrl, normalizeBaseUrl } from './ladder';

export type ReaderDocument = {
  sourceUrl: string;
  title: string;
  byline: string;
  publishedAt: string;
  excerpt: string;
  contentHtml: string;
  textLength: number;
  imageCount: number;
};

const allowedTags = new Set([
  'a',
  'article',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'picture',
  'pre',
  'section',
  'source',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
]);

const removableTags = 'script,style,noscript,template,iframe,form,button,nav,footer,aside,canvas,svg';
const removablePattern =
  /\b(ad-|advert|banner|cookie|consent|modal|newsletter|overlay|promo|recommend|related|share|signin|sign-in|social|subscribe|subscription|video-player)\b/i;

const textOf = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

const metaContent = (doc: Document, selector: string) =>
  doc.querySelector<HTMLMetaElement>(selector)?.content?.replace(/\s+/g, ' ').trim() ?? '';

const shouldRemoveElement = (element: Element) => {
  const signature = [
    element.id,
    element.className,
    element.getAttribute('aria-label'),
    element.getAttribute('role'),
    element.getAttribute('data-testid'),
  ]
    .filter(Boolean)
    .join(' ');
  return removablePattern.test(signature);
};

const removeNoise = (root: ParentNode) => {
  root.querySelectorAll(removableTags).forEach(element => element.remove());
  root.querySelectorAll('*').forEach(element => {
    if (shouldRemoveElement(element)) {
      element.remove();
    }
  });
};

const scoreElement = (element: Element) => {
  const textLength = textOf(element).length;
  const paragraphCount = element.querySelectorAll('p').length;
  const headingCount = element.querySelectorAll('h1,h2,h3').length;
  const imageCount = element.querySelectorAll('img,picture').length;
  const linkTextLength = Array.from(element.querySelectorAll('a')).reduce((total, link) => total + textOf(link).length, 0);
  const semanticBonus = ['ARTICLE', 'MAIN'].includes(element.tagName) ? 800 : 0;
  return textLength + paragraphCount * 120 + headingCount * 80 + imageCount * 90 + semanticBonus - linkTextLength * 0.2;
};

const findArticleRoot = (doc: Document) => {
  const selectors = [
    'article',
    'main article',
    '[role="main"] article',
    '.article__content',
    '.article-content',
    '.entry-content',
    '.post-content',
    'main',
  ];
  const candidates = selectors.flatMap(selector => Array.from(doc.querySelectorAll(selector)));
  return candidates.sort((a, b) => scoreElement(b) - scoreElement(a))[0] ?? doc.body;
};

const normalizeReaderUrl = (value: string, sourceUrl: string) => {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  return new URL(value, sourceUrl).href;
};

const rewriteAssetUrl = (value: string, sourceUrl: string, ladderBaseUrl: string) => {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/http://') || value.startsWith('/https://')) {
    return `${normalizeBaseUrl(ladderBaseUrl)}${value}`;
  }
  return buildProxyUrl(ladderBaseUrl, normalizeReaderUrl(value, sourceUrl));
};

const rewriteSrcset = (value: string, sourceUrl: string, ladderBaseUrl: string) =>
  value
    .split(',')
    .map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      if (!parts[0]) {
        return '';
      }
      return [rewriteAssetUrl(parts[0], sourceUrl, ladderBaseUrl), ...parts.slice(1)].join(' ');
    })
    .filter(Boolean)
    .join(', ');

const sanitizeNode = (node: Node, doc: Document, sourceUrl: string, ladderBaseUrl: string): Node | undefined => {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return undefined;
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (shouldRemoveElement(element) || removableTags.split(',').includes(tag)) {
    return undefined;
  }

  const container = allowedTags.has(tag) ? doc.createElement(tag) : doc.createDocumentFragment();

  if (container instanceof HTMLElement || container instanceof HTMLImageElement || container instanceof HTMLSourceElement) {
    if (tag === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        container.setAttribute('href', normalizeReaderUrl(href, sourceUrl));
        container.setAttribute('target', '_blank');
        container.setAttribute('rel', 'noreferrer noopener');
      }
    }

    if (tag === 'img' || tag === 'source') {
      const src = element.getAttribute('src') || element.getAttribute('data-src') || element.getAttribute('data-original');
      const srcset = element.getAttribute('srcset') || element.getAttribute('data-srcset');
      if (src) {
        container.setAttribute('src', rewriteAssetUrl(src, sourceUrl, ladderBaseUrl));
      }
      if (srcset) {
        container.setAttribute('srcset', rewriteSrcset(srcset, sourceUrl, ladderBaseUrl));
      }
      for (const attr of ['alt', 'title', 'width', 'height', 'media', 'type']) {
        const value = element.getAttribute(attr);
        if (value) {
          container.setAttribute(attr, value);
        }
      }
      if (tag === 'img') {
        container.setAttribute('loading', 'lazy');
      }
    }

    if (tag === 'time') {
      const datetime = element.getAttribute('datetime');
      if (datetime) {
        container.setAttribute('datetime', datetime);
      }
    }
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitized = sanitizeNode(child, doc, sourceUrl, ladderBaseUrl);
    if (sanitized) {
      container.appendChild(sanitized);
    }
  }

  if (tag === 'img' && container instanceof HTMLElement && !container.getAttribute('src')) {
    return undefined;
  }

  return container;
};

export const extractReaderDocument = (html: string, sourceUrl: string, ladderBaseUrl: string): ReaderDocument => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  removeNoise(doc);

  const articleRoot = findArticleRoot(doc);
  removeNoise(articleRoot);

  const title =
    textOf(articleRoot.querySelector('h1')) ||
    metaContent(doc, 'meta[property="og:title"]') ||
    metaContent(doc, 'meta[name="twitter:title"]') ||
    doc.title ||
    new URL(sourceUrl).hostname;
  const byline =
    metaContent(doc, 'meta[name="author"]') ||
    textOf(articleRoot.querySelector('[rel="author"], .byline, [class*="byline"], [class*="author"]'));
  const publishedAt =
    metaContent(doc, 'meta[property="article:published_time"]') ||
    articleRoot.querySelector('time')?.getAttribute('datetime') ||
    textOf(articleRoot.querySelector('time'));
  const excerpt =
    metaContent(doc, 'meta[name="description"]') ||
    metaContent(doc, 'meta[property="og:description"]') ||
    textOf(articleRoot.querySelector('p'));

  const output = document.implementation.createHTMLDocument('reader');
  const article = output.createElement('article');
  for (const child of Array.from(articleRoot.childNodes)) {
    const sanitized = sanitizeNode(child, output, sourceUrl, ladderBaseUrl);
    if (sanitized) {
      article.appendChild(sanitized);
    }
  }

  article.querySelectorAll('p,li,blockquote,h2,h3,h4,h5,h6,figcaption').forEach(element => {
    if (!textOf(element) && element.querySelectorAll('img,picture').length === 0) {
      element.remove();
    }
  });

  return {
    sourceUrl,
    title,
    byline,
    publishedAt: publishedAt ?? '',
    excerpt,
    contentHtml: article.innerHTML,
    textLength: textOf(article).length,
    imageCount: article.querySelectorAll('img').length,
  };
};
