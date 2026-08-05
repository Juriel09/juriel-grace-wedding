/* The guest album's conductor: ask the server whether the album is open, show
   either the countdown or the album, and hand the rest to shareUpload/shareWall.

   The gate here is cosmetic. The real one is in photos.gs — this page cannot
   open the album by lying to itself, it can only fail to display it. */
(function () {
  "use strict";
  window.W = window.W || {};

  var api = window.W.shareApi;
  var body = document.body;
  var toastEl = document.getElementById("toast");
  var toastTimer = 0;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 3200);
  }

  function setState(name) {
    body.classList.remove("is-loading", "is-closed", "is-open", "is-offline");
    body.classList.add(name);
  }

  var opensAtMs = null;
  var countdownTimer = 0;
  var recheckTimer = 0;
  var offlineTimer = 0;

  function two(n) { return (n < 10 ? "0" : "") + n; }

  /* days only appear once they matter; the closer it gets the more precise it
     reads, so at 12:58 a guest sees seconds ticking rather than "0 days". */
  function human(ms) {
    if (ms <= 0) return "any moment now";
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + (d === 1 ? " day " : " days ") + h + "h";
    return two(h) + ":" + two(m) + ":" + two(sec);
  }

  function tickCountdown() {
    var el = document.getElementById("gateCountdown");
    // isFinite, not !== null: an open_at the sheet can't parse comes back as
    // NaN, and NaN passes a null check on its way to rendering "NaN:NaN:NaN"
    // in gold foil on the biggest text on the page
    if (!el || !isFinite(opensAtMs)) return;
    el.textContent = human(opensAtMs - api.now());
  }

  function showGate(st) {
    opensAtMs = st.opensAt ? Date.parse(st.opensAt) : NaN;
    var when = document.getElementById("gateOpensAt");
    // the markup's own fallback ("soon") stands when the server didn't give us
    // a time — better vague than confidently wrong about when to come back
    if (when && isFinite(opensAtMs)) {
      when.textContent = "on " + new Date(opensAtMs).toLocaleString(undefined, {
        weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
      });
    }
    setState("is-closed");
    clearInterval(offlineTimer);
    tickCountdown();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdown, 1000);
    // it opens itself: a guest who scans at 12:58 never has to refresh
    clearInterval(recheckTimer);
    recheckTimer = setInterval(check, 60000);
  }

  function showAlbum(st) {
    clearInterval(countdownTimer);
    clearInterval(recheckTimer);
    clearInterval(offlineTimer);
    // init before flipping the body class: is-open must never be true unless the
    // album is actually wired up, or a guest gets a fully-dressed page with dead
    // buttons and nobody watching to notice
    try {
      window.W.shareUpload.init({ toast: toast, onUploaded: window.W.shareWall.addLocal });
      window.W.shareWall.init({ admin: !!st.admin, toast: toast });
    } catch (err) {
      console.error("share.js: album failed to start", err);
      toast("the album hit a snag loading — please refresh");
      setState("is-offline");
      return;
    }
    if (st.admin) body.classList.add("is-admin");
    setState("is-open");
  }

  /* Venue wifi at a barn in Alfonso is going to drop. Whatever put us here, the
     card must not be a dead end — it re-checks itself every few seconds and
     heals the moment the connection comes back, because nobody at a reception
     is going to think to pull-to-refresh a page that says "try again". */
  function goOffline() {
    setState("is-offline");
    clearInterval(offlineTimer);
    offlineTimer = setInterval(check, 8000);
  }

  function check() {
    // no endpoint is not a network problem — it is this file shipped unfinished,
    // and no amount of retrying will paste the URL in
    if (!api.configured()) { setState("is-offline"); return; }
    api.status().then(function (st) {
      if (!st || !st.ok) { goOffline(); return; }
      if (st.open) showAlbum(st);
      else showGate(st);
    }).catch(function () {
      // only fall back to the offline card if nothing better is on screen; a
      // failed re-check while the countdown is up is ignored and simply retried
      if (body.classList.contains("is-loading") || body.classList.contains("is-offline")) {
        goOffline();
      }
    });
  }

  window.W.share = { toast: toast };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
})();
