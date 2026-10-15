import NativePerformance from "./NativePerformance";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  FileUp,
  Hash,
  Layers3,
  Radio,
  Search,
  X,
} from "lucide-react";
import { api, download, number } from "./lib";
import {
  platforms,
  type Performance,
  type SimilarContent,
  type ImportPreview,
  type YouTubeResearch,
  type MetricKey,
} from "../shared/performance";
import SocialTools from "./SocialTools";
import ClaudeAdvisor from "./ClaudeAdvisor";
import "./performance.css";
const labels: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
  threads: "Threads",
  all: "All platforms",
};
const fmt = (value: number | null | undefined) =>
  value == null ? "—" : number(value);
const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(2)}%`;
const identity = (row: {
  platform: string;
  account: string;
  content_id: string;
}) => JSON.stringify([row.platform, row.account, row.content_id]);
function Panel({
  title,
  detail,
  children,
  action,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
const contentTemplate =
  "platform,account,content_id,date,published_at,title,caption,keywords,format,ownership,url,views,impressions,clicks,likes,comments,shares,saves\nyoutube,@mychannel,video-001,2026-10-15,2026-10-01,My balcony garden,A practical tour,balcony garden|small spaces,video,owned,https://example.com/video,120,500,12,8,2,1,3";
const queryTemplate =
  "platform,account,date,keyword,views,impressions,clicks\nyoutube,@mychannel,2026-10-15,balcony garden,40,400,20";
export default function SocialSeo({
  domain,
  claudeEnabled = false,
  onIntegrations,
}: {
  domain: string;
  claudeEnabled?: boolean;
  onIntegrations: () => void;
}) {
  const [dataset, setDataset] = useState<"imported" | "example">(() => new URLSearchParams(location.search).get('dataset') === 'example' ? 'example' : 'imported');
  const [platform, setPlatform] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [term, setTerm] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState("Overview");
  const [performance, setPerformance] = useState<Performance>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("views");
  const [importOpen, setImportOpen] = useState(false);
  const [kind, setKind] = useState<"content" | "queries">("content");
  const [text, setText] = useState("");
  const [daily, setDaily] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [referenceId, setReferenceId] = useState("");
  const [scope, setScope] = useState("platform");
  const [similar, setSimilar] = useState<SimilarContent>();
  const [liveKeyword, setLiveKeyword] = useState("");
  const [live, setLive] = useState<YouTubeResearch>();
  const [liveSort, setLiveSort] = useState("relevance");
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const parameters = new URLSearchParams({
    dataset,
    platform,
    keyword,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    setError("");
    api<Performance>(`/social/performance?${parameters}`)
      .then((value) => {
        if (active) {
          setPerformance(value);
          setReferenceId("");
          setSimilar(undefined);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setPerformance(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [parameters, revision]);
  useEffect(() => {
    let active = true;
    setSimilar(undefined);
    if (!referenceId) return;
    api<SimilarContent>(
      `/social/similar?${parameters}&referenceId=${encodeURIComponent(referenceId)}&scope=${scope}`,
    )
      .then((value) => {
        if (active) setSimilar(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [parameters, referenceId, scope]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const isCurrent = Boolean(performance && performance.dataset === dataset && performance.filters.platform === platform && performance.filters.keyword === keyword && (performance.filters.from || '') === from && (performance.filters.to || '') === to);
  const hasData = Boolean(
    isCurrent && performance &&
      (performance.coverage.contentRows || performance.coverage.queryRows),
  );
  function exportReport() {
    if (performance)
      download(
        `waypoint-social-${dataset}.json`,
        JSON.stringify(performance, null, 2),
        "application/json",
      );
  }
  const trend = performance?.series || [];
  const max = Math.max(1, ...trend.map((row) => row[metric] || 0));
  return (
    <div className="performance-workspace">
      <div className="performance-intro">
        <div>
          <span className="eyebrow">SOCIAL INTELLIGENCE</span>
          <h2>Know what earns attention.</h2>
          <p>
            See which topics move, which content connects, and where to go next.
          </p>
        </div>
        <div className="performance-intro-actions">
          <button
            className="button secondary"
            data-tour="import-data"
            onClick={() => setImportOpen(true)}
          >
            <FileUp size={15} />
            Import performance
          </button>
          <button
            className="button primary"
            onClick={() => setTab("Live research")}
          >
            <Radio size={15} />
            Research live
          </button>
        </div>
      </div>
      <div className="performance-source" style={{ display: tab === "API snapshots" ? "none" : undefined }}>
        <div>
          <span
            className={`source-dot ${dataset === "example" ? "example" : ""}`}
          />
          <strong>
            {dataset === "example"
              ? "Example workspace"
              : "Your performance data"}
          </strong>
          <span>
            {dataset === "example"
              ? "Fictional accounts · explore the analysis"
              : performance?.coverage.importedAt
                ? `Last import ${new Date(performance.coverage.importedAt).toLocaleDateString()}`
                : "No accounts or files connected yet"}
          </span>
        </div>
        <div className="source-toggle">
          <button
            aria-pressed={dataset === "imported"}
            className={dataset === "imported" ? "selected" : ""}
            onClick={() => setDataset("imported")}
          >
            My data
          </button>
          <button
            aria-pressed={dataset === "example"}
            data-tour="example-data"
            className={dataset === "example" ? "selected" : ""}
            onClick={() => setDataset("example")}
          >
            Explore example
          </button>
        </div>
      </div>
      <div className="performance-filter" style={{ display: tab === "API snapshots" ? "none" : undefined }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setKeyword(term);
          }}
        >
          <Search size={17} />
          <input
            data-tour="social-search"
            aria-label="Search social keyword"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={200}
            placeholder="Research a keyword or topic…"
          />
          <button className="button primary small">Explore</button>
        </form>
        <select
          aria-label="Performance platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </select>
        <label>
          From
          <input
            aria-label="Performance start date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Performance end date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="icon-button"
          aria-label="Reset performance filters"
          onClick={() => {
            setFrom("");
            setTo("");
            setPlatform("all");
            setKeyword("");
            setTerm("");
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="performance-tabs" aria-label="Performance sections">
        {[
          "Overview",
          "Keyword performance",
          "Similar content",
          "Competitors",
          "Live research",
          "API snapshots",
        ].map((name) => (
          <button
            key={name}
            data-tour={`tab-${name.toLowerCase().replaceAll(" ", "-")}`}
            aria-pressed={tab === name}
            className={tab === name ? "selected" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
        <button
          data-tour="export-report"
          className="text-button performance-export"
          onClick={exportReport}
          disabled={!hasData || tab === "API snapshots"}
        >
          <ArrowDownToLine size={14} />
          Export
        </button>
      </div>
      {tab === "API snapshots" && <NativePerformance onConnect={onIntegrations} claudeEnabled={claudeEnabled} />}
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="social-success">
          {notice}
        </p>
      )}
      {dataset === "example" && tab !== "API snapshots" && (
        <p className="example-disclosure">
          EXAMPLE DATA — these figures are fictional. Import or connect data to
          assess real performance.
        </p>
      )}
      {tab !== "Live research" && tab !== "API snapshots" && !hasData && (
        <div className="performance-empty">
          <div className="performance-empty-art">
            <BarChart3 size={43} />
          </div>
          <span className="eyebrow">START WITH YOUR NUMBERS</span>
          <h3>Performance needs a source.</h3>
          <p>
            Import daily post metrics or search-query exports from any major
            platform. Compare your content, track query clicks, and benchmark
            the accounts you include.
          </p>
          <div>
            <button
              className="button primary"
              onClick={() => setImportOpen(true)}
            >
              <FileUp size={15} />
              Import a dataset
            </button>
            <button
              className="button secondary"
              onClick={() => setDataset("example")}
            >
              Explore the example <ArrowRight size={15} />
            </button>
          </div>
          <button className="text-button" onClick={onIntegrations}>
            View API and Claude integrations <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      {hasData && performance && tab === "Overview" && (
        <>
          <div className="performance-kpis">
            {(
              [
                { key: "views", name: "Content views", icon: BarChart3 },
                { key: "impressions", name: "Impressions", icon: Layers3 },
                { key: "clicks", name: "Content clicks", icon: ArrowUpRight },
              ] as const
            ).map((item) => {
              const current = performance.totals[item.key];
              const previous = performance.previousTotals[item.key];
              const change =
                performance.comparison.metricComparable[item.key] && current !== null && previous !== null && previous > 0
                  ? ((current - previous) / previous) * 100
                  : null;
              return (
                <div className="performance-kpi" key={item.key}>
                  <div>
                    {item.name}
                    <item.icon size={17} />
                  </div>
                  <strong>{fmt(current)}</strong>
                  <small>
                    {change === null
                      ? "No comparable previous total"
                      : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous equal-length period`}
                  </small>
                  <span>
                    {performance.coverage.metrics[item.key]} daily rows with
                    this metric
                  </span>
                </div>
              );
            })}
            <div className="performance-kpi">
              <div>
                Content tracked
                <Hash size={17} />
              </div>
              <strong>{performance.posts.length}</strong>
              <small>
                {performance.coverage.accounts} account/platform combinations
              </small>
              <span>
                {performance.coverage.contentRows} daily content observations
              </span>
            </div>
          </div>
          <div className="performance-charts">
            <Panel
              title="Performance over time"
              detail={`${performance.period.from} — ${performance.period.to} · daily totals; gaps are unknown`}
              action={
                <select
                  aria-label="Trend metric"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as MetricKey)}
                >
                  <option value="views">Views</option>
                  <option value="impressions">Impressions</option>
                  <option value="clicks">Clicks</option>
                </select>
              }
            >
              <div
                className="performance-bar-chart"
                role="img"
                aria-label={`Daily ${metric} chart`}
              >
                {trend.map((row) => (
                  <div
                    key={row.date}
                    title={`${row.date}: ${row[metric] === null ? "unknown" : row[metric]}`}
                  >
                    <span
                      className={row[metric] === null ? "unknown" : ""}
                      style={{
                        height: `${row[metric] === null ? 4 : Math.max(2, (row[metric] / max) * 100)}%`,
                      }}
                    />
                    <small>{row.date.slice(8)}</small>
                  </div>
                ))}
              </div>
              <div className="chart-footnote">
                Daily {metric} · missing values are not treated as zero.
              </div>
            </Panel>
            <Panel
              title="Formats that connect"
              detail="Median views per content item within this window"
            >
              <div className="format-list">
                {performance.formats.map((format, i) => (
                  <div key={format.format}>
                    <span className="format-rank">0{i + 1}</span>
                    <div>
                      <strong>{format.format}</strong>
                      <small>{format.posts} content items</small>
                    </div>
                    <span>
                      {fmt(format.medianViews)}
                      <small>median views</small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="performance-note">
                Format and account size affect comparisons. These figures show
                association, not what caused the results.
              </p>
            </Panel>
          </div>
          <Panel
            title="Content leaderboard"
            detail="Daily observation totals, with coverage shown for each item"
            action={
              <span className="tag">{performance.posts.length} items</span>
            }
          >
            <div className="table-wrap">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>Content / account</th>
                    <th>Platform</th>
                    <th>Views</th>
                    <th>Engagement / views</th>
                    <th>Observed days</th>
                    <th>Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.posts.map((post) => (
                    <tr key={identity(post)}>
                      <td>
                        <strong>{post.title}</strong>
                        <small>
                          {post.account} · {post.ownership} · {post.format}
                        </small>
                      </td>
                      <td>
                        <span className={`platform-pill ${post.platform}`}>
                          {labels[post.platform]}
                        </span>
                      </td>
                      <td>{fmt(post.views)}</td>
                      <td>
                        {percent(post.engagementRate)}
                        <small>
                          {post.metricCoverage}/{post.days} complete rows
                        </small>
                      </td>
                      <td>{post.days}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setReferenceId(identity(post));
                            setTab("Similar content");
                          }}
                        >
                          Find similar <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      {hasData && performance && tab === "Keyword performance" && (
        <>
          <Panel
            title="Search-query performance"
            detail="Measured query rows you supply. Only this table represents query-level metrics."
          >
            <div className="table-wrap">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>Search query</th>
                    <th>Platforms</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                    <th>Query views</th>
                    <th>Daily clicks trend</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.queries.map((row) => (
                    <tr key={row.keyword}>
                      <td>
                        <strong>{row.keyword}</strong>
                        <small>{row.observations} daily observations</small>
                      </td>
                      <td>{row.platforms.map((p) => labels[p]).join(", ")}</td>
                      <td>{fmt(row.impressions)}</td>
                      <td>{fmt(row.clicks)}</td>
                      <td>{percent(row.ctr)}</td>
                      <td>{fmt(row.views)}</td>
                      <td><div className="query-sparkline" role="img" aria-label={`Daily recorded clicks for ${row.keyword}`}>{row.history.map(day => <span key={day.date} title={`${day.date}: ${day.clicks === null ? 'unknown' : day.clicks} clicks`} style={{ height: `${day.clicks === null ? 4 : Math.max(3, day.clicks / Math.max(1, ...row.history.map(value => value.clicks || 0)) * 30)}px`, opacity: day.clicks === null ? .25 : 1 }}/>)}</div><small>{row.history.length} dates reported</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!performance.queries.length && (
              <div className="inline-empty">
                <Hash size={25} />
                <p>
                  No query observations in this selection. Import a search-query
                  dataset to see actual keyword metrics.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setKind("queries");
                    setPreview(undefined);
                    setText("");
                    setImportOpen(true);
                  }}
                >
                  Import queries <ArrowRight size={14} />
                </button>
              </div>
            )}
          </Panel>
          <Panel
            title="Topics associated with content"
            detail="Full views of posts tagged with a topic. This is not keyword search volume, and topics can overlap."
          >
            <div className="table-wrap">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>Topic / keyword</th>
                    <th>Matching content</th>
                    <th>Content views</th>
                    <th>Engagement / views</th>
                    <th>Explore</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.topics.map((row) => (
                    <tr key={row.keyword}>
                      <td>
                        <strong>{row.keyword}</strong>
                      </td>
                      <td>{row.posts}</td>
                      <td>{fmt(row.views)}</td>
                      <td>{percent(row.engagementRate)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setKeyword(row.keyword);
                            setTerm(row.keyword);
                            setTab("Overview");
                          }}
                        >
                          View content <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      {hasData && performance && tab === "Similar content" && (
        <Panel
          title="Find your closest comparisons"
          detail="Compare related titles and topic tags, then inspect the performance gap."
        >
          <div className="similar-select">
            <label>
              Reference content
              <select
                aria-label="Reference content"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              >
                <option value="">Choose a content item</option>
                {performance.posts.map((row) => (
                  <option key={identity(row)} value={identity(row)}>
                    {labels[row.platform]} · {row.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comparison scope
              <select
                aria-label="Similarity scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="platform">Same platform</option>
                <option value="all">All platforms (directional)</option>
              </select>
            </label>
          </div>
          {similar ? (
            <>
              <div className="reference-card">
                <span className="tag">REFERENCE</span>
                <h3>{similar.reference.title}</h3>
                <p>
                  {similar.reference.account} ·{" "}
                  {labels[similar.reference.platform]} ·{" "}
                  {fmt(similar.reference.views)} views ·{" "}
                  {similar.reference.days} observed days
                </p>
              </div>
              <div className="table-wrap">
                <table className="performance-table">
                  <thead>
                    <tr>
                      <th>Similar content</th>
                      <th>Topic overlap</th>
                      <th>Views</th>
                      <th>View difference</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {similar.matches.map((row) => (
                      <tr key={identity(row)}>
                        <td>
                          <strong>{row.title}</strong>
                          <small>
                            {row.account} · {labels[row.platform]} ·{" "}
                            {row.ownership}
                          </small>
                        </td>
                        <td>
                          <span className="overlap-meter">
                            <span style={{ width: `${row.similarity}%` }} />
                          </span>
                          {row.similarity}%
                          <small>{row.sharedTerms.join(", ")}</small>
                        </td>
                        <td>{fmt(row.views)}</td>
                        <td>
                          {row.viewsDifference === null
                            ? "—"
                            : `${row.viewsDifference >= 0 ? "+" : "−"}${fmt(Math.abs(row.viewsDifference))}`}
                        </td>
                        <td>{row.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!similar.matches.length && (
                <div className="inline-empty">
                  No related titles/tags in this scope. Add comparable content
                  or broaden the platform scope.
                </div>
              )}
              <p className="performance-note">{similar.method}</p>
            </>
          ) : (
            <div className="inline-empty">
              <Layers3 size={28} />
              <p>Choose a post to compare similar content from your dataset.</p>
            </div>
          )}
        </Panel>
      )}
      {hasData && performance && tab === "Competitors" && (
        <Panel
          title="Account benchmarks"
          detail="Owned and competitor observations you supplied. No private competitor analytics are inferred."
        >
          <div className="table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Platform</th>
                  <th>Relationship</th>
                  <th>Content items</th>
                  <th>Views</th>
                  <th>Engagement / views</th>
                </tr>
              </thead>
              <tbody>
                {performance.accounts.map((row) => (
                  <tr key={`${row.platform}:${row.account}`}>
                    <td>
                      <strong>{row.account}</strong>
                    </td>
                    <td>{labels[row.platform]}</td>
                    <td>
                      <span
                        className={`tag ${row.ownership === "owned" ? "" : "amber"}`}
                      >
                        {row.ownership}
                      </span>
                    </td>
                    <td>{row.posts}</td>
                    <td>{fmt(row.views)}</td>
                    <td>{percent(row.engagementRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="performance-note">
            Compare the same date range and metric definitions. Audience size,
            age, and incomplete reporting can change the interpretation.
          </p>
        </Panel>
      )}
      {tab === "Live research" && (
        <Panel
          title="Live YouTube discovery"
          detail="Find videos for a keyword and compare public lifetime performance."
        >
          <form
            className="live-research-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setLive(undefined);
                setLive(
                  await api<YouTubeResearch>("/social/research/youtube", {
                    keyword: liveKeyword,
                    sort: liveSort,
                  }),
                );
              });
            }}
          >
            <Search size={18} />
            <input
              aria-label="Live YouTube keyword"
              required
              minLength={2}
              maxLength={150}
              value={liveKeyword}
              onChange={(e) => setLiveKeyword(e.target.value)}
              placeholder="e.g. balcony garden"
            />
            <select
              aria-label="YouTube research sort"
              value={liveSort}
              onChange={(e) => setLiveSort(e.target.value)}
            >
              <option value="relevance">Most relevant</option>
              <option value="viewCount">Most viewed</option>
              <option value="date">Newest</option>
            </select>
            <button className="button primary" disabled={busy}>
              {busy ? "Researching…" : "Search YouTube"}
              <ArrowRight size={15} />
            </button>
          </form>
          {live ? (
            <>
              <p className="live-source">
                <Radio size={13} />
                YouTube Data API · collected{" "}
                {new Date(live.collectedAt).toLocaleString()}
              </p>
              <div className="table-wrap">
                <table className="performance-table">
                  <thead>
                    <tr>
                      <th>Video / channel</th>
                      <th>Lifetime views</th>
                      <th>Views / day of age</th>
                      <th>Likes</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.results.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <a href={row.url} target="_blank" rel="noreferrer">
                            <strong>{row.title}</strong>
                            <ArrowUpRight size={12} />
                          </a>
                          <small>
                            {row.channel} · published{" "}
                            {row.publishedAt.slice(0, 10)} · {row.daysOld} days
                            old
                          </small>
                        </td>
                        <td>{fmt(row.views)}</td>
                        <td>{fmt(row.viewsPerDay)}</td>
                        <td>{fmt(row.likes)}</td>
                        <td>{fmt(row.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="performance-note">{live.disclosure}</p>
            </>
          ) : (
            <div className="live-info">
              <Radio size={28} />
              <h3>Research beyond your own posts.</h3>
              <p>
                The native connector uses your server’s YouTube API key. Public
                discovery provides views, likes, comments, and publication
                dates. These are video totals, not keyword search volume.
              </p>
              <button className="text-button" onClick={onIntegrations}>
                API setup and platform support <ArrowRight size={14} />
              </button>
            </div>
          )}
          <p className="performance-note">
            For Instagram, TikTok, LinkedIn organizations, Facebook Pages, X,
            Pinterest and Threads, configure native account pulls in Integrations
            and view the results under API snapshots. Daily CSV/JSON imports
            remain available for all eight platforms.
          </p>
        </Panel>
      )}
      {performance && hasData && tab !== "API snapshots" && (
        <div className="performance-methods">
          <span>
            <Check size={13} />
            Source and metric coverage retained
          </span>
          <p>
            {performance.disclosure} Engagement/views uses only daily rows with
            views and all four interaction fields (likes + comments + shares +
            saves). Unknown values show “—”. Previous period: {performance.period.previousFrom || 'unavailable'} — {performance.period.previousTo || 'unavailable'}. Coverage: {performance.comparison.currentDays}/{performance.comparison.expectedDays} current days, {performance.comparison.previousDays}/{performance.comparison.expectedDays} previous days.
          </p>
        </div>
      )}
      {claudeEnabled && tab !== "API snapshots" && (
        <div className="optional-ai">
          <button
            className="button secondary"
            onClick={() => setAiOpen(!aiOpen)}
          >
            {aiOpen ? "Close" : "Analyze this data with Claude"}
            <ArrowRight size={14} />
          </button>
          {aiOpen && (
            <ClaudeAdvisor
              context={JSON.stringify({ performance, similar, live }).slice(
                0,
                16000,
              )}
            />
          )}
        </div>
      )}
      <details className="publishing-tools">
        <summary>
          Sharing metadata and publishing utilities <ChevronDown size={15} />
        </summary>
        <SocialTools domain={domain} />
      </details>
      {importOpen && (
        <div className="import-backdrop">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="import-heading">
              <div>
                <span className="eyebrow">CONNECT YOUR NUMBERS</span>
                <h2 id="import-title">Import performance data</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close import"
                onClick={() => setImportOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="import-explainer">
              Map your export to this template. Each row must contain{" "}
              <strong>daily increments</strong>, not cumulative lifetime totals.
              Blank metrics stay unknown.
            </p>
            <div className="import-kind">
              <button
                aria-pressed={kind === "content"}
                className={kind === "content" ? "selected" : ""}
                onClick={() => {
                  setKind("content");
                  setPreview(undefined);
                  setText("");
                  setDaily(false);
                }}
              >
                Content metrics
              </button>
              <button
                aria-pressed={kind === "queries"}
                className={kind === "queries" ? "selected" : ""}
                onClick={() => {
                  setKind("queries");
                  setPreview(undefined);
                  setText("");
                  setDaily(false);
                }}
              >
                Search-query metrics
              </button>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    `waypoint-${kind}-template.csv`,
                    kind === "content" ? contentTemplate : queryTemplate,
                    "text/csv",
                  )
                }
              >
                <ArrowDownToLine size={13} />
                Template
              </button>
            </div>
            <label className="import-file">
              Choose CSV file
              <input
                aria-label="Performance CSV file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 900000)
                        throw new Error("Choose a CSV below 900 KB.");
                      setText(await file.text());
                      setPreview(undefined);
                    });
                }}
              />
            </label>
            <label htmlFor="performance-csv">Or paste your mapped CSV</label>
            <textarea
              id="performance-csv"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(undefined);
              }}
              maxLength={900000}
              placeholder={kind === "content" ? contentTemplate : queryTemplate}
            />
            <label className="daily-confirm">
              <input
                type="checkbox"
                checked={daily}
                onChange={(e) => setDaily(e.target.checked)}
              />
              I confirm these rows are daily increments. A repeat import
              replaces the same content/query day.
            </label>
            <div className="import-actions">
              <button
                className="button secondary"
                disabled={busy || !text || !daily}
                onClick={() =>
                  void run(async () =>
                    setPreview(
                      await api<ImportPreview>("/social/import/preview", {
                        kind,
                        csv: text,
                        metricBasis: "daily",
                      }),
                    ),
                  )
                }
              >
                Validate & preview
              </button>
              <button
                className="button primary"
                disabled={busy || !daily || !preview?.valid}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ imported: number }>(
                      "/social/import",
                      { kind, csv: text, metricBasis: "daily" },
                    );
                    setNotice(
                      `Imported ${result.imported} daily observations. Your existing workspace is preserved.`,
                    );
                    setDataset("imported");
                    setFrom("");
                    setTo("");
                    setKeyword("");
                    setTerm("");
                    setPlatform("all");
                    setRevision((v) => v + 1);
                    setTab(kind === "queries" ? "Keyword performance" : "Overview");
                    setImportOpen(false);
                    setPreview(undefined);
                  })
                }
              >
                Import{" "}
                {preview?.valid ? `${preview.rows} rows` : "validated data"}
                <ArrowRight size={14} />
              </button>
            </div>
            {preview && (
              <div
                className={`import-preview ${preview.valid ? "valid" : "invalid"}`}
              >
                <strong>
                  {preview.valid
                    ? `${preview.rows} rows ready`
                    : "Fix these rows before importing"}
                </strong>
                {preview.errors.map((e, i) => (
                  <p key={i}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
                {preview.valid && (
                  <pre>
                    {JSON.stringify(preview.preview.slice(0, 2), null, 2)}
                  </pre>
                )}
              </div>
            )}
            {error && (
              <p className="social-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
