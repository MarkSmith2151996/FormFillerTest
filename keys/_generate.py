# Draft answer keys (unreviewed) for the 31 bake-off forms. Regenerate with: python3 keys/_generate.py
# expect grammar: profile:<key>[|<key>]  choice:<opt>[|<opt>]  blank  human  checked  unchecked  any
#                 profile_or_blank:<key>  literal:<text>[|<text>]   (multiple alternatives joined with " OR ")
# Field keys ("k") are the harness readback keys: name || id || label; radios "radio:<name>"; checkboxes "name=value".
import json, os
here = os.path.dirname(__file__)
R, O = True, False
def F(k, req, expect, label=''):
    return {'k': k, 'req': req, 'expect': expect, **({'label': label} if label else {})}
K = {}
def key(slug, outcome, acceptable=None, fields=(), needs=(), notes='', source='fixture', trap=False):
    K[slug] = {'form': slug, 'unreviewed': True, 'key_source': source, 'trap': trap,
               'expected_outcome': outcome, 'acceptable_outcomes': acceptable or [outcome],
               'needs_human': list(needs), 'fields': list(fields), 'notes': notes}

key('01-blair-candy', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'BLOCKED'], source='live-recon',
    notes='Page says "complete the form below" but the Shopify Forms inline widget (forms-root-335495) stays empty in Steel: config GET 200, nothing rendered. A person must check the page or use /account/register.')
key('02-specialty-food-source', 'NEEDS_HUMAN', fields=[
    F('name', R, 'profile:owner_name', 'Owners Legal Name'), F('text', R, 'profile:legal_name'), F('text-2', R, 'profile:street_address'),
    F('text-3', O, 'blank'), F('text-4', R, 'profile:city'), F('text-5', R, 'profile:zip'), F('select', O, 'profile:country'),
    F('phone-2', R, 'profile:phone'), F('email-2', R, 'profile:email'), F('url', O, 'profile:website'),
    F('text-15', R, 'human', 'number of locations'), F('select-5', R, 'choice:Less than One year|New business', 'time in business'),
    F('text-13', R, 'human OR literal:unknown', 'items interested'), F('text-14', R, 'profile:business_type|sales_channel', 'type of business'),
    F('select-3', O, 'blank', 'loading dock'), F('text-16', R, 'human', 'receiving hours'), F('select-4', R, 'human', 'location type'),
    F('text-17', R, 'human', 'delivery instructions'), F('select-6', R, 'human', 'reach out after approval'), F('select-7', R, 'human', 'hear about us'),
    F('select-8', R, 'choice:ACH', 'payment method')],
    needs=['number of locations', 'items interested', 'receiving hours', 'location type', 'delivery instructions', 'contact preference', 'referral source'],
    notes='Samita 3-step form; fixture holds step 1. Never pick Credit Card; Net 20 is a terms request (blank).')
key('03-shop-the-king', 'NEEDS_HUMAN', fields=[
    F('customer[first_name]', R, 'profile:contact_first_name'), F('customer[last_name]', R, 'profile:contact_last_name'), F('customer[email]', R, 'profile:email'),
    F('customer[password]', R, 'human'), F('customer[password_confirmation]', R, 'human'), F('customer[phone]', R, 'profile:phone'),
    F('customer[note][Business Name]', R, 'profile:legal_name'), F('customer[note][Website]', O, 'profile:website'), F('customer[note][Business Tax ID]', O, 'profile:ein'),
    F('customer[note][Address 1]', R, 'profile:street_address'), F('customer[note][Address 2]', O, 'blank'), F('customer[note][City]', R, 'profile:city'),
    F('customer[note][State]', R, 'profile:state'), F('customer[note][Postal Code]', R, 'profile:zip'), F('customer[note][Country]', R, 'profile:country'),
    F('customer[note][Type of Business]', R, 'choice:Online Retailer|Online Wholesaler'), F('customer[note][Products Interested]', O, 'blank'),
    F('customer[note][Final Destination]', O, 'blank'), F('customer[note][DUNS]', O, 'blank'), F('customer[note][Order Volume]', R, 'human'),
    F('customer[note][Delivery Method]', R, 'human'), F('customer[note][Referral]', R, 'human'),
    F('customer[note][Resale Confirmation]=Yes', O, 'any'), F('customer[note][VIP Opt-in]=Yes', O, 'unchecked', 'paid VIP membership'),
    F('customer[sms_marketing_consent][state]=subscribed', O, 'unchecked')],
    needs=['password (account creation)', 'monthly order volume', 'delivery method', 'referral source'])
