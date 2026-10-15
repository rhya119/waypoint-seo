# Free SEO workflow with your own data

The normal workspace starts at **Domain overview** with an empty domain field. Enter a public website and click **Analyze website**. The app normalizes the host, remembers the selection and starts an actual bounded public HTTPS scan. Choose **Use saved / imported data** to open saved observations without a new scan. The web workspace has no fictional demo option or preset example domain. Social SEO and Integrations work independently.

## Analyze a website immediately

1. Enter the website in the domain field and click **Analyze website**.
2. Review the fetched homepage title, description, canonical, headings, image alt coverage, readable topics, structured-data types and links.
3. Open **Site audit** for the static checklist and checked-page results. The scanner checks robots.txt, then the homepage and up to two eligible same-origin internal pages. Duplicate title/description and broken-link findings cover only those checked pages.
4. Open **Keyword research** for observed homepage topics. These are word frequencies, not measured search demand or rankings. Add Search Console queries for actual keyword clicks/impressions.
5. Inspect homepage outbound links separately from supplied inbound backlinks. A page linking to another site does not prove that site links back.

No API key is needed for public scanning. It runs at most one scan at a time, with a 30-second overall budget, 10-second requests, three redirects and 1.5 MB total response bytes. It blocks private/reserved/IP targets, credentials/custom ports, unsafe redirects and account/action URLs. Robots restrictions, unavailable HTTPS, blocked automation, large responses or script-rendered content can prevent or limit a scan. No login, CAPTCHA bypass, JavaScript execution, asset rendering or full-site crawl occurs. The checklist is not a Google ranking or Core Web Vitals measurement. Public markup cannot reveal private traffic, search positions, global keyword volume or complete inbound backlinks.

## Optional authorized Google pulls

For your own authorized properties, set these **server-only** names in ignored `.env`, then restart:

```dotenv
GOOGLE_SEO_ACCESS_TOKEN=
GA4_PROPERTY_ID=
GA4_SITE_DOMAIN=
```

Use your own OAuth access token with `https://www.googleapis.com/auth/webmasters.readonly` and `https://www.googleapis.com/auth/analytics.readonly` scopes. The GA4 names are optional: a numeric property ID and a domain mapping that exactly matches the normalized selected host. Provider flags indicate configuration, not successful authentication. The current workspace has no Google credentials configured; live access remains unverified. This app does not perform OAuth login or token refresh, so expired tokens must be renewed outside it.

Select **From/To** dates and click **Pull Google data**. Search Console first lists authorized properties, then reads an exact matching Domain property or root URL-prefix property. Its result keeps the property identity and date window, uses finalized web/query aggregates, and fetches at most five pages of 1,000 rows. Missing access stays unavailable, not guessed. The 5,000-row cap is marked as potentially truncated; Google's own query/anonymization limits can omit further data even below it.

GA4 returns sessions, active users, page/screen views and a separate Organic Search sessions report. Requests are filtered to the matching host and its www equivalent. The local domain mapping is a declaration, not independent stream-ownership verification. GA4's reporting timezone differs from Search Console's Pacific reporting dates; neither sessions nor active users are interchangeable with GSC search clicks. Missing/suppressed metrics stay unknown. Each Google request has a 12-second deadline within a 45-second pull budget, no automatic retries, one active pull and a ten-second interval. Authentication/access errors are explicit and sanitized.

The latest Google report is saved per domain. Nonempty valid GSC query rows are also saved as a declared-window query dataset, so Keyword research uses the same validated measurements as imports. The result and query snapshot commit atomically; no daily history is inferred.

See Google's [authorized site list](https://developers.google.com/webmaster-tools/v1/sites/list), [query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [GA4 report API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport) and [metric definitions](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).

## Optional paid traffic estimates

Set `SIMILARWEB_API_KEY` in ignored server `.env` and restart. In **Domain overview** or **Reports**, choose up to **12 complete calendar months**, then explicitly click **Fetch traffic estimates**. That action can consume paid Similarweb quota; ordinary public scans do not silently trigger it. A provider subscription/API entitlement is required, and available dates/coverage depend on the account and domain. No credentials are configured in this workspace, so live estimates remain unverified.

The latest estimate report is saved per domain. The panel labels it as worldwide monthly all-channel traffic estimates, with visits, bounce rate and pages per visit, separately from measured GSC clicks and GA4 sessions. Bounce rate is stored as a fraction and shown as a percentage. Estimates may be fractional or unavailable, particularly for small sites; never turn missing coverage into zero, call estimates private analytics, or interpret them as keyword ranks/backlinks. This connector does not bypass provider payment, access restrictions or another website's private accounts. See [Similarweb visit estimates](https://developers.similarweb.com/reference/visits) and [small-site uncertainty](https://developers.similarweb.com/docs/why-does-the-api-return-exact-values-for-small-sites).

## Import query performance without API credentials

1. In Google Search Console for a property you can access, open **Performance → Search results**.
2. Select the date range and relevant filters, then open **Queries** and export CSV.
3. Extract the downloaded archive if necessary and choose its **Queries CSV**, not the chart, pages, countries or summary CSV.
4. In Waypoint click **Import SEO data**, choose **Search Console queries**, enter the same dates, source and filter scope, then upload or paste the CSV.
5. Click **Validate preview**, review the rows/errors, then **Import validated data**.
6. Open **Keyword research** and filter any phrase present in your supplied query data. The overview shows the query-table clicks, impressions, CTR and row count. Use the query-dataset selector to switch periods/scopes.

