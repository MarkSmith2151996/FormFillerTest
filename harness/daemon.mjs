// Offline (cloud-VM) harness daemon.
// - serves fixtures/ on 127.0.0.1:7800 (refuses and logs any non-GET: a last line of defence)
// - owns every browser context: route guard + in-page guard + readback are installed BELOW the brain
// - exposes the three toolkits to ./ff over 127.0.0.1:7801 and records a per-call ledger
// - on `report`: harness readback + evidence screenshot + guard log -> results/offline/<V>/<slug>.json
// Start: node harness/daemon.mjs   (profile: FF_PROFILE or profile/synthetic.json)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch } from './pw.mjs';
import { guardContext, guardSummary } from './guard.mjs';
import { tokensFor } from './ledger.mjs';
import { formToolkit } from '../versions/a_form_toolkit/tools.mjs';
import { visionToolkit, VISION_CONTEXT } from '../versions/c_vision/tools.mjs';
import { playwrightMcp } from '../versions/b_playwright_mcp/bridge.mjs';
import { deriveProfile } from '../profile/loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX_PORT = +(process.env.FF_FIX_PORT || 7800);
const API_PORT = +(process.env.FF_API_PORT || 7801);
const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'forms.json'), 'utf8')).forms;
const profileBase = JSON.parse(fs.readFileSync(process.env.FF_PROFILE || path.join(ROOT, 'profile/synthetic.json'), 'utf8'));
const profile = deriveProfile(profileBase);
const readbackSrc = fs.readFileSync(path.join(ROOT, 'harness/inpage/readback.js'), 'utf8');
const serverLog = [];

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    serverLog.push({ layer: 'fixture-server', t: Date.now(), kind: req.method, cls: 'submit_attempt', url: req.url });
    res.writeHead(405); return res.end('blocked by bake-off fixture server');
  }
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.join(ROOT, 'fixtures')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}).listen(FIX_PORT, '127.0.0.1');

const browser = await launch();
const runs = new Map();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { browser.close().catch(() => {}).finally(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); });
const formOf = (id) => (String(id).startsWith('_') ? { n: 0, slug: id, name: id } : forms.find((f) => f.slug === id || f.slug.startsWith(`${id}-`) || String(f.n) === String(Number(id))));

async function getRun(V, form) {
  const key = `${V}:${form.slug}`;
  if (runs.has(key)) return runs.get(key);
  const log = [];
  const context = await browser.newContext(V === 'C' ? VISION_CONTEXT : { viewport: { width: 1280, height: 900 } });
  await guardContext(context, log);
  await context.addInitScript({ content: readbackSrc });
  const outDir = path.join(ROOT, 'results/offline', V);
  fs.mkdirSync(outDir, { recursive: true });
  const r = { V, form, context, log, ledger: [], t0: Date.now(), outDir, url: `http://127.0.0.1:${FIX_PORT}/fixtures/${form.slug}.html` };
  if (V === 'B') r.mcp = await playwrightMcp(context, { outputDir: path.join(ROOT, '.tmp/pwmcp', form.slug) });
  else {
    r.page = await context.newPage();
    r.tk = V === 'A' ? formToolkit(r.page, { profileBase }) : visionToolkit(r.page, { profileBase, shotDir: path.join(ROOT, '.tmp/shots', form.slug) });
  }
  runs.set(key, r);
  return r;
}
const pageOf = (r) => r.page || r.context.pages().at(-1);
const baseline = (r) => pageOf(r).evaluate(() => window.__ffReadback && window.__ffReadback.baseline()).catch(() => 0);

