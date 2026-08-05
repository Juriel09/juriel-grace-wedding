/* Transport for the guest album. One place that knows the endpoint, the admin
   key, and what time the server thinks it is.

   Everything POSTs as text/plain JSON — the only content type an Apps Script web
   app can accept without a CORS preflight it cannot answer. js/rsvp.js does the
   same; do not "fix" it to application/json. */
(function () {
  "use strict";
  window.W = window.W || {};

  // Paste the photos Apps Script Web app URL here (Deploy → Web app → /exec).
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbzX_gbxGJ4-iRY-Tj-nC-vIp7AUnAzZ3oj7PlE7AbmeGoUEcAJYgLENfPp-s_cYoo9Oqg/exec";

  var KEY = "";
  try { KEY = new URLSearchParams(location.search).get("key") || ""; } catch (e) {}

  /* fetch() has no timeout. Left alone, a request that is accepted and then
     never answered — which is what a saturated access point does, rather than
     refusing cleanly — hangs forever: neither .then nor .catch ever runs, and
     every caller here waits on one of those. Seen live: the album sat on its
     loader indefinitely, with no error to react to and nothing to retry it.
     A timeout turns that silence into an ordinary rejection, which the retry
     in share.js and the queue in shareUpload.js already know what to do with.
     Reads are quick and cheap to repeat; an upload is ~1MB and gets longer. */
  var READ_MS = 12000;
  var SEND_MS = 30000;

  function timed(url, opts, ms) {
    if (typeof AbortController === "undefined") return fetch(url, opts);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    opts = opts || {};
    opts.signal = ctrl.signal;
    var done = function (r) { clearTimeout(timer); return r; };
    return fetch(url, opts).then(done, function (e) { done(); throw e; });
  }

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
    return timed(u, null, READ_MS).then(function (r) { return r.json(); }).then(absorb);
  }

  function post(body) {
    if (!ENDPOINT) return Promise.reject(new Error("no endpoint"));
    if (KEY) body.key = KEY;
    return timed(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }, SEND_MS).then(function (r) { return r.json(); });
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
