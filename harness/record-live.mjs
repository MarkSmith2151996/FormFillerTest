// Record one live (Custodian/Steel) run as results/live/<V>/<slug>.json.
// usage: node harness/record-live.mjs <<'EOF' { ...json... } EOF
// Input JSON:
//   version, form, outcome, needs_human[], notes, field_map{}, screenshot (PC path), steel_session,
//   readback: compact string from __ffReadback.compact(profile, true) ("rows=N\nk~st~detail~same" lines),
//   guard: {submit_attempt, telemetry, write_blocked, log?},
//   calls: ["E:b:1200:350", "S:h:0:180:1920x993", ...]   tool:role:args_chars:out_chars[:WxH]
//      tool E=evaluate_js N=navigation (evaluate_js) S=screenshot_page R=read_page B=browse_page
//           T=type_text L=select_option C=click_element K=press_key X=close_page
//      role b=brain (the version's own call) h=harness (guard/injection/readback/evidence)
//   started_at, ended_at (ISO)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokensFor } from './ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = { E: 'evaluate_js', N: 'evaluate_js(navigate)', S: 'screenshot_page', R: 'read_page', B: 'browse_page', T: 'type_text', L: 'select_option', C: 'click_element', K: 'press_key', X: 'close_page' };
const inp = JSON.parse(fs.readFileSync(0, 'utf8'));
const calls = (inp.calls || []).map((c) => {
  if (typeof c !== 'string') return c;
  const [t, role, a, o, img] = c.split(':');
  return { cmd: TOOLS[t] || t, role: role === 'h' ? 'harness' : 'brain', args_chars: +a || 0, out_chars: +o || 0, image: img ? img.split('x').map(Number) : null };
});
let readback = inp.readback;
if (typeof readback === 'string') {
  readback = readback.split('\n').filter((l) => l && !l.startsWith('rows=')).map((l) => {
    const [k, st, d, same] = l.split('~');
    const r = { k, st };
    if (st === 'profile') r.key = d; else if (st === 'choice') r.opt = d; else if (st === 'text') { if (/^len\d+$/.test(d)) r.len = +d.slice(3); else r.value = d; }
    if (same === 'same') r.same = true;
    return r;
  });
}
const ledger = { calls, ...tokensFor(calls) };
ledger.tool_calls = ledger.brain_calls;
if (inp.started_at && inp.ended_at) ledger.wall_ms = new Date(inp.ended_at) - new Date(inp.started_at);
const res = {
  version: inp.version, form: inp.form, mode: 'live', profile: 'real (injected at runtime, never stored)', transport: 'Custodian MCP -> Steel (wsl-steel)',
  outcome: inp.outcome, needs_human: inp.needs_human || [], notes: inp.notes || '', field_map: inp.field_map || {},
  readback, guard: inp.guard || {}, screenshot: inp.screenshot || null, steel_session: inp.steel_session || null,
  ledger, started_at: inp.started_at, ended_at: inp.ended_at,
};
const dir = path.join(ROOT, 'results/live', inp.version);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${inp.form}.json`), JSON.stringify(res, null, 1));
console.log(`results/live/${inp.version}/${inp.form}.json | ${inp.outcome} | brain calls ${ledger.brain_calls} | ~${ledger.token_est} tokens | harness ~${Math.ceil(ledger.harness_chars / 3.5)}`);
