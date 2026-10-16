import type { WebReport } from './web-data.js';

type Query = WebReport['queries'][number];
export type OpportunityKind = 'striking' | 'lowCtr' | 'gaps' | 'questions' | 'top';
export const opportunityLabels: Record<OpportunityKind, { label: string; help: string }> = {
  striking: { label: 'Almost page one', help: 'Positions 8–20. Small content and internal-link improvements can move these into the top results.' },
  lowCtr: { label: 'Seen, not clicked', help: 'Page-one queries with fewer clicks than usual for their position. Rewrite the title and description.' },
  gaps: { label: 'Missing pages', help: 'You appear beyond page two. A page dedicated to the topic usually ranks far better.' },
  questions: { label: 'Questions', help: 'Question searches already showing your site. Answer each directly in an FAQ or article.' },
  top: { label: 'Top performers', help: 'Your best queries by clicks. Protect these pages when you edit them.' },
};

/** Typical organic click-through by position, used only to flag snippets that under-perform. */
export const expectedCtr = (position: number) => position <= 1 ? 0.28 : position <= 2 ? 0.15 : position <= 3 ? 0.11 : position <= 5 ? 0.07 : position <= 10 ? 0.04 : 0.01;
export const isQuestion = (query: string) => /^(?:how|what|why|when|where|which|who|can|is|are|does|do|should|will)\b|\?$/.test(query.trim().toLowerCase());

export function findOpportunities(queries: Query[]): Record<OpportunityKind, Query[]> {
  const rows = queries.filter((row) => row.impressions > 0);
  const byImpressions = (a: Query, b: Query) => b.impressions - a.impressions;
  return {
    striking: rows.filter((row) => row.position !== null && row.position > 7 && row.position <= 20).sort(byImpressions),
    lowCtr: rows.filter((row) => row.position !== null && row.position <= 10 && row.impressions >= 20 && row.clicks / row.impressions < expectedCtr(row.position) * 0.6).sort(byImpressions),
    gaps: rows.filter((row) => row.position !== null && row.position > 20).sort(byImpressions),
    questions: rows.filter((row) => isQuestion(row.query)).sort(byImpressions),
    top: rows.filter((row) => row.clicks > 0).sort((a, b) => b.clicks - a.clicks),
  };
}

/** Extra clicks if a query reached the typical click-through for a target position. A rough
 * planning estimate from your own impressions, not a forecast. */
export function potentialClicks(row: Query, targetPosition = 3) {
  return Math.max(0, Math.round(row.impressions * expectedCtr(targetPosition) - row.clicks));
}
