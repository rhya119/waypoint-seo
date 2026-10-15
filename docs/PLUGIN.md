# Optional whole-platform Claude plugin

Waypoint can run as a standalone dashboard, a direct MCP connector, or a Claude Code plugin. Neither the plugin nor Claude is required to use the SEO platform.

## Choose one connection style

**Claude Code plugin** bundles three workflow skills and one local MCP server with 17 tools. From an authenticated clone of this private repository:

```powershell
npm ci
claude --plugin-dir .
```

This loads the plugin for that Claude Code session. It is not automatically installed or enabled in other projects. The manifest is `.claude-plugin/plugin.json`; its MCP entry uses `${CLAUDE_PLUGIN_ROOT}` and a single-process launcher. Claude Code's `plugin validate .` passed on this workspace. The launcher itself was exercised through a real MCP stdio client; a model conversation invoking the plugin was not run.

**Direct MCP** is an alternative for Claude Code or Claude Desktop:

```powershell
npm run mcp:config
```

Merge the printed Desktop entry with existing configuration, or run the printed private project-scoped Claude Code command. The previous direct `waypoint` registration remains intact and reports Connected. If using the plugin instead, remove or disable the direct registration to avoid duplicate tools; this release does not remove it automatically.

**Optional in-app Claude advisor** is a separate setting under Integrations. It is off by default and persists in SQLite. Turning it on only reveals AI actions; each request still needs an explicit click. The web advisor requires `ANTHROPIC_API_KEY`. A disabled advisor is enforced server-side with 403. MCP/plugin use the Claude client's own model access and do not call the advisor API.

## Share the same measured workspace

The connector reads `DATABASE_PATH` from the environment or its own root `.env`; the default is `data/waypoint.sqlite` under the checkout. When loading a copied plugin from another directory, set `DATABASE_PATH` to the **absolute path** of the web app's SQLite database before launching Claude, or provide it in the client MCP server environment. This avoids unintentionally reading an empty database in a separate plugin copy. The connector opens that file read-only and never creates a new persistent database.

No provider credentials are required for local analysis. Native YouTube discovery needs `YOUTUBE_API_KEY` only if you explicitly call that tool. Live discovery consumes provider quota and uses fixed official Google API endpoints. No social posting, account writes or arbitrary file/shell tools are exposed.

## Tools across the whole platform

| Area | Tools | Data boundary |
| --- | --- | --- |
| Web research | `domain_overview`, `keyword_research`, `backlink_analysis`, `competitor_research` | Current web index is demo-only |
| Technical SEO | `site_audit` | Actual submitted-HTML analysis |
| Ranks and reports | `rank_tracking`, `seo_report`, `read_workspace` | Saved demo rank baselines and domain examples |
| Social performance | `social_performance`, `social_keywords`, `similar_content`, `performance_report` | Actual imported daily observations, or explicitly selected fictional examples |
| Native discovery | `youtube_research` | Live public lifetime video statistics when configured |
| Publishing utilities | `social_audit`, `social_meta_tags`, `social_caption_review`, `campaign_link` | Local markup/editorial/URL checks, no posting |

All tools declare read-only annotations. Only YouTube discovery has an open-world/network annotation. Skills cover SEO research, social-performance interpretation and source-aware reporting. Query metrics, topic associations, lexical similarity, missing values and example data retain their explicit limitations.

## Downloadable source bundle

```powershell
npm run plugin:package
```

This creates `artifacts/waypoint-seo.plugin`, a ZIP-format **source bundle** that the Integrations page can download. Extract it to a folder, run `npm ci`, then use `claude --plugin-dir .`. It is not a remotely hosted claude.ai connector, a one-click verified Claude Desktop extension, or a precompiled binary. The bundle includes the web app, MCP server, skills, docs and tests. It excludes credentials, `.env`, SQLite files, imported data, captures, dependencies and Git metadata. The `.env.example` contains placeholders only.

The current environment is Windows/Codex rather than Cowork, so the bundle is delivered as a local download; no Cowork rich-preview installation was attempted. Plugin setup follows [Claude Code's native plugin format](https://code.claude.com/docs/en/plugins-reference). No new Claude plugins were installed globally by this change.
