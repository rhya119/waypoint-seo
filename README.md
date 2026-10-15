# Waypoint

An independent, local-first SEO research toolkit. Original branding, UI, source code, and architecture; inspired only by broad product categories in the SEO industry.

**Status: v0.3 social-performance workspace with optional whole-platform Claude plugin.** Social SEO now analyzes imported daily post/query metrics, compares similar content and account benchmarks, and supports native public YouTube discovery when configured. Web SEO index metrics remain synthetic examples. Claude is optional and off by default in the dashboard. No affiliation with Semrush.

Start at **Social SEO**. Use **My data** for imported observations, or explicitly select **Explore example** for a labeled fictional dataset. An empty real workspace never silently substitutes example metrics. See [performance-data setup](docs/PERFORMANCE_DATA.md) and [optional Claude plugin](docs/PLUGIN.md).

## Run locally

Requires **Node.js 24+** and npm. SQLite is included through Node's `node:sqlite` API (which can emit an experimental warning).

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to **127.0.0.1:4318**. If you change `PORT`, also change the proxy target in `vite.config.ts`. Stop both development processes with Ctrl+C.

Production-style local run:

```powershell
npm run build
npm start
```

Open **http://127.0.0.1:4318**. The API serves the production frontend. This is an unauthenticated desktop/local application and deliberately refuses non-loopback `HOST` values. A private GitHub repository does not secure a hosted web application. Authentication and tenant isolation are roadmap work before network deployment.

## Included tools

| Area | Working behavior | Data and limits |
| --- | --- | --- |
| Domain overview | Normalize a domain, view metrics and trend chart, switch date range, save projects | Synthetic metrics; the Jan–Dec 2026 series is explicitly illustrative |
| Keyword research | Seed suggestions, intent filter, volume/difficulty/CPC columns, formula-safe CSV export, add tracking | Repeatable generated examples, not keyword index queries |
| Backlink analysis | Referring/target pages, anchor text, follow/nofollow filtering | Fictional link sample and illustrative strength scores |
| Site audit | Submit HTML; eight checks with explanations, severity, and a checklist score | Actual static markup inspection; no crawler, network fetching, script execution, robots.txt, HTTP headers, or performance testing |
| Rank tracking | Save keywords per project/country/device; reload and remove baselines | Deterministic positions; no SERP fetching, daily jobs, or historical movement claims |
| Competitor research | Traffic, keyword counts, and overlap comparison | Fictional comparison domains; no actual keyword-gap analysis |
| Reporting | Preview a summary, export structured JSON, print/save PDF through browser | Includes provenance, analysis, and saved ranks; no scheduled delivery |
| Social SEO | Daily performance trends; query impressions/clicks/CTR; topic-associated content; similar-post comparisons; account benchmarks; native YouTube research | Imports and normalized ingestion for eight platforms; native public discovery only for YouTube; no fabricated metrics |
| Publishing utilities | Share metadata, caption checks and campaign links under a secondary expandable section | Local markup/editorial checks, no posting |
| Integrations + optional Claude plugin | Optional in-app AI toggle; whole-platform plugin with three skills and 17 MCP tools; source-bundle download | All platform tools work without Claude; advisor needs a separate Anthropic key; MCP uses the client's own model access |

All `.example` names and sample content were authored for this project. Entered domain/image URLs are not fetched. Native YouTube research calls fixed official Google API endpoints and reports public lifetime counters separately from daily observations. Imported content/query observations, projects, rank baselines and integration settings persist in local SQLite; drafts and AI responses are temporary. Social reports export separately from web SEO demo reports. Clicking Ask Claude explicitly sends bounded context to Anthropic and may incur API charges.

## Claude setup

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
- A `SeoProvider` interface keeps generated data separate from routes and UI. The current implementation is synchronous and demo-only. A live adapter should evolve this contract to asynchronous, typed responses with provenance, timestamps, market/device scope, caching, and missing-data states.

```text
src/                 UI, API client, exports, original styles
shared/types.ts      Shared response contracts
server/app.ts        Validated local APIs and SQLite schema
server/provider.ts   Demo provider and provider seam
server/audit.ts      Pure static HTML checks
server/social.ts     Social markup parser and checklist
server/claude.ts     Server-only Claude API adapter
server/performance.ts CSV/JSON ingestion, SQLite analysis, comparisons
server/youtube.ts    Native public YouTube discovery provider
shared/social.ts     Validated metadata, caption and UTM helpers
mcp/                 Local stdio connector for Claude clients
skills/              Whole-platform Claude workflow skills
.claude-plugin/      Optional Claude Code plugin manifest
server/index.ts      Environment setup, database, local server
tests/               Domain, provider, audit, API and CSV checks
scripts/             Private GitHub push and REA browser QA helpers
docs/                Architecture, clean-room record, roadmap, validation
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Loopback only |
| `PORT` | `4318` | API / production frontend port |
| `DATABASE_PATH` | `./data/waypoint.sqlite` | Durable local database, relative to project directory |
| `SEO_PROVIDER` | `demo` | Only supported provider; other values fail startup |
| `ANTHROPIC_API_KEY` | empty | Server-only Anthropic key for AI advice |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Configurable Claude API model ID |
| `YOUTUBE_API_KEY` | empty | Optional native public YouTube discovery key |

`.env`, database files, exports, raw REA captures, `node_modules`, and builds are ignored by Git. Never put provider keys in frontend variables or commit credentials. Google Fonts is optional presentation-only network access; system fonts are used when unavailable. Icons ship in the frontend bundle.

## API

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/health` | — |
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
| GET | `/api/integrations` | Actual key-presence flags, supported data paths, advisor setting |
| PUT | `/api/integrations/claude` | `{ "enabled": true/false }`, persisted opt-in |
| GET | `/api/integrations/plugin` | Download prepared source bundle |

Supported tracking countries: NZ, US, GB, AU; devices: desktop, mobile. Validation failures return 400, unknown project 404, cross-origin browser writes 403, oversized requests 413. Duplicate saved domains and tracking tuples reuse existing rows.

## Verification

```powershell
npm run check
```

Runs meaningful tests followed by TypeScript checking and a production build. CI runs the same command on Node 24. Tests use an in-memory database and do not change workspace data.

For optional **REA** browser QA, start `npm start` after a build, then:

```powershell
node scripts/qa-rea.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

The helper invokes pinned REA 6.4.0, launches isolated browser profiles and writes ignored artifacts. Use `QA_SCENARIO=social` or `social-mobile` for the performance/integrations flow, `performance-import` for real CSV import/reload/query handling, or `flows` for web SEO regression. `QA_BASE_URL` targets an isolated local server/database; `QA_LIGHT_CAPTURE=1` retains only final screenshots. Import QA writes explicitly named QA records, so use an isolated database. Requires Node/npm, a local Chrome executable and REA package access. See [validation](docs/VALIDATION.md).

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

See the [roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [clean-room research record](docs/CLEAN_ROOM.md). Live SEO datasets, crawler infrastructure, production identity, and background jobs remain deliberate next milestones.

## Ownership

Private project; no open-source license is granted. Third-party dependencies retain their own licenses. Reference product names identify research context only; do not add their logos, page copy, datasets, or implementation code.
