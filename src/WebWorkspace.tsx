import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Globe2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { api, csv, download } from "./lib";
import {
  normalizeWebDomain,
  webTemplates,
  type WebKind,
  type WebReport,
} from "../shared/web-data";
import type { Audit } from "../shared/types";
import SiteResults from './SiteResults';
import TrafficOptions from './TrafficOptions';
import GrowthPlan from './GrowthPlan';
import SiteHealth from './SiteHealth';
import { KeywordIdeas, Opportunities } from './KeywordTools';
import "./web-workspace.css";
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const kinds: Record<WebKind, string> = {
  search: "Search Console queries",
  backlinks: "Backlink URLs",
  ranks: "Observed rankings",
};
export default function WebWorkspace({
  page,
  domain,
  onDomain,
  onIntegrations,
}: {
  page: number;
  domain: string;
  onDomain: (domain: string) => void;
  onIntegrations: () => void;
}) {
  const [input, setInput] = useState(domain);
  const [report, setReport] = useState<WebReport>();
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [datasetId, setDatasetId] = useState("");
  const [term, setTerm] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [kind, setKind] = useState<WebKind>("search");
  const [importDomain, setImportDomain] = useState(domain);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("Google Search Console");
  const [scope, setScope] = useState("All countries/devices; web search");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{
    valid: boolean;
    count: number;
    errors: string[];
    sample: unknown[];
  }>();
  const [html, setHtml] = useState("");
  const [audit, setAudit] = useState<Audit>();
  const [keyword, setKeyword] = useState("");
  useEffect(() => {
    setInput(domain);
    setImportDomain(domain);
    setDatasetId("");
    setAudit(undefined);
    setTerm("");
  }, [domain]);
  useEffect(() => {
    let active = true;
    api<string[]>("/web/domains")
      .then((r) => {
        if (active) setDomains(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    setReport(undefined);
    if (!domain) return;
    let active = true;
    setError("");
    api<WebReport>(
      `/web/report?${new URLSearchParams({ domain, ...(datasetId ? { datasetId } : {}) })}`,
    )
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [domain, datasetId, refresh]);
  useEffect(() => {
    setTerm("");
  }, [page]);
  useEffect(() => {
    setPreview(undefined);
  }, [kind, importDomain, from, to, text, source, scope]);
  const body = {
    domain: importDomain,
    kind,
    from,
    to,
    csv: text,
    source,
    scope,
  };
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      setNotice('');
    } finally {
      setBusy(false);
    }
  }
  function openImport(next: WebKind = "search") {
    setKind(next);
    setSource(
      next === "search"
        ? "Google Search Console"
        : "User-supplied observations",
    );
    setImportDomain(domain);
    setImportOpen(true);
  }
  async function fileText(file: File | undefined, set: (text: string) => void) {
    if (!file) return;
    if (file.size > 900000) {
      setError("Use a file smaller than 900 KB.");
      return;
    }
    set(await file.text());
  }
  const rows =
    report?.queries.filter((q) =>
      q.query.toLowerCase().includes(term.toLowerCase()),
    ) || [];
  const links =
    report?.links.filter((r) =>
      `${r.source_url} ${r.target_url} ${r.anchor}`
        .toLowerCase()
        .includes(term.toLowerCase()),
    ) || [];
  return (
    <div className="web-workspace">
      <section className="panel web-setup" data-tour="own-domain">
        <div className="web-analyze-label"><h2>Analyze a website</h2><span>Public SEO scan</span></div>
        <form
          className="web-domain-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const value = normalizeWebDomain(input.trim());
              onDomain(value);
              const started = Date.now();
              const tick = () => setNotice(`Crawling up to 50 pages of ${value}, checking SEO and AI search readiness… ${Math.round((Date.now() - started) / 1000)}s (usually 10–30s)`);
              tick();
              const timer = setInterval(tick, 1000);
              try { await api('/web/scan', {domain:value}); } finally { clearInterval(timer); }
              setNotice(`Scan saved for ${value}.`);
              setRefresh(v => v + 1);
            });
          }}
        >
          <Globe2 size={18} />
          <input
            aria-label="Your website domain"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. yoursite.com or paste any page URL"
            required
            maxLength={253}
            autoFocus={!domain}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
          />
          {input && <button type="button" className="icon-button" aria-label="Clear website" onClick={() => setInput('')}><X size={16} /></button>}
          <button className="button primary" disabled={busy}>{busy ? 'Working…' : 'Analyze website'}</button>
        </form>
        {domains.length > 1 && <div className="web-recent" aria-label="Recent websites"><span>Recent:</span>{domains.slice(0, 5).map(d => <button type="button" key={d} className={d === domain ? 'active' : ''} aria-pressed={d === domain} disabled={busy} onClick={() => { setInput(d); onDomain(d); setNotice(''); }}>{d}</button>)}</div>}
        <details className="web-advanced" data-web-advanced="true"><summary>Import data and more options</summary>
        {!!domains.length && (
          <label>
            Saved domains
            <select
              aria-label="Saved domains"
              value={domains.includes(domain) ? domain : ""}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onDomain(e.target.value);
              }}
            >
              <option value="">Choose a domain</option>
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <div className="web-toolbar">
          <button className="text-button" data-web-action="select-domain" disabled={busy} onClick={() => {try {onDomain(normalizeWebDomain(input.trim()));setError('');setNotice('Showing saved data. Use Analyze website to run a new public scan.');} catch {setError('Enter your website domain, such as yoursite.com.');}}}>Use saved / imported data</button>
          <button
            className="button secondary"
            onClick={() =>
              openImport(
                page === 2 ? "backlinks" : page === 4 ? "ranks" : "search",
              )
            }
          >
            <Upload size={15} />
            Import SEO data
          </button>
          <button className="text-button" onClick={onIntegrations}>
            Use my Claude plan through Claude Code ↗
          </button>
        </div>
        </details>
      </section>
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
      {importOpen && (
        <section className="panel web-import">
          <div className="panel-head">
            <div>
              <h2>Import your SEO data</h2>
              <p>Choose a file or paste CSV, then validate and import.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Close SEO import"
              onClick={() => setImportOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () =>
                setPreview(await api("/web/import/preview", body)),
              );
            }}
          >
            <div className="web-fields">
              <label>
                Dataset type
                <select
                  aria-label="SEO dataset type"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as WebKind);
                    setSource(
                      e.target.value === "search"
                        ? "Google Search Console"
                        : "User-supplied observations",
                    );
                  }}
                >
                  {Object.entries(kinds).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Domain for this dataset
                <input
                  aria-label="Import domain"
                  required
                  value={importDomain}
                  onChange={(e) => setImportDomain(e.target.value)}
                  placeholder="Your site or another authorized dataset"
                />
              </label>
              <label>
                From
                <input
                  aria-label="SEO import start date"
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To / snapshot date
                <input
                  aria-label="SEO import end date"
                  type="date"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label>
                Source
                <input
                  aria-label="SEO import source"
                  required
                  maxLength={100}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>
              <label>
                Export scope / filters
                <input
                  aria-label="SEO import scope"
                  required
                  maxLength={200}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </label>
            </div>
            <details className="web-details"><summary>CSV format and import help</summary><p className="web-help">
              {kind === "search"
                ? "Search Console → Performance → Search results → select date range and filters → Queries → Export CSV. Open the Queries CSV from the downloaded export. English “Top queries,Clicks,Impressions,CTR,Position” headers are accepted. Choose the same range/scope above. These are query-table totals, not whole-site traffic or global search volume."
                : kind === "backlinks"
                  ? "Use source_url,target_url,anchor,rel. Each target must belong to this domain. This inspects your supplied link list; it does not discover or verify live backlinks."
                  : "Use keyword,date,position,country,device,url. Positions are actual manually observed integer ranks. Country defaults to all; device is all/desktop/mobile/tablet. No automated Google scraping occurs."}
            </p><p className="web-help">A matching domain, type, date range and scope replaces its previous dataset. Different windows stay separate.</p></details>
            <div className="web-toolbar">
              <label className="button secondary">
                Upload CSV
                <input
                  aria-label="Upload SEO CSV"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void fileText(e.target.files?.[0], setText)}
                />
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  download(
                    `waypoint-${kind}-template.csv`,
                    webTemplates[kind],
                    "text/csv",
                  )
                }
              >
                Download header template
              </button>
            </div>
            <label htmlFor="web-import-csv">
              Paste your CSV
              <textarea
                id="web-import-csv"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={webTemplates[kind]}
                maxLength={900000}
                required
              />
            </label>
            {preview && (
              <div
                className={`web-preview ${preview.valid ? "valid" : ""}`}
                role="status"
              >
                <strong>
                  {preview.valid
                    ? `${preview.count} rows validated`
                    : "Fix these rows before importing"}
                </strong>
                {preview.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
                <pre>{JSON.stringify(preview.sample, null, 2)}</pre>
              </div>
            )}
            <div className="web-toolbar">
              <button
                data-web-action="validate"
                className="button secondary"
                disabled={busy}
              >
                Validate preview
              </button>
              <button
                data-web-action="import"
                className="button primary"
                type="button"
                disabled={busy || !preview?.valid}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{
                      imported: number;
                      domain: string;
                    }>("/web/import", body);
                    setNotice(
                      `Imported ${result.imported} rows for ${result.domain}.`,
                    );
                    setRefresh((r) => r + 1);
                    if (!domain) onDomain(result.domain);
                    setImportOpen(false);
                  })
                }
              >
                Import validated data
              </button>
            </div>
          </form>
        </section>
      )}
      {!domain ? (
        <section className="panel web-empty">
          <Globe2 size={35} />
          <h3>Enter your website above to get started.</h3>
          <p>Analyze its public pages, then follow the findings to your next task.</p>
        </section>
      ) : !report && !error ? (
        <p role="status">Loading your saved data…</p>
      ) : (
        report && (
          <>
            {page === 6 && <section className="panel web-report-actions">
              <div><h2>Your SEO report</h2><p>{domain} · saved findings and source details</p></div>
              <div className="web-toolbar">
                <button className="button primary" onClick={() => download(`waypoint-${domain}-measured.json`, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2), 'application/json')}><ArrowDownToLine size={15} />Export measured report</button>
                <button className="button secondary" onClick={() => window.print()}>Print / save PDF</button>
              </div>
            </section>}
            {page === 0 && <GrowthPlan report={report} />}
            <SiteResults key={domain} site={report.site} page={page} comparisons={report.publicComparisons} refresh={() => setRefresh(v => v + 1)} history={report.scanHistory} pageSpeed={report.pageSpeed} />
            {page === 3 && report.site && <SiteHealth key={domain} site={report.site} report={report} refresh={() => setRefresh(v => v + 1)} />}
            {page === 1 && <KeywordIdeas key={domain} report={report} refresh={() => setRefresh(v => v + 1)} />}
            {page === 1 && <Opportunities report={report} />}
            {report.search && [1,5,6].includes(page) && <details className="web-data-source">
              <summary>Search data · {report.search.from} – {report.search.to}</summary>
              <div className="web-source">
              {report.search && (
                <label>
                  Query dataset
                  <select
                    aria-label="Query dataset"
                    value={datasetId || report.search.id}
                    onChange={(e) => setDatasetId(e.target.value)}
                  >
                    {report.datasets
                      .filter((d) => d.kind === "search")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.from} – {d.to} · {d.scope} · {d.source}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p>{report.search.source} · {report.search.scope}. Query subset only.</p>
              </div>
            </details>}
            {(page === 0 || page === 6) && report.search && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>
                      Search performance
                    </h2>
                    <p>
                      {report.search.from} – {report.search.to} · returned query subset
                    </p>
                  </div>
                </div>
                <div className="web-stats">
                  {[
                    ["Query clicks", report.totals.clicks],
                    ["Query impressions", report.totals.impressions],
                    ["Query CTR %", report.totals.ctr],
                    ["Reported queries", report.totals.queries],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <small>{label}</small>
                      <strong>{fmt(value as number | null)}</strong>
                    </div>
                  ))}
                </div>
                <p className="web-source-note">{report.search.source}. Query clicks and impressions are separate from site visits. <a href="#keyword-research">Explore queries →</a></p>
              </section>
            )}
            {page === 1 && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Keyword performance</h2>
                    <p>
                      Search queries from your connected data or imports.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={!rows.length}
                    onClick={() =>
                      download(
                        `waypoint-${domain}-queries.csv`,
                        csv([
                          [
                            "query",
                            "clicks",
                            "impressions",
                            "ctr_percent",
                            "average_position",
                          ],
                          ...rows.map((r) => [
                            r.query,
                            r.clicks,
                            r.impressions,
                            r.ctr ?? "",
                            r.position ?? "",
                          ]),
                        ]),
                        "text/csv",
                      )
                    }
                  >
                    Export CSV
                  </button>
                </div>
                <label className="web-search">
                  <Search size={16} />
                  <input
                    aria-label="Filter measured keywords"
                    placeholder="Search your queries, e.g. batik dress"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    type="search"
                  />
                  {term && <button type="button" className="icon-button" aria-label="Clear query search" onClick={() => setTerm('')}><X size={15} /></button>}
                  {!!report.queries.length && <small className="web-search-count">{rows.length} of {report.queries.length}</small>}
                </label>
                {rows.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Query</th>
                          <th>Clicks</th>
                          <th>Impressions</th>
                          <th>CTR %</th>
                          <th>Average position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 500).map((r) => (
                          <tr key={r.query}>
                            <td>{r.query}</td>
                            <td>{fmt(r.clicks)}</td>
                            <td>{fmt(r.impressions)}</td>
                            <td>{fmt(r.ctr)}</td>
                            <td>{fmt(r.position)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="web-empty">
                    <h3>
                      {report.search
                        ? "No queries match this filter."
                        : "Add search data to see keyword performance."}
                    </h3>
                    <p>
                      Connect Google below or import a Search Console export.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => openImport("search")}
                    >
                      Import queries
                    </button>
                  </div>
                )}
                {rows.length > 500 && (
                  <p className="web-help">
                    Showing 500 matches. Export CSV for all {rows.length} rows
                    or narrow the filter.
                  </p>
                )}
              </section>
            )}
            {page === 2 && (
              <details className="panel web-secondary-tool">
                <summary>Imported backlinks {report.totals.backlinks === null ? '' : `(${fmt(report.totals.backlinks)})`}</summary>
                <div className="panel-head">
                  <div>
                    <h2>Inbound links from your records</h2>
                    <p>
                      Source URLs, targets and anchors from your supplied list.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => openImport("backlinks")}
                  >
                    Import links
                  </button>
                </div>
                {links.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Source URL</th>
                          <th>Target URL</th>
                          <th>Anchor</th>
                          <th>Rel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {links.slice(0, 500).map((r, i) => (
                          <tr key={i}>
                            <td>
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {r.source_url}
                              </a>
                            </td>
                            <td>{r.target_url}</td>
                            <td>{r.anchor || "—"}</td>
                            <td>{r.rel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="web-empty">
                    <h3>No supplied backlinks yet.</h3>
                    <p>
                      Import a link list from your own records or an export you
                      are authorized to use.
                    </p>
                  </div>
                )}
              </details>
            )}
            {page === 3 && (
              <details className="panel web-secondary-tool" data-manual-audit="true">
                <summary>Audit pasted or uploaded HTML</summary>
                <div className="panel-head">
                  <div>
                    <h2>Audit your actual page HTML</h2>
                    <p>
                      Paste view-source HTML or upload an HTML file. The checker
                      reads markup without executing scripts or crawling the
                      site.
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const r = await api<Audit>("/web/audit", {
                        domain,
                        html,
                      });
                      setAudit(r);
                      setRefresh((v) => v + 1);
                    });
                  }}
                >
                  <label className="web-toolbar">
                    Upload HTML
                    <input
                      aria-label="Upload audit HTML"
                      type="file"
                      accept=".html,.htm,text/html"
                      onChange={(e) =>
                        void fileText(e.target.files?.[0], setHtml)
                      }
                    />
                  </label>
                  <textarea
                    aria-label="Your page HTML"
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    placeholder="Paste the HTML from your own page here"
                    minLength={10}
                    maxLength={900000}
                    required
                  />
                  <div className="web-toolbar">
                    <button
                      data-web-action="audit"
                      className="button primary"
                      disabled={busy}
                    >
                      Run HTML audit
                    </button>
                  </div>
                </form>
                {(audit || report.audit) && (
                  <div className="web-audit">
                    <h3>
                      Markup checklist: {(audit || report.audit)!.score}/100
                    </h3>
                    <p>
                      This checklist score is not a search ranking or a
                      site-wide SEO score.
                    </p>
                    {(audit || report.audit)!.checks.map((c) => (
                      <div key={c.name}>
                        <strong>
                          {c.passed ? <Check size={15} /> : <X size={15} />}{" "}
                          {c.name}
                        </strong>
                        <p>{c.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )}
            {page === 4 && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Observed rank tracking</h2>
                    <p>
                      Save a keyword, then import actual dated positions.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => openImport("ranks")}
                  >
                    Import positions
                  </button>
                </div>
                {page === 4 && (
                  <form
                    className="web-toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("/web/track", { domain, keyword });
                        setKeyword("");
                        setRefresh((v) => v + 1);
                        setNotice(
                          "Keyword saved. Import observed positions to populate its history.",
                        );
                      });
                    }}
                  >
                    <input
                      aria-label="Keyword to monitor"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="Keyword to monitor"
                      required
                      maxLength={200}
                    />
                    <button
                      data-web-action="track"
                      className="button secondary"
                    >
                      <Plus size={14} />
                      Save keyword
                    </button>
                  </form>
                )}
                {report.ranks.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Keyword</th>
                          <th>Date</th>
                          <th>Country / device</th>
                          <th>Observed position</th>
                          <th>Previous</th>
                          <th>Improvement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.ranks.map((r) => (
                          <tr
                            key={JSON.stringify([
                              r.keyword,
                              r.country,
                              r.device,
                            ])}
                          >
                            <td>{r.keyword}</td>
                            <td>{r.date}</td>
                            <td>
                              {r.country} / {r.device}
                            </td>
                            <td>{r.position}</td>
                            <td>{fmt(r.previous)}</td>
                            <td>{fmt(r.change)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="web-empty">
                    No observed positions. Saving a keyword does not generate a
                    rank.
                  </p>
                )}
                {!!report.tracks.length && (
                  <div className="web-tracks">
                    <h3>Your watchlist</h3>
                    {report.tracks.map((t) => (
                      <div key={JSON.stringify(t)}>
                        <span>
                          {t.keyword} · {t.country}/{t.device}
                        </span>
                        <button
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              await api(
                                "/web/track",
                                { domain, ...t },
                                "DELETE",
                              );
                              setRefresh((v) => v + 1);
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {page === 5 && (
              <details className="panel web-secondary-tool">
                <summary>Compare authorized query datasets</summary>
                <div className="panel-head">
                  <div>
                    <h2>Compare supplied domain datasets</h2>
                    <p>
                      Query overlap requires matching dates and coverage.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      openImport("search");
                      setImportDomain("");
                    }}
                  >
                    Import another domain
                  </button>
                </div>
                {report.competitors.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Domain</th>
                          <th>Shared queries</th>
                          <th>Other-domain-only queries</th>
                          <th>Query-set overlap %</th>
                          <th>Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.competitors.map((c) => (
                          <tr key={c.domain}>
                            <td>{c.domain}</td>
                            <td>{c.comparable ? c.sharedQueries : "—"}</td>
                            <td>{c.comparable ? c.uniqueQueries : "—"}</td>
                            <td>{c.comparable ? fmt(c.overlap) : "—"}</td>
                            <td>
                              {c.comparable
                                ? "Matching period / scope"
                                : "Different dates or filters"}
                              <small>
                                {c.from} – {c.to} · {c.source}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="web-empty">
                    <h3>No comparison datasets yet.</h3>
                    <p>
                      Import another authorized domain’s query dataset. This
                      feature cannot reveal private competitor traffic.
                    </p>
                  </div>
                )}
              </details>
            )}
            {[0,1,6].includes(page) && <TrafficOptions key={domain} domain={domain} report={report} refresh={() => {setDatasetId('');setRefresh(v => v + 1);}} />}
            <details className="web-data-source"><summary>Data sources and limitations</summary><p>{report.disclosure}</p>{report.backlinks && <p>Supplied backlinks: {fmt(report.totals.backlinks)} · {report.backlinks.from} – {report.backlinks.to} · {report.backlinks.source}</p>}{page === 6 && <p>Observed ranking groups: {report.ranks.length}. Saved comparison domains: {report.publicComparisons.length}. The JSON export includes complete saved report data.</p>}</details>
          </>
        )
      )}
    </div>
  );
}
