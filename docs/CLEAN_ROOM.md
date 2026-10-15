# Clean-room research and design record

Prepared 2026-10-16. This is an independent scaffold with original implementation and design. The reference is [Semrush's public homepage](https://www.semrush.com/); the research boundary was the unauthenticated page and its product menu.

## REA observations

REA 6.4.0 was invoked through its pinned npm CLI. The current agent session had no connected REA MCP tools; doctor reported missing Codex registration. No agent configuration or installed skill was modified. A controlled browser scenario used an isolated Chrome profile, loaded the public homepage, opened the product menu, and captured accessibility observations. No login, private data, source maps, script export, bundle recovery, proprietary API access, or decompilation was requested.

- Homepage Evidence: `ev_ef522d537f5d73286a1538bd237b3dc8094f70f96bd0a2610880935b91eb2abb`.
- Product-menu Evidence: `ev_354c01835fde4f9f9a46226c868a2320b86dab141835ca8a903b2d9867cae467`.
- Both successful Chrome captures report owned-process cleanup and complete declared observations. An earlier Edge attempt retained partial observations with a cleanup timeout; it is not used as authoritative completion evidence. A subsequent process inventory found no remaining matching REA/Playwright browser processes.

Observed: the menu exposes broad categories for keyword discovery, competitor comparisons, technical site health, rank monitoring, marketing reports and backlink analysis. A domain input is present on the public homepage. These are category/interaction observations only. The evidence does not establish the vendor's authenticated workflows, schemas, algorithms, datasets, performance, or internal architecture.

## Independent implementation choices

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

## Source boundary

Only normal third-party libraries from npm are dependencies. The project contains no vendor source, extracted scripts, page text, logos, screenshots, or data. Raw research captures are kept under ignored `artifacts/` locally and excluded from the commit. Repository documentation records original factual summaries and Evidence identifiers rather than reproducing public page content.

## Unknown and deferred

No claims are made about reproducing commercial data coverage, accuracy, scoring formulas, paid endpoints, or full product parity. Provider licensing, actual index construction, live crawling, scheduled SERP checks and production hosting remain roadmap milestones. Feature categories came from public observation and the user brief; backend and UI behavior were designed independently.
