import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeDomain } from '../server/app.js';
import { demoProvider } from '../server/provider.js';
import { auditHtml } from '../server/audit.js';
import { auditSocial } from '../server/social.js';
import { socialAuditInput, metadataInput, buildSocialMetadata, captionInput, reviewCaption, campaignInput, buildCampaignLink } from '../shared/social.js';
import { performanceFilters, type Performance, type PerformanceFilters, type YouTubeResearch } from '../shared/performance.js';
import { similarContent, getPerformance } from '../server/performance.js';
import { DatabaseSync } from 'node:sqlite';
import { createYouTubeProvider, youtubeInput } from '../server/youtube.js';
const output = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
export function createWaypointMcp(workspace: () => unknown = () => ({ projects: [], ranks: [] }), options: { performance?: (filters: PerformanceFilters) => Performance; research?: (input: { keyword: string; sort: 'relevance' | 'viewCount' | 'date' }) => Promise<YouTubeResearch> } = {}) {
  const server = new McpServer({ name: 'waypoint-seo', version: '0.3.0' });
  const local = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const domainInput = { domain: z.string().min(3).max(253) };
  function overview(domain: string) { return demoProvider.overview(normalizeDomain(domain)); }
  server.registerTool('domain_overview', { description: 'Synthetic demo domain metrics, not observed traffic or rankings. No network access.', inputSchema: domainInput, annotations: local }, ({ domain }) => output(overview(domain)));
  server.registerTool('keyword_research', { description: 'Repeatable synthetic keyword suggestions, not live search demand.', inputSchema: { seed: z.string().trim().min(2).max(120) }, annotations: local }, ({ seed }) => output({ provenance: 'demo', rows: demoProvider.keywords(seed) }));
  server.registerTool('backlink_analysis', { description: 'Fictional demo links and referring-domain counts. Does not access a backlink index.', inputSchema: domainInput, annotations: local }, ({ domain }) => { const data = overview(domain); return output({ provenance: 'demo', links: data.links, referringDomains: data.referringDomains }); });
  server.registerTool('competitor_research', { description: 'Fictional competitor benchmarks; not actual market or keyword-gap data.', inputSchema: domainInput, annotations: local }, ({ domain }) => output({ provenance: 'demo', rows: overview(domain).competitors }));
  server.registerTool('site_audit', { description: 'Eight actual static checks on supplied HTML. Does not fetch URLs or execute scripts.', inputSchema: { html: z.string().min(10).max(900000) }, annotations: local }, ({ html }) => output(auditHtml(html)));
  server.registerTool('social_audit', { description: 'Inspect supplied HTML for social-share metadata and illustrative preview fields. Does not fetch images or pages.', inputSchema: socialAuditInput.shape, annotations: local }, input => output(auditSocial(input)));
  server.registerTool('social_meta_tags', { description: 'Generate escaped Open Graph and X-style card HTML from supplied fields. Does not edit any website.', inputSchema: metadataInput.shape, annotations: local }, input => output({ html: buildSocialMetadata(input) }));
  server.registerTool('social_caption_review', { description: 'Transparent editorial checks for captions and hashtags. No live trends or reach prediction.', inputSchema: captionInput.shape, annotations: local }, input => output(reviewCaption(input)));
  server.registerTool('campaign_link', { description: 'Generate an HTTP(S) UTM campaign URL. Does not record clicks or publish anything.', inputSchema: campaignInput.shape, annotations: local }, input => output(buildCampaignLink(input)));
  server.registerTool('read_workspace', { description: 'Read saved local project and demo rank baselines for reporting. No writes or external requests.', inputSchema: {}, annotations: local }, () => output(workspace()));
  const performance = (input: PerformanceFilters) => {
    if (options.performance) return options.performance(input);
    const db = new DatabaseSync(':memory:'); try { return getPerformance(db, input); } finally { db.close(); }
  };
  server.registerTool('social_performance', { description: 'Analyze imported daily social observations or explicitly selected fictional examples. Missing metrics stay unknown. No invented live data.', inputSchema: performanceFilters.shape, annotations: local }, input => output(performance(performanceFilters.parse(input))));
  server.registerTool('social_keywords', { description: 'Separate measured query-level clicks/impressions/CTR from views of posts tagged with a topic. Topic totals are not search volume.', inputSchema: performanceFilters.shape, annotations: local }, input => { const data = performance(performanceFilters.parse(input)); return output({ dataset: data.dataset, period: data.period, queries: data.queries, topics: data.topics, coverage: data.coverage, disclosure: data.disclosure }); });
  server.registerTool('similar_content', { description: 'Compare related imported content by lexical title/topic overlap and observed performance. Same-platform comparison is default. Not semantic embeddings.', inputSchema: { ...performanceFilters.shape, referenceId: z.string().min(1).max(500), scope: z.enum(['platform', 'all']).default('platform') }, annotations: local }, input => output(similarContent(performance(performanceFilters.parse(input)), input.referenceId, input.scope)));
  server.registerTool('performance_report', { description: 'Return a source-aware social performance report with metrics, trends, topics, competitors, dates and missing-data coverage.', inputSchema: performanceFilters.shape, annotations: local }, input => output({ generatedAt: new Date().toISOString(), report: performance(performanceFilters.parse(input)) }));
  function ranksFor(domain: string) { const data = workspace() as { projects?: { id: number; domain: string }[]; ranks?: { project_id: number }[] }; const ids = new Set((data.projects || []).filter(project => project.domain === normalizeDomain(domain)).map(project => project.id)); return (data.ranks || []).filter(rank => ids.has(rank.project_id)); }
  server.registerTool('rank_tracking', { description: 'Read saved demo rank baselines for a domain. No live SERP requests or tracking writes.', inputSchema: domainInput, annotations: local }, ({ domain }) => output({ provenance: 'demo', domain: normalizeDomain(domain), ranks: ranksFor(domain) }));
  server.registerTool('seo_report', { description: 'Whole-domain SEO snapshot and saved rank baselines. Web-index metrics are synthetic examples; social data is available through performance_report.', inputSchema: domainInput, annotations: local }, ({ domain }) => output({ analysis: overview(domain), ranks: ranksFor(domain), disclosure: 'Synthetic web SEO metrics and saved demo positions, not a live index.' }));
  server.registerTool('youtube_research', { description: 'Explicit live public YouTube keyword discovery. Uses server API key and consumes quota. Returns lifetime video counters, not search volume or private analytics.', inputSchema: youtubeInput.shape, annotations: { ...local, openWorldHint: true } }, async input => output(await (options.research || createYouTubeProvider().research)(input)));
  return server;
}
