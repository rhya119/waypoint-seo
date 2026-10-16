import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Bot, Check, CircleX, Gauge, Search, X } from 'lucide-react';
import type { SiteScan } from '../shared/site-scan';
import type { WebReport } from '../shared/web-data';
import { rating, vitals, type PageSpeedResult } from '../shared/research';
import { api, csv, download } from './lib';
import Generators from './Generators';
import './site-health.css';

type Tab = 'issues' | 'pages' | 'ai' | 'speed';
const path = (url: string) => { try { const u = new URL(url); return u.pathname + u.search || '/'; } catch { return url; } };
const ms = (value: number | null) => value === null ? '—' : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;

export default function SiteHealth({ site, report, refresh, initialTab = 'issues' }: { site: SiteScan; report: WebReport; refresh: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(() => { try { const saved = sessionStorage.getItem('waypoint-health-tab') as Tab | null; sessionStorage.removeItem('waypoint-health-tab'); return saved || initialTab; } catch { return initialTab; } });
  useEffect(() => {
    const listen = (event: Event) => { setTab((event as CustomEvent<Tab>).detail); try { sessionStorage.removeItem('waypoint-health-tab'); } catch { /* optional */ } document.querySelector('[data-site-health]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    window.addEventListener('waypoint-health-tab', listen);
    return () => window.removeEventListener('waypoint-health-tab', listen);
  }, []);
  const issues = site.pageIssues || [];
  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'issues', label: 'Issues', badge: String(issues.length) },
    { id: 'pages', label: 'Pages', badge: String(site.pageChecks?.length || 1) },
    { id: 'ai', label: 'AI search', badge: site.ai ? site.ai.grade : undefined },
    { id: 'speed', label: 'Speed', badge: report.pageSpeed?.mobile?.score != null ? String(report.pageSpeed.mobile.score) : undefined },
  ];
  return <section className="panel health" data-site-health="true">
    <div className="health-tabs" role="tablist" aria-label="Site health sections">
      {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.badge && <span>{item.badge}</span>}</button>)}
    </div>
    {tab === 'issues' && <IssuesTab site={site} />}
    {tab === 'pages' && <PagesTab site={site} />}
    {tab === 'ai' && <AiTab site={site} />}
    {tab === 'speed' && <SpeedTab site={site} report={report} refresh={refresh} />}
  </section>;
}

function IssuesTab({ site }: { site: SiteScan }) {
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [term, setTerm] = useState('');
  const issues = (site.pageIssues || []).filter((issue) => (severity === 'all' || issue.severity === severity) && `${issue.url} ${issue.type} ${issue.detail}`.toLowerCase().includes(term.toLowerCase()));
  const groups = useMemo(() => {
    const map = new Map<string, typeof issues>();
    for (const issue of issues) map.set(issue.type, [...(map.get(issue.type) || []), issue]);
    return [...map].sort((a, b) => (a[1][0].severity === 'error' ? 0 : 1) - (b[1][0].severity === 'error' ? 0 : 1) || b[1].length - a[1].length);
  }, [issues]);
  const all = site.pageIssues || [];
  return <div className="health-body">
    <div className="health-summary">
      <div><strong>{all.filter((issue) => issue.severity === 'error').length}</strong><span>errors</span></div>
      <div><strong>{all.filter((issue) => issue.severity === 'warning').length}</strong><span>warnings</span></div>
      <div><strong>{site.pageChecks?.length || 1}</strong><span>pages crawled</span></div>
    </div>
    <div className="health-filter">
      <label className="health-search"><Search size={15} /><input type="search" aria-label="Filter issues" placeholder="Filter by page or issue" value={term} onChange={(event) => setTerm(event.target.value)} />{term && <button className="icon-button" aria-label="Clear filter" onClick={() => setTerm('')}><X size={14} /></button>}</label>
      <div className="health-chips">{(['all', 'error', 'warning'] as const).map((value) => <button key={value} className={severity === value ? 'active' : ''} aria-pressed={severity === value} onClick={() => setSeverity(value)}>{value === 'all' ? 'All' : value === 'error' ? 'Errors' : 'Warnings'}</button>)}</div>
    </div>
    {groups.length ? <div className="health-groups">{groups.map(([type, list]) => <details key={type} open={groups.length <= 3}>
      <summary>{list[0].severity === 'error' ? <CircleX size={16} className="sev-error" /> : <AlertTriangle size={16} className="sev-warning" />}<span>{type}</span><em>{list.length} page{list.length === 1 ? '' : 's'}</em></summary>
      <ul>{list.slice(0, 100).map((issue, index) => <li key={index}><a href={issue.url} target="_blank" rel="noreferrer">{path(issue.url)}</a><span>{issue.detail}</span></li>)}</ul>
    </details>)}</div> : <p className="health-empty"><Check size={16} /> {all.length ? 'No issues match this filter.' : 'No page issues found in the crawled pages.'}</p>}
  </div>;
}

