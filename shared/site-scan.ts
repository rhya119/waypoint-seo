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
  }[];
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