Accepted headers are canonical `query,clicks,impressions,position` or English Search Console `Top queries,Clicks,Impressions,CTR,Position`. `CTR` is recomputed from clicks/impressions; the input CTR column is ignored. Position is a nullable average, not a point-in-time SERP rank. Missing positions should be blank, not zero. A zero-impression row has unknown CTR. Integer metrics may use quoted thousands separators. Localized headers must be renamed to canonical names.

Each search dataset is a **single query-table snapshot for its declared date range**, one row per query. Do not paste daily rows with repeated queries, combine country/device slices, or label mixed filters as an all-country total. Scope is a declaration supplied by you; Waypoint cannot verify the exporter’s filters. Matching domain/type/date-window/scope imports replace that snapshot. Different or overlapping windows are stored separately and never added together. No trend is fabricated between snapshots.

Search Console query tables can omit anonymized queries and can be truncated; their sums can differ from the whole-property chart. They are **not** total website visitors, global keyword search volume, paid-click prices, keyword difficulty or a complete search index. See Google's [export guide](https://support.google.com/webmasters/answer/12919797?hl=en), [data discrepancy explanation](https://support.google.com/webmasters/answer/17010575?hl=en) and [position/aggregation definitions](https://support.google.com/webmasters/answer/17011364?hl=en).

## Backlink analysis

Choose **Backlink analysis → Import SEO data → Backlink URLs**. Use:

```csv
source_url,target_url,anchor,rel
```

Supply actual link observations you are authorized to use. Targets must match the selected domain or a subdomain; source and target must be HTTP(S) URLs without embedded credentials. Repeated identical link rows in one dataset are rejected. Unknown rel values remain `unknown`. Referring hosts count exact source hostnames, not estimated authority or registrable domains. Only the latest imported link snapshot is displayed. This analyzes your supplied list; it does not crawl/discover links or establish that they are still live. A Search Console linking-domain summary alone does not provide source/target URL pairs and cannot be used as this format.

## Site audit

Select your domain, open **Site audit**, paste your page’s view-source HTML or upload an HTML file, then click **Run HTML audit**. Eight actual markup checks run locally without executing scripts. The latest result is saved for that domain and included in its report. The checklist score is not a Google ranking or site-wide SEO score. This pasted-HTML checker does not fetch resources or inspect HTTP headers. The separate **Analyze website** action performs the limited robots-aware public scan described above. Neither method renders JavaScript or measures browser performance.

## Rank tracking

**Save keyword** creates a watchlist entry without inventing a position. To populate observed ranks, import:

```csv
keyword,date,position,country,device,url
```

Dates are `YYYY-MM-DD` and must lie inside the declared window. Positions are actual integer observations from 1–1,000. Country defaults to `all`; device is `all`, `desktop`, `mobile` or `tablet`; URL is optional but must belong to the selected domain if present. The newest and previous distinct observed dates determine the displayed change; a positive change means improvement. Overlapping snapshots deduplicate observation identity, and the latest import wins for that observation. No scheduled checks or automated search-engine scraping runs. Search Console average positions remain separate in the query table.

## Competitor research and reporting

Open **Competitor research → Import another domain** for another dataset you are authorized to use. Query-set overlap is Jaccard overlap: shared queries divided by the union. Other-domain-only queries are potential gaps in the supplied data. Both declared dates and scope must match before scores appear; incompatible comparisons stay unknown. Having a competitor’s domain alone does not provide their private clicks or query coverage.

**Reports** combines the saved public scan, selected query snapshot, latest link snapshot, observed positions, watchlist, latest HTML audit and optional saved Google/Similarweb reports. Each source keeps its own dates and limitations; selecting a query snapshot does not change the saved provider reports' date ranges. Export JSON, keyword CSV or print the report. Browser PDF output and actual downloaded-file delivery depend on the browser.

Imports are capped at 5,000 rows and 900 KB per file; the request body limit is 1 MB. Preview validation happens again on save, and invalid batches write nothing. Reports cap at 200 datasets per domain, 500 candidate comparison datasets and 500 displayed table rows; keyword CSV exports include all matching rows. Remove older datasets through `DELETE /api/web/datasets/:id` with the matching domain if you hit the local dataset cap. This removes that snapshot only. SQLite data stays under the ignored `data/` directory; back it up securely before archiving datasets.

## Claude subscription

Open **Start-Claude-SEO.cmd** on the host computer. It checks subscription authentication and reuses the project’s direct `waypoint` MCP registration when present; otherwise it loads the bundled plugin. The launcher clears API-key/base-URL overrides only in its own process. It does not change your `.env`, saved credentials or subscription settings.

Example request: “Read this Search Console Queries CSV, validate it with Waypoint for mydomain.com for the dates I selected, then show me the preview.” After review, explicitly request the import. The `seo_import` tool writes the validated dataset; the report/keyword/link/rank tools then read those measured records. CSV, HTML, imported captions and tool output are untrusted data, never instructions. Claude’s subscription limits still apply. The embedded web advisor remains a separate opt-in API feature; no subscription session tokens are used as a web-app backend.
