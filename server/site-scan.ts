import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';
import { auditHtml } from './audit.js';
import { assessAiReadiness, type PageSignals } from './ai-readiness.js';
import type { SiteScan } from '../shared/site-scan.js';

export type { SiteScan } from '../shared/site-scan.js';
export class SiteScanError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const USER_AGENT = 'WaypointSEO/0.6 (+https://github.com/rhya119/waypoint-seo; bounded SEO site inspection)';
const ROBOT_NAME = 'WaypointSEO';
const BYTE_LIMIT = 8_000_000;
const PAGE_LIMIT = 50;
/** Decompressed size cap per response, so a small compressed body cannot expand without bound. */
const DECODED_LIMIT = 4_000_000;
const overBudget = (limit: number) => new SiteScanError(413, `Website responses exceed the ${limit >= 1_000_000 ? `${+(limit / 1_000_000).toFixed(1)} MB` : `${limit.toLocaleString()} byte`} scan limit.`);
const REDIRECT_LIMIT = 3;
const ACTION_PATH = /(?:^|\/)(?:api|admin|wp-admin|wp-login(?:\.php)?|login|log-in|logout|log-out|signin|sign-in|signup|sign-up|register|account|auth|oauth|callback|cart|checkout|basket|delete|remove|unsubscribe|action|download)(?:[\/;.]|$)/i;
type Address = { address: string; family: 4 | 6 };
export type SiteResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
export type SiteRequest = { url: URL; address: string; family: 4 | 6; signal: AbortSignal; maxBytes: number };
export type SiteScannerOptions = {
  /** Trusted server-side test seams. Never populate these from request input. */
  resolve?: (hostname: string) => Promise<Address[]>;
  request?: (request: SiteRequest) => Promise<SiteResponse>;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
  /** Total HTML pages to inspect, including the homepage. */
  maxPages?: number;
};

function allowedUrl(value: string | URL): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new SiteScanError(400, 'Enter a valid public website domain.'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(hostname.replace(/^\[|\]$/g, '')) ||
      hostname.length > 253 || !hostname.includes('.') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(hostname) || hostname.endsWith('.ts.net')) {
    throw new SiteScanError(400, 'Scan a public HTTPS website using its domain, without credentials or a custom port. Private hosts and IP addresses are blocked.');
  }
  if (url.href.length > 2048) throw new SiteScanError(400, 'The website URL is too long.');
  url.hostname = hostname;
  url.hash = '';
  return url;
}

function publicAddress(address: string, family: number): boolean {
  // Reject every special range, including IPv4-mapped/transition IPv6, CGNAT,
  // documentation and unassigned IPv6 space. Do not let DNS choose a second IP.
  if (isIP(address) !== family || (family !== 4 && family !== 6)) return false;
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.range() !== 'unicast') return false;
    return parsed.kind() === 'ipv4' || (parsed as ipaddr.IPv6).match(ipaddr.IPv6.parse('2000::'), 3);
  } catch { return false; }
}

/** The hostname is never resolved by the HTTP stack: connect to the vetted IP,
 * retain the intended TLS SNI/certificate identity and Host header, and disable
 * pooling so a previous socket cannot bypass this request's DNS validation. */
function requestPinned(input: SiteRequest): Promise<SiteResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      protocol: 'https:', hostname: input.address, family: input.family, port: 443,
      servername: input.url.hostname,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(input.url.hostname, certificate),
      path: input.url.pathname + input.url.search, method: 'GET', agent: false,
      signal: input.signal, maxHeaderSize: 16_384,
      headers: { Host: input.url.host, 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9,application/xml;q=0.8,text/xml;q=0.8', 'Accept-Encoding': 'gzip, deflate, br', Connection: 'close' },
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      const length = Number(res.headers['content-length']);
      if (Number.isFinite(length) && length > input.maxBytes) {
        const error = new SiteScanError(413, 'Website responses exceed the scan byte limit.');
        reject(error); res.destroy(); req.destroy(error); return;
      }
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > input.maxBytes) {
          const error = new SiteScanError(413, 'Website responses exceed the scan byte limit.');
          reject(error); res.destroy(); req.destroy(error); return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
      res.on('aborted', () => reject(new SiteScanError(502, 'The website closed the response before it finished.')));
    });
    req.on('error', reject);
    req.end();
  });
}

function header(response: SiteResponse, key: string) {
  const value = response.headers[key] ?? Object.entries(response.headers).find(([name]) => name.toLowerCase() === key)?.[1];
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function timed<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number, outer: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); outer.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value!);
    };
    const abort = () => { controller.abort(); finish(new SiteScanError(504, 'The website scan timed out. Try again later.')); };
    const timer = setTimeout(abort, ms);
    outer.addEventListener('abort', abort, { once: true });
    if (outer.aborted) { abort(); return; }
    operation(controller.signal).then((value) => finish(undefined, value), (error) => finish(error));
  });
}

