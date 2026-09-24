/* Harness readback: version-neutral scoring input. Enumerates every visible fillable control
   (document + open shadow roots + same-origin iframes) and maps each value to a profile KEY.
   Profile values never leave the page. With redact=true (live runs), free text that is not a
   profile value is reported only by length, so real data never reaches results/.
   baseline() runs right after load; read() marks controls whose value never changed (same:true). */
(function () {
  if (window.__ffReadback) return;
  function walk(n, out) {
    for (var el = n.firstElementChild; el; el = el.nextElementSibling) {
      out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, out);
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') { try { var d = el.contentDocument; if (d && d.documentElement) walk(d, out); } catch (_) {} }
      walk(el, out);
    }
    return out;
  }
  function txt(n) { return ((n && n.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function vis(el) {
    var w = el.ownerDocument.defaultView, cs = w.getComputedStyle(el), r = el.getBoundingClientRect(), t = (el.type || '').toLowerCase();
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if ((t === 'checkbox' || t === 'radio') && (r.width < 2 || r.height < 2 || +cs.opacity === 0)) {
      var l = el.labels && el.labels[0]; if (l) { var lr = l.getBoundingClientRect(); return lr.width > 1 && lr.height > 1; }
    }
    if (r.width < 2 || r.height < 2) return false;
    return !(r.right + w.scrollX < -20 || r.bottom + w.scrollY < -20);
  }
  function lblText(l) { var c = l.cloneNode(true), x = c.querySelectorAll('select,option,input,textarea'); for (var i = 0; i < x.length; i++) x[i].remove(); return txt(c); }
  function near(el, max) {
    var n = el;
    for (var up = 0; up < (max || 3) && n; up++) {
      for (var s = n.previousSibling; s; s = s.previousSibling) {
        if (s.nodeType === 3 && s.textContent.trim()) return s.textContent.trim();
        if (s.nodeType !== 1) continue;
        if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(s.tagName) || (up > 0 && /^H[12]$/.test(s.tagName))) break;
        var tt = txt(s); if (tt && tt.length < 80 && !s.querySelector('input,select,textarea')) return tt; if (tt) break;
      }
      n = n.parentElement;
    }
    return '';
  }
  function after(el) {
    for (var s = el.nextSibling, i = 0; s && i < 3; s = s.nextSibling, i++) {
      if (s.nodeType === 3 && s.textContent.trim()) return s.textContent.trim();
      if (s.nodeType === 1) { if (/^(INPUT|SELECT|TEXTAREA|BR)$/.test(s.tagName)) break; var t = txt(s); if (t && !s.querySelector('input,select,textarea')) return t; }
    }
    return '';
  }
  function labelOf(el) {
    var root = el.getRootNode(), doc = el.ownerDocument, t = '', ids = el.getAttribute('aria-labelledby');
    if (ids) t = ids.split(/\s+/).map(function (i) { var n = (root.getElementById && root.getElementById(i)) || doc.getElementById(i); return n && n.querySelector && n.querySelector('select,input,textarea') ? lblText(n) : txt(n); }).join(' ');
    if (!t && el.labels && el.labels.length) t = lblText(el.labels[0]);
    if (!t && /^(checkbox|radio)$/i.test(el.type || '')) t = after(el);
    if (!t) t = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || near(el);
    return t.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function groupLabel(el) {
    var fs = el.closest('fieldset'), lg = fs && fs.querySelector('legend');
    return lg ? txt(lg) : (near(el.parentElement || el, 1) || near(el.parentElement && el.parentElement.parentElement || el, 2));
  }
  function isPh(o) { return !o || o.value === '' || /^(-+|select|choose|please|pick)/i.test(txt(o)); }
  function rows() {
    var out = [], seen = {}, groups = {};
    walk(document, []).forEach(function (el) {
      var tag = el.tagName, t = (el.type || '').toLowerCase(), role = el.getAttribute('role');
      var nat = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (nat && /^(hidden|submit|button|reset|image)$/.test(t)) return;
      if (!nat && !(role && /^(combobox|checkbox|radio|switch|textbox)$/.test(role)) && !(el.isContentEditable && el.getAttribute('contenteditable') != null)) return;
      if (!nat && el.querySelector('input,select,textarea')) return;
      if (!vis(el)) return;
      var lab = labelOf(el), req = !!(el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(lab));
      if (t === 'radio' || role === 'radio') {
        var gname = el.name || (el.parentElement && el.parentElement.id) || lab, g = groups[gname];
        if (!g) { g = groups[gname] = { k: 'radio:' + gname, label: groupLabel(el), type: 'radio', req: req, kind: 'choice', v: '' }; out.push(g); }
        if (el.checked || el.getAttribute('aria-checked') === 'true') g.v = lab;
        g.req = g.req || req || /\*/.test(g.label); return;
      }
      var v, kind = 'text';
      if (tag === 'SELECT') { var o = el.options[el.selectedIndex]; kind = 'choice'; v = isPh(o) ? '' : txt(o); }
      else if (t === 'checkbox' || role === 'checkbox' || role === 'switch') { kind = 'check'; v = !!(el.checked || el.getAttribute('aria-checked') === 'true'); }
      else if (role === 'combobox' && !nat) { kind = 'choice'; v = txt(el); if (/^(select|choose|please|pick|-)/i.test(v)) v = ''; }
      else if (!nat) v = txt(el);
      else { v = el.value || ''; if (t === 'file') kind = 'file'; }
      var base = el.getAttribute('name') || el.id || lab || tag.toLowerCase(), k = base + (t === 'checkbox' && el.value && el.value !== 'on' ? '=' + el.value : '');
      if (seen[k]) k = k + '#' + (++seen[k]); else seen[k] = 1;
      out.push({ k: k, label: lab, type: tag === 'SELECT' ? 'select' : (t || role || 'text'), req: req, kind: kind, v: v });
    });
    return out;
  }
  function norm(s) { return String(s).toLowerCase().replace(/[\s.,]+/g, ' ').trim(); }
  function index(p) {
    var T = {}, D = {};
    for (var k in p) { var v = p[k]; if (!v) continue; var n = norm(v), d = String(v).replace(/\D/g, ''); if (n && !T[n]) T[n] = k; if (d.length >= 5 && !D[d]) D[d] = k; }
    return { T: T, D: D };
  }
  function match(ix, p, v, kind) {
    var n = norm(v); if (ix.T[n]) return ix.T[n];
    var d = String(v).replace(/\D/g, '');
    if (d.length >= 5 && d.length === String(v).replace(/[\s()+.\-\/]/g, '').length && ix.D[d]) return ix.D[d];
    if (kind === 'choice') {
      if (/^(u\.?s\.?a?\.?|united states( of america)?)$/i.test(String(v).trim())) return 'country';
      if (p.state_name && new RegExp('\\b' + p.state_name + '\\b', 'i').test(v)) return 'state_name';
      if (p.state && new RegExp('^' + p.state + '\\b|\\(' + p.state + '\\)', 'i').test(String(v).trim())) return 'state';
    }
    return null;
  }
  var RB = window.__ffReadback = {
    base: null,
    baseline: function () { RB.base = {}; rows().forEach(function (r) { RB.base[r.k] = r.v; }); return Object.keys(RB.base).length; },
    read: function (profile, redact) {
      var ix = index(profile || {});
      return rows().map(function (r) {
        var o = { k: r.k, label: r.label, type: r.type, req: r.req };
        if (RB.base && r.k in RB.base && RB.base[r.k] === r.v) o.same = true;
        if (r.kind === 'check') o.st = r.v ? 'checked' : 'unchecked';
        else if (r.kind === 'file') o.st = r.v ? 'file' : 'empty';
        else if (r.v === '' || r.v == null) o.st = 'empty';
        else { var key = match(ix, profile || {}, r.v, r.kind); if (key) { o.st = 'profile'; o.key = key; } else if (r.kind === 'choice') { o.st = 'choice'; o.opt = String(r.v).slice(0, 60); } else { o.st = 'text'; if (redact && !/^(unknown|n\/?a|none|no|yes)$/i.test(String(r.v).trim())) o.len = String(r.v).length; else o.value = String(r.v).slice(0, 60); } }
        return o;
      });
    },
    // compact(): only rows that are not empty, one per line  k~st~detail~same  (plus a row count)
    compact: function (profile, redact) {
      var rs = RB.read(profile, redact), out = ['rows=' + rs.length];
      rs.forEach(function (o) { if (o.st === 'empty' || o.st === 'unchecked') return; out.push([o.k, o.st, o.key || o.opt || o.value || (o.len != null ? 'len' + o.len : ''), o.same ? 'same' : ''].join('~')); });
      return out.join('\n');
    }
  };
})();
