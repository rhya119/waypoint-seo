import type { AiReadiness } from '../shared/site-scan.js';

export type PageSignals = {
  questionHeadings: number;
  subheadings: number;
  listItems: number;
  tables: number;
  author: boolean;
  dated: boolean;
  statistics: number;
  leadWords: number;
  aboutLink: boolean;
  contactLink: boolean;
  feed: boolean;
  scripts: number;
  emptyAppRoot: boolean;
  hiddenInstructions: boolean;
};

type Input = {
  robotsFound: boolean;
  isAllowed: (agent: string) => boolean;
  signals: PageSignals;
  structuredDataTypes: string[];
  wordCount: number;
  description: string;
  openGraph: { title: string; description: string; image: string };
  canonical: string;
  language: string;
  noindex: boolean;
  sitemaps: string[];
  llms: { found: boolean; lines: number; links: number };
  h1Count: number;
};

/** Crawlers that fetch pages for AI answers and search results. Blocking a
 * training-only crawler is a business choice, so it does not lower the score. */
export const aiCrawlers: Omit<AiReadiness['bots'][number], 'allowed'>[] = [
  { agent: 'Googlebot', owner: 'Google', product: 'Google Search and AI Overviews', purpose: 'search' },
  { agent: 'Bingbot', owner: 'Microsoft', product: 'Bing and Copilot', purpose: 'search' },
  { agent: 'OAI-SearchBot', owner: 'OpenAI', product: 'ChatGPT search', purpose: 'search' },
  { agent: 'ChatGPT-User', owner: 'OpenAI', product: 'ChatGPT browsing', purpose: 'search' },
  { agent: 'Claude-SearchBot', owner: 'Anthropic', product: 'Claude search', purpose: 'search' },
  { agent: 'Claude-User', owner: 'Anthropic', product: 'Claude browsing', purpose: 'search' },
  { agent: 'PerplexityBot', owner: 'Perplexity', product: 'Perplexity answers', purpose: 'search' },
  { agent: 'Perplexity-User', owner: 'Perplexity', product: 'Perplexity browsing', purpose: 'search' },
  { agent: 'GPTBot', owner: 'OpenAI', product: 'Model training', purpose: 'training' },
  { agent: 'ClaudeBot', owner: 'Anthropic', product: 'Model training', purpose: 'training' },
  { agent: 'Google-Extended', owner: 'Google', product: 'Gemini training', purpose: 'training' },
  { agent: 'Applebot-Extended', owner: 'Apple', product: 'Apple Intelligence training', purpose: 'training' },
  { agent: 'CCBot', owner: 'Common Crawl', product: 'Open web dataset', purpose: 'training' },
  { agent: 'meta-externalagent', owner: 'Meta', product: 'Meta AI', purpose: 'training' },
];

const organizationTypes = /^(?:Organization|Corporation|LocalBusiness|Store|OnlineStore|Restaurant|ProfessionalService|NGO|EducationalOrganization|MedicalOrganization)$/;
const contentTypes = /^(?:FAQPage|Article|BlogPosting|NewsArticle|Product|Service|HowTo|Recipe|Course|Event|Review|QAPage)$/;

