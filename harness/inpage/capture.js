/* Fixture capture. Serializes the page's application-form region to compact standalone HTML:
   no scripts/styles/images, open shadow roots kept as declarative <template shadowrootmode="open">,
   same-origin iframe content inlined. Hidden subtrees and page chrome (header/nav/footer, search,
   cart, newsletter forms) are dropped. Run once per form through Custodian evaluate_js, then saved
   to fixtures/<slug>.html so all three toolkits iterate offline on the same page. */
window.__ffCapture = function () {
  var KEEP = /^(id|name|type|for|value|placeholder|required|aria-required|aria-label|aria-labelledby|aria-haspopup|aria-expanded|aria-checked|aria-controls|role|checked|selected|disabled|readonly|maxlength|pattern|autocomplete|multiple|accept|action|method|min|max|size|rows|title)$/;
  var DROP = /^(SCRIPT|STYLE|NOSCRIPT|SVG|IMG|PICTURE|VIDEO|AUDIO|CANVAS|LINK|META|TEMPLATE|OBJECT|EMBED|SOURCE|HEAD|BR)$/;
  var VOID = /^(INPUT|HR|WBR)$/;
  var CHROME = /^(HEADER|NAV|FOOTER|ASIDE)$/;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function kids(n, out) {
    for (var el = n.firstElementChild; el; el = el.nextElementSibling) {
      out.push(el);
      if (el.shadowRoot) kids(el.shadowRoot, out);
      if (el.tagName === 'IFRAME') { try { var d = el.contentDocument; if (d && d.documentElement) kids(d, out); } catch (_) {} }
      kids(el, out);
    }
    return out;
  }
  function up(n) { return n.parentElement || (n.parentNode && n.parentNode.host) || (n.ownerDocument && n.ownerDocument.defaultView && n.ownerDocument.defaultView.frameElement) || null; }
  function hidden(el) { var cs = el.ownerDocument.defaultView.getComputedStyle(el); return cs.display === 'none' || cs.visibility === 'hidden'; }
  function inChrome(el) { for (var n = el; n && n.tagName !== 'BODY'; n = up(n)) { if (CHROME.test(n.tagName) || (n.getAttribute && (n.getAttribute('role') === 'dialog' || n.getAttribute('aria-modal') === 'true')) || n.getAttribute && /search|newsletter|subscribe|cart|login-form|site-header|site-footer/i.test((n.getAttribute('role') || '') + ' ' + (n.getAttribute('action') || '') + ' ' + (n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : ''))) return true; } return false; }
  var ctrls = kids(document, []).filter(function (el) {
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || /^(hidden|submit|button|reset|image)$/i.test(el.type)) return false;
    var r = el.getBoundingClientRect(); if (hidden(el) || (r.width < 2 && r.height < 2 && !/checkbox|radio/.test(el.type))) return false;
    return !inChrome(el);
  });
  if (!ctrls.length) return JSON.stringify({ ok: false, reason: 'no visible form controls outside page chrome', title: document.title });
  // lowest common (composed) ancestor of the application controls
  function chain(n) { var c = []; for (; n; n = up(n)) c.unshift(n); return c; }
  var lca = chain(ctrls[0]);
  ctrls.slice(1).forEach(function (el) { var c = chain(el), i = 0; while (i < lca.length && lca[i] === c[i]) i++; lca = lca.slice(0, i); });
  var root = lca[lca.length - 1] || document.body;
  if (root.tagName !== 'FORM' && root.closest) { var f = root.closest('form'); if (f) root = f; }
  for (var i = 0; i < 2 && root.parentElement && root.parentElement !== document.body && root.parentElement.textContent.length < root.textContent.length + 600; i++) root = root.parentElement;
  function ser(n) {
    if (n.nodeType === 3) { var t = n.textContent.replace(/\s+/g, ' '); return esc(t.length > 300 ? t.slice(0, 300) + '…' : t); }
    if (n.nodeType !== 1 || DROP.test(n.tagName)) return n.tagName === 'BR' ? '<br>' : '';
    if (hidden(n) && n.tagName !== 'OPTION') return '';
    var tag = n.tagName.toLowerCase(), a = '';
    for (var j = 0; j < n.attributes.length; j++) { var at = n.attributes[j]; if (KEEP.test(at.name)) a += ' ' + at.name + (at.value === '' ? '' : '="' + esc(at.value.slice(0, 120)) + '"'); }
    if (tag === 'iframe') { var inner = ''; try { var d = n.contentDocument; if (d && d.body) inner = kidsSer(d.body); } catch (_) {} return inner ? '<div data-ff-iframe="' + esc((n.src || '').slice(0, 120)) + '">' + inner + '</div>' : '<!-- cross-origin iframe ' + esc((n.src || '').slice(0, 120)) + ' -->'; }
    if (VOID.test(n.tagName)) return '<' + tag + a + '>';
    var body = (n.shadowRoot ? '<template shadowrootmode="open">' + kidsSer(n.shadowRoot) + '</template>' : '') + kidsSer(n);
    if (!body.trim() && /^(div|span|p|section)$/.test(tag) && !a) return '';
    return '<' + tag + a + '>' + body + '</' + tag + '>';
  }
  function kidsSer(n) { var s = ''; for (var c = n.firstChild; c; c = c.nextSibling) s += ser(c); return s; }
  var html = ser(root).replace(/>\s+</g, '> <').replace(/\s{2,}/g, ' ');
  var h1 = document.querySelector('h1'), head = h1 && !root.contains(h1) ? '<h1>' + esc(h1.textContent.replace(/\s+/g, ' ').trim()) + '</h1>' : '';
  return JSON.stringify({ ok: true, title: document.title, url: location.href, controls: ctrls.length, bytes: html.length + head.length, html: head + html });
};
