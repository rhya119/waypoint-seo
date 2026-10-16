import { keywordIdeasInput, pageSpeedInput, type KeywordIdea, type KeywordIdeasInput, type KeywordIdeasResult, type PageSpeedInput, type PageSpeedResult } from '../shared/research.js';

export class ResearchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const maxBytes = 6 * 1024 * 1024;
async function readBounded(response: Response, limit = maxBytes): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel().catch(() => undefined); throw new ResearchError(502, 'The provider returned a response larger than the supported limit.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const metric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Google PageSpeed Insights v5 (Lighthouse lab data + Chrome UX Report field data).
 * Works without a key at a low shared quota; PAGESPEED_API_KEY raises it. */
export function createPageSpeedProvider(options: { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const fetcher = options.fetch || fetch;
  const key = options.apiKey?.trim();
  let active = 0;
  return {
    status: () => ({ provider: 'google-pagespeed-insights', configured: true, keyed: Boolean(key), notes: ['Free Google API. Without PAGESPEED_API_KEY, Google applies a small shared quota and may ask you to retry later.'] }),
    async run(input: PageSpeedInput, url: string): Promise<PageSpeedResult> {
      const { domain, strategy } = pageSpeedInput.parse(input);
      if (active >= 2) throw new ResearchError(429, 'Two speed tests are already running. Wait for them to finish.');
      const query = new URLSearchParams({ url, strategy, category: 'performance' });
      if (key) query.set('key', key);
      active++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
      try {
        let response: Response;
        try { response = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } }); }
        catch { throw new ResearchError(504, 'Google PageSpeed Insights did not respond in time. Try again shortly.'); }
        const text = await readBounded(response);
        if (response.status === 429) throw new ResearchError(429, key ? 'Your PageSpeed Insights quota is used up. Try again later.' : 'Google’s free shared PageSpeed quota is busy. Try again in a minute, or add a free PAGESPEED_API_KEY to .env for your own quota.');
        if (!response.ok) {
          let message = '';
          try { message = String(record(record(JSON.parse(text)).error).message || ''); } catch { /* not JSON */ }
          throw new ResearchError(response.status === 400 ? 400 : 502, /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|NOT_HTML/.test(message) ? 'Google could not load the page to test it. Check the site is public and responding.' : 'Google PageSpeed Insights could not test this page.');
        }
        let data: Record<string, unknown>;
        try { data = record(JSON.parse(text)); } catch { throw new ResearchError(502, 'PageSpeed Insights returned an unreadable response.'); }
        const lighthouse = record(data.lighthouseResult);
        const audits = record(lighthouse.audits);
        const audit = (id: string) => metric(record(audits[id]).numericValue);
        const performance = metric(record(record(lighthouse.categories).performance).score);
        const experience = record(data.loadingExperience);
        const originExperience = record(data.originLoadingExperience);
        const fieldSource = Object.keys(record(experience.metrics)).length ? experience : Object.keys(record(originExperience.metrics)).length ? originExperience : null;
        const percentile = (name: string) => fieldSource ? metric(record(record(fieldSource.metrics)[name]).percentile) : null;
        const fieldCls = percentile('CUMULATIVE_LAYOUT_SHIFT_SCORE');
        const opportunities = Object.values(audits).map(record)
          .filter((entry) => record(entry.details).type === 'opportunity' && typeof entry.score === 'number' && entry.score < 0.9)
          .map((entry) => ({ title: String(entry.title || '').slice(0, 200), savingsMs: Math.round(metric(record(entry.details).overallSavingsMs) || 0) }))
          .filter((entry) => entry.title && entry.savingsMs > 0)
          .sort((a, b) => b.savingsMs - a.savingsMs).slice(0, 6);
        return {
          domain, url: String(lighthouse.finalDisplayedUrl || lighthouse.finalUrl || url).slice(0, 2048), strategy, fetchedAt: new Date().toISOString(),
          score: performance === null ? null : Math.round(performance * 100),
          lab: { lcpMs: audit('largest-contentful-paint'), cls: audit('cumulative-layout-shift'), tbtMs: audit('total-blocking-time'), fcpMs: audit('first-contentful-paint'), speedIndexMs: audit('speed-index'), ttfbMs: audit('server-response-time') },
          field: fieldSource ? { lcpMs: percentile('LARGEST_CONTENTFUL_PAINT_MS'), inpMs: percentile('INTERACTION_TO_NEXT_PAINT'), cls: fieldCls === null ? null : fieldCls / 100, overall: typeof fieldSource.overall_category === 'string' ? fieldSource.overall_category : null, origin: fieldSource === originExperience } : null,
          opportunities,
          source: 'Google PageSpeed Insights (Lighthouse lab test; Chrome UX Report field data when available)',
        };
      } finally { clearTimeout(timer); active--; }
    },
  };
}
export type PageSpeedProvider = ReturnType<typeof createPageSpeedProvider>;

