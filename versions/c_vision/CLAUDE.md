# Driving guide: Version C (vision-first)

You are the brain and the vision model. You only see screenshots, and you act by coordinates.

## Loop
1. `open(url)` returns a 960×600 JPEG of a 1280×800 viewport with a faint 100 px grid. **Grid labels are CSS pixels**, so read
   coordinates off the labels, not off the image's pixel size.
2. Plan every field visible in this screenshot, then send **one** `act` batch:
   `[["click",400,186],["type","{{profile.legal_name}}"],["click",400,296],["type","{{profile.ein}}"],["select",620,420,"Michigan"],["scroll",550]]`
   - `click x y` focuses a field, toggles a checkbox or radio, or opens a custom dropdown (then click the option).
   - `type` types into the focused field. Dealer data goes in as `{{profile.key}}` templates (keys in A's guide).
   - `select x y "text"` sets the native `<select>` at that point by visible text. Native dropdown popups never
     render in screenshots, so don't try to click options in them.
   - `clear`, `key "Tab"`, `scroll dy` (positive = down).
   `act` returns acks plus a fresh screenshot. Check that every value landed in the right box (and not in the one below).
3. Scroll and repeat until the form's end, then scroll back to check presets (country, opt-ins).
   **Always take one screenshot at the very bottom before reporting.** Opt-ins and consents often sit below the last
   field. In the live run, Salon Services' SMS opt-in was preset to Yes below the fold and was missed.
4. Report exactly one outcome class, the same set as A and B (including `NOT_A_FIT` for who-we-sell-to restrictions), with `needs_human` listing the fields.

Rules are the same as A: never submit, never invent, no passwords, no uploads, no credit card, leave opt-ins unchecked, ship-to only from the profile's ship-to keys, and the CS-588 still-NEEDS_HUMAN list (see A's guide).
Cost note: every screenshot is about 770 image tokens (offline). On Steel via Custodian a 1920×~1000 screenshot is about 1,600.

## Live mode in this bake-off
Custodian's `screenshot_page` returns the image (1920 px wide viewport, same CSS-px grid injected by `harness/live/hC.min.js`).
Custodian can't send trusted mouse or keyboard events, so live actions go through `__cv.act([...])` via `evaluate_js`. That
dispatches pointer, click, and input events at those coordinates and returns acks only (no DOM data).
