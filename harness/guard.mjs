// Submit guard for cloud-VM Playwright runs: enforced in the browser context, BELOW the brain.
// Layer 1 (network): Playwright route interception aborts every POST/PUT/PATCH/DELETE once the first
//   page load has finished, and logs it. A blocked navigation POST is a native form submission.
// Layer 2 (page): harness/inpage/guard.js as an init script (submit events, form.submit(), fetch/XHR,
//   sendBeacon, WebSocket.send); its console records are collected into the same log.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const guardSource = fs.readFileSync(path.join(here, 'inpage/guard.js'), 'utf8');
const TELEM = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|klaviyo|monorail|shopifysvc|web-pixels|clarity\.ms|tiktok|sentry|newrelic|nr-data|datadog|amplitude|mixpanel|pixel|beacon|\/collect|telemetry|\/track/i;

export async function guardContext(context, log) {
  let armed = false;
  const arm = (page) => page.once('load', () => { armed = true; });
  context.pages().forEach(arm);
  context.on('page', (page) => {
    arm(page);
    page.on('console', (m) => {
      const t = m.text();
      if (t.startsWith('FFGUARD ')) { try { log.push({ layer: 'page', ...JSON.parse(t.slice(8)) }); } catch {} }
    });
  });
  await context.addInitScript({ content: guardSource });
  await context.route('**/*', (route) => {
    const req = route.request();
    const m = req.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || !armed) return route.continue();
    const nav = req.isNavigationRequest();
    const url = req.url();
    log.push({ layer: 'route', t: Date.now(), kind: `${m} ${nav ? 'navigation' : req.resourceType()}`, cls: nav ? 'submit_attempt' : TELEM.test(url) ? 'telemetry' : 'write_blocked', url: url.slice(0, 160) });
    return route.abort('blockedbyclient');
  });
}

export function guardSummary(log) {
  const by = { submit_attempt: 0, telemetry: 0, write_blocked: 0 };
  for (const e of log) by[e.cls] = (by[e.cls] || 0) + 1;
  return { ...by, log };
}
