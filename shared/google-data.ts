import { z } from 'zod';
import { dateSchema } from './performance.js';
import { webDomain } from './web-data.js';

export const googleSeoInput = z.object({
  domain: webDomain,
  from: dateSchema,
  to: dateSchema,
}).refine(value => value.from <= value.to, 'Start date must precede end date.');

export type GoogleSeoResult = {
  domain: string;
  from: string;
  to: string;
  collectedAt: string;
  search: {
    property: string;
    rows: { query: string; clicks: number; impressions: number; position: number | null }[];
    truncated: boolean;
    source: string;
  } | null;
  analytics: {
    propertyId: string;
    sessions: number | null;
    activeUsers: number | null;
    screenPageViews: number | null;
    organicSessions: number | null;
  } | null;
  warnings: string[];
};

export type GoogleSeoStatus = {
  provider: 'google-first-party';
  configured: boolean;
  requiredEnv: string[];
  missingEnv: string[];
  searchConsole: { configured: boolean; requiredEnv: string[] };
  analytics: { configured: boolean; requiredEnv: string[]; missingEnv: string[] };
  scopes: string[];
  notes: string[];
};
