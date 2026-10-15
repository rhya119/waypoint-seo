// Explicitly selected owned browser, isolated profile; no proprietary scripts or assets.
// Usage: node scripts/qa-rea.mjs [absolute-browser-executable]
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const executable = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
mkdirSync('artifacts', { recursive: true });
const click = (step_id, selector) => ({ step_id, action: 'click', locator: { kind: 'css', selector }, timeout_ms: 10000 });
const fill = (step_id, selector, value) => ({ step_id, action: 'fill', locator: { kind: 'css', selector }, value: { source: 'literal', value }, timeout_ms: 10000 });
const wait = (step_id, selector) => ({ step_id, action: 'wait_for', locator: { kind: 'css', selector }, state: 'visible', timeout_ms: 10000 });
const select = (step_id, selector, value) => ({ step_id, action: 'select_option', locator: { kind: 'css', selector }, value: { source: 'literal', value }, timeout_ms: 10000 });
const check = (step_id, selector) => ({ step_id, action: 'check', locator: { kind: 'css', selector }, timeout_ms: 10000 });
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4318';
const common = { browser: { mode: 'launch', executable_path: executable }, start_url: { url: `${baseUrl}/#domain-overview`, query: [] }, capture: { after_each_step: process.env.QA_LIGHT_CAPTURE ? [] : ['screenshot'], at_end: ['accessibility', 'url', 'screenshot'], events: ['page-errors', 'downloads'] } };
const socialActions = [
  wait('ready', '.chart svg'), click('social_module', 'nav button:nth-child(8)'), wait('performance_source', '.performance-source'),
  click('choose_example', '.source-toggle button:nth-child(2)'), wait('performance_metrics', '.performance-kpis'),
  click('keyword_performance', '.performance-tabs button:nth-child(2)'), wait('query_table', '.performance-workspace > section.panel:first-of-type tbody tr:first-child'),
  click('similar_content', '.performance-tabs button:nth-child(3)'), select('reference', 'select[aria-label="Reference content"]', '["youtube","@northstar","example-0"]'), wait('similar_results', '.reference-card'),
  click('competitors', '.performance-tabs button:nth-child(4)'), wait('competitor_rows', '.performance-workspace > section.panel tbody tr:first-child'),
  click('integrations', 'nav button:nth-child(9)'), wait('optional_claude', '[role="switch"][aria-checked="false"]'),
  click('enable_advisor', '[role="switch"]'), wait('enabled', '[role="switch"][aria-checked="true"]'),
  click('disable_advisor', '[role="switch"]'), wait('disabled', '[role="switch"][aria-checked="false"]'),
];
const importCsv = 'platform,account,content_id,date,published_at,title,keywords,format,ownership,views,impressions,clicks,likes,comments,shares,saves\nyoutube,@qa-account,qa-1,2026-10-15,2026-10-01,QA balcony garden tutorial,balcony garden,video,owned,100,500,20,6,1,2,3\nyoutube,@qa-competitor,qa-2,2026-10-15,2026-10-01,QA balcony garden ideas,balcony garden,video,competitor,200,700,25,10,2,4,5';
const queryCsv = 'platform,account,date,keyword,views,impressions,clicks\nyoutube,@qa-account,2026-10-15,balcony garden,40,200,10';
const importActions = [
  wait('ready', '.chart svg'), click('social_module', 'nav button:nth-child(8)'), click('open_import', '.performance-intro-actions button:first-child'),
  fill('paste_content_csv', '#performance-csv', importCsv), check('daily_basis', '.daily-confirm input'), click('preview_content', '.import-actions .secondary'), wait('content_validated', '.import-preview.valid'), click('save_content', '.import-actions .primary'), wait('saved_metrics', '.performance-kpis'),
  { step_id: 'reload_saved', action: 'goto', destination: { url: `${baseUrl}/#social-seo`, query: [] }, wait_until: 'load', timeout_ms: 10000 }, wait('persisted_metrics', '.performance-kpis'),
  click('import_queries', '.performance-intro-actions button:first-child'), click('query_kind', '.import-kind button:nth-child(2)'), fill('paste_query_csv', '#performance-csv', queryCsv), check('query_daily_basis', '.daily-confirm input'), click('preview_queries', '.import-actions .secondary'), wait('queries_validated', '.import-preview.valid'), click('save_queries', '.import-actions .primary'), wait('query_metrics', '.performance-workspace > section.panel:first-of-type tbody tr:first-child'),
  click('live_tab', '.performance-tabs button:nth-child(5)'), fill('live_keyword', 'input[aria-label="Live YouTube keyword"]', 'balcony garden'), click('live_search', '.live-research-form button'), wait('missing_youtube_key', '.performance-workspace > .social-error'),
];
const scenarios = [
  ...['tour-preview', 'tour-preview-mobile'].map(name => [name, { ...common, environment: { viewport: { width: name === 'tour-preview' ? 1440 : 390, height: name === 'tour-preview' ? 1080 : 844 } }, actions: [click('start', '.tour-start'), wait('intro', '[data-tour-step="1"]'), click('social', '[data-tour="nav-7"]'), wait('example', '[data-tour-step="2"]')] }]),
  ...['tour', 'tour-mobile'].map(name => [name, { ...common, environment: { viewport: { width: name === 'tour' ? 1440 : 390, height: name === 'tour' ? 1080 : 844 } }, actions: [
    click('start_tour', '.tour-start'), wait('tour_intro', '[data-tour-step="1"]'), click('social', '[data-tour="nav-7"]'), wait('example_hint', '[data-tour-step="2"]'), click('try_example', '[data-tour="example-data"]'), wait('topic_hint', '[data-tour-step="3"]'), click('next_topic', '.tour-actions .primary'), wait('keyword_hint', '[data-tour-step="4"]'), click('keywords', '[data-tour="tab-keyword-performance"]'), wait('similar_hint', '[data-tour-step="5"]'), click('similar', '[data-tour="tab-similar-content"]'), wait('competitor_hint', '[data-tour-step="6"]'), click('competitors', '[data-tour="tab-competitors"]'), wait('export_hint', '[data-tour-step="7"]'), click('skip_download', '.tour-actions .primary'), wait('connect_hint', '[data-tour-step="8"]'), click('integrations', '[data-tour="nav-8"]'), wait('connections_hint', '[data-tour-step="9"]'), click('next_connections', '.tour-actions .primary'), wait('back_social_hint', '[data-tour-step="10"]'), click('back_social', '[data-tour="nav-7"]'), wait('snapshots_hint', '[data-tour-step="11"]'), click('snapshots', '[data-tour="tab-api-snapshots"]'), wait('import_hint', '[data-tour-step="12"]'), click('next_import', '.tour-actions .primary'), wait('audit_hint', '[data-tour-step="13"]'), click('audit', '[data-tour="nav-3"]'), wait('report_hint', '[data-tour-step="14"]'), click('reports', '[data-tour="nav-6"]'), wait('claude_hint', '[data-tour-step="15"]'), click('tour_back', '.tour-actions .secondary'), wait('back_to_report_hint', '[data-tour-step="14"]'), click('next_to_claude', '.tour-actions .primary'), wait('last_hint', '[data-tour-step="15"]'), click('finish', '.tour-actions .primary'), wait('replay_available', '.tour-start'), click('replay', '.tour-start'), wait('restarted', '[data-tour-step="1"]'), click('close', '[aria-label="Close tour"]'), click('open_connections', '[data-tour="nav-8"]'), wait('seven_connections', '[data-pull="threads"]'),
  ] }]),
  ['native-snapshots', { ...common, start_url: { url: `${baseUrl}/#social-seo`, query: [] }, environment: { viewport: { width: 1440, height: 1080 } }, actions: [click('open_snapshots', '[data-tour="tab-api-snapshots"]'), wait('saved_snapshots', '.native-performance tbody tr:first-child'), fill('topic_filter', '[aria-label="Snapshot topic"]', 'balcony'), wait('filtered', '.native-performance tbody tr:first-child'), click('similar', '.native-performance tbody tr:first-child .text-button'), wait('comparison', '.native-comparison'), click('pull_history', '.native-pull-history summary')] }],
  ['performance-design', { ...common, start_url: { url: `${baseUrl}/?dataset=example#social-seo`, query: [] }, environment: { viewport: { width: 1440, height: 1080 } }, actions: [wait('overview', '.performance-kpis')] }],
  ['performance-design-mobile', { ...common, start_url: { url: `${baseUrl}/?dataset=example#social-seo`, query: [] }, environment: { viewport: { width: 390, height: 844 } }, actions: [wait('overview', '.performance-kpis')] }],
  ['desktop', { ...common, environment: { viewport: { width: 1440, height: 1080 } }, actions: [wait('overview', '.chart svg')] }],
  ['mobile', { ...common, environment: { viewport: { width: 390, height: 844 } }, actions: [wait('overview', '.chart svg')] }],
  ['social', { ...common, environment: { viewport: { width: 1440, height: 1080 } }, actions: socialActions }],
  ['social-mobile', { ...common, environment: { viewport: { width: 390, height: 844 } }, actions: socialActions }],
  ['performance-import', { ...common, environment: { viewport: { width: 1440, height: 1080 } }, actions: importActions }],
  ['flows', { ...common, environment: { viewport: { width: 1440, height: 1080 } }, actions: [
    wait('ready', '.chart svg'), click('keywords', 'nav button:nth-child(2)'), click('research', '.inline-form button'), wait('keyword_rows', 'tbody tr:first-child'),
    click('track', 'tbody tr:first-child button'), wait('saved_project', '#project'),
    click('backlinks', 'nav button:nth-child(3)'), wait('link_rows', 'tbody tr:first-child'),
    click('audit', 'nav button:nth-child(4)'), click('audit_run', '.audit-actions .primary'), wait('audit_results', '.audit-score'),
    click('ranks', 'nav button:nth-child(5)'), wait('saved_rank', 'tbody tr:first-child'),
    { step_id: 'reload_ranks', action: 'goto', destination: { url: `${baseUrl}/#rank-tracking`, query: [] }, wait_until: 'load', timeout_ms: 10000 },
    wait('persisted_rank', 'tbody tr:first-child'), click('competitors', 'nav button:nth-child(6)'), wait('comparison', 'tbody tr:first-child .overlap'),
    click('reports', 'nav button:nth-child(7)'), click('build_report', '.report-card button'), wait('report_preview', '.report-preview'),
    click('download_report', '.report-preview .primary'),
  ] }],
];
let failures = 0;
for (const [name, scenario] of scenarios.filter(([name]) => !process.env.QA_SCENARIO || process.env.QA_SCENARIO === name)) {
  const input = resolve(`artifacts/${name}-scenario.json`);
  writeFileSync(input, JSON.stringify(scenario));
  const npxCli = process.env.NPX_CLI_PATH || resolve(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  const result = spawnSync(process.execPath, [npxCli, '-y', 'rea-agents@6.4.0', 'capture-browser-scenario', input, '--format', 'json'], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 120000 });
  writeFileSync(`artifacts/${name}-raw.txt`, result.stdout || '');
  writeFileSync(`artifacts/${name}-stderr.txt`, result.stderr || '');
  const output = (result.stdout || '').trim(); const start = output.indexOf('{');
  if (start < 0) { failures++; console.log(JSON.stringify({ name, error: 'No JSON result', status: result.status })); continue; }
  let evidence;
  try { evidence = JSON.parse(output.slice(start)); } catch { failures++; console.log(JSON.stringify({ name, error: 'Unparseable result', status: result.status })); continue; }
  writeFileSync(`artifacts/${name}-evidence.json`, JSON.stringify(evidence, null, 2));
  // Error envelopes may retain useful partial observations; never call them complete Evidence.
  const partial = evidence.details?.partial_observation;
  const capture = partial?.capture || evidence.normalized_result || evidence.result || evidence;
  const steps = capture.steps || capture.capture?.steps || [];
  let screenshots = 0;
  function extract(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (value.media_type === 'image/png' && value.data_base64) {
      writeFileSync(`artifacts/${name}-${screenshots++}.png`, Buffer.from(value.data_base64, 'base64'));
      return;
    }
    for (const [key, child] of Object.entries(value)) extract(child, `${path}.${key}`);
  }
  extract(evidence);
  const passed = result.status === 0 && !evidence.code && steps.length > 0 && steps.every(s => s.status === 'completed') && !(capture.events?.items || []).some(e => /page.?error/i.test(e.type || e.kind || ''));
  if (!passed) failures++;
  console.log(JSON.stringify({ name, passed, status: result.status, evidence_id: evidence.id || evidence.evidence_id, error: evidence.code || null, screenshots, steps: steps.map(s => ({ id: s.step_id, status: s.status, error: s.error })), events: capture.events, limitations: capture.limitations }));
}
process.exitCode = failures ? 1 : 0;