key('04-cajun-wholesale', 'NOT_A_FORM', fields=[F('NewsletterEmail', O, 'blank', 'newsletter (distractor)')],
    notes='No application form: "email a wholesale inquiry to orders@...". Route to the email channel.')
key('05-prime-wholesale', 'NEEDS_HUMAN', fields=[
    F('form_fields[name]', R, 'profile:contact_name'), F('form_fields[email]', R, 'profile:email'), F('form_fields[field_b961db6]', O, 'profile:phone'),
    F('form_fields[field_210ce40]', R, 'profile:legal_name'), F('form_fields[field_fad8593]', R, 'human', 'product category (preset Health & Household)'),
    F('form_fields[field_3c3eb32]', R, 'choice:ACH/Wire Transfer'), F('form_fields[field_b9d22ed]', R, 'human', "seller's permit upload"),
    F('form_fields[field_d5a3b72]', R, 'human', 'EIN document upload'), F('form_fields[field_26b6687]', O, 'profile:street_address'),
    F('form_fields[field_257ce7a]', O, 'profile:city'), F('form_fields[field_f6c5f32]', O, 'profile:state'), F('form_fields[field_5385f10]', O, 'profile:zip')],
    needs=["seller's permit upload", 'EIN document upload', 'product category'])
key('06-king-zak', 'NOT_A_FORM', ['NOT_A_FORM', 'NEEDS_HUMAN'], source='live-recon',
    notes='Wholesale info page; only a single email field + reCAPTCHA Enterprise; no application fields.')
key('07-hollis', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'ENTERPRISE_ONLY'], fields=[
    F('input_1', R, 'profile:legal_name', 'Store Name'), F('input_3', R, 'human', 'Account Number'), F('input_4', R, 'profile:email'),
    F('input_6', R, 'profile:contact_first_name'), F('input_17', R, 'profile:contact_last_name'), F('input_7', R, 'profile:phone'),
    F('input_8.1', R, 'profile:street_address'), F('input_8.2', O, 'blank'), F('input_8.3', R, 'profile:city'), F('input_8.4', R, 'profile:state'),
    F('input_8.5', R, 'profile:zip'), F('input_8.6', R, 'profile:country'), F('input_9', O, 'blank'),
    F('first_name_016JB91TTR00000000002MSQ41', O, 'blank', 'newsletter popup (distractor)'), F('last_name_016JB91TTR00000000002MSQ42', O, 'blank', 'newsletter popup'),
    F('email', O, 'blank', 'newsletter popup'), F('country_016JB91TTR00000000002MSQ44', O, 'blank', 'newsletter popup')],
    needs=['Hollis/Huish account number (existing dealers only)'],
    notes='Dealer form for EXISTING Hollis (scuba) accounts: required Account Number is not in the profile. Newsletter popup is a distractor.')
