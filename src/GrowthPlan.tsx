import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Rocket } from 'lucide-react';
import type { WebReport } from '../shared/web-data';
import { openHealthTab } from './lib';
import { findOpportunities } from '../shared/opportunities';

type Action = { id: string; title: string; why: string; steps: string[]; impact: 'High' | 'Medium'; effort: string; href: string; tool: string; score: number; tab?: 'issues' | 'pages' | 'ai' | 'speed' };
type Query = WebReport['queries'][number];

const list = (rows: Query[], count = 3) => rows.slice(0, count).map(row => `“${row.query}”`).join(', ');
const month = () => new Date().toISOString().slice(0, 7);

export function buildGrowthPlan(report: WebReport): Action[] {
  const site = report.site;
  const failed = (name: string) => site?.audit.checks.some(check => check.name === name && !check.passed) ?? false;
  const { lowCtr, striking, gaps, questions } = findOpportunities(report.queries);
  const dropped = report.ranks.filter(row => row.change !== null && row.change < 0);
  const issues = site?.pageIssues || [];
  const pagesWith = (type: string) => [...new Set(issues.filter(issue => issue.type === type).map(issue => issue.url))];
  const brokenLinks = site?.pageIssues ? pagesWith('Broken page') : site?.warnings.filter(warning => warning.startsWith('Broken internal link')) || [];
  const aiFailed = (id: string) => site?.ai?.checks.some(check => check.id === id && !check.passed) ?? false;
  const blockedAi = site?.ai?.bots.filter(bot => bot.purpose === 'search' && !bot.allowed) || [];
  const speed = report.pageSpeed?.mobile;
  const signals = site?.speed;
  const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };
  const few = (urls: string[]) => urls.slice(0, 3).map(pathOf).join(', ') + (urls.length > 3 ? ` and ${urls.length - 3} more` : '');
  const hosts = report.totals.referringHosts ?? 0;
  const actions: Action[] = [];
  const add = (action: Action | false) => { if (action) actions.push(action); };

  add((failed('Indexability declaration') || site?.robots.allowed === false) && { id: 'indexing', title: 'Let Google index your homepage', impact: 'High', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 100,
    why: site?.robots.allowed === false ? 'robots.txt blocks the homepage, so it cannot appear in search.' : 'The homepage has a noindex robots tag, so Google is told to leave it out of search.',
    steps: ['Remove “noindex” from the robots meta tag or the robots.txt Disallow rule.', 'Ask Google to recrawl the page with URL Inspection in Search Console.'] });
  add(lowCtr.length > 0 && { id: 'ctr', title: `Rewrite titles for ${lowCtr.length} queries that get seen but not clicked`, impact: 'High', effort: '1 hour', href: '#keyword-research', tool: 'Keywords', score: 95,
    why: `You already rank on page one for ${list(lowCtr)}, but fewer people click than usual for that position. Better titles turn existing impressions into visits fastest.`,
    steps: ['Put the exact query near the start of the page title.', 'Add a clear benefit, price, location or year to the title and description.', 'Keep titles under 60 characters so they are not cut off.'] });
  add(striking.length > 0 && { id: 'striking', title: `Push ${striking.length} page-two keywords onto page one`, impact: 'High', effort: 'Half day', href: '#keyword-research', tool: 'Keywords', score: 90,
    why: `${list(striking)} sit at positions 8–20. Small improvements here move them into the top results, where most clicks happen.`,
    steps: ['Find the page that ranks for each query.', 'Add a section that answers the query directly, using the phrase in a subheading.', 'Link to that page from your homepage or menu with the query as anchor text.'] });
  add((!site?.title || failed('Page title')) && { id: 'title', title: 'Give your homepage a clear, keyword-led title', impact: 'High', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 85,
    why: site?.title ? `The current title is ${site.title.length} characters: “${site.title}”. Search results show about 15–65 characters.` : 'The homepage has no title, which is the main text people click in search results.',
    steps: ['Lead with what you offer and who it is for, e.g. “Handmade Batik Dresses NZ | Brand”.', 'Keep it between 15 and 65 characters.'] });
  add(gaps.length > 0 && { id: 'gaps', title: `Create pages for ${Math.min(gaps.length, 3)} topics people already search`, impact: 'High', effort: 'Half day', href: '#keyword-research', tool: 'Keywords', score: 80,
    why: `Google shows you for ${list(gaps)} but beyond page two. A page dedicated to each topic usually ranks far better than an incidental mention.`,
    steps: ['Write one focused page per topic, with the phrase in the title, H1 and URL.', 'Answer the common questions people ask about it.', 'Link to the new page from related pages on your site.'] });
  add(dropped.length > 0 && { id: 'dropped', title: `Recover ${dropped.length} keywords that slipped in rankings`, impact: 'High', effort: '1 hour', href: '#rank-tracking', tool: 'Rankings', score: 78,
    why: `${dropped.slice(0, 3).map(row => `“${row.keyword}” (${row.previous} → ${row.position})`).join(', ')} dropped since your last observation.`,
    steps: ['Check the ranking page still loads and has not lost content.', 'Compare it with the pages now ranking above it and fill missing topics.', 'Refresh the page date and content if it has become outdated.'] });
  const noindexPages = pagesWith('Noindex page').filter(url => url !== site?.finalUrl);
  add(noindexPages.length > 0 && { id: 'noindex-pages', title: `Unblock ${noindexPages.length} page${noindexPages.length === 1 ? '' : 's'} hidden from Google`, impact: 'High', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 97,
    why: `${few(noindexPages)} ${noindexPages.length === 1 ? 'has' : 'have'} a noindex tag, so ${noindexPages.length === 1 ? 'it' : 'they'} can never bring search traffic.`,
    steps: ['Check whether each page should be in search.', 'Remove noindex from pages that should rank.'] });
  add(blockedAi.length > 0 && { id: 'ai-bots', title: `Let ${blockedAi.length === 1 ? blockedAi[0].product : 'AI answer engines'} read your site`, impact: 'High', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 92,
    why: `robots.txt blocks ${blockedAi.map(bot => bot.agent).join(', ')}. Blocked sites cannot be cited or linked in ${[...new Set(blockedAi.map(bot => bot.owner))].join(', ')} answers.`,
    steps: [`Edit robots.txt and remove the Disallow rules for ${blockedAi.map(bot => bot.agent).join(', ')}.`, 'Keep training crawlers like GPTBot blocked if you prefer — they do not power search answers.'] });
  const dupTitles = pagesWith('Duplicate title');
  add(dupTitles.length > 1 && { id: 'dup-titles', title: `Give ${dupTitles.length} pages their own unique title`, impact: 'High', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 83,
    why: `${few(dupTitles)} share the same title, so Google cannot tell which page to show for which search.`,
    steps: ['Write a title for each page naming its specific product or topic.', 'Put the most important words first and keep under 60 characters.'] });
  const missingDescriptions = pagesWith('Missing description');
  add(missingDescriptions.length > 1 && { id: 'descriptions', title: `Write descriptions for ${missingDescriptions.length} pages`, impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 69,
    why: `${few(missingDescriptions)} have no meta description, so Google picks random text for the search snippet.`,
    steps: ['Summarise each page in one or two sentences with its main keyword.', 'End with a reason to click.'] });
  const thin = pagesWith('Thin content');
  add(thin.length > 0 && { id: 'thin', title: `Add useful content to ${thin.length} thin page${thin.length === 1 ? '' : 's'}`, impact: 'Medium', effort: 'Half day', href: '#site-audit', tool: 'Site health', score: 63,
    why: `${few(thin)} have under 250 words of text. Thin pages rarely rank and are hard for AI tools to quote.`,
    steps: ['Describe the product or service in detail: materials, sizes, uses, prices.', 'Answer two or three common customer questions on the page.'] });
  const nonCanonical = pagesWith('Links to non-canonical URL');
  add(nonCanonical.length > 2 && { id: 'canonical-links', title: `Point ${nonCanonical.length} internal links at each page’s main address`, impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 66,
    why: `Your menus link to addresses like ${few(nonCanonical)}, but those pages name a different main (canonical) address. Google has to crawl both and may split ranking signals.`,
    steps: ['Update menu and in-page links to use the canonical address (for example /services instead of /services.html).', 'Add a 301 redirect from the old address to the canonical one.'] });
  const longTitles = pagesWith('Title too long');
  add(longTitles.length > 0 && { id: 'long-titles', title: `Shorten ${longTitles.length} title${longTitles.length === 1 ? '' : 's'} that get cut off`, impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 53,
    why: `${few(longTitles)} have titles over 65 characters, so Google truncates them with “…” in results.`,
    steps: ['Keep each title under 60 characters.', 'Put the keyword first and the brand last.'] });
  const missingH1 = pagesWith('Missing H1');
  add(missingH1.length > 1 && { id: 'h1s', title: `Add a main heading to ${missingH1.length} pages`, impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 61,
    why: `${few(missingH1)} have no H1, which tells Google and AI tools what the page is about.`, steps: ['Add one H1 per page naming its topic.'] });
  add(questions.length > 0 && aiFailed('questions') && { id: 'faq', title: 'Answer the questions people search in an FAQ', impact: 'High', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 79,
    why: `People already find you with questions like ${list(questions)}. Direct answers are what AI Overviews and ChatGPT quote.`,
    steps: ['Add an FAQ section with these exact questions as headings.', 'Answer each in 40–60 words, starting with the answer.', 'Generate FAQPage schema in Site health → AI search.'] });
  add(!(questions.length > 0) && aiFailed('questions') && aiFailed('schema-content') && { id: 'faq', title: 'Add an FAQ that AI answers can quote', impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 57,
    why: 'Your homepage has no question-style headings or FAQ schema. ChatGPT, Perplexity and Google AI Overviews favour clear question-and-answer content.',
    steps: ['List the 5 questions customers ask most.', 'Answer each in 40–60 words, starting with the answer.', 'Generate FAQPage schema in Site health → AI search.'] });
  add(site?.llms?.found === false && { id: 'llms', title: 'Publish an llms.txt guide for AI tools', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 46,
    why: 'llms.txt gives AI assistants a short map of your most useful pages. Waypoint can write it for you from your crawl.',
    steps: ['Open Site health → AI search and expand “llms.txt”.', 'Download the file and upload it to your website root.'] });
  add(!!speed && speed.score !== null && speed.score < 90 && { id: 'speed-real', title: speed.score < 50 ? 'Fix your slow mobile pages' : 'Speed up your mobile pages', impact: speed.score < 50 ? 'High' : 'Medium', effort: 'Half day', href: '#site-audit', tool: 'Site health', score: speed.score < 50 ? 81 : 52,
    why: `Google scored your homepage ${speed.score}/100 on mobile${speed.field?.lcpMs ? `; real visitors wait ${(speed.field.lcpMs / 1000).toFixed(1)} s for the main content` : speed.lab.lcpMs ? `; the main content appears after ${(speed.lab.lcpMs / 1000).toFixed(1)} s` : ''}. Slow pages lose visitors and rankings.`,
    steps: speed.opportunities.length ? speed.opportunities.slice(0, 3).map(item => item.title) : ['Compress large images and serve WebP.', 'Defer non-essential scripts.'] });
  add(!report.search && { id: 'connect', title: 'Connect Search Console to see the searches that reach you', impact: 'High', effort: '15 min', href: '#integrations', tool: 'Connections', score: 75,
    why: 'Without query data, Waypoint can only check your pages. Search Console shows which searches show your site and which ones to grow.',
    steps: ['Verify your site in Google Search Console if you have not already.', 'Export Performance → Queries as CSV, or connect Google under Connections.', 'Import it here — your plan updates with keyword-specific actions.'] });
  add(failed('Meta description') && !(missingDescriptions.length > 1) && { id: 'description', title: 'Write a meta description that sells the click', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 70,
    why: site?.description ? `The description is ${site.description.length} characters; aim for 50–165.` : 'Without a description Google picks random page text for your search snippet.',
    steps: ['Summarise the page in one or two sentences with your main keyword.', 'End with a reason to click, such as free shipping or a quick answer.'] });
  add(brokenLinks.length > 0 && { id: 'broken', title: `Fix ${brokenLinks.length} broken internal link${brokenLinks.length === 1 ? '' : 's'}`, impact: 'Medium', effort: '15 min', href: '#backlink-analysis', tool: 'Links', score: 68,
    why: 'Broken links waste crawl time and send visitors to dead ends.', steps: ['Open Site health → Issues to see each broken URL.', 'Update the link or redirect the old address to the right page.'] });
  add(failed('Primary heading') && !(missingH1.length > 1) && { id: 'h1', title: 'Use one clear main heading on the homepage', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 65,
    why: site?.audit.checks.find(check => check.name === 'Primary heading')?.detail || 'The homepage needs one H1 that names your main topic.',
    steps: ['Keep exactly one H1 that states what the page is about.', 'Turn other large headings into H2s.'] });
  add(!!site && site.wordCount < 300 && !thin.length && { id: 'content', title: 'Add more helpful text to your homepage', impact: 'Medium', effort: '1 hour', href: '#keyword-research', tool: 'Keywords', score: 62,
    why: `The homepage has ${site.wordCount} words. Thin pages give Google little to match against searches.`,
    steps: ['Describe your main products or services in plain language.', 'Add a short FAQ answering what customers ask most.'] });
  add(!!site && !site.robots.sitemaps.length && { id: 'sitemap', title: 'Submit an XML sitemap', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 60,
    why: 'No sitemap is listed in robots.txt, so Google may find new pages slowly.',
    steps: ['Generate sitemap.xml with your CMS or a sitemap plugin.', 'Add “Sitemap: https://yoursite/sitemap.xml” to robots.txt.', 'Submit it under Sitemaps in Search Console.'] });
  add(failed('Viewport') && { id: 'mobile', title: 'Make the homepage mobile-friendly', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 58,
    why: 'There is no responsive viewport tag. Google ranks using the mobile version of your site.', steps: ['Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head.'] });
  add(hosts < 10 && { id: 'links', title: 'Earn links from 5 relevant websites', impact: 'Medium', effort: 'Ongoing', href: '#backlink-analysis', tool: 'Links', score: 55,
    why: report.backlinks ? `Your supplied link list has ${hosts} referring site${hosts === 1 ? '' : 's'}. Links from trusted sites help Google trust yours.` : 'Links from other trusted sites are one of the strongest ranking signals.',
    steps: ['List suppliers, partners, local directories and associations that could link to you.', 'Offer a useful resource, testimonial or guest article in return.', 'Import the links you earn to track them here.'] });
  add(!!site && (site.ai ? aiFailed('schema-org') : !site.structuredDataTypes.length) && { id: 'schema', title: 'Add structured data for richer search results', impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 50,
    why: 'No structured data was found. Schema can add ratings, prices or business details to your listing.', steps: ['Open Site health → AI search and fill in “Structured data”.', 'Paste the generated code into your homepage <head>.', 'Test it with Google’s Rich Results Test.'] });
  add(failed('Image alternatives') && { id: 'alt', title: 'Describe your images with alt text', impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 45,
    why: `${site?.images.missingAlt} of ${site?.images.total} images have no alt text, so they cannot rank in image search.`, steps: ['Write a short, specific description for each meaningful image.', 'Leave decorative images with an empty alt="".'] });
  add(!report.tracks.length && { id: 'track', title: 'Track your 5 most important keywords', impact: 'Medium', effort: '15 min', href: '#rank-tracking', tool: 'Rankings', score: 40,
    why: 'Tracking a few money keywords shows whether this month’s work is paying off.', steps: ['Add five keywords customers use to find businesses like yours.', 'Import observed positions each week.'] });
  add(failed('Canonical URL') && { id: 'canonical', title: 'Declare a canonical URL', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 35,
    why: 'Without a canonical, duplicate versions of the page can split ranking signals.', steps: ['Add <link rel="canonical" href="https://yoursite/"> to the homepage head.'] });
  add(failed('Document language') && { id: 'lang', title: 'Declare your page language', impact: 'Medium', effort: '15 min', href: '#site-audit', tool: 'Site health', score: 30,
    why: 'A language attribute helps Google serve the page to the right audience.', steps: ['Add lang="en" (or your language) to the <html> tag.'] });
  add(!speed && { id: 'speed', title: 'Check and fix your mobile page speed', impact: 'Medium', effort: '1 hour', href: '#site-audit', tool: 'Site health', score: 28,
    why: signals && (signals.blockingScripts || signals.thirdPartyScripts >= 5 || signals.imagesWithoutSize) ? `The crawl found ${[signals.blockingScripts && `${signals.blockingScripts} render-blocking scripts`, signals.thirdPartyScripts >= 5 && `${signals.thirdPartyScripts} third-party scripts`, signals.imagesWithoutSize && `${signals.imagesWithoutSize} images without dimensions`].filter(Boolean).join(', ')}. Run Google’s free speed test to see the real impact.` : 'Slow pages lose visitors before they load and can hold back rankings.',
    steps: ['Open Site health → Speed and click “Test mobile speed”.', 'Fix the biggest savings Google lists first.', 'Compress images, serve WebP and defer non-essential scripts.'] });
  add({ id: 'internal', title: 'Link your most important pages from the homepage', impact: 'Medium', effort: '15 min', href: '#backlink-analysis', tool: 'Links', score: 25,
    why: site ? `The homepage links to ${site.internalLinks.length} internal pages. Pages linked from the homepage get crawled more often and rank more easily.` : 'Pages linked from the homepage get crawled more often and rank more easily.',
    steps: ['Pick the 3–5 pages that earn you money or leads.', 'Link to them from the homepage with descriptive anchor text, not “click here”.'] });
  add({ id: 'business', title: 'Claim and complete your Google Business Profile', impact: 'Medium', effort: '1 hour', href: '#integrations', tool: 'Connections', score: 22,
    why: 'For local searches, the map listing often gets more clicks than the website results.', steps: ['Claim your profile at business.google.com.', 'Add categories, hours, photos and your website link.', 'Ask happy customers for reviews.'] });
  add({ id: 'refresh', title: 'Update your best page with fresh detail', impact: 'Medium', effort: '1 hour', href: '#keyword-research', tool: 'Keywords', score: 21,
    why: 'Updating a page that already gets traffic is often quicker than ranking a new one.', steps: ['Pick the page that brings the most visits or sales.', 'Add current prices, photos, examples or FAQs.', 'Check the title still matches what people search for.'] });
  add({ id: 'fresh', title: 'Publish one new helpful article this month', impact: 'Medium', effort: 'Half day', href: '#keyword-research', tool: 'Keywords', score: 20,
    why: 'Regular, useful content gives Google new pages to rank and gives people a reason to link to you.', steps: ['Pick a question customers often ask.', 'Answer it in depth with photos or examples.', 'Share it on social and link it from a related page.'] });
  add({ id: 'social', title: 'Share your best pages on social channels', impact: 'Medium', effort: 'Ongoing', href: '#social-seo', tool: 'Social', score: 15,
    why: 'Social posts bring early visits and help new pages get discovered and linked.', steps: ['Post your top pages with a clear caption and link.', 'Check Social to see which posts drive engagement.'] });

  return actions.sort((a, b) => b.score - a.score).slice(0, 10);
}

