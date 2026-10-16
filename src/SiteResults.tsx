import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight } from 'lucide-react';
import type { SiteScan } from '../shared/site-scan';
import type { WebReport } from '../shared/web-data';
import { api, openHealthTab } from './lib';

type Props = { site: SiteScan | null; page: number; comparisons: WebReport['publicComparisons']; refresh: () => void; history?: WebReport['scanHistory']; pageSpeed?: WebReport['pageSpeed'] };
const date = (value: string) => new Date(value).toLocaleString();

export default function SiteResults({ site, page, comparisons, refresh, history = [], pageSpeed = null }: Props) {
  const [current, previous] = history;
  const fixed = current && previous ? previous.issues.filter(issue => !current.issues.includes(issue)).length : 0;
  const added = current && previous ? current.issues.filter(issue => !previous.issues.includes(issue)).length : 0;
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkTerm, setLinkTerm] = useState('');
  const [linkType, setLinkType] = useState('all');
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [targetKeyword, setTargetKeyword] = useState('');
  const [schedule, setSchedule] = useState<{ enabled: boolean; intervalDays: number; nextRun: string | null; lastError?: string | null }>();
  useEffect(() => { if (site && page === 0) api<typeof schedule>(`/web/auto-scan?${new URLSearchParams({ domain: site.domain })}`).then(setSchedule).catch(() => setSchedule(undefined)); }, [site?.domain, page]);
  const changeSchedule = (value: string) => { if (!site) return; void api<typeof schedule>('/web/auto-scan', { domain: site.domain, enabled: value !== '0', intervalDays: Number(value) || 7 }, 'PUT').then(setSchedule).catch(() => undefined); };
  const failures = site?.audit.checks.filter(check => !check.passed) || [];
  const checks = site?.pageChecks || [];
  const priorities = [
    ...failures.map(check => ({ title: check.name, detail: check.detail })),
    ...(site?.warnings || []).map(warning => ({ title: warning.startsWith('Broken internal link') ? 'Repair a broken internal link' : warning.startsWith('Duplicate') ? warning.split(':')[0] : 'Review a scan notice', detail: warning })),
  ];
  const pageLinks = site ? [
    ...site.internalLinks.map(link => ({ ...link, kind: 'Internal' })),
    ...site.externalLinks.map(link => ({ ...link, kind: 'Outbound' })),
  ].filter(link => (linkType === 'all' || link.kind.toLowerCase() === linkType) && `${link.url} ${link.anchor}`.toLowerCase().includes(linkTerm.toLowerCase())) : [];

  return <>
    {!site && [0, 3].includes(page) && <section className="panel web-empty web-start-empty">
      <h3>Your website findings will appear here.</h3>
      <p>Enter your website above and click <strong>Analyze website</strong>. No account connection is needed for the public scan.</p>
    </section>}

    {site && [0, 3, 6].includes(page) && <section className="panel web-scan-summary" data-site-results="true">
      <div className="panel-head">
        <div><h2>{page === 3 ? 'Website audit' : 'Website snapshot'}</h2><p><a href={site.finalUrl} target="_blank" rel="noreferrer">{site.domain} <ArrowUpRight size={13} /></a> · scanned {new Date(site.scannedAt).toLocaleDateString()}</p></div>
        {page === 0 && schedule ? <label className="auto-scan">Rescan automatically
          <select value={schedule.enabled ? String(schedule.intervalDays) : '0'} onChange={(event) => changeSchedule(event.target.value)}>
            <option value="0">Off</option><option value="1">Daily</option><option value="7">Weekly</option><option value="30">Monthly</option>
          </select>
          {schedule.enabled && schedule.nextRun && <small>Next: {new Date(schedule.nextRun).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{schedule.lastError ? ' · last run failed' : ''}</small>}
        </label> : <span className="tag">Public pages · HTTP {site.status}</span>}
      </div>
      <div className="web-stats web-scan-stats">
        {([
          ['Pages crawled', checks.length || 1, 'pages'],
          ['Issues to fix', site.pageIssues ? site.pageIssues.length : priorities.length, 'issues'],
          ['AI search readiness', site.ai ? `${site.ai.grade} · ${site.ai.score}` : '—', 'ai'],
          ['Mobile speed', pageSpeed?.mobile?.score != null ? `${pageSpeed.mobile.score}/100` : 'Test it', 'speed'],
        ] as const).map(([label, value, tab]) => <a key={label} href="#site-audit" onClick={() => openHealthTab(tab)}><small>{label}</small><strong>{value}</strong></a>)}
      </div>
      {current && previous && (fixed > 0 || added > 0) && <details className="scan-diff">
        <summary>{current.auto ? 'Automatic rescan · ' : ''}Since the scan on {new Date(previous.scannedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}: {fixed > 0 && <strong className="diff-fixed">✓ {fixed} fixed</strong>}{fixed > 0 && added > 0 && ' · '}{added > 0 && <strong className="diff-new">{added} new</strong>}</summary>
        <ul>{[...previous.issues.filter(issue => !current.issues.includes(issue)).map(issue => ['fixed', issue] as const), ...current.issues.filter(issue => !previous.issues.includes(issue)).map(issue => ['new', issue] as const)].slice(0, 40).map(([kind, issue]) => { const [type, url] = issue.split('|'); return <li key={kind + issue} className={kind === 'fixed' ? 'diff-fixed' : 'diff-new'}>{kind === 'fixed' ? '✓ Fixed' : '• New'}: {type} <small>{(() => { try { return new URL(url).pathname; } catch { return url; } })()}</small></li>; })}</ul>
      </details>}
      {page === 6 && <div className="web-priorities">
        <div className="web-section-title"><h3>{priorities.length ? 'Fix these first' : 'Your basic markup checks passed'}</h3>{<a className="text-button" href="#site-audit">Open audit <ChevronRight size={14} /></a>}</div>
        {priorities.length ? <div className="web-fix-list">{priorities.slice(0, 10).map((item, index) => <details key={`${item.title}-${index}`}><summary><span className="web-fix-number">{index + 1}</span>{item.title}</summary><p>{item.detail}</p></details>)}</div> : <p className="web-success-line"><Check size={16} /> Keep checking after you update your pages.</p>}
      </div>}
      <details className="web-details" data-scan-details="true">
        <summary>Scan details and checked pages</summary>
        <dl className="web-facts">
          <div><dt>Homepage title</dt><dd>{site.title || 'Missing'}</dd></div>
          <div><dt>Description</dt><dd>{site.description || 'Missing'}</dd></div>
          <div><dt>Page URL</dt><dd><a href={site.finalUrl} target="_blank" rel="noreferrer">{site.finalUrl}</a></dd></div>
          <div><dt>Canonical</dt><dd>{site.canonical || 'Not declared'}</dd></div>
          <div><dt>Language / robots</dt><dd>{site.language || 'Not declared'} · {site.robotsMeta || 'No robots meta directive'}</dd></div>
          <div><dt>Structured data</dt><dd>{site.structuredDataTypes.join(', ') || 'None detected'}</dd></div>
          <div><dt>Images without alt</dt><dd>{site.images.missingAlt} of {site.images.total}</dd></div>
          <div><dt>Scan elapsed</dt><dd>{site.responseMs.toLocaleString()} ms · {site.bytes.toLocaleString()} response bytes</dd></div>
          <div><dt>Last scanned</dt><dd>{date(site.scannedAt)}</dd></div>
        </dl>
        {!!checks.length && <div className="table-wrap"><table><thead><tr><th>Checked page</th><th>Status</th><th>Title / issue</th><th>H1s</th><th>Checklist</th></tr></thead><tbody>{checks.map(check => <tr key={check.url}><td><a href={check.url} target="_blank" rel="noreferrer">{check.url}</a></td><td>{check.status ?? 'Unavailable'}</td><td>{check.error || check.title || 'Missing title'}</td><td>{check.h1Count}</td><td>{check.score === null ? '—' : `${check.score}/100`}</td></tr>)}</tbody></table></div>}
        {!!site.warnings.length && <ul className="web-warnings">{site.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <p className="web-help">Scan elapsed includes robots, redirects and page requests. It is not a browser speed test or Core Web Vitals measurement.</p>
        <p className="web-help">{site.disclosure}</p>
      </details>
      <details className="web-details" data-markup-checks="true"><summary>All markup checks ({site.audit.checks.length})</summary><div className="web-audit">{site.audit.checks.map(check => <details key={check.name}><summary><span className={`tag ${check.passed ? '' : 'web-fix-tag'}`}>{check.passed ? 'Passed' : 'Review'}</span> {check.name}</summary><p>{check.detail}</p></details>)}</div></details>
      {page === 3 && <details className="web-details web-keyword-check"><summary>Check a target keyword</summary><label>Target phrase<input aria-label="Target keyword" value={targetKeyword} onChange={event => setTargetKeyword(event.target.value)} maxLength={150} placeholder="The phrase this page should address" /></label>{targetKeyword.trim() && <ul>{[['Page title', site.title], ['Meta description', site.description], ['Primary heading', site.headings.filter(heading => heading.level === 1).map(heading => heading.text).join(' ')]].map(([label, text]) => <li key={label}><span>{label}</span><strong>{text.toLowerCase().includes(targetKeyword.trim().toLowerCase()) ? 'Phrase present' : 'Phrase not found'}</strong></li>)}</ul>}<p>This checks the exact phrase in fetched metadata and H1 headings. It does not measure search demand or predict rankings.</p></details>}
      <p className="web-source-note">Homepage and up to two linked pages. The checklist describes markup, not your search ranking.</p>
    </section>}

    {site && page === 1 && <section className="panel" data-page-topics="true">
      <div className="panel-head"><div><h2>Topics on your homepage</h2><p>Repeated words in the page copy. These counts are not search volume.</p></div><span className="tag">Public scan</span></div>
      <div className="web-topics">{site.topics.slice(0, 10).map(topic => <span key={topic.term}>{topic.term}<strong>{topic.count}</strong></span>)}</div>
      {!site.topics.length && <p className="web-help">No recurring page topics were found in the fetched HTML.</p>}
      {site.topics.length > 10 && <details className="web-details"><summary>All page topics ({site.topics.length})</summary><div className="web-topics">{site.topics.slice(10).map(topic => <span key={topic.term}>{topic.term}<strong>{topic.count}</strong></span>)}</div></details>}
      <details className="web-details"><summary>Page headings ({site.headings.length})</summary>{site.headings.map((heading, index) => <p key={index}><small>H{heading.level}</small> {heading.text}</p>)}</details>
    </section>}

    {page === 2 && <section className="panel" data-page-links="true">
      <div className="panel-head"><div><h2>Links on your homepage</h2><p>{site ? `${site.internalLinks.length} internal · ${site.externalLinks.length} outbound` : 'Analyze your website to discover its page links.'}</p></div><span className="tag">Public scan</span></div>
      {site ? <>
        <div className="web-toolbar web-link-filter"><input aria-label="Filter page links" value={linkTerm} onChange={event => { setLinkTerm(event.target.value); setShowAllLinks(false); }} placeholder="Find a URL or anchor text" /><select aria-label="Page link type" value={linkType} onChange={event => { setLinkType(event.target.value); setShowAllLinks(false); }}><option value="all">All links</option><option value="internal">Internal</option><option value="outbound">Outbound</option></select></div>
        {pageLinks.length ? <div className="table-wrap"><table><thead><tr><th>Destination</th><th>Anchor text</th><th>Type</th></tr></thead><tbody>{pageLinks.slice(0, showAllLinks ? undefined : 50).map((link, index) => <tr key={index}><td><a href={link.url} target="_blank" rel="noreferrer">{link.url}</a></td><td>{link.anchor || '—'}</td><td>{link.kind}</td></tr>)}</tbody></table></div> : <p className="web-help">No page links match this filter.</p>}
        {pageLinks.length > 50 && !showAllLinks && <button className="text-button web-more-button" onClick={() => setShowAllLinks(true)}>Show all {pageLinks.length} matching links</button>}
        <p className="web-source-note">These links go out from your homepage. Inbound backlinks from your own records are available below.</p>
      </> : <p className="web-help">The public scan checks page links without a data subscription.</p>}
    </section>}

    {page === 5 && <section className="panel" data-public-comparison="true">
      <div className="panel-head"><div><h2>Compare websites</h2><p>Add a website to compare its public page content and markup.</p></div></div>
      <form className="web-toolbar web-compare-form" onSubmit={event => {
        event.preventDefault(); setBusy(true); setError('');
        void api('/web/scan', { domain: other }).then(() => { setOther(''); refresh(); }).catch(error => setError(error.message)).finally(() => setBusy(false));
      }}><input aria-label="Competitor website" value={other} onChange={event => setOther(event.target.value)} placeholder="Another website domain" required maxLength={253} /><button className="button primary" disabled={busy}>{busy ? 'Crawling… (10–40s)' : 'Compare website'}</button></form>
      {error && <p className="social-error" role="alert">{error}</p>}
      {!!comparisons.length ? <div className="table-wrap"><table className="compare-table"><thead><tr><th>Website</th><th>Pages crawled</th><th>Issues</th><th>AI search</th><th>Homepage words</th><th>Structured data</th><th>llms.txt</th></tr></thead><tbody>{[...(site ? [{ domain: site.domain, title: site.title, wordCount: site.wordCount, score: site.audit.score, scannedAt: site.scannedAt, url: site.finalUrl, pages: site.pageChecks?.length || 1, issues: site.pageIssues?.length, aiScore: site.ai?.score ?? null, aiGrade: site.ai?.grade ?? null, schema: site.structuredDataTypes.slice(0, 6), llms: site.llms?.found, mine: true }] : []), ...comparisons].map(comparison => <tr key={comparison.domain} className={'mine' in comparison ? 'compare-mine' : ''}><td><a href={comparison.url} target="_blank" rel="noreferrer">{comparison.domain}</a>{'mine' in comparison && <em className="tag">You</em>}<small>{comparison.title || 'Missing title'} · {new Date(comparison.scannedAt).toLocaleDateString()}</small></td><td>{comparison.pages ?? '—'}</td><td>{comparison.issues ?? '—'}</td><td>{comparison.aiGrade ? `${comparison.aiGrade} · ${comparison.aiScore}` : '—'}</td><td>{comparison.wordCount.toLocaleString()}</td><td>{comparison.schema?.length ? comparison.schema.join(', ') : 'None'}</td><td>{comparison.llms === undefined ? '—' : comparison.llms ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div> : <p className="web-help">Your comparison will appear here after you analyze another website.</p>}
      <details className="web-details"><summary>What is compared?</summary><p>Each website gets the same public crawl: page issues, AI search readiness, homepage words, structured data and llms.txt. Older comparisons show “—” until you compare them again. This does not reveal another website’s private traffic or rankings. Query comparisons from authorized datasets are available below.</p></details>
    </section>}
  </>;
}
