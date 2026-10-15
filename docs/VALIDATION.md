# Validation record

Completed 2026-10-16 on Windows with Node 24.19.0 and npm 12.0.2.

## v0.4 — Seven native account adapters and clickable introduction

`npm run check` passes **38 tests**, TypeScript checking and the production build. Added official-response-shaped fixtures cover all seven platform mappings, unsupported/null metrics, fixed-origin cursor pagination, latest-per-post capture selection without double counting, separation from daily imports, missing/invalid setup, cooldowns, provider body errors, partial X failures, sanitized errors, HTTP validation and atomic persistence. Meta authentication/rate-limit codes returned with HTTP 400 abort optional insight reads correctly. Both actual stdio entry points discover 18 read-only tools; `social_api_snapshots` returns an empty source-labeled result when no database exists. Plugin packaging excludes credentials, SQLite, dependencies and capture artifacts.

REA 6.4.0 ran against an isolated server on port 4320 and an ignored QA-only database. Normal user data was not seeded. All scenarios below completed with zero page-error events:

| Scenario | Evidence | Result |
| --- | --- | --- |
| Full clickable tour, desktop 1440 × 1080 | `ev_56636d1b32d3166be0b744efce8a318bea4fbf8e4e0ac5a6bb6bd169c1f9431b` | 42 steps, including all 15 tour stages, actual navigation/tab clicks, Back/Next, Finish, replay, close, seven connection cards |
| Full clickable tour, phone 390 × 844 | `ev_e967fb0acb2db77268b73f8dad27c0820abe95ad590d25d8e319ecd26a9ecf57` | Same complete flow at phone width |
| Lifetime snapshots with explicit synthetic QA rows | `ev_ddc100503395a9a44cb87f7da2651f21ac53c2c3ca662c0b70aded8a4855f012` | Topic filtering, similar-post comparison and pull-history warning display |
| Desktop coachmark visual capture | `ev_55b5ad6fcf766e4c873ddb71916f70433c04608049adeaa1fb0f9a94d54ae345` | Actual example button highlighted; readable instructions and navigation visually inspected |
| Phone coachmark visual capture | `ev_cd7e24702e7577919166191d1add3b6bf599cb0b99bf180222a6e9b40b5a7fd1` | Bottom coachmark and highlighted button visually inspected at 390 px |

Early tour runs exposed click-listener timing and cross-page navigation races. The corrected implementation waits for the current target and lets the clicked navigation action finish before advancing. The full desktop and phone scenarios then passed. Snapshot screenshots were also visually inspected. Browser export file delivery, keyboard-only/screen-reader navigation and real account permissions were not established by these runs.

All seven native account configurations currently report `configured: false` in the normal local app. No provider tokens were supplied and no live account pulls were made. The adapters require each provider's authorized tokens, scopes, account IDs, app approval and supported API versions. This release uses manual token configuration; embedded OAuth, automatic refresh, scheduled sync and multi-account credential storage remain future work. Facebook only pulls published Page post interactions; LinkedIn only supports organization posts. Per-provider mappings and limits are documented in [CONNECTIONS.md](CONNECTIONS.md).

The following version sections are historical validation records.

## v0.3 — Performance redesign and optional whole-platform plugin

The automated suite now includes **24 tests**: CSV quoting/multiline input, duplicates, invalid metrics/dates, atomic import rejection, replacement rather than double-counting, SQLite reopen persistence, missing-value/rate math, paired CTR denominators, topic/query separation, similarity scope, date filters and comparison coverage, local ingestion, default-off Claude settings, fixed-endpoint YouTube request/response fixtures, whole-platform stdio tools, plugin launcher lifecycle and bundle exclusions. Tests do not make live Claude or YouTube calls. Both keys remain unconfigured in the local application.

The native Claude Code manifest validator returned **Validation passed**. A real SDK client discovered 17 tools through both direct stdio and the optional plugin launcher, called social-performance/keyword/similarity tools, and confirmed source labels. The existing private local Claude Code MCP registration still reports Connected. No new global plugin or Claude Desktop installation was performed.

REA ran against a separate local server on port 4320 with an ignored QA-only SQLite database. Import Evidence `ev_93564d2440a22437b22d01db3a9e3dbc0ed76d294f702b6a02a4e630cfb47c54` completed all 24 steps, including CSV preview, content import, reload/persistence, query import and missing-YouTube-key handling, with zero page-error events and confirmed browser cleanup. No QA observations were added to the user's normal workspace.

Mobile performance/integrations Evidence `ev_bd2ba263247445e0895b75ff8894902346c7f8a96687b7dfa751667856ee9778` completed 19 steps including example selection, query tables, similar content, competitor rows and enabling/disabling the optional advisor. After a stylesheet-order correction, final mobile design Evidence `ev_40edf26b953b8d2699c01a6c4325eb85188893961414106e50d87b052c35aac9` completed with confirmed cleanup. Desktop and mobile rendered screenshots were visually inspected; final sidebar contrast was corrected. Desktop REA captures completed their declared UI steps but intermittently reported a browser-cleanup timeout; retained screenshots are observations, not a claim of fully successful capture cleanup. Process inventory showed no remaining matching owned browsers.

Native public YouTube discovery is implemented but not live-verified without `YOUTUBE_API_KEY`. Other major platforms support imports/normalized ingestion only; direct OAuth/account sync is not implemented. Query-level data depends on the source actually providing it. Similarity is lexical title/tag overlap, not semantic/video analysis. The downloadable `.plugin` is a ZIP-format source bundle requiring extraction and `npm ci`, not a verified one-click Desktop extension or hosted claude.ai connector.

## v0.2 — Social SEO and Claude

