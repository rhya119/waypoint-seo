import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';
import { auditHtml } from './audit.js';
import type { SiteScan } from '../shared/site-scan.js';

export type { SiteScan } from '../shared/site-scan.js';
export class SiteScanError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const USER_AGENT = 'WaypointSEO/0.5 (+https://github.com/rhya119/waypoint-seo; single-page SEO inspection)';
const ROBOT_NAME = 'WaypointSEO';
const BYTE_LIMIT = 1_500_000;
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
      headers: { Host: input.url.host, 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9', 'Accept-Encoding': 'identity', Connection: 'close' },
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      const length = Number(res.headers['content-length']);
      if (Number.isFinite(length) && length > input.maxBytes) {
        const error = new SiteScanError(413, 'Website responses exceed the 1.5 MB scan limit.');
        reject(error); res.destroy(); req.destroy(error); return;
      }
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > input.maxBytes) {
          const error = new SiteScanError(413, 'Website responses exceed the 1.5 MB scan limit.');
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
    audit,
    parsingWarnings: [
      ...(malformedJson ? ['Some JSON-LD could not be parsed. No structured data was executed.'] : []),
      ...(words.length < 50 && $('script').length ? ['The fetched HTML contains little readable text. Content loaded by JavaScript is not rendered in this scan.'] : []),
      ...($('a[href]').length > 400 ? ['Link previews are capped at 200 internal and 200 external URLs.'] : []),
    ],
  };
}

export function createSiteScanner(options: SiteScannerOptions = {}) {
  const resolve = options.resolve || (async (hostname: string) => (await lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({ address, family: family as 4 | 6 })));
  const request = options.request || requestPinned;
  const requestTimeout = Math.max(1, Math.min(10_000, options.requestTimeoutMs ?? 10_000));
  const totalTimeout = Math.max(1, Math.min(30_000, options.totalTimeoutMs ?? 30_000));
  const maxBytes = Math.max(1, Math.min(BYTE_LIMIT, options.maxBytes ?? BYTE_LIMIT));
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
          if (remaining <= 0) throw new SiteScanError(413, 'Website responses exceed the 1.5 MB scan limit.');
          const response = await request({ url, ...chosen, signal, maxBytes: remaining });
          signal.throwIfAborted();
          bytes += response.body.length;
          if (bytes > maxBytes) throw new SiteScanError(413, 'Website responses exceed the 1.5 MB scan limit.');
          if (header(response, 'content-encoding') && !/^identity$/i.test(header(response, 'content-encoding'))) throw new SiteScanError(502, 'The website returned compressed content despite an identity encoding request. This scan cannot read that response.');
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
        const pageChecks: NonNullable<SiteScan['pageChecks']> = [{
          url: current.href, status: response.status, title: parsed.title, description: parsed.description,
          h1Count: parsed.headings.filter((heading) => heading.level === 1).length,
          responseMs: Date.now() - started, score: parsed.audit.score,
        }];
        // Inspect at most two additional static-looking same-origin pages. No
        // query strings, form submissions, assets or account/action routes.
        const candidates = parsed.internalLinks.map((link) => new URL(link.url)).filter((url) => {
          if (url.origin !== current.origin || url.search || url.href === current.href) return false;
          let path: string;
          try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return false; }
          return !ACTION_PATH.test(path) &&
            !/\.(?:avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|mjs|mp3|mp4|pdf|png|rar|svg|tar|tif|ttf|txt|webm|webp|woff2?|xml|zip)$/i.test(path);
        }).slice(0, 2);
        for (const candidate of candidates) {
          const pageStarted = Date.now();
          let pageUrl = candidate;
          let pageStatus: number | null = null;
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
            pageChecks.push({ url: pageUrl.href, status: pageStatus, title: page.title, description: page.description, h1Count: page.headings.filter((heading) => heading.level === 1).length, responseMs: Date.now() - pageStarted, score: page.audit.score });
          } catch (error) {
            const message = error instanceof SiteScanError ? error.message : 'The linked page could not be reached securely.';
            pageChecks.push({ url: pageUrl.href, status: pageStatus, title: '', description: '', h1Count: 0, responseMs: Date.now() - pageStarted, score: null, error: message });
            warnings.push(`${pageStatus === 404 || pageStatus === 410 ? 'Broken internal link' : 'Linked page check incomplete'}: ${pageUrl.href} (${message}).`);
            if (total.signal.aborted || bytes >= maxBytes) break;
          }
        }
        for (const field of ['title', 'description'] as const) {
          const seen = new Map<string, string>();
          for (const page of pageChecks.filter((check) => !check.error)) {
            const key = page[field].toLowerCase().trim();
            if (!key) continue;
            if (seen.has(key)) warnings.push(`Duplicate ${field === 'title' ? 'title' : 'meta description'} among checked pages: ${seen.get(key)} and ${page.url}.`);
            else seen.set(key, page.url);
          }
        }
        const { parsingWarnings: _, ...fields } = parsed;
        return {
          domain: initial.hostname.replace(/^www\./, ''), requestedUrl: initial.href, finalUrl: current.href,
          scannedAt: new Date().toISOString(), status: response.status, responseMs: Date.now() - started, bytes,
          ...fields, pageChecks, warnings, robots: robots!,
          disclosure: 'Live public HTML inspection of the homepage and at most two static-looking same-origin linked pages, respecting robots.txt. No JavaScript, assets, forms or login pages were executed. Topics are homepage word frequencies, not search demand, rankings or search volume. Links are links found on the homepage, not an inbound backlink index. Broken-link and duplicate checks cover only the listed pages; this is not a complete site crawl. The checklist score describes fetched markup, not site-wide SEO or ranking. Response bytes include robots, redirects and checked pages; link previews and structured-data traversal are bounded.',
        };
      } catch (error) {
        if (error instanceof SiteScanError) throw error;
        if (total.signal.aborted || (error as { name?: string }).name === 'AbortError') throw new SiteScanError(504, 'The website scan timed out. Try again later.');
        throw new SiteScanError(502, 'The public website could not be reached securely. Check its domain, HTTPS certificate and availability.');
      } finally { clearTimeout(totalTimer); total.abort(); active = false; }
    },
  };
}
