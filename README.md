# Waypoint

An independent, local-first SEO research toolkit. Original branding, UI, source code, and architecture; inspired only by broad product categories in the SEO industry.

**Status: v0.6 — 50-page site crawl, AI search readiness, a monthly Top-10 action plan, keyword ideas, Google speed tests, free SEO imports, optional provider data and a private Windows service.** Inspect public website markup immediately, then add your authorized Google data, supplied backlinks and observed ranks. Optional Similarweb integration supplies paid traffic estimates. Social SEO also supports daily imports and seven official lifetime account adapters. YouTube public research is separate. Claude is optional; no affiliation with Semrush.

Start at **Domain overview**. Enter a public website and click **Analyze website**. Waypoint checks robots.txt, crawls the HTTPS homepage and up to 49 linked pages, and shows a ranked **Top 10 actions for this month**, page issues, AI search readiness and speed signals. **Use saved / imported data** opens your stored workspace without a new scan. Use **Import SEO data** for actual CSV observations. Public HTML does not reveal traffic, search rankings or inbound backlink coverage. The web workspace has no fictional demo option or preset domain. See [the free SEO workflow](docs/FREE_SEO.md), [social performance setup](docs/PERFORMANCE_DATA.md) and [optional Claude plugin](docs/PLUGIN.md).

## What's new in 0.6

Features researched from open-source SEO projects (OpenSEO, crawlseo, RankMeFast, bisibility, GeoLook, GEO Optimizer, Claude SEO, marketingskills and Open SEO MCP Skills) and reimplemented in Waypoint's own code:

- **Top 10 actions this month** on Overview, ranked from your crawl, Search Console data, rankings, backlinks, AI readiness and speed. Tick actions off; progress is saved per site and month. Each scan shows what was fixed or newly found since the previous one.
- **Site health → Issues / Pages:** breadth-first crawl of up to 50 pages with duplicate and missing titles/descriptions, missing or multiple H1s, thin content, noindex, broken pages, non-canonical internal links, missing alt text and deep pages. Gzip/brotli responses are decoded with a size cap.
- **Site health → AI search:** a 100-point readiness score covering which AI answer engines and search crawlers robots.txt allows (ChatGPT, Claude, Perplexity, Google, Bing; training crawlers listed separately), llms.txt, structured data, quotable content, trust signals and hidden prompt-injection text. Generates a ready-to-upload **llms.txt** and **Organization/WebSite/FAQ JSON-LD**.
- **Site health → Speed:** Google PageSpeed Insights (Lighthouse score, Core Web Vitals, field data and biggest savings) plus speed signals from the crawl. Add a free `PAGESPEED_API_KEY`; Google's keyless quota is often busy.
- **Keywords → Find keyword ideas:** Google Autocomplete suggestions for a seed and country, grouped into questions, buying, comparisons and local, with off-topic and job-search noise hidden. Shows which ideas you already get impressions for; one click adds an idea to rank tracking.
- **Keywords → Quick-win keywords:** almost page one, seen-not-clicked, missing pages, question searches and top performers from Search Console data, with a rough extra-clicks estimate.
- **Compare sites** now compares pages, issues, AI readiness, structured data and llms.txt.
- Three new MCP tools: `keyword_ideas`, `page_speed` and `seo_opportunities` (24 in total).

## Run locally

Requires **Node.js 24+** and npm. SQLite is included through Node's `node:sqlite` API (which can emit an experimental warning).

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. Click **Start guided tour** (first visit) or **Take a tour** (top bar) for a button-by-button introduction. Click highlighted controls to advance, or use Back/Next; Escape closes it. See [the introduction](docs/INTRODUCTION.md). Vite proxies `/api` to **127.0.0.1:4318**. If you change `PORT`, also change the proxy target in `vite.config.ts`. Stop both development processes with Ctrl+C.

Production-style local run:

```powershell
npm run build
npm start
```

