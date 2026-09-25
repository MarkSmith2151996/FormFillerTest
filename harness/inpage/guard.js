/* Submit guard, in-page layer. Sits BELOW the brain: the driver never calls it.
   - Live Steel runs (Custodian, no route interception): the harness injects this after every navigation.
   - Cloud-VM Playwright runs: installed as an init script, under the Playwright route guard.
   Blocks submit events (document + shadow roots), HTMLFormElement.submit/requestSubmit, non-GET
   fetch/XHR, sendBeacon and WebSocket.send. Every block is logged in window.__ffGuard.log as
   submit_attempt (form submission path) | telemetry (analytics host or beacon) | write_blocked (other). */
(function () {
  var TELEM = /google-analytics|googletagmanager|analytics\.google|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|klaviyo|monorail|shopifysvc|web-pixels|bing\.com|clarity\.ms|tiktok|sentry|newrelic|nr-data|datadog|amplitude|mixpanel|heapanalytics|fullstory|pinterest|snapchat|linkedin\.com|adsrvr|criteo|quantserve|yimg|twitter|pixel|beacon|\/collect|telemetry|\/track/i;
  function install(win) {
    if (!win || win.__ffGuard) return;
    var log = [];
    function rec(kind, url) {
      var cls = /^(submit|form\.)/.test(kind) ? 'submit_attempt' : (kind === 'beacon' || TELEM.test(String(url || ''))) ? 'telemetry' : 'write_blocked';
      var e = { t: Date.now(), kind: kind, cls: cls, url: String(url || '').slice(0, 160) };
      log.push(e);
      try { win.console.debug('FFGUARD ' + JSON.stringify(e)); } catch (_) {}
    }
    win.__ffGuard = { log: log, since: Date.now() };
    function onSubmit(e) { e.preventDefault(); e.stopImmediatePropagation(); var f = e.target; rec('submit_event', f && f.getAttribute ? (f.getAttribute('action') || f.id || 'form') : 'form'); }
    win.addEventListener('submit', onSubmit, true);
    // submit events are not composed: also listen inside every open shadow root, now and later
    (function scan(n) { var els = n.querySelectorAll ? n.querySelectorAll('*') : []; for (var i = 0; i < els.length; i++) if (els[i].shadowRoot) { els[i].shadowRoot.addEventListener('submit', onSubmit, true); scan(els[i].shadowRoot); } })(win.document);
    var AS = win.Element.prototype.attachShadow;
    if (AS) win.Element.prototype.attachShadow = function () { var r = AS.apply(this, arguments); try { r.addEventListener('submit', onSubmit, true); } catch (_) {} return r; };
    var FP = win.HTMLFormElement.prototype;
    FP.submit = function () { rec('form.submit()', this.getAttribute('action')); };
    FP.requestSubmit = function () { rec('form.requestSubmit()', this.getAttribute('action')); };
    var of = win.fetch;
    if (of) win.fetch = function (input, init) {
      var m = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
      if (m !== 'GET' && m !== 'HEAD') { rec('fetch ' + m, typeof input === 'string' ? input : input && input.url); return Promise.reject(new TypeError('blocked by form-filler submit guard')); }
      return of.apply(this, arguments);
    };
    var XP = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (XP) {
      var xo = XP.open, xs = XP.send;
      XP.open = function (m, u) { this.__ffm = String(m).toUpperCase(); this.__ffu = u; return xo.apply(this, arguments); };
      XP.send = function () { if (this.__ffm && this.__ffm !== 'GET' && this.__ffm !== 'HEAD') { rec('xhr ' + this.__ffm, this.__ffu); try { this.abort(); } catch (_) {} return; } return xs.apply(this, arguments); };
    }
    if (win.navigator.sendBeacon) win.navigator.sendBeacon = function (u) { rec('beacon', u); return false; };
    if (win.WebSocket) win.WebSocket.prototype.send = function () { rec('websocket.send', this.url); };
    function frames() { var fs = win.document.querySelectorAll('iframe,frame'); for (var i = 0; i < fs.length; i++) { try { install(fs[i].contentWindow); } catch (_) {} } }
    frames();
    try { new win.MutationObserver(frames).observe(win.document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  }
  install(window);
})();
