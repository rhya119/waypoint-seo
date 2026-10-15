import { useState } from 'react';
import type { SiteScan } from '../shared/site-scan';
import type { WebReport } from '../shared/web-data';
import { api } from './lib';

export default function SiteResults({ site, page, comparisons, refresh }: { site: SiteScan | null; page: number; comparisons: WebReport['publicComparisons']; refresh: () => void }) {
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <>
    {!site && [0, 1, 2, 3, 6].includes(page) && <section className="panel web-empty"><h3>Scan this website to see its public SEO findings.</h3><p>Click Analyze website above. The scanner checks the homepage and up to two internal pages, with no account or data subscription required.</p></section>}
    {site && [0, 3, 6].includes(page) && <section className="panel" data-site-results="true">
      <div className="panel-head"><div><span className="eyebrow">PUBLIC WEBSITE SCAN</span><h2>{site.title || site.domain}</h2><p>{site.description || 'No meta description found.'}</p></div><span className="tag">HTTP {site.status}</span></div>
      <div className="web-stats">{[['Markup checklist', `${site.audit.score}/100`], ['Page words', site.wordCount], ['Internal links', site.internalLinks.length], ['Outbound links', site.externalLinks.length], ['Images missing alt', `${site.images.missingAlt}/${site.images.total}`], ['Scan elapsed', `${site.responseMs} ms`]].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <dl className="web-facts"><div><dt>Page URL</dt><dd><a href={site.finalUrl} target="_blank" rel="noreferrer">{site.finalUrl}</a></dd></div><div><dt>Canonical</dt><dd>{site.canonical || 'Not declared'}</dd></div><div><dt>Language / robots</dt><dd>{site.language || 'Not declared'} · {site.robotsMeta || 'No robots meta directive'}</dd></div><div><dt>Structured data types</dt><dd>{site.structuredDataTypes.join(', ') || 'None detected'}</dd></div><div><dt>Last scanned</dt><dd>{new Date(site.scannedAt).toLocaleString()}</dd></div></dl>
      <p className="web-help">The checklist reflects static markup checks. Scan elapsed includes robots checks, redirects, page requests and analysis. It is not a Core Web Vitals or full browser speed test.</p>
      {!!site.pageChecks?.length && <div className="table-wrap"><table><thead><tr><th>Checked page</th><th>Status</th><th>Title</th><th>H1s</th><th>Checklist</th></tr></thead><tbody>{site.pageChecks.map(p => <tr key={p.url}><td><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></td><td>{p.status ?? 'Failed'}</td><td>{p.error || p.title || 'Missing'}</td><td>{p.h1Count}</td><td>{p.score === null ? '—' : `${p.score}/100`}</td></tr>)}</tbody></table></div>}
      <details className="web-details" open={page === 3 || page === 6}><summary>View markup checks and fixes</summary><div className="web-audit">{site.audit.checks.map(c => <div key={c.name}><strong>{c.passed ? '✓' : 'Fix'} · {c.name}</strong><p>{c.detail}</p></div>)}</div></details>
      {!!site.warnings.length && <ul className="web-warnings">{site.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>}
      <p className="web-help">{site.disclosure}</p>
    </section>}
    {site && [0, 1, 6].includes(page) && <section className="panel"><div className="panel-head"><div><h2>Topics found on this page</h2><p>Words in the visible page copy. Counts describe this page, and do not measure search demand, rankings or visits.</p></div></div><div className="web-topics">{site.topics.map(t => <span key={t.term}>{t.term}<strong>{t.count}</strong></span>)}</div><details className="web-details"><summary>Page headings ({site.headings.length})</summary>{site.headings.map((h,i) => <p key={i}><small>H{h.level}</small> {h.text}</p>)}</details></section>}
    {site && [2, 6].includes(page) && <section className="panel"><div className="panel-head"><div><h2>Links discovered on this page</h2><p>These are links going out from the scanned page. Backlinks coming into the site are shown separately from your imported link list.</p></div></div><div className="table-wrap"><table><thead><tr><th>Destination</th><th>Anchor text</th><th>Type</th></tr></thead><tbody>{[...site.internalLinks.map(l => ({...l,kind:'Internal'})),...site.externalLinks.map(l => ({...l,kind:'Outbound'}))].map((l,i) => <tr key={i}><td><a href={l.url} target="_blank" rel="noreferrer">{l.url}</a></td><td>{l.anchor || '—'}</td><td>{l.kind}</td></tr>)}</tbody></table></div></section>}
    {[5,6].includes(page) && <section className="panel"><div className="panel-head"><div><h2>Compare public websites</h2><p>Scan another domain, then compare its visible page metadata and markup checklist. Query overlap appears below when you supply compatible datasets.</p></div></div>
      <form className="web-toolbar" onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void api('/web/scan',{domain:other}).then(() => {setOther('');refresh();}).catch(e => setError(e.message)).finally(() => setBusy(false)); }}><input aria-label="Competitor website" value={other} onChange={e=>setOther(e.target.value)} placeholder="Another website domain" required maxLength={253}/><button className="button secondary" disabled={busy}>{busy?'Scanning…':'Scan comparison site'}</button></form>
      {error && <p className="social-error" role="alert">{error}</p>}
      {!!comparisons.length && <div className="table-wrap"><table><thead><tr><th>Website</th><th>Title</th><th>Page words</th><th>Markup checklist</th><th>Scanned</th></tr></thead><tbody>{[...(site ? [{domain:site.domain,title:site.title,wordCount:site.wordCount,score:site.audit.score,scannedAt:site.scannedAt,url:site.finalUrl}] : []),...comparisons].map(c=><tr key={c.domain}><td>{c.domain}</td><td>{c.title}</td><td>{c.wordCount}</td><td>{c.score}/100</td><td>{new Date(c.scannedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    </section>}
  </>;
}