Open **http://127.0.0.1:4318**. The API serves the production frontend and binds only to loopback. For private access from your other devices, the optional Windows service uses **127.0.0.1:4321** behind **Tailscale Serve**. It accepts one configured private HTTPS hostname and authorized tailnet devices; there is no separate app password or per-user workspace. Keep the host powered on, awake and signed in. Automatic startup is configured separately on the host; cloning alone does not install it. Full reboot recovery has not been tested and no power policy was changed. See [private service setup, stop/update and access boundaries](docs/PRIVATE_SERVICE.md). Repository access does not grant service access.

## Included tools

| Area | Working behavior | Data and limits |
| --- | --- | --- |
| Domain overview | Live public site summary, query clicks/impressions/CTR when supplied, optional GA4 totals and separate traffic estimates | Sources and date scopes remain separate; public HTML reveals no private traffic |
| Keyword research | Observed page topics plus supplied/authorized query performance; CSV export and watchlist | Topic frequency is not search volume; no global CPC/difficulty index |
| Backlink analysis | Analyze supplied inbound link URLs and referring hosts; inspect scanned outbound links separately | Outbound page links are not inbound backlinks; no global link discovery |
| Site health | Issues, Pages, AI search and Speed tabs: 50-page crawl findings, AI crawler access, llms.txt and JSON-LD generators, Google PageSpeed Insights | Up to 50 pages, subject to robots and safety limits; static checklist, no JavaScript rendering or Core Web Vitals |
| Rank tracking | Watchlist plus imported dated rank observations and previous-observation change | No generated positions or scheduled SERP checks; query average position stays separate |
| Competitor research | Query-set overlap and potential gaps across imported domains | Matching declared dates and filter scope required; domain alone reveals no private competitor data |
| Reporting | Combine saved scan, query snapshot, supplied links, ranks, audit and optional provider reports; JSON/keyword CSV/print | Sources, windows and limitations retained; browser PDF delivery depends on browser |
| Social SEO | Daily performance trends; query impressions/clicks/CTR; topic-associated content; similar-post comparisons; account benchmarks; native YouTube research | Imports and normalized ingestion for eight platforms; seven official account adapters with separate lifetime snapshots; YouTube public discovery; no fabricated metrics |
| Publishing utilities | Share metadata, caption checks and campaign links under a secondary expandable section | Local markup/editorial checks, no posting |
| Integrations + optional Claude plugin | Whole-platform plugin with three skills and 24 MCP tools; source-bundle download; separate in-app advisor | Claude subscription runs in local Claude Code; web advisor requires its own Anthropic key |

For Search Console, export **Performance → Search results → Queries** for your selected dates, then import the Queries CSV with that same window and filter scope. English native and canonical headers are supported. Query-table totals can omit anonymized/truncated queries and are not whole-site traffic or global search volume. Overlapping snapshots are never added together. See [formats, import limits and methodology](docs/FREE_SEO.md).

All `.example` names and sample content were authored for this project. Only an explicit website scan fetches public page URLs; entering or selecting a domain alone does not fetch that website. Google and social pulls use fixed official endpoints; lifetime snapshots remain separate from daily observations. Set up credentials under Integrations; see [seven connection guides](docs/CONNECTIONS.md). Measured SEO datasets, saved HTML findings, social observations and settings persist in ignored local SQLite. Drafts and AI responses are temporary. Social reports export separately from web reports. An explicit Ask Claude action sends bounded context to Anthropic and may incur API charges.

## Optional Google and traffic-estimate data

The public scanner and imports need no provider key. For authorized first-party performance, add `GOOGLE_SEO_ACCESS_TOKEN` with `webmasters.readonly` and `analytics.readonly` scopes to ignored server `.env`. Optionally map a numeric `GA4_PROPERTY_ID` to `GA4_SITE_DOMAIN`. Restart, select dates and click **Pull Google data**. Search Console uses an authorized matching property; GA4 runs only for the matching configured domain. Tokens expire and there is no built-in refresh flow.