`npm run check` passes **14 tests**, strict TypeScript checking and a production build. Added cases cover metadata attribute escaping and parser round-trips, first-image alternative associations, unsafe URL rejection, duplicate normalized Unicode hashtags, query/fragment-preserving UTM generation, social API validation, missing-key Claude behavior, sanitized upstream failures, token usage, output limits and the real Anthropic SDK wire request using a mocked fetch. No live Anthropic request was made: no API key is configured, and the status endpoint correctly returned `configured: false`.

A real MCP client launched the actual stdio entry point, discovered ten read-only tools, ran a social audit, read an empty isolated workspace, and rejected an unsafe campaign URL. The installed Claude Code client then registered `waypoint` in private project-scoped local configuration and `claude mcp get waypoint` returned **Connected**. A Claude conversation calling the connector was not run. Claude Desktop configuration was absent and was not created.

REA desktop Social SEO Evidence: `ev_be82e7ed55146e4101c50033d14e8800eee74f0f85a46f29c5a9a76d7d6f6e58`. All 16 steps completed; zero page-error events; owned-browser cleanup confirmed. REA mobile Evidence: `ev_d676544c856693b0dd15fb2c88ce9a3c9388404a3269d76b77868a80a1a3d303`, also 16 successful steps, zero page errors and confirmed cleanup. Both ran against the production frontend served by the local API. Screenshots of the desktop share audit/content review and mobile campaign output were visually inspected. The scenarios exercised share checks, metadata generation, caption review, UTM generation, missing-key Claude setup and connector instructions. Download/copy controls were not newly verified end-to-end.

An initial social QA selector matched both metadata and Claude buttons; it was corrected to target the metadata button. A subsequent desktop capture completed all UI actions but reported a cleanup timeout; process inventory showed no matching browser remained. The final desktop run above completed with confirmed cleanup. Raw captures remain ignored local artifacts.

After the UI captures, minor footer/help text, first-image association, configuration-output scope and stale-response handling changes passed the automated checks. No live platform previews, social analytics, publishing, or Claude model response quality were verified. Open Graph and UTM behavior follows linked primary documentation; the old official X card pages were unavailable/redirected, so X rendering is explicitly illustrative.

## Automated checks

`npm run check` passes: five tests, strict TypeScript checking, Vite production build. Test coverage includes domain normalization/rejection, repeatable demo generation, passing/failing static HTML checks, project deduplication, tracking creation/deletion, invalid project rejection, report provenance, invalid JSON, cross-origin and non-loopback Host rejection, and CSV escaping/formula protection. API tests use an isolated in-memory SQLite database. npm install's dependency audit reported zero vulnerabilities at installation time; this is a time-bound package audit, not a security certification.

## REA browser QA

REA CLI 6.4.0 launched Chrome with isolated temporary profiles against the built app at `http://127.0.0.1:4318`.

| Scenario | Evidence ID | Verified |
| --- | --- | --- |
| Desktop, 1440 × 1080 | `ev_215e4568d358ec7ea7001de0b557ca937411c5356634e251396079794a0ad87d` | Overview rendered; screenshot visually inspected |
| Mobile, 390 × 844 | `ev_d5c2df585c3cd6f4aecfeda5c1f4fa889187b21b092555735ad3d094d48bff49` | Responsive overview rendered; screenshot visually inspected; horizontal tool navigation |
| Core flows, 21 declared actions plus navigation | `ev_c1e169a501845db58370cf7b880f1dc418668a4c4fb786bf94c8d01cb04d48dd` | All 22 steps completed; no page-error events; owned browser process terminated |

The flow exercised keyword suggestions, tracking a keyword, saving its project, backlink rows, actual markup audit, rank reload from SQLite, competitor comparison, report preview and the JSON export action. Screenshots of the audit, reloaded rank and report were visually inspected. The supplied sample audit produced 88/100 and identified the image missing an alt attribute.

An initial flow run stopped on a test locator that matched multiple table rows. The helper was corrected to wait for a single row and rerun successfully. It now reads REA's normalized results and fails on unsuccessful or cancelled scenario steps rather than relying on CLI exit status alone.

## Limits

- REA observed the export event and filename, but its download observer cancelled the file transfer (`download-cancelled`). A file saved to disk through the browser was not verified. The API's report payload was checked by automated tests.
- Print/save-PDF is a browser print action; no final PDF file was rendered or inspected.
- Mobile verification covered the overview layout; the full scenario ran at desktop width.
- Rank persistence was verified across browser reload, not a process restart or backup/restore.
- No live search provider, crawler, search engine, authenticated Semrush workflow, production deployment, or multi-user isolation was tested.
- The last API change added a Host guard and passed automated checks; it does not alter UI rendering. Browser scenarios preceded this small API hardening change.

Raw local REA captures and screenshots are in ignored `artifacts/`. They are not part of the committed source. Reproduce using `scripts/qa-rea.mjs` after a build and server startup. The QA run leaves one sample project and baseline in the ignored local database.

## GitHub handoff

Created **[rhya119/waypoint-seo](https://github.com/rhya119/waypoint-seo)** as a private repository after the user completed GitHub CLI device authentication. The initial scaffold commit `ffcf61e330810910c61e32aae2df5f8852fe9434` was pushed to `main`; `git ls-remote` confirmed the matching remote SHA. GitHub's repository metadata returned `isPrivate: true` and default branch `main`. The included check workflow started automatically on push. No application deployment or public repository was created.

The app connector did not expose repository creation. To complete the handoff, the official GitHub CLI 2.102.0 Windows archive was downloaded from `cli/cli` releases, its SHA-256 was matched against the release checksums, and it was extracted under ignored `artifacts/github-cli/`. CLI authentication succeeded as `rhya119` using the OS keyring. Credentials and CLI binaries are excluded from source control. Use an installed GitHub CLI or this local executable for subsequent pushes.
