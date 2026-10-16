import type { Audit } from './types.js';

export type SiteScan = {
  domain: string;
  requestedUrl: string;
  finalUrl: string;
  scannedAt: string;
  status: number;
  responseMs: number;
  bytes: number;
  title: string;
  description: string;
  canonical: string;
  language: string;
  robotsMeta: string;
  headings: { level: number; text: string }[];
  images: { total: number; missingAlt: number };
  wordCount: number;
  topics: { term: string; count: number }[];
  internalLinks: { url: string; anchor: string }[];
  externalLinks: { url: string; anchor: string }[];
  structuredDataTypes: string[];
  openGraph: { title: string; description: string; image: string };
  pageChecks?: {
    url: string;
    status: number | null;
    title: string;
    description: string;
    h1Count: number;
    responseMs: number;
    score: number | null;
    error?: string;
    depth?: number;
    wordCount?: number;
    canonical?: string;
    noindex?: boolean;
    missingAlt?: number;
    internalLinks?: number;
    inlinks?: number;
    /** How the crawler found the page. */
    source?: 'home' | 'link' | 'sitemap';
    inSitemap?: boolean;
  }[];
  sitemap?: { urls: number; sources: string[]; error: string | null };
  /** True when the scan ran on the automatic schedule. */
  auto?: boolean;
  pageIssues?: { type: string; severity: 'error' | 'warning'; url: string; detail: string }[];
  ai?: AiReadiness;
  /** Static performance signals from the homepage HTML plus crawl response times. Not Core Web Vitals. */
  speed?: { htmlBytes: number; blockingScripts: number; scripts: number; thirdPartyScripts: number; stylesheets: number; images: number; imagesWithoutSize: number; lazyImages: number; modernImages: number; avgResponseMs: number | null; slowestPage: string | null };
  llms?: { url: string; status: number | null; found: boolean; lines: number; links: number };
  audit: Audit;
  warnings: string[];
  disclosure: string;
  robots: {
    url: string;
    status: number | null;
    allowed: boolean | null;
    sitemaps: string[];
  };
};


export type AiReadiness = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  bots: { agent: string; owner: string; product: string; purpose: 'search' | 'training'; allowed: boolean }[];
  checks: { id: string; category: 'Access' | 'Discovery' | 'Structured data' | 'Content' | 'Trust'; name: string; max: number; points: number; passed: boolean; detail: string; fix: string }[];
};
