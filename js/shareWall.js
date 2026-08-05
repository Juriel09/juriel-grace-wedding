/* The wall: everyone's photos, growing through the reception.

   Tiles come straight from Google's thumbnail service, so no photo byte passes
   through the Apps Script deployment after the upload itself — the wall costs
   the backend nothing no matter how many guests are watching it. */
(function () {
  "use strict";
  window.W = window.W || {};

  var POLL_MS = 15000;
  var THUMB = "https://drive.google.com/thumbnail?id=";

  var api = window.W.shareApi;
  var wall, lightbox, lightboxImg;
  // file id -> { el, img, state, blobUrl }. blobUrl is set only for a tile
  // still showing a locally-created object URL (addLocal); it is cleared the
  // moment that tile is swapped over to the real Drive thumbnail. Tracking it
  // explicitly here — rather than sniffing the img's current src string — is
  // what lets the poll recognise "this id is already on the wall, but as a
  // local blob that now needs to be replaced and released" as a third case
  // distinct from "new photo" and "already-settled photo, do nothing".
  var seen = {};
  var opts = {};
  var timer = 0;
  // an object URL a swap or a hide wanted to revoke while the lightbox was
  // showing it. Held here and released the moment the lightbox closes, so a
  // guest never watches their own enlarged photo go blank mid-view.
  var blockedRevoke = null;

  function thumbUrl(id, w) { return THUMB + encodeURIComponent(id) + "&sz=w" + w; }

  function openLightbox(src) {
    if (!lightbox) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.documentElement.style.overflow = "hidden";
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
    document.documentElement.style.overflow = "";
    // the lightbox no longer holds anything, so anything it was blocking can
    // finally be released
    if (blockedRevoke) { URL.revokeObjectURL(blockedRevoke); blockedRevoke = null; }
  }

  // Releases a local object URL created by addLocal — unless the lightbox is
  // the thing currently showing it, in which case release is deferred to
  // closeLightbox(). Safe to call with a data: URL too (revokeObjectURL is a
  // no-op on anything it didn't mint), which is all the local preview ever
  // is in the preview harness / tests.
  function revokeLocal(url) {
    if (!url) return;
    if (lightbox && !lightbox.hidden && lightboxImg && lightboxImg.src === url) {
      blockedRevoke = url;
      return;
    }
    URL.revokeObjectURL(url);
  }

  function tile(id, src, fullSrc) {
    var d = document.createElement("div");
    d.className = "sh-tile";
    d.setAttribute("data-id", id);

    // mutable so a later swap-to-server can repoint the lightbox at the real
    // full-size thumbnail without having to recreate the click handler
    var state = { fullSrc: fullSrc };

    var img = document.createElement("img");
    img.alt = "A guest's photo";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    // Drive can take a few seconds to generate a thumbnail and occasionally rate-
    // limits. One retry, then a soft placeholder — never a broken-image icon.
    //
    // A tile still showing a local blob: URL (addLocal, before the poll has
    // swapped it to Drive) is a different failure entirely — some browsers
    // can't decode certain camera formats (HEIC, notably) in an <img> at all,
    // and that will never change no matter how many times it's retried. Worse,
    // blob: URLs don't have real query-string syntax: appending "&r=..." to
    // one doesn't cache-bust it, it just produces a different, permanently
    // unresolvable blob: URL. So for a blob: src, skip the retry-and-give-up
    // path entirely and leave the element exactly where it is — that's what
    // swapToServer() needs in order to find and repoint a live <img> once
    // Drive's real thumbnail is ready; if this branch instead tore the element
    // down (is-broken + img.remove()) the way it does for a Drive URL, that
    // later swap would set .src on a node no longer in the wall and the tile
    // would stay broken forever even after the real photo became available.
    img.addEventListener("error", function () {
      if (img.src.indexOf("blob:") === 0) return;
      if (d.getAttribute("data-retried")) { d.classList.add("is-broken"); img.remove(); return; }
      d.setAttribute("data-retried", "1");
      setTimeout(function () { img.src = img.src + "&r=" + Date.now(); }, 2500);
    });
    // drops the placeholder aspect-ratio css/share.css uses to keep lazy loading
    // honest, so the photo settles into its own shape
    img.addEventListener("load", function () { img.classList.add("is-loaded"); });
    img.addEventListener("click", function () { openLightbox(state.fullSrc); });
    d.appendChild(img);

    var x = document.createElement("button");
    x.type = "button";
    x.className = "sh-hide";
    x.setAttribute("aria-label", "Hide this photo");
    x.innerHTML = "&times;";
    x.addEventListener("click", function () { hide(id, d); });
    d.appendChild(x);

    return { el: d, img: img, state: state };
  }

  function hide(id, el) {
    if (!window.confirm("Hide this photo from the album?")) return;
    api.hide(id).then(function (res) {
      if (res && res.ok) {
        var entry = seen[id];
        el.remove();
        delete seen[id];
        // a guest could hide their own photo before the poll ever confirmed
        // it — the local blob still needs releasing, same as a normal swap
        if (entry && entry.blobUrl) revokeLocal(entry.blobUrl);
        if (opts.toast) opts.toast("hidden");
      } else if (opts.toast) {
        opts.toast("couldn’t hide that one");
      }
    }).catch(function () { if (opts.toast) opts.toast("couldn’t hide that one"); });
  }

  // Preloads the real Drive thumbnail before touching anything on screen, so
  // the tile only ever flips once — from the local blob straight to the
  // settled thumbnail — and never blinks through a gap while Drive is slow.
  // Only once that image has actually finished loading do we repoint the
  // tile and release the blob it was standing in for.
  function swapToServer(id, entry, newSrc, newFullSrc) {
    var oldBlob = entry.blobUrl;
    var probe = new Image();
    probe.onload = function () {
      // the tile could have been hidden (and removed from `seen`) while this
      // preload was in flight — don't resurrect it
      if (seen[id] !== entry) return;
      entry.img.src = newSrc;
      entry.state.fullSrc = newFullSrc;
      entry.blobUrl = null;
      revokeLocal(oldBlob);
    };
    probe.onerror = function () { /* thumbnail not ready yet — the next poll tries again */ };
    probe.src = newSrc;
  }

  /* Newest first, so new arrivals go to the top. */
  function place(id, src, fullSrc, isLocal) {
    var existing = seen[id];
    if (existing) {
      // the poll has caught up with a photo that is still showing as a local
      // blob preview — swap it over instead of leaving the blob (and the
      // memory it holds) parked forever
      if (existing.blobUrl) swapToServer(id, existing, src, fullSrc);
      return;
    }
    var t = tile(id, src, fullSrc);
    seen[id] = { el: t.el, img: t.img, state: t.state, blobUrl: isLocal ? src : null };
    wall.insertBefore(t.el, wall.firstChild);
  }

  /* The uploader's own photo, from the local file, the moment the POST returns.
     Drive may not have a thumbnail for seconds and nobody should sit staring at
     a gap wondering whether it worked. The poll later recognises the id in
     `seen` and swaps this tile over to the real thumbnail, releasing the blob
     URL it was built from. */
  function addLocal(id, previewUrl) {
    if (!wall || seen[id]) return;
    place(id, previewUrl, previewUrl, true);
  }

  // Removes any tile the server no longer lists. This is the other half of
  // moderation: the couple's ✕ only ever edits the tapping device's own DOM
  // (see hide()) — without this, a hidden photo keeps showing on every other
  // open tab all night.
  //
  // A tile still holding a local blob (addLocal, not yet swapped to the real
  // Drive thumbnail by place()/swapToServer) is deliberately left alone:
  // upload_() in photos.gs does not invalidate the list cache, so a guest's
  // own just-sent photo can be legitimately missing from `list` for up to
  // CACHE_SECS. Removing it here would delete the uploader's own tile
  // seconds after they sent it.
  function reconcile(ids) {
    for (var id in seen) {
      if (ids[id]) continue;
      var entry = seen[id];
      if (entry.blobUrl) continue;      // nothing to release: it is a Drive URL
      entry.el.remove();
      delete seen[id];
    }
  }

  // Cleared the first time a poll comes back — answered or failed, either way we
  // are no longer guessing. Until then css/share.css shows a spinner instead of
  // "No photos yet", which on a full album would be a confident lie.
  function settled() {
    document.body.classList.remove("is-wall-loading");
  }

  function poll() {
    api.list().then(function (d) {
      settled();
      if (!d || !d.ok || !d.photos) return;
      var ids = {};
      // oldest first on insert, because place() prepends — the result is newest-first
      for (var i = d.photos.length - 1; i >= 0; i--) {
        var p = d.photos[i];
        ids[p.id] = 1;
        place(p.id, thumbUrl(p.id, 600), thumbUrl(p.id, 1600));
      }
      reconcile(ids);
    }).catch(function () {
      // one dropped poll is not worth telling a guest about — but the spinner
      // still has to stop, or a wall that never loads spins until the battery does
      settled();
    });
  }

  function schedule() {
    clearInterval(timer);
    // polling a hidden tab wastes a guest's battery and the script's quota
    if (document.hidden) return;
    timer = setInterval(poll, POLL_MS);
  }

  function init(o) {
    opts = o || {};
    wall = document.getElementById("wall");
    lightbox = document.getElementById("lightbox");
    lightboxImg = document.getElementById("lightboxImg");
    if (!wall) return;
    document.body.classList.add("is-wall-loading");

    var close = document.getElementById("lightboxClose");
    if (close) close.addEventListener("click", closeLightbox);
    if (lightbox) {
      lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) poll();
      schedule();
    });

    poll();
    schedule();
  }

  window.W.shareWall = { init: init, addLocal: addLocal };
})();
