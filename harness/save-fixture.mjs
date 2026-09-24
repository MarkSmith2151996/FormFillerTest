// Save a captured form region (harness/inpage/capture.js output) as fixtures/<slug>.html.
// usage: node harness/save-fixture.mjs <slug> <<'EOF'
//        <html from __ffCapture().html>
//        EOF
import fs from 'fs';

const slug = process.argv[2];
const forms = JSON.parse(fs.readFileSync(new URL('../forms.json', import.meta.url), 'utf8')).forms;
const form = forms.find((f) => f.slug === slug);
if (!form) { console.error(`unknown slug ${slug}`); process.exit(2); }
const html = fs.readFileSync(0, 'utf8').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const doc = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(form.name)} (fixture)</title><link rel="stylesheet" href="fixture.css"></head>
<body><!-- fixture: ${slug} | source: ${esc(form.url)} | captured ${new Date().toISOString().slice(0, 10)} via Steel (harness/inpage/capture.js): application form region only, no scripts/styles -->
<main>
${html}
</main></body></html>
`;
fs.writeFileSync(new URL(`../fixtures/${slug}.html`, import.meta.url), doc);
const controls = (html.match(/<(input|select|textarea)\b/g) || []).length;
console.log(`fixtures/${slug}.html ${doc.length} bytes, ${controls} controls`);
