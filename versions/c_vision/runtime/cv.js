/* Version C: vision toolkit, in-page helper.
   Offline (Playwright) runs use real mouse/keyboard events and only use grid() from this file.
   Live Steel runs (Custodian evaluate_js cannot send trusted input events) use act() too.
   Coordinates are CSS pixels of the viewport, read off the labelled grid in the screenshot.
   act() returns short acks only, never DOM data, so the driver stays vision-only.
   Requires ffDeriveProfile (profile/derive.js) for {{profile.key}} templates in type actions. */
(function () {
  if (window.__cv) return;
  var CV = window.__cv = { v: 1, profile: null };
  CV.setProfile = function (b) { CV.profile = ffDeriveProfile(b); return 'ok'; };
  function resolve(v) {
    return String(v).replace(/\{\{\s*profile\.([a-z0-9_]+)\s*\}\}/gi, function (_, k) {
      var x = CV.profile && CV.profile[k]; if (x == null || x === '') throw new Error('profile.' + k + ' empty -> NEEDS_HUMAN'); return x;
    });
  }
  function at(x, y) {
    var el = document.elementFromPoint(x, y), ox = 0, oy = 0;
    for (var i = 0; i < 10 && el; i++) {
      if (el.shadowRoot) { var inner = el.shadowRoot.elementFromPoint(x - ox, y - oy); if (inner && inner !== el) { el = inner; continue; } }
      if (el.tagName === 'IFRAME') { try { var r = el.getBoundingClientRect(), d = el.contentDocument; if (d) { ox += r.left; oy += r.top; var e2 = d.elementFromPoint(x - ox, y - oy); if (e2) { el = e2; continue; } } } catch (_) {} }
      break;
    }
    return { el: el, x: x - ox, y: y - oy };
  }
  function active() { var a = document.activeElement; for (var i = 0; i < 10 && a; i++) { if (a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; else if (a.tagName === 'IFRAME') { try { a = a.contentDocument.activeElement; } catch (_) { break; } } else break; } return a; }
  function mouse(el, x, y, types) {
    var W = el.ownerDocument.defaultView, o = { bubbles: true, composed: true, cancelable: true, view: W, clientX: x, clientY: y, button: 0 };
    types.forEach(function (t) { el.dispatchEvent(new (/^pointer/.test(t) ? (W.PointerEvent || W.MouseEvent) : W.MouseEvent)(t, o)); });
  }
  function click(x, y) {
    var h = at(x, y), el = h.el; if (!el) return 'miss';
    mouse(el, h.x, h.y, ['pointerdown', 'mousedown']);
    var f = el.closest && el.closest('input,textarea,select,[contenteditable],[tabindex],label');
    if (f && f.tagName === 'LABEL' && f.control) f = f.control;
    if (f && f.focus) try { f.focus(); } catch (_) {}
    mouse(el, h.x, h.y, ['pointerup', 'mouseup', 'click']);
    return 'ok';
  }
  function setVal(el, v) {
    var W = el.ownerDocument.defaultView, p = el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype, d = Object.getOwnPropertyDescriptor(p, 'value');
    if (d && d.set && /^(INPUT|TEXTAREA)$/.test(el.tagName)) d.set.call(el, v); else el.textContent = v;
    ['input', 'change'].forEach(function (t) { el.dispatchEvent(new W.Event(t, { bubbles: true, composed: true })); });
  }
  function type(text) {
    var el = active(); if (!el || el === document.body || el === document.documentElement) return 'no-focus';
    var v = resolve(text), cur = el.value != null ? el.value : el.textContent;
    setVal(el, (cur || '') + v); return 'ok';
  }
  function clear() { var el = active(); if (!el || el === document.body) return 'no-focus'; setVal(el, ''); return 'ok'; }
  function key(name) {
    var el = active() || document.body, W = el.ownerDocument.defaultView;
    ['keydown', 'keyup'].forEach(function (t) { el.dispatchEvent(new W.KeyboardEvent(t, { key: name, bubbles: true, composed: true })); });
    if (name === 'Tab') { var f = [].slice.call(document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],[tabindex]:not([tabindex="-1"])')).filter(function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), i = f.indexOf(el); if (f[i + 1]) f[i + 1].focus(); }
    return 'ok';
  }
  function pick(x, y, text) {
    var el = at(x, y).el, s = el && (el.tagName === 'SELECT' ? el : el.closest && el.closest('select'));
    if (!s && el) { var lab = el.closest && el.closest('label'); s = lab && lab.control && lab.control.tagName === 'SELECT' ? lab.control : null; }
    if (!s) return 'no-dropdown-at-point';
    var w = String(resolve(text)).toLowerCase().trim(), o = [].slice.call(s.options).filter(function (o) { return o.text.toLowerCase().trim() === w; })[0] || [].slice.call(s.options).filter(function (o) { return o.text.toLowerCase().indexOf(w) === 0; })[0];
    if (!o) return 'no-option';
    var d = Object.getOwnPropertyDescriptor(s.ownerDocument.defaultView.HTMLSelectElement.prototype, 'value'); d.set.call(s, o.value);
    ['input', 'change'].forEach(function (t) { s.dispatchEvent(new Event(t, { bubbles: true })); });
    return 'ok';
  }
  // act([["click",x,y],["type","{{profile.email}}"],["clear"],["key","Tab"],["select",x,y,"Michigan"],["scroll",600]])
  CV.act = function (list) {
    return list.map(function (a) {
      try {
        switch (a[0]) {
          case 'click': return click(+a[1], +a[2]);
          case 'type': return type(a[1]);
          case 'clear': return clear();
          case 'key': return key(a[1]);
          case 'select': return pick(+a[1], +a[2], a[3]);
          case 'scroll': window.scrollBy(0, +a[1]); return 'y=' + Math.round(window.scrollY);
          default: return 'unknown ' + a[0];
        }
      } catch (e) { return 'ERR ' + e.message; }
    }).join(', ');
  };
  // Labelled 100px grid (CSS px), pointer-events:none, so coordinates can be read off any screenshot.
  CV.grid = function (on) {
    var g = document.getElementById('__cv_grid'); if (g) g.remove(); if (on === false) return 'off';
    g = document.createElement('div'); g.id = '__cv_grid';
    g.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;background-image:linear-gradient(to right,rgba(255,0,80,.22) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,0,80,.22) 1px,transparent 1px);background-size:100px 100px;';
    var W = window.innerWidth, H = window.innerHeight, s = '';
    for (var x = 100; x < W; x += 100) s += '<span style="position:absolute;top:0;left:' + (x + 2) + 'px">' + x + '</span>';
    for (var y = 100; y < H; y += 100) s += '<span style="position:absolute;left:0;top:' + (y + 1) + 'px">' + y + '</span>';
    g.innerHTML = s;
    [].forEach.call(g.children, function (c) { c.style.cssText += ';font:bold 11px monospace;color:#c00050;background:rgba(255,255,255,.8);padding:0 2px'; });
    document.documentElement.appendChild(g); return 'grid ' + W + 'x' + H;
  };
  CV.live = function (p) { return Promise.resolve(p).then(function (r) { var h = document.documentElement; h.style.setProperty('display', 'none', 'important'); setTimeout(function () { h.style.removeProperty('display'); }, 1200); return typeof r === 'string' ? '[' + r.length + 'c] ' + r : r; }); };
})();
