// Print the version-neutral readback rows of a fixture (k | type | req | label) to draft keys/<slug>.json.
// usage: node harness/key-skeleton.mjs <slug> [...]
import fs from 'fs';
import { launch } from './pw.mjs';
const rb = fs.readFileSync(new URL('./inpage/readback.js', import.meta.url), 'utf8');
const browser = await launch();
for (const slug of process.argv.slice(2)) {
  const page = await browser.newPage();
  await page.goto(`file://${new URL(`../fixtures/${slug}.html`, import.meta.url).pathname}`);
  await page.evaluate(rb);
  const rows = await page.evaluate(() => window.__ffReadback.read({}, false));
  console.log(`== ${slug} (${rows.length})`);
  for (const r of rows) console.log(`${r.k} | ${r.type}${r.req ? '*' : ''} | ${r.label}${r.st !== 'empty' && r.st !== 'unchecked' ? ` | PRESET ${r.st} ${r.opt || r.value || ''}` : ''}`);
  await page.close();
}
await browser.close();
