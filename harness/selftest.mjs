// Guard self-test (`npm test`): proves the submit guard stops every write path before it leaves the browser.
// Serves fixtures/ on an ephemeral local port, opens _selftest.html in a guarded context (harness/guard.mjs:
// route layer + in-page layer), then tries a submit-button click, form.submit(), requestSubmit(), a fetch
// POST, an XHR POST and sendBeacon. Passes only if the server received zero non-GET requests and the guard
// logged the attempts. No network beyond 127.0.0.1, no profile data.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch } from './pw.mjs';
import { guardContext, guardSummary } from './guard.mjs';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const writes = [];
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    writes.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('RECEIVED');
  }
  const name = path.basename(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = path.join(FIX, name);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launch();
const context = await browser.newContext();
const log = [];
await guardContext(context, log);
const page = await context.newPage();
await page.goto(`${base}/_selftest.html`, { waitUntil: 'load' });

const attempts = {
  // noValidate: otherwise the browser's required-field check stops the click before any submit event fires
  'click submit button': () => page.evaluate(() => { document.getElementById('app').noValidate = true; }).then(() => page.click('button[type=submit]')),
  'form.submit()': () => page.evaluate(() => document.getElementById('app').submit()),
  'form.requestSubmit()': () => page.evaluate(() => document.getElementById('app').requestSubmit()),
  'fetch POST': () => page.evaluate((u) => fetch(u, { method: 'POST', body: 'x=1' }).then(() => 'sent', (e) => 'rejected'), `${base}/api/apply`),
  'XHR POST': () => page.evaluate((u) => new Promise((r) => { const x = new XMLHttpRequest(); x.open('POST', u); x.onloadend = () => r(x.status); try { x.send('x=1'); } catch (e) { r('threw'); } }), `${base}/api/apply`),
  'sendBeacon': () => page.evaluate((u) => navigator.sendBeacon(u, 'x=1'), `${base}/collect`),
};
let failed = 0;
for (const [name, run] of Object.entries(attempts)) {
  const before = writes.length;
  try { await run(); } catch (e) { /* a blocked navigation may reject; that is fine */ }
  await page.waitForTimeout(300);
  const leaked = writes.length > before;
  if (leaked) failed++;
  console.log(`${leaked ? 'FAIL' : 'ok  '} ${name}${leaked ? ` -> server received ${writes.slice(before).join(', ')}` : ''}`);
}
const still = page.url().startsWith(`${base}/_selftest.html`);
if (!still) { failed++; console.log(`FAIL page navigated away to ${page.url()}`); }
const sum = guardSummary(log);
if (process.env.FF_DEBUG) console.log(log.map((e) => `${e.layer}:${e.kind}:${e.cls}`).join('\n'));
const inPage = await page.evaluate(() => (window.__ffGuard ? window.__ffGuard.log.length : -1));
console.log(`guard log: submit_attempt=${sum.submit_attempt} write_blocked=${sum.write_blocked} telemetry=${sum.telemetry} (in-page entries ${inPage})`);
if (sum.submit_attempt < 3) { failed++; console.log('FAIL expected the guard to log at least 3 submit attempts'); }
await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : `\nall ${Object.keys(attempts).length} write paths blocked; server received 0 writes`);
process.exit(failed ? 1 : 0);
