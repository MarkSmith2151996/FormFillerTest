// Shared dealer-profile loader for all three versions and the harness.
// Offline runs use profile/synthetic.json. The REAL profile is never written to this repo:
// live runs read it from Custodian read_shared_file(fba-command-center, dealer-profile/dealer_profile.yaml)
// and pass it straight into the browser page (see harness/inpage/).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const deriveSource = fs.readFileSync(path.join(here, 'derive.js'), 'utf8');
export const deriveProfile = new Function(`${deriveSource}\nreturn ffDeriveProfile;`)();

export function loadProfile(file = process.env.FF_PROFILE || path.join(here, 'synthetic.json')) {
  return deriveProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// "{{profile.key}}" -> value. A missing or empty key is an error: the driver must mark the field NEEDS_HUMAN.
export function resolveTemplates(str, profile) {
  return String(str).replace(/\{\{\s*profile\.([a-z0-9_]+)\s*\}\}/gi, (_, k) => {
    const v = profile[k];
    if (v === undefined || v === '') throw new Error(`profile.${k} is empty or unknown -> NEEDS_HUMAN`);
    return v;
  });
}

// Scoring treats reformatted variants of one fact as the same family.
const FAMILY = {
  phone_digits: 'phone', phone_dashed: 'phone', phone_e164: 'phone', state_name: 'state', country_code: 'country',
  zip5: 'zip', ein_digits: 'ein', website_url: 'website', email_confirm: 'email', signature_name: 'owner_name',
  signature_title: 'owner_title', established_iso: 'established_date', years_in_business_text: 'years_in_business',
  today_iso: 'today',
  // CS-588 ship-to keys: a state/street/country field may carry either spelling of the same value
  ship_to_state_name: 'ship_to_state', ship_to_street_full: 'ship_to_street', ship_to_country: 'country',
};
export const familyOf = (k) => (k ? FAMILY[k] || k : k);