function PagesTab({ site }: { site: SiteScan }) {
  const [term, setTerm] = useState('');
  const counts = new Map<string, number>();
  for (const issue of site.pageIssues || []) counts.set(issue.url, (counts.get(issue.url) || 0) + 1);
  const pages = (site.pageChecks || []).filter((page) => `${page.url} ${page.title}`.toLowerCase().includes(term.toLowerCase()));
  return <div className="health-body">
    <div className="health-filter">
      <label className="health-search"><Search size={15} /><input type="search" aria-label="Filter pages" placeholder="Find a page by URL or title" value={term} onChange={(event) => setTerm(event.target.value)} /></label>
      <button className="text-button" onClick={() => download(`waypoint-${site.domain}-pages.csv`, csv([['url', 'status', 'title', 'words', 'h1', 'links_in', 'depth', 'issues'], ...(site.pageChecks || []).map((page) => [page.url, page.status ?? '', page.title, page.wordCount ?? '', page.h1Count, page.inlinks ?? '', page.depth ?? '', counts.get(page.url) || 0])]), 'text/csv')}><ArrowDownToLine size={14} /> Export CSV</button>
    </div>
    <div className="table-wrap"><table className="health-table"><thead><tr><th>Page</th><th>Status</th><th>Words</th><th>H1</th><th>Links in</th><th>Issues</th></tr></thead><tbody>
      {pages.map((page) => <tr key={page.url}>
        <td><a href={page.url} target="_blank" rel="noreferrer">{path(page.url)}</a><small>{page.error || page.title || 'Missing title'}</small></td>
        <td><span className={`status ${page.status && page.status < 300 ? 'ok' : 'bad'}`}>{page.status ?? '—'}</span></td>
        <td>{page.wordCount ?? '—'}</td><td>{page.error ? '—' : page.h1Count}</td><td>{page.inlinks ?? '—'}</td>
        <td>{counts.get(page.url) ? <strong className="issue-count">{counts.get(page.url)}</strong> : <Check size={15} className="sev-ok" />}</td>
      </tr>)}
    </tbody></table></div>
    <p className="web-source-note">Breadth-first crawl from the homepage, up to {site.pageChecks?.length || 1} pages, respecting robots.txt. “Links in” counts links from other crawled pages.</p>
  </div>;
}