SH_PRODUCTS = ['sportscards', 'nonsportscards', 'collectiblecardgames', 'toys', 'supplies', 'bgminirpg', 'othertype']
SH_CCG = ['ccg_wizards', 'ccg_fnb', 'ccg_yugioh', 'ccg_pokemon', 'ccg_game', 'ccg_bushinavi', 'ccg_lorcana', 'ccg_dealer', 'ccg_ugn', 'ccg_other']
key('08-southern-hobby', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'FILLED'], fields=[
    F('businessname', O, 'profile:legal_name'), F('address', O, 'profile:street_address'), F('city', O, 'profile:city'),
    F('state', O, 'profile:state', 'preset Alabama!'), F('zipcd', O, 'profile:zip'), F('companyname', O, 'blank', 'only if different'),
    F('contactname', O, 'profile:contact_name'), F('phone', O, 'profile:phone'), F('email', O, 'profile:email')]
    + [F(c, O, 'unchecked') for c in SH_PRODUCTS] + [F('othertypetxt', O, 'blank'),
    F('aboutbusiness', O, 'profile_or_blank:business_type'), F('brickandmortar', O, 'unchecked'), F('sportscardbreaker', O, 'any', 'Online Retailer'),
    F('kiosk', O, 'unchecked'), F('vendor', O, 'unchecked'), F('amazon', O, 'checked', 'Amazon retailer'), F('ebay', O, 'unchecked'),
    F('sellonwebsite', O, 'any'), F('sellonwebsitetxt', O, 'profile_or_blank:website'), F('otherbusiness', O, 'unchecked'), F('otherbusinesstxt', O, 'blank')]
    + [F(c, O, 'unchecked') for c in SH_CCG] + [F('ccg_othertxt', O, 'blank'), F('socialmediaurls', O, 'blank'), F('servicedbyanother', O, 'blank'),
    F('radio:howdidyouhear', O, 'human', 'preset "Other"'), F('referraltxt', O, 'blank'), F('othertypenewtxt', O, 'blank'),
    F('contactmethod', O, 'any'), F('radio:resalecert', O, 'choice:Yes'), F('visual_verify_code', R, 'human', 'image security code')],
    needs=['security code (image captcha)', 'product categories', 'referral source'],
    notes='No required markers except the captcha. Preset traps: State=Alabama, How-did-you-hear=Other.')
key('09-grimco', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'PARTIAL'], fields=[
    F('userName', R, 'profile:email'), F('confirmUserName', R, 'profile:email'), F('firstName', R, 'profile:contact_first_name'),
    F('lastName', R, 'profile:contact_last_name'), F('preferredLocalizationId', R, 'any', 'preset English - US'), F('radio::r7:', R, 'choice:No', 'existing customer?')],
    needs=['later steps create an account (password)', 'fit: Grimco sells only to sign / digital print shops'],
    notes='MUI multi-step registration; fixture holds step 1.')
key('10-dhp-supply', 'FILLED', fields=[
    F('form[151_0]', R, 'profile:legal_name'), F('form[1_1]', R, 'profile:contact_first_name'), F('form[11_2]', R, 'profile:contact_last_name'),
    F('form[121_3]', R, 'profile:street_address'), F('form[101_4]', R, 'profile:city'), F('form[221_5]', R, 'profile:state'),
    F('form[131_6]', R, 'profile:zip'), F('form[31_7]', R, 'profile:phone'), F('form[21_8]', R, 'profile:email'),
    F('form[191_9_0]=Yes', O, 'unchecked', 'marketing opt-in (preset checked!)'), F('form[41_10]', O, 'blank')],
    notes='"Request a Quote" form; reCAPTCHA is solved by the approver at submit. Preset trap: email-deals opt-in is pre-checked.')
