# Architecture and operating boundaries

Browser → same-origin JSON API → validation → local analysis or explicit provider request → SQLite/response.

The frontend never needs provider credentials. Web tools combine explicit public website scans with the selected domain's supplied or authorized data. There is no fictional web demo option or preset example domain in the UI or MCP web tools. Empty data stays empty. Legacy example HTTP endpoints remain separate for API compatibility; Social SEO and Integrations operate independently of them.

## Free web SEO data

`shared/web-data.ts` defines import/report contracts. `server/web-data.ts` validates CSV, previews rows, saves snapshots and produces source-aware reports. The `/api/web/*` routes serve the measured workspace independently of `/api/analysis`, `/api/keywords` and other legacy demo routes.

`web_datasets` stores domain/type/date-window/scope snapshots with source and import time. Matching snapshot identity replaces its payload atomically; different or overlapping windows are kept separate and never summed. Search data is one row per query for its declared window, with clicks, impressions and nullable average position. English Search Console Queries headers and canonical headers are supported. Input CTR is ignored and recomputed. Query-table totals can omit anonymized or truncated queries and are not global demand or whole-site visitors.

Backlinks analyze supplied source/target URL pairs; they do not discover or verify links. Targets must belong to the selected domain/subdomains. Competitor comparisons use imported query-set Jaccard overlap, only when declared dates and filter scope match. Scope is a user declaration, not exporter verification.

`web_tracks` is a watchlist without generated positions. Imported dated rank observations retain country/device scope; overlapping observation identities use the latest import. The two latest distinct observed dates determine rank change. `web_audits` stores the latest static HTML audit per domain. Reports select one query snapshot, latest link snapshot, rank observations/watchlist and latest audit, with missing-data limits. Full format, coverage and size limits are in [FREE_SEO.md](FREE_SEO.md).

## Public website scanning and optional data providers

`server/site-scan.ts` inspects public HTTPS markup only after **Analyze website** or an explicit `website_scan` MCP call. It checks robots.txt before pages, normalizes the request to the homepage, and inspects up to two eligible same-origin static-looking internal pages. It extracts homepage metadata/headings/topics, link previews, structured-data types and a static audit, plus a small checked-page summary. Topics are lexical frequencies; outbound links are not inbound backlinks; duplicate/broken-link findings cover only checked pages.

Each destination is DNS-validated to public addresses and the chosen address is pinned for the request while retaining hostname TLS identity. Private/reserved/IP targets, credentials/custom ports, unsafe redirect targets, login/action paths and `.ts.net` services are blocked. There are no cookies, authenticated browsing, form submissions, JavaScript execution or asset loading. Budgets are 30 seconds overall, 10 seconds per request, three redirects and 1.5 MB of response bytes. Robots policy or errors can prevent collection. This is not an unrestricted fetch endpoint or complete site crawler.

`server/google-data.ts` uses fixed official Google origins and bearer headers for explicit first-party reads. `GOOGLE_SEO_ACCESS_TOKEN` needs authorized read-only Search Console/Analytics scopes. Search Console selects a matching authorized Domain/root-prefix property and queries finalized web search rows in five bounded 1,000-row pages. Results identify the property/window and possible truncation. GA4 additionally requires numeric `GA4_PROPERTY_ID` and an exact normalized `GA4_SITE_DOMAIN` mapping; hostname filtering limits reports to that domain/www equivalent. Total sessions/users/views and Organic Search sessions use separate reports. Nullable counts, response caps, sanitized errors, a 45-second total deadline, 12-second request deadline and ten-second cooldown apply. Token login/refresh is external.

The optional Similarweb adapter reads third-party traffic estimates only when the user clicks **Fetch traffic estimates** with server-side `SIMILARWEB_API_KEY`. It accepts up to 12 complete calendar months and can consume paid quota. Those estimates retain their source, dates and uncertainty; they are never relabeled as private analytics or combined with measured GSC/GA4 totals. Configuration flags do not prove upstream access. No Google/Similarweb credentials are configured in the current workspace; live authorization remains unverified.

The API exposes `POST /api/web/scan`, `GET /api/web/connections`, `POST /api/web/google` and `POST /api/web/traffic-estimates`. Analyze starts a public scan. Google uses the separate **Pull Google data** action with selected dates; paid estimates require **Fetch traffic estimates**. Imports continue to work without any provider keys. See [workflows and source definitions](FREE_SEO.md).

Latest per-domain public scans, Google reports and estimate reports are stored in `web_site_scans`, `web_google_reports` and `web_traffic_estimates`. Valid Google query rows also pass the common search validation and commit atomically as a declared-window dataset. Reports retain each saved source's independent dates; a selected query window does not retime saved provider results. The MCP scanner returns its response without writing these tables.

## Storage and audit

SQLite uses prepared statements and additive startup schema creation. Legacy `projects`/`ranks` remain for example API compatibility and are not the measured rank source. Social data uses `social_observations`, `social_queries`, `social_pull_runs`, `social_snapshots` and `settings`. Versioned migrations remain future work. Default storage is ignored `data/waypoint.sqlite`; for a simple backup, stop the service before copying it. Never commit user databases.

