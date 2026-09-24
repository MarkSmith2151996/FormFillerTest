/* Version A: Form Toolkit, in-page runtime (brain-agnostic).
   Any driver calls window.__ft.*: Claude through the MCP server / CLI (Playwright page.evaluate),
   Claude through Custodian evaluate_js on the Steel browser, or any other LLM later.
   Observations are compact text. Values are literals or {{profile.key}} templates resolved here
   from setProfile(), so a driver never has to handle raw dealer data.
   Safety floor below the brain: password / card / SSN / bank / file fields are never filled,
   honeypots are hidden from the driver, next() never clicks submit-like controls.
   Requires ffDeriveProfile (profile/derive.js) to be loaded first. */
(function () {
  if (window.__ft && window.__ft.v >= 1) return;
  var FT = window.__ft = { v: 1, els: {}, meta: {}, profile: null, done: {}, pre: {} };
  var SUBMITISH = /submit|apply|register|create|sign ?up|send|finish|complete|place order|confirm|join|request|save|enroll|get started|log ?in|sign ?in/i;
  var SENSITIVE = [
    [/password|passcode|\bpin\b/i, 'password', 'human-only (account creation)'],
    [/card ?(number|no|#)|credit ?card|\bcvv|\bcvc|security code|expir(y|ation)/i, 'card', 'never (no credit cards)'],
    [/\bssn\b|social security|driver'?s? licen[cs]e/i, 'ssn', 'never (personal id)'],
    [/routing|account ?(number|no|#)|\biban\b|bank ?(name|account|reference)/i, 'bank', 'never (bank data / references)']
  ];
  var ST = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };

  // ---------- DOM helpers (composed tree: open shadow roots + same-origin iframes) ----------
  function walk(n, out) {
    for (var el = n.firstElementChild; el; el = el.nextElementSibling) {
      out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, out);
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') { try { var d = el.contentDocument; if (d && d.documentElement) walk(d, out); } catch (_) {} }
      walk(el, out);
    }
    return out;
  }
  function up(n) { return n.parentElement || (n.parentNode && n.parentNode.host) || null; }
  function txt(n) { return ((n && n.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s.,:*()\-_/]+/g, ' ').trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function win(el) { return el.ownerDocument.defaultView; }
  function css(el) { return win(el).getComputedStyle(el); }
  function cls(el) { return typeof el.className === 'string' ? el.className : ''; }
  function vis(el) {
    if (!el.isConnected) return false;
    var cs = css(el), r = el.getBoundingClientRect(), w = win(el), t = (el.type || '').toLowerCase();
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    for (var a = el, i = 0; a && i < 8; a = up(a), i++) if (a.nodeType === 1 && (css(a).display === 'none' || a.getAttribute('aria-hidden') === 'true' && /INPUT|SELECT|TEXTAREA/.test(el.tagName) && a !== el)) return false;
    if ((t === 'checkbox' || t === 'radio') && (r.width < 2 || r.height < 2 || +cs.opacity === 0)) {
      var l = el.labels && el.labels[0]; if (l) { var lr = l.getBoundingClientRect(); return lr.width > 1 && lr.height > 1; }
    }
    if (r.width < 2 || r.height < 2) return false;
    if (r.right + w.scrollX < -20 || r.bottom + w.scrollY < -20) return false;
    return true;
  }
  function lblText(l) { var c = l.cloneNode(true), x = c.querySelectorAll('select,option,input,textarea,button'); for (var i = 0; i < x.length; i++) x[i].remove(); return txt(c); }
  function near(el, maxLvl) {
    var n = el;
    for (var lvl = 0; lvl < (maxLvl || 3) && n; lvl++) {
      for (var s = n.previousSibling; s; s = s.previousSibling) {
        if (s.nodeType === 3 && s.textContent.trim()) return s.textContent.trim();
        if (s.nodeType !== 1) continue;
        if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(s.tagName) || (lvl > 0 && /^H[12]$/.test(s.tagName))) break;
        var t = txt(s); if (t && t.length < 90 && !s.querySelector('input,select,textarea')) return t; if (t) break;
      }
      n = n.parentElement;
    }
    return '';
  }
  function rawLabel(el) {
    var root = el.getRootNode(), doc = el.ownerDocument, t = '', ids = el.getAttribute('aria-labelledby');
    if (ids) t = ids.split(/\s+/).map(function (i) { return txt((root.getElementById && root.getElementById(i)) || doc.getElementById(i)); }).join(' ');
    if (!t && el.labels && el.labels.length) t = lblText(el.labels[0]);
    if (!t) t = el.getAttribute('aria-label') || near(el, 1) || el.getAttribute('placeholder') || near(el, 3) || el.getAttribute('title') || '';
    if (!t && (el.name || el.id)) t = String(el.name || el.id).replace(/[\[\]_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return t.replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
  }
  function section(el) {
    for (var a = el, i = 0; a && i < 7; a = up(a), i++) {
      if (a !== el && a.tagName === 'FIELDSET' && a.querySelectorAll('input:not([type=radio]):not([type=checkbox]),select,textarea').length) { var lg = a.querySelector('legend'); if (lg && txt(lg)) return txt(lg).replace(/\s*\*\s*/g, ' ').trim().slice(0, 60); }
      for (var s = a.previousElementSibling, j = 0; s && j < 40; s = s.previousElementSibling, j++) {
        if (/^H[2-6]$|^LEGEND$/.test(s.tagName) || /(^|\s)(section|panel|card|form)?-?(title|heading|header)(\s|$)/i.test(cls(s))) { var t = txt(s); if (t && t.length < 70) return t; }
        if (s.querySelector && s.querySelector('h2,h3,h4,h5,h6,legend')) break;
      }
    }
    return '';
  }
  function required(el, lab) {
    if (el.required || el.getAttribute('aria-required') === 'true' || /\*|\(required\)/i.test(lab)) return true;
    for (var a = el, i = 0; a && i < 3; a = up(a), i++) if (a.nodeType === 1 && /(^|[\s_-])(is-)?required(?![a-z])|gfield_contains_required/i.test(cls(a))) return true;
    return false;
  }
  function kind(el) {
    var tag = el.tagName, t = (el.type || '').toLowerCase(), role = el.getAttribute('role');
    if (tag === 'SELECT') return 'sel';
    if (tag === 'TEXTAREA') return 'ta';
    if (tag === 'INPUT') {
      if (t === 'checkbox') return 'cb'; if (t === 'radio') return 'radio'; if (t === 'file') return 'file'; if (t === 'password') return 'pw';
      if (role === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') return 'combo';
      return { email: 'email', tel: 'tel', number: 'num', date: 'date', url: 'url' }[t] || 't';
    }
    if (role === 'combobox' || role === 'listbox') return 'combo';
    if (role === 'checkbox' || role === 'switch') return 'cb';
    if (role === 'radio') return 'radio';
    return 't';
  }
  function isCtrl(el) {
    var tag = el.tagName, t = (el.type || '').toLowerCase(), role = el.getAttribute('role');
    if (tag === 'INPUT') return !/^(hidden|submit|button|reset|image)$/.test(t);
    if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (role && /^(combobox|listbox|checkbox|radio|switch|textbox)$/.test(role)) return !el.querySelector('input,select,textarea');
    return el.isContentEditable && el.getAttribute('contenteditable') != null;
  }
  function honeypot(el, lab) {
    if (/leave (this|it)? ?(field )?(blank|empty)|do not (fill|enter)|honey ?pot|if you are (a )?human/i.test(lab)) return true;
    var n = (el.name || '') + ' ' + (el.id || '');
    return /(^|_)hp(_|$)|honeypot|bot_?field|fax_only/i.test(n) && el.tabIndex < 0;
  }
  function sensitive(el, lab) {
    if ((el.type || '').toLowerCase() === 'password') return ['password', 'human-only (account creation)'];
    var ac = el.getAttribute('autocomplete') || '';
    if (/^cc-/.test(ac)) return ['card', 'never (no credit cards)'];
    for (var i = 0; i < SENSITIVE.length; i++) if (SENSITIVE[i][0].test(lab + ' ' + (el.name || ''))) return [SENSITIVE[i][1], SENSITIVE[i][2]];
    if (kind(el) === 'file') return ['file', 'NEEDS_HUMAN (no document uploads)'];
    return null;
  }
  function isPh(o) { return !o || o.value === '' || /^(-+|select|choose|please|pick|none selected)/i.test(txt(o)); }
  function optionsOf(el) {
    if (el.tagName === 'SELECT') return [].slice.call(el.options).filter(function (o) { return !isPh(o); }).map(function (o) { return txt(o); });
    var s = assocSelect(el); if (s) return optionsOf(s);
    var lb = el.getAttribute('aria-controls') || el.getAttribute('aria-owns'), box = lb && el.getRootNode().getElementById && el.getRootNode().getElementById(lb);
    return box ? [].slice.call(box.querySelectorAll('[role=option]')).map(txt).filter(Boolean) : null;
  }
  function assocSelect(el) {
    var w = el.closest && el.closest('.select2-container,.chosen-container,.nice-select,.bootstrap-select,.selectize-control,.choices,.ss-main,.dropdown.bootstrap-select');
    var sib = w ? [w.previousElementSibling, w.nextElementSibling, w.querySelector('select'), w.parentElement && w.parentElement.querySelector('select')] : [];
    for (var i = 0; i < sib.length; i++) if (sib[i] && sib[i].tagName === 'SELECT') return sib[i];
    return null;
  }
  function currentValue(el, k) {
    if (k === 'sel') { var o = el.options[el.selectedIndex]; return isPh(o) ? '' : txt(o); }
    if (k === 'cb') return (el.checked || el.getAttribute('aria-checked') === 'true') ? 'on' : '';
    if (k === 'combo') { if (el.tagName === 'INPUT') return el.value || ''; var s = assocSelect(el); if (s) return currentValue(s, 'sel'); var t = txt(el); return /^(select|choose|please|-)/i.test(t) ? '' : t; }
    if (k === 'file') return el.files && el.files.length ? 'file' : '';
    return el.value != null ? String(el.value) : txt(el);
  }
  function listDesc(opts) {
    if (!opts) return '';
    var n = opts.map(norm), st = 0, i;
    for (i = 0; i < n.length; i++) if (ST[opts[i].toUpperCase()] || Object.keys(ST).some(function (k) { return norm(ST[k]) === n[i]; })) st++;
    if (st >= 40) return ' [US states' + (opts.length > 60 ? ' + more' : '') + ']';
    if (opts.length > 100 && n.indexOf('afghanistan') >= 0 || n.indexOf('albania') >= 0 && opts.length > 100) return ' [countries]';
    var show = opts.slice(0, 30).map(function (o) { return o.length > 40 ? o.slice(0, 40) + '…' : o; });
    return ' {' + show.join('|') + (opts.length > 30 ? '|…+' + (opts.length - 30) : '') + '}';
  }
  function buttons(scope) {
    return walk(scope || document, []).filter(function (b) {
      return (b.tagName === 'BUTTON' || (b.tagName === 'INPUT' && /^(submit|button)$/i.test(b.type)) || b.getAttribute('role') === 'button' || (b.tagName === 'A' && /btn|button/i.test(cls(b)))) && vis(b);
    }).map(function (b) { return { el: b, t: (txt(b) || b.value || b.getAttribute('aria-label') || '').slice(0, 40) }; }).filter(function (b) { return b.t; });
  }

  // ---------- observation ----------
  FT.setProfile = function (base) { FT.profile = ffDeriveProfile(base); return Object.keys(FT.profile).length; };
  FT.snapshot = async function (opt) {
    opt = opt || {};
    var until = Date.now() + (opt.wait || 0), ctrls;
    do {
      ctrls = walk(document, []).filter(isCtrl).filter(vis);
      if (ctrls.length || Date.now() >= until) break;
      await sleep(400);
    } while (true);
    FT.els = {}; FT.meta = {};
    var lines = [], lastSec = null, lastForm = null, groups = {}, id = 0, nreq = 0, flags = {};
    ctrls.forEach(function (el) {
      var k = kind(el), lab = rawLabel(el);
      if (honeypot(el, lab)) return;
      var gname = k === 'radio' ? (el.name || (el.parentElement && el.parentElement.id) || lab) : null;
      if (gname && groups[gname]) { groups[gname].radios.push(el); return; }
      var fid = 'f' + (++id), req = required(el, lab), clean = lab.replace(/\s*\*\s*/g, ' ').replace(/\(required\)/i, '').trim().slice(0, 70);
      var form = el.form || (el.closest && el.closest('form')), sec = section(gname ? (el.closest('fieldset') || el) : el);
      if (gname) { var fs0 = el.closest('fieldset'), lg0 = fs0 && fs0.querySelector('legend'); if (/\*/.test(lg0 ? txt(lg0) : near(el.parentElement, 2)) || el.required) req = true; }
      if (form && form !== lastForm) { lastForm = form; var fb = buttons(form).map(function (b) { return b.t; }); lines.push('## form' + (form.id ? ' #' + form.id : '') + (form.getAttribute('action') ? ' action=' + form.getAttribute('action').slice(0, 50) : '') + (fb.length ? ' buttons[' + fb.slice(0, 4).join('|') + ']' : '')); }
      if (sec && sec !== lastSec) { lastSec = sec; lines.push('# ' + sec); }
      lines.push({ fid: fid });
      var m = FT.meta[fid] = { k: k, label: clean, req: req, sec: sec };
      FT.els[fid] = el;
      if (gname) { m.radios = groups[gname] = { radios: [el] }; m.label = groupLabel(el) || clean; }
      var sens = sensitive(el, clean);
      if (sens) { m.block = sens[0]; flags[sens[0]] = (flags[sens[0]] || 0) + 1; }
      if (req) nreq++;
      FT.pre[fid] = FT.pre[fid] != null ? FT.pre[fid] : currentValue(el, k);
      m.line = function () {
        var cur = m.radios ? (m.radios.radios.filter(function (r) { return r.checked; }).map(rawLabel)[0] || '') : currentValue(el, k);
        var s = fid + ' ' + k + (req ? '*' : '') + ' ' + (m.radios ? groupLabel(m.radios.radios[0]) || clean : clean);
        if (m.block) return s + ' !' + sens[1];
        if (m.radios) s += ' {' + m.radios.radios.map(function (r) { return rawLabel(r).slice(0, 40); }).join('|') + '}';
        else if (k === 'sel' || k === 'combo') s += listDesc(optionsOf(el));
        if (cur) s += ' ="' + String(cur).slice(0, 50) + '"' + (FT.done[fid] ? '' : cur === FT.pre[fid] ? ' (preset!)' : '');
        return s;
      };
    });
    lines = lines.map(function (l) { return typeof l === 'string' ? l : FT.meta[l.fid].line(); });
    var h1 = document.querySelector('h1'), capt = document.querySelector('iframe[src*="recaptcha"],.g-recaptcha,iframe[src*="hcaptcha"],.cf-turnstile,iframe[src*="turnstile"]');
    var xo = [].slice.call(document.querySelectorAll('iframe')).filter(function (f) { try { return !f.contentDocument; } catch (_) { return true; } }).filter(vis).map(function (f) { return (f.src || '').replace(/^https?:\/\//, '').slice(0, 40); }).filter(function (s) { return !/recaptcha|hcaptcha|turnstile|pixel|analytics|youtube|vimeo|maps/.test(s); });
    var head = 'PAGE ' + document.title.slice(0, 70) + ' | ' + location.host + location.pathname.slice(0, 60) + (h1 ? ' | h1: ' + txt(h1).slice(0, 60) : '') +
      '\nFIELDS ' + id + ' (' + nreq + ' required)' + (capt ? ' | captcha' : '') + Object.keys(flags).map(function (f) { return ' | ' + f + ':' + flags[f]; }).join('') + (xo.length ? ' | cross-origin iframes: ' + xo.join(', ') : '');
    return head + (lines.length ? '\n' + lines.join('\n') : '\n(no fillable fields; try classify())');
  };
  function groupLabel(r) {
    var fs = r.closest('fieldset'), lg = fs && fs.querySelector('legend');
    if (lg) return txt(lg).replace(/\*/g, '').trim().slice(0, 70);
    var box = r.parentElement; for (var i = 0; i < 3 && box; i++) { var t = near(box); if (t) return t.replace(/\*/g, '').trim().slice(0, 70); box = box.parentElement; }
    return '';
  }

  // ---------- actions ----------
  function resolve(v) {
    if (typeof v !== 'string') return v;
    return v.replace(/\{\{\s*profile\.([a-z0-9_]+)\s*\}\}/gi, function (_, key) {
      var val = FT.profile && FT.profile[key];
      if (val == null || val === '') throw new Error('profile.' + key + ' empty -> NEEDS_HUMAN');
      return val;
    });
  }
  function fire(el, type) { var W = win(el), E = type === 'input' ? W.InputEvent || W.Event : W.Event; el.dispatchEvent(new E(type, { bubbles: true, composed: true })); }
  function press(el) {
    var W = win(el), r = el.getBoundingClientRect(), o = { bubbles: true, composed: true, cancelable: true, view: W, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) { var C = /^pointer/.test(t) ? (W.PointerEvent || W.MouseEvent) : W.MouseEvent; el.dispatchEvent(new C(t, o)); });
  }
  function same(a, b) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    if (norm(a) === norm(b)) return true;
    var da = a.replace(/\D/g, ''), db = b.replace(/\D/g, '');
    return db.length >= 4 && da === db && a.replace(/[\d\s()+.\-\/]/g, '') === '' ;
  }
  function setVal(el, v) {
    var W = win(el), proto = el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) d.set.call(el, v); else el.textContent = v;
  }
  async function typeText(el, v) {
    if ((el.type || '').toLowerCase() === 'date') { var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) v = m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
    try { el.focus({ preventScroll: true }); } catch (_) {}
    setVal(el, v); fire(el, 'input'); fire(el, 'change');
    if (!same(currentValue(el, 't'), v)) { // masked inputs: replay character by character
      setVal(el, ''); fire(el, 'input');
      for (var i = 0; i < v.length; i++) { setVal(el, (el.value || '') + v[i]); fire(el, 'input'); }
      fire(el, 'change');
    }
    try { el.blur(); } catch (_) {}
    await sleep(0);
    var got = currentValue(el, 't');
    return same(got, v) ? 'ok' : 'MISMATCH got "' + String(got).slice(0, 40) + '"';
  }
  var ALIAS = { 'united states': ['united states of america', 'usa', 'us', 'u s', 'u s a', 'united states'] };
  function pickOption(sel, want) {
    var W = norm(want), al = ALIAS[W] || [W], opts = [].slice.call(sel.options).filter(function (o) { return !isPh(o); });
    for (var ab in ST) { if (norm(ST[ab]) === W) al = al.concat([norm(ab)]); if (norm(ab) === W) al = al.concat([norm(ST[ab])]); }
    function t(o) { return norm(txt(o)); } function v(o) { return norm(o.value); }
    return opts.filter(function (o) { return t(o) === W || v(o) === W; })[0] ||
      opts.filter(function (o) { return al.indexOf(t(o)) >= 0 || al.indexOf(v(o)) >= 0; })[0] ||
      opts.filter(function (o) { return t(o).indexOf(W) === 0; })[0] ||
      opts.filter(function (o) { return W.length >= 4 && t(o).indexOf(W) >= 0; })[0] ||
      opts.filter(function (o) { return t(o).length >= 4 && W.indexOf(t(o)) >= 0; })[0] || null;
  }
  function setSelect(sel, o) {
    var d = Object.getOwnPropertyDescriptor(win(sel).HTMLSelectElement.prototype, 'value');
    d.set.call(sel, o.value); sel.selectedIndex = [].indexOf.call(sel.options, o);
    fire(sel, 'input'); fire(sel, 'change');
    try { var jq = win(sel).jQuery; if (jq) jq(sel).trigger('change'); } catch (_) {}
  }
  function optionEls() { return walk(document, []).filter(function (e) { return (e.getAttribute('role') === 'option' || /select2-results__option|chosen-results li|ss-option|choices__item--choice|dropdown-item|react-select__option|MuiMenuItem/.test(cls(e) + (e.parentElement && /chosen-results/.test(cls(e.parentElement)) ? ' chosen-results li' : ''))) && vis(e); }); }
  async function choose(fid, want) {
    var el = FT.els[fid], m = FT.meta[fid];
    if (m.radios) {
      var rs = m.radios.radios, W = norm(want), r = rs.filter(function (x) { return norm(rawLabel(x)) === W || norm(x.value) === W; })[0] || rs.filter(function (x) { return norm(rawLabel(x)).indexOf(W) === 0; })[0] || rs.filter(function (x) { return W.length >= 3 && norm(rawLabel(x)).indexOf(W) >= 0; })[0];
      if (!r) return 'NO-OPTION "' + want + '"';
      (vis(r) || !(r.labels && r.labels[0]) ? r : r.labels[0]).click(); await sleep(50);
      return r.checked ? 'ok "' + rawLabel(r).slice(0, 40) + '"' : 'UNVERIFIED';
    }
    var sel = el.tagName === 'SELECT' ? el : assocSelect(el);
    if (sel) {
      var o = pickOption(sel, want);
      if (!o) return 'NO-OPTION "' + want + '"' + listDesc(optionsOf(sel)).slice(0, 300);
      setSelect(sel, o); await sleep(60);
      return sel.options[sel.selectedIndex] === o ? 'ok "' + txt(o).slice(0, 40) + '"' : 'UNVERIFIED';
    }
    press(el); await sleep(350);
    var inp = el.tagName === 'INPUT' ? el : el.querySelector('input');
    if (inp) { setVal(inp, want); fire(inp, 'input'); await sleep(600); }
    var W2 = norm(want), cand = optionEls(), hit = cand.filter(function (e) { return norm(txt(e)) === W2; })[0] || cand.filter(function (e) { return norm(txt(e)).indexOf(W2) === 0; })[0] || cand.filter(function (e) { return W2.length >= 3 && norm(txt(e)).indexOf(W2) >= 0; })[0];
    if (!hit && inp && !cand.length) { fire(inp, 'change'); try { inp.blur(); } catch (_) {} await sleep(50); return same(inp.value, want) ? 'ok (typed; no suggestion list)' : 'NO-OPTION "' + want + '" (typeahead cleared)'; }
    if (!hit) { press(document.body); return 'NO-OPTION "' + want + '" visible{' + cand.slice(0, 12).map(function (e) { return txt(e).slice(0, 30); }).join('|') + '}'; }
    press(hit); await sleep(300);
    var now = currentValue(el, 'combo') || (inp && inp.value) || '';
    return norm(now).indexOf(norm(txt(hit))) >= 0 || norm(txt(hit)).indexOf(norm(now)) >= 0 && now ? 'ok "' + txt(hit).slice(0, 40) + '"' : 'UNVERIFIED shows "' + now.slice(0, 40) + '"';
  }
  async function check(fid, on) {
    var el = FT.els[fid], want = !(on === false || /^(off|false|no|0|uncheck)$/i.test(String(on)));
    var isOn = function () { return !!(el.checked || el.getAttribute('aria-checked') === 'true'); };
    if (isOn() !== want) { var tgt = vis(el) && el.getBoundingClientRect().width > 1 ? el : (el.labels && el.labels[0]) || el; if (tgt === el && !el.labels) press(el); else tgt.click(); await sleep(50); }
    return isOn() === want ? 'ok ' + (want ? 'on' : 'off') : 'UNVERIFIED';
  }
  FT.fill = async function (spec) {
    var out = [];
    for (var fid in spec) {
      var el = FT.els[fid], m = FT.meta[fid], raw = spec[fid], res;
      if (!el) { out.push(fid + ' ?unknown id (snapshot again)'); continue; }
      if (m.block) { out.push(fid + ' REFUSED ' + m.block + ': ' + (sensitive(el, m.label) || [0, ''])[1]); continue; }
      try {
        var v = resolve(raw);
        if (m.k === 'cb') res = await check(fid, v);
        else if (m.radios || m.k === 'sel' || m.k === 'combo') res = v === '' ? 'skipped' : await choose(fid, v);
        else res = await typeText(el, String(v));
      } catch (e) { res = 'ERR ' + e.message; }
      if (/^ok/.test(res)) FT.done[fid] = { label: m.label, src: typeof raw === 'string' && /\{\{/.test(raw) ? raw.replace(/[{}\s]|profile\./g, '') : (typeof raw === 'boolean' ? 'check' : 'literal') };
      out.push(fid + ' ' + res);
    }
    return out.join('\n');
  };
  FT.choose = function (fid, opt) { var s = {}; s[fid] = opt; return FT.fill(s); };
  FT.check = function (fid, on) { var s = {}; s[fid] = on === undefined ? true : on; return FT.fill(s); };
  FT.next = async function () {
    var b = buttons().filter(function (x) { return /^(next|continue|proceed|next step|go to step|›|»|→)/i.test(x.t) && !SUBMITISH.test(x.t); })[0];
    if (!b) return 'NEXT none: no safe Next/Continue control (submit-like controls are never clicked)';
    if (b.el.type === 'submit') return 'NEXT REFUSED: "' + b.t + '" is a form submit (server round-trip). Stop here: PARTIAL / NEEDS_HUMAN';
    press(b.el); await sleep(900);
    return 'NEXT clicked "' + b.t + '"\n' + await FT.snapshot({ wait: 3000 });
  };
  FT.classify = function () {
    var body = txt(document.body).slice(0, 20000), title = document.title, ev = [];
    var ctrls = walk(document, []).filter(isCtrl).filter(vis), labs = ctrls.map(function (e) { return rawLabel(e).toLowerCase(); });
    var pw = ctrls.filter(function (e) { return e.type === 'password'; }).length;
    var biz = labs.filter(function (l) { return /tax|\bein\b|fein|resale|federal|years in|\bdba\b|legal (business )?name|business type|type of business|annual|reseller|seller id|sales channel/.test(l); }).length;
    var h1t = txt(document.querySelector('h1'));
    var contact = ctrls.some(function (e) { return e.tagName === 'TEXTAREA'; }) && biz === 0 && (/contact/i.test(title + ' ' + h1t) || labs.every(function (l) { return /name|e-?mail|phone|subject|message|comment|question|inquir|how can|zip|company|captcha|topic|reason|department/.test(l); }));
    if (document.contentType === 'application/pdf' || document.querySelector('embed[type="application/pdf"]')) return 'CLASS PDF_APPLICATION | document is a PDF';
    if (/just a moment|attention required|access denied|verify you are human|are you a robot|request unsuccessful|pardon our interruption|you have been blocked|403 forbidden|bot detection/i.test(title + ' ' + body.slice(0, 600)) || (document.querySelector('#challenge-form,iframe[src*="challenges.cloudflare.com"]') && ctrls.length < 2)) return 'CLASS BLOCKED | challenge/WAF page: "' + title.slice(0, 60) + '"';
    ev.push(ctrls.length + ' fields, ' + biz + ' business-type fields, ' + pw + ' password');
    var pdfs = [].slice.call(document.querySelectorAll('a[href*=".pdf"]')).filter(function (a) { return /application|credit|account|dealer|wholesale|reseller/i.test(txt(a) + a.href); }).map(function (a) { return txt(a).slice(0, 40); });
    if (pdfs.length) ev.push('PDF links: ' + pdfs.slice(0, 3).join('; '));
    var login = /sign ?in|log ?in/i.test(buttons().map(function (b) { return b.t; }).join(' ') + ' ' + title);
    var codeLogin = /one-time|verification code|we('|’)ll send (you )?a code|send code|enter (the|your) code/i.test(body.slice(0, 5000));
    var enterprise = /contact (your|a|our) (local )?(sales )?(rep|representative|account manager)|existing customers only|by invitation|call (us|\d)[^.]{0,40}(open|set up) an account|not accepting new/i.test(body);
    if (contact) return 'CLASS NOT_A_FORM | contact form, not an application (' + labs.slice(0, 6).join(', ') + ')' + (enterprise ? '; sales-rep language (ENTERPRISE_ONLY?)' : '');
    if (biz >= 1 && ctrls.length >= 4) return 'CLASS FORM | ' + ev.join('; ');
    if (codeLogin && ctrls.length <= 3) return 'CLASS LOGIN_GATED | email one-time-code login; ' + ev.join('; ');
    if (pw && ctrls.length <= 4 && login) return 'CLASS LOGIN_GATED | login form; ' + ev.join('; ');
    if (ctrls.length >= 6) return 'CLASS FORM | ' + ev.join('; ');
    if (pdfs.length && ctrls.length < 4) return 'CLASS PDF_APPLICATION | ' + ev.join('; ');
    if (enterprise) return 'CLASS ENTERPRISE_ONLY | sales-rep / existing-customer language; ' + ev.join('; ');
    return 'CLASS NOT_A_FORM | ' + ev.join('; ');
  };
  FT.report = function (outcome, needs, notes) {
    var g = (window.__ffGuard && window.__ffGuard.log) || [], by = {};
    g.forEach(function (e) { by[e.cls] = (by[e.cls] || 0) + 1; });
    return JSON.stringify({ outcome: outcome, needs_human: needs || [], notes: notes || '', filled: FT.done, fields: Object.keys(FT.meta).length, guard: by, url: location.href.slice(0, 200) });
  };
  // Live transport helper: hide the page for a moment so the transport's post-call accessibility
  // echo (Custodian evaluate_js) is ~empty. Visual state is restored before the next action.
  FT.live = function (p) { return Promise.resolve(p).then(function (r) { var h = document.documentElement; h.style.setProperty('display', 'none', 'important'); setTimeout(function () { h.style.removeProperty('display'); }, 1200); return r; }); };
})();
