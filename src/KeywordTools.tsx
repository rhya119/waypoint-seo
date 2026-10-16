import { useMemo, useState } from 'react';
import { ArrowDownToLine, Check, Lightbulb, Plus, Search, Sparkles, X } from 'lucide-react';
import type { WebReport } from '../shared/web-data';
import { relevantIdea, type KeywordIdea, type KeywordIdeasResult } from '../shared/research';
import { findOpportunities, opportunityLabels, potentialClicks, type OpportunityKind } from '../shared/opportunities';
import { api, csv, download } from './lib';
import './site-health.css';

const countries = [['nz', 'New Zealand'], ['au', 'Australia'], ['lk', 'Sri Lanka'], ['us', 'United States'], ['gb', 'United Kingdom'], ['ca', 'Canada'], ['in', 'India'], ['sg', 'Singapore'], ['my', 'Malaysia'], ['ae', 'UAE']];
const groups: KeywordIdea['group'][] = ['Questions', 'Buying', 'Comparisons', 'Local', 'Related'];
const fmt = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Seed phrases from crawled page titles ("Custom software & internal tools | Brand" → "custom software"), falling back to page topics. */
export function seedSuggestions(report: WebReport) {
  const brand = report.domain.split('.')[0].toLowerCase();
  const fromTitles = (report.site?.pageChecks || []).slice(1).map((page) => page.title.split(/\s[|–—-]\s|:/)[0].toLowerCase().replace(/[&,/+()]/g, ' ').replace(/\b(?:and|the|for|our|your|with|of|a|an|to|in)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' '))
    .filter((phrase) => phrase.length >= 4 && phrase.split(' ').length >= 2 && !phrase.includes(brand));
  const phrases = [...new Set(fromTitles)];
  return (phrases.length >= 3 ? phrases : [...phrases, ...(report.site?.topics || []).map((topic) => topic.term)]).slice(0, 8);
}

