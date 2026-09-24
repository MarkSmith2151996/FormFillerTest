# Version B: Microsoft Playwright MCP (off the shelf)

The baseline that answers "do we even need custom tools?". The tools are exactly `@playwright/mcp`'s (v0.0.82:
`browser_navigate`, `browser_snapshot`, `browser_fill_form`, `browser_click`, `browser_select_option`, …). No custom actions.

- `runner.mjs` starts the unmodified server over stdio on a browser context the harness has guarded (Playwright route
  interception + in-page submit guard), so submits are blocked below the MCP server.
  `claude mcp add playwright-guarded -- node versions/b_playwright_mcp/runner.mjs [--cdp ws://127.0.0.1:3001/v1/cdp/<session>]`
- `bridge.mjs` is the same thing with an in-memory MCP client, used by the offline bake-off CLI: `./ff B 03 open`, `./ff B 03 browser_snapshot '{}'`,
  `./ff B 03 browser_fill_form '{"fields":[…]}'`, `./ff B 03 report '{"outcome":"…"}'`.
- `CLAUDE.md` is the driving guide.

Notes: 0.0.82 bundles Playwright 1.64-alpha. It drives the VM's Chromium 141 (chromium-1194) fine. `browser_navigate` and
action responses link to a snapshot file instead of inlining it, so the driver calls `browser_snapshot` (optionally scoped with `target`).

Live runs: Steel's CDP endpoint (`ws://127.0.0.1:3001/...`) is only reachable on the PC, so the live B runs used Custodian's own
accessibility-snapshot/ref tools (same paradigm, but one call per field and a full-page snapshot echoed after every action). On the PC, use `runner.mjs --cdp`.

Swapping the model: there is none. Any MCP client drives it.
