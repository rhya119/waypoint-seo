import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ConnectionStatus, NativePlatform } from "../shared/connectors";
import { api } from "./lib";
export default function NativeConnections() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<NativePlatform>();
  const [maxPosts, setMaxPosts] = useState(20);
  async function refresh() {
    try {
      const data = await api<{ connections: ConnectionStatus[] }>(
        "/integrations",
      );
      setConnections(data.connections);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <section className="panel native-connections" data-tour="connections">
      <div className="panel-head">
        <div>
          <h2>Social accounts</h2>
          <p>Set up a platform, then pull your recent posts.</p>
        </div>
        <button className="button secondary" onClick={() => void refresh()}><RefreshCw size={14} />Check status</button>
      </div>
      <details className="connection-options">
        <summary>Pull options and data limits</summary>
      <div className="native-filters">
        <label>
          Posts per pull
          <select
            aria-label="Posts per pull"
            value={maxPosts}
            onChange={(e) => setMaxPosts(Number(e.target.value))}
          >
            <option value={10}>10 recent posts</option>
            <option value={20}>20 recent posts</option>
            <option value={50}>Up to 50 recent posts</option>
          </select>
        </label>
      </div>
      <p className="native-disclosure">
        Configure an authorized token and account ID below, restart the server,
        then pull. These are lifetime post totals; inspect them under Social
        performance → Connected posts. “Settings present” means settings are present; a
        successful pull verifies access. No automatic background polling or
        token refresh.
      </p>
      </details>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="social-success" role="status">
          {notice}
        </p>
      )}
      <div className="native-connection-grid">
        {connections.map((c) => (
          <article className="native-connection" key={c.platform}>
            <div>
              <h3>{({ instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X', pinterest: 'Pinterest', threads: 'Threads' } as Record<string, string>)[c.platform] || c.platform}</h3>
              <span className={`tag ${c.configured ? "" : "amber"}`}>
                {c.configured
                  ? "Settings present"
                  : "Setup required"}
              </span>
            </div>
            <details>
              <summary>{c.configured ? 'Account setup' : 'How to connect'}</summary>
              <p>{c.metrics}</p>
              <p>{c.scope}</p>
              <p>Set these names in .env (never in browser code):</p>
              <ul>
                {c.required.map((k) => (
                  <li key={k}>
                    <code>{k}</code>{" "}
                    {c.missing.includes(k) ? "— missing" : "— present"}
                  </li>
                ))}
              </ul>
              <a href={c.docs} target="_blank" rel="noreferrer">
                Official API setup ↗
              </a>
              <p>
                Developer app approval and provider access are separate from
                Waypoint. Expired tokens must be renewed with the provider.
              </p>
            </details>
            <button
              className="button primary"
              data-pull={c.platform}
              disabled={!c.configured || !!busy}
              onClick={async () => {
                setBusy(c.platform);
                setError("");
                setNotice("");
                try {
                  const r = await api<{ count: number; warnings: string[] }>(
                    `/social/pull/${c.platform}`,
                    { maxPosts },
                  );
                  setNotice(
                    `${c.platform}: saved ${r.count} posts with lifetime totals. ${r.warnings.join(" ")} View Social performance → Connected posts.`,
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(undefined);
                }
              }}
            >
              <Download size={14} />
              {busy === c.platform ? "Pulling…" : "Pull recent posts"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
