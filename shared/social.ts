import { z } from 'zod';

export const webUrl = z.string().trim().max(2048).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, 'Use an absolute HTTP(S) URL without credentials.');
export const socialAuditInput = z.object({ html: z.string().min(10).max(900000), pageUrl: webUrl });
export const metadataInput = z.object({
  pageUrl: webUrl, title: z.string().trim().min(1).max(150), description: z.string().trim().min(1).max(400),
  imageUrl: webUrl, imageAlt: z.string().trim().min(1).max(420), siteName: z.string().trim().max(80),
  type: z.enum(['website', 'article']), card: z.enum(['summary', 'summary_large_image']),
});
export type SocialMetadata = z.infer<typeof metadataInput>;
export type SocialAudit = {
  source: 'submitted-html'; checkedAt: string; score: number;
  checks: { name: string; passed: boolean; detail: string }[];
  openGraph: { title: string; description: string; image: string; imageAlt: string; url: string; type: string; siteName: string };
  xCard: { title: string; description: string; image: string; imageAlt: string; card: string };
};
const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
export function buildSocialMetadata(input: z.input<typeof metadataInput>): string {
  const data = metadataInput.parse(input);
  const tags = [
    ['property', 'og:title', data.title], ['property', 'og:description', data.description],
    ['property', 'og:type', data.type], ['property', 'og:url', data.pageUrl],
    ['property', 'og:image', data.imageUrl], ['property', 'og:image:alt', data.imageAlt],
    ['property', 'og:site_name', data.siteName], ['name', 'twitter:card', data.card],
    ['name', 'twitter:title', data.title], ['name', 'twitter:description', data.description],
    ['name', 'twitter:image', data.imageUrl], ['name', 'twitter:image:alt', data.imageAlt],
  ].filter(([, , value]) => value);
  return tags.map(([kind, name, value]) => `<meta ${kind}="${name}" content="${attribute(value)}" />`).join('\n');
}
export const campaignInput = z.object({
  url: webUrl, source: z.enum(['instagram', 'linkedin', 'facebook', 'x', 'tiktok', 'youtube', 'pinterest', 'threads']),
  medium: z.enum(['social', 'paid_social']), campaign: z.string().trim().min(1).max(120), content: z.string().trim().max(120).default(''),
});
export function buildCampaignLink(input: z.input<typeof campaignInput>) {
  const data = campaignInput.parse(input); const url = new URL(data.url);
  url.searchParams.set('utm_source', data.source); url.searchParams.set('utm_medium', data.medium);
  url.searchParams.set('utm_campaign', data.campaign);
  if (data.content) url.searchParams.set('utm_content', data.content); else url.searchParams.delete('utm_content');
  return { url: url.toString(), source: 'user-input' as const };
}
export const captionInput = z.object({
  caption: z.string().trim().min(1).max(10000), keyword: z.string().trim().min(2).max(100),
  platform: z.enum(['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Facebook', 'Pinterest']),
});
export function reviewCaption(input: z.input<typeof captionInput>) {
  const data = captionInput.parse(input);
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
  const hashtags = data.caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  const normalizedTags = hashtags.map(normalize); const duplicates = [...new Set(normalizedTags.filter((tag, i) => normalizedTags.indexOf(tag) !== i))];
  const prose = normalize(data.caption.replace(/#[\p{L}\p{N}_]+/gu, ''));
  const keyword = normalize(data.keyword);
  const checks = [
    { name: 'Topic in the caption', passed: prose.includes(keyword), detail: 'Use the main phrase naturally in the prose, not only in a hashtag.' },
    { name: 'Clear opening', passed: prose.slice(0, 160).includes(keyword), detail: 'Editorial heuristic: introduce the topic within the first 160 characters.' },
    { name: 'Distinct hashtags', passed: duplicates.length === 0, detail: duplicates.length ? `Repeated: ${duplicates.join(', ')}. Remove duplicate tags.` : 'No repeated hashtags found. Relevance still needs a human review.' },
    { name: 'Readable hashtag count', passed: hashtags.length <= 5, detail: 'Editorial heuristic: start with at most five specific tags. This is not a platform limit or ranking signal.' },
    { name: 'Useful context', passed: prose.trim().length >= 40, detail: 'Editorial heuristic: add at least 40 characters of useful context before publishing.' },
  ];
  return { source: 'submitted-caption' as const, platform: data.platform, characters: [...data.caption].length, hashtags, duplicates, checks, score: Math.round(checks.filter(c => c.passed).length / checks.length * 100), disclosure: 'Editorial checklist, not a reach forecast, trend lookup, or platform ranking score.' };
}
export type CaptionReview = ReturnType<typeof reviewCaption>;
