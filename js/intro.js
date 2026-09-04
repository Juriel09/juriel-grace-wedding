/* Opening film. The J&G loader (z 400) covers everything until the intro video
   can actually play through — only then does the loader lift and the film start.
   The film is ALWAYS silent — its own audio is unused; the background song
   (music.js) is the page's one soundtrack, and the floating vinyl rides above the
   film to control it. While the film gates, cardScene's frame-driven hideLoader is
   suppressed via window.W.filmGate. Skip dismisses early; if autoplay is blocked a
   "Begin" button appears. If the video stalls too long we skip straight to the
   site. Reduced-motion skips the film. */
(function () {
  "use strict";
  window.W = window.W || {};
  const film = document.getElementById("introFilm");
  const loader = document.getElementById("loader");
  if (!film) return;
  const video = document.getElementById("introFilmVideo");
  const skipBtn = document.getElementById("introSkip");
  const beginBtn = document.getElementById("introBegin");
  const musicBtn = document.getElementById("musicToggle");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Reduced motion, or a shared deep link (/#gallery …) — the visitor asked for a
  // specific section, so don't make them sit through the opening film.
  if (reduce || window.W.deepLink) {
    film.style.display = "none";
    window.dispatchEvent(new CustomEvent("jg:intro-done")); // let the music start right away
    return; // loader stays frame-driven
  }

  window.W.filmGate = true; // claim the loader (cardScene.hideLoader defers to us)
  let dismissed = false, started = false;

  // the vinyl floats above the film (see .music-toggle.over-intro) so the one
  // sound control never disappears
  if (musicBtn) musicBtn.classList.add("over-intro");

  // keep the page from scrolling behind the film
  document.documentElement.style.overflow = "hidden";
  if (window.__lenis) window.__lenis.stop();

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    window.W.filmGate = false;
    if (loader) loader.classList.add("hidden"); // never leave the visitor behind the gate
    try { video.pause(); } catch (e) {}
    if (musicBtn) musicBtn.classList.remove("over-intro");
    film.classList.add("done");
    if (window.W.initIntroButterflies) window.W.initIntroButterflies(); // butterflies pop over the envelope
    document.documentElement.style.overflow = "";
    window.scrollTo(0, 0);
    if (window.__lenis) { window.__lenis.scrollTo(0, { immediate: true }); window.__lenis.start(); }
    film.addEventListener("transitionend", () => { film.style.display = "none"; }, { once: true });
    setTimeout(() => { film.style.display = "none"; }, 1400); // fallback if no transitionend
    window.dispatchEvent(new CustomEvent("jg:intro-done")); // cue the background music
  }

  video.addEventListener("ended", dismiss);
  video.addEventListener("error", dismiss);          // never trap the visitor on a bad load

  skipBtn.addEventListener("click", dismiss);

  // (No film-audio handover: the film is silent by design, so the vinyl over it
  //  controls the background song directly. A bindIntroVideo() call used to sit here
  //  for a hook music.js has never exported — it did nothing at all.)

  // once playback truly starts, lift the gate and arm the end safety.
  // "playing" is the source of truth — it fires whether the attribute autoplay,
  // our play() calls, or the visitor's tap started it.
  function onStarted() {
    if (started || dismissed) return;
    started = true;
    beginBtn.hidden = true;
    if (loader) loader.classList.add("hidden");
    window.W.filmGate = false; // frames may hide the (already hidden) loader freely
    const ms = ((isFinite(video.duration) && video.duration) || 10) * 1000 + 4000;
    setTimeout(dismiss, ms); // safety if "ended" never fires
  }
  video.addEventListener("playing", onStarted);

  // autoplay refused → lift the loader and offer Begin (tap the film also works)
  function showBegin() {
    if (started || dismissed) return;
    if (loader) loader.classList.add("hidden");
    beginBtn.hidden = false;
  }
  const beginPlay = () => {
    if (started || dismissed) return;
    beginBtn.hidden = true;
    // the film stays muted — the tap that pressed Begin also lets the song start
    video.play().catch(dismiss);
  };
  beginBtn.addEventListener("click", beginPlay);
  video.addEventListener("click", () => { if (!beginBtn.hidden) beginPlay(); });

  const tryPlay = () => {
    if (started || dismissed) return;
    video.play().catch(showBegin);
  };

  // the gate: reveal the film as soon as the video is genuinely playable.
  // Mobile browsers often never fire canplaythrough (deferred loading / data
  // saver), so listen to the earlier signals too.
  video.muted = true; // property, not just attribute — some mobiles require it
  video.addEventListener("canplaythrough", tryPlay, { once: true });
  video.addEventListener("loadeddata", tryPlay, { once: true });
  if (video.readyState >= 2) tryPlay();

  // staged fallbacks: at 4s try playing regardless (it can buffer as it goes);
  // at 10s show Begin if the media exists, or skip the film if nothing loaded
  setTimeout(tryPlay, 4000);
  setTimeout(() => {
    if (started || dismissed) return;
    if (video.readyState >= 2) showBegin();
    else dismiss();
  }, 10000);
})();