P = 'ctl00$cphBody$ctl00$'
key('11-sweis', 'NEEDS_HUMAN', fields=[
    F(P+'tbSalonName', O, 'profile:legal_name'), F(P+'tbFirstName', R, 'profile:contact_first_name'), F(P+'tbLastName', R, 'profile:contact_last_name'),
    F(P+'tbLicense', R, 'human', 'license / student ID'), F(P+'ddlLicenseState', R, 'human'), F(P+'tbLicenseExpDate', R, 'human'),
    F(P+'ddlSalonType', R, 'choice:E-Merchant', 'preset Beauty Center!'), F(P+'tbResaleTaxNumber', O, 'blank'),
    F(P+'ddlDoBMonth', O, 'blank'), F(P+'ddlDoBDay', O, 'blank'), F(P+'tbEmailAddress', R, 'profile:email'), F(P+'tbPhone', R, 'profile:phone'),
    F(P+'tbUserName', R, 'human', 'username'), F(P+'tbPassword', R, 'human'), F(P+'tbPasswordVerify', R, 'human'),
    F('radio:'+P+'rblBillingAddressType', R, 'choice:Business'), F(P+'tbBillingAddress', R, 'profile:street_address'), F(P+'tbBillingAddress2', O, 'blank'),
    F(P+'tbBillingCity', R, 'profile:city'), F(P+'ddlBillingState', R, 'human', 'Michigan not offered'), F(P+'tbBillingZip', R, 'profile:zip'),
    F(P+'cbShippingSameAsBilling', O, 'unchecked'), F('radio:'+P+'rblShippingAddressType', O, 'any'), F(P+'tbShippingAddress', R, 'human', 'ship-to not in profile'),
    F(P+'tbShippingAddress2', O, 'blank'), F(P+'tbShippingCity', R, 'human'), F(P+'ddlShippingState', R, 'human'), F(P+'tbShippingZip', R, 'human'),
    F(P+'tbCustomerNote', O, 'blank'), F(P+'cbDiversionAgreement', R, 'unchecked', 'legal consent: approver only')],
    needs=['license / student ID, state, expiry', 'username + password', 'Michigan missing from billing states', 'ship-to address'],
    notes='Licensed salon professionals only; anti-diversion policy targets non-salon resellers. Likely non-fit.')
key('12-officecrave', 'BLOCKED', source='live-recon', notes='Cloudflare "Just a moment..." challenge from Steel.')
key('13-candy-nation', 'NEEDS_HUMAN', fields=[
    F('FormField[1][1]', R, 'profile:email'), F('FormField[1][2]', R, 'human'), F('FormField[1][3]', R, 'human'),
    F('FormField[2][4]', R, 'profile:contact_first_name'), F('FormField[2][5]', R, 'profile:contact_last_name'), F('FormField[2][6]', O, 'profile:legal_name'),
    F('FormField[2][8]', R, 'profile:street_address'), F('FormField[2][9]', O, 'blank'), F('FormField[2][10]', R, 'profile:city'),
    F('FormField[2][11]', R, 'profile:country'), F('FormField[2][12]', R, 'profile:state'), F('FormField[2][13]', R, 'profile:zip'), F('FormField[2][7]', R, 'profile:phone'),
    F('radio:row-radio-buttons-group', O, 'any', 'B2B app: account type'), F('Zmlyc3RfbmFtZQ==', O, 'profile_or_blank:contact_first_name'),
    F('bGFzdF9uYW1l', O, 'profile_or_blank:contact_last_name'), F('email', O, 'profile_or_blank:email'), F('cGhvbmU=', O, 'profile_or_blank:phone'),
    F('Email me special promotions and updates', O, 'unchecked')],
    needs=['password (account creation)'],
    notes='BigCommerce native register form plus the BundleB2B wizard in a same-origin iframe (either path is fine).')
key('14-pet-drop-shipper', 'NEEDS_HUMAN', fields=[
    F('customer[first_name]', O, 'profile:contact_first_name'), F('customer[last_name]', O, 'profile:contact_last_name'),
    F('customer[email]', O, 'profile:email'), F('customer[password]', O, 'human')], needs=['password (account creation)'])
