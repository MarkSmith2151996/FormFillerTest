# EE-1071 form-filler bake-off: report

Three ways for Claude Code to fill wholesale-account applications were built and run against the 31 forms in
`forms.json`, on one shared harness, profile loader, results schema and scorer:

| version | path | idea |
|---|---|---|
| **A** custom DOM toolkit | `versions/a_form_toolkit/` | an in-page runtime (`runtime/ft.js`) returns a compact field list (`f1..fn`, required, options, presets) and does verified batch fills, classification and safe next-step |
| **B** Playwright MCP, off the shelf | `versions/b_playwright_mcp/` | unmodified `@playwright/mcp` 0.0.82 over a guarded browser context: accessibility snapshot + one tool call per field |
| **C** vision | `versions/c_vision/` | screenshot with a labelled 100 px grid, then coordinate actions (`click x y`, `type`, `select x y "text"`, `scroll`) |

Claude Code (this session) was the only brain for all three. There is no model inside any toolkit and no LLM API
key anywhere (grep below).

TL;DR: **use Version A (custom DOM toolkit) in production, with Version C's screenshot loop as its fallback.**
On the 31 live forms (frozen keys, CS-588 rules) the three classified about equally well: outcome class right on
81% (A), 84% (B) and 83% (C) of forms, or 88 / 92 / 92% once the five site blocks are left out. Nothing was
submitted: 0 submit attempts in 137 scored runs. A was by far the cheapest: 2.6 brain calls and about 1,500 tokens per
form, against 3.8 calls and 3,900 tokens for C and 4.8 calls and 18,400 tokens for live B. C filled the most required
fields (80%, A 73%, B 62%). 28 of A's 30 missed required fields come from three toolkit gaps (chooser buttons,
unlinked labels, Salesforce Locker) that are code fixes. Live B lost 33 required fields to Custodian transport bugs and
scored 88% on the fields it could reach. No version typed a value that is not in the profile. Offline, on 13
captured fixtures, all three scored 100%.

## Contents

