import { load } from 'cheerio';
import { socialAuditInput, webUrl, type SocialAudit } from '../shared/social.js';
export function auditSocial(input: { html: string; pageUrl: string }): SocialAudit {
  const { html, pageUrl } = socialAuditInput.parse(input); const $ = load(html);
  // First value wins, matching Open Graph's array preference. Only head metadata is read.
  const metadata = new Map<string, string>();
  let imageGroup = 0;
  $('head meta').each((_, el) => {
    const key = ($(el).attr('property') || $(el).attr('name') || '').trim().toLowerCase();
    if (key === 'og:image' || key === 'og:image:url') imageGroup++;
    if (key.startsWith('og:image:') && key !== 'og:image:url' && imageGroup !== 1) return;
    if (!metadata.has(key)) metadata.set(key, ($(el).attr('content') || '').trim());
  });
  const get = (key: string) => metadata.get(key) || '';
  const og = { title: get('og:title'), description: get('og:description'), image: get('og:image') || get('og:image:url'), imageAlt: get('og:image:alt'), url: get('og:url'), type: get('og:type'), siteName: get('og:site_name') };
  const xCard = { title: get('twitter:title') || og.title, description: get('twitter:description') || og.description, image: get('twitter:image') || og.image, imageAlt: get('twitter:image:alt') || og.imageAlt, card: get('twitter:card') };
  const validUrl = (value: string) => webUrl.safeParse(value).success;
  const checks = [
    { name: 'Open Graph title', passed: Boolean(og.title), detail: 'Add og:title to name the shared page.' },
    { name: 'Open Graph type', passed: Boolean(og.type), detail: 'Declare the content type with og:type.' },
    { name: 'Open Graph URL', passed: validUrl(og.url), detail: 'Use an absolute HTTP(S) og:url without credentials.' },
    { name: 'Open Graph image', passed: validUrl(og.image), detail: 'Use an absolute HTTP(S) image URL. The image is not fetched or checked.' },
    { name: 'Share description', passed: Boolean(og.description), detail: 'Add og:description to explain why the page is useful.' },
    { name: 'Image alternative', passed: Boolean(og.imageAlt), detail: 'Describe the share image with og:image:alt.' },
    { name: 'URL matches the page', passed: (() => { try { const a = new URL(og.url); const b = new URL(pageUrl); a.hash = ''; b.hash = ''; return a.href === b.href; } catch { return false; } })(), detail: 'Check that og:url matches the supplied page URL, excluding fragments.' },
    { name: 'X card layout', passed: ['summary', 'summary_large_image'].includes(xCard.card), detail: 'Declare summary or summary_large_image for this toolkit’s X-style preview. Player/app cards are outside this preview.' },
  ];
  return { source: 'submitted-html', checkedAt: new Date().toISOString(), score: Math.round(checks.filter(c => c.passed).length / checks.length * 100), checks, openGraph: og, xCard };
}
