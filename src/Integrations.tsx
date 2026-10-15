import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  Code2,
  Plug,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { api } from "./lib";
import "./performance.css";
import NativeConnections from "./NativeConnections";
type Connections = {
  claude: { configured: boolean; enabled: boolean; model: string };
  youtube: { configured: boolean };
  platforms: {
    platform: string;
    import: boolean;
    ingestionApi: boolean;
    nativeApi: boolean;
  }[];
};
export default function Integrations({
  onClaudeChange,
}: {
  onClaudeChange: (enabled: boolean) => void;
}) {
  const [data, setData] = useState<Connections>();
  const [codeStatus, setCodeStatus] = useState<{ installed: boolean; loggedIn: boolean; subscription: string | null; authMethod: string | null }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Connections>("/integrations")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { api<{ installed: boolean; loggedIn: boolean; subscription: string | null; authMethod: string | null }>("/integrations/claude-code").then(setCodeStatus).catch(() => {}); }, []);
  return (
    <div className="integrations-workspace">
      <div className="integration-intro">
        <span className="eyebrow">YOUR PLATFORM, YOUR WORKFLOW</span>
        <h2>Connect only what you need.</h2>
        <p>
          Use Waypoint on its own, add data sources, or bring the whole toolkit
          into Claude.
        </p>
      </div>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      <div className="integration-grid">
        <section className="panel integration-card" data-tour="claude-plugin">
          <span className="integration-icon">
            <Plug size={25} />
          </span>
          <span className="tag">OPTIONAL</span>
          <h3>Use your Claude subscription</h3>
          <p className="connection-state" data-claude-code-connected={Boolean(codeStatus?.loggedIn && codeStatus.authMethod === "claude.ai")}>{!codeStatus ? 'Checking local Claude Code…' : codeStatus.loggedIn && codeStatus.authMethod === 'claude.ai' ? `Claude Code signed in${codeStatus.subscription ? ` · ${codeStatus.subscription.toUpperCase()}` : ''}` : codeStatus.installed ? 'Claude Code installed · subscription sign-in required' : 'Install Claude Code and sign in with your subscription'}</p>
          <p>On the host computer, open <code>Start-Claude-SEO.cmd</code> from the project folder. It uses your Claude Code subscription account and connects the local Waypoint tools. No separate Anthropic API key is needed for this route.</p>
          <p>Ask: “Use Waypoint to analyze my imported SEO data for mydomain.com.” Claude can validate CSVs, import them when you request it, inspect actual metrics, compare domains and audit supplied HTML. Plan usage limits still apply.</p>
          <p>
            A Claude Code plugin for the whole platform: keyword research,
            performance analysis, similar content, competitors, site audits,
            backlinks, rank baselines, and reports.
          </p>
          <ul>
            <li>
              <Check size={14} />
              Use real imported social metrics from Claude
            </li>
            <li>
              <Check size={14} />
              Preview CSVs and import them on your request
            </li>
            <li>
              <Check size={14} />
              No separate Anthropic API key required for MCP
            </li>
          </ul>
          <div className="plugin-options">
            <strong>Choose how to connect</strong>
            <details>
              <summary>
                Claude Code plugin <ArrowRight size={13} />
              </summary>
              <p>
                Install project dependencies, then launch Claude Code from the
                project directory:
              </p>
              <code>
                npm ci
                <br />
                claude --plugin-dir .
              </code>
              <p>
                This loads the plugin only for that session. The plugin uses the
                local MCP server; no public service or remote connector URL is
                created.
              </p>
            </details>
            <details>
              <summary>
                Claude Desktop / direct MCP <ArrowRight size={13} />
              </summary>
              <p>
                Run the command below to print a ready-to-merge Desktop
                configuration and a direct Claude Code MCP command:
              </p>
              <code>npm run mcp:config</code>
              <p>
                Choose either the plugin or direct MCP to avoid duplicate tool
                registrations. Existing direct MCP setup is preserved.
              </p>
            </details>
          </div>
          <a className="button secondary" href="/api/integrations/plugin">
            <ArrowDownToLine size={15} />
            Download plugin source bundle
          </a>
          <a
            className="text-button"
            href="https://github.com/rhya119/waypoint-seo/blob/main/docs/PLUGIN.md"
            target="_blank"
            rel="noreferrer"
          >
            Installation guide <ArrowRight size={13} />
          </a>
        </section>
        <section className="panel integration-card">
          <span className="integration-icon claude">
            <Bot size={25} />
          </span>
          <span className={`tag ${data?.claude.enabled ? "" : "neutral"}`}>
            {data?.claude.enabled ? "ENABLED" : "OFF BY DEFAULT"}
          </span>
          <h3>Claude inside Waypoint</h3>
          <p>
            Optional AI interpretation within the dashboard. All research and
            analysis tools work without enabling this.
          </p>
          <div className="integration-toggle">
            <div>
              <strong>Show Claude analysis</strong>
              <small>Opt in to AI actions across the platform</small>
            </div>
            <button
              role="switch"
              aria-checked={data?.claude.enabled || false}
              aria-label="Enable optional Claude advisor"
              disabled={!data || busy}
              className={`toggle-switch ${data?.claude.enabled ? "on" : ""}`}
              onClick={async () => {
                if (!data) return;
                setBusy(true);
                setError("");
                try {
                  const result = await api<{ enabled: boolean }>(
                    "/integrations/claude",
                    { enabled: !data.claude.enabled },
                    "PUT",
                  );
                  setData({
                    ...data,
                    claude: { ...data.claude, enabled: result.enabled },
                  });
                  onClaudeChange(result.enabled);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span />
            </button>
          </div>
          <div className="connection-state">
            <span
              className={`source-dot ${!data?.claude.configured ? "example" : ""}`}
            />
            {data?.claude.configured
              ? "Server API key configured"
              : "No server API key configured"}
          </div>
          <p className="integration-help">
            To use the web advisor, set <code>ANTHROPIC_API_KEY</code> in the
            server’s ignored <code>.env</code> and restart. Model:{" "}
            <code>{data?.claude.model || "configured on server"}</code>.
            Enabling this option does not send data; each AI request requires an
            explicit action and may be billed by Anthropic.
          </p>
          <p className="integration-help">
            The Claude plugin/MCP connection and this API-powered advisor are
            independent options.
          </p>
        </section>
      </div>
      <NativeConnections />
      <div className="integration-grid">
        <section className="panel integration-card compact">
          <span className="integration-icon">
            <Radio size={23} />
          </span>
          <h3>YouTube native discovery</h3>
          <p>
            Set <code>YOUTUBE_API_KEY</code> on the server and enable the
            YouTube Data API for that key. The Live research tab searches
            matching videos and retrieves public lifetime views, likes,
            comments, and publication dates.
          </p>
          <p className="integration-help">
            Requests consume YouTube API quota. This does not connect private
            channel analytics or reveal search volume; public lifetime snapshots
            stay separate from daily performance imports.
          </p>
        </section>
        <section className="panel integration-card compact">
          <span className="integration-icon">
            <Code2 size={23} />
          </span>
          <h3>Bring your own data pipeline</h3>
          <p>
            Send normalized daily observations from your authorized platform API
            workflow to <code>POST /api/social/ingest</code>. Use{" "}
            <code>kind: content</code> or <code>kind: queries</code>,{" "}
            <code>metricBasis: daily</code>, and a <code>rows</code> array.
          </p>
          <p className="integration-help">
            This local endpoint accepts daily increments. Use the native pull
            cards above for lifetime account snapshots. Authorization happens
            through each provider’s developer tools; Waypoint does not run an
            OAuth login service.
          </p>
        </section>
      </div>
      <div className="integration-privacy">
        <ShieldCheck size={18} />
        <p>
          Provider keys stay on the server. Imported data stays in local SQLite.
          The optional plugin exposes analysis tools plus explicit local CSV imports. It never posts
          to social accounts.
        </p>
      </div>
    </div>
  );
}