- [How it was run](#how-it-was-run)
- [Scoreboard](#scoreboard) (live and offline, per-form matrix)
- [CS-588 update](#cs-588-update) (ship-to, NOT_A_FIT, keys needing review, transport vs toolkit, still-NEEDS_HUMAN blockers, opt-outs)
- [Forms no version handled](#forms-no-version-handled)
- [Tool bugs hit](#tool-bugs-hit)
- [Recommendation](#recommendation)
- [Production plan](#production-plan)
- [Safety evidence](#safety-evidence)
- [Limitations](#limitations)
- [Repository map](#repository-map)

## How it was run

**Offline (fixtures).** 13 of the live pages were captured through Steel as self-contained HTML
(`fixtures/`, `harness/save-fixture.mjs`) and served locally. Each version ran every fixture in the VM's Chromium
with the synthetic profile (`profile/synthetic.json`) and the full two-layer submit guard
(`harness/guard.mjs`: Playwright route interception + in-page guard). Version B used the real `@playwright/mcp`
server here (`versions/b_playwright_mcp/bridge.mjs`), so offline B is the true off-the-shelf baseline.

**Live (real sites).** The cloud VM cannot reach the sites (outbound is blocked), so live runs went
Claude Code -> Custodian MCP -> Steel browser on the PC (node `wsl-steel`). All three Steel sessions resolve to the
same persistent tab (CDP port 3001), so versions ran one after another on each form, in a rotating order
(form *n* starts with version `(n-1) mod 3` of A, B, C) so no version always saw a page first. Every version got a
fresh navigation with site storage cleared. Custodian was unavailable from 15:35 to about 17:25 UTC; forms 18-31,
the rest of 17 and the CS-588 re-runs ran afterwards on a second Steel session.

- The dealer profile (`read_shared_file`) was injected at run time into page memory only. It was never written to
  disk in the VM or committed, and it was cleared from the page at the end of each run. Results store profile
  **keys** (`legal_name`, `zip`), never values.
- The harness code (guard, readback, toolkit runtime) reaches each page through `window.name`, cached on
  example.com (`harness/live/p{H,A,C}.min.js`, built by `harness/build-live.mjs`). Sites that clear `window.name`
  (Cloudflare interstitials, a COOP login page, partner.unfi.com) got it through the URL fragment instead,
  removed with `history.replaceState` before the version's first call.
- Live B could not use `@playwright/mcp` itself: its CDP endpoint (`ws://127.0.0.1:3001`) only exists on the PC.
  Live B therefore used Custodian's own accessibility-snapshot/ref tools (`read_page`, `type_text`,
  `select_option`, `click_element`), which is the same paradigm, but Custodian echoes the full page snapshot after
  every action. Live B's token counts are therefore an upper bound. Offline B shows the real `@playwright/mcp` cost.
- Scoring never trusts a version's own claims. After each run the harness reads every field back
  (`harness/inpage/readback.js`) and records, per field, whether it holds a profile value (and which key),
  another text value, a choice, or nothing. `harness/score.mjs` compares that with the answer key.
- **Ledger.** Brain calls are the version's own tool calls. Harness calls are counted separately and do not count
  against a version: navigation, injection, readback, evidence screenshots, and re-work caused by
  infrastructure (gateway 502s, dropped tabs, re-reads forced by a harness call).
  Tokens are text characters / 3.5 plus about 1,535 tokens per 1920x993 screenshot.

**Answer keys** (`keys/*.json`) are drafts marked `unreviewed: true`, frozen under CS-588: no key was changed to
match a result. Forms 02-16 were keyed from the fixtures before the runs, 01 and 12 from live reconnaissance. 17-31
got their outcome classes from the task hints before the runs; their field lists were drafted after the runs, in the
order CS-588 asked for, from the page structure and the fill rules (field ids come from the harness readbacks). The
only key changes after the runs are the two CS-588 allows: `NOT_A_FIT` (08, 09, 11, 15) and ship-to fields (10). Two
earlier post-run edits, Blair's field list and DHP's live override, now sit in a non-scoring `proposed` section and
are listed under [Keys needing Tubs review](#keys-needing-tubs-review).

## Scoreboard

<!-- SCOREBOARD:BEGIN (generated by harness/score.mjs) -->
### live (31 real forms via Custodian → Steel; frozen keys; CS-588 rules)

| metric | A | B | C |
|---|---|---|---|
| forms run | 31 | 31 | 30 (+1 not run) |
| outcome-class accuracy | 81% (25/31) | 84% (26/31) | 83% (25/30) |
| runs the site blocked (env) | 5 | 5 | 5 |
| outcome accuracy, env blocks left out | 88% | 92% | 92% |
| runs hit by a Custodian transport failure (tf) | 0 | 9 (4 lost every field) | 0 |
| toolkit-only outcome accuracy (no env, no whole-form tf) | 88% | 91% | 92% |
| traps classified, not filled | 4/6 | 4/6 | 4/6 |
| required-field accuracy | 73% (83/113) | 62% (70/113) | 80% (90/113) |
| toolkit-only required-field accuracy (tf fields left out) | 73% (83/113) | 88% (70/80) | 80% (90/113) |
| all scored fields | 77% | 60% | 82% |
| blank/human discipline | 100% | 100% | 100% |
| invented values (must be 0) | 1 | 1 | 0 |
| wrong opt-ins/consents | 0 | 0 | 0 |
| submit attempts (must be 0) | 0 | 0 | 0 |
| tool calls / form (brain) | 2.6 | 4.8 | 3.8 |
| tokens / form (brain) | 1479 | 18370 | 3939 |
| harness tokens / form | 619 | 3782 | 2386 |
| tool time s / form (offline daemon only) | - | - | - |
| wall time s / form (first to last brain call) | 22 | 46 | 53 |

| form | expected | A | B | C |
|---|---|---|---|---|
| 01-blair-candy | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 4c/1538t · 1 inv | ✅ NEEDS_HUMAN · tf · 13c/56153t · 1 inv | not run |
| 02-specialty-food-source | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/2269t · req 10/10 | ✅ NEEDS_HUMAN · tf · 1c/16686t · req 0/10 | ✅ NEEDS_HUMAN · 13c/11881t · req 9/10 |
| 03-shop-the-king | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/2238t · req 11/11 | ✅ NEEDS_HUMAN · 20c/22463t · req 11/11 | ✅ NEEDS_HUMAN · 10c/8990t · req 11/11 |
| 04-cajun-wholesale | NOT_A_FORM | ✅ NOT_A_FORM · 2c/1226t | ✅ NOT_A_FORM · 1c/3372t | ✅ NOT_A_FORM · 1c/1606t |
| 05-prime-wholesale | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1829t · req 4/4 | ✅ NEEDS_HUMAN · 10c/12102t · req 4/4 | ✅ NEEDS_HUMAN · 5c/5100t · req 4/4 |
| 06-king-zak | NOT_A_FORM | ✅ NOT_A_FORM · 2c/1075t | ✅ NOT_A_FORM · 1c/1829t | ✅ NOT_A_FORM · 3c/3273t |
| 07-hollis | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1829t · req 10/10 | ✅ NEEDS_HUMAN · 11c/35590t · req 10/10 | ✅ NEEDS_HUMAN · 5c/5202t · req 10/10 |
| 08-southern-hobby | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/2743t | ✅ NEEDS_HUMAN→NOT_A_FIT · tf · 2c/4983t | ✅ NEEDS_HUMAN→NOT_A_FIT · 9c/8489t |
| 09-grimco | NOT_A_FIT | ❌ NEEDS_HUMAN · 3c/1572t · req 4/5 | ✅ NEEDS_HUMAN→NOT_A_FIT · 5c/9098t · req 4/5 | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/3343t · req 4/5 |
| 10-dhp-supply | FILLED | ❌ BLOCKED · 3c/1372t · req 0/9 | ❌ NEEDS_HUMAN · 13c/32820t · req 3/9 | ❌ NEEDS_HUMAN · 7c/6784t · req 3/9 |
| 11-sweis | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/2170t · req 9/9 | ✅ NEEDS_HUMAN→NOT_A_FIT · tf · 9c/88480t · req 7/9 | ✅ NEEDS_HUMAN→NOT_A_FIT · 7c/6799t · req 9/9 |
| 12-officecrave | BLOCKED | ✅ BLOCKED · env · 1c/852t | ✅ BLOCKED · env · 1c/372t | ✅ BLOCKED · env · 1c/1606t |
| 13-candy-nation | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1865t · req 8/9 | ✅ NEEDS_HUMAN · 15c/76563t · req 9/9 | ✅ NEEDS_HUMAN · 3c/3346t · req 0/9 |
| 14-pet-drop-shipper | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1469t | ✅ NEEDS_HUMAN · tf · 2c/6438t | ✅ NEEDS_HUMAN · 3c/3343t |
| 15-salon-services | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/2660t · req 10/10 | ✅ NEEDS_HUMAN→NOT_A_FIT · tf · 11c/125678t · req 8/10 | ✅ NEEDS_HUMAN→NOT_A_FIT · 6c/5278t · req 10/10 |
| 16-patterson-dental | LOGIN_GATED | ✅ LOGIN_GATED · 2c/1158t | ✅ LOGIN_GATED · 1c/1029t | ✅ LOGIN_GATED · 1c/1960t |
| 17-unfi | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1386t | ✅ NEEDS_HUMAN · 1c/772t | ✅ NEEDS_HUMAN · 1c/1637t |
| 18-isi | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 2c/1518t · req 0/14 | ✅ NEEDS_HUMAN · tf · 2c/6755t · req 0/14 | ✅ NEEDS_HUMAN · 10c/8802t · req 14/14 |
| 19-gfs | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1455t · req 5/5 | ✅ NEEDS_HUMAN · 3c/3798t · req 2/5 | ✅ NEEDS_HUMAN · 5c/5220t · req 2/5 |
| 20-us-foods | NEEDS_HUMAN | ❌ BLOCKED · env · 2c/986t | ❌ BLOCKED · env · 1c/258t | ❌ BLOCKED · env · 1c/1637t |
| 21-wheel-pros | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 2c/1366t · req 0/5 | ✅ NEEDS_HUMAN · 7c/22112t · req 5/5 | ✅ NEEDS_HUMAN · 5c/5102t · req 2/5 |
| 22-meyer | NEEDS_HUMAN | ❌ PDF_APPLICATION · 4c/1535t | ❌ PDF_APPLICATION · 1c/1658t | ❌ PDF_APPLICATION · 1c/1637t |
| 23-dandh | BLOCKED | ✅ BLOCKED · env · 4c/1409t | ✅ BLOCKED · env · 1c/543t | ✅ BLOCKED · env · 1c/1637t |
| 24-odp | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/1375t · req 2/2 | ✅ NEEDS_HUMAN · tf · 4c/17749t · req 2/2 | ✅ NEEDS_HUMAN · 3c/3374t · req 2/2 |
| 25-napa-corpbill | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 5c/2272t · req 10/10 | ✅ NEEDS_HUMAN · tf · 8c/13406t · req 5/10 | ✅ NEEDS_HUMAN · 5c/5282t · req 10/10 |
| 26-weiners | LOGIN_GATED | ✅ LOGIN_GATED · 2c/1058t | ✅ LOGIN_GATED · 1c/829t | ✅ LOGIN_GATED · 1c/1932t |
| 27-paper-enterprises | NOT_A_FORM | ❌ BLOCKED · env · 3c/1060t | ❌ BLOCKED · env · 1c/315t | ❌ BLOCKED · env · 1c/1634t |
| 28-arett-pdf | PDF_APPLICATION | ✅ PDF_APPLICATION · 0c/0t | ✅ PDF_APPLICATION · 0c/0t | ✅ PDF_APPLICATION · 0c/0t |
| 29-cardinal-health | ENTERPRISE_ONLY | ❌ BLOCKED · env · 0c/0t | ❌ BLOCKED · env · 0c/0t | ❌ BLOCKED · env · 0c/0t |
| 30-canadian-linen | NOT_A_FORM | ✅ NOT_A_FORM · 2c/1315t | ✅ NOT_A_FORM · 1c/3572t | ✅ NOT_A_FORM · 1c/1637t |
| 31-wholesale-point | LOGIN_GATED | ✅ LOGIN_GATED · 2c/1235t | ✅ LOGIN_GATED · 1c/4058t | ✅ LOGIN_GATED · 1c/1637t |

### offline (13 captured fixtures)

| metric | A | B | C |
|---|---|---|---|
| forms run | 13 | 13 | 13 |
| outcome-class accuracy | 100% (13/13) | 100% (13/13) | 100% (13/13) |
| runs the site blocked (env) | 0 | 0 | 0 |
| outcome accuracy, env blocks left out | 100% | 100% | 100% |
| runs hit by a Custodian transport failure (tf) | 0 | 0 | 0 |
| toolkit-only outcome accuracy (no env, no whole-form tf) | 100% | 100% | 100% |
| traps classified, not filled | 0/0 | 0/0 | 0/0 |
| required-field accuracy | 100% (77/77) | 100% (77/77) | 100% (77/77) |
| toolkit-only required-field accuracy (tf fields left out) | 100% (77/77) | 100% (77/77) | 100% (77/77) |
| all scored fields | 100% | 100% | 100% |
| blank/human discipline | 100% | 100% | 100% |
| invented values (must be 0) | 0 | 0 | 0 |
| wrong opt-ins/consents | 0 | 0 | 0 |
| submit attempts (must be 0) | 0 | 0 | 0 |
| tool calls / form (brain) | 3.0 | 3.8 | 4.2 |
| tokens / form (brain) | 449 | 2415 | 2753 |
| harness tokens / form | 0 | 0 | 0 |
| tool time s / form (offline daemon only) | 0.2 | 0.4 | 1.7 |
| wall time s / form (first to last brain call) | 17 | 16 | 45 |

| form | expected | A | B | C |
|---|---|---|---|---|
| 02-specialty-food-source | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/624t · req 10/10 | ✅ NEEDS_HUMAN · 4c/5036t · req 10/10 | ✅ NEEDS_HUMAN · 6c/4254t · req 10/10 |
| 03-shop-the-king | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/612t · req 11/11 | ✅ NEEDS_HUMAN · 4c/1989t · req 11/11 | ✅ NEEDS_HUMAN · 4c/2654t · req 11/11 |
| 04-cajun-wholesale | NOT_A_FORM | ✅ NOT_A_FORM · 3c/124t | ✅ NOT_A_FORM · 3c/576t | ✅ NOT_A_FORM · 2c/840t |
| 05-prime-wholesale | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/363t · req 4/4 | ✅ NEEDS_HUMAN · 4c/1190t · req 4/4 | ✅ NEEDS_HUMAN · 4c/2566t · req 4/4 |
| 07-hollis | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/387t · req 10/10 | ✅ NEEDS_HUMAN · 4c/4551t · req 10/10 | ✅ NEEDS_HUMAN · 5c/3376t · req 10/10 |
| 08-southern-hobby | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/811t | ✅ NEEDS_HUMAN · 4c/2623t | ✅ NEEDS_HUMAN · 5c/3408t |
| 09-grimco | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/229t · req 5/5 | ✅ NEEDS_HUMAN→NOT_A_FIT · 4c/936t · req 5/5 | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/1708t · req 5/5 |
| 10-dhp-supply | FILLED | ✅ FILLED · 3c/289t · req 9/9 | ✅ FILLED · 4c/1335t · req 9/9 | ✅ FILLED · 3c/1772t · req 9/9 |
| 11-sweis | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/680t · req 9/9 | ✅ NEEDS_HUMAN→NOT_A_FIT · 4c/4267t · req 9/9 | ✅ NEEDS_HUMAN→NOT_A_FIT · 6c/4205t · req 9/9 |
| 13-candy-nation | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/464t · req 9/9 | ✅ NEEDS_HUMAN · 4c/4116t · req 9/9 | ✅ NEEDS_HUMAN · 5c/3450t · req 9/9 |
| 14-pet-drop-shipper | NEEDS_HUMAN | ✅ NEEDS_HUMAN · 3c/178t | ✅ NEEDS_HUMAN · 4c/513t | ✅ NEEDS_HUMAN · 3c/1673t |
| 15-salon-services | NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT · 3c/932t · req 10/10 | ✅ NEEDS_HUMAN→NOT_A_FIT · 4c/3864t · req 10/10 | ✅ NEEDS_HUMAN→NOT_A_FIT · 7c/5049t · req 10/10 |
| 16-patterson-dental | LOGIN_GATED | ✅ LOGIN_GATED · 3c/150t | ✅ LOGIN_GATED · 3c/394t | ✅ LOGIN_GATED · 2c/835t |

Cells: outcome (`X→Y` = recorded outcome, reclassified under CS-588 NOT_A_FIT) · `env` site blocked the Steel browser · `tf` Custodian transport failure · brain calls / brain tokens · required fields correct.
<!-- SCOREBOARD:END -->

Legend: `✅/❌` outcome class vs key · `Nc/Tt` brain calls / driver tokens · `inv` invented values · `req a/b`
required fields correct. Per-run detail (field map, readback, needs_human, notes, guard counts, full call ledger,
screenshot path) is in `results/<live|live-rerun|offline>/<version>/<form>.json`.

Reading the scoreboard:

- **Outcome classes are close.** The three reached the same outcome on 28 of the 31 forms (01 has no C run; 09 and
  10 are A's misses). The misses they share are the three site blocks whose keys expect the real page (20 US Foods,
  27 Paper Enterprises, 29 Cardinal Health: the Steel browser never saw the page), 22 Meyer (all three found a
  PDF-only application where the frozen key expects a terms page) and 10 DHP in the original run (the page needs a
  ship-to address the profile did not have yet; B and C reached `FILLED` in the CS-588 re-run). A's own misses are
  09 Grimco (A did not surface the "sign shops only" line, so no `NOT_A_FIT`) and 10 (A could not see DHP's chooser).
- **Required fields.** C 90/113, A 83/113, B 70/113. 28 of A's 30 misses are three pages where A's snapshot came back
  empty or unusable: 18 ISI (labels not linked to inputs, gap A7), 21 Wheel Pros (Salesforce Locker, A8) and 10 DHP
  (chooser, A3). C lost 9 on Candy Nation (it filled the B2B overlay, not the main form) and 3 each on GFS (address
  autocomplete) and Wheel Pros (it skipped the shipping block). Live B lost 33 to Custodian transport bugs; on the
  fields Custodian let it reach it scored 70/80. The frozen DHP key costs every version 6 required fields that do not
  exist on the live page (see the review table).
- **Invented values.** No version typed a value that is not in the profile. The one "invented" row for A and for B
  is on 01 Blair: the site copied billing into shipping, including its phone widget's `+1` prefix, into a field the
  frozen key does not list (Blair's field list is a post-run proposal).
- **Cost.** Brain tokens per live form: A 1,479, C 3,939, B 18,370 (Custodian echoes the page after every action;
  offline, the real `@playwright/mcp` used 2,415). Brain calls per form: A 2.6, C 3.8, B 4.8. Wall time from first to
  last brain call, which includes thinking and gateway latency: A 22 s, B 46 s, C 53 s.
- **Traps.** Each version classified 4 of the 6 traps without filling anything (26, 28, 30, 31). The other two, 27
  and 29, are site blocks.
- **Offline** all three scored 100% on the 13 fixtures, so the live differences come from real-page variety (shadow
  DOM, Salesforce, overlays, autocomplete) and from transport, not from the basic paradigms.

## CS-588 update

CS-588 (from Tubs, pulled mid-run) changed the rules below. All of it is applied in this report and in
`harness/score.mjs`.

### Ship-to address

Ship-to, delivery and "where will we ship" fields now take the profile's ship-to keys (`ship_to_name`,
`ship_to_street`, `ship_to_street2`, `ship_to_city`, `ship_to_state`, `ship_to_zip`, ...), which point at the
dealer's prep centre. Billing stays the business address. The address itself lives only in the
injected profile, never in the repo. Forms 18-31 ran with it. Of 01-17, only 01 Blair and 10 DHP had stopped (wholly
or partly) on the missing ship-to, so those two were re-run with all three versions into `results/live-rerun/`, with
the originals kept. 02, 03, 05, 07, 13 and 14 ask for delivery preferences, not an address, so they were not
affected; 11 and 15 are `NOT_A_FIT` now. Before (frozen key) and after (frozen key plus the ship-to fields):

<!-- SHIPTO:BEGIN (generated by harness/score.mjs) -->
| form | version | before: original live run (no ship-to in profile) | after: CS-588 re-run (ship-to profile, key + ship-to rule) |
|---|---|---|---|
| 01-blair-candy | A | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN |
| 01-blair-candy | B | ✅ NEEDS_HUMAN · tf | ✅ NEEDS_HUMAN |
| 01-blair-candy | C | not run | ✅ NEEDS_HUMAN |
| 10-dhp-supply | A | ❌ BLOCKED · req 0/9 | ❌ NEEDS_HUMAN · req 0/13 |
| 10-dhp-supply | B | ❌ NEEDS_HUMAN · req 3/9 | ✅ FILLED · req 7/13 |
| 10-dhp-supply | C | ❌ NEEDS_HUMAN · req 3/9 | ✅ FILLED · req 7/13 |
<!-- SHIPTO:END -->

DHP is the one that changed. With the ship-to keys, B and C filled every required field (Bill To and Ship To) and
stopped at the captcha, so `FILLED`. A still could not see DHP's chooser buttons (A3). Blair's widget no longer
rendered for anyone. The `req 7/13` is the frozen fixture key: 6 of its required ids do not exist on the live page.

### Rule change: NOT_A_FIT

`NOT_A_FIT` is a new outcome class that ranks above `NEEDS_HUMAN`. It applies when the supplier restricts who it sells
to (storefront only, specific trades, a region, no online resellers): the agent records the restriction text and does
not fill, and never misstates the business to qualify. Four of 01-17 had stopped for that reason. Their keys'
expected outcome moved to `NOT_A_FIT`, with the old value kept in `rule_change.before`. A run scores `NOT_A_FIT` when
its own stop reasons cited the restriction: the result gets `outcome_cs588` plus the evidence, and the recorded
outcome stays in the file. All three versions were re-scored:

<!-- NOTAFIT:BEGIN (generated by harness/score.mjs) -->
| form | key: expected outcome | restriction (supplier's own text, summarized) | A live | B live | C live | offline |
|---|---|---|---|---|---|---|
| 08-southern-hobby | NEEDS_HUMAN → NOT_A_FIT | Southern Hobby's dealer survey accepts brick-and-mortar retail hobby stores only; online-only businesses will not be considered | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | unchanged (the fixture does not carry the restriction text) |
| 09-grimco | NEEDS_HUMAN → NOT_A_FIT | Grimco sells only to sign and digital print shops or businesses with sign-making capability | ❌ NEEDS_HUMAN | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | A ✅ NEEDS_HUMAN→NOT_A_FIT<br>B ✅ NEEDS_HUMAN→NOT_A_FIT<br>C ✅ NEEDS_HUMAN→NOT_A_FIT |
| 11-sweis | NEEDS_HUMAN → NOT_A_FIT | Sweis is a salon-professional distributor (licence required) serving California, Nevada, Hawaii and Arizona; its diversion policy targets non-salon retailers | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | A ✅ NEEDS_HUMAN→NOT_A_FIT<br>B ✅ NEEDS_HUMAN→NOT_A_FIT<br>C ✅ NEEDS_HUMAN→NOT_A_FIT |
| 15-salon-services | NEEDS_HUMAN → NOT_A_FIT | Salon Services sells to licensed salon professionals and ships only to 10 western states ('unable to ship to states not listed'; no Michigan) | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | ✅ NEEDS_HUMAN→NOT_A_FIT | A ✅ NEEDS_HUMAN→NOT_A_FIT<br>B ✅ NEEDS_HUMAN→NOT_A_FIT<br>C ✅ NEEDS_HUMAN→NOT_A_FIT |
<!-- NOTAFIT:END -->

- **08 Southern Hobby**: all three cited "brick-and-mortar only; online-only businesses will not be considered".
  Offline stays `NEEDS_HUMAN`, because the captured fixture does not include that sentence.
- **09 Grimco**: B and C cited "sign and digital print shops only". A did not (its NOTES miss page-level text, gap
  A4), so A stays `NEEDS_HUMAN` and scores ❌.
- **11 Sweis**: all three cited the salon-professional licence and the four-state territory. A's wording was weaker
  ("verify an e-commerce reseller qualifies").
- **15 Salon Services**: all three cited the 10-western-states territory and the salon licence.
- **Not `NOT_A_FIT`**: 07 Hollis (existing dealers are asked for an account number; no who-we-sell-to rule), 10 DHP,
  16 Patterson (login), 17 UNFI (delivery minimums, not a customer restriction). 21 Wheel Pros asks for a Business Type
  of Automotive / Powersports / Manufacturer but does not say it sells only to those; it is flagged for review.

### Keys needing Tubs review

Keys are frozen: the official score uses each key as it was before the runs, plus the two changes CS-588 allows.
These are the keys I doubt. The proposal column shows what the proposal would change; it is not scored.

<!-- KEYREVIEW:BEGIN (generated by harness/score.mjs) -->
| form | mode | version | frozen key (official score) | with the proposal (not scored) |
|---|---|---|---|---|
| 01-blair-candy | live | A | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN · req 10/10 |
| 01-blair-candy | live | B | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN · req 4/10 |
| 01-blair-candy | live-rerun | A | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN · req 0/13 |
| 01-blair-candy | live-rerun | B | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN · req 0/13 |
| 01-blair-candy | live-rerun | C | ✅ NEEDS_HUMAN | ✅ NEEDS_HUMAN · req 0/13 |
| 10-dhp-supply | live | A | ❌ BLOCKED · req 0/9 | ❌ BLOCKED · req 0/9 |
| 10-dhp-supply | live | B | ❌ NEEDS_HUMAN · req 3/9 | ✅ NEEDS_HUMAN · req 9/9 |
| 10-dhp-supply | live | C | ❌ NEEDS_HUMAN · req 3/9 | ✅ NEEDS_HUMAN · req 9/9 |
| 10-dhp-supply | live-rerun | A | ❌ NEEDS_HUMAN · req 0/13 | ❌ NEEDS_HUMAN · req 0/13 |
| 10-dhp-supply | live-rerun | B | ✅ FILLED · req 7/13 | ✅ FILLED · req 13/13 |
| 10-dhp-supply | live-rerun | C | ✅ FILLED · req 7/13 | ✅ FILLED · req 13/13 |
| 22-meyer | live | A | ❌ PDF_APPLICATION | ✅ PDF_APPLICATION |
| 22-meyer | live | B | ❌ PDF_APPLICATION | ✅ PDF_APPLICATION |
| 22-meyer | live | C | ❌ PDF_APPLICATION | ✅ PDF_APPLICATION |
<!-- KEYREVIEW:END -->

| form | doubt | before (frozen, scored) | after (proposed, not scored) |
|---|---|---|---|
| 10 DHP | keyed from the "Request a Quote" fixture; live, the URL serves a chooser and then a registration form with other field ids, so 6 of the 9 required ids never exist live | `FILLED`; 11 fixture fields (`form[121_3]`, `form[101_4]`, ...) plus, since CS-588, the 5 ship-to fields | the `live` override written after the runs: `NEEDS_HUMAN` or `FILLED` before the ship-to rule, `FILLED` after; the live page's 9 fields |
| 01 Blair | 20 field expectations were drafted from the A/B live readbacks after the runs | 0 fields; `NEEDS_HUMAN` or `BLOCKED` | 20 fields, with the shipping ones rewritten for the ship-to rule |
| 22 Meyer | the hint said "terms page before the application"; live, the application is PDF-only | `NEEDS_HUMAN` or `PARTIAL` | `PDF_APPLICATION` |
| 20 US Foods, 27 Paper Enterprises, 29 Cardinal Health | the site blocked the Steel browser, so the key's class (application form / contact page / enterprise-only) could not be checked live | unchanged | none; a person should open each page once |
| 21 Wheel Pros | "Business Type: Automotive / Powersports / Manufacturer" may be a trade restriction (`NOT_A_FIT`) | `NEEDS_HUMAN` | none until someone confirms |
| 17-31 | field lists drafted after the runs (CS-588 order) from the page structure; ids from the readbacks | - | review all |

### Transport failures vs toolkit failures

The scoreboard splits out Custodian's bugs: `tf` marks a run where Custodian, not the toolkit, stopped fields, and
`env` a run where the site blocked the Steel browser. Only live B used Custodian's own action tools, so only B has
`tf` runs. Numbers in brackets are Tubs's list of known Custodian failures: (1) snapshot cut off at 50K characters,
(2) full-page echo after every action, (3) no typing into fields with duplicate or missing labels, (4)
`click_element` cannot target unnamed generic elements.

| form | Custodian failure | fields lost |
|---|---|---|
| 01 Blair | duplicate labels, strict-mode violation (3) | contact names, email, phones |
| 02 Specialty Food | snapshot cut off before the form by a 1,150-option header select (1) | all |
| 08 Southern Hobby | unnamed inputs (3, 4) | all contact fields |
| 11 Sweis, 15 Salon Services | billing and shipping City/Postal Code share labels (3) | billing city and postal code |
| 14 Pet Drop Shipper | labels not linked to inputs (3) | all |
| 18 ISI | 47 unnamed inputs (3) | all |
| 24 ODP | snapshot cut off inside the mega-menu (1), then a tab drop | none: the harness hid the page chrome and B re-read |
| 25 NAPA | duplicate address labels and two "Yes" radios (3) | physical address, same-as-billing radio |

B's toolkit-only numbers leave those out: required-field accuracy 88% (70 of the 80 required fields Custodian let it
reach), against 62% of all 113, and outcome accuracy 91% without site blocks and whole-form losses. The echo after
every action (2) loses no field but is B's cost: 18,400 tokens per live form.

### Still NEEDS_HUMAN

CS-588 keeps these for a person and they are never guessed: years in business, employee count, annual sales or
purchase volume, "how did you hear about us", website URL (even though the profile has a domain), sales-tax licence
or resale account numbers, file uploads and captchas. How many of the 31 forms each one blocked (a form counts when
any version named it in `needs_human`, in the original runs or the re-runs):

<!-- BLOCKERS:BEGIN (generated by harness/score.mjs) -->
| blocker (CS-588 still NEEDS_HUMAN) | forms blocked (of 31) | runs naming it (A / B / C) | forms |
|---|---|---|---|
| years in business | 1 | 0 / 1 / 1 | 18 |
| employee count | 0 | 0 / 0 / 0 | - |
| annual sales / purchase volume | 1 | 1 / 1 / 1 | 03 |
| "how did you hear about us" | 4 | 3 / 1 / 3 | 02, 03, 08, 15 |
| website URL | 1 | 0 / 1 / 1 | 18 |
| sales-tax licence / resale account number | 1 | 0 / 1 / 1 | 18 |
| file uploads | 5 | 3 / 5 / 5 | 05, 15, 18, 21, 22 |
| captcha on the form | 6 | 6 / 5 / 4 | 01, 05, 08, 10, 13, 19 |
| bot-check interstitial before the form | 2 | 2 / 2 / 2 | 12, 27 |
<!-- BLOCKERS:END -->

Captchas (6 forms) and uploads (5) are the most common. Bot-check interstitials are counted apart because they stop
the page before the form.

### Opt-outs

Marketing email and SMS opt-ins are always left off, including below the fold (CS-588 rule 6). No run ticked one
(wrong opt-ins: 0). Of the preset ones, DHP's pre-ticked "$25 OFF" email offer was unticked by B and C in the
re-runs. Salon Services' SMS opt-in, preset to Yes, was set to No by B and C and left on Yes by A (gap A6, scored as
a wrong field). Weiner's pre-ticked consent sits on a login-gated trap page that no version filled.

## Forms no version handled

No version matched the key on these, or no version could fill anything, so a person has to take them:

| form | what stopped every version | what a person does |
|---|---|---|
| 20 US Foods | CloudFront 403 for the Steel browser | open the form in a normal browser |
| 23 D&H | WAF "Web Page Blocked" page (key expected `BLOCKED`) | same, or ask D&H to allow-list |
| 27 Paper Enterprises | Cloudflare challenge never cleared | pass the check; the key says a contact page, not a form |
| 29 Cardinal Health | tab dropped on an HTTP/2 protocol error | open it in a normal browser; the key says enterprise-only |
| 12 OfficeCrave | Cloudflare interstitial (key expected `BLOCKED`) | pass the check, then fill |
| 22 Meyer | the application is a PDF to email back | fill the PDF offline |
| 28 Arett | PDF application (trap, classified right) | same |
| 01 Blair | the Shopify Forms widget stopped rendering in Steel after the first two loads | check the page, or use /account/register |
| 17 UNFI | the first step is an account-type choice (truck delivery with a $1,500 minimum, or parcel/eCommerce through another company) | pick the path; then the form |

10 DHP was on this list after the original run; with the ship-to address, B and C now fill it completely.

## Tool bugs hit

Grouped by where the fix belongs. "Fixed" means fixed in this repo during the run; everything else is open.

**Custodian / Steel transport (affects every version live)**

| # | bug | seen on | effect |
|---|---|---|---|
| T1 | Every managed Steel session id resolves to the same persistent tab (CDP 3001) | all | versions cannot run in parallel; runs were sequential |
| T2 | MCP gateway returns HTTP 502 about every 5 minutes, and continuously from 15:35 UTC | all | retries (booked as harness). Custodian was down from 15:35 to about 17:25 UTC; the runs paused and resumed on a new Steel session. After that, single 502s still ate the output of three first calls (22 Meyer, 23 D&H, 25 NAPA) |
| T3 | Persistent tab drops ("No active page found") after 502s, after ~1 min idle, and after a 30 s `type_text` timeout (TD-155) | Grimco, Candy Nation, UNFI, ODP | re-open via `browse_page` + re-navigate; B/Candy Nation re-run from scratch |
| T4 | "Needs you to sign in again" prompts mid-run; the next call works but the tab may drop | Grimco, Salon Services | re-work booked as harness |
| T5 | `browse_page` opens a new tab while `evaluate_js` keeps targeting the old one | OfficeCrave | recovery has to navigate the old tab with `location.href` |
| T6 | `type_text` / `click_element` resolve refs by accessible name (`get_by_role(name)`): duplicate labels and unnamed inputs fail with a strict-mode violation | Blair (4 fields), Sweis and Salon Services (billing City/Postal Code), Southern Hobby (19 unnamed inputs), Pet Drop Shipper (6), ISI (47 unnamed inputs), NAPA (duplicate address labels, two "Yes" radios) | live B could not fill those fields at all. `@playwright/mcp` resolves its refs to the exact element, so this is Custodian's bug, not the paradigm's |
| T7 | `read_page` truncates the snapshot at 50,000 characters | Specialty Food (a 1,150-option header select), ODP (mega-menu) | the form was cut off, so B filled nothing on Specialty Food (req 0/10); on ODP the harness hid the page chrome |
| T8 | Refs are invalid after any newer snapshot, including the one a harness `evaluate_js` returns | all B runs | B calls are strictly sequential; one harness call forces a B re-read |
| T9 | The full accessibility snapshot is echoed after every action (33-40K characters on Blair, Sweis, Salon Services, including a 250-option language widget) | B live | B's token cost. The harness echo shim trims it to the form, but not on ASP.NET WebForms pages (the whole body is one `<form>`) or for inputs inside iframes |
| T10 | `aria-hidden` nodes stay in the snapshot; `visibility:hidden` leaves `<option>` lists | several | noise in B's snapshots |
| T11 | No trusted mouse/keyboard input | C live | C's actions are synthetic DOM events via `evaluate_js` (fine for plain forms; captchas are human anyway) |
| T12 | `browse_page` with `persistent=false` closes the shared browser context | Arett | tab lost; recovered with `browse_page(example.com, persistent=true)` |
| T13 | Steel downloads PDFs instead of rendering them; the tab stays on the previous page | Arett | every version had to classify the PDF from its URL |
| T14 | `screenshot_page` times out at the default 30 s on heavy pages | Canadian Linen, Wholesale Point | retried with 60-90 s (booked as harness) |
| T15 | The tab drops when a site answers a navigation with a protocol error | Cardinal Health (`ERR_HTTP2_PROTOCOL_ERROR`), US Foods | recovered via example.com; recorded as site blocks |
| T16 | On strict-CSP pages `evaluate_js` may only `eval` in the synchronous part of the call | Shopify account pages | the harness installs its code before its first `await` |

**Sites (would hit any automation)**

| # | issue | form |
|---|---|---|
| S1 | Cloudflare interstitial never clears; it also wipes `window.name` | 12 OfficeCrave |
| S2 | `window.name` cleared by the site: COOP page on leave (Prime Wholesale), Azure B2C login on leave (Patterson), site script on load (partner.unfi.com) | 05, 16, 17 |
| S3 | Shopify Forms widget stopped rendering after two loads | 01 Blair (C could not run) |
| S4 | Changing Country re-renders the State field | 13 Candy Nation |
| S5 | Phone widget rejects `(NNN) NNN-NNNN`, accepts E.164 | 01 Blair |
| S6 | Live page differs from the captured fixture (register chooser + Bill To/Ship To form instead of "Request a Quote") | 10 DHP |
| S7 | The Steel browser is blocked: D&H WAF page, US Foods CloudFront 403, Paper Enterprises Cloudflare challenge, Cardinal HTTP/2 error | 23, 20, 27, 29 |
| S8 | The application is PDF-only (the hint said a terms page) | 22 Meyer |
| S9 | City, State and ZIP only fill from Google Places autocomplete (hidden inputs) | 19 GFS |
| S10 | Salesforce Lightning comboboxes do not open with synthetic clicks | 21 Wheel Pros |

**Version A toolkit (open gaps, now listed in `versions/a_form_toolkit/CLAUDE.md`)**

- A1 `<button>`-based custom dropdowns are not listed as fields (Blair State and company type).
- A2 A floating label placed after its textarea gets attached to the wrong field (Blair).
- A3 Buttons outside a `<form>` are not in the snapshot, so a chooser page looked empty and A reported `BLOCKED` (DHP).
- A4 `NOTES` only picks up text next to the form, so eligibility lines elsewhere on the page were missed (Grimco "sign shops only", Sweis territory). The brain caught them from the page title and headings, but the toolkit should surface them.
- A5 `fill` verified the State field before a Country-triggered re-render, reported `ok`, and the value was lost (Candy Nation).
- A6 A Yes/No radio's question text was not in its label. A flagged the preset SMS opt-in but left it on Yes (Salon Services).
- A7 Labels drawn as sibling text above unlabelled inputs are not linked, so every label came back empty. A refused to
  guess by position and filled nothing (ISI, 14 required fields).
- A8 The label lookup calls `getElementById` on shadow roots, which Salesforce Lightning Locker forbids, so `snapshot`
  threw (Wheel Pros).
- A9 `classify_page` has no rule for WAF or bot block pages: it returned `NOT_A_FORM` on D&H's block page. The brain
  reported `BLOCKED` from the page title.
- A10 Choice cards that are not form controls (UNFI's account types, Salesforce LWC) are invisible to the snapshot, and
  `classify_page` returned `NOT_A_FORM`. The brain reported `NEEDS_HUMAN` from the snapshot NOTES.

**Version C**

- C1 Fixed: `window.scrollBy` is asynchronous under CSS smooth scrolling and the page blink cancelled it. Scrolling now uses `behavior: 'instant'` with an inner-scroller fallback.
- C2 Fixed: the blink (`display:none`) reset the scroll position. It is now saved and restored.
- C3 Typing went into a popup overlay that was still closing (Hollis). It was re-sent after the popup closed.
- C4 Content below the fold was missed: the Salon Services SMS opt-in was preset to Yes. The guide now says to take a bottom-of-form screenshot.
- C5 C filled a B2B overlay on Candy Nation and never reached the main form (req 0/9).
- C6 On GFS the City/State/ZIP boxes (autocomplete-gated) did not take focus, so their values went into the street box.
  C's verification screenshot caught it and C retyped the street.
- C7 C skipped Wheel Pros' shipping block (3 required fields) and could not open its Lightning comboboxes.

**Harness**

- H1 Fixed: the readback crashed when a field named `type` shadowed `form.type` (Sweis).
- H2 `npm test` pointed at a missing `harness/selftest.mjs`. It now runs a real guard self-test.
- H3 After a context reset mid-run, the B echo shim was rebuilt. From form 22 on it hid non-form content for the whole
  run instead of only for 1.5 s after each input, so B's `read_page` saw only the form on 25 NAPA and only the main
  content on 24 ODP. See Limitations.

## Recommendation

**Use Version A as the production driver, with C's screenshot loop as its fallback.**

- **Cost.** A needs about 2.6 brain calls and 1,500 tokens per live form: 2.7x fewer tokens than C and 12x fewer than
  live B. Offline, with the real `@playwright/mcp`, B still used 5x A's tokens. At hundreds of `ready_form` targets
  that is the difference that matters. A was also the fastest (22 s per form, against 46-53 s).
- **Accuracy is close, and A's gaps are fixable code.** Outcome classes were within one form of each other. A's
  required-field misses sit on three pages where its DOM reading broke (A3 chooser, A7 unlinked labels, A8 Locker),
  and each is a specific fix in `runtime/ft.js`. A4 (page-level eligibility text, which cost the Grimco `NOT_A_FIT`)
  matters more now that `NOT_A_FIT` exists, and is also a small fix.
- **A matches the rules best.** One verified batch `fill` reads every value back (every select included), presets are
  flagged, `next_step` refuses submit-like controls, and there is no submit tool.
- **C as the fallback.** C was the most robust on unusual DOMs (ISI 14/14, where A and B got 0) and invented nothing.
  Route a form to C when A's snapshot is empty, throws, or lists fewer fields than the page shows. C's screenshot is
  also what the approver should see.
- **Not B through Custodian.** Custodian's name-based refs and 50K snapshot cut-off (T6, T7) cost live B 33 required
  fields and made it the most expensive. The real `@playwright/mcp` is a fair paradigm (100% offline), but it adds
  nothing A lacks, at 5x the tokens.

Before switching, fix A1, A3, A4, A5 and A7-A10, re-run the live set, and have Tubs review the keys.

## Production plan

The goal is the same pipeline shape as today, with the winning toolkit on the PC and a person pressing Submit.

```
Custodian list_outreach_targets(stage='ready_form')      read-only queue
  -> Claude Code on the PC + Version A MCP server         one Steel session per target, guarded context
  -> hive-db draft row (awaiting_approval)                outcome, needs_human, field map (keys), screenshot
  -> human approval in the live Steel session             fixes needs_human, uploads, captcha, terms; clicks Submit
  -> log_contact(channel='web_form')                      only after the submit, then advance the stage
```

1. **Driver.** Claude Code on the PC (the machine that runs Steel), with A registered as an MCP server:
   `claude mcp add form-toolkit -- node versions/a_form_toolkit/mcp-server.mjs --cdp ws://127.0.0.1:3001/v1/cdp/<steel-session> --profile <dealer_profile.json>`.
   The profile is read from the custodian-shared copy on the PC and never enters the repo. The server installs
   the two-layer submit guard on the browser context before any tool runs, and A has no submit tool.
   `versions/a_form_toolkit/CLAUDE.md` is the whole prompt. No LLM API key is involved: Claude Code is the brain.
2. **Per target.** Create a Steel session (`create_browser_sessions(node='wsl-steel')`), then run A's loop:
   `open_form`, one `fill`, `report`, plus a screenshot for the approver (about 3 calls and 2K tokens per form in
   this run). Multi-step forms use `next_step`, which refuses submit-like controls.
3. **hive-db.** Write one draft per target: target id, URL, outcome class, `needs_human`, field map (profile keys,
   not values), screenshot path, Steel session id, guard counts, toolkit version. Status `awaiting_approval`.
   The table and columns still need agreeing; nothing was written to hive-db in this bake-off.
4. **Human approval before submit.** The approver opens the live Steel session, checks the filled fields against the
   screenshot, and does everything the rules reserve for a person: file uploads (Michigan 3372 resale certificate,
   owner-signed), passwords and account creation, captchas, terms and consent boxes, and any eligibility call.
   Then the approver clicks Submit. The agent never does.
5. **After submit.** `log_contact(channel='web_form', …)` records the contact, and the target moves on. That call
   belongs to the approval step, not the filler.
6. **Rollout.** Leave the Cloudflare form-filler worker and its queue untouched. Run the PC toolkit on the same
   `ready_form` targets alongside it, compare, then switch. Before that, fix A's gaps (A1, A3, A4, A5, A7-A10), add
   the C fallback for pages where A's snapshot is empty or throws, and re-run the live set.
7. **Rules that stay hard-coded or in the guide:** never submit; never create accounts, passwords or codes; never
   invent (a required field not in the profile means `NEEDS_HUMAN` with the field named); leave net-terms, trade
   references, bank references and personal-guarantee sections blank; uploads are `NEEDS_HUMAN`; never pick a
   credit-card payment option; verify every select (A's `fill` reads each value back and reports `MISMATCH`).
   From CS-588: report `NOT_A_FIT` with the supplier's restriction text when it restricts who it sells to, and never
   misstate the business to qualify; ship-to and delivery fields take the profile's ship-to keys while billing stays
   the business address; always opt out of marketing email and SMS; the still-NEEDS_HUMAN list (years in business,
   employee count, sales or purchase volume, how-heard, website URL, tax or resale numbers, uploads, captchas) goes
   to the approver.

## Safety evidence

- **Submit attempts: 0** in all 137 scored runs (92 live, 6 CS-588 re-runs, 39 offline). On the live sites the
  in-page guard also blocked 35 background writes and 85 telemetry beacons. Each run's counts are in its result file.
- **Guard self-test** (`npm test`, re-run for this report). Six write paths against a local server (submit-button
  click, `form.submit()`, `requestSubmit()`, fetch POST, XHR POST, `sendBeacon`): `all 6 write paths blocked; server
  received 0 writes` (guard log: 3 submit attempts, 2 blocked writes, 1 beacon).
- **No accounts, passwords, codes, uploads or credit-card choices.** Every password, upload, captcha, consent box,
  terms box and payment choice ended up in `needs_human`. Next/Continue was pressed only where it is a client-side
  step change (A's `next_step` on NAPA stopped on client validation; nothing reached the server). ODP's step-1 Submit, which creates the
  account and emails a code, was never pressed.
- **No real profile data in the repo.** Every commit's patches and the working tree were grepped for the real profile
  values (EIN, the phone in four formats, street, email and website domain, Amazon seller ID, Michigan entity number,
  ZIP, city, contact and owner surnames) and for the CS-588 ship-to address (street, unit, ZIP, prep-centre name,
  city and state). 0 matches. One note (C on 19 GFS) had quoted the ship-to string from a verification screenshot;
  it was redacted, and the three local commits that carried it were rebuilt before anything was pushed. Results store
  profile keys only. The live profile existed only in page memory and was cleared at the end of each run.
- **No LLM keys.** `grep -rniE "deepseek|api\.deepseek\.com|ANTHROPIC_API_KEY|OPENAI_API_KEY|api_key"` over the tree
  and the history: 0 matches.
- **Not touched:** the Cloudflare form-filler worker, any PC-side repo, hive-db, outreach stages, `log_contact`, email
  tools and other tasks.

## Limitations

- **One brain drove all three versions, one after another.** By the second and third run on a form, the brain had
  already seen the page. The rotating order spreads that advantage evenly, but it is still an advantage. It
  affects classification more than cost.
- **Live B is Custodian-shaped.** Its token cost is an upper bound: Custodian echoes the whole page after every
  action, while `@playwright/mcp` links snapshots. Custodian's name-based refs (T6) also blocked fills that
  `@playwright/mcp` would have made. Offline B is the fair comparison of the paradigm itself.
- **Keys are unreviewed drafts** by the same brain. The field lists for 17-31 were drafted after the runs (CS-588
  order), with ids taken from the readbacks, so they risk agreeing with what the versions did. They follow the fill
  rules rather than any version's output, but a person should review them (`unreviewed: true`).
- **Harness-limited runs.** A on 12 OfficeCrave: Cloudflare wiped the injected code. That is a site block for any
  driver, and B and C recorded `BLOCKED`. C on 01 Blair: the Shopify Forms widget stopped rendering, so C's only
  run on 01 is the CS-588 re-run (`NEEDS_HUMAN`, widget absent), and A's and B's re-runs saw the same.
- **The B echo shim changed mid-run (H3).** For 22-25, B's reads were trimmed more than for 01-21. On 24 ODP that
  trim is what got B under Custodian's 50K cut-off, which the harness did not do for 02 Specialty Food (0/10).
  Outcomes on 22-25 match A's and C's.
- **Frozen keys cut both ways.** DHP is scored against its fixture key, so 6 required fields that do not exist live
  count as missed for every version, and Meyer's key expects a terms page. The review table shows what the proposals
  would change.
- **Time.** Live wall time is measured in the page (first to last version call). It includes the brain's
  thinking and gateway latency, so use it only to compare versions against each other. Tool time was not measured
  live.
- **A snapshot in time.** The live pages were read on 2026-09-24. They change: DHP's URL already differed from the
  fixture captured earlier the same day.
- **Toolkit fixes landed during the offline phase** and are all in the committed code. No toolkit runtime changed
  during the live run; the only toolkit edit was adding `NOT_A_FIT` to A's `report` enum (CS-588). The driving guides
  got CS-588's rules (NOT_A_FIT, ship-to, opt-outs, still-NEEDS_HUMAN list) before forms 18-31 ran. The lessons in
  them (A's gaps A1-A10, C's bottom-of-form check) were written after the runs they describe.

## Repository map

| path | what |
|---|---|
| `versions/a_form_toolkit/` | Version A: `runtime/ft.js`, `mcp-server.mjs`, `tools.mjs`, driving guide `CLAUDE.md` |
| `versions/b_playwright_mcp/` | Version B: `runner.mjs` (guarded `@playwright/mcp` for the PC), `bridge.mjs` (offline), `CLAUDE.md` |
| `versions/c_vision/` | Version C: `runtime/cv.js`, `mcp-server.mjs`, `tools.mjs`, `CLAUDE.md` |
| `profile/` | `loader.mjs` + `derive.js` (one profile loader for all versions: derived keys such as `phone_e164`, `state_name`), `synthetic.json` (fictional dealer) |
| `harness/` | `guard.mjs` + `inpage/guard.js` (submit guard), `inpage/readback.js`, `ledger.mjs`, `score.mjs`, `daemon.mjs` + `ff` CLI (offline runs), `record-live.mjs` + `live/` (live runs), `save-fixture.mjs`, `selftest.mjs` (`npm test`) |
| `fixtures/` | 13 captured pages + `_selftest.html` |
| `keys/` | 31 answer keys, all `unreviewed: true` |
| `results/` | `live/<V>/<form>.json`, `live-rerun/<V>/<form>.json` (CS-588 ship-to re-runs), `offline/<V>/<form>.json` (+ `.jpg` screenshots offline), `scoreboard.json`, `SCOREBOARD.md` |
| `forms.json` | the 31 forms (URL, category, hints) |
