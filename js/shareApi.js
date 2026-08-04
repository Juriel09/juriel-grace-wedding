/* Transport for the guest album. One place that knows the endpoint, the admin
   key, and what time the server thinks it is.

   Everything POSTs as text/plain JSON — the only content type an Apps Script web
   app can accept without a CORS preflight it cannot answer. js/rsvp.js does the
   same; do not "fix" it to application/json. */
(function () {
  "use strict";
  window.W = window.W || {};

  // Paste the photos Apps Script Web app URL here (Deploy → Web app → /exec).
  var ENDPOINT = "";

  var KEY = "";
  try { KEY = new URLSearchParams(location.search).get("key") || ""; } catch (e) {}

  // the difference between the server's clock and this phone's. Every gate
  // decision and the countdown read through this, so a wrong device clock
  // cannot open the album early or make it look shut when it is open.
  var skew = 0;

  function absorb(d) {
    if (d && d.now) {
      var t = Date.parse(d.now);
      if (!isNaN(t)) skew = t - Date.now();
    }
    return d;
  }

  function get(action) {
    if (!ENDPOINT) return Promise.reject(new Error("no endpoint"));
    var u = ENDPOINT + "?action=" + action + (KEY ? "&key=" + encodeURIComponent(KEY) : "");
    return fetch(u).then(function (r) { return r.json(); }).then(absorb);
  }

  function post(body) {
    if (!ENDPOINT) return Promise.reject(new Error("no endpoint"));
    if (KEY) body.key = KEY;
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* This device's tag. Nobody types a name — the tag exists so one phone's
     photos group together in the Drive folder, and it is never shown on the
     wall. Losing it (cleared storage) costs nothing. */
  function tag() {
    var t = "";
    try { t = localStorage.getItem("jg-guest-tag") || ""; } catch (e) {}
    if (!/^Guest-\d{4}$/.test(t)) {
      t = "Guest-" + String(1000 + Math.floor(Math.random() * 9000));
      try { localStorage.setItem("jg-guest-tag", t); } catch (e) {}
    }
    return t;
  }

  window.W.shareApi = {
    configured: function () { return !!ENDPOINT; },
    hasKey: function () { return !!KEY; },
    tag: tag,
    now: function () { return Date.now() + skew; },
    status: function () { return get("status"); },
    list: function () { return get("list"); },
    upload: function (p) {
      return post({ action: "upload", tag: p.tag, filename: p.filename, mime: p.mime, data: p.data });
    },
    hide: function (id) { return post({ action: "hide", id: id }); }
  };
})();