export default function GrowthPlan({ report }: { report: WebReport }) {
  const plan = useMemo(() => buildGrowthPlan(report), [report]);
  const key = `waypoint-plan-${report.domain}-${month()}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setDone([]); } }, [key]);
  function toggle(id: string) {
    const next = done.includes(id) ? done.filter(item => item !== id) : [...done, id];
    setDone(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }
  const completed = plan.filter(action => done.includes(action.id)).length;
  const monthName = new Date().toLocaleString(undefined, { month: 'long' });

  return <section className="panel growth-plan" data-growth-plan="true">
    <div className="growth-head">
      <span className="growth-icon"><Rocket size={20} /></span>
      <div><h2>Your top 10 actions for {monthName}</h2><p>Ranked by likely traffic gain for {report.domain}. Start at number 1.</p></div>
      <div className="growth-progress" aria-label={`${completed} of ${plan.length} done`}><strong>{completed}/{plan.length}</strong><span>done</span><i style={{ width: `${plan.length ? completed / plan.length * 100 : 0}%` }} /></div>
    </div>
    <ol className="growth-list">
      {plan.map((action, index) => {
        const isDone = done.includes(action.id);
        return <li key={action.id} className={isDone ? 'done' : ''}>
          <button className="growth-check" aria-pressed={isDone} aria-label={`Mark “${action.title}” ${isDone ? 'not done' : 'done'}`} onClick={() => toggle(action.id)}>{isDone ? <Check size={15} /> : index + 1}</button>
          <details>
            <summary><span className="growth-title">{action.title}</span><span className="growth-tags"><em className={action.impact === 'High' ? 'high' : ''}>{action.impact} impact</em><em>{action.effort}</em></span></summary>
            <div className="growth-body">
              <p>{action.why}</p>
              <ol>{action.steps.map(step => <li key={step}>{step}</li>)}</ol>
              <a className="text-button" href={action.href} onClick={() => { const tab = action.tab || (action.href === '#site-audit' ? (/ai-|llms|faq|schema/.test(action.id) ? 'ai' : /speed/.test(action.id) ? 'speed' : 'issues') : undefined); if (tab) openHealthTab(tab); }}>Open {action.tool} <ChevronRight size={14} /></a>
            </div>
          </details>
        </li>;
      })}
    </ol>
    <p className="web-source-note">Ranking uses your scan and imported data plus common SEO practice. It is guidance, not a traffic forecast. Re-run Analyze website after changes to refresh the plan.</p>
  </section>;
}