The audit parses supplied HTML with Cheerio without executing scripts or fetching resources. Eight equally weighted checks produce a checklist score; severity is separate. An empty alt attribute is permitted for decorative images. Title/description heuristics, absolute canonical, one H1, language, viewport, alt attributes and robots meta are checked. This is not a search-engine ranking score, crawler or performance test.

## Local and private service security

The HTTP process binds only to loopback. The default hostname guard accepts loopback; private deployment adds one configured HTTPS `.ts.net` hostname through `WAYPOINT_PRIVATE_ORIGIN`. Browser writes require an allowed origin. CORS is not broadly enabled and arbitrary proxy headers are not trusted. Requests are capped at 1 MB, imports are validated, React escapes strings, and CSV exports quote values/escape formula-like prefixes. Submitted HTML never enters `dangerouslySetInnerHTML`. The website scan is a constrained public-domain operation, not an arbitrary authenticated URL proxy; its network boundaries are described below.

The optional Windows production service uses port **4321**, with Tailscale Serve terminating private HTTPS. Tailscale authentication/access policy controls network access; Waypoint has no separate login, roles or tenant isolation. Everyone authorized to the service shares the local workspace. Repository membership is independent of service access. Funnel, public binding and port forwarding are outside this deployment. See [PRIVATE_SERVICE.md](PRIVATE_SERVICE.md).

The hidden user-session supervisor retries when Tailscale is unavailable and restarts a crashed worker after ten seconds. Host automatic startup is configured separately; clones do not install it. See the private service runbook for its current setup. Host availability requires an awake, powered-on, signed-in computer. Full reboot recovery was not tested; no power policy changed. Logs/PID files remain under ignored `artifacts/`. Stop helpers verify process ownership and preserve dev servers/data.

Google Fonts makes an optional presentation-only request; system fonts are the fallback. Remove its CSS import for fully offline presentation. Strong identity, authorization, CSRF/session design, operational hardening and tenant isolation are still required before public/multi-user SaaS deployment.

## Social performance and native providers

`shared/performance.ts` and `server/performance.ts` define daily imports, nullable totals, paired-denominator rates, equal-length period coverage, topic associations and lexical comparisons. Daily data is not lifetime data. `src/SocialSeo.tsx` is the performance workspace, `src/Integrations.tsx` owns connection controls, and `src/SocialTools.tsx` retains publishing utilities.

`shared/connectors.ts` and `server/connectors.ts` implement seven fixed-origin official account adapters with bearer headers, bounded pagination/deadlines, nullable metrics and sanitized failures. Successful whole pulls commit atomically into run/snapshot tables. Latest-per-post reads use a window function and never add repeated lifetime counters or treat them as daily increments. Tokens are read on server startup. Live access depends on provider-approved credentials; fixtures do not prove production permissions. YouTube public discovery is a separate explicit quota-consuming request. See [connections](CONNECTIONS.md) and [performance methodology](PERFORMANCE_DATA.md).

## Claude client and API paths

`mcp/index.ts` serves the official stdio protocol with **21 tools**, reserving stdout for messages. Twenty tools are read-only. Read tools open SQLite read-only or return empty data if no database exists. **`seo_import` is an explicit write tool**: preview with `seo_import_preview`, review, then import only on user request. It opens/creates writable storage and validates the CSV again. Web report/research tools use saved real data; no web demo mode is exposed. `website_scan` explicitly reads public HTTPS pages through the bounded scanner and is network-enabled/read-only; it does not persist or edit a website. `youtube_research` explicitly contacts fixed Google endpoints. Google and Similarweb pulls remain separate app/API actions, not extra MCP tools. No shell/file-access/publishing tools exist.

The optional Claude Code plugin bundles three skills with that server. `Start-Claude-SEO.cmd`/`scripts/claude-plan.ps1` checks subscription authentication, reuses a direct MCP registration or loads the plugin, and clears API-key/base-URL overrides only in the launcher's process. Claude Code supplies model access and plan limits; the web app does not proxy subscription sessions. CSV/HTML/tool output remain untrusted data.

`server/claude.ts` is a separate server-only Anthropic API advisor. Its persisted toggle is off by default. Only explicit UI requests send bounded context; missing keys/errors never produce mock advice. SDK tests use isolated transport. Responses render as text and are discarded if the workspace changed during a request. See [Claude setup](CLAUDE.md) and [plugin boundaries](PLUGIN.md).

## Introduction and delivery

`GuidedTour` highlights real controls with click-to-advance, Back/Next/Skip/Escape, focus restoration, responsive placement and browser-local dismissal. It never automatically imports, pulls data, enables AI or transmits analysis. The normal app entry is Domain overview with **Analyze website** and saved/imported-data options; the replayable tour explicitly offers a fictional social example.

Vite compiles browser code. `npm start` runs the TypeScript API through `tsx` and serves `dist`, so runtime dependencies include installed development packages. CI runs tests/build on Node 24. Secrets, databases, raw captures and generated bundles are excluded from Git. Future licensed keyword/backlink/SERP sources need async capability contracts, provenance, scope, quota budgets and failure states; they must not silently substitute demo metrics.
