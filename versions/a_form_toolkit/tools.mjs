// Version A tool implementations over a Playwright Page. Shared by the MCP server (production) and
// the bake-off daemon (offline CLI). All form logic lives in runtime/ft.js, which runs in the page,
// so the same code also runs when the page is only reachable through Custodian evaluate_js (live Steel).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveSource } from '../../profile/loader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ftBundle = `${deriveSource}\n${fs.readFileSync(path.join(here, 'runtime/ft.js'), 'utf8')}`;

export function formToolkit(page, { profileBase }) {
  async function ensure() {
    const ok = await page.evaluate(() => !!(window.__ft && window.__ft.v)).catch(() => false);
    if (!ok) {
      await page.evaluate(ftBundle);
      await page.evaluate((b) => window.__ft.setProfile(b), profileBase);
    }
  }
  async function settle() { await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {}); }
  const ev = async (fn, arg) => { await ensure(); return page.evaluate(fn, arg); };
  return {
    // open_form: navigate, then return the form snapshot (saves a call: drivers always snapshot next)
    async open(url) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(); return ev(() => window.__ft.snapshot({ wait: 4000 })); },
    snapshot: () => ev(() => window.__ft.snapshot({ wait: 2000 })),
    fill: (spec) => ev((s) => window.__ft.fill(s), spec),
    choose: (id, option) => ev(([i, o]) => window.__ft.choose(i, o), [id, option]),
    check: (id, on = true) => ev(([i, o]) => window.__ft.check(i, o), [id, on]),
    async next() {
      const out = await ev(() => window.__ft.next());
      await settle();
      const alive = await page.evaluate(() => !!window.__ft).catch(() => false);
      return alive ? out : `${out.split('\n')[0]}\n(page navigated)\n${await ev(() => window.__ft.snapshot({ wait: 4000 }))}`;
    },
    classify: () => ev(() => window.__ft.classify()),
    async screenshot(file) { await page.screenshot({ path: file, type: 'jpeg', quality: 55, fullPage: true }); return `saved ${file}`; },
    report: (outcome, needs, notes) => ev(([o, n, t]) => window.__ft.report(o, n, t), [outcome, needs, notes]),
  };
}
