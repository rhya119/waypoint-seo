import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
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
        <h2>Connections</h2>
        <p>Connect your accounts and choose how to use Claude.</p>
      </div>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      <NativeConnections />
      <div className="integration-grid">
        <section className="panel integration-card" data-tour="claude-plugin">
          <span className="integration-icon">
            <Plug size={25} />
          </span>
          <span className="tag">OPTIONAL</span>
          <h3>Claude Code</h3>
          <p className="connection-state" data-claude-code-connected={Boolean(codeStatus?.loggedIn && codeStatus.authMethod === "claude.ai")}>{!codeStatus ? 'Checking local Claude Code…' : codeStatus.loggedIn && codeStatus.authMethod === 'claude.ai' ? `Claude Code signed in${codeStatus.subscription ? ` · ${codeStatus.subscription.toUpperCase()}` : ''}` : codeStatus.installed ? 'Claude Code installed · subscription sign-in required' : 'Install Claude Code and sign in with your subscription'}</p>
          <p>Use your Claude subscription on this computer to work with Waypoint. No separate API key is required; plan limits apply.</p>
          <details className="integration-setup">
          <summary>Set up Claude Code</summary>
          <p>On the host computer, open <code>Start-Claude-SEO.cmd</code> in the project folder. Ask: “Use Waypoint to analyze my SEO data for mydomain.com.”</p>
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
          </details>
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
            {data?.claude.enabled ? "ON" : "OFF"}
          </span>
          <h3>Claude web advisor</h3>
          <p>Optional advice inside Waypoint. Uses a separate Anthropic API key and may incur API charges.</p>
          <div className="integration-toggle">
            <div>
              <strong>Enable web advisor</strong>
              <small>Each analysis requires a click</small>
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
          <details className="integration-setup">
          <summary>API setup and billing</summary>
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
          </details>
        </section>
      </div>
      <details className="connection-advanced">
      <summary>More data options</summary>
      <div className="integration-grid">
        <section className="panel integration-card compact">
          <span className="integration-icon">
            <Radio size={23} />
          </span>
          <h3>YouTube research</h3>
          <p className="connection-state">{data?.youtube.configured ? 'API key configured' : 'API key needed'}</p>
          <p>
            Set <code>YOUTUBE_API_KEY</code> on the server and enable the
            YouTube Data API for that key. The YouTube research tab searches
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
          <h3>Import through the API</h3>
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
      </details>
      <div className="integration-privacy">
        <ShieldCheck size={18} />
        <p>
          Keys stay on the server. Data stays in your workspace. Pulls, imports and Claude requests run only when you choose them.
        </p>
      </div>
    </div>
  );
}
