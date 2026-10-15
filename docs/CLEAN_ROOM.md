# Clean-room research and design record

Prepared 2026-10-16 and updated for the current v0.5 implementation. This is an independent toolkit with original implementation and design. The initial reference was [Semrush's public homepage](https://www.semrush.com/); that research boundary was the unauthenticated page and its product menu.

## REA observations

REA 6.4.0 was invoked through its pinned npm CLI. The current agent session had no connected REA MCP tools; doctor reported missing Codex registration. No agent configuration or installed skill was modified. A controlled browser scenario used an isolated Chrome profile, loaded the public homepage, opened the product menu, and captured accessibility observations. No login, private data, source maps, script export, bundle recovery, proprietary API access, or decompilation was requested.

- Homepage Evidence: `ev_ef522d537f5d73286a1538bd237b3dc8094f70f96bd0a2610880935b91eb2abb`.
- Product-menu Evidence: `ev_354c01835fde4f9f9a46226c868a2320b86dab141835ca8a903b2d9867cae467`.
- Both successful Chrome captures report owned-process cleanup and complete declared observations. An earlier Edge attempt retained partial observations with a cleanup timeout; it is not used as authoritative completion evidence. A subsequent process inventory found no remaining matching REA/Playwright browser processes.

Observed: the menu exposes broad categories for keyword discovery, competitor comparisons, technical site health, rank monitoring, marketing reports and backlink analysis. A domain input is present on the public homepage. These are category/interaction observations only. The evidence does not establish the vendor's authenticated workflows, schemas, algorithms, datasets, performance, or internal architecture.

## Initial scaffold choices (historical 0.1)

This table records the first scaffold, not current behavior. The fictional web demo UI and its preset example domain have since been removed. Legacy example HTTP endpoints remain only for compatibility; normal web UI/MCP tools use actual observations.

| Requested category | Waypoint's independently chosen first implementation |
| --- | --- |
| Domain overview | Normalized domain lookup against a deterministic demo provider, metric cards, SVG trend chart |
| Keyword research | Original generated seed phrases, intent filter, CSV and tracking action |
| Backlinks | Fictional `.example` link records, anchor and follow-type exploration |
| Site audit | Locally submitted HTML and eight independently implemented static checks |
| Rank tracking | SQLite keyword baselines keyed by project, country and device |
| Competitors | Fictional benchmark domains and an illustrative overlap bar |
| Reports | Original summary layout, JSON response with provenance, browser printing |

The mint/forest palette, compass identity, typography, navigation, copy, charts, forms and data generation are original design decisions. Product naming is a working project name; a trademark/domain clearance search has not been performed.

## Current independent implementation (0.5)

| Category | Current Waypoint behavior and source boundary |
| --- | --- |
| Domain overview | Explicit public HTTPS scan, saved findings, actual imported/authorized query data and separately labeled optional provider reports |
| Keyword research | Homepage word-frequency topics plus imported/authorized query clicks, impressions, CTR and average position; no global keyword index |
| Backlinks | User-supplied source/target link snapshots; scanned outbound links shown separately, without claiming inbound coverage |
| Site audit | Robots-aware homepage plus up to two eligible same-origin pages, with independent markup checks; pasted HTML checks also available |
| Rank tracking | Watchlist and actual supplied dated rank observations; no automated SERP scraping or invented positions |
| Competitors | Compatible imported query-set overlap/gaps; optional paid traffic estimates do not reveal private account analytics |
| Reports | Source-aware saved observations, scan findings, audits and optional provider reports, preserving independent dates and missing values |
| Social SEO | Daily imports, seven official account adapters with separate lifetime counters, lexical comparisons and public YouTube discovery |
| Claude | Optional local Claude Code toolkit, 21 MCP tools and three original workflow skills; separate opt-in Anthropic API advisor |

The scanner uses a deliberately limited original collection design: public-address DNS validation and IP pinning, TLS hostname checks, robots policy, redirect restrictions, byte/deadline caps and static parsing. It does not log in, execute page scripts, bypass restrictions or reproduce commercial crawling coverage. Topics are lexical frequencies; page links are not a backlink index; checklist scores are not vendor scores or search-engine rankings.

Google Search Console/GA4 reads use the user's authorized read-only access and fixed official APIs. Similarweb traffic estimates require the user's paid API entitlement and an explicit request for complete months. These integrations follow public provider documentation; they neither recover proprietary implementation nor bypass data access. No Google/Similarweb credentials are configured in this workspace, so live provider authorization remains unverified. See [data workflows and sources](FREE_SEO.md).

A private Tailscale service hosts the user's shared local workspace. Claude subscription access stays in Claude Code on the host; no subscription session is repurposed as the website's API backend. See [private deployment](PRIVATE_SERVICE.md) and [Claude boundaries](CLAUDE.md).

## Source boundary

Only normal third-party libraries from npm are dependencies. The project contains no vendor source, extracted scripts, page text, logos, screenshots, or data. Raw research captures are kept under ignored `artifacts/` locally and excluded from the commit. Repository documentation records original factual summaries and Evidence identifiers rather than reproducing public page content.

## Unknown and deferred

No claims are made about reproducing commercial data coverage, accuracy, scoring formulas, private endpoints or full product parity. A broad licensed keyword/backlink index, full-site crawler, scheduled SERP collection and authenticated multi-user public hosting remain roadmap work. The current limited public scanner and private single-owner service do not establish those capabilities. Feature categories came from public observation and the user brief; backend and UI behavior were designed independently.
