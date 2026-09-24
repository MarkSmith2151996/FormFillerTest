# Driving guide: Version B (Microsoft Playwright MCP, off the shelf)

You are the brain. The tools are `@playwright/mcp`'s own tools, unmodified. The only custom pieces are the runner (it hands the MCP server a browser context the harness has guarded) and this guide.

## Loop (fewest calls)
1. `browser_navigate({url})`. The response links to a snapshot file instead of inlining it.
2. `browser_snapshot({})` for the full accessibility tree with `[ref=eN]`. On heavy pages, call again with
   `{"target":"eN"}` for the form's ref to scope it (much smaller).
3. `browser_fill_form({"fields":[{"name":"Company","type":"textbox","target":"e12","value":"…"}, …]})` fills **all** fields
   in one call. Types are `textbox`, `checkbox` (`"true"`/`"false"`), `radio`, `combobox` (option text), `slider`.
4. For custom dropdowns that `browser_fill_form` can't set, use `browser_click` (open), then `browser_click` (option).
   For native selects, use `browser_select_option({"target":"eN","values":["Michigan"]})`.
5. `browser_snapshot({"target":"<form ref>"})` to verify values. Watch for presets such as a country defaulting to Afghanistan, or pre-checked opt-ins.
6. Tell the harness the outcome (`./ff B <form> report '{"outcome":"…","needs_human":[…],"notes":"…"}'` offline). Use exactly one class:
   `FILLED`, `PARTIAL`, `NEEDS_HUMAN`, `NOT_A_FORM`, `LOGIN_GATED`, `PDF_APPLICATION`, `ENTERPRISE_ONLY`, `BLOCKED`.

Never click Submit, Register, Create account, Apply, or Send, or a Continue that submits. The guard blocks the request but still counts the attempt.
`browser_evaluate` and `browser_run_code_unsafe` exist in the server. Using them turns B into a custom toolkit, so the bake-off doesn't use them.

## Values
B has no templates, so type literal values from the profile file you were given (offline: `profile/synthetic.json`, plus the
derived keys in `profile/derive.js`, e.g. first and last name split, state name, "United States"). The fill rules are the same as
in `versions/a_form_toolkit/CLAUDE.md`: never invent, no passwords, no uploads, no credit card, no opt-ins, ship-to only from the profile.

## Live mode in this bake-off
Steel's CDP endpoint is local to the PC, so from the cloud VM the live B runs used Custodian's own Playwright-MCP-style tools:
`browse_page` (navigate + snapshot), `read_page` (snapshot), `type_text` / `select_option` / `click_element` by `ref`.
They are the same accessibility-snapshot + ref paradigm, but with no batch fill, so they take one call per field. On the PC, run the real
server against Steel: `npx @playwright/mcp --cdp-endpoint ws://127.0.0.1:3001/v1/cdp/<session>`. Note that that path skips this repo's route guard; see the README.
