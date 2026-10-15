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

## 0.3 — Provider-backed research

- Select licensed keyword, backlink, and SERP data sources after reviewing coverage, cost, terms, and retention constraints.
- Convert the provider interface to async operations with independent capability flags, pagination, market/device/date filters, timeouts, bounded retries, usage budgets, and cache keys.
- Return explicit unavailable/partial responses rather than substituted demo metrics. Keep provenance on each metric and report.
- Add first-party Search Console imports for verified sites. Distinguish observed first-party traffic from third-party estimates.
- Build actual keyword intersections and competitor content gaps from provider rows.
- Acceptance: integration fixtures and a limited live smoke test establish timestamps, source labels, costs, and graceful failure.

## 0.4 — Controlled site crawler

- Site-ownership/permission workflow; robots policy; same-origin crawl boundaries and sitemap discovery.
- HTTP(S) allowlist, public-IP DNS resolution, redirect revalidation, DNS-rebinding protection, restricted outbound networking, response-byte limits, timeouts and crawl budgets.
- Queue-based crawl jobs with cancellation, retries, per-host throttling and job progress.
- Persist pages, response headers, links and findings; detect duplicate titles, broken internal links, canonical conflicts and indexing issues.
- Acceptance: local test sites cover redirects, private-IP attempts, robots exclusions, malformed HTML and cancellation; never expose arbitrary URL fetching as an unguarded endpoint.

## 0.5 — Rank history and reports

- Append-only SERP observations keyed by project, keyword, market, device and date.
- Scheduled jobs with idempotency keys, provider quotas, alerts and missing-result states.
- Audited rank changes, visibility formula documentation, comparison periods, saved report configurations and printable full reports.
- Acceptance: history survives restarts, retrying a job does not duplicate observations, and missing ranks never become invented positions.

## 1.0 — Multi-user release

- Authentication, organization membership, project-level authorization, CSRF protection, rate limits, audit logs and migrations.
- Managed PostgreSQL, queue workers, server-side secret storage, backups and restore verification.
- Retention/export/delete controls, keyboard/screen-reader review and contrast audit, browser end-to-end CI, accessibility and performance budgets.
- Deployment documentation and operational runbooks. Remove the loopback guard only as part of this authenticated deployment milestone.
