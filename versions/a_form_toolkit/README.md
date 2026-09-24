# Version A: custom DOM form toolkit

A brain-agnostic toolkit: `runtime/ft.js` runs in the page and does all the work (field discovery across shadow DOM and
same-origin iframes, labels/required/options/presets, verified batch fill, custom dropdowns, safe next-step, page classification).
Any driver can call it: Claude Code through the MCP server or CLI, Claude through Custodian `evaluate_js`, or another LLM later.
There are no model or API keys anywhere. The driver is whatever MCP client calls the tools.

| tool | what it does |
|---|---|
| `open_form(url)` | navigate and return the compact snapshot (saves a call) |
| `snapshot_form()` | fields `f1..fn`: type, `*` required, options, `(preset!)`, refusals |
| `fill({id: value})` | many fields in one call; `{{profile.key}}` templates; option text for selects/radios/custom widgets; `true/false` for checkboxes; verified per field |
| `choose(id, option)` / `check(id, on)` | single-field variants |
| `next_step()` | click Next/Continue; refuses submit-like controls and form submits |
| `classify_page()` | FORM / LOGIN_GATED / NOT_A_FORM / PDF_APPLICATION / ENTERPRISE_ONLY / BLOCKED + evidence |
| `screenshot(path)` | full-page JPEG for the approver |
| `report(outcome, needs_human, notes)` | final outcome + filled-field map (profile keys only) + guard counts |

## Run
- **MCP (production, Claude Code on the PC):**
  `claude mcp add form-toolkit -- node versions/a_form_toolkit/mcp-server.mjs --cdp ws://127.0.0.1:3001/v1/cdp/<steel-session> --profile <dealer_profile.json>`
  (without `--cdp` it launches local Chromium). The submit guard is installed on the context before any tool runs.
- **Offline bake-off CLI:** `harness/daemonctl.sh start`, then `./ff A 03 open`, `./ff A 03 fill '{"f1":"{{profile.contact_first_name}}"}'`, `./ff A 03 report '{"outcome":"NEEDS_HUMAN","needs_human":["password"]}'`.
- **Live through Custodian (this bake-off):** inject `harness/live/hA.min.js` once per Steel tab (it is kept in
  `window.name` for later pages; the profile is never put there), then call `__ft.*` through `evaluate_js`. See `CLAUDE.md`.

## Swapping the model
There is no model inside. Point any MCP-capable client at `mcp-server.mjs`, or call `window.__ft` from any automation that can run JS.
The driving guide (`CLAUDE.md`) is the whole prompt.
