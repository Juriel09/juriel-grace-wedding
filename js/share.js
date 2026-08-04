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
    if (!el || opensAtMs === null) return;
    el.textContent = human(opensAtMs - api.now());
  }

  function showGate(st) {
    opensAtMs = st.opensAt ? Date.parse(st.opensAt) : null;
    var when = document.getElementById("gateOpensAt");
    if (when && opensAtMs !== null && !isNaN(opensAtMs)) {
      when.textContent = new Date(opensAtMs).toLocaleString(undefined, {
        weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
      });
    }
    setState("is-closed");
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

  function check() {
    if (!api.configured()) { setState("is-offline"); return; }
    api.status().then(function (st) {
      if (!st || !st.ok) { setState("is-offline"); return; }
      if (st.open) showAlbum(st);
      else showGate(st);
    }).catch(function () {
      // only fall back to the offline card if nothing is on screen yet; a failed
      // re-check while the countdown is up should just be ignored and retried
      if (body.classList.contains("is-loading")) setState("is-offline");
    });
  }

  window.W.share = { toast: toast };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
})();
