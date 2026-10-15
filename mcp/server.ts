import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeDomain } from '../server/app.js';
import { demoProvider } from '../server/provider.js';
import { auditHtml } from '../server/audit.js';
import { auditSocial } from '../server/social.js';
import { socialAuditInput, metadataInput, buildSocialMetadata, captionInput, reviewCaption, campaignInput, buildCampaignLink } from '../shared/social.js';
const output = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
export function createWaypointMcp(workspace: () => unknown = () => ({ projects: [], ranks: [] })) {
  const server = new McpServer({ name: 'waypoint-seo', version: '0.2.0' });
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
  return server;
}
