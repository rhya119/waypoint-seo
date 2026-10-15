# Claude API and local connector

Waypoint supports two optional paths: the web UI calls Anthropic's Claude API for advice after opt-in, and Claude clients use the whole platform through a local plugin or direct MCP connection. No other AI provider is implemented. See [plugin choices](PLUGIN.md) for the v0.3 package and its 17 tools.

## Built-in advisor

1. Create `.env` from `.env.example` if needed.
2. Put your own Anthropic API key in `ANTHROPIC_API_KEY` in that ignored file. Do not paste it into a caption, prompt, GitHub issue, or frontend variable.
3. Set `ANTHROPIC_MODEL` to a model your account can use. The current default is `claude-sonnet-5-5`, from Anthropic's [model catalog](https://platform.claude.com/docs/en/models/overview).
4. Restart the development server, enable **Show Claude analysis** under **Integrations**, then explicitly open Claude analysis in a toolkit view. The setting is off by default and enforced server-side.

The UI says “API key configured” based on key presence, not successful authentication. No API call is made to validate a key during page load. A Claude chat subscription and API access are separate; the website advisor requires API credentials and available billing. The status route returns only the configured flag, provider and model.

An explicit Ask Claude action transmits the prompt and the current tool's bounded context to Anthropic. Social context can include your draft caption, metadata, audit findings and campaign link. Domain context includes synthetic metrics and any visible audit/keyword/rank context. Prompts are limited to 2,000 characters and context to 16,000; the UI truncates longer context. Requests have a 1,600-output-token cap, disabled thinking, 30-second timeout, zero automatic retries, one active request and a five-second interval per server process. SDK/network errors are sanitized; keys and upstream payloads are never returned to the browser. These limits are modest local controls, not an account-level spending budget.

Responses include model identity, input/output token counts, and a truncation flag. The UI displays text as text, without executing HTML or scripts. Advice is not live SEO or social analytics. Keys, prompts and responses are not stored by Waypoint; Anthropic's account data policies govern submitted API data. Check the current [Anthropic platform documentation](https://platform.claude.com/docs/en/home) for your account's model availability and data controls.

## MCP connector

The stdio MCP server does not need the web server to run. It uses the same analysis helpers directly and opens configured SQLite read-only for workspace/performance reads. It never calls the Claude API. Only the explicit `youtube_research` tool contacts fixed official Google endpoints and consumes YouTube quota when configured; there is no arbitrary URL fetching or publishing capability. A Claude client reasons over tool results using its own model access.

```powershell
npm ci
npm run mcp:config
```

The helper prints platform-correct absolute paths, including a file URL for the TypeScript loader. Keep those paths; regenerate after moving the checkout. You can also run `npm run mcp` for a manual stdio process, but Claude Desktop should launch Node directly using the generated arguments so stdout contains only MCP messages.

### Claude Code

Run the generated `claude mcp add --transport stdio --scope local waypoint -- ...` command from this project directory. Confirm with:

```powershell
claude mcp get waypoint
```

The current Windows checkout was registered in private project-scoped local configuration, and this command returned **Connected**. This change was made through Claude Code's official CLI, preserving other server entries. To remove only this registration:

```powershell
claude mcp remove waypoint --scope local
```

Start or reopen Claude Code in the project to use the new tools. A Claude Code conversation invoking a tool has not been tested; protocol calls are covered by a real stdio-client test.

### Claude Desktop

Merge the generated `waypoint` entry into the `mcpServers` object of your existing Claude Desktop configuration. Do not overwrite unrelated entries. On Windows the usual file is `%APPDATA%\Claude\claude_desktop_config.json`. Restart the app after editing. Desktop installation/configuration was not present in this workspace, so no Desktop configuration was changed or UI connection verified. This is a **local stdio integration**, not a remotely hosted claude.ai connector URL.

### Tools

| Tool | Behavior |
| --- | --- |
| `domain_overview` | Synthetic domain overview and trends |
| `keyword_research` | Synthetic keyword suggestions |
| `backlink_analysis` | Fictional link sample |
| `competitor_research` | Fictional benchmarks |
| `site_audit` | Actual static submitted-HTML checks |
| `social_audit` | Actual social metadata checks and illustrative preview fields |
| `social_meta_tags` | Escaped metadata HTML generation |
| `social_caption_review` | Editorial phrase and hashtag checks |
| `campaign_link` | UTM URL generation |
| `read_workspace` | Read saved projects and demo rank baselines for reports |
| `social_performance` | Imported daily metrics, trends and coverage |
| `social_keywords` | Measured query statistics and separately labeled topic associations |
| `similar_content` | Lexical topic matches and observed performance gaps |
| `performance_report` | Source-aware social performance report |
| `rank_tracking` | Filtered saved demo positions for a domain |
| `seo_report` | Whole-domain demo SEO report and rank baselines |
| `youtube_research` | Explicit native public keyword/video discovery when configured |

All tools declare read-only, non-destructive annotations. Source-of-data limitations are included in tool descriptions/results. Missing databases yield an empty workspace instead of creating a new database. A read failure or unknown schema is reported as a tool error. No API keys, arbitrary filesystem paths, file-write tools, or shell execution are exposed to the client.

Sources: [MCP TypeScript v1 server guide](https://ts.sdk.modelcontextprotocol.io/server), [Claude Code MCP setup](https://code.claude.com/docs/en/mcp), [local MCP client setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers). SDK versions are pinned by `package-lock.json`.
