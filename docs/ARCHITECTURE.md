# Architecture and operating boundaries

Browser → same-origin JSON API → validation → provider or static audit → SQLite / response.

The frontend never needs provider credentials. `src/lib.ts` centralizes requests and export encoding. Shared TypeScript shapes describe the seven tool views. The API chooses data sources; the client cannot silently turn demo responses into live results.

## Storage

`projects`: unique normalized domain, creation time. `ranks`: foreign-key project, keyword, country/device, demo baseline, timestamp and provenance. Unique tuples prevent duplicate tracking entries. Schema creation is idempotent at startup; versioned migrations remain roadmap work before schema changes. Prepared statements bind all user values. The default database is `data/waypoint.sqlite`; copy it only while the server is stopped for a simple local backup. Never commit it.

## Audit

The server parses the supplied string with Cheerio, never executing scripts or fetching resources. Eight equally weighted checks produce the displayed checklist score; severity is separate from score weighting. Missing alt attributes fail, while an empty alt is allowed for decorative images. An absolute canonical, one H1, title/description length heuristics, document language, mobile viewport and robots meta are checked. This score is a local checklist, not a search-engine ranking factor or a commercial vendor score.

## Local security model

Bind only to loopback. No authentication or tenant authorization is implemented. Reject cross-origin browser writes and omit CORS headers. JSON requests are bounded to 1 MB; domain/keyword inputs are validated; no URL-fetch endpoint exists. Provider keys are not required. HTML and exports are not saved by the service. CSV fields are quoted and formula-like prefixes are escaped. React escapes displayed strings; submitted HTML never enters `dangerouslySetInnerHTML`.

These controls support a single-user local scaffold. They do not replace identity, CSRF tokens, authorization, network isolation, operational hardening or security review for a hosted service. Google Fonts makes a presentation-only external request; remove the CSS import for fully offline UI use. The optional Claude advisor sends a bounded prompt/context to Anthropic only on an explicit user action; its API key remains server-side.

## Social and Claude modules

`shared/performance.ts` defines typed daily observation, filter and analysis contracts. `server/performance.ts` validates mapped CSV/JSON, atomically upserts observations and computes nullable metrics, paired-denominator rates, equal-length periods, lexical comparisons and coverage. SQLite adds `social_observations`, `social_queries` and `settings`. The schema is additive; existing projects/ranks remain intact. Daily data and public lifetime YouTube results are separate data paths. `src/SocialSeo.tsx` is the main performance workspace; `src/Integrations.tsx` owns optional provider/plugin settings. `src/SocialTools.tsx` retains the old publishing checks as secondary utilities.

`server/claude.ts` is the only AI provider adapter. The server injects it into the API at startup using `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. Tests inject an isolated transport to verify the actual SDK request contract without making paid network calls. Missing keys and failed requests return explicit errors, never mock recommendations. The UI renders responses as text and discards responses if the workspace context changed during a request.

`mcp/index.ts` serves stdio using the official MCP SDK and 17 read-only tools. It reserves stdout for protocol traffic and opens SQLite read-only for workspace/performance reads. Only explicit native YouTube discovery has network access. It neither starts the HTTP API nor calls Anthropic. The optional Claude Code plugin packages three workflow skills with this same server; a tested single-process launcher avoids orphan child servers. Claude clients provide their own model access. The in-app advisor is off by default and must be enabled in persisted settings before API requests are accepted. See [plugin setup](PLUGIN.md) and [performance methodology](PERFORMANCE_DATA.md).

## Future provider contract

Replace `demoProvider` behind `SeoProvider`, evolving methods to Promises and response provenance to a typed union. Support distinct capabilities for keyword index, SERPs, backlinks and first-party traffic. Each observation should carry provider identity, collection time, locale/device and source/estimate classification. Track consumption server-side and never fall back to demo when live calls fail. Historical ranking observations need their own append-only table, rather than overwriting the scaffold's baseline rows.

## Delivery

Vite compiles only browser code. `npm start` runs the TypeScript server using tsx and serves `dist`. Keep dev dependencies available for this local runtime; `npm ci --omit=dev` is not supported by this scaffold. CI runs tests and build. The repository contains no user databases, secrets, raw reference captures or generated bundles. GitHub privacy is independent of application runtime access.
