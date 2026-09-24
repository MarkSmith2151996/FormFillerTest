# FormFillerTest

Wholesale-application form-filler bake-off (Custodian task EE-1071). Three ways for Claude Code to fill supplier
account applications, one shared harness, 31 real forms. **Results and recommendation: [REPORT.md](REPORT.md).**

| version | path | how the brain sees and acts on the page |
|---|---|---|
| A custom DOM toolkit | `versions/a_form_toolkit/` | compact field list, verified batch `fill`, `classify_page`, safe `next_step` |
| B Playwright MCP (off the shelf) | `versions/b_playwright_mcp/` | `@playwright/mcp` accessibility snapshot, one call per field |
| C vision | `versions/c_vision/` | screenshots with a coordinate grid, coordinate actions |

Claude Code is the only brain. There is no model or LLM API key in this repo: each toolkit is an MCP server (or an
in-page runtime) that any MCP client can drive, and each version's `CLAUDE.md` is its whole prompt.

## Safety rails (all versions)

- A two-layer submit guard sits below the brain: Playwright route interception blocks every non-GET request after the
  first page load, and an in-page guard blocks submit events, `form.submit()`, `requestSubmit()`, non-GET
  fetch/XHR, `sendBeacon` and `WebSocket.send`. `npm test` proves it: six write paths against a local server, zero writes received.
- No version has a submit tool. Passwords, account creation, file uploads and credit-card options are refused or
  left for a person (`NEEDS_HUMAN`).
- Real dealer data never enters the repo: runs use `profile/synthetic.json` offline, and live runs injected the real
  profile into page memory only. Results store profile keys, not values.

## Run it

```bash
npm install
npm test                               # guard self-test
harness/daemonctl.sh start             # offline harness daemon: serves fixtures/, guarded browser per version
./ff A 03 open                         # Version A on fixture 03
./ff A 03 fill '{"f1":"{{profile.legal_name}}"}'
./ff A 03 report '{"outcome":"NEEDS_HUMAN","needs_human":["password"]}'
node harness/score.mjs                 # results/SCOREBOARD.md, results/scoreboard.json, REPORT.md block
```

On the PC, against Steel: `claude mcp add form-toolkit -- node versions/a_form_toolkit/mcp-server.mjs --cdp ws://127.0.0.1:3001/v1/cdp/<steel-session> --profile <dealer_profile.json>`
(see the production plan in REPORT.md).

## Layout

`versions/` toolkits · `profile/` loader and synthetic profile · `harness/` guard, readback, ledger, scorer, offline
daemon, live-run helpers · `fixtures/` captured pages · `keys/` answer keys (drafts, `unreviewed: true`) ·
`results/` per-run JSON and screenshots · `forms.json` the 31 forms.
