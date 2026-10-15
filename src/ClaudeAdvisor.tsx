import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Plug, Sparkles } from 'lucide-react';
import { api, download } from './lib';
type Status = { provider: string; configured: boolean; model: string };
type Reply = { text: string; model: string; inputTokens: number; outputTokens: number; truncated: boolean };
export default function ClaudeAdvisor({ context }: { context: string }) {
  const [status, setStatus] = useState<Status>(); const [prompt, setPrompt] = useState('Suggest three practical improvements and explain what I should verify next.');
  const [reply, setReply] = useState<Reply>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const currentContext = useRef(context); currentContext.current = context;
  useEffect(() => { api<Status>('/claude/status').then(setStatus).catch(() => setError('Could not check the Claude connection.')); }, []);
  useEffect(() => { setReply(undefined); setError(''); }, [context]);
  return <section className="panel claude-panel" aria-labelledby="claude-title">
    <div className="panel-head"><div><h2 id="claude-title"><Bot size={17}/> Claude advisor</h2><p>Turn this workspace’s findings into a practical action plan.</p></div><span className={`tag ${status?.configured ? '' : 'amber'}`}>{status ? status.configured ? 'API key configured' : 'API key needed' : 'Checking connection'}</span></div>
    <div className="claude-body">
      {!status?.configured && status && <p className="setup-note">Add <code>ANTHROPIC_API_KEY</code> to your local server’s <code>.env</code> and restart. Your key stays on the server. Claude API access requires its own API account and billing.</p>}
      <form onSubmit={async e => { e.preventDefault(); const requestContext = context; setBusy(true); setError(''); setReply(undefined); try { const result = await api<Reply>('/claude/recommend', { prompt, context: requestContext.slice(0, 16000) }); if (currentContext.current === requestContext) setReply(result); } catch (e) { if (currentContext.current === requestContext) setError((e as Error).message); } finally { setBusy(false); } }}>
        <label htmlFor="claude-prompt">What would you like to improve?</label>
        <textarea id="claude-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} minLength={2} maxLength={2000} required/>
        <div className="claude-submit"><button className="button primary" disabled={!status?.configured || busy}><Sparkles size={15}/>{busy ? 'Asking Claude…' : 'Ask Claude'}<ArrowRight size={14}/></button><span>{status?.model || 'Anthropic API'} · sends your prompt and current findings to Anthropic; API usage may be billed.</span></div>
      </form>
      {error && <p className="social-error" role="alert">{error}</p>}
      {reply && <div className="claude-reply" role="status"><div className="claude-reply-head"><strong>Claude’s recommendations</strong><button className="text-button" onClick={() => download('waypoint-claude-advice.txt', reply.text, 'text/plain')}>Save advice</button></div><p>{reply.text}</p><small>{reply.model} · {reply.inputTokens} input / {reply.outputTokens} output tokens{reply.truncated ? ' · response reached output limit; ask a narrower question' : ''}</small></div>}
      <details className="connector-guide"><summary><Plug size={15}/> Connect Claude Desktop or Claude Code</summary><p>Waypoint also includes a local MCP server. Claude can use the toolkit directly through that connector; this does not require a separate API key. Your Claude client handles its own model access.</p><p>From the project folder, run <code>npm run mcp:config</code> for a ready-to-copy Claude Desktop configuration. Merge it with your existing configuration, then restart Claude Desktop. Keep the generated absolute paths.</p><p>For Claude Code, use the command printed by <code>npm run mcp:config</code>. The connector exposes local tools and synthetic SEO data. It does not publish posts, fetch entered URLs, or call the Claude API.</p><a href="https://github.com/rhya119/waypoint-seo/blob/main/docs/CLAUDE.md" target="_blank" rel="noreferrer">Read connector setup <ArrowRight size={13}/></a></details>
    </div>
  </section>;
}
