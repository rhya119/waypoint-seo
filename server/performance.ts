import { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { postRowSchema, queryRowSchema, metricKeys, performanceFilters, type PostRow, type QueryRow, type Metrics, type MetricKey, type Performance, type PerformanceFilters, type ContentSummary, type ImportPreview, type SimilarContent } from '../shared/performance.js';
export class PerformanceError extends Error { constructor(public status: number, message: string) { super(message); } }
const emptyMetrics = (): Metrics => ({ views: null, impressions: null, clicks: null, likes: null, comments: null, shares: null, saves: null });
const sum = (values: (number | null)[]) => { const known = values.filter((v): v is number => v !== null); const value = known.reduce((a, b) => a + b, 0); if (!Number.isSafeInteger(value)) throw new PerformanceError(400, 'Metric totals exceed safe integer precision. Split the dataset into smaller ranges.'); return known.length ? value : null; };
const totals = (rows: Metrics[]): Metrics => Object.fromEntries(metricKeys.map(key => [key, sum(rows.map(row => row[key]))])) as Metrics;
// Rate includes only rows with views and all four interaction metrics. Unknown is not zero.
function engagement(rows: Metrics[]) {
  const valid = rows.filter(row => row.views !== null && row.likes !== null && row.comments !== null && row.shares !== null && row.saves !== null);
  const denominator = sum(valid.map(row => row.views));
  return denominator ? valid.reduce((n, row) => n + row.likes! + row.comments! + row.shares! + row.saves!, 0) / denominator * 100 : null;
}
export function initPerformance(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS social_observations(platform TEXT NOT NULL,account TEXT NOT NULL,content_id TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL,imported_at TEXT NOT NULL,PRIMARY KEY(platform,account,content_id,date));
    CREATE TABLE IF NOT EXISTS social_queries(platform TEXT NOT NULL,account TEXT NOT NULL,date TEXT NOT NULL,keyword TEXT NOT NULL,payload TEXT NOT NULL,imported_at TEXT NOT NULL,PRIMARY KEY(platform,account,date,keyword));
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
}
const schemaFor = (kind: 'content' | 'queries') => kind === 'content' ? postRowSchema : queryRowSchema;
export function parseImport(kind: 'content' | 'queries', csv: string): { preview: ImportPreview; data: (PostRow | QueryRow)[] } {
  let raw: Record<string, string>[];
  try { raw = parse(csv, { columns: headers => {
    const normalized = headers.map((header: string) => header.replace(/^\uFEFF/, '').trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate column names.');
    return normalized;
  }, bom: true, skip_empty_lines: true, trim: true, max_record_size: 100000 }); }
  catch { return { data: [], preview: { kind, valid: false, rows: 0, errors: [{ row: 1, message: 'Could not parse CSV. Check quoting, column counts, and duplicate headers.' }], preview: [] } }; }
  return validateImport(kind, raw.map(row => {
    const parsed: Record<string, unknown> = { ...row };
    for (const key of kind === 'content' ? metricKeys : ['views', 'impressions', 'clicks']) {
      const value = row[key]; parsed[key] = value === undefined || value.trim() === '' ? null : /^\d+$/.test(value) ? Number(value) : NaN;
    }
    return parsed;
  }));
}
export function validateImport(kind: 'content' | 'queries', rows: unknown[]): { preview: ImportPreview; data: (PostRow | QueryRow)[] } {
  const errors: ImportPreview['errors'] = []; const data: (PostRow | QueryRow)[] = []; const keys = new Set<string>();
  if (rows.length < 1 || rows.length > 10000) errors.push({ row: 0, message: 'Supply 1–10,000 rows per import.' });
  rows.slice(0, 10000).forEach((row, index) => {
    const result = schemaFor(kind).safeParse(row);
    if (!result.success) { if (errors.length < 20) errors.push({ row: index + 2, message: result.error.issues.map(issue => `${issue.path.join('.') || 'row'}: ${issue.message}`).join('; ') }); return; }
    const value = result.data; const key = JSON.stringify('content_id' in value ? [value.platform, value.account, value.content_id, value.date] : [value.platform, value.account, value.date, value.keyword.toLocaleLowerCase()]);
    if (keys.has(key)) { if (errors.length < 20) errors.push({ row: index + 2, message: 'Duplicate observation in this import. Use one row per content/query per day.' }); return; }
    if ('published_at' in value && value.published_at > value.date) { if (errors.length < 20) errors.push({ row: index + 2, message: 'Observation date is before publication.' }); return; }
    keys.add(key); data.push(value);
  });
  return { data, preview: { kind, valid: errors.length === 0, rows: rows.length, errors, preview: data.slice(0, 5) as unknown as Record<string, unknown>[] } };
}
export function saveImport(db: DatabaseSync, kind: 'content' | 'queries', result: ReturnType<typeof validateImport>) {
  if (!result.preview.valid) throw new PerformanceError(400, result.preview.errors[0]?.message || 'Invalid import.');
  const stamp = new Date().toISOString(); db.exec('BEGIN IMMEDIATE');
  try {
    const statement = db.prepare(kind === 'content'
      ? 'INSERT INTO social_observations VALUES(?,?,?,?,?,?) ON CONFLICT(platform,account,content_id,date) DO UPDATE SET payload=excluded.payload,imported_at=excluded.imported_at'
      : 'INSERT INTO social_queries VALUES(?,?,?,?,?,?) ON CONFLICT(platform,account,date,keyword) DO UPDATE SET payload=excluded.payload,imported_at=excluded.imported_at');
    for (const row of result.data) {
      const identity = 'content_id' in row ? [row.platform, row.account, row.content_id, row.date] : [row.platform, row.account, row.date, row.keyword.toLocaleLowerCase()];
      statement.run(...identity, JSON.stringify(row), stamp);
    }
    db.exec('COMMIT'); return { imported: result.data.length, kind, importedAt: stamp };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function exampleData(): { posts: PostRow[]; queries: QueryRow[] } {
  const themes = ['balcony garden', 'small space garden', 'herb garden', 'balcony garden', 'sustainable living', 'herb garden', 'small space garden', 'balcony garden'];
  const titles = ['A balcony garden in one weekend', 'Small space garden: five ideas that fit', 'Herb garden mistakes to avoid', 'How we built a balcony garden for less', 'Sustainable living: start with what you have', 'Your first herb garden, step by step', 'Small space garden tour', 'Before & after: our balcony garden'];
  const platforms = ['youtube', 'instagram', 'tiktok', 'youtube', 'linkedin', 'instagram', 'pinterest', 'tiktok'] as const;
  const posts: PostRow[] = []; const queries: QueryRow[] = [];
  for (let day = 1; day <= 28; day++) for (let i = 0; i < 8; i++) {
    const views = Math.round((280 + i * 190) * (1 + day / 30) + ((day * 31 + i * 73) % 500));
    posts.push({ platform: platforms[i], account: i < 4 ? '@northstar' : '@greenfield', content_id: `example-${i}`, date: `2026-10-${String(day).padStart(2, '0')}`, published_at: '2026-09-15', title: titles[i], caption: `${themes[i]} ideas, tutorials and practical tips.`, keywords: themes[i], format: platforms[i] === 'youtube' ? 'video' : platforms[i] === 'pinterest' ? 'pin' : 'short video', ownership: i < 4 ? 'owned' : 'competitor', url: `https://content.example/posts/${i}`, views, impressions: views * 3, clicks: Math.round(views * .032), likes: Math.round(views * .06), comments: Math.round(views * .007), shares: Math.round(views * .013), saves: Math.round(views * .018) });
    if (i < 3) queries.push({ platform: platforms[i], account: '@northstar', date: `2026-10-${String(day).padStart(2, '0')}`, keyword: themes[i], impressions: 500 + i * 270 + day * 20, clicks: 20 + i * 11 + day, views: 45 + i * 20 + day * 3 });
  }
  return { posts, queries };
}
export function readPerformanceRows(db: DatabaseSync, dataset: 'imported' | 'example') {
  if (dataset === 'example') return { ...exampleData(), importedAt: null };
  const read = (table: string) => {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) return [];
    const rows = db.prepare(`SELECT payload,imported_at FROM ${table} ORDER BY date DESC LIMIT 100001`).all() as { payload: string; imported_at: string }[];
    if (rows.length > 100000) throw new PerformanceError(400, 'This local analysis supports up to 100,000 observations per dataset. Use a smaller workspace.');
    return rows;
  };
  const content = read('social_observations'); const queries = read('social_queries');
  return { posts: content.map(row => JSON.parse(row.payload) as PostRow), queries: queries.map(row => JSON.parse(row.payload) as QueryRow), importedAt: [...content, ...queries].map(row => row.imported_at).sort().at(-1) || null };
}
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export function contentSummaries(rows: PostRow[]): ContentSummary[] {
  const groups = Map.groupBy(rows, row => JSON.stringify([row.platform, row.account, row.content_id]));
  return [...groups.values()].map(group => { const latest = group.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1)!; const { date: _date, ...meta } = latest; return { ...meta, ...totals(group), days: group.length, engagementRate: engagement(group), metricCoverage: group.filter(row => row.views !== null && [row.likes, row.comments, row.shares, row.saves].every(v => v !== null)).length }; }).sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
}
export function getPerformance(db: DatabaseSync, input: Partial<PerformanceFilters> = {}): Performance {
  const filters = performanceFilters.parse(input); const data = readPerformanceRows(db, filters.dataset);
  const keyword = filters.keyword.toLocaleLowerCase();
  const matches = (row: PostRow | QueryRow) => (filters.platform === 'all' || row.platform === filters.platform) && (!keyword || ('keyword' in row ? row.keyword : `${row.title} ${row.caption} ${row.keywords}`).toLocaleLowerCase().includes(keyword));
  const allPosts = data.posts.filter(matches); const allQueries = data.queries.filter(matches);
  const availableDates = [...allPosts, ...allQueries].map(row => row.date).sort();
  const latest = availableDates.at(-1); const to = filters.to || (filters.from && latest && filters.from > latest ? filters.from : latest) || filters.from || null; const from = filters.from || (to ? addDays(to, -13) : null);
  const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
  if (span > 366) throw new PerformanceError(400, 'Choose a date range of 366 days or less.');
  const previousTo = from ? addDays(from, -1) : null; const previousFrom = from ? addDays(from, -span) : null;
  const current = <T extends { date: string }>(rows: T[]) => rows.filter(row => from && to && row.date >= from && row.date <= to);
  const posts = current(allPosts); const queries = current(allQueries); const summaries = contentSummaries(posts);
  const previous = allPosts.filter(row => previousFrom && previousTo && row.date >= previousFrom && row.date <= previousTo);
  const groups = Map.groupBy(queries, row => row.keyword.toLocaleLowerCase());
  const querySummaries = [...groups.values()].map(group => {
    const paired = group.filter(row => row.impressions !== null && row.clicks !== null); const denom = sum(paired.map(row => row.impressions));
    return { keyword: group[0].keyword, views: sum(group.map(row => row.views)), impressions: sum(group.map(row => row.impressions)), clicks: sum(group.map(row => row.clicks)), ctr: denom ? sum(paired.map(row => row.clicks))! / denom * 100 : null, platforms: [...new Set(group.map(row => row.platform))], observations: group.length, history: [...Map.groupBy(group, row => row.date)].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, clicks: sum(rows.map(row => row.clicks)) })) };
  }).sort((a, b) => (b.clicks ?? -1) - (a.clicks ?? -1));
  const topicRows = new Map<string, PostRow[]>();
  for (const row of posts) for (const topic of new Set(row.keywords.split('|').map(k => k.trim().toLocaleLowerCase()).filter(Boolean))) { const group = topicRows.get(topic) || []; group.push(row); topicRows.set(topic, group); }
  const topics = [...topicRows].map(([topic, rows]) => ({ keyword: topic, posts: contentSummaries(rows).length, views: sum(rows.map(row => row.views)), engagementRate: engagement(rows) })).sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  const accounts = [...Map.groupBy(posts, row => JSON.stringify([row.platform, row.account])).values()].map(rows => ({ account: rows[0].account, platform: rows[0].platform, ownership: rows[0].ownership, posts: contentSummaries(rows).length, views: sum(rows.map(row => row.views)), engagementRate: engagement(rows) }));
  const formats = [...Map.groupBy(summaries, row => row.format).entries()].map(([format, rows]) => { const values = rows.map(row => row.views).filter((v): v is number => v !== null).sort((a, b) => a - b); const middle = Math.floor(values.length / 2); return { format, posts: rows.length, views: sum(values), medianViews: values.length ? values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null }; }).sort((a, b) => (b.medianViews ?? -1) - (a.medianViews ?? -1));
  const series = from && to ? Array.from({ length: span }, (_, i) => { const date = addDays(from, i); return { date, ...totals(posts.filter(row => row.date === date)) }; }) : [];
  const currentDays = new Set(posts.map(row => row.date)).size; const previousDays = new Set(previous.map(row => row.date)).size;
  const metricComparable = Object.fromEntries(metricKeys.map(key => [key, span > 0 && currentDays === span && previousDays === span && posts.every(row => row[key] !== null) && previous.every(row => row[key] !== null)])) as Record<MetricKey, boolean>;
  return { dataset: filters.dataset, filters, totals: totals(posts), previousTotals: totals(previous), comparison: { expectedDays: span, currentDays, previousDays, metricComparable }, period: { from, to, previousFrom, previousTo }, posts: summaries, queries: querySummaries, topics, series, accounts, formats, coverage: { contentRows: posts.length, queryRows: queries.length, accounts: accounts.length, dates: currentDays, importedAt: data.importedAt, metrics: Object.fromEntries(metricKeys.map(key => [key, posts.filter(row => row[key] !== null).length])) as Record<MetricKey, number> }, disclosure: filters.dataset === 'example' ? 'Fictional example dataset. These numbers do not describe real accounts or search demand.' : 'User-supplied daily observations. Query metrics are supplied query data; topic totals are views of associated content, not keyword search volume. Missing metrics remain unknown. Cross-platform definitions can differ.' };
}
const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'how', 'with', 'your', 'our', 'we', 'you', 'is', 'it']);
const terms = (post: ContentSummary) => new Set(`${post.title} ${post.keywords}`.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(term => term.length > 1 && !stopWords.has(term)) || []);
export function similarContent(performance: Performance, referenceId: string, scope: 'platform' | 'all' = 'platform'): SimilarContent {
  const reference = performance.posts.find(row => contentKey(row) === referenceId);
  if (!reference) throw new PerformanceError(404, 'Choose content from the filtered dataset.');
  const referenceTerms = terms(reference);
  const matches = performance.posts.filter(row => contentKey(row) !== referenceId && (scope === 'all' || row.platform === reference.platform)).map(row => {
    const other = terms(row); const sharedTerms = [...referenceTerms].filter(term => other.has(term));
    const union = new Set([...referenceTerms, ...other]).size;
    return { ...row, similarity: union ? Math.round(sharedTerms.length / union * 100) : 0, sharedTerms, viewsDifference: row.views !== null && reference.views !== null ? row.views - reference.views : null };
  }).filter(row => row.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, 12);
  return { reference, matches, method: 'Lexical Jaccard overlap of normalized title/keyword terms, excluding common stop words. Not an embedding or plagiarism score. Same-platform comparison is the default; observation windows can be incomplete.' };
}
export function contentKey(row: Pick<PostRow, 'platform' | 'account' | 'content_id'>) { return JSON.stringify([row.platform, row.account, row.content_id]); }
export const importInput = z.object({ kind: z.enum(['content', 'queries']), csv: z.string().min(1).max(900000), metricBasis: z.literal('daily') });
export const ingestInput = z.discriminatedUnion('kind', [z.object({ kind: z.literal('content'), metricBasis: z.literal('daily'), rows: z.array(postRowSchema).min(1).max(10000) }), z.object({ kind: z.literal('queries'), metricBasis: z.literal('daily'), rows: z.array(queryRowSchema).min(1).max(10000) })]);