function AiTab({ site }: { site: SiteScan }) {
  const ai = site.ai;
  if (!ai) return <div className="health-body"><p className="health-empty">Run Analyze website again to check AI search readiness.</p></div>;
  const categories = [...new Set(ai.checks.map((check) => check.category))];
  const search = ai.bots.filter((bot) => bot.purpose === 'search');
  const training = ai.bots.filter((bot) => bot.purpose === 'training');
  return <div className="health-body">
    <div className="ai-score">
      <div className={`ai-grade grade-${ai.grade}`}><strong>{ai.grade}</strong><span>{ai.score}/100</span></div>
      <div><h3>AI search readiness</h3><p>How easily ChatGPT, Claude, Perplexity and Google AI Overviews can read, understand and quote your site. Based on robots.txt, llms.txt and your homepage markup.</p></div>
    </div>
    <h4 className="health-subhead"><Bot size={15} /> Who can read your site</h4>
    {search.every((bot) => bot.allowed)
      ? <details className="web-details bots-ok"><summary><Check size={15} className="sev-ok" /> All {search.length} search and AI answer crawlers can read your site</summary><div className="bot-grid">{search.map((bot) => <div key={bot.agent} className="ok">{bot.product}</div>)}</div></details>
      : <div className="bot-grid">{search.map((bot) => <div key={bot.agent} className={bot.allowed ? 'ok' : 'blocked'} title={`${bot.owner} · ${bot.agent}`}>{bot.allowed ? <Check size={14} /> : <X size={14} />}<span>{bot.product}{!bot.allowed && ` — blocked (${bot.agent})`}</span></div>)}</div>}
    <details className="web-details"><summary>AI training crawlers ({training.filter((bot) => bot.allowed).length} of {training.length} allowed)</summary><p className="web-help">Blocking training crawlers is your choice and does not affect AI search answers.</p><div className="bot-grid">{training.map((bot) => <div key={bot.agent} className={bot.allowed ? 'ok' : 'neutral'}>{bot.allowed ? <Check size={14} /> : <X size={14} />}<span>{bot.agent} · {bot.owner}</span></div>)}</div></details>
    {categories.map((category) => <div key={category} className="ai-category">
      <h4 className="health-subhead">{category}<span>{ai.checks.filter((check) => check.category === category).reduce((sum, check) => sum + check.points, 0)}/{ai.checks.filter((check) => check.category === category).reduce((sum, check) => sum + check.max, 0)}</span></h4>
      {ai.checks.filter((check) => check.category === category).map((check) => <details key={check.id} className={`ai-check ${check.passed ? 'passed' : ''}`}>
        <summary>{check.passed ? <Check size={15} className="sev-ok" /> : <AlertTriangle size={15} className="sev-warning" />}<span>{check.name}</span><em>{check.points}/{check.max}</em></summary>
        <p>{check.detail}</p>{!check.passed && <p className="ai-fix"><strong>Fix:</strong> {check.fix}</p>}
      </details>)}
    </div>)}
    <Generators site={site} />
  </div>;
}

