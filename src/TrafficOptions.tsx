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
  const validPeriod = !!from && !!to && from <= to;
  useEffect(() => {let active=true; api<typeof status>('/web/connections').then(r=>{if(active)setStatus(r);}).catch(e=>{if(active)setError(e.message);}); return()=>{active=false;};},[]);
  useEffect(()=>{setError('');setNotice('');},[domain]);
  async function pull(kind: 'google'|'traffic-estimates') {
    if (!validPeriod) {setError('Choose a start date on or before the end date.');return;}
    setBusy(kind);setError('');setNotice('');
    try {await api(`/web/${kind}`,{domain,from,to});setNotice(`Saved ${kind==='google'?'Google data':'traffic estimates'} for ${domain}.`);refresh();} catch(e){setError((e as Error).message);} finally{setBusy('');}
  }
  return <section className="panel web-traffic" data-traffic-options="true">
    <details className="web-traffic-connect">
      <summary className="web-traffic-summary"><strong>Add traffic data</strong><span>Connect Google for a site you own</span></summary>
      <div className="web-toolbar">
        <label>From <input aria-label="Traffic start date" type="date" value={from} max={to || undefined} onChange={e=>setFrom(e.target.value)} required/></label>
        <label>To <input aria-label="Traffic end date" type="date" value={to} min={from || undefined} onChange={e=>setTo(e.target.value)} required/></label>
        {from && to && from > to && <p role="alert">Choose a start date on or before the end date.</p>}
      </div>
      <div className="web-traffic-grid">
        <article>
          <span className="tag">YOUR WEBSITE · FREE GOOGLE DATA</span>
          <h3>Google search & traffic</h3>
          <p>See the searches bringing people to your site. Add Analytics to see visits and page views.</p>
          <button className="button primary" disabled={!!busy || !status?.google.configured || !validPeriod} onClick={()=>void pull('google')}>{busy==='google'?'Pulling Google data…':'Pull Google data'}</button>
          <p className="web-connection-state">{status ? status.google.configured ? 'Connection configured. Site access is checked when you pull.' : 'Connect your Google account on the host computer first.' : 'Checking connection…'}</p>
          <details>
            <summary>Connection setup & data sources</summary>
            <p>Search Console supplies query clicks, impressions and average positions. GA4 supplies sessions, users, page views and organic sessions for the configured site. These are authorized first-party measurements.</p>
            <p>On the host computer, add GOOGLE_SEO_ACCESS_TOKEN to .env. For Analytics also set GA4_PROPERTY_ID and GA4_SITE_DOMAIN, then restart the private service. The token needs webmasters.readonly and analytics.readonly scopes and access to the requested property. Access tokens expire; replace them as needed.</p>
            <a href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing" target="_blank" rel="noreferrer">Google authorization guide ↗</a>
          </details>
        </article>
        <article>
          <details>
            <summary>Other domains: optional paid estimates</summary>
            <h3>Similarweb traffic estimates</h3>
            <p>Estimated monthly visits for other domains, where coverage is available. These cover all channels and are separate from organic search clicks.</p>
            <p>Select complete calendar months, up to 12 months. Fetching uses your provider allowance and may incur charges. A request is made only when you click below.</p>
            <button className="button secondary" disabled={!!busy || !status?.trafficEstimates.configured || !validPeriod} onClick={()=>void pull('traffic-estimates')}>{busy==='traffic-estimates'?'Fetching estimates…':'Fetch traffic estimates'}</button>
            <p className="web-connection-state">{status ? status.trafficEstimates.configured ? 'API key configured. This is an explicit paid-provider request.' : 'Optional paid API setup needed. No key is configured.' : 'Checking connection…'}</p>
            <details>
              <summary>Provider setup & coverage</summary>
              <p>Add SIMILARWEB_API_KEY to .env on the host and restart the private service. A Similarweb plan with API access is required. Some smaller sites have no coverage; missing results stay unknown.</p>
              <a href="https://docs.similarweb.com/api-v5/getting-started-1/making-your-first-request" target="_blank" rel="noreferrer">Provider setup guide ↗</a>
            </details>
          </details>
        </article>
      </div>
    </details>
    {error && <p className="social-error" role="alert">{error}</p>}{notice && <p className="social-success" role="status">{notice}</p>}
    {report.google && <div className="web-saved-traffic">
      <span className="tag">FIRST-PARTY DATA · GOOGLE</span>
      <h3>Saved Google report</h3>
      <p>{report.google.from} – {report.google.to} · collected {new Date(report.google.collectedAt).toLocaleString()}</p>
      {report.google.search && <p>Search Console: {report.google.search.rows.length} query rows{report.google.search.truncated?' (capped)':''}. Keyword performance is shown in the query table.</p>}
      {report.google.analytics && <div className="web-stats">{[['Sessions',report.google.analytics.sessions],['Active users',report.google.analytics.activeUsers],['Page views',report.google.analytics.screenPageViews],['Organic sessions',report.google.analytics.organicSessions]].map(([l,v])=><div key={String(l)}><small>{l}</small><strong>{fmt(v as number|null)}</strong></div>)}</div>}
      <details>
        <summary>Source details and notes</summary>
        {report.google.search && <p>Search Console property: {report.google.search.property}. Source: {report.google.search.source}.</p>}
        {report.google.analytics && <p>Google Analytics property: {report.google.analytics.propertyId}.</p>}
        {report.google.warnings.map((w,i)=><p key={i}>{w}</p>)}
      </details>
    </div>}
    {report.trafficEstimate && <div className="web-saved-traffic">
      <span className="tag">THIRD-PARTY ESTIMATES · SIMILARWEB</span>
      <h3>Saved Similarweb estimates</h3>
      <p>{report.trafficEstimate.from} – {report.trafficEstimate.to} · collected {new Date(report.trafficEstimate.collectedAt).toLocaleString()}</p>
      {report.trafficEstimate.series.length ? <div className="table-wrap"><table><thead><tr><th>Month</th><th>Estimated visits</th><th>Bounce rate %</th><th>Pages / visit</th></tr></thead><tbody>{report.trafficEstimate.series.map(r=><tr key={r.date}><td>{r.date.slice(0,7)}</td><td>{fmt(r.visits)}</td><td>{fmt(r.bounceRate===null?null:r.bounceRate*100)}</td><td>{fmt(r.pagesPerVisit)}</td></tr>)}</tbody></table></div> : <p>No provider coverage returned for this period.</p>}
      <details>
        <summary>Source details and notes</summary>
        <p>Worldwide · all channels · monthly estimates.</p>
        <p>{report.trafficEstimate.disclosure}</p>
      </details>
    </div>}
  </section>;
}
