# Waypoint

An independent, local-first SEO research toolkit. Original branding, UI, source code, and architecture; inspired only by broad product categories in the SEO industry.

**Status: working initial scaffold.** Search metrics are deterministic synthetic examples, not actual traffic, keyword demand, backlinks, or search results. The HTML audit runs real markup checks. No paid account or API key is required. No affiliation with Semrush.

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

All `.example` names and sample content were authored for this project. No requests are sent to an entered domain. HTML is parsed on the local server without execution, and is not stored. Projects and ranks persist in the local SQLite database. Keyword research, audit results, and report previews live in browser memory until refresh. JSON exports include analysis and tracked ranks; HTML audit results are separate.

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

The helper invokes pinned `rea-agents@6.4.0` through npm's `npx-cli.js`, launches isolated browser profiles, checks desktop/mobile and core flows, writes ignored artifacts, and fails on incomplete steps. It needs network access for REA package acquisition, an installed browser, and a normal Node/npm installation. Set `NPX_CLI_PATH` if npm is installed elsewhere. Set `QA_SCENARIO=flows` to rerun only that scenario. Browser QA creates a local sample project and rank baseline. See [validation](docs/VALIDATION.md) for actual results and limitations.

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