For third-party traffic estimates, configure `SIMILARWEB_API_KEY`, restart, choose up to 12 complete calendar months and explicitly click **Fetch traffic estimates** in Overview/Reports. This can consume paid provider quota. Estimates remain labeled separately from GSC clicks and GA4 observed sessions. Provider coverage or account entitlement can leave metrics unavailable. Google/Similarweb credentials are not configured in the current workspace, so their live access remains unverified. See [setup and source boundaries](docs/FREE_SEO.md).

## Claude setup

To use your **Claude subscription**, sign in to Claude Code with your eligible account and open **Start-Claude-SEO.cmd** on the host computer. It checks authentication, reuses the direct `waypoint` registration when present or loads the bundled plugin, and clears API-key/base-URL overrides only in its own process. It preserves `.env` and saved credentials. Plan limits still apply. Try: “Read my imported SEO report for mydomain.com and explain the next steps.” For CSVs, request a validation preview first, then explicitly request the import. Only `seo_import` writes data; the other 23 tools are read-only.

Subscription access stays in local Claude Code. It is not a subscription-backed web API or remote web chat. [Detailed subscription and MCP setup](docs/CLAUDE.md).

The optional advisor uses **Anthropic Claude**. Add `ANTHROPIC_API_KEY` to the ignored local `.env`, optionally change `ANTHROPIC_MODEL`, restart the server, and enable **Show Claude analysis** under **Integrations**. The default model is `claude-sonnet-5-5`; use a model your API account can access. No model call happens when enabling the toggle. Keys stay server-side.

For the whole platform as an optional Claude Code plugin:

```powershell
npm ci
claude --plugin-dir .
```

Or create a downloadable ZIP-format source bundle with `npm run plugin:package`. It excludes credentials, databases, dependencies and research captures; extract it and run `npm ci` before loading. This is a local source plugin, not a remotely hosted claude.ai connector. [Plugin options and tools](docs/PLUGIN.md).

To connect Claude Code/Desktop to the toolkit:

```powershell
npm run mcp:config
```

This prints an absolute-path Desktop configuration and a project-scoped Claude Code registration command. The **MCP connector is independent of the website’s API key**: your Claude client handles its own model access. The connector was registered locally for this project in the current workspace and Claude Code reported Connected. See [Claude setup and tool list](docs/CLAUDE.md).

## Stack and architecture

- React 19, TypeScript, Vite, Lucide icons, original responsive CSS and SVG charts.
- Express 5, Zod request validation, Cheerio HTML inspection.
- Node SQLite with prepared statements, foreign keys, and unique tracking constraints.
- Measured query/link/rank snapshots and source-aware reports use `server/web-data.ts`, independently of the legacy demo `SeoProvider`. A future licensed index adapter needs asynchronous responses with provenance, scope, caching and missing-data states.

