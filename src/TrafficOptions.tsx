import { useEffect, useState } from 'react';
import type { WebReport } from '../shared/web-data';
import type { GoogleSeoStatus } from '../shared/google-data';
import type { TrafficEstimateStatus } from '../shared/traffic-estimates';
import { api } from './lib';
const date = (d: Date) => d.toISOString().slice(0,10);
const fmt = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString(undefined,{maximumFractionDigits:2});
export default function TrafficOptions({ domain, report, refresh }: { domain: string; report: WebReport; refresh: () => void }) {
  const [status,setStatus] = useState<{google:GoogleSeoStatus;trafficEstimates:TrafficEstimateStatus}>();
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState('');
  const [from,setFrom] = useState(() => date(new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1))));
  const [to,setTo] = useState(() => date(new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),0))));
  useEffect(() => {let active=true; api<typeof status>('/web/connections').then(r=>{if(active)setStatus(r);}).catch(e=>{if(active)setError(e.message);}); return()=>{active=false;};},[]);
  useEffect(()=>{setError('');setNotice('');},[domain]);
  async function pull(kind: 'google'|'traffic-estimates') {
    setBusy(kind);setError('');setNotice('');
    try {await api(`/web/${kind}`,{domain,from,to});setNotice(`Saved ${kind==='google'?'Google data':'traffic estimates'} for ${domain}.`);refresh();} catch(e){setError((e as Error).message);} finally{setBusy('');}
  }
  return <section className="panel web-traffic" data-traffic-options="true">
    <div className="panel-head"><div><span className="eyebrow">TRAFFIC & SEARCH PERFORMANCE</span><h2>Two ways to see traffic</h2><p>Use authorized Google data for your sites, or provider estimates for other domains. Public page scans supply the technical findings above.</p></div></div>
    <div className="web-toolbar"><label>From <input aria-label="Traffic start date" type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label>To <input aria-label="Traffic end date" type="date" value={to} onChange={e=>setTo(e.target.value)} required/></label></div>
    <div className="web-traffic-grid">
      <article><span className="tag">OPTION 1 · AUTHORIZED DATA</span><h3>Google Search Console + Analytics</h3><p>Read query clicks, impressions and average positions from Search Console. GA4 adds sessions, users, page views and organic sessions for the configured site.</p><button className="button primary" disabled={!!busy || !status?.google.configured || !from || !to} onClick={()=>void pull('google')}>{busy==='google'?'Pulling Google data…':'Pull Google data'}</button>
        <p className="web-connection-state">{status ? status.google.configured ? 'Google access token configured. Property permissions are checked when you pull.' : 'Setup needed: Google access token with read-only property access.' : 'Checking connection…'}</p>
        <details><summary>Set up Google data</summary><p>On the host computer, add GOOGLE_SEO_ACCESS_TOKEN to .env. For Analytics also set GA4_PROPERTY_ID and GA4_SITE_DOMAIN, then restart the private service. The token needs webmasters.readonly and analytics.readonly scopes and access to the requested property. Access tokens expire; replace them as needed.</p><a href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing" target="_blank" rel="noreferrer">Google authorization guide ↗</a></details>
      </article>
      <article><span className="tag">OPTION 2 · THIRD-PARTY ESTIMATES</span><h3>Similarweb traffic estimates</h3><p>Monthly worldwide visits, bounce rate and pages per visit where the provider has coverage. These estimates cover all channels and are separate from organic search clicks.</p><button className="button secondary" disabled={!!busy || !status?.trafficEstimates.configured || !from || !to} onClick={()=>void pull('traffic-estimates')}>{busy==='traffic-estimates'?'Fetching estimates…':'Fetch traffic estimates'}</button>
        <p className="web-connection-state">{status ? status.trafficEstimates.configured ? 'API key configured. Clicking fetch consumes your provider allowance and may incur charges.' : 'Optional paid API setup needed. No key is configured.' : 'Checking connection…'}</p><p>Select complete calendar months, up to 12 months. Estimates are fetched only when you click the button.</p>
        <details><summary>Set up traffic estimates</summary><p>Add SIMILARWEB_API_KEY to .env on the host and restart the private service. A Similarweb plan with API access is required. Some smaller sites have no coverage; missing results stay unknown.</p><a href="https://docs.similarweb.com/api-v5/getting-started-1/making-your-first-request" target="_blank" rel="noreferrer">Provider setup guide ↗</a></details>
      </article>
    </div>
    {error && <p className="social-error" role="alert">{error}</p>}{notice && <p className="social-success" role="status">{notice}</p>}
    {report.google && <div className="web-saved-traffic"><h3>Saved Google report</h3><p>{report.google.from} – {report.google.to} · collected {new Date(report.google.collectedAt).toLocaleString()}</p>{report.google.search && <p>Search Console: {report.google.search.property} · {report.google.search.rows.length} query rows{report.google.search.truncated?' (capped)':''}. Keyword performance is shown in the query table.</p>}{report.google.analytics && <div className="web-stats">{[['Sessions',report.google.analytics.sessions],['Active users',report.google.analytics.activeUsers],['Page views',report.google.analytics.screenPageViews],['Organic sessions',report.google.analytics.organicSessions]].map(([l,v])=><div key={String(l)}><small>{l}</small><strong>{fmt(v as number|null)}</strong></div>)}</div>}{report.google.warnings.map((w,i)=><p key={i}>{w}</p>)}</div>}
    {report.trafficEstimate && <div className="web-saved-traffic"><h3>Saved Similarweb estimates</h3><p>{report.trafficEstimate.from} – {report.trafficEstimate.to} · worldwide · all channels · collected {new Date(report.trafficEstimate.collectedAt).toLocaleString()}</p>{report.trafficEstimate.series.length ? <div className="table-wrap"><table><thead><tr><th>Month</th><th>Estimated visits</th><th>Bounce rate %</th><th>Pages / visit</th></tr></thead><tbody>{report.trafficEstimate.series.map(r=><tr key={r.date}><td>{r.date.slice(0,7)}</td><td>{fmt(r.visits)}</td><td>{fmt(r.bounceRate===null?null:r.bounceRate*100)}</td><td>{fmt(r.pagesPerVisit)}</td></tr>)}</tbody></table></div> : <p>No provider coverage returned for this period.</p>}<p>{report.trafficEstimate.disclosure}</p></div>}
  </section>;
}
