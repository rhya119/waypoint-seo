import { z } from "zod";
import { dateSchema } from "./performance.js";
import type { Audit } from "./types.js";
import type { SiteScan } from './site-scan.js';
import type { GoogleSeoResult } from './google-data.js';
import type { TrafficEstimateReport } from './traffic-estimates.js';
import type { PageSpeedReport } from './research.js';
export function normalizeWebDomain(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    throw new Error("Enter a valid domain.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
export const webDomain = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((value, ctx) => {
    try {
      return normalizeWebDomain(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter your domain, such as yoursite.com.",
      });
      return z.NEVER;
    }
  });
export const webKind = z.enum(["search", "backlinks", "ranks"]);
export type WebKind = z.infer<typeof webKind>;
export const webImportInput = z
  .object({
    domain: webDomain,
    kind: webKind,
    from: dateSchema,
    to: dateSchema,
    csv: z.string().min(1).max(900000),
    source: z.string().trim().min(1).max(100),
    scope: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .default("All countries/devices; web search"),
  })
  .refine((x) => x.from <= x.to, "Start date must precede end date.");
export type WebImportInput = z.infer<typeof webImportInput>;
export type SearchRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
};
export type LinkRow = {
  source_url: string;
  target_url: string;
  anchor: string;
  rel: string;
};
export type RankRow = {
  keyword: string;
  date: string;
  position: number;
  country: string;
  device: string;
  url: string;
};
export type WebRows = SearchRow[] | LinkRow[] | RankRow[];
export type WebDataset = {
  id: number;
  domain: string;
  kind: WebKind;
  from: string;
  to: string;
  source: string;
  scope: string;
  importedAt: string;
  count: number;
};
export type WebReport = {
  site: SiteScan | null;
  publicComparisons: { domain: string; title: string; wordCount: number; score: number; scannedAt: string; url: string; pages?: number; issues?: number; aiScore?: number | null; aiGrade?: string | null; schema?: string[]; llms?: boolean }[];
  google: GoogleSeoResult | null;
  trafficEstimate: TrafficEstimateReport | null;
  domain: string;
  provenance: "imported";
  datasets: WebDataset[];
  search: WebDataset | null;
  backlinks: WebDataset | null;
  queries: (SearchRow & { ctr: number | null })[];
  links: LinkRow[];
  totals: {
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    queries: number | null;
    backlinks: number | null;
    referringHosts: number | null;
  };
  ranks: (RankRow & { previous: number | null; change: number | null })[];
  tracks: { keyword: string; country: string; device: string }[];
  competitors: {
    domain: string;
    sharedQueries: number | null;
    uniqueQueries: number | null;
    overlap: number | null;
    from: string;
    to: string;
    comparable: boolean;
    source: string;
    scope: string;
  }[];
  audit: Audit | null;
  pageSpeed: PageSpeedReport | null;
  scanHistory: ScanSummary[];
  disclosure: string;
};
export type ScanSummary = { scannedAt: string; pages: number; checklist: number; aiScore: number | null; issues: string[] };
export const trackInput = z.object({
  domain: webDomain,
  keyword: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(40).default("all"),
  device: z.enum(["all", "desktop", "mobile", "tablet"]).default("all"),
});
export const webTemplates: Record<WebKind, string> = {
  search: "query,clicks,impressions,position\n",
  backlinks: "source_url,target_url,anchor,rel\n",
  ranks: "keyword,date,position,country,device,url\n",
};
