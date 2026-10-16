import { z } from 'zod';
import { webDomain } from './web-data.js';

export const pageSpeedInput = z.object({ domain: webDomain, strategy: z.enum(['mobile', 'desktop']).default('mobile') });
export type PageSpeedInput = z.infer<typeof pageSpeedInput>;
export type PageSpeedResult = {
  domain: string;
  url: string;
  strategy: 'mobile' | 'desktop';
  fetchedAt: string;
  /** Lighthouse performance score, 0–100. */
  score: number | null;
  lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null; speedIndexMs: number | null; ttfbMs: number | null };
  /** Real-user Chrome UX Report data at the 75th percentile, when Google has enough visits. */
  field: { lcpMs: number | null; inpMs: number | null; cls: number | null; overall: string | null; origin: boolean } | null;
  opportunities: { title: string; savingsMs: number }[];
  source: string;
};
export type PageSpeedReport = { mobile?: PageSpeedResult; desktop?: PageSpeedResult };

export const keywordIdeasInput = z.object({
  seed: z.string().trim().min(2).max(80),
  country: z.string().trim().regex(/^[a-z]{2}$/i).default('us'),
  language: z.string().trim().regex(/^[a-z]{2}$/i).default('en'),
});
export type KeywordIdeasInput = z.infer<typeof keywordIdeasInput>;
export type KeywordIdea = { phrase: string; group: 'Questions' | 'Comparisons' | 'Buying' | 'Local' | 'Related'; source: string };
export type KeywordIdeasResult = { seed: string; country: string; language: string; fetchedAt: string; ideas: KeywordIdea[]; disclosure: string };

/** Core Web Vitals thresholds published by Google (good / needs improvement). */
export const vitals = {
  lcpMs: { good: 2500, poor: 4000, label: 'Largest Contentful Paint' },
  inpMs: { good: 200, poor: 500, label: 'Interaction to Next Paint' },
  cls: { good: 0.1, poor: 0.25, label: 'Cumulative Layout Shift' },
  tbtMs: { good: 200, poor: 600, label: 'Total Blocking Time' },
  fcpMs: { good: 1800, poor: 3000, label: 'First Contentful Paint' },
  ttfbMs: { good: 800, poor: 1800, label: 'Server response time' },
} as const;
export const rating = (metric: keyof typeof vitals, value: number | null) =>
  value === null ? 'unknown' : value <= vitals[metric].good ? 'good' : value <= vitals[metric].poor ? 'needs work' : 'poor';

const noise = /\b(?:salary|salaries|jobs?|careers?|interview|fresher|internship|hiring|vacanc(?:y|ies)|resume|apk|crack|torrent|login|meme|lyrics)\b/;
/** Relevant ideas contain every meaningful seed word (prefix match, so “dress” matches “dresses”) and no job-search noise. */
export function relevantIdea(phrase: string, seed: string) {
  const words = phrase.split(/\s+/);
  return !noise.test(phrase) && seed.split(/\s+/).filter((word) => word.length >= 3).every((token) => words.some((word) => word.startsWith(token.slice(0, Math.max(3, token.length - 2)))));
}
