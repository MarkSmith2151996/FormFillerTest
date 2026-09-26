/* Shared dealer-profile derivation. Plain script (no imports) so the SAME source runs in Node
   (profile/loader.mjs evaluates it) and inside a page (the live injections concatenate it).
   Input: the base profile (dealer_profile.yaml keys + task facts). Output: base + derived keys.
   Derivations only reformat facts already in the profile; nothing is invented. */
function ffDeriveProfile(base) {
  var p = {};
  for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k) && k.charAt(0) !== '_') p[k] = base[k] == null ? '' : String(base[k]);
  var STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
  function split(name) { var t = (name || '').trim().split(/\s+/); return t.length < 2 ? [t[0] || '', ''] : [t[0], t[t.length - 1]]; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var c = split(p.contact_name), o = split(p.owner_name);
  if (p.contact_name) { p.contact_first_name = c[0]; p.contact_last_name = c[1]; }
  if (p.owner_name) { p.owner_first_name = o[0]; p.owner_last_name = o[1]; p.signature_name = p.owner_name; }
  if (p.owner_title) p.signature_title = p.owner_title;
  if (p.email) p.email_confirm = p.email;
  if (p.state) { p.state = p.state.trim(); p.state_name = STATES[p.state.toUpperCase()] || p.state; }
  if (p.street_address || p.city) { p.country = 'United States'; p.country_code = 'US'; }
  if (p.zip) p.zip5 = p.zip.replace(/[^0-9]/g, '').slice(0, 5);
  if (p.street_address && p.city && p.state && p.zip) p.full_address = p.street_address + ', ' + p.city + ', ' + p.state + ' ' + p.zip;
  if (p.phone) {
    var d = p.phone.replace(/[^0-9]/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    p.phone_digits = d;
    if (d.length === 10) { p.phone_dashed = d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6); p.phone_area = d.slice(0,3); p.phone_prefix = d.slice(3,6); p.phone_line = d.slice(6); p.phone_e164 = '+1' + d; }
  }
  if (p.ein) p.ein_digits = p.ein.replace(/[^0-9]/g, '');
  if (p.ein) p.mi_sales_tax_account = p.ein;
  if (p.website) p.website_url = /^https?:\/\//i.test(p.website) ? p.website : 'https://' + p.website;
  if (p.entity_type || p.legal_name) {
    var et = (p.entity_type || '') + ' ' + (p.legal_name || '');
    p.entity_short = /\bL\.?L\.?C\.?\b/i.test(et) ? 'LLC' : /\bcorp|\binc\b/i.test(et) ? 'Corporation' : '';
    var m = (p.entity_type || '').match(/^([A-Za-z ]+?)\s+(LLC|Corporation|Corp|Inc)/i); if (m) p.entity_state = m[1].trim();
  }
  if (p.ship_to_state) p.ship_to_state_name = STATES[p.ship_to_state.trim().toUpperCase()] || p.ship_to_state;
  if (p.established_date) {
    var e = p.established_date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) || [];
    var iso = p.established_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var Y = e[3] || (iso && iso[1]), M = e[1] || (iso && iso[2]), D = e[2] || (iso && iso[3]);
    if (Y) {
      p.established_year = Y; p.established_month = pad(+M); p.established_iso = Y + '-' + pad(+M) + '-' + pad(+D);
      var yrs = Math.floor((Date.now() - new Date(+Y, +M - 1, +D).getTime()) / (365.25 * 864e5));
      p.years_in_business = String(Math.max(0, yrs)); p.years_in_business_text = yrs < 1 ? 'Less than 1 year' : yrs === 1 ? '1 year' : yrs + ' years';
    }
  }
  var t = new Date(); p.today = pad(t.getMonth() + 1) + '/' + pad(t.getDate()) + '/' + t.getFullYear(); p.today_iso = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  return p;
}