function textOf(content, r) {
  const parts = [];
  for (const c of content || []) {
    if (c.type === 'text') parts.push(c.text);
    else if (c.type === 'image') {
      const file = path.join(ROOT, '.tmp/shots', r.form.slug, `B-${Date.now()}.${c.mimeType.includes('png') ? 'png' : 'jpg'}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(c.data, 'base64'));
      parts.push(`[image saved: ${path.relative(ROOT, file)}]`);
    }
  }
  return parts.join('\n');
}

async function finalize(r, a) {
  const page = pageOf(r);
  let own = {};
  if (r.V === 'A') own = JSON.parse(await r.tk.report(a.outcome, a.needs_human, a.notes));
  const readback = await page.evaluate((p) => window.__ffReadback.read(p, false), profile).catch((e) => [{ error: e.message }]);
  const shot = path.join(r.outDir, `${r.form.slug}.jpg`);
  await page.screenshot({ path: shot, type: 'jpeg', quality: 50, fullPage: true }).catch(() => {});
  const brainCalls = r.ledger.length + 1;
  const res = {
    version: r.V, form: r.form.slug, mode: 'offline', profile: 'synthetic',
    outcome: a.outcome, needs_human: a.needs_human || [], notes: a.notes || '',
    field_map: own.filled || a.field_map || {},
    readback,
    guard: guardSummary([...r.log, ...serverLog.filter((e) => e.t >= r.t0)]),
    screenshot: path.relative(ROOT, shot),
    ledger: { calls: [...r.ledger, { cmd: 'report', args_chars: JSON.stringify(a).length, out_chars: 60 }], tool_calls: brainCalls },
    started_at: new Date(r.t0).toISOString(), ended_at: new Date().toISOString(),
  };
  Object.assign(res.ledger, tokensFor(res.ledger.calls));
  res.ledger.wall_ms = Date.now() - r.t0;
  fs.writeFileSync(path.join(r.outDir, `${r.form.slug}.json`), JSON.stringify(res, null, 1));
  await r.context.close().catch(() => {});
  runs.delete(`${r.V}:${r.form.slug}`);
  return `report saved results/offline/${r.V}/${r.form.slug}.json | outcome=${a.outcome} | submit_attempt=${res.guard.submit_attempt} | calls=${brainCalls} | tokens~${res.ledger.token_est}`;
}

async function handle({ V, form: fid, cmd, args }) {
  const form = formOf(fid);
  if (!form) throw new Error(`unknown form ${fid}`);
  if (!['A', 'B', 'C'].includes(V)) throw new Error('version must be A, B or C');
  if (cmd === 'reset') { const r = runs.get(`${V}:${form.slug}`); if (r) { await r.context.close(); runs.delete(`${V}:${form.slug}`); } return 'reset'; }
  const r = await getRun(V, form);
  if (cmd === 'report') return finalize(r, Array.isArray(args) ? { outcome: args[0], notes: args.slice(1).join(' ') } : args);
  const t = Date.now();
  let out; let image = null;
  if (V === 'A') {
    const tk = r.tk;
    if (cmd === 'open') { out = await tk.open(r.url); await baseline(r); }
    else if (cmd === 'snapshot') out = await tk.snapshot();
    else if (cmd === 'fill') out = await tk.fill(args);
    else if (cmd === 'choose') out = await tk.choose(args[0], args[1]);
    else if (cmd === 'check') out = await tk.check(args[0], args[1] ?? true);
    else if (cmd === 'next') out = await tk.next();
    else if (cmd === 'classify') out = await tk.classify();
    else if (cmd === 'screenshot') out = await tk.screenshot(path.join(r.outDir, `${form.slug}-view.jpg`));
    else throw new Error(`A has no command ${cmd} (open|snapshot|fill|choose|check|next|classify|screenshot|report)`);
  } else if (V === 'B') {
    if (cmd === 'open') { out = textOf(await r.mcp.call('browser_navigate', { url: r.url }), r); await baseline(r); }
    else if (cmd === 'tools') out = (await r.mcp.tools()).join(', ');
    else out = textOf(await r.mcp.call(cmd, Array.isArray(args) ? {} : args), r);
  } else {
    let s;
    if (cmd === 'open') { s = await r.tk.open(r.url); await baseline(r); }
    else if (cmd === 'shot') s = await r.tk.shot();
    else if (cmd === 'act') s = await r.tk.act(args);
    else throw new Error(`C has no command ${cmd} (open|shot|act|report)`);
    image = [s.w, s.h];
    out = `${s.acks ? `${s.acks}\n` : ''}screenshot ${path.relative(ROOT, s.file)} (${s.w}x${s.h})`;
  }
  r.ledger.push({ cmd, args_chars: args == null ? 0 : JSON.stringify(args).length, out_chars: out.length, image, ms: Date.now() - t });
  return out;
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', async () => {
    try { const out = await handle(JSON.parse(body || '{}')); res.end(JSON.stringify({ text: out })); }
    catch (e) { res.end(JSON.stringify({ text: `ERROR ${e.message.split('\n')[0]}`, error: true })); }
  });
}).listen(API_PORT, '127.0.0.1', () => console.log(`ff daemon: fixtures :${FIX_PORT}, api :${API_PORT}, profile ${profileBase._synthetic ? 'synthetic' : 'custom'}`));