WEST = 'Michigan not offered (western states only)'
key('15-salon-services', 'NEEDS_HUMAN', fields=[
    F(P+'tbSalonName', O, 'profile:legal_name'), F(P+'tbFirstName', R, 'profile:contact_first_name'), F(P+'tbLastName', R, 'profile:contact_last_name'),
    F(P+'tbSalonSchoolAddress1', R, 'profile:street_address'), F(P+'tbSalonSchoolAddress2', O, 'blank'), F(P+'tbSalonSchoolCity', R, 'profile:city'),
    F(P+'ddlSalonSchoolState', R, 'human', WEST), F(P+'tbSalonSchoolZip', R, 'profile:zip'), F(P+'tbLicense', R, 'human'), F(P+'ddlLicenseState', R, 'human'),
    F(P+'tbLicenseExpiration', R, 'human'), F(P+'ddlCustomerTypeCode', R, 'human'), F(P+'ddlCustomerClassCode', R, 'human'), F(P+'ddlBrands', O, 'blank'),
    F(P+'fuProLicense', O, 'human'), F(P+'tbEmailAddress', R, 'profile:email'), F(P+'tbPhone', R, 'profile:phone'), F(P+'tbMobilePhone', O, 'profile_or_blank:phone'),
    F(P+'ddlSalesRep', O, 'blank'), F(P+'tbTaxExempt', O, 'blank'), F(P+'fuResaleCert', O, 'human')]
    + [F(P+c, O, 'unchecked') for c in ['cbReferredGiveAway', 'cbReferredOnlineSearch', 'cbReferredSocialMedia', 'cbReferredAtSchool', 'cbReferralEmail', 'cbReferredIndustryEvent', 'cbReferredOther']]
    + [F(P+'tbBillingAddress', R, 'profile:street_address'), F(P+'tbBillingAddress2', O, 'blank'), F(P+'tbBillingCity', R, 'profile:city'),
    F(P+'ddlBillingState', R, 'human', WEST), F(P+'tbBillingZip', R, 'profile:zip'), F(P+'cbShippingSameAsBilling', O, 'unchecked'),
    F(P+'tbShippingAddress', O, 'blank'), F(P+'tbShippingAddress2', O, 'blank'), F(P+'tbShippingCity', O, 'blank'), F(P+'ddlShippingState', O, 'blank'),
    F(P+'tbShippingZip', O, 'blank'), F(P+'cbDiversionAgreement', R, 'unchecked'), F('radio:'+P+'rbOptInText', O, 'choice:No', 'SMS/email opt-in preset Yes!'),
    F('cphBody_ctl00_cbOptInInvoice', O, 'unchecked'), F('cphBody_ctl00_cbOptInShipment', O, 'unchecked'), F('cphBody_ctl00_cbOptInMarketing', O, 'unchecked')],
    needs=['license / student ID', 'Michigan missing from state lists', 'type / class code', 'license + resale certificate uploads'],
    notes='Salon professionals in 10 western states only; non-fit for a Michigan e-commerce reseller.')
key('16-patterson-dental', 'LOGIN_GATED', fields=[F('Email Address', O, 'blank'), F('Password', O, 'blank')],
    notes='/account/register redirects to Azure AD B2C sign-in; sign-up needs an emailed verification code (forbidden).')
key('17-unfi', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'ENTERPRISE_ONLY'], source='task+live',
    notes='Salesforce LWC lead form. eCommerce path redirects to Everyday Supply Co.; only Truck Deliveries is a real UNFI application. Classify, do not force-fill.')
for slug in ['18-isi', '19-gfs', '20-us-foods', '21-wheel-pros', '24-odp', '25-napa-corpbill']:
    key(slug, 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'PARTIAL', 'FILLED'], source='live-recon (fields drafted at first live visit)')
key('22-meyer', 'NEEDS_HUMAN', ['NEEDS_HUMAN', 'PARTIAL'], source='task+live', notes='Terms page before the application; accepting terms is a server postback (blocked by the guard).')
key('23-dandh', 'BLOCKED', ['BLOCKED', 'NEEDS_HUMAN'], source='task+live', notes='Known to block automation.')
key('26-weiners', 'LOGIN_GATED', ['LOGIN_GATED'], source='task', trap=True, notes='Shopify email-code login; a retailer.')
key('27-paper-enterprises', 'NOT_A_FORM', source='task', trap=True, notes='Contact page.')
key('28-arett-pdf', 'PDF_APPLICATION', source='task', trap=True, notes='Credit application PDF.')
key('29-cardinal-health', 'ENTERPRISE_ONLY', ['ENTERPRISE_ONLY', 'NOT_A_FORM'], source='task', trap=True, notes='Enterprise-only / contact page.')
key('30-canadian-linen', 'NOT_A_FORM', source='task', trap=True, notes='Contact page, non-fit.')
key('31-wholesale-point', 'LOGIN_GATED', source='task', trap=True, notes='Login page.')
for slug, k in K.items():
    json.dump(k, open(os.path.join(here, slug + '.json'), 'w'), indent=1)
print(len(K), 'keys')