const stopWords = new Set(('the and for are but not you your with this that from have has was were will can our all more about into their they them what when where how who than then also any out use new here there its our get one two home menu shop cart login sign account contact privacy policy terms cookie cookies copyright read learn please').split(' '));
const clean = (value: string | undefined, limit = 2000) => (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
function visibleUrl(raw: string | undefined, base: URL) {
  if (!raw) return '';
  try {
    const url = new URL(raw, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) return '';
    url.hash = ''; return url.href;
  } catch { return ''; }
}

function inspectHtml(html: string, finalUrl: URL, response: SiteResponse) {
  const $ = load(html);
  const meta = (key: string, attribute: 'name' | 'property' = 'name') => clean($(`meta[${attribute}="${key}"]`).first().attr('content'));
  const baseHref = visibleUrl($('base[href]').first().attr('href'), finalUrl);
  const base = baseHref ? new URL(baseHref) : finalUrl;
  const headings = $('h1,h2,h3,h4,h5,h6').toArray().slice(0, 100).map((element) => ({ level: Number(element.tagName.slice(1)), text: clean($(element).text(), 300) }));
  const images = $('img').toArray();
  const body = $('body').clone();
  body.find('script,style,noscript,template,svg,[hidden],[aria-hidden="true"]').remove();
  // Separate adjacent elements so markup boundaries cannot merge words.
  body.find('br,p,div,li,section,article,h1,h2,h3,h4,h5,h6').append(' ');
  const words = (body.text().normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’\-]*/gu) || []);
  const counts = new Map<string, number>();
  for (const word of words) if (word.length >= 3 && word.length <= 40 && /\p{L}/u.test(word) && !stopWords.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  const topics = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([term, count]) => ({ term, count }));
  const internalLinks: SiteScan['internalLinks'] = [];
  const externalLinks: SiteScan['externalLinks'] = [];
  const seen = new Set<string>();
  const siteHost = finalUrl.hostname.replace(/^www\./, '');
  for (const element of $('a[href]').toArray()) {
    const raw = $(element).attr('href');
    if (!raw || raw.startsWith('#')) continue;
    const url = visibleUrl(raw, base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const host = new URL(url).hostname.replace(/^www\./, '');
    const list = host === siteHost || host.endsWith(`.${siteHost}`) ? internalLinks : externalLinks;
    if (list.length < 200) list.push({ url, anchor: clean($(element).text() || $(element).attr('aria-label'), 300) });
  }
  const types = new Set<string>();
  let malformedJson = false;
  for (const element of $('script[type="application/ld+json"]').toArray().slice(0, 50)) {
    try {
      const pending: { value: unknown; depth: number }[] = [{ value: JSON.parse($(element).text()), depth: 0 }];
      let visited = 0;
      while (pending.length && visited++ < 500) {
        const { value, depth } = pending.pop()!;
        if (!value || typeof value !== 'object' || depth > 12) continue;
        if (Array.isArray(value)) { for (const entry of value) pending.push({ value: entry, depth: depth + 1 }); continue; }
        for (const [key, child] of Object.entries(value)) {
          if (key === '@type') for (const type of Array.isArray(child) ? child : [child]) if (typeof type === 'string' && types.size < 50) types.add(clean(type, 100));
          if (child && typeof child === 'object') pending.push({ value: child, depth: depth + 1 });
        }
      }
    } catch { malformedJson = true; }
  }
  const robotsMeta = [meta('robots'), clean(header(response, 'x-robots-tag'))].filter(Boolean).join('; ');
  const ldText = $('script[type="application/ld+json"]').toArray().slice(0, 50).map((element) => $(element).text()).join(' ');
  const bodyText = clean(body.text(), 200_000);
  const firstParagraph = clean($('main p, article p, p').toArray().map((element) => $(element).text()).find((text) => clean(text).split(' ').length >= 8), 2000);
  const signals: PageSignals = {
    questionHeadings: headings.filter((heading) => heading.level > 1 && /\?$|^(?:how|what|why|when|where|which|who|can|is|are|does|do|should)\b/i.test(heading.text)).length,
    subheadings: headings.filter((heading) => heading.level === 2 || heading.level === 3).length,
    listItems: $('ul li, ol li').length, tables: $('table').length,
    author: Boolean(meta('author') || $('[rel="author"], [itemprop="author"], .author, .byline').length || /"author"\s*:/.test(ldText)),
    dated: Boolean(meta('article:modified_time', 'property') || meta('article:published_time', 'property') || $('time[datetime]').length || /"date(?:Published|Modified)"\s*:/.test(ldText)),
    statistics: (bodyText.match(/\b\d[\d,.]*\s?(?:%|percent|per cent|x\b|million|billion|thousand|k\b|\$|usd|nzd|lkr|years?|customers|users|reviews)/gi) || []).length,
    leadWords: firstParagraph ? firstParagraph.split(' ').length : 0,
    aboutLink: $('a[href]').toArray().some((element) => /about/i.test(`${$(element).attr('href')} ${$(element).text()}`)),
    contactLink: $('a[href]').toArray().some((element) => /contact|mailto:|tel:/i.test(`${$(element).attr('href')} ${$(element).text()}`)),
    feed: $('link[type="application/rss+xml"], link[type="application/atom+xml"]').length > 0,
    scripts: $('script[src]').length, emptyAppRoot: $('#root, #__next, #app, [data-reactroot]').toArray().some((element) => !clean($(element).text())),
    hiddenInstructions: /ignore (?:all |any )?(?:previous|prior) instructions|you are (?:an? )?(?:ai|assistant|chatgpt|llm)|system prompt/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, '')),
  };
  const audit = auditHtml(html);
  if (/noindex/i.test(header(response, 'x-robots-tag'))) {
    const check = audit.checks.find((c) => c.name === 'Indexability declaration');
    if (check) { check.passed = false; check.detail = 'The fetched HTTP X-Robots-Tag header includes noindex.'; }
    audit.score = Math.round(audit.checks.filter((c) => c.passed).length / audit.checks.length * 100);
  }
  return {
    title: clean($('title').first().text(), 500), description: meta('description'),
    canonical: visibleUrl($('link[rel="canonical"]').first().attr('href'), base),
    language: clean($('html').attr('lang'), 100), robotsMeta, headings,
    images: { total: images.length, missingAlt: images.filter((element) => $(element).attr('alt') === undefined).length },
    wordCount: words.length, topics, internalLinks, externalLinks, structuredDataTypes: [...types],
    openGraph: { title: meta('og:title', 'property'), description: meta('og:description', 'property'), image: visibleUrl(meta('og:image', 'property'), base) },
    audit, signals, noindex: /noindex/i.test(robotsMeta),
    speed: {
      htmlBytes: Buffer.byteLength(html),
      blockingScripts: $('head script[src]').toArray().filter((element) => $(element).attr('async') === undefined && $(element).attr('defer') === undefined && $(element).attr('type') !== 'module').length,
      scripts: $('script[src]').length,
      thirdPartyScripts: $('script[src]').toArray().filter((element) => { const url = visibleUrl($(element).attr('src'), base); return Boolean(url) && !new URL(url).hostname.replace(/^www\./, '').endsWith(finalUrl.hostname.replace(/^www\./, '')); }).length,
      stylesheets: $('link[rel="stylesheet"]').length,
      images: images.length,
      imagesWithoutSize: images.filter((element) => $(element).attr('width') === undefined || $(element).attr('height') === undefined).length,
      lazyImages: images.filter((element) => $(element).attr('loading') === 'lazy').length,
      modernImages: images.filter((element) => /\.(?:webp|avif)(?:$|\?)/i.test($(element).attr('src') || '') || $(element).closest('picture').find('source[type="image/webp"],source[type="image/avif"]').length > 0).length,
    },
    parsingWarnings: [
      ...(malformedJson ? ['Some JSON-LD could not be parsed. No structured data was executed.'] : []),
      ...(words.length < 50 && $('script').length ? ['The fetched HTML contains little readable text. Content loaded by JavaScript is not rendered in this scan.'] : []),
      ...($('a[href]').length > 400 ? ['Link previews are capped at 200 internal and 200 external URLs.'] : []),
    ],
  };
}

