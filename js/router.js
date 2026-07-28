/* URL <-> section routing.
     - The hash follows what you're reading: #story, #gallery, #film, #entourage,
       #rsvp, #drone. No hash = home (the invitation itself).
     - Opening a link that already has a hash skips the opening film and the
       envelope and lands straight on that section, so a shared link works.
   The hash is written with replaceState so scrolling never floods browser history
   and never triggers the browser's own jump-to-anchor. */
(function () {
  "use strict";
  window.W = window.W || {};

  const IDS = ["drone", "story", "gallery", "film", "entourage", "rsvp"];
  const clean = (h) => String(h || "").replace(/^#/, "").trim().toLowerCase();
  const el = (id) => document.getElementById(id);

  // Resolved at parse time — BEFORE intro.js runs — so the opening film can bow
  // out for a deep-linked visitor instead of making them sit through it.
  const deepLink = IDS.indexOf(clean(location.hash)) >= 0 ? clean(location.hash) : null;
  window.W.deepLink = deepLink;

  // the section under a probe line a third of the way down the screen (same rule
  // the mobile flick navigation uses, so the two always agree)
  function currentId() {
    const probe = window.innerHeight * 0.3;
    for (let i = IDS.length - 1; i >= 0; i--) {
      const s = el(IDS[i]);
      if (!s) continue;
      const r = s.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) return IDS[i];
    }
    return null; // above them all — the card / home screen
  }

  function jumpTo(id, immediate) {
    const t = el(id);
    if (!t) return;
    // a deliberate jump past the card lifts the card scene's scroll gate, or it
    // would haul the visitor back to the envelope
    if (window.W.cardOpened) window.W.cardOpened();
    const y = t.getBoundingClientRect().top + window.scrollY;
    if (window.__lenis) window.__lenis.scrollTo(y, immediate ? { immediate: true } : { duration: 1.2 });
    else if (immediate) window.scrollTo(0, y);
    else t.scrollIntoView({ behavior: "smooth" });
    // tell the section snap where we actually are, or its card branch would pull
    // a deep-linked visitor back up to the envelope on their next scroll
    if (immediate && window.W.snapSyncFromScroll) window.W.snapSyncFromScroll();
  }

  function init() {
    if (deepLink) {
      const go = () => {
        jumpTo(deepLink, true);
        const l = el("loader");
        if (l) l.classList.add("hidden"); // don't hold a deep link behind the card preload
      };
      go();
      // fonts/images can still shift layout underneath us — re-settle after they land
      window.addEventListener("load", go);
      setTimeout(go, 350);
    }

    // keep the hash in step with the section being read
    let last = deepLink, tid;
    const sync = () => {
      const id = currentId();
      if (id === last) return;
      last = id;
      const url = id ? "#" + id : location.pathname + location.search;
      try { history.replaceState(null, "", url); } catch (e) {}
    };
    const onScroll = () => { clearTimeout(tid); tid = setTimeout(sync, 120); };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (window.__lenis) window.__lenis.on("scroll", onScroll);
    if (!deepLink) sync();

    // an edited hash, a pasted link, or back/forward → glide there
    window.addEventListener("hashchange", () => {
      const id = clean(location.hash);
      if (IDS.indexOf(id) >= 0) { last = id; jumpTo(id, false); }
      else if (!id) {
        last = null;
        if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.2 });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  window.W.Router = { init: init, ids: IDS, currentId: currentId };
})();