const modifiers: { prefix?: string; suffix?: string }[] = [
  {}, { prefix: 'how to' }, { prefix: 'what is' }, { prefix: 'why' }, { prefix: 'best' }, { prefix: 'cheap' },
  { suffix: 'vs' }, { suffix: 'for' }, { suffix: 'near me' }, { suffix: 'price' }, { suffix: 'ideas' }, { suffix: 'online' },
];
export function groupIdea(phrase: string): KeywordIdea['group'] {
  if (/^(?:how|what|why|when|where|which|who|can|is|are|does|do|should)\b|\?$/.test(phrase)) return 'Questions';
  if (/\b(?:vs|versus|or|alternative|alternatives|compared|comparison)\b/.test(phrase)) return 'Comparisons';
  if (/\b(?:near me|nearby|in [a-z]+|nz|new zealand|auckland|wellington|christchurch|colombo|kandy|sri lanka|australia|sydney|melbourne|uk|london|usa|india|indonesia|malaysia|singapore|canada|dubai)\b/.test(phrase)) return 'Local';
  if (/\b(?:best|buy|price|prices|cost|cheap|sale|deal|deals|discount|online|shop|store|review|reviews|top)\b/.test(phrase)) return 'Buying';
  return 'Related';
}

/** Keyword ideas from Google Autocomplete: phrases people actually start typing.
 * There is no search-volume data here; ideas are sampled on explicit request only. */
export function createKeywordIdeas(options: { fetch?: typeof fetch; delayMs?: number } = {}) {
  const fetcher = options.fetch || fetch;
  const cache = new Map<string, { at: number; result: KeywordIdeasResult }>();
  let active = false;
  return {
    async ideas(input: KeywordIdeasInput): Promise<KeywordIdeasResult> {
      const { seed, country, language } = keywordIdeasInput.parse(input);
      const base = seed.toLowerCase().replace(/\s+/g, ' ');
      const cacheKey = `${base}|${country}|${language}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.at < 86_400_000) return cached.result;
      if (active) throw new ResearchError(429, 'Keyword ideas are already loading. Wait a moment.');
      active = true;
      const seen = new Map<string, KeywordIdea>();
      let failures = 0;
      try {
        for (const modifier of modifiers) {
          const q = [modifier.prefix, base, modifier.suffix].filter(Boolean).join(' ');
          const params = new URLSearchParams({ client: 'firefox', q, hl: language.toLowerCase(), gl: country.toLowerCase(), ie: 'utf-8', oe: 'utf-8' });
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const response = await fetcher(`https://suggestqueries.google.com/complete/search?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } }).finally(() => clearTimeout(timer));
            if (!response.ok) { failures++; if (response.status === 429) break; continue; }
            const parsed = JSON.parse(await readBounded(response, 200_000)) as unknown;
            const list = Array.isArray(parsed) && Array.isArray(parsed[1]) ? parsed[1] : [];
            for (const value of list.slice(0, 20)) {
              if (typeof value !== 'string') continue;
              const phrase = value.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 150);
              if (phrase.length < 2 || phrase === base || seen.has(phrase)) continue;
              seen.set(phrase, { phrase, group: groupIdea(phrase), source: q });
            }
          } catch { failures++; }
          if (options.delayMs !== 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 150));
        }
      } finally { active = false; }
      if (!seen.size && failures) throw new ResearchError(502, 'Google Autocomplete did not return suggestions. Try again later.');
      const result: KeywordIdeasResult = {
        seed: base, country: country.toLowerCase(), language: language.toLowerCase(), fetchedAt: new Date().toISOString(), ideas: [...seen.values()].slice(0, 200),
        disclosure: 'Phrases sampled from Google Autocomplete for this country and language. They show what people start typing, not search volume, difficulty or ranking.',
      };
      cache.set(cacheKey, { at: Date.now(), result });
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      return result;
    },
  };
}
export type KeywordIdeasProvider = ReturnType<typeof createKeywordIdeas>;
