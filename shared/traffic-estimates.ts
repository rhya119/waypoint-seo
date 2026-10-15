import { z } from 'zod';
import { dateSchema } from './performance.js';
import { webDomain } from './web-data.js';

/** Similarweb returns monthly buckets: request complete months to avoid partial-month totals. */
export const trafficEstimateInput = z.object({
  domain: webDomain,
  from: dateSchema,
  to: dateSchema,
}).superRefine((value, ctx) => {
  if (!dateSchema.safeParse(value.from).success || !dateSchema.safeParse(value.to).success) return;
  if (value.from > value.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Start date must precede end date.' });
  if (!value.from.endsWith('-01')) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Monthly estimates must start on the first day of a month.' });
  const lastDayDate = new Date(`${value.to.slice(0, 7)}-01T00:00:00.000Z`);
  lastDayDate.setUTCMonth(lastDayDate.getUTCMonth() + 1);
  lastDayDate.setUTCDate(0);
  const lastDay = lastDayDate.toISOString().slice(0, 10);
  if (value.to !== lastDay) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Monthly estimates must end on the last day of a month.' });
  const months = (Number(value.to.slice(0, 4)) - Number(value.from.slice(0, 4))) * 12 + Number(value.to.slice(5, 7)) - Number(value.from.slice(5, 7)) + 1;
  if (months > 12) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Request at most 12 calendar months at a time.' });
});

export type TrafficEstimateInput = z.infer<typeof trafficEstimateInput>;
export type TrafficEstimateReport = {
  provider: 'similarweb';
  basis: 'third-party-estimate';
  domain: string;
  from: string;
  to: string;
  granularity: 'monthly';
  country: 'WW';
  collectedAt: string;
  updatedAt: string | null;
  series: { date: string; visits: number | null; bounceRate: number | null; pagesPerVisit: number | null }[];
  disclosure: string;
};

export type TrafficEstimateStatus = {
  provider: 'similarweb';
  configured: boolean;
  requiredEnv: string[];
  notes: string[];
};
