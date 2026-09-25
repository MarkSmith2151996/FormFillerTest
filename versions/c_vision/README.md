# Version C: vision-first (screenshot + coordinates)

Skyvern-style, with Claude as the vision model. The driver never sees the DOM: every observation is a 960×600 JPEG of a
1280×800 viewport (deviceScaleFactor 0.75) with a labelled 100 px grid in CSS pixels. Actions are coordinates:
`click x y`, `type text` (`{{profile.key}}` templates resolved by the toolkit), `clear`, `key`, `scroll dy`, and
`select x y "text"` (native `<select>` popups never render in screenshots).

- MCP: `claude mcp add vision-filler -- node versions/c_vision/mcp-server.mjs [--cdp ws://…] [--profile …]` with tools `open`, `screenshot`, `act`.
- Offline CLI: `./ff C 03 open` (prints a screenshot path, then Read it), `./ff C 03 act '[["click",400,186],["type","{{profile.email}}"]]'`, `./ff C 03 report '{…}'`.
- Live via Custodian: `harness/live/hC.min.js` adds the grid and `__cv.act()` (synthetic pointer/input events, acks only), and Custodian
  `screenshot_page` supplies the image (1920 px viewport, about 1,600 tokens each).

Swapping the model: none inside. Any vision-capable MCP client can drive it.
