# Driving guide: Version A (form toolkit)

You are the brain. The toolkit gives you a compact list of fillable fields and verified batch actions.
A typical form takes **3 calls**: `open_form`, `fill`, `report`.

## Loop
1. `open_form(url)` returns the snapshot: page line, field count, then one line per field:
   `f7 sel* State {…} ="Illinois" (preset!)`. The `*` means required. `{a|b|c}` lists options, and `[US states]` or `[countries]` abbreviate long lists.
   `!human-only` / `!never` / `!NEEDS_HUMAN` mark fields the toolkit refuses to fill (password, card, SSN, bank, file upload).
   `(preset!)` means the site pre-selected a value. Check it. Brand Central defaulted country to Afghanistan.
   `## form … buttons[…]` shows which buttons exist. Never press submit-like ones (there is no tool for it).
2. If the page is not obviously an application, call `classify_page()` and stop with its class if it isn't `FORM`.
3. `fill({...})` **once** with every field you can map:
   - dealer data only as templates: `"{{profile.legal_name}}"`, `"{{profile.state_name}}"`, `"{{profile.phone}}"` (keys below)
   - dropdowns, radios, and custom widgets: the option text you want (`"Online Retailer"`, `"ACH"`)
   - checkboxes: `true` / `false` (to clear a preset opt-in, send `false`)
   Each field returns a line: `ok`, `ok "Michigan"`, `MISMATCH got "…"`, `NO-OPTION "…" {options}`, `REFUSED …`,
   or `ERR profile.x empty -> NEEDS_HUMAN`. Fix only the failures with a second `fill`.
4. For multi-step forms, `next_step()` returns the next step's snapshot. It refuses submit-like controls and native form submits. Stop there with `PARTIAL` or `NEEDS_HUMAN`.
5. `report(outcome, needs_human[], notes)` with exactly one outcome:
   `FILLED`, `PARTIAL` (list missing fields), `NEEDS_HUMAN` (name the fields), `NOT_A_FORM`, `LOGIN_GATED`, `PDF_APPLICATION`, `ENTERPRISE_ONLY`, `BLOCKED`.

## Fill rules (dealer profile)
- **Never invent.** If a required field isn't in the profile, leave it and name it in `needs_human`. Examples: order volume, referral source, receiving hours, number of locations, licence numbers, account numbers.
- Phone is a mobile line. Use it for phone and mobile fields and leave fax blank. If a form demands a landline, mark NEEDS_HUMAN.
- Bill-to is the profile business address. Ship-to comes only from `profile.ship_to_address`. It is empty today, so a required separate ship-to means NEEDS_HUMAN. Never tick "same as billing".
- Business type: e-commerce reseller (Amazon and other online marketplaces). Payment: wire transfer or ACH, **never credit card**.
- Leave net-terms requests, trade references, bank references, and personal-guarantee sections blank.
- File uploads (resale certificate MI Form 3372, EIN letter, licences) are NEEDS_HUMAN. Passwords and account creation are human-only.
- Leave marketing, SMS, and VIP opt-ins unchecked, and uncheck them if preset. Terms and consent boxes are for the approver.
- Signature fields may take `{{profile.signature_name}}` (the owner) and `{{profile.today}}`.

## Profile keys
`legal_name entity_type entity_short entity_state michigan_entity_number street_address city state state_name zip zip5 country country_code full_address contact_name contact_first_name contact_last_name contact_title email email_confirm phone phone_digits phone_dashed phone_area phone_prefix phone_line phone_e164 owner_name owner_first_name owner_last_name owner_title signature_name signature_title ein ein_digits amazon_seller_id website website_url sales_channel business_type payment_method ownership established_date established_year established_iso years_in_business years_in_business_text today today_iso`
(`ship_to_address` and `fax` exist but are empty. A template for an empty key returns an error instead of a value.)

## Live mode (Steel via Custodian, as in this bake-off)
The same runtime runs in the page. Inject `harness/live/hA.min.js` once per tab (see the README), then:
`__ft.setProfile({...})`, `__ft.live(__ft.snapshot({wait:6000}))`, `__ft.live(__ft.fill({...}))`, `__ft.report(...)`.
`__ft.live()` briefly hides the page so Custodian's post-call accessibility echo stays empty.
