import { useEffect, useState } from 'react';
import { Check, LogOut } from 'lucide-react';
import { normalizeWebDomain } from '../shared/web-data';
import { api } from './lib';

type Status = { configured: boolean; connected: boolean; email: string | null; analytics: boolean; canSignInHere: boolean };
type Properties = { searchConsole: { property: string; permission: string }[]; analytics: { propertyId: string; name: string; account: string }[]; ga4: string | null };

const matches = (property: string, domain: string) => {
  try { return normalizeWebDomain(property.startsWith('sc-domain:') ? property.slice(10) : property) === domain; } catch { return false; }
};

export default function GoogleConnect({ domain, busy, canPull, onPull }: { domain: string; busy: boolean; canPull: boolean; onPull: () => void }) {
  const [status, setStatus] = useState<Status>();
  const [properties, setProperties] = useState<Properties>();
  const [error, setError] = useState('');
  useEffect(() => { api<Status>('/google/oauth/status').then(setStatus).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    if (!status?.connected) return;
    setProperties(undefined);
    api<Properties>(`/google/properties?${new URLSearchParams({ domain })}`).then(setProperties).catch((e: Error) => setError(e.message));
  }, [status?.connected, domain]);
  const disconnect = () => { setError(''); void api<Status>('/google/oauth/disconnect', {}).then((next) => { setStatus({ ...next, canSignInHere: status?.canSignInHere ?? true }); setProperties(undefined); }).catch((e: Error) => setError(e.message)); };
  const chooseGa4 = (propertyId: string) => { void api<{ propertyId: string | null }>('/google/ga4', { domain, propertyId: propertyId || null }, 'PUT').then((r) => setProperties((p) => p && { ...p, ga4: r.propertyId })).catch((e: Error) => setError(e.message)); };

  if (!status) return <p className="web-connection-state">Checking Google connection…</p>;
  if (!status.connected) return <div className="google-connect">
    {status.configured ? (status.canSignInHere
      ? <a className="button primary google-button" href="/api/google/oauth/start">Sign in with Google</a>
      : <p className="web-connection-state">Open Waypoint on the host computer (http://127.0.0.1) to sign in with Google. After that, every device can use the connection.</p>)
      : <details className="google-setup" open>
        <summary>One-time setup (about 5 minutes)</summary>
        <ol>
          <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud</a> and create a project (free).</li>
          <li>Enable <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noreferrer">Search Console API</a>, <a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noreferrer">Analytics Data API</a> and <a href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com" target="_blank" rel="noreferrer">Analytics Admin API</a>.</li>
          <li>Open <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Google Auth Platform</a>: choose <strong>External</strong>, add your Gmail address as a <strong>test user</strong>.</li>
          <li>Under <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients</a> create a client of type <strong>Desktop app</strong>.</li>
          <li>Add <code>GOOGLE_CLIENT_ID=…</code> and <code>GOOGLE_CLIENT_SECRET=…</code> to <code>.env</code> in the Waypoint folder and restart Waypoint. A <strong>Sign in with Google</strong> button appears here.</li>
        </ol>
      </details>}
    {error && <p className="social-error" role="alert">{error}</p>}
  </div>;

  const scMatch = properties?.searchConsole.find((entry) => matches(entry.property, domain));
  return <div className="google-connect">
    <p className="google-account"><Check size={15} className="sev-ok" /> Connected{status.email ? ` as ${status.email}` : ''}<button className="text-button" onClick={disconnect}><LogOut size={13} /> Disconnect</button></p>
    {properties && <ul className="google-props">
      <li>{scMatch ? <><Check size={14} className="sev-ok" /> Search Console: <strong>{scMatch.property}</strong></> : <>Search Console has no property for <strong>{domain}</strong>. <a href="https://search.google.com/search-console/welcome" target="_blank" rel="noreferrer">Add and verify it</a>, then pull again.</>}</li>
      <li><label>Google Analytics property
        <select value={properties.ga4 || ''} onChange={(event) => chooseGa4(event.target.value)} disabled={!properties.analytics.length}>
          <option value="">{properties.analytics.length ? 'None — search data only' : 'No Analytics properties found'}</option>
          {properties.analytics.map((property) => <option key={property.propertyId} value={property.propertyId}>{property.name} · {property.account}</option>)}
        </select></label></li>
    </ul>}
    <button className="button primary" disabled={busy || !canPull || (properties ? !scMatch && !properties.ga4 : false)} onClick={onPull}>{busy ? 'Pulling Google data…' : 'Pull Google data'}</button>
    {error && <p className="social-error" role="alert">{error}</p>}
  </div>;
}