type IssueInput = NonNullable<SiteScan['pageChecks']>;
export function findPageIssues(pages: IssueInput): NonNullable<SiteScan['pageIssues']> {
  const issues: NonNullable<SiteScan['pageIssues']> = [];
  const add = (type: string, severity: 'error' | 'warning', url: string, detail: string) => { if (issues.length < 1000) issues.push({ type, severity, url, detail }); };
  const titles = new Map<string, number>();
  const descriptions = new Map<string, number>();
  const key = (value: string) => value.toLowerCase().trim();
  for (const page of pages) if (!page.error) {
    if (key(page.title)) titles.set(key(page.title), (titles.get(key(page.title)) || 0) + 1);
    if (key(page.description)) descriptions.set(key(page.description), (descriptions.get(key(page.description)) || 0) + 1);
  }
  for (const page of pages) {
    if (page.error) {
      const broken = page.status === 404 || page.status === 410;
      add(broken ? 'Broken page' : 'Unreachable page', broken ? 'error' : 'warning', page.url, page.source === 'sitemap' ? `${page.error} — listed in your sitemap; remove it or fix the page.` : page.error);
      continue;
    }
    if (!page.title) add('Missing title', 'error', page.url, 'This page has no <title>.');
    else if (page.title.length > 65) add('Title too long', 'warning', page.url, `${page.title.length} characters; search results cut titles at about 60.`);
    else if (page.title.length < 15) add('Title too short', 'warning', page.url, `Only ${page.title.length} characters: “${page.title}”.`);
    if (page.title && (titles.get(key(page.title)) || 0) > 1) add('Duplicate title', 'error', page.url, `“${page.title}” is used on ${titles.get(key(page.title))} pages.`);
    if (!page.description) add('Missing description', 'warning', page.url, 'No meta description; Google will pick snippet text itself.');
    else if ((descriptions.get(key(page.description)) || 0) > 1) add('Duplicate description', 'warning', page.url, `The same description is used on ${descriptions.get(key(page.description))} pages.`);
    if (page.h1Count === 0) add('Missing H1', 'error', page.url, 'No main heading.');
    else if (page.h1Count > 1) add('Multiple H1s', 'warning', page.url, `${page.h1Count} H1 headings.`);
    if (page.wordCount !== undefined && page.wordCount < 250) add('Thin content', 'warning', page.url, `${page.wordCount} words of readable text.`);
    if (page.noindex) add('Noindex page', 'error', page.url, 'Tells search engines not to index this page.');
    if (page.canonical && page.canonical.replace(/\/$/, '') !== page.url.replace(/\/$/, '')) {
      const sameHost = (() => { try { return new URL(page.canonical).hostname === new URL(page.url).hostname; } catch { return false; } })();
      add(sameHost ? 'Links to non-canonical URL' : 'Canonical on another domain', 'warning', page.url, sameHost ? `Your links use this address, but the page says its main address is ${page.canonical}. Link to that version directly.` : `The canonical points to ${page.canonical}, so this page may not rank on its own.`);
    }
    if (page.missingAlt) add('Images without alt', 'warning', page.url, `${page.missingAlt} images have no alt attribute.`);
    if (page.depth && page.depth >= 4) add('Deep page', 'warning', page.url, `${page.depth} clicks from the homepage.`);
    if (page.inSitemap === false && !page.noindex && page.status !== null && page.status < 300) add('Missing from sitemap', 'warning', page.url, 'Linked on your site but not listed in the sitemap, so Google may find it more slowly.');
    if (page.source === 'sitemap' && !page.inlinks) add('Orphan page', 'warning', page.url, 'Listed in the sitemap but no crawled page links to it. Link to it from a related page or menu.');
  }
  return issues;
}

