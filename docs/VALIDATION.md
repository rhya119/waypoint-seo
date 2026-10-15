# Validation record

Completed 2026-10-16 on Windows with Node 24.19.0 and npm 12.0.2.

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
