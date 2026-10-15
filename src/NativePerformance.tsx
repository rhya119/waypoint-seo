import { useEffect, useState } from "react";
import { ArrowDownToLine, Plug, RefreshCw, Search } from "lucide-react";
import {
  nativePlatforms,
  type SnapshotReport,
  type NativePost,
} from "../shared/connectors";
import { metricKeys } from "../shared/performance";
import { api, download } from "./lib";
import ClaudeAdvisor from "./ClaudeAdvisor";
const terms = (post: NativePost) =>
  new Set(
    `${post.title} ${post.caption}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ||
      [],
  );
function overlap(a: NativePost, b: NativePost) {
  const x = terms(a),
    y = terms(b);
  const intersection = [...x].filter((t) => y.has(t)).length;
  return intersection / Math.max(1, new Set([...x, ...y]).size);
}
export default function NativePerformance({
  onConnect,
  claudeEnabled,
}: {
  onConnect: () => void;
  claudeEnabled: boolean;
}) {
  const [platform, setPlatform] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<SnapshotReport>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [reference, setReference] = useState<NativePost>();
  const [aiOpen, setAiOpen] = useState(false);
  useEffect(() => {
    let current = true;
    setData(undefined);
    setError("");
    setReference(undefined);
    api<SnapshotReport>(
      `/social/snapshots?${new URLSearchParams({ platform, keyword })}`,
    )
      .then((r) => {
        if (current) setData(r);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [platform, keyword, refresh]);
  const matches =
    reference && data
      ? data.posts
          .filter(
            (p) =>
              p.platform === reference.platform &&
              !(
                p.account === reference.account &&
                p.contentId === reference.contentId
              ),
          )
          .map((p) => ({ post: p, score: overlap(reference, p) }))
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
      : [];
  return (
    <section className="panel native-performance" data-tour="snapshots">
      <div className="panel-head">
        <div>
          <h2>API snapshots</h2>
          <p>
            Recent posts from your connected accounts, with lifetime counters.
          </p>
        </div>
        <button className="button secondary" onClick={onConnect}>
          <Plug size={15} />
          Connect / pull data
        </button>
      </div>
      <p className="native-disclosure">
        {data?.disclosure ||
          "Lifetime captures stay separate from your daily imports. No keyword search-volume data is inferred from these posts."}
      </p>
      <div className="native-filters">
        <label>
          Platform
          <select
            aria-label="Snapshot platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">All connected platforms</option>
            {nativePlatforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <Search size={14} />
          Topic in title or caption
          <input
            aria-label="Snapshot topic"
            value={keyword}
            placeholder="e.g. balcony garden"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={14} />
          Refresh saved data
        </button>
        <button
          className="button secondary"
          disabled={!data?.posts.length}
          onClick={() =>
            download(
              "waypoint-api-snapshots.json",
              JSON.stringify(data, null, 2),
              "application/json",
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export
        </button>
      </div>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading saved snapshots…</p>}
      {data && !data.posts.length && (
        <div className="performance-empty">
          <h3>No API snapshots in this selection.</h3>
          <p>
            Open Integrations, configure a provider, then click “Pull recent
            posts”. Imports and example data are available in the other tabs.
          </p>
          <button className="button primary" onClick={onConnect}>
            Open Integrations
          </button>
        </div>
      )}
      {!!data?.posts.length && (
        <div className="table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Post / source</th>
                {metricKeys.map((k) => (
                  <th key={k} className="capitalize">
                    {k}
                  </th>
                ))}
                <th>Captured</th>
                <th>Compare</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={`${p.platform}/${p.account}/${p.contentId}`}>
                  <td>
                    <strong>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                    </strong>
                    <small>
                      {p.platform} · {p.account} · {p.format}
                    </small>
                    <small>Published {p.publishedAt.slice(0, 10)}</small>
                  </td>
                  {metricKeys.map((k) => (
                    <td key={k}>
                      {p[k] === null ? "—" : p[k].toLocaleString()}
                    </td>
                  ))}
                  <td>{new Date(p.collectedAt).toLocaleString()}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setReference(p)}
                    >
                      Find similar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reference && (
        <section className="native-comparison" aria-live="polite">
          <h3>Similar to “{reference.title}”</h3>
          <p>
            Same-platform title/caption word overlap in this selection.
            Different post ages and capture times affect lifetime comparisons.
          </p>
          {matches.length ? (
            matches.map(({ post: p, score }) => (
              <div key={`${p.account}/${p.contentId}`}>
                <strong>{p.title}</strong>
                <span>
                  {Math.round(score * 100)}% word overlap · views{" "}
                  {p.views?.toLocaleString() ?? "unknown"} · impressions{" "}
                  {p.impressions?.toLocaleString() ?? "unknown"}
                </span>
              </div>
            ))
          ) : (
            <p>No related posts in this selection.</p>
          )}
        </section>
      )}
      {claudeEnabled && !!data?.posts.length && (
        <div className="optional-ai">
          <button
            className="button secondary"
            onClick={() => setAiOpen((value) => !value)}
          >
            {aiOpen
              ? "Close Claude analysis"
              : "Analyze these API snapshots with Claude"}
          </button>
          {aiOpen && (
            <ClaudeAdvisor
              context={JSON.stringify({
                snapshots: data,
                reference,
                matches,
              }).slice(0, 16000)}
            />
          )}
        </div>
      )}
      {!!data?.runs.length && (
        <details className="native-pull-history">
          <summary>Pull history and coverage warnings</summary>
          {data.runs.map((r, i) => (
            <div key={i}>
              <strong>
                {r.platform} · {new Date(r.collectedAt).toLocaleString()} ·{" "}
                {r.count} posts
              </strong>
              {r.truncated && <p>Recent-post sample; more content exists.</p>}
              {r.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
