# Architecture and operating boundaries

Browser → same-origin JSON API → validation → provider or static audit → SQLite / response.

The frontend never needs provider credentials. `src/lib.ts` centralizes requests and export encoding. Shared TypeScript shapes describe the seven tool views. The API chooses data sources; the client cannot silently turn demo responses into live results.

## Storage

`projects`: unique normalized domain, creation time. `ranks`: foreign-key project, keyword, country/device, demo baseline, timestamp and provenance. Unique tuples prevent duplicate tracking entries. Schema creation is idempotent at startup; versioned migrations remain roadmap work before schema changes. Prepared statements bind all user values. The default database is `data/waypoint.sqlite`; copy it only while the server is stopped for a simple local backup. Never commit it.

## Audit

The server parses the supplied string with Cheerio, never executing scripts or fetching resources. Eight equally weighted checks produce the displayed checklist score; severity is separate from score weighting. Missing alt attributes fail, while an empty alt is allowed for decorative images. An absolute canonical, one H1, title/description length heuristics, document language, mobile viewport and robots meta are checked. This score is a local checklist, not a search-engine ranking factor or a commercial vendor score.

## Local security model

Bind only to loopback. No authentication or tenant authorization is implemented. Reject cross-origin browser writes and omit CORS headers. JSON requests are bounded to 1 MB; domain/keyword inputs are validated; no URL-fetch endpoint exists. Provider keys are not required. HTML and exports are not saved by the service. CSV fields are quoted and formula-like prefixes are escaped. React escapes displayed strings; submitted HTML never enters `dangerouslySetInnerHTML`.

These controls support a single-user local scaffold. They do not replace identity, CSRF tokens, authorization, network isolation, operational hardening or security review for a hosted service. Google Fonts makes a presentation-only external request; remove the CSS import for fully offline UI use.

## Future provider contract

Replace `demoProvider` behind `SeoProvider`, evolving methods to Promises and response provenance to a typed union. Support distinct capabilities for keyword index, SERPs, backlinks and first-party traffic. Each observation should carry provider identity, collection time, locale/device and source/estimate classification. Track consumption server-side and never fall back to demo when live calls fail. Historical ranking observations need their own append-only table, rather than overwriting the scaffold's baseline rows.

## Delivery

Vite compiles only browser code. `npm start` runs the TypeScript server using tsx and serves `dist`. Keep dev dependencies available for this local runtime; `npm ci --omit=dev` is not supported by this scaffold. CI runs tests and build. The repository contains no user databases, secrets, raw reference captures or generated bundles. GitHub privacy is independent of application runtime access.