export function assessAiReadiness(input: Input): AiReadiness {
  const bots = aiCrawlers.map((bot) => ({ ...bot, allowed: input.isAllowed(bot.agent) }));
  const searchBots = bots.filter((bot) => bot.purpose === 'search' && !['Googlebot', 'Bingbot'].includes(bot.agent));
  const aiAllowed = searchBots.filter((bot) => bot.allowed).length;
  const enginesAllowed = bots.filter((bot) => ['Googlebot', 'Bingbot'].includes(bot.agent) && bot.allowed).length;
  const types = input.structuredDataTypes;
  const s = input.signals;
  const checks: AiReadiness['checks'] = [];
  const add = (id: string, category: AiReadiness['checks'][number]['category'], name: string, max: number, points: number, detail: string, fix: string, passed = points >= max * 0.75) =>
    checks.push({ id, category, name, max, points: Math.max(0, Math.min(max, Math.round(points))), passed, detail, fix });

  add('search-engines', 'Access', 'Google and Bing can crawl the homepage', 10, enginesAllowed * 5,
    `${enginesAllowed} of 2 search engine crawlers are allowed by robots.txt.`, 'Remove Disallow rules for Googlebot and Bingbot in robots.txt.');
  add('ai-search-bots', 'Access', 'AI answer engines can read the homepage', 15, aiAllowed / searchBots.length * 15,
    `${aiAllowed} of ${searchBots.length} AI search crawlers are allowed${input.robotsFound ? '' : ' (no robots.txt rules found, so all are allowed)'}.`,
    `Allow ${searchBots.filter((bot) => !bot.allowed).map((bot) => bot.agent).join(', ') || 'AI search crawlers'} in robots.txt so ChatGPT, Claude and Perplexity can cite you.`, aiAllowed === searchBots.length);
  add('indexable', 'Access', 'Homepage is indexable', 5, input.noindex ? 0 : 5,
    input.noindex ? 'A noindex directive blocks indexing.' : 'No noindex directive found.', 'Remove noindex from the robots meta tag or X-Robots-Tag header.');

  add('sitemap', 'Discovery', 'Sitemap listed in robots.txt', 5, input.sitemaps.length ? 5 : 0,
    input.sitemaps.length ? `${input.sitemaps.length} sitemap(s) listed.` : 'No Sitemap line in robots.txt.', 'Add “Sitemap: https://yoursite/sitemap.xml” to robots.txt.');
  add('llms-txt', 'Discovery', 'llms.txt guide for AI tools', 6, input.llms.found ? (input.llms.links >= 3 ? 6 : 4) : 0,
    input.llms.found ? `Found with ${input.llms.lines} lines and ${input.llms.links} links.` : 'No /llms.txt file. It gives AI tools a short map of your most useful pages.', 'Generate an llms.txt below and upload it to your site root.');
  add('canonical-lang', 'Discovery', 'Canonical URL and language declared', 4, (input.canonical ? 2 : 0) + (input.language ? 2 : 0),
    `${input.canonical ? 'Canonical set' : 'No canonical'}; ${input.language ? `lang="${input.language}"` : 'no lang attribute'}.`, 'Add <link rel="canonical"> and <html lang="…">.');

  const hasOrg = types.some((type) => organizationTypes.test(type));
  add('schema-org', 'Structured data', 'Organization or LocalBusiness schema', 8, hasOrg ? 8 : 0,
    hasOrg ? 'Found — AI tools can identify who you are.' : 'No Organization/LocalBusiness JSON-LD found.', 'Add Organization JSON-LD (generator below) with your name, logo, address and social profiles.');
  add('schema-website', 'Structured data', 'WebSite schema', 4, types.includes('WebSite') ? 4 : 0,
    types.includes('WebSite') ? 'Found.' : 'No WebSite JSON-LD found.', 'Add WebSite JSON-LD with your site name and URL.');
  const content = types.filter((type) => contentTypes.test(type));
  add('schema-content', 'Structured data', 'Content schema (FAQ, Article, Product, Service…)', 8, content.length ? 8 : 0,
    content.length ? `Found: ${content.join(', ')}.` : 'No FAQ, Article, Product or Service schema found.', 'Mark up your main content type; FAQPage schema makes question-and-answer content easy to quote.');

  const rendered = input.wordCount >= 300 ? 7 : input.wordCount >= 120 ? 4 : 0;
  add('rendered-text', 'Content', 'Content readable without JavaScript', 7, s.emptyAppRoot && input.wordCount < 120 ? 0 : rendered,
    `${input.wordCount} words in the raw HTML${s.emptyAppRoot ? '; the page looks like a JavaScript app shell' : ''}. Most AI crawlers do not run JavaScript.`, 'Server-render or pre-render the main text so it is in the HTML response.');
  add('answer-first', 'Content', 'Opens with a direct answer', 4, s.leadWords >= 15 ? 4 : s.leadWords >= 8 ? 2 : 0,
    s.leadWords ? `The first paragraph has ${s.leadWords} words.` : 'No opening paragraph found.', 'Start with one or two sentences that say plainly what you offer and for whom.');
  add('questions', 'Content', 'Question-style headings or FAQ', 5, s.questionHeadings >= 3 || types.includes('FAQPage') ? 5 : s.questionHeadings * 1.5,
    `${s.questionHeadings} question-style headings.`, 'Add an FAQ section using the exact questions customers ask, each answered in 40–60 words.');
  add('structure', 'Content', 'Lists and tables AI can lift', 4, (s.listItems >= 5 ? 2 : s.listItems ? 1 : 0) + (s.tables ? 2 : 0) + (s.subheadings >= 3 ? 0 : -1),
    `${s.listItems} list items, ${s.tables} tables, ${s.subheadings} subheadings.`, 'Break key information into short sections, bullet lists and comparison tables.');
  add('statistics', 'Content', 'Specific facts and numbers', 3, s.statistics >= 3 ? 3 : s.statistics,
    `${s.statistics} figures such as prices, percentages or counts.`, 'Add concrete facts — prices, sizes, years in business, customer numbers — that AI answers can cite.');
  add('meta', 'Content', 'Description and share tags', 2, (input.description ? 1 : 0) + (input.openGraph.title && input.openGraph.image ? 1 : 0) - (input.h1Count === 1 ? 0 : 1),
    `${input.description ? 'Meta description present' : 'No meta description'}; ${input.openGraph.image ? 'share image set' : 'no share image'}; ${input.h1Count} H1.`, 'Add a meta description, Open Graph title/description/image and one H1.');

  add('author-dates', 'Trust', 'Author and dates shown', 4, (s.author ? 2 : 0) + (s.dated ? 2 : 0),
    `${s.author ? 'Author found' : 'No author'}; ${s.dated ? 'dates found' : 'no published/updated dates'}.`, 'Show who wrote or owns the content and when it was last updated.');
  add('about-contact', 'Trust', 'About and contact information', 5, (s.aboutLink ? 2.5 : 0) + (s.contactLink ? 2.5 : 0),
    `${s.aboutLink ? 'About link' : 'No about link'}; ${s.contactLink ? 'contact details' : 'no contact link'}.`, 'Link to an About page and clear contact details from every page.');
  add('feed', 'Trust', 'News or blog feed', 1, s.feed ? 1 : 0, s.feed ? 'RSS/Atom feed found.' : 'No RSS/Atom feed.', 'Publish an RSS feed if you post articles regularly.');

  let score = checks.reduce((sum, check) => sum + check.points, 0);
  if (s.hiddenInstructions) {
    score = Math.max(0, score - 15);
    checks.push({ id: 'manipulation', category: 'Trust', name: 'No hidden instructions to AI', max: 0, points: 0, passed: false,
      detail: 'The page contains text that looks like instructions aimed at AI assistants. Engines treat this as manipulation.', fix: 'Remove hidden prompt-style text from the page.' });
  }
  score = Math.round(score);
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F', bots, checks };
}
