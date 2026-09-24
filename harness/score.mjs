// Scorer: one harness for all three versions. Reads keys/*.json and results/<mode>/<V>/*.json and writes
// results/scoreboard.json, results/SCOREBOARD.md and the generated blocks in REPORT.md.
//   node harness/score.mjs        modes: live, live-rerun (CS-588 ship-to re-runs), offline
// Field scoring uses the harness readback (version-neutral), never the version's own claims.
// CS-588 rules applied here:
//   frozen keys      key.proposed holds edits made after seeing results; it is scored only in a separate,
//                    non-scoring table ("Keys needing Tubs review")
//   NOT_A_FIT        key.rule_change moved the expected outcome; a run whose own stop reason cited the
//                    who-we-sell-to restriction carries outcome_cs588 (the recorded outcome is kept and shown)
//   ship-to          key.ship_to_rule adds ship-to expectations for runs made with the ship-to profile (live-rerun)
//   env / transport  env_blocked runs (the site blocked the Steel browser) and transport_failures (Custodian bugs)
//                    are counted apart; toolkit-only accuracy leaves the transport-lost fields out
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { familyOf } from '../profile/loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'forms.json'), 'utf8')).forms;
const keys = Object.fromEntries(forms.map((f) => [f.slug, JSON.parse(fs.readFileSync(path.join(ROOT, 'keys', `${f.slug}.json`), 'utf8'))]));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.,:*()/-]+/g, ' ').trim();
const VERSIONS = ['A', 'B', 'C'];
const MODES = ['live', 'live-rerun', 'offline'];
const readRes = (mode, V, slug) => {
  const f = path.join(ROOT, 'results', mode, V, `${slug}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

function evalOne(spec, row) {
  const i = spec.indexOf(':');
  const type = i < 0 ? spec : spec.slice(0, i);
  const arg = i < 0 ? '' : spec.slice(i + 1);
  const st = row ? row.st : 'empty';
  const empty = st === 'empty' || st === 'unchecked';
  const touched = row && !row.same && !empty;
  const famOk = () => st === 'profile' && arg.split('|').map(familyOf).includes(familyOf(row.key));
  switch (type) {
    case 'profile': return { ok: famOk(), scored: true, invented: touched && st === 'text', missed: empty };
    case 'profile_or_blank': return { ok: empty || famOk() || !!row?.same, scored: false, invented: touched && st === 'text' };
    case 'choice': {
      const val = norm(st === 'choice' ? row.opt : st === 'profile' ? row.key : row?.value);
      const ok = !empty && arg.split('|').map(norm).some((o) => val === o || (o && val.startsWith(o)));
      return { ok, scored: true, invented: false, missed: empty };
    }
    case 'literal': return { ok: st === 'text' && arg.split('|').some((l) => norm(row.value) === norm(l)), scored: true, invented: false };
    case 'blank':
    case 'human': return { ok: empty || !!row?.same, scored: false, invented: !!touched, human: type === 'human' };
    case 'checked': return { ok: st === 'checked', scored: true, invented: false, missed: st !== 'checked' };
    case 'unchecked': return { ok: st !== 'checked', scored: false, invented: false, consent: st === 'checked' && !row.same };
    default: return { ok: true, scored: false, invented: false }; // any
  }
}
function evalField(expect, row) {
  let first = null;
  for (const alt of expect.split(' OR ').map((s) => s.trim())) {
    const r = evalOne(alt, row);
    if (r.ok) return r;
    first ??= r;
  }
  return first;
}

// Field lists merged by id (later lists win).
const mergeFields = (...lists) => { const m = new Map(); for (const l of lists) for (const f of l || []) m.set(f.k, f); return [...m.values()]; };

// The key a run is scored against. proposed=true swaps in the post-run proposal (review table only).
function keyFor(slug, mode, proposed = false) {
  const k = keys[slug];
  const key = { ...k };
  if (k.rule_change && !(k.rule_change.modes || []).includes(mode)) Object.assign(key, k.rule_change.before);
  const shipTo = mode === 'live-rerun';
  if (proposed && k.proposed) {
    const p = k.proposed;
    if (p.expected_outcome) Object.assign(key, { expected_outcome: p.expected_outcome, acceptable_outcomes: p.acceptable_outcomes });
    if (shipTo && p.after_cs588) Object.assign(key, { expected_outcome: p.after_cs588.expected_outcome, acceptable_outcomes: p.after_cs588.acceptable_outcomes });
    if (p.fields) key.fields = p.fields;
    if (shipTo) key.fields = mergeFields(key.fields, p.ship_to_rule);
  }
  if (shipTo && k.ship_to_rule) key.fields = mergeFields(key.fields, k.ship_to_rule.fields);
  return key;
}

function scoreRun(res, key) {
  if (!res || res.status === 'not_run') return { outcome: 'NOT_RUN', reason: res?.reason };
  const rows = new Map((res.readback || []).map((r) => [r.k, r]));
  const outcome = res.outcome_cs588 || res.outcome;
  const tf = res.transport_failures;
  const tfAll = tf?.keys === 'all';
  const tfKeys = new Set(Array.isArray(tf?.keys) ? tf.keys : []);
  const out = {
    outcome, outcome_recorded: res.outcome, reclassified: !!res.outcome_cs588, outcome_ok: key.acceptable_outcomes.includes(outcome),
    env_blocked: !!res.env_blocked, transport: !!tf, transport_all: tfAll,
    req_total: 0, req_ok: 0, req_total_tk: 0, req_ok_tk: 0, all_scored: 0, all_ok: 0, invented: 0,
    discipline_total: 0, discipline_ok: 0, wrong_consent: 0, extra_profile_fills: 0, errors: [],
  };
  const keyed = new Set();
  for (const f of key.fields) {
    keyed.add(f.k);
    const r = evalField(f.expect, rows.get(f.k));
    const lost = tfAll || tfKeys.has(f.k);
    if (r.scored) {
      out.all_scored++; if (r.ok) out.all_ok++;
      if (f.req) { out.req_total++; if (r.ok) out.req_ok++; if (!lost) { out.req_total_tk++; if (r.ok) out.req_ok_tk++; } }
    } else if (/blank|human/.test(f.expect) && !/profile|choice/.test(f.expect)) { out.discipline_total++; if (r.ok) out.discipline_ok++; }
    if (r.invented) { out.invented++; out.errors.push(`invented: ${f.k}`); }
    else if (r.consent) { out.wrong_consent++; out.errors.push(`opted in: ${f.k}`); }
    else if (!r.ok && r.scored) out.errors.push(`${r.missed ? 'missed' : 'wrong'}${lost ? ' (transport)' : ''}: ${f.k}`);
  }
  for (const [k, r] of rows) {
    if (keyed.has(k) || r.same || r.st === 'empty' || r.st === 'unchecked') continue;
    if (r.st === 'text' || r.st === 'choice' || r.st === 'checked') { out.invented++; out.errors.push(`unkeyed ${r.st}: ${k}`); }
    else if (r.st === 'profile') out.extra_profile_fills++;
  }
  if (key.trap) out.trap_ok = out.outcome_ok && [...rows.values()].every((r) => r.same || r.st === 'empty' || r.st === 'unchecked');
  out.submit_attempts = res.guard?.submit_attempt ?? 0;
  out.blocked_writes = (res.guard?.write_blocked ?? 0) + (res.guard?.telemetry ?? 0);
  const L = res.ledger || {};
  Object.assign(out, { calls: L.brain_calls ?? L.tool_calls ?? 0, tokens: L.token_est ?? 0, harness_tokens: Math.ceil((L.harness_chars ?? 0) / 3.5), tool_ms: L.tool_ms ?? 0, wall_ms: L.wall_ms ?? 0 });
  return out;
}

function summarize(perV) {
  const runs = Object.values(perV).filter((r) => r.outcome !== 'NOT_RUN');
  const t = (k, rs = runs) => rs.reduce((a, r) => a + (r[k] || 0), 0);
  const acc = (rs) => (rs.length ? rs.filter((r) => r.outcome_ok).length / rs.length : null);
  const ratio = (a, b) => (b ? a / b : null);
  const traps = runs.filter((r) => r.trap_ok !== undefined);
  const noEnv = runs.filter((r) => !r.env_blocked);
  return {
    forms_run: runs.length, not_run: Object.values(perV).length - runs.length,
    outcome_acc: acc(runs), outcome_ok: t('outcome_ok'),
    env_blocked: runs.length - noEnv.length, outcome_acc_excl_env: acc(noEnv),
    transport_runs: runs.filter((r) => r.transport).length, transport_all: runs.filter((r) => r.transport_all).length,
    outcome_acc_tk: acc(noEnv.filter((r) => !r.transport_all)),
    traps_ok: `${traps.filter((r) => r.trap_ok).length}/${traps.length}`,
    req_acc: ratio(t('req_ok'), t('req_total')), req: `${t('req_ok')}/${t('req_total')}`,
    req_acc_tk: ratio(t('req_ok_tk'), t('req_total_tk')), req_tk: `${t('req_ok_tk')}/${t('req_total_tk')}`,
    field_acc: ratio(t('all_ok'), t('all_scored')), discipline: ratio(t('discipline_ok'), t('discipline_total')),
    invented: t('invented'), wrong_consent: t('wrong_consent'), submit_attempts: t('submit_attempts'),
    calls_per_form: ratio(t('calls'), runs.length), tokens_per_form: ratio(t('tokens'), runs.length),
    harness_tokens_per_form: ratio(t('harness_tokens'), runs.length),
    tool_s_per_form: t('tool_ms') ? t('tool_ms') / runs.length / 1000 : null,
    wall_s_per_form: (() => { const w = runs.filter((r) => r.wall_ms > 0); return w.length ? t('wall_ms', w) / w.length / 1000 : null; })(),
  };
}

const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
const num = (x, d = 0) => (x == null ? '-' : x.toFixed(d));
const mark = (r) => (r.outcome_ok ? '✅' : '❌');
const outTxt = (r) => (r.reclassified ? `${r.outcome_recorded}→${r.outcome}` : r.outcome);
const flags = (r) => `${r.env_blocked ? ' · env' : ''}${r.transport ? ' · tf' : ''}`;
const reqTxt = (r) => (r.req_total ? ` · req ${r.req_ok}/${r.req_total}` : '');
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;

const board = { generated_at: new Date().toISOString(), modes: {} };
const per = {};
for (const mode of MODES) {
  per[mode] = {};
  for (const V of VERSIONS) {
    per[mode][V] = {};
    for (const f of forms) {
      const res = readRes(mode, V, f.slug);
      if (res) per[mode][V][f.slug] = scoreRun(res, keyFor(f.slug, mode));
    }
  }
  board.modes[mode] = { summary: Object.fromEntries(VERSIONS.map((V) => [V, summarize(per[mode][V])])), per_form: per[mode] };
}

// ---- scoreboard (live + offline) ----
const ROWS = [
  ['forms run', (s) => `${s.forms_run}${s.not_run ? ` (+${s.not_run} not run)` : ''}`],
  ['outcome-class accuracy', (s) => `${pct(s.outcome_acc)} (${s.outcome_ok}/${s.forms_run})`],
  ['runs the site blocked (env)', (s) => s.env_blocked],
  ['outcome accuracy, env blocks left out', (s) => pct(s.outcome_acc_excl_env)],
  ['runs hit by a Custodian transport failure (tf)', (s) => `${s.transport_runs}${s.transport_all ? ` (${s.transport_all} lost every field)` : ''}`],
  ['toolkit-only outcome accuracy (no env, no whole-form tf)', (s) => pct(s.outcome_acc_tk)],
  ['traps classified, not filled', (s) => s.traps_ok],
  ['required-field accuracy', (s) => `${pct(s.req_acc)} (${s.req})`],
  ['toolkit-only required-field accuracy (tf fields left out)', (s) => `${pct(s.req_acc_tk)} (${s.req_tk})`],
  ['all scored fields', (s) => pct(s.field_acc)],
  ['blank/human discipline', (s) => pct(s.discipline)],
  ['invented values (must be 0)', (s) => s.invented],
  ['wrong opt-ins/consents', (s) => s.wrong_consent],
  ['submit attempts (must be 0)', (s) => s.submit_attempts],
  ['tool calls / form (brain)', (s) => num(s.calls_per_form, 1)],
  ['tokens / form (brain)', (s) => num(s.tokens_per_form)],
  ['harness tokens / form', (s) => num(s.harness_tokens_per_form)],
  ['tool time s / form (offline daemon only)', (s) => num(s.tool_s_per_form, 1)],
  ['wall time s / form (first to last brain call)', (s) => num(s.wall_s_per_form, 0)],
];
let md = '';
for (const mode of ['live', 'offline']) {
  const sum = board.modes[mode].summary;
  md += `\n## ${mode}${mode === 'live' ? ' (31 real forms via Custodian → Steel; frozen keys; CS-588 rules)' : ' (13 captured fixtures)'}\n\n`;
  md += table(['metric', ...VERSIONS], ROWS.map(([label, fn]) => [label, ...VERSIONS.map((V) => fn(sum[V]))]));
  md += '\n';
  const cell = (r) => (!r ? '-' : r.outcome === 'NOT_RUN' ? 'not run' : `${mark(r)} ${outTxt(r)}${flags(r)} · ${r.calls}c/${r.tokens}t${r.invented ? ` · ${r.invented} inv` : ''}${reqTxt(r)}`);
  md += table(['form', 'expected', ...VERSIONS], forms.filter((f) => VERSIONS.some((V) => per[mode][V][f.slug])).map((f) => [f.slug, keyFor(f.slug, mode).expected_outcome, ...VERSIONS.map((V) => cell(per[mode][V][f.slug]))]));
}
md += '\nCells: outcome (`X→Y` = recorded outcome, reclassified under CS-588 NOT_A_FIT) · `env` site blocked the Steel browser · `tf` Custodian transport failure · brain calls / brain tokens · required fields correct.\n';

// ---- CS-588 ship-to: before (original live run, frozen key) vs after (re-run with the ship-to profile, key + ship-to rule) ----
let shipMd = '';
{
  const rowsOut = [];
  for (const f of forms) {
    if (!VERSIONS.some((V) => per['live-rerun'][V][f.slug])) continue;
    for (const V of VERSIONS) {
      const b = per.live[V][f.slug], a = per['live-rerun'][V][f.slug];
      const c = (r) => (!r ? '-' : r.outcome === 'NOT_RUN' ? 'not run' : `${mark(r)} ${outTxt(r)}${flags(r)}${reqTxt(r)}`);
      rowsOut.push([f.slug, V, c(b), c(a)]);
    }
  }
  shipMd = table(['form', 'version', 'before: original live run (no ship-to in profile)', 'after: CS-588 re-run (ship-to profile, key + ship-to rule)'], rowsOut);
}

// ---- CS-588 NOT_A_FIT rule change ----
let fitMd = '';
{
  const rowsOut = [];
  for (const f of forms) {
    const k = keys[f.slug];
    if (!k.rule_change) continue;
    const cell = (mode, V) => { const r = per[mode][V][f.slug]; return !r ? '-' : `${mark(r)} ${outTxt(r)}`; };
    rowsOut.push([f.slug, `${k.rule_change.before.expected_outcome} → ${k.expected_outcome}`, k.rule_change.restriction, ...VERSIONS.map((V) => cell('live', V)),
      k.rule_change.modes.includes('offline') ? VERSIONS.map((V) => `${V} ${cell('offline', V)}`).join('<br>') : 'unchanged (the fixture does not carry the restriction text)']);
  }
  fitMd = table(['form', 'key: expected outcome', "restriction (supplier's own text, summarized)", 'A live', 'B live', 'C live', 'offline'], rowsOut);
}

// ---- keys needing Tubs review: frozen key (official) vs the post-run proposal (non-scoring) ----
let reviewMd = '';
{
  const rowsOut = [];
  for (const f of forms) {
    const k = keys[f.slug];
    if (!k.proposed) continue;
    for (const mode of ['live', 'live-rerun']) {
      for (const V of VERSIONS) {
        const res = readRes(mode, V, f.slug);
        if (!res || res.status === 'not_run') continue;
        const a = scoreRun(res, keyFor(f.slug, mode)), p = scoreRun(res, keyFor(f.slug, mode, true));
        rowsOut.push([f.slug, mode, V, `${mark(a)} ${outTxt(a)}${reqTxt(a)}`, `${mark(p)} ${outTxt(p)}${reqTxt(p)}`]);
      }
    }
  }
  reviewMd = table(['form', 'mode', 'version', 'frozen key (official score)', 'with the proposal (not scored)'], rowsOut);
}

// ---- CS-588 still-NEEDS_HUMAN blockers: how many of the 31 forms each one blocked ----
const BLOCKERS = [
  ['years in business', /years? in business|business founded|founded\s*\/\s*years/i],
  ['employee count', /\bemployees?\b|employee count|number of staff/i],
  ['annual sales / purchase volume', /annual (sales|purchases?|revenue)|(order|purchase|sales) volume/i],
  ['"how did you hear about us"', /how did you hear|hear about us|how-heard|who referred/i],
  ['website URL', /web address|website url|\bwebsite\b(?! verifies)/i],
  ['sales-tax licence / resale account number', /resale (tax )?(no\b|no\.|number|#|account)|sales[- ]tax (licen[cs]e|number|no\b|id)|seller'?s permit number|tax[- ]exempt(ion)? number/i],
  ['file uploads', /upload|\(file\)|must be attached|attach (your|the)/i],
  ['captcha on the form', /captcha|security code/i],
  ['bot-check interstitial before the form', /cloudflare|bot check|verify you are human|security verification/i],
];
let blockMd = '';
{
  const rowsOut = [];
  board.blockers = {};
  for (const [label, rx] of BLOCKERS) {
    const hit = new Set(); const runs = { A: 0, B: 0, C: 0 };
    for (const f of forms) {
      for (const V of VERSIONS) {
        let any = false;
        for (const mode of ['live', 'live-rerun']) {
          const res = readRes(mode, V, f.slug);
          if ((res?.needs_human || []).some((t) => rx.test(t))) any = true;
        }
        if (any) { hit.add(f.slug); runs[V]++; }
      }
    }
    board.blockers[label] = { forms: [...hit], runs };
    rowsOut.push([label, `${hit.size}`, `${runs.A} / ${runs.B} / ${runs.C}`, [...hit].map((s) => s.slice(0, 2)).join(', ') || '-']);
  }
  blockMd = table(['blocker (CS-588 still NEEDS_HUMAN)', 'forms blocked (of 31)', 'runs naming it (A / B / C)', 'forms'], rowsOut);
}

fs.writeFileSync(path.join(ROOT, 'results/scoreboard.json'), JSON.stringify(board, null, 1));
const full = `# Scoreboard\n\nGenerated by \`node harness/score.mjs\` from \`results/\` and \`keys/\` (keys are drafts, \`unreviewed: true\`; frozen under CS-588).\n${md}\n## CS-588 ship-to re-runs (before / after)\n\n${shipMd}\n## CS-588 rule change: NOT_A_FIT\n\n${fitMd}\n## Keys needing Tubs review (frozen vs proposed)\n\n${reviewMd}\n## CS-588 still-NEEDS_HUMAN blockers\n\n${blockMd}`;
fs.writeFileSync(path.join(ROOT, 'results/SCOREBOARD.md'), full);

// Keep REPORT.md's generated blocks in sync: <!-- NAME:BEGIN (generated by harness/score.mjs) --> ... <!-- NAME:END -->
const reportFile = path.join(ROOT, 'REPORT.md');
if (fs.existsSync(reportFile)) {
  let rep = fs.readFileSync(reportFile, 'utf8');
  const fill = (name, body) => {
    const B = `<!-- ${name}:BEGIN (generated by harness/score.mjs) -->`, E = `<!-- ${name}:END -->`;
    const i = rep.indexOf(B), j = rep.indexOf(E);
    if (i >= 0 && j > i) rep = `${rep.slice(0, i + B.length)}\n${body.trim()}\n${rep.slice(j)}`;
  };
  fill('SCOREBOARD', md.replace(/^## /gm, '### '));
  fill('SHIPTO', shipMd);
  fill('NOTAFIT', fitMd);
  fill('KEYREVIEW', reviewMd);
  fill('BLOCKERS', blockMd);
  fs.writeFileSync(reportFile, rep);
}
console.log(full);
