# Roadmap

## 0.1 — Initial local workspace (implemented)

- Seven original tool views; consistent synthetic-data disclosures.
- Project and keyword-baseline persistence in SQLite.
- Domain-specific demo metrics; keyword filtering and CSV export.
- Actual submitted-HTML checks; report preview, JSON, browser printing.
- Environment template, tests, production build, CI, private-repository helper.

## 0.2 — Social SEO and Claude (implemented)

- Social-share markup audit, illustrative Open Graph/X-style previews, escaped metadata builder.
- Caption topic/hashtag checks, local exports and UTM campaign links.
- Server-side Anthropic Claude advisor with bounded requests, missing-key state and sanitized errors.
- Ten local MCP tools, generated client configuration, real stdio integration test.
- Claude Code registered for the current project and reported Connected. Claude Desktop setup is documented.
- Live Claude API verification still requires a configured Anthropic key; local SDK tests use a mocked response.

## 0.3 — Measured social performance and optional platform plugin (implemented)

- Daily content/query CSV validation, preview, atomic imports and normalized ingestion API for eight platforms.
- Query impressions/clicks/CTR/history, topic-associated performance, date/platform/keyword filters and source separation.
- Missing-data-aware totals, rate denominators, period coverage, lexical similar-content comparisons and account benchmarks.
- Native public YouTube keyword discovery and video statistics adapter; live verification requires a key.
- Redesigned platform navigation and Integrations; optional in-app Claude off by default.
- Optional Claude Code source plugin with three skills, 17 MCP tools, validated manifest and tested launcher/bundle.

## 0.4 — Native social pulls and guided introduction (implemented)

- Official token-based read adapters for Instagram, TikTok, LinkedIn organizations, Facebook Pages, X, Pinterest and Threads.
- Manual bounded pulls, provider capability/setup cards, rate/auth/error handling, atomic lifetime capture storage.
- API snapshots view with latest-per-post counters, topic filtering, same-platform lexical comparisons, run warnings and JSON export.
- Read-only saved API snapshots in the optional Claude plugin (18 tools total).
- First-visit introduction and replayable button-by-button tour on desktop and phone.
- Live credential/account verification remains conditional on provider-approved tokens; no embedded OAuth/refresh service.

## 0.5 — Public scans, measured SEO, optional providers and private service (implemented)

- Own-domain/import workspace replaces the fictional web demo UI and preset `northstar.example` domain. Empty sections offer data setup guidance.
- Validated declared-window CSV snapshots for Search Console queries, supplied backlinks and dated manual rank observations; preview, atomic replacement and nullable data.
- Actual query filtering/CTR, supplied referring-host analysis, watchlist, observed rank changes, compatible query-set competitor comparisons and source-aware reports.
- Automatic **Analyze website** public HTTPS scan: robots policy, homepage plus up to two eligible internal pages, metadata/headings/topics/outbound links and static checklist. DNS/IP pinning, redirect/address restrictions, byte limits and deadlines bound collection. Optional pasted/uploaded HTML audit remains available. No full-site crawler, global index or automated SERP scraping.
- Optional authorized read-only Google Search Console and matching-domain GA4 API reads with explicit dates, nullable metrics, pagination/time limits and sanitized errors. Free CSV imports remain independent.
- Optional server-key Similarweb traffic estimates through an explicit paid-quota action, for up to 12 complete calendar months; estimates stay separate from measured analytics. Google/Similarweb live access remains unverified without credentials.
- Optional Claude toolkit expanded to 21 tools: public website_scan and CSV preview are read-only; seo_import writes only on explicit user request. The other 20 tools are read-only, with network annotations for public scans and YouTube research. Web research uses actual saved data; no web demo mode.
- Windows subscription launcher reuses Claude Code authentication/direct MCP or plugin fallback, preserving saved credentials and `.env`. A real subscription smoke call read an empty measured report.
- Loopback production service on 4321 with private Tailscale HTTPS, one allowed private origin, supervised restarts and separately configured Windows automatic startup in this workspace.
- Current limits: host must stay awake/signed in; full reboot recovery untested; no app-level users/roles; subscription is local Claude Code, not a web backend. Live Google/Similarweb and social permission checks still require provider credentials/entitlements; configuration is not proof of access.

## 0.6 — Growth plan, site crawl and AI search readiness (implemented)

- Overview Top-10 monthly action plan ranked from crawl, query, rank, backlink, AI and speed data, with per-month progress and scan-to-scan fixed/new changes.
- Breadth-first crawl of up to 50 pages (was 3) with grouped page issues, compressed-response decoding, per-page redirect limits and clean stops at size/time budgets.
- AI search readiness score, AI crawler access, llms.txt detection, llms.txt and JSON-LD generators.
- Google PageSpeed Insights tests (optional free key) plus crawl speed signals; Google Autocomplete keyword ideas with relevance filtering; Search Console quick-win lists; richer site comparisons.
- MCP toolkit expanded to 24 tools.

## 0.7 — Expanded provider-backed research

- Select licensed keyword, backlink, and SERP data sources after reviewing coverage, cost, terms, and retention constraints.
- Convert the provider interface to async operations with independent capability flags, pagination, market/device/date filters, timeouts, bounded retries, usage budgets, and cache keys.
- Return explicit unavailable/partial responses rather than substituted demo metrics. Keep provenance on each metric and report.
- Extend the existing authorized Google reads with managed OAuth/refresh, scheduled sync and change history if needed. Preserve query-table coverage limits and distinguish observed clicks/sessions from third-party estimates.
- Extend existing compatible query-set comparisons to licensed index/content datasets without claiming private competitor traffic.
- Acceptance: integration fixtures and a limited live smoke test establish timestamps, source labels, costs, and graceful failure.

## 0.8 — Larger crawls and scheduling

- Extend the existing three-page robots-aware scanner into an ownership/permission workflow with explicit larger crawl budgets, same-origin boundaries and sitemap traversal.
- Preserve existing HTTPS/public-IP pinning, redirect revalidation, private-address restrictions, response-byte limits and deadlines while adding restricted-worker networking and configurable per-site budgets.
- Queue-based crawl jobs with cancellation, retries, per-host throttling and job progress.
- Persist pages, response headers, links and findings; detect duplicate titles, broken internal links, canonical conflicts and indexing issues.
- Acceptance: local test sites cover redirects, private-IP attempts, robots exclusions, malformed HTML and cancellation; never expose arbitrary URL fetching as an unguarded endpoint.

## 0.9 — Scheduled rank collection and reports

- Extend imported manual observation history with provider-collected SERP observations keyed by project, keyword, market, device and date.
- Scheduled jobs with idempotency keys, provider quotas, alerts and missing-result states.
- Audited scheduled-result changes, visibility formula documentation, comparison periods, saved report configurations and scheduled report delivery.
- Acceptance: history survives restarts, retrying a job does not duplicate observations, and missing ranks never become invented positions.

## 1.0 — Multi-user release

- Authentication, organization membership, project-level authorization, CSRF protection, rate limits, audit logs and migrations.
- Managed PostgreSQL, queue workers, server-side secret storage, backups and restore verification.
- Retention/export/delete controls, keyboard/screen-reader review and contrast audit, browser end-to-end CI, accessibility and performance budgets.
- Public deployment runbooks and restore checks. Keep the existing private Tailscale service separate; remove the loopback bind only as part of this authenticated multi-user milestone.
