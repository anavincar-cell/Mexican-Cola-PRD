// Visitor measurement for The Mexican Cola.
// 1. Our own counter: no cookies. Counts every visit and every click on the main button.
// 2. Google Analytics: loads ONLY after the visitor clicks Accept in the cookie banner.
// 3. "Ignore this browser": the founder's own visits are not counted.
//    Turned on automatically by logging in to /admin, or by opening the site with ?ignore=1 (off: ?ignore=0).
(function () {
  var cfg = window.MC_CONFIG || {};
  var GA_ID = cfg.gaId || '';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var q = new URLSearchParams(location.search);
  if (q.get('ignore') === '1') store.set('mc_ignore', '1');
  if (q.get('ignore') === '0') store.del('mc_ignore');
  var ignored = store.get('mc_ignore') === '1';

  // Where this visit came from: the first page of the visit, kept for this tab.
  var src = null;
  try { src = JSON.parse(sessionStorage.getItem('mc_src') || 'null'); } catch (e) {}
  if (!src) {
    src = { utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || '', ref: q.get('ref') || '', referrer: document.referrer || '' };
    try { sessionStorage.setItem('mc_src', JSON.stringify(src)); } catch (e) {}
  }

  function beacon(url, data) {
    var body = JSON.stringify(data);
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }); } catch (e) {}
  }

  // ---------- Google Analytics (only with consent) ----------
  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded || !GA_ID || ignored) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }
  function gaEvent(name, params, done) {
    if (gaLoaded && window.gtag) {
      var called = false;
      var finish = function () { if (!called) { called = true; if (done) done(); } };
      window.gtag('event', name, Object.assign({}, params || {}, { event_callback: finish }));
      setTimeout(finish, 800); // Never wait longer than this for Google.
    } else if (done) { done(); }
  }

  // ---------- Cookie banner ----------
  function banner() {
    if (!GA_ID || ignored || document.getElementById('mc-consent')) return;
    var b = document.createElement('div');
    b.id = 'mc-consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookies');
    b.innerHTML =
      '<p><span lang="en">We use Google Analytics cookies to see how visitors use this site. No ads, and we never sell your data. Is that OK?</span>' +
      '<span lang="th">เราใช้คุกกี้ Google Analytics เพื่อดูว่าผู้เข้าชมใช้เว็บไซต์อย่างไร ไม่มีโฆษณา และเราไม่ขายข้อมูลของคุณ ยินยอมไหม?</span></p>' +
      '<div class="mc-consent-btns"><button type="button" class="btn" data-c="granted"><span lang="en">Accept</span><span lang="th">ยอมรับ</span></button>' +
      '<button type="button" class="btn second" data-c="denied"><span lang="en">Decline</span><span lang="th">ปฏิเสธ</span></button></div>';
    b.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-c]');
      if (!btn) return;
      store.set('mc_consent', btn.getAttribute('data-c'));
      b.remove();
      if (btn.getAttribute('data-c') === 'granted') loadGA();
    });
    document.body.appendChild(b);
  }

  // Footer link: lets the visitor change their choice.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-cookie-settings]');
    if (!a) return;
    e.preventDefault();
    store.del('mc_consent');
    if (gaLoaded) { location.reload(); return; } // Stop Google Analytics on this page.
    banner();
  });

  // ---------- Main button clicks ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a.btn[href="#book"], #form button[type=submit]');
    if (!el || ignored) return;
    beacon('/api/event', { type: 'cta_click' });
    gaEvent('cta_click', { button_location: el.closest('section') ? (el.closest('section').id || el.closest('section').className || 'page') : 'page' });
  });

  // Called by the form after an enquiry is saved.
  window.mcTrackLead = function (done) {
    if (ignored) { done(); return; }
    gaEvent('generate_lead', { currency: 'THB', value: 0 }, done);
  };

  // ---------- Start ----------
  function start() {
    if (!ignored) beacon('/api/visit', { path: location.pathname, src: src });
    var c = store.get('mc_consent');
    if (c === 'granted') loadGA();
    else if (c !== 'denied') banner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
