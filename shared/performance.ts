import { z } from 'zod';
export const platforms = ['youtube', 'instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'pinterest', 'threads'] as const;
export const platformSchema = z.enum(platforms);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Use a valid calendar date.');
const metric = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null);
export const metricsSchema = z.object({ views: metric, impressions: metric, clicks: metric, likes: metric, comments: metric, shares: metric, saves: metric });
export type Metrics = z.infer<typeof metricsSchema>;
export const metricKeys = ['views', 'impressions', 'clicks', 'likes', 'comments', 'shares', 'saves'] as const;
export type MetricKey = typeof metricKeys[number];
export const postRowSchema = metricsSchema.extend({
  platform: platformSchema, account: z.string().trim().min(1).max(100), content_id: z.string().trim().min(1).max(200),
  date: dateSchema, published_at: dateSchema, title: z.string().trim().min(1).max(500),
  caption: z.string().max(10000).default(''), keywords: z.string().max(1000).default(''),
  format: z.string().trim().min(1).max(50), ownership: z.enum(['owned', 'competitor']),
  url: z.string().max(2048).refine(value => { if (!value) return true; try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }, 'Use an HTTP(S) content URL or leave blank.').default(''),
}).refine(row => metricKeys.some(key => row[key] !== null), 'At least one metric must be supplied.');
export const queryRowSchema = z.object({
  platform: platformSchema, account: z.string().trim().min(1).max(100), date: dateSchema,
  keyword: z.string().trim().min(1).max(200), views: metric, impressions: metric, clicks: metric,
}).refine(row => [row.views, row.impressions, row.clicks].some(value => value !== null), 'At least one metric must be supplied.');
export type PostRow = z.infer<typeof postRowSchema>;
export type QueryRow = z.infer<typeof queryRowSchema>;
export const performanceFilters = z.object({
  dataset: z.enum(['imported', 'example']).default('imported'), platform: z.union([platformSchema, z.literal('all')]).default('all'),
  from: dateSchema.optional(), to: dateSchema.optional(), keyword: z.string().trim().max(200).default(''),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'Start date must be before end date.');
export type PerformanceFilters = z.infer<typeof performanceFilters>;
export type ContentSummary = Omit<PostRow, 'date'> & { days: number; engagementRate: number | null; metricCoverage: number; };
export type KeywordSummary = { keyword: string; views: number | null; impressions: number | null; clicks: number | null; ctr: number | null; platforms: string[]; observations: number; history: { date: string; clicks: number | null }[] };
export type Performance = {
  dataset: 'imported' | 'example'; filters: PerformanceFilters; totals: Metrics; previousTotals: Metrics;
  period: { from: string | null; to: string | null; previousFrom: string | null; previousTo: string | null };
  posts: ContentSummary[]; queries: KeywordSummary[];
  topics: { keyword: string; posts: number; views: number | null; engagementRate: number | null }[];
  series: ({ date: string } & Metrics)[];
  accounts: { account: string; platform: string; ownership: string; posts: number; views: number | null; engagementRate: number | null }[];
  formats: { format: string; posts: number; views: number | null; medianViews: number | null }[];
  coverage: { contentRows: number; queryRows: number; accounts: number; dates: number; importedAt: string | null; metrics: Record<MetricKey, number> };
  comparison: { expectedDays: number; currentDays: number; previousDays: number; metricComparable: Record<MetricKey, boolean> };
  disclosure: string;
};
export type ImportPreview = { kind: 'content' | 'queries'; valid: boolean; rows: number; errors: { row: number; message: string }[]; preview: Record<string, unknown>[] };
export type SimilarContent = { reference: ContentSummary; matches: (ContentSummary & { similarity: number; sharedTerms: string[]; viewsDifference: number | null })[]; method: string };
export type YouTubeResearch = { source: 'youtube-data-api'; keyword: string; collectedAt: string; results: { id: string; title: string; channel: string; publishedAt: string; views: number | null; likes: number | null; comments: number | null; daysOld: number; viewsPerDay: number | null; url: string }[]; disclosure: string };
