// Builds the live-injection bundles pasted into Custodian evaluate_js on Steel (no route interception
// there, so the in-page guard is the submit guard). Minified to keep every paste (= driver output
// tokens) small. Output: harness/live/*.min.js
//   capture.min.js  guard + fixture capture              (harness, fixture recording)
//   hA.min.js       derive + guard + readback + ft (A)   (harness injection, then A drives __ft)
//   hB.min.js       derive + guard + readback            (harness injection; B drives Custodian's own tools)
//   hC.min.js       derive + guard + readback + cv (C)   (harness injection, then C drives __cv)
import fs from 'fs';
import { transformSync } from 'esbuild';
const r = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const parts = { derive: r('profile/derive.js'), guard: r('harness/inpage/guard.js'), readback: r('harness/inpage/readback.js'), capture: r('harness/inpage/capture.js'), ft: r('versions/a_form_toolkit/runtime/ft.js'), cv: r('versions/c_vision/runtime/cv.js') };
const bundles = { capture: ['guard', 'capture'], hA: ['derive', 'guard', 'readback', 'ft'], hB: ['derive', 'guard', 'readback'], hC: ['derive', 'guard', 'readback', 'cv'] };
fs.mkdirSync(new URL('./live/', import.meta.url), { recursive: true });
for (const [name, list] of Object.entries(bundles)) {
  const { code } = transformSync(list.map((k) => parts[k]).join('\n;\n'), { minify: true, target: 'es2019', legalComments: 'none' });
  fs.writeFileSync(new URL(`./live/${name}.min.js`, import.meta.url), code.trim());
  console.log(`${name}.min.js ${code.length} bytes`);
}
// Parts for pasting through Custodian evaluate_js with the function-wrapper trick
// ('(' + (function(){ <part> }).toString() + ')()' is kept in window.name), each small enough to copy in one go.
//   pH.min.js  derive + guard + readback (+ exposes window.ffDeriveProfile)   -> every live session
//   pA.min.js  Version A runtime (window.__ft)                                  -> A session
//   pC.min.js  Version C helper  (window.__cv)                                  -> C session
const partSpec = { pH: ['derive', 'guard', 'readback'], pA: ['ft'], pC: ['cv'] };
for (const [name, list] of Object.entries(partSpec)) {
  let src = list.map((k) => parts[k]).join('\n;\n');
  if (name === 'pH') src += '\n;window.ffDeriveProfile = ffDeriveProfile;';
  const { code } = transformSync(src, { minify: true, target: 'es2019', legalComments: 'none', supported: { 'template-literal': false } });
  fs.writeFileSync(new URL(`./live/${name}.min.js`, import.meta.url), code.trim());
  console.log(`${name}.min.js ${code.length} bytes${/`/.test(code) ? ' (has backtick!)' : ''}`);
}
