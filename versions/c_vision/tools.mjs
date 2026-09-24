// Version C tool implementations over a Playwright Page: screenshot-first, coordinate actions.
// The context runs at deviceScaleFactor 0.75, so a 1280x800 viewport screenshot is a 960x600 JPEG
// (about 770 image tokens) while actions still take CSS pixels, read off the labelled grid overlay.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveSource, deriveProfile, resolveTemplates } from '../../profile/loader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const cvBundle = `${deriveSource}\n${fs.readFileSync(path.join(here, 'runtime/cv.js'), 'utf8')}`;
export const VISION_CONTEXT = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.75 };

export function visionToolkit(page, { profileBase, shotDir }) {
  const profile = deriveProfile(profileBase);
  let n = 0;
  async function ensure() {
    const ok = await page.evaluate(() => !!window.__cv).catch(() => false);
    if (!ok) { await page.evaluate(cvBundle); await page.evaluate((b) => window.__cv.setProfile(b), profileBase); }
    await page.evaluate(() => window.__cv.grid());
  }
  async function shot(tag = 'shot') {
    await ensure();
    fs.mkdirSync(shotDir, { recursive: true });
    const file = path.join(shotDir, `${tag}-${String(++n).padStart(2, '0')}.jpg`);
    const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
    fs.writeFileSync(file, buf);
    const vp = page.viewportSize();
    return { file, w: Math.round(vp.width * 0.75), h: Math.round(vp.height * 0.75) };
  }
  const acks = async (list) => {
    const out = [];
    for (const a of list) {
      const [op, x, y, t] = a;
      try {
        if (op === 'click') { await page.mouse.click(+x, +y); out.push('ok'); }
        else if (op === 'type') { await page.keyboard.type(resolveTemplates(x, profile)); out.push('ok'); }
        else if (op === 'clear') { await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); out.push('ok'); }
        else if (op === 'key') { await page.keyboard.press(String(x)); out.push('ok'); }
        else if (op === 'scroll') { await page.mouse.wheel(0, +x); await page.waitForTimeout(250); out.push(`y=${await page.evaluate(() => Math.round(scrollY))}`); }
        // native <select> popups never render in headless screenshots: pick by visible text at a point
        else if (op === 'select') { out.push(await page.evaluate(([px, py, txt]) => window.__cv.act([['select', px, py, txt]]), [+x, +y, resolveTemplates(t, profile)])); }
        else out.push(`unknown ${op}`);
      } catch (e) { out.push(`ERR ${e.message.split('\n')[0]}`); }
    }
    return out.join(', ');
  };
  return {
    shot,
    async open(url) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForLoadState('load').catch(() => {}); return shot(); },
    async act(list) { const a = await acks(list); await page.waitForTimeout(300); return { acks: a, ...(await shot()) }; },
  };
}