export function KeywordIdeas({ report, refresh }: { report: WebReport; refresh: () => void }) {
  const seeds = useMemo(() => seedSuggestions(report), [report]);
  const suggested = seeds[0] || '';
  const [seed, setSeed] = useState('');
  const [country, setCountry] = useState(() => {
    const tld = report.domain.split('.').pop() || '';
    const fromDomain = ({ lk: 'lk', nz: 'nz', au: 'au', uk: 'gb', ca: 'ca', in: 'in', sg: 'sg', my: 'my', ae: 'ae' } as Record<string, string>)[tld];
    try { return fromDomain || localStorage.getItem('waypoint-idea-country') || 'us'; } catch { return fromDomain || 'us'; }
  });
  const [result, setResult] = useState<KeywordIdeasResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [group, setGroup] = useState<'All' | KeywordIdea['group']>('All');
  const [saved, setSaved] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const known = useMemo(() => new Map(report.queries.map((row) => [row.query.toLowerCase(), row])), [report.queries]);
  const tracked = new Set([...report.tracks.map((track) => track.keyword.toLowerCase()), ...saved]);
  function search(value = seed) {
    const phrase = value.trim();
    if (phrase.length < 2) { setError('Type at least two letters.'); return; }
    setSeed(phrase); setBusy(true); setError(''); setGroup('All');
    try { localStorage.setItem('waypoint-idea-country', country); } catch { /* optional */ }
    void api<KeywordIdeasResult>('/web/keyword-ideas', { seed: phrase, country, language: 'en' }).then(setResult).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }
  function track(keyword: string) {
    void api('/web/track', { domain: report.domain, keyword }).then(() => { setSaved((list) => [...list, keyword]); refresh(); }).catch((e: Error) => setError(e.message));
  }
  const pool = result ? (showAll ? result.ideas : result.ideas.filter((idea) => relevantIdea(idea.phrase, result.seed))) : [];
  const hidden = result ? result.ideas.length - pool.length : 0;
  const ideas = pool.filter((idea) => group === 'All' || idea.group === group);
  return <section className="panel keyword-ideas" data-keyword-ideas="true">
    <div className="panel-head"><div><h2><Lightbulb size={18} /> Find keyword ideas</h2><p>Type a product or topic to see what people search for on Google.</p></div></div>
    <form className="idea-form" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label className="idea-input"><Search size={17} /><input aria-label="Keyword idea seed" type="search" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder={suggested ? `e.g. ${suggested}` : 'e.g. batik dress'} maxLength={80} autoComplete="off" />{seed && <button type="button" className="icon-button" aria-label="Clear" onClick={() => setSeed('')}><X size={15} /></button>}</label>
      <select aria-label="Country" value={country} onChange={(event) => setCountry(event.target.value)}>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
      <button className="button primary" disabled={busy}>{busy ? 'Finding…' : 'Find ideas'}</button>
    </form>
    {!result && !busy && !!seeds.length && <div className="idea-suggest"><span>Ideas from your pages:</span>{seeds.map((phrase) => <button key={phrase} type="button" onClick={() => search(phrase)}>{phrase}</button>)}</div>}
    {error && <p className="social-error" role="alert">{error}</p>}
    {result && <>
      <div className="health-filter">
        <div className="health-chips">{(['All', ...groups] as const).map((value) => { const count = value === 'All' ? pool.length : pool.filter((idea) => idea.group === value).length; return count ? <button key={value} className={group === value ? 'active' : ''} aria-pressed={group === value} onClick={() => setGroup(value)}>{value} <span>{count}</span></button> : null; })}</div>
        <button className="text-button" onClick={() => download(`waypoint-ideas-${result.seed.replace(/\W+/g, '-')}.csv`, csv([['keyword', 'group', 'your_impressions', 'your_position'], ...result.ideas.map((idea) => [idea.phrase, idea.group, known.get(idea.phrase)?.impressions ?? '', known.get(idea.phrase)?.position ?? ''])]), 'text/csv')}><ArrowDownToLine size={14} /> Export</button>
      </div>
      {hidden > 0 && <p className="idea-hidden">{showAll ? 'Showing every suggestion.' : `Hid ${hidden} off-topic or job-search suggestions.`} <button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show relevant only' : 'Show all'}</button></p>}
      {ideas.length ? <ul className="idea-list">{ideas.map((idea) => { const mine = known.get(idea.phrase); return <li key={idea.phrase}>
        <span className="idea-phrase">{idea.phrase}</span>
        <em className={`idea-group g-${idea.group.toLowerCase()}`}>{idea.group}</em>
        {mine ? <small className="idea-mine">You rank ~{fmt(mine.position)} · {mine.impressions.toLocaleString()} impressions</small> : <small className="idea-new">New opportunity</small>}
        <button className="icon-button" aria-label={`Search ideas for ${idea.phrase}`} title="Find ideas for this phrase" onClick={() => search(idea.phrase)}><Sparkles size={14} /></button>
        <button className="icon-button" disabled={tracked.has(idea.phrase)} aria-label={`Track ${idea.phrase}`} title={tracked.has(idea.phrase) ? 'Tracked' : 'Add to rank tracking'} onClick={() => track(idea.phrase)}>{tracked.has(idea.phrase) ? <Check size={14} /> : <Plus size={14} />}</button>
      </li>; })}</ul> : <p className="health-empty">No ideas in this group.</p>}
      <p className="web-source-note">{result.disclosure}</p>
    </>}
  </section>;
}

export function Opportunities({ report }: { report: WebReport }) {
  const found = useMemo(() => findOpportunities(report.queries), [report.queries]);
  const kinds = (Object.keys(opportunityLabels) as OpportunityKind[]).filter((kind) => found[kind].length);
  const [kind, setKind] = useState<OpportunityKind>(kinds[0] || 'striking');
  if (!report.search || !kinds.length) return null;
  const active = kinds.includes(kind) ? kind : kinds[0];
  const rows = found[active].slice(0, 50);
  return <section className="panel opportunities" data-opportunities="true">
    <div className="panel-head"><div><h2>Quick-win keywords</h2><p>From your Search Console data, {report.search.from} – {report.search.to}.</p></div></div>
    <div className="health-tabs" role="tablist">{kinds.map((value) => <button key={value} role="tab" aria-selected={active === value} className={active === value ? 'active' : ''} onClick={() => setKind(value)}>{opportunityLabels[value].label}<span>{found[value].length}</span></button>)}</div>
    <div className="health-body">
      <p className="web-help">{opportunityLabels[active].help}</p>
      <div className="table-wrap"><table><thead><tr><th>Query</th><th>Position</th><th>Impressions</th><th>Clicks</th>{active !== 'top' && <th>Extra clicks at #3</th>}</tr></thead><tbody>
        {rows.map((row) => <tr key={row.query}><td>{row.query}</td><td>{fmt(row.position)}</td><td>{row.impressions.toLocaleString()}</td><td>{row.clicks.toLocaleString()}</td>{active !== 'top' && <td>{potentialClicks(row) ? `+${potentialClicks(row).toLocaleString()}` : '—'}</td>}</tr>)}
      </tbody></table></div>
      <p className="web-source-note">“Extra clicks” is a rough planning estimate: your impressions × typical click-through at position 3, minus current clicks. Not a forecast.</p>
    </div>
  </section>;
}