```text
src/                 UI, API client, exports, original styles
shared/types.ts      Shared response contracts
server/app.ts        Validated local APIs and SQLite schema
server/provider.ts   Demo provider and provider seam
server/web-data.ts   Measured free SEO import snapshots and reports
shared/web-data.ts   Validated web import/report contracts
server/audit.ts      Pure static HTML checks
server/site-scan.ts  Robots-aware bounded public HTTPS scanner
server/google-data.ts Authorized first-party Search Console and GA4 reads
server/traffic-estimates.ts Optional paid Similarweb traffic estimates
server/social.ts     Social markup parser and checklist
server/claude.ts     Server-only Claude API adapter
server/performance.ts CSV/JSON ingestion, SQLite analysis, comparisons
server/youtube.ts    Native public YouTube discovery provider
server/connectors.ts Seven official account adapters and lifetime snapshot storage
src/GuidedTour.tsx   Click-through introduction with real control spotlights
shared/social.ts     Validated metadata, caption and UTM helpers
mcp/                 Local stdio connector for Claude clients
skills/              Whole-platform Claude workflow skills
.claude-plugin/      Optional Claude Code plugin manifest
server/index.ts      Environment setup, database, local server
tests/               Domain, provider, audit, API and CSV checks
scripts/             Private service, Claude launcher, GitHub and REA QA helpers
docs/                Architecture, clean-room record, roadmap, validation
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Loopback only |
| `PORT` | `4318` | API / production frontend port |
| `DATABASE_PATH` | `./data/waypoint.sqlite` | Durable local database, relative to project directory |
| `SEO_PROVIDER` | `demo` | Legacy fictional provider only; measured `/api/web/*` routes are independent |
| `WAYPOINT_PRIVATE_ORIGIN` | empty | One HTTPS `.ts.net` origin, set by the private-service launcher |
| `ANTHROPIC_API_KEY` | empty | Server-only Anthropic key for AI advice |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Configurable Claude API model ID |
| `YOUTUBE_API_KEY` | empty | Optional native public YouTube discovery key |
| `GOOGLE_SEO_ACCESS_TOKEN` | empty | Authorized Google OAuth access token for read-only Search Console/GA4 |
| `GA4_PROPERTY_ID` | empty | Optional numeric Analytics property ID |
| `GA4_SITE_DOMAIN` | empty | Exact normalized domain mapped to that GA4 property |
| `SIMILARWEB_API_KEY` | empty | Optional paid Similarweb API access for explicit traffic-estimate requests |

Native account pulls also require the provider-specific token/account/version names in [.env.example](.env.example). See [connection requirements and metric definitions](docs/CONNECTIONS.md). Restart the server after changing them. There is no embedded OAuth login service or automatic token refresh.

`.env`, database files, exports, raw REA captures, `node_modules`, and builds are ignored by Git. Never put provider keys in frontend variables or commit credentials. Google Fonts is optional presentation-only network access; system fonts are used when unavailable. Icons ship in the frontend bundle.

## API

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/health` | — |
| GET | `/api/web/domains` | Domains with saved data |
| POST | `/api/web/scan` | `{ "domain": "example.com" }`; explicit bounded public scan |
| GET | `/api/web/connections` | Sanitized Google and traffic-estimate configuration flags |
| POST | `/api/web/google` | `{ "domain": "example.com", "from": "2026-09-01", "to": "2026-09-30" }`; authorized first-party reads |
| POST | `/api/web/traffic-estimates` | Same domain/date shape; explicit paid estimate request for up to 12 complete calendar months |
| GET | `/api/web/report?domain=example.com` | Measured report; optional query `datasetId` selects a query snapshot |
| POST | `/api/web/import/preview` | `domain`, `kind: search/backlinks/ranks`, `from`, `to`, `source`, `scope`, `csv`; validates without writes |
| POST | `/api/web/import` | Revalidate and atomically save the same import |
| DELETE | `/api/web/datasets/:id` | Remove only matching snapshot; body includes `domain` |
| POST / DELETE | `/api/web/track` | Add/remove watchlist entry without inventing a position |
| POST | `/api/web/audit` | `{ "domain": "example.com", "html": "<html>...</html>" }`; save actual findings |
| GET / POST | `/api/projects` | POST `{ "domain": "example.com" }` |
| GET | `/api/analysis?domain=example.com` | Domain or HTTP(S) URL |
| GET | `/api/keywords?query=gardening` | Seed, 2–120 characters |
| GET | `/api/ranks?projectId=1` | Project ID |
| POST | `/api/ranks` | `{ "projectId": 1, "keyword": "gardening", "country": "NZ", "device": "desktop" }` |
| DELETE | `/api/ranks/:id` | Tracking row ID |
| POST | `/api/audit` | `{ "html": "<html>...</html>" }`, max 900,000 characters / 1 MB JSON body |
| GET | `/api/reports?domain=example.com` | Structured report with disclosure |
| POST | `/api/social/audit` | `{ "pageUrl": "https://example.com/", "html": "<html>...</html>" }` |
| POST | `/api/social/metadata` | Validated title, description, URL, image, alt, site, type and card fields |
| POST | `/api/social/caption` | `{ "caption": "...", "keyword": "gardening", "platform": "Instagram" }` |
| POST | `/api/social/campaign` | `{ "url": "https://example.com/", "source": "instagram", "medium": "social", "campaign": "spring", "content": "guide" }` |
| GET | `/api/claude/status` | Configured flag and model only, never the key |
| POST | `/api/claude/recommend` | `{ "prompt": "What should I improve?", "context": "..." }` |
| GET | `/api/social/performance` | `dataset=imported/example`, `platform`, `from`, `to`, `keyword` filters |
| GET | `/api/social/similar` | Same filters plus JSON-array `referenceId` and `scope=platform/all` |
| POST | `/api/social/import/preview` | `{ "kind": "content/queries", "metricBasis": "daily", "csv": "..." }` |
| POST | `/api/social/import` | Validate and atomically upsert the same CSV format |
| POST | `/api/social/ingest` | `{ "kind": "content/queries", "metricBasis": "daily", "rows": [...] }` from your API pipeline |
| POST | `/api/social/research/youtube` | `{ "keyword": "balcony garden", "sort": "relevance" }` |
| POST | `/api/social/pull/:platform` | `{ "maxPosts": 20 }`; one of the seven native account platforms |
| GET | `/api/social/snapshots` | `platform=all` and optional text `keyword`; lifetime snapshots only |
| GET | `/api/integrations` | Actual key-presence flags, supported data paths, advisor setting |
| PUT | `/api/integrations/claude` | `{ "enabled": true/false }`, persisted opt-in |
| GET | `/api/integrations/plugin` | Download prepared source bundle |

The normal measured workspace uses `/api/web/*`. Legacy analysis/keyword/project/rank/report routes above remain only for example API compatibility; the normal UI and MCP web tools do not use them. Health/source flags describe configured data paths, not dataset completeness or successful provider authorization. Free rank imports support supplied country scope and `all`, `desktop`, `mobile` or `tablet` devices; see [the validated formats](docs/FREE_SEO.md). Validation failures return 400, unknown project 404, unapproved browser origins 403, oversized requests 413. Duplicate saved domains and tracking tuples reuse existing rows.

## Verification

```powershell
npm run check
```

Runs meaningful tests followed by TypeScript checking and a production build. CI runs the same command on Node 24. Tests isolate fixtures from workspace data. Fixture coverage does not establish live provider access; see [verification evidence and limits](docs/VALIDATION.md).

For optional **REA** browser QA, start `npm start` after a build, then:

```powershell
node scripts/qa-rea.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

The helper invokes pinned REA 6.4.0, launches isolated browser profiles and writes ignored artifacts. Use `QA_SCENARIO=tour` or `tour-mobile` for the clickable introduction, `native-snapshots` for a fixture-seeded isolated snapshot view, `social` or `social-mobile` for the performance/integrations flow, `performance-import` for real CSV import/reload/query handling, or `flows` for web SEO regression. `QA_BASE_URL` targets an isolated local server/database; `QA_LIGHT_CAPTURE=1` retains only final screenshots. Import QA writes explicitly named QA records, so use an isolated database. Requires Node/npm, a local Chrome executable and REA package access. See [validation](docs/VALIDATION.md).

## Private GitHub repository

Source: **[rhya119/waypoint-seo](https://github.com/rhya119/waypoint-seo)**. The repository is private, and `main` tracks `origin/main`. Pushes and pull requests trigger the included GitHub Actions check workflow.

For a separate copy without a remote, install [GitHub CLI](https://cli.github.com/), authenticate with `gh auth login`, then run:

```powershell
.\scripts\push-private.ps1
```

This creates **waypoint-seo** as a **private** repository in the authenticated account, pushes the committed source, and displays `isPrivate` for verification. You can specify `-Owner` and `-Name`. Existing remotes stop the helper to prevent accidental reassignment. Equivalent direct command:

```powershell
gh repo create waypoint-seo --private --source . --remote origin --push
gh repo view --json url,isPrivate
```

## Next steps

See the [roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [clean-room research record](docs/CLEAN_ROOM.md). Licensed index datasets, crawler infrastructure, multi-user identity and scheduled jobs remain future milestones. The current private Tailscale service shares one local workspace.

## Ownership

Private project; no open-source license is granted. Third-party dependencies retain their own licenses. Reference product names identify research context only; do not add their logos, page copy, datasets, or implementation code.
