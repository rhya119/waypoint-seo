import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { dateSchema } from "../shared/performance.js";
import {
  webImportInput,
  type WebImportInput,
  type WebRows,
  type SearchRow,
  type LinkRow,
  type RankRow,
  type WebDataset,
  type WebReport,
  type WebKind,
} from "../shared/web-data.js";
import type { Audit } from "../shared/types.js";
import type { SiteScan } from '../shared/site-scan.js';
import { googleSeoInput, type GoogleSeoResult } from '../shared/google-data.js';
import { trafficEstimateInput, type TrafficEstimateReport } from '../shared/traffic-estimates.js';
import { webDomain, type ScanSummary } from '../shared/web-data.js';
import type { PageSpeedReport, PageSpeedResult } from '../shared/research.js';
export class WebDataError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const url = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      const u = new URL(s);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTP(S) URL without credentials.");
const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    clicks: z.number().int().nonnegative().safe(),
    impressions: z.number().int().nonnegative().safe(),
    position: z.number().min(1).max(1000).nullable(),
  })
  .refine(
    (r) => r.clicks <= r.impressions,
    "Clicks cannot exceed impressions.",
  );
const linkSchema = z.object({
  source_url: url,
  target_url: url,
  anchor: z.string().max(2000),
  rel: z.string().trim().max(100),
});
const rankSchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  date: dateSchema,
  position: z.number().int().min(1).max(1000),
  country: z.string().trim().min(1).max(40),
  device: z.enum(["all", "desktop", "mobile", "tablet"]),
  url: z.union([url, z.literal("")]),
});
export function initWebData(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS web_datasets(id INTEGER PRIMARY KEY,domain TEXT NOT NULL,kind TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,source TEXT NOT NULL,scope TEXT NOT NULL,imported_at TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(domain,kind,start_date,end_date,scope));
    CREATE TABLE IF NOT EXISTS web_tracks(domain TEXT NOT NULL,keyword TEXT NOT NULL,country TEXT NOT NULL,device TEXT NOT NULL,PRIMARY KEY(domain,keyword,country,device));
    CREATE TABLE IF NOT EXISTS web_audits(domain TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_site_scans(domain TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_google_reports(domain TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_traffic_estimates(domain TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_pagespeed(domain TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_scan_history(id INTEGER PRIMARY KEY,domain TEXT NOT NULL,scanned_at TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS web_scan_history_domain ON web_scan_history(domain,scanned_at);`);
}
const number = (s: string | undefined) =>
  s === undefined || !s.trim()
    ? NaN
    : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s.trim())
      ? Number(s.replaceAll(",", ""))
      : NaN;
const aliases: Record<string, string> = {
  top_queries: "query",
  queries: "query",
  keyword: "keyword",
  average_position: "position",
  avg_position: "position",
  source: "source_url",
  target: "target_url",
  anchor_text: "anchor",
};
export function previewWebImport(rawInput: unknown) {
  const input = webImportInput.parse(rawInput);
  let csvRows: Record<string, string>[];
  try {
    csvRows = parse(input.csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 100000,
      columns: (headers: string[]) => {
        const normalized = headers.map((h) => {
          const name = h
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
          return aliases[name] || name;
        });
        if (new Set(normalized).size !== normalized.length)
          throw new Error("Duplicate CSV headers.");
        return normalized;
      },
    });
  } catch {
    throw new WebDataError(
      400,
      "Invalid CSV. Check headers, quoting and column counts.",
    );
  }
  if (!csvRows.length || csvRows.length > 5000)
    throw new WebDataError(400, "Import 1–5,000 rows per dataset.");
  const errors: string[] = [];
  const rows: unknown[] = [];
  const keys = new Set<string>();
  for (const [i, r] of csvRows.entries()) {
    try {
      let row: SearchRow | LinkRow | RankRow;
      let key: string;
      if (input.kind === "search") {
        row = searchSchema.parse({
          query: r.query || r.keyword,
          clicks: number(r.clicks),
          impressions: number(r.impressions),
          position: r.position?.trim() ? number(r.position) : null,
        });
        key = row.query;
      } else if (input.kind === "backlinks") {
        row = linkSchema.parse({
          source_url: r.source_url,
          target_url: r.target_url,
          anchor: r.anchor || "",
          rel: r.rel || "unknown",
        });
        const host = new URL(row.target_url).hostname.replace(/^www\./, "");
        if (host !== input.domain && !host.endsWith(`.${input.domain}`))
          throw new Error("Target URL must belong to the selected domain.");
        key = JSON.stringify([
          row.source_url,
          row.target_url,
          row.anchor,
          row.rel,
        ]);
      } else {
        row = rankSchema.parse({
          keyword: r.keyword || r.query,
          date: r.date,
          position: number(r.position),
          country: r.country || "all",
          device: r.device?.toLowerCase() || "all",
          url: r.url || "",
        });
        if (row.date < input.from || row.date > input.to)
          throw new Error(
            "Observation date falls outside the declared window.",
          );
        if (row.url) {
          const host = new URL(row.url).hostname.replace(/^www\./, "");
          if (host !== input.domain && !host.endsWith(`.${input.domain}`))
            throw new Error("Ranking URL must belong to the selected domain.");
        }
        key = JSON.stringify([row.keyword, row.date, row.country, row.device]);
      }
      if (keys.has(key))
        throw new Error(
          "Duplicate row identity. Search imports require one row per query for the selected range.",
        );
      keys.add(key);
      rows.push(row);
    } catch (e) {
      if (errors.length < 20)
        errors.push(
          `Row ${i + 2}: ${e instanceof z.ZodError ? e.issues[0]?.message : (e as Error).message}`,
        );
    }
  }
  return {
    valid: !errors.length,
    count: csvRows.length,
    sample: rows.slice(0, 5),
    errors,
    rows: rows as WebRows,
    input,
  };
}
export function importWebData(db: DatabaseSync, input: unknown) {
  const validated = previewWebImport(input);
  if (!validated.valid) throw new WebDataError(400, validated.errors.join(" "));
  const data = validated.input;
  const at = new Date().toISOString();
  writeDataset(db, data, validated.rows, at);
  return {
    imported: validated.count,
    domain: data.domain,
    kind: data.kind,
    importedAt: at,
    metricBasis: "declared-window",
  };
}
function writeDataset(db: DatabaseSync, data: Pick<WebImportInput, 'domain' | 'kind' | 'from' | 'to' | 'source' | 'scope'>, rows: WebRows, at: string) {
  db.prepare(
    `INSERT INTO web_datasets(domain,kind,start_date,end_date,source,scope,imported_at,payload) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(domain,kind,start_date,end_date,scope) DO UPDATE SET source=excluded.source,imported_at=excluded.imported_at,payload=excluded.payload`,
  ).run(
    data.domain,
    data.kind,
    data.from,
    data.to,
    data.source,
    data.scope,
    at,
    JSON.stringify(rows),
  );
}

const payloadTables = ['web_site_scans', 'web_google_reports', 'web_traffic_estimates', 'web_pagespeed'] as const;
type PayloadTable = typeof payloadTables[number];
function hasTable(db: DatabaseSync, table: string) {
  return Boolean(db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?').get(table));
}
function savedPayload<T>(db: DatabaseSync, table: PayloadTable, domain: string): T | null {
  if (!hasTable(db, table)) return null;
  const row = db.prepare(`SELECT payload FROM ${table} WHERE domain=?`).get(domain) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as T : null;
}
function savePayload(db: DatabaseSync, table: PayloadTable, domain: string, payload: unknown) {
  db.prepare(`INSERT INTO ${table}(domain,payload) VALUES(?,?) ON CONFLICT(domain) DO UPDATE SET payload=excluded.payload`).run(domain, JSON.stringify(payload));
}
export function saveSiteScan(db: DatabaseSync, result: SiteScan, expectedDomain?: string): SiteScan {
  const domain = webDomain.parse(result.domain);
  if (expectedDomain && domain !== webDomain.parse(expectedDomain)) throw new WebDataError(502, 'The scanner returned a result for a different requested domain. No result was saved.');
  savePayload(db, 'web_site_scans', domain, { ...result, domain });
  if (hasTable(db, 'web_scan_history')) {
    const summary: ScanSummary = {
      scannedAt: result.scannedAt, pages: result.pageChecks?.length || 1, checklist: result.audit.score, aiScore: result.ai?.score ?? null,
      issues: [...new Set([...(result.pageIssues || []).map((issue) => `${issue.type}|${issue.url}`), ...(result.ai?.checks || []).filter((check) => !check.passed).map((check) => `AI: ${check.name}|${result.finalUrl}`)])].slice(0, 1000),
    };
    db.prepare('INSERT INTO web_scan_history(domain,scanned_at,payload) VALUES(?,?,?)').run(domain, result.scannedAt, JSON.stringify(summary));
    db.prepare('DELETE FROM web_scan_history WHERE domain=? AND id NOT IN (SELECT id FROM web_scan_history WHERE domain=? ORDER BY scanned_at DESC,id DESC LIMIT 20)').run(domain, domain);
  }
  return { ...result, domain };
}
export function savePageSpeed(db: DatabaseSync, result: PageSpeedResult): PageSpeedReport {
  const domain = webDomain.parse(result.domain);
  const saved = { ...(savedPayload<PageSpeedReport>(db, 'web_pagespeed', domain) || {}), [result.strategy]: result };
  savePayload(db, 'web_pagespeed', domain, saved);
  return saved;
}
function googleQueryScope(property: string) {
  const base = 'All countries/devices; web search; final; ';
  if (property.startsWith('sc-domain:')) return base + 'Domain property';
  // The concrete property remains in source. Its coverage signature belongs in
  // the snapshot identity: HTTP/HTTPS and apex/www are different properties,
  // while the same coverage on different domains can still be compared.
  const prefix = new URL(property);
  return base + `root URL-prefix property; ${prefix.protocol.slice(0, -1)}; ${prefix.hostname.startsWith('www.') ? 'www' : 'apex'}`;
}
export function saveGoogleData(db: DatabaseSync, result: GoogleSeoResult, expected?: { domain: string; from: string; to: string }): GoogleSeoResult {
  const checked = googleSeoInput.safeParse(result);
  if (!checked.success || expected && (checked.data.domain !== expected.domain || checked.data.from !== expected.from || checked.data.to !== expected.to)) throw new WebDataError(502, 'Google returned a mismatched domain or reporting period. No result was saved.');
  const rows = z.array(searchSchema).max(5000).safeParse(result.search?.rows || []);
  if (!rows.success || new Set(rows.data.map((row) => row.query)).size !== rows.data.length ||
      !Number.isSafeInteger(rows.data.reduce((sum, row) => sum + row.clicks, 0)) ||
      !Number.isSafeInteger(rows.data.reduce((sum, row) => sum + row.impressions, 0))) throw new WebDataError(502, 'Google returned invalid or repeated query observations. No result was saved.');
  const saved: GoogleSeoResult = { ...result, ...checked.data, search: result.search ? { ...result.search, rows: rows.data } : null };
  // The result and its query snapshot commit together. Query rows pass exactly
  // the same metric validation as imports; overlapping periods stay separate.
  db.exec('BEGIN');
  try {
    savePayload(db, 'web_google_reports', saved.domain, saved);
    // A successful empty query subset replaces the same-period snapshot too.
    // A null search result means unavailable access and preserves old sources.
    if (saved.search) writeDataset(db, {
      domain: saved.domain, kind: 'search', from: saved.from, to: saved.to,
      source: `Google Search Console API (${saved.search.property})`,
      scope: googleQueryScope(saved.search.property),
    }, rows.data, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return saved;
}
export function saveTrafficEstimate(db: DatabaseSync, result: TrafficEstimateReport, expected?: { domain: string; from: string; to: string }): TrafficEstimateReport {
  const checked = trafficEstimateInput.safeParse(result);
  if (!checked.success || expected && (checked.data.domain !== expected.domain || checked.data.from !== expected.from || checked.data.to !== expected.to)) throw new WebDataError(502, 'The traffic provider returned a mismatched domain or reporting period. No estimate was saved.');
  const saved = { ...result, ...checked.data };
  savePayload(db, 'web_traffic_estimates', saved.domain, saved);
  return saved;
}
type Stored = {
  id: number;
  domain: string;
  kind: WebKind;
  start_date: string;
  end_date: string;
  source: string;
  scope: string;
  imported_at: string;
  payload: string;
};
function metadata(r: Stored): WebDataset {
  return {
    id: r.id,
    domain: r.domain,
    kind: r.kind,
    from: r.start_date,
    to: r.end_date,
    source: r.source,
    scope: r.scope,
    importedAt: r.imported_at,
    count: (JSON.parse(r.payload) as unknown[]).length,
  };
}
const disclosure =
  "Search metrics come from your supplied exports/observations or an explicitly authorized Google read. Query-table totals can omit anonymized queries and truncated exports; these are not whole-site traffic or global keyword search volume. Only one selected query dataset is totaled; overlapping periods are never summed. Public scans analyze fetched page markup, topics and outgoing links, not inbound backlinks or rankings. Backlinks are supplied URLs, not a crawled index. Manual positions and Search Console average position are distinct. Optional third-party traffic estimates stay separate from measured first-party Google analytics. No automatic SERP tracking.";
export function webReport(
  db: DatabaseSync,
  domain: string,
  datasetId?: number,
): WebReport {
  const site = savedPayload<SiteScan>(db, 'web_site_scans', domain);
  const publicComparisons = hasTable(db, 'web_site_scans') ? (db.prepare("SELECT domain,payload FROM web_site_scans WHERE domain<>? ORDER BY json_extract(payload,'$.scannedAt') DESC,domain LIMIT 100").all(domain) as { domain: string; payload: string }[]).map((row) => {
    const scan = JSON.parse(row.payload) as SiteScan;
    return { domain: row.domain, title: scan.title, wordCount: scan.wordCount, score: scan.audit.score, scannedAt: scan.scannedAt, url: scan.finalUrl, pages: scan.pageChecks?.length || 1, issues: scan.pageIssues?.length, aiScore: scan.ai?.score ?? null, aiGrade: scan.ai?.grade ?? null, schema: scan.structuredDataTypes.slice(0, 6), llms: scan.llms?.found };
  }) : [];
  const auditRow = hasTable(db, 'web_audits') ? db.prepare('SELECT payload FROM web_audits WHERE domain=?').get(domain) as { payload: string } | undefined : undefined;
  const empty: WebReport = {
    site,
    publicComparisons,
    google: savedPayload<GoogleSeoResult>(db, 'web_google_reports', domain),
    trafficEstimate: savedPayload<TrafficEstimateReport>(db, 'web_traffic_estimates', domain),
    domain,
    provenance: "imported",
    datasets: [],
    search: null,
    backlinks: null,
    queries: [],
    links: [],
    totals: {
      clicks: null,
      impressions: null,
      ctr: null,
      queries: null,
      backlinks: null,
      referringHosts: null,
    },
    ranks: [],
    tracks: hasTable(db, 'web_tracks') ? db.prepare('SELECT keyword,country,device FROM web_tracks WHERE domain=? ORDER BY keyword').all(domain) as WebReport['tracks'] : [],
    competitors: [],
    audit: auditRow ? JSON.parse(auditRow.payload) as Audit : site?.audit || null,
    pageSpeed: savedPayload<PageSpeedReport>(db, 'web_pagespeed', domain),
    scanHistory: hasTable(db, 'web_scan_history') ? (db.prepare('SELECT payload FROM web_scan_history WHERE domain=? ORDER BY scanned_at DESC,id DESC LIMIT 10').all(domain) as { payload: string }[]).map((row) => JSON.parse(row.payload) as ScanSummary) : [],
    disclosure,
  };
  const stored = hasTable(db, 'web_datasets') ? db
    .prepare(
      "SELECT * FROM web_datasets WHERE domain=? ORDER BY imported_at DESC,id DESC LIMIT 201",
    )
    .all(domain) as Stored[] : [];
  if (stored.length > 200)
    throw new WebDataError(
      422,
      "This domain exceeds the local 200-dataset report limit. Export/archive older datasets before adding more.",
    );
  const search = datasetId
    ? stored.find((r) => r.kind === "search" && r.id === datasetId)
    : stored.find((r) => r.kind === "search");
  if (datasetId && !search)
    throw new WebDataError(404, "Query dataset not found for this domain.");
  const backlinks = stored.find((r) => r.kind === "backlinks");
  const queries = search ? (JSON.parse(search.payload) as SearchRow[]) : [];
  const links = backlinks ? (JSON.parse(backlinks.payload) as LinkRow[]) : [];
  const clicks = search ? queries.reduce((s, r) => s + r.clicks, 0) : null;
  const impressions = search
    ? queries.reduce((s, r) => s + r.impressions, 0)
    : null;
  if (
    (clicks !== null && !Number.isSafeInteger(clicks)) ||
    (impressions !== null && !Number.isSafeInteger(impressions))
  )
    throw new WebDataError(
      422,
      "Dataset totals exceed the safe integer range.",
    );
  const rankMap = new Map<string, RankRow>();
  // Latest import wins if two windows contain the same observation; do not add snapshots.
  for (const dataset of stored.filter((r) => r.kind === "ranks"))
    for (const r of JSON.parse(dataset.payload) as RankRow[]) {
      const key = JSON.stringify([r.keyword, r.date, r.country, r.device]);
      if (!rankMap.has(key)) rankMap.set(key, r);
    }
  const rankGroups = Map.groupBy(
    [...rankMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    (r) => JSON.stringify([r.keyword, r.country, r.device]),
  );
  const ranks = [...rankGroups.values()].map((rows) => ({
    ...rows[0],
    previous: rows[1]?.position ?? null,
    change: rows[1] ? rows[1].position - rows[0].position : null,
  }));
  const querySet = new Set(queries.map((r) => r.query.toLowerCase()));
  const competitors: WebReport["competitors"] = [];
  if (search) {
    const others = db
      .prepare(
        "SELECT * FROM web_datasets WHERE domain<>? AND kind='search' ORDER BY imported_at DESC,id DESC LIMIT 501",
      )
      .all(domain) as Stored[];
    if (others.length > 500)
      throw new WebDataError(
        422,
        "Comparison dataset limit reached. Archive older competitor datasets.",
      );
    const domains = new Set<string>();
    // Prefer a compatible period/scope; otherwise display a warning without an overlap score.
    others.sort(
      (a, b) =>
        Number(
          b.start_date === search.start_date &&
            b.end_date === search.end_date &&
            b.scope === search.scope,
        ) -
        Number(
          a.start_date === search.start_date &&
            a.end_date === search.end_date &&
            a.scope === search.scope,
        ),
    );
    for (const r of others) {
      if (domains.has(r.domain)) continue;
      domains.add(r.domain);
      const set = new Set(
        (JSON.parse(r.payload) as SearchRow[]).map((q) =>
          q.query.toLowerCase(),
        ),
      );
      const shared = [...set].filter((q) => querySet.has(q)).length;
      const comparable =
        r.start_date === search.start_date &&
        r.end_date === search.end_date &&
        r.scope === search.scope;
      competitors.push({
        domain: r.domain,
        sharedQueries: comparable ? shared : null,
        uniqueQueries: comparable ? set.size - shared : null,
        overlap: comparable
          ? (shared / Math.max(1, new Set([...set, ...querySet]).size)) * 100
          : null,
        from: r.start_date,
        to: r.end_date,
        source: r.source,
        scope: r.scope,
        comparable,
      });
    }
  }
  return {
    ...empty,
    datasets: stored.map(metadata),
    search: search ? metadata(search) : null,
    backlinks: backlinks ? metadata(backlinks) : null,
    queries: queries
      .map((r) => ({
        ...r,
        ctr: r.impressions ? (r.clicks / r.impressions) * 100 : null,
      }))
      .sort((a, b) => b.clicks - a.clicks),
    links,
    totals: {
      clicks,
      impressions,
      ctr: impressions ? (clicks! / impressions) * 100 : null,
      queries: search ? queries.length : null,
      backlinks: backlinks ? links.length : null,
      referringHosts: backlinks
        ? new Set(links.map((r) => new URL(r.source_url).hostname)).size
        : null,
    },
    ranks,
    competitors,
  };
}
export function webDomains(db: DatabaseSync): string[] {
  const tables = ['web_datasets', 'web_tracks', 'web_audits', ...payloadTables].filter((table) => hasTable(db, table));
  if (!tables.length) return [];
  return (db.prepare(tables.map((table) => `SELECT domain FROM ${table}`).join(' UNION ') + ' ORDER BY domain').all() as { domain: string }[]).map((row) => row.domain);
}
