import { trafficEstimateInput, type TrafficEstimateInput, type TrafficEstimateReport, type TrafficEstimateStatus } from '../shared/traffic-estimates.js';
import { dateSchema } from '../shared/performance.js';

export class TrafficEstimateError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const maxBytes = 1024 * 1024;
const disclosure = 'Third-party monthly estimates from Similarweb, worldwide (WW), across all traffic channels. These are not exact first-party visits or organic-search traffic. Coverage and accuracy vary by website; missing months and metrics remain unavailable. Bounce rate is a fraction from 0 to 1. Provider subscription access and usage charges may apply.';

async function readBoundedJson(response: Response): Promise<unknown> {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new TrafficEstimateError(502, 'The traffic provider returned a response larger than the supported limit.');
  }
  if (!response.body) throw new TrafficEstimateError(502, 'The traffic provider returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new TrafficEstimateError(502, 'The traffic provider returned a response larger than the supported limit.');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally { reader.releaseLock(); }
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finiteMetric = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;

export function createTrafficEstimateProvider(options: { apiKey?: string; fetch?: typeof fetch } = {}) {
  const key = options.apiKey?.trim();
  const fetcher = options.fetch || fetch;
  let active = false;
  let lastRequest = -Infinity;

  return {
    status(): TrafficEstimateStatus {
      return {
        provider: 'similarweb', configured: Boolean(key), requiredEnv: ['SIMILARWEB_API_KEY'],
        notes: [
          'Optional third-party traffic estimates for domains covered by Similarweb; this does not unlock private analytics.',
          'A Similarweb subscription with API access is required. Provider usage charges may apply; pull only when explicitly requested.',
          'Monthly worldwide visits, bounce rate and pages per visit. No organic-only traffic, keyword volumes or daily estimates are inferred.',
        ],
      };
    },
    async pull(input: TrafficEstimateInput): Promise<TrafficEstimateReport> {
      const parameters = trafficEstimateInput.parse(input);
      if (!key) throw new TrafficEstimateError(503, 'Configure SIMILARWEB_API_KEY on the server and restart to enable optional Similarweb estimates. A subscription with API access is required.');
      if (active || Date.now() - lastRequest < 10000) throw new TrafficEstimateError(429, 'Please wait at least 10 seconds before another traffic-estimate request.');
      active = true;
      lastRequest = Date.now();
      try {
        const url = new URL('https://api.similarweb.com/v5/website-analysis/websites/traffic-and-engagement');
        url.search = new URLSearchParams({
          domain: parameters.domain, metrics: 'visits,bounce_rate,pages_per_visit', granularity: 'monthly',
          start_date: parameters.from, end_date: parameters.to, country: 'WW',
        }).toString();
        const response = await fetcher(url, {
          method: 'GET', headers: { 'api-key': key, accept: 'application/json' },
          redirect: 'error', signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          if (response.status === 401 || response.status === 403) throw new TrafficEstimateError(response.status, 'Similarweb rejected access. Check the server API key and your subscription permissions.');
          if (response.status === 429) throw new TrafficEstimateError(429, 'Similarweb rate or usage limit reached. Check your provider account before trying again.');
          throw new TrafficEstimateError(502, 'Similarweb could not provide estimates. Check provider availability, website coverage and your subscription.');
        }
        const body = object(await readBoundedJson(response));
        const meta = object(body?.meta);
        if (meta?.status !== 'Success' || !Array.isArray(body?.data) || body.data.length > 12) throw new TrafficEstimateError(502, 'Similarweb returned an unsupported response. No estimates were saved.');
        const seen = new Set<string>();
        const series = body.data.map((value: unknown) => {
          const row = object(value);
          const date = dateSchema.safeParse(row?.date);
          if (!date.success || !date.data.endsWith('-01') || date.data < parameters.from || date.data > parameters.to || seen.has(date.data)) throw new TrafficEstimateError(502, 'Similarweb returned invalid monthly coverage. No estimates were saved.');
          seen.add(date.data);
          return { date: date.data, visits: finiteMetric(row?.visits), bounceRate: finiteMetric(row?.bounce_rate, 1), pagesPerVisit: finiteMetric(row?.pages_per_visit) };
        }).sort((a, b) => a.date.localeCompare(b.date));
        const updated = dateSchema.safeParse(meta.last_updated);
        const unavailable = !series.length ? ' No estimate coverage was returned for this domain and period.' : series.every(row => row.visits === null && row.bounceRate === null && row.pagesPerVisit === null) ? ' The provider returned months but no usable traffic metrics.' : '';
        return {
          provider: 'similarweb', basis: 'third-party-estimate', ...parameters, granularity: 'monthly', country: 'WW',
          collectedAt: new Date().toISOString(), updatedAt: updated.success ? updated.data : null, series,
          disclosure: disclosure + unavailable,
        };
      } catch (error) {
        if (error instanceof TrafficEstimateError) throw error;
        throw new TrafficEstimateError(502, 'Could not retrieve Similarweb estimates. Check connectivity, provider availability and the server configuration.');
      } finally { active = false; }
    },
  };
}

export type TrafficEstimateProvider = ReturnType<typeof createTrafficEstimateProvider>;
