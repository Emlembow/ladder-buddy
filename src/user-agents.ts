export const USER_AGENT_PROFILE_HEADER = 'X-Ladder-User-Agent-Profile';
export const USER_AGENT_HEADER = 'X-Ladder-User-Agent';

export const userAgentProfiles = [
  {
    id: 'browser-chrome',
    label: 'Chrome on Windows',
    category: 'Browser',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  },
  {
    id: 'googlebot-desktop',
    label: 'Googlebot desktop',
    category: 'Search',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/149.0.0.0 Safari/537.36',
  },
  {
    id: 'googlebot-classic',
    label: 'Googlebot classic',
    category: 'Search',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  {
    id: 'bingbot-desktop',
    label: 'Bingbot desktop',
    category: 'Search',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/149.0.0.0 Safari/537.36',
  },
  {
    id: 'bingbot-classic',
    label: 'Bingbot classic',
    category: 'Search',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  },
  {
    id: 'yahooslurp',
    label: 'Yahoo Slurp',
    category: 'Search',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
  },
  {
    id: 'baiduspider',
    label: 'Baiduspider',
    category: 'Search',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  },
  {
    id: 'yandexbot',
    label: 'YandexBot',
    category: 'Search',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  },
  {
    id: 'facebookexternalhit',
    label: 'Facebook external hit',
    category: 'Preview',
    autoCandidate: true,
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  },
  {
    id: 'twitterbot',
    label: 'Twitterbot',
    category: 'Preview',
    autoCandidate: true,
    userAgent:
      'Twitterbot/1.0 Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.3 Chrome/69.0.3497.128 Safari/537.36',
  },
  {
    id: 'linkedinbot',
    label: 'LinkedInBot',
    category: 'Preview',
    autoCandidate: true,
    userAgent: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)',
  },
  {
    id: 'slackbot-linkexpanding',
    label: 'Slackbot link expanding',
    category: 'Preview',
    autoCandidate: true,
    userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  },
  {
    id: 'pinterestbot',
    label: 'Pinterestbot',
    category: 'Preview',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; Pinterestbot/1.0; +https://www.pinterest.com/bot.html)',
  },
  {
    id: 'oai-searchbot',
    label: 'OAI-SearchBot',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot',
  },
  {
    id: 'chatgpt-user',
    label: 'ChatGPT-User',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  },
  {
    id: 'gptbot',
    label: 'GPTBot',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot',
  },
  {
    id: 'claudebot',
    label: 'ClaudeBot',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  },
  {
    id: 'claude-user',
    label: 'Claude-User',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  },
  {
    id: 'claude-searchbot',
    label: 'Claude-SearchBot',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)',
  },
  {
    id: 'perplexitybot',
    label: 'PerplexityBot',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  },
  {
    id: 'perplexity-user',
    label: 'Perplexity-User',
    category: 'AI',
    autoCandidate: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  },
  {
    id: 'ahrefsbot',
    label: 'AhrefsBot',
    category: 'SEO',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  },
  {
    id: 'semrushbot',
    label: 'SemrushBot',
    category: 'SEO',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  },
  {
    id: 'mj12bot',
    label: 'MJ12Bot',
    category: 'SEO',
    autoCandidate: true,
    userAgent: 'MJ12bot/v1.4.0 (http://www.majestic12.co.uk/bot.php?+)',
  },
  {
    id: 'pingdom',
    label: 'Pingdom',
    category: 'Monitoring',
    autoCandidate: true,
    userAgent: 'Pingdom.com_bot_version_1.1 (+http://www.pingdom.com/)',
  },
  {
    id: 'uptimerobot',
    label: 'UptimeRobot',
    category: 'Monitoring',
    autoCandidate: true,
    userAgent: 'UptimeRobot/2.0 (+http://www.uptimerobot.com/)',
  },
  {
    id: 'betterstackbot',
    label: 'BetterStackBot',
    category: 'Monitoring',
    autoCandidate: true,
    userAgent: 'BetterStackBot/1.0 (+https://betterstack.com/docs/monitoring/uptime-robot/bot/)',
  },
  {
    id: 'cron-job-org',
    label: 'cron-job.org',
    category: 'Monitoring',
    autoCandidate: true,
    userAgent: 'cron-job.org/1.2 (+https://cron-job.org/en/faq/)',
  },
  {
    id: 'anthropic-ai',
    label: 'anthropic-ai',
    category: 'Legacy AI',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; anthropic-ai/1.0; +http://www.anthropic.com/bot.html)',
  },
  {
    id: 'censysinspect',
    label: 'CensysInspect',
    category: 'Security',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)',
  },
  {
    id: 'shodan',
    label: 'Shodan',
    category: 'Security',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; Shodan/1.0; +https://www.shodan.io/bot)',
  },
  {
    id: 'bitsightbot',
    label: 'BitSightBot',
    category: 'Security',
    autoCandidate: true,
    userAgent: 'Mozilla/5.0 (compatible; BitSightBot/1.0)',
  },
] as const;

export type UserAgentProfile = (typeof userAgentProfiles)[number];
export type UserAgentProfileId = UserAgentProfile['id'];
export type UserAgentMode = 'server' | 'auto' | 'custom' | UserAgentProfileId;

export const autoUserAgentProfiles = userAgentProfiles.filter(profile => profile.autoCandidate);

export const isUserAgentProfileId = (value: string): value is UserAgentProfileId =>
  userAgentProfiles.some(profile => profile.id === value);

export const isProfileBackedMode = (value: UserAgentMode): value is UserAgentProfileId =>
  value !== 'server' && value !== 'auto' && value !== 'custom' && isUserAgentProfileId(value);
