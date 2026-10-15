import { load } from 'cheerio';
import type { Audit } from '../shared/types.js';
export function auditHtml(html: string): Audit {
  const $ = load(html); const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const images = $('img').toArray(); const missing = images.filter(el => $(el).attr('alt') === undefined).length;
  const checks: Audit['checks'] = [
    { name: 'Page title', passed: title.length >= 15 && title.length <= 65, detail: `Title length: ${title.length}. Aim for a descriptive title of 15–65 characters.`, severity: 'error' },
    { name: 'Meta description', passed: description.length >= 50 && description.length <= 165, detail: `Description length: ${description.length}. Aim for 50–165 characters.`, severity: 'warning' },
    { name: 'Primary heading', passed: $('h1').length === 1, detail: `Found ${$('h1').length} H1 headings. Use one clear primary heading.`, severity: 'error' },
    { name: 'Image alternatives', passed: missing === 0, detail: `${missing} of ${images.length} images have no alt attribute. Empty alt is valid for decorative images.`, severity: 'warning' },
    { name: 'Canonical URL', passed: (() => { try { return ['https:', 'http:'].includes(new URL($('link[rel="canonical"]').attr('href') || '').protocol); } catch { return false; } })(), detail: 'Declare an absolute HTTP(S) canonical URL.', severity: 'warning' },
    { name: 'Viewport', passed: /width\s*=\s*device-width/i.test($('meta[name="viewport"]').attr('content') || ''), detail: 'Include width=device-width for responsive layouts.', severity: 'warning' },
    { name: 'Document language', passed: Boolean($('html').attr('lang')?.trim()), detail: 'Declare the document language on the html element.', severity: 'warning' },
    { name: 'Indexability declaration', passed: !/noindex/i.test($('meta[name="robots"]').attr('content') || ''), detail: 'Checks the submitted robots meta tag only; headers and robots.txt are outside this audit.', severity: 'error' },
  ];
  return { score: Math.round(checks.filter(c => c.passed).length / checks.length * 100), checks, source: 'submitted-html', checkedAt: new Date().toISOString() };
}