export function createSiteScanner(options: SiteScannerOptions = {}) {
  const resolve = options.resolve || (async (hostname: string) => (await lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({ address, family: family as 4 | 6 })));
  const request = options.request || requestPinned;
  const requestTimeout = Math.max(1, Math.min(10_000, options.requestTimeoutMs ?? 10_000));
  const totalTimeout = Math.max(1, Math.min(120_000, options.totalTimeoutMs ?? 90_000));
  const maxBytes = Math.max(1, Math.min(BYTE_LIMIT, options.maxBytes ?? BYTE_LIMIT));
  const maxPages = Math.max(1, Math.min(100, options.maxPages ?? PAGE_LIMIT));
  let active = false;
  return {
    async scan(domain: string): Promise<SiteScan> {
      if (active) throw new SiteScanError(429, 'A website scan is already running. Wait for it to finish.');
      let initial: URL;
      try { initial = allowedUrl(domain.includes('://') ? domain.trim() : `https://${domain.trim()}`); }
      catch (error) { if (error instanceof SiteScanError) throw error; throw new SiteScanError(400, 'Enter a valid public website domain.'); }
      // The user selects a website; arbitrary paths, queries and fragments do not
      // turn this endpoint into a general authenticated URL-fetching proxy.
      initial.pathname = '/'; initial.search = ''; initial.hash = '';
      active = true;
      const started = Date.now();
      const total = new AbortController();
      const totalTimer = setTimeout(() => total.abort(), totalTimeout);
      let bytes = 0;
      let redirects = 0;
      const warnings: string[] = [];
      type Policy = { info: SiteScan['robots']; parser?: ReturnType<typeof robotsParser>; delay?: number };
      const policies = new Map<string, Policy>();
      async function get(url: URL): Promise<SiteResponse> {
        return timed(async (signal) => {
          const addresses = await resolve(url.hostname);
          signal.throwIfAborted();
          if (!addresses.length || addresses.length > 100 || addresses.some((entry) => !publicAddress(entry.address, entry.family))) throw new SiteScanError(400, 'The website resolves to a private, reserved or unsupported IP address. The scan was blocked.');
          const chosen = addresses.find((entry) => entry.family === 4) || addresses[0];
          const remaining = maxBytes - bytes;
          if (remaining <= 0) throw overBudget(maxBytes);
          const response = await request({ url, ...chosen, signal, maxBytes: remaining });
          signal.throwIfAborted();
          bytes += response.body.length;
          if (bytes > maxBytes) throw overBudget(maxBytes);
          const encoding = header(response, 'content-encoding').trim().toLowerCase();
          if (encoding && encoding !== 'identity') {
            // Transfer bytes (above) count against the budget; decoding is capped separately.
            const decode = encoding === 'gzip' || encoding === 'x-gzip' ? gunzipSync : encoding === 'deflate' ? inflateSync : encoding === 'br' ? brotliDecompressSync : null;
            if (!decode) throw new SiteScanError(502, `The website returned an unsupported ${encoding.slice(0, 40)} encoding.`);
            let body: Buffer;
            try { body = decode(response.body, { maxOutputLength: DECODED_LIMIT }); }
            catch { throw new SiteScanError(502, 'The website returned an unreadable or oversized compressed response.'); }
            const headers = { ...response.headers };
            for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-encoding') delete headers[key];
            return { ...response, headers, body };
          }
          return response;
        }, requestTimeout, total.signal);
      }
      function redirect(response: SiteResponse, current: URL): URL | undefined {
        if (![301, 302, 303, 307, 308].includes(response.status)) return;
        if (++redirects > REDIRECT_LIMIT) throw new SiteScanError(502, 'The website exceeded the three-redirect scan limit.');
        const location = header(response, 'location');
        if (!location || location.length > 2048) throw new SiteScanError(502, 'The website returned an invalid redirect.');
        const target = allowedUrl(new URL(location, current));
        let path: string;
        try { path = decodeURIComponent(target.pathname); } catch { throw new SiteScanError(502, 'The website returned an invalid redirect path.'); }
        if (ACTION_PATH.test(path)) throw new SiteScanError(403, 'The website redirects to a sign-in, account or action URL. Only public content pages are inspected.');
        return target;
      }
      async function policyFor(target: URL): Promise<Policy> {
        const cached = policies.get(target.origin);
        if (cached) return cached;
        const originalRobots = new URL('/robots.txt', target);
        let robotsUrl = originalRobots;
        let response: SiteResponse;
        while (true) {
          response = await get(robotsUrl);
          const next = redirect(response, robotsUrl);
          if (!next) break;
          robotsUrl = next;
        }
        let policy: Policy;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          warnings.push(`robots.txt returned HTTP ${response.status}; no robots rules were available for ${target.hostname}.`);
          policy = { info: { url: originalRobots.href, status: response.status, allowed: true, sitemaps: [] } };
        } else if (response.status < 200 || response.status >= 300) {
          throw new SiteScanError(response.status === 429 ? 429 : 502, `robots.txt returned HTTP ${response.status}; the homepage was not fetched because its crawl policy could not be checked.`);
        } else {
          const contentType = header(response, 'content-type').split(';')[0].trim().toLowerCase();
          if (contentType && contentType !== 'text/plain') throw new SiteScanError(502, 'robots.txt did not return plain text; the homepage was not fetched because its crawl policy could not be checked.');
          const text = response.body.toString('utf8');
          if (/^\s*<(?:!doctype|html)/i.test(text)) throw new SiteScanError(502, 'robots.txt returned HTML instead of crawl rules.');
          const parser = robotsParser(originalRobots.href, text);
          const sitemaps = parser.getSitemaps().slice(0, 30).map((value) => visibleUrl(value, originalRobots)).filter(Boolean);
          policy = { info: { url: originalRobots.href, status: response.status, allowed: null, sitemaps }, parser, delay: parser.getCrawlDelay(ROBOT_NAME) };
        }
        policies.set(target.origin, policy);
        return policy;
      }
      try {
        let current = initial;
        let response: SiteResponse;
        let robots: SiteScan['robots'];
        while (true) {
          const policy = await policyFor(current);
          const allowed = policy.parser?.isAllowed(current.href, ROBOT_NAME) ?? policy.info.allowed ?? true;
          robots = { ...policy.info, allowed };
          if (!allowed) throw new SiteScanError(403, 'This website’s robots.txt disallows the selected page for WaypointSEO. The page was not fetched.');
          if (policy.delay && policy.delay > 0) {
            // This scanner only requests one page per origin. Honor a declared
            // delay after fetching robots, without keeping a long-lived crawler.
            if (policy.delay * 1000 > Math.min(requestTimeout, totalTimeout - (Date.now() - started))) throw new SiteScanError(429, 'This website requests a crawl delay longer than the bounded scan can honor.');
            await timed((signal) => new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, policy.delay! * 1000);
              signal.addEventListener('abort', () => { clearTimeout(timer); reject(new SiteScanError(504, 'The website scan timed out.')); }, { once: true });
            }), requestTimeout, total.signal);
          }
          response = await get(current);
          const next = redirect(response, current);
          if (!next) break;
          current = next;
        }
        if (response.status < 200 || response.status >= 300) throw new SiteScanError(response.status === 429 ? 429 : 502, `The website returned HTTP ${response.status}; no page metrics were generated.`);
        const contentType = header(response, 'content-type').split(';')[0].trim().toLowerCase();
        if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') throw new SiteScanError(415, 'The website did not return an HTML page.');
        const parsed = inspectHtml(response.body.toString('utf8'), current, response);
        if (current.href !== initial.href) warnings.push(`The homepage redirected to ${current.href}.`);
        warnings.push(...parsed.parsingWarnings);
        type PageCheck = NonNullable<SiteScan['pageChecks']>[number];
        const pageRecord = (url: URL, status: number | null, page: ReturnType<typeof inspectHtml>, ms: number, depth: number | undefined, source: PageCheck['source']): PageCheck => ({
          url: url.href, status, title: page.title, description: page.description,
          h1Count: page.headings.filter((heading) => heading.level === 1).length, responseMs: ms, score: page.audit.score,
          depth, wordCount: page.wordCount, canonical: page.canonical, noindex: page.noindex, missingAlt: page.images.missingAlt,
          internalLinks: page.internalLinks.length, source,
        });
        const pageChecks: PageCheck[] = [pageRecord(current, response.status, parsed, Date.now() - started, 0, 'home')];
        const linkedFrom = new Map<string, number>();
        const countLinks = (links: { url: string }[]) => { for (const link of new Set(links.map((entry) => entry.url))) linkedFrom.set(link, (linkedFrom.get(link) || 0) + 1); };
        countLinks(parsed.internalLinks);
        // Breadth-first crawl of static-looking same-origin pages. No query
        // strings, form submissions, assets or account/action routes.
        const eligible = (url: URL) => {
          if (url.origin !== current.origin || url.search) return false;
          let path: string;
          try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return false; }
          return !ACTION_PATH.test(path) && !path.startsWith('/cdn-cgi/') &&
            !/\.(?:avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|mjs|mp3|mp4|pdf|png|rar|svg|tar|tif|ttf|txt|webm|webp|woff2?|xml|zip)$/i.test(path);
        };
        const visited = new Set<string>([current.href, initial.href]);
        const queue: { url: URL; depth: number }[] = [];
        const enqueue = (links: { url: string }[], depth: number) => {
          for (const link of links) {
            if (queue.length >= 500) return;
            const url = new URL(link.url);
            if (!visited.has(url.href) && eligible(url)) { visited.add(url.href); queue.push({ url, depth }); }
          }
        };
        enqueue(parsed.internalLinks, 1);
        // Sitemap discovery: pages that nothing links to are often the forgotten or
        // broken ones. Same host only, bounded files, URLs and bytes.
        const sitemap: NonNullable<SiteScan['sitemap']> = { urls: 0, sources: [], error: null };
        const sitemapUrls = new Set<string>();
        const declared = (policies.get(current.origin)?.info.sitemaps || []).filter((value) => { try { return new URL(value).hostname === current.hostname; } catch { return false; } });
        const sitemapQueue = declared.length ? declared.slice(0, 5) : [new URL('/sitemap.xml', current).href];
        for (let fetched = 0; sitemapQueue.length && fetched < 6 && sitemapUrls.size < 5000 && bytes < maxBytes / 2 && !total.signal.aborted; fetched++) {
          let sitemapUrl: URL;
          try { sitemapUrl = allowedUrl(sitemapQueue.shift()!); } catch { continue; }
          if (sitemapUrl.hostname !== current.hostname) continue;
          try {
            const policy = await policyFor(sitemapUrl);
            if (!(policy.parser?.isAllowed(sitemapUrl.href, ROBOT_NAME) ?? true)) continue;
            let sitemapResponse = await get(sitemapUrl);
            const moved = redirect(sitemapResponse, sitemapUrl);
            redirects = 0;
            if (moved && moved.hostname === current.hostname) { sitemapUrl = moved; sitemapResponse = await get(moved); }
            if (sitemapResponse.status !== 200) { if (declared.length) sitemap.error = `${sitemapUrl.pathname} returned HTTP ${sitemapResponse.status}.`; continue; }
            let body = sitemapResponse.body;
            if (/\.gz$/i.test(sitemapUrl.pathname) || /gzip/i.test(header(sitemapResponse, 'content-type'))) {
              try { body = gunzipSync(body, { maxOutputLength: DECODED_LIMIT }); } catch { sitemap.error = `${sitemapUrl.pathname} is not a readable gzip sitemap.`; continue; }
            }
            const text = body.toString('utf8');
            if (!/<(?:urlset|sitemapindex)\b/i.test(text)) { if (declared.length) sitemap.error = `${sitemapUrl.pathname} is not an XML sitemap.`; continue; }
            const locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)].slice(0, 50_000).map((match) => match[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
            sitemap.sources.push(sitemapUrl.href);
            if (/<sitemapindex\b/i.test(text)) { sitemapQueue.push(...locs.slice(0, 10)); continue; }
            for (const loc of locs) {
              if (sitemapUrls.size >= 5000) break;
              const href = visibleUrl(loc, sitemapUrl);
              if (href && new URL(href).hostname === current.hostname) sitemapUrls.add(href);
            }
          } catch (error) {
            redirects = 0;
            if (error instanceof SiteScanError && (error.status === 413 || error.status === 504)) break;
            if (declared.length) sitemap.error = error instanceof SiteScanError ? error.message : 'The sitemap could not be read.';
          }
        }
        sitemap.urls = sitemapUrls.size;
        const inSitemap = (url: string) => sitemapUrls.has(url) || sitemapUrls.has(url.endsWith('/') ? url.slice(0, -1) : `${url}/`);
        const sitemapOnly: URL[] = [];
        for (const href of sitemapUrls) { const url = new URL(href); if (eligible(url)) sitemapOnly.push(url); }
        const nextPage = (): { url: URL; depth?: number; source: 'link' | 'sitemap' } | undefined => {
          const fromSitemap = () => { while (sitemapOnly.length) { const url = sitemapOnly.shift()!; if (!visited.has(url.href)) { visited.add(url.href); return { url, source: 'sitemap' as const }; } } return undefined; };
          if (!queue.length || pageChecks.length % 5 === 4) { const page = fromSitemap(); if (page) return page; }
          const link = queue.shift();
          return link ? { ...link, source: 'link' } : fromSitemap();
        };
        let next: ReturnType<typeof nextPage>;
        while (pageChecks.length < maxPages && !total.signal.aborted && bytes < maxBytes && (next = nextPage())) {
          const { url: candidate, depth, source } = next;
          const pageStarted = Date.now();
          let pageUrl = candidate;
          let pageStatus: number | null = null;
          redirects = 0; // The redirect limit applies to each page's own chain.
          try {
            let pageResponse: SiteResponse;
            while (true) {
              const policy = await policyFor(pageUrl);
              if (!(policy.parser?.isAllowed(pageUrl.href, ROBOT_NAME) ?? policy.info.allowed ?? true)) throw new SiteScanError(403, 'robots.txt disallows this linked page.');
              if (policy.delay && policy.delay > 0) {
                if (policy.delay * 1000 > Math.min(requestTimeout, totalTimeout - (Date.now() - started))) throw new SiteScanError(429, 'The declared crawl delay exceeds the remaining scan time.');
                await timed((signal) => new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(resolve, policy.delay! * 1000);
                  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new SiteScanError(504, 'The website scan timed out.')); }, { once: true });
                }), requestTimeout, total.signal);
              }
              pageResponse = await get(pageUrl);
              pageStatus = pageResponse.status;
              const next = redirect(pageResponse, pageUrl);
              if (!next) break;
              if (next.origin !== current.origin) throw new SiteScanError(400, 'The linked page redirects outside the homepage origin; it was not followed.');
              pageUrl = next;
            }
            if (pageResponse.status < 200 || pageResponse.status >= 300) throw new SiteScanError(502, `HTTP ${pageResponse.status}`);
            const type = header(pageResponse, 'content-type').split(';')[0].trim().toLowerCase();
            if (type !== 'text/html' && type !== 'application/xhtml+xml') throw new SiteScanError(415, 'The linked URL did not return HTML.');
            const page = inspectHtml(pageResponse.body.toString('utf8'), pageUrl, pageResponse);
            pageChecks.push(pageRecord(pageUrl, pageStatus, page, Date.now() - pageStarted, depth, source));
            countLinks(page.internalLinks);
            enqueue(page.internalLinks, (depth ?? 1) + 1);
          } catch (error) {
            // Running out of the download budget or time is a crawl limit, not a page problem.
            if (error instanceof SiteScanError && (error.status === 413 || error.status === 504) || total.signal.aborted) {
              warnings.push(`The crawl stopped after ${pageChecks.length} pages because it reached its ${error instanceof SiteScanError && error.status === 413 ? 'download size' : 'time'} limit. Unchecked pages are not counted as issues.`);
              break;
            }
            const message = error instanceof SiteScanError ? error.message : 'The linked page could not be reached securely.';
            pageChecks.push({ url: pageUrl.href, status: pageStatus, title: '', description: '', h1Count: 0, responseMs: Date.now() - pageStarted, score: null, error: message, depth, source });
            warnings.push(`${pageStatus === 404 || pageStatus === 410 ? 'Broken internal link' : 'Linked page check incomplete'}: ${pageUrl.href} (${message}).`);
            if (total.signal.aborted || bytes >= maxBytes) break;
          }
        }
        if ((queue.length || sitemapOnly.some((url) => !visited.has(url.href))) && pageChecks.length >= maxPages) warnings.push(`The crawl stopped at its ${maxPages}-page limit; more linked or sitemap pages were not checked.`);
        for (const page of pageChecks) { page.inlinks = linkedFrom.get(page.url) || 0; if (sitemap.urls) page.inSitemap = inSitemap(page.url); }
        for (const field of ['title', 'description'] as const) {
          const seen = new Map<string, string>();
          for (const page of pageChecks.filter((check) => !check.error)) {
            const key = page[field].toLowerCase().trim();
            if (!key) continue;
            if (seen.has(key)) warnings.push(`Duplicate ${field === 'title' ? 'title' : 'meta description'} among checked pages: ${seen.get(key)} and ${page.url}.`);
            else seen.set(key, page.url);
          }
        }
        const pageIssues = findPageIssues(pageChecks);
        // llms.txt is optional guidance for AI tools. A missing or unreadable
        // file never fails the scan.
        let llms: NonNullable<SiteScan['llms']> = { url: new URL('/llms.txt', current).href, status: null, found: false, lines: 0, links: 0 };
        if (!total.signal.aborted && bytes < maxBytes) {
          try {
            const llmsUrl = new URL('/llms.txt', current);
            const policy = await policyFor(llmsUrl);
            if (policy.parser?.isAllowed(llmsUrl.href, ROBOT_NAME) ?? true) {
              const llmsResponse = await get(llmsUrl);
              const type = header(llmsResponse, 'content-type').split(';')[0].trim().toLowerCase();
              const text = llmsResponse.body.toString('utf8');
              const found = llmsResponse.status === 200 && (!type || /^text\/(?:plain|markdown|x-markdown)$/.test(type)) && !/^\s*<(?:!doctype|html)/i.test(text);
              llms = { url: llmsUrl.href, status: llmsResponse.status, found, lines: found ? text.split(/\r?\n/).filter((line) => line.trim()).length : 0, links: found ? (text.match(/\]\(https?:\/\//g) || []).length : 0 };
            }
          } catch { /* optional file */ }
        }
        const homePolicy = policies.get(current.origin);
        const ai = assessAiReadiness({
          robotsFound: Boolean(homePolicy?.parser), isAllowed: (agent) => homePolicy?.parser?.isAllowed(current.href, agent) ?? true,
          signals: parsed.signals, structuredDataTypes: parsed.structuredDataTypes, wordCount: parsed.wordCount, description: parsed.description,
          openGraph: parsed.openGraph, canonical: parsed.canonical, language: parsed.language, noindex: parsed.noindex,
          sitemaps: homePolicy?.info.sitemaps.length ? homePolicy.info.sitemaps : sitemap.sources, llms, h1Count: pageChecks[0].h1Count,
        });
        const { parsingWarnings: _, signals: _signals, noindex: _noindex, speed: homeSpeed, ...fields } = parsed;
        const responseTimes = pageChecks.slice(1).filter((page) => !page.error).map((page) => page.responseMs);
        const speed: NonNullable<SiteScan['speed']> = { ...homeSpeed, avgResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null, slowestPage: pageChecks.slice(1).filter((page) => !page.error).sort((a, b) => b.responseMs - a.responseMs)[0]?.url || null };
        return {
          domain: initial.hostname.replace(/^www\./, ''), requestedUrl: initial.href, finalUrl: current.href,
          scannedAt: new Date().toISOString(), status: response.status, responseMs: Date.now() - started, bytes,
          ...fields, pageChecks, pageIssues, ai, llms, speed, sitemap, warnings, robots: robots!,
          disclosure: `Live public HTML inspection of the homepage and up to ${maxPages - 1} static-looking same-origin linked pages (breadth-first), respecting robots.txt. No JavaScript, assets, forms or login pages were executed. Topics are homepage word frequencies, not search demand, rankings or search volume. Links are links found on the homepage, not an inbound backlink index. Broken-link and duplicate checks cover only the listed pages; this is a bounded crawl, not a complete site crawl. AI-search readiness reads robots rules, llms.txt and homepage markup; it does not query AI engines. The checklist score describes fetched markup, not ranking. Response bytes include robots, redirects and checked pages; link previews and structured-data traversal are bounded.`,
        };
      } catch (error) {
        if (error instanceof SiteScanError) throw error;
        if (total.signal.aborted || (error as { name?: string }).name === 'AbortError') throw new SiteScanError(504, 'The website scan timed out. Try again later.');
        throw new SiteScanError(502, 'The public website could not be reached securely. Check its domain, HTTPS certificate and availability.');
      } finally { clearTimeout(totalTimer); total.abort(); active = false; }
    },
  };
}