function SpeedTab({ site, report, refresh }: { site: SiteScan; report: WebReport; refresh: () => void }) {
  const [busy, setBusy] = useState<'' | 'mobile' | 'desktop'>('');
  const [error, setError] = useState('');
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [keyed, setKeyed] = useState<boolean | null>(null);
  useEffect(() => { api<{ pageSpeed?: { keyed: boolean } }>('/web/connections').then((r) => setKeyed(Boolean(r.pageSpeed?.keyed))).catch(() => setKeyed(null)); }, []);
  const result = report.pageSpeed?.[strategy];
  const run = (value: 'mobile' | 'desktop') => {
    setBusy(value); setError(''); setStrategy(value);
    void api('/web/pagespeed', { domain: site.domain, strategy: value }).then(refresh).catch((e: Error) => setError(e.message)).finally(() => setBusy(''));
  };
  const s = site.speed;
  const tips = s ? [
    s.blockingScripts > 0 && `${s.blockingScripts} script${s.blockingScripts === 1 ? '' : 's'} in <head> block rendering. Add defer or async.`,
    s.thirdPartyScripts >= 5 && `${s.thirdPartyScripts} third-party scripts load on the homepage. Remove unused trackers, chat widgets and apps.`,
    s.images > 3 && s.lazyImages === 0 && `None of the ${s.images} images use loading="lazy". Lazy-load images below the fold.`,
    s.imagesWithoutSize > 0 && `${s.imagesWithoutSize} images have no width/height, which causes layout shift.`,
    s.images > 0 && s.modernImages === 0 && 'No WebP or AVIF images detected. Modern formats are usually 25–50% smaller.',
    s.htmlBytes > 300_000 && `The homepage HTML is ${Math.round(s.htmlBytes / 1024)} KB. Large inline scripts or data slow the first render.`,
    s.avgResponseMs !== null && s.avgResponseMs > 1200 && `Pages took ${ms(s.avgResponseMs)} on average to download. Check hosting, caching and a CDN.`,
  ].filter(Boolean) as string[] : [];
  return <div className="health-body">
    <div className="speed-actions">
      <div><h3><Gauge size={17} /> Google speed test</h3><p>Real Core Web Vitals from Google PageSpeed Insights for {path(site.finalUrl)}.</p></div>
      <div className="health-chips">{(['mobile', 'desktop'] as const).map((value) => <button key={value} className={strategy === value ? 'active' : ''} onClick={() => report.pageSpeed?.[value] ? setStrategy(value) : run(value)}>{value === 'mobile' ? 'Mobile' : 'Desktop'}</button>)}</div>
      <button className="button primary" disabled={Boolean(busy)} onClick={() => run(strategy)}>{busy ? 'Testing… (up to a minute)' : result ? 'Test again' : `Test ${strategy} speed`}</button>
    </div>
    {error && <p className="social-error" role="alert">{error}</p>}
    {keyed === false && <details className="web-details speed-key" open={Boolean(error)}>
      <summary>Speed tests failing? Add a free Google key (2 minutes)</summary>
      <ol>
        <li>Open <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noreferrer">PageSpeed Insights API</a> in Google Cloud and click <strong>Enable</strong> (any free project works).</li>
        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → <strong>Create credentials → API key</strong>.</li>
        <li>Add <code>PAGESPEED_API_KEY=your-key</code> to the <code>.env</code> file in the Waypoint folder and restart Waypoint.</li>
      </ol>
      <p className="web-help">The key is free, stays on your computer, and gives you 25,000 tests a day.</p>
    </details>}
    {result ? <SpeedResult result={result} /> : !busy && <p className="web-help">No Google test saved yet. Click the button above — it is free.</p>}
    {s && <>
      <h4 className="health-subhead">Speed signals from the crawl</h4>
      <div className="speed-signals">
        {[['Page response', ms(s.avgResponseMs)], ['HTML size', `${Math.round(s.htmlBytes / 1024)} KB`], ['Scripts', `${s.scripts} (${s.thirdPartyScripts} third-party)`], ['Blocking scripts', s.blockingScripts], ['Images', `${s.images} (${s.lazyImages} lazy)`], ['Stylesheets', s.stylesheets]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
      </div>
      {tips.length ? <ul className="speed-tips">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : <p className="health-empty"><Check size={16} /> No obvious problems in the homepage markup.</p>}
    </>}
  </div>;
}

function SpeedResult({ result }: { result: PageSpeedResult }) {
  const band = result.score === null ? 'unknown' : result.score >= 90 ? 'good' : result.score >= 50 ? 'needs work' : 'poor';
  const metrics: [keyof typeof vitals, number | null][] = [['lcpMs', result.field?.lcpMs ?? result.lab.lcpMs], ['inpMs', result.field?.inpMs ?? null], ['cls', result.field?.cls ?? result.lab.cls], ['tbtMs', result.lab.tbtMs], ['fcpMs', result.lab.fcpMs], ['ttfbMs', result.lab.ttfbMs]];
  return <div className="speed-result">
    <div className={`speed-score ${band.replace(' ', '-')}`}><strong>{result.score ?? '—'}</strong><span>{result.strategy} score</span></div>
    <div className="speed-metrics">{metrics.filter(([, value]) => value !== null).map(([key, value]) => <div key={key} className={rating(key, value).replace(' ', '-')}><small>{vitals[key].label}</small><strong>{key === 'cls' ? value!.toFixed(2) : ms(value)}</strong><em>{rating(key, value)}</em></div>)}</div>
    <p className="web-help">{result.field ? `Real-user data (75th percentile${result.field.origin ? ', whole site' : ''}) where available; ${result.field.overall ? `Google rates field experience “${result.field.overall.toLowerCase()}”.` : ''}` : 'Not enough real-user visits for field data; showing a lab test.'} Tested {new Date(result.fetchedAt).toLocaleString()}.</p>
    {!!result.opportunities.length && <><h4 className="health-subhead">Biggest savings</h4><ul className="speed-tips">{result.opportunities.map((item) => <li key={item.title}>{item.title}<em>save ~{ms(item.savingsMs)}</em></li>)}</ul></>}
  </div>;
}
