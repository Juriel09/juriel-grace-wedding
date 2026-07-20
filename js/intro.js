/* Opening film. The J&G loader (z 400) covers everything until the intro video
   can actually play through — only then does the loader lift and the film start
   (muted autoplay, browser-safe). While the film gates, cardScene's frame-driven
   hideLoader is suppressed via window.W.filmGate. Skip dismisses early; a sound
   toggle un-mutes; if autoplay is blocked a "Begin" button appears. If the video
   stalls too long we skip straight to the site. Reduced-motion skips the film. */
(function () {
  "use strict";
  window.W = window.W || {};
  const film = document.getElementById("introFilm");
  const loader = document.getElementById("loader");
  if (!film) return;
  const video = document.getElementById("introFilmVideo");
  const skipBtn = document.getElementById("introSkip");
  const soundBtn = document.getElementById("introSound");
  const beginBtn = document.getElementById("introBegin");
  const onLabel = soundBtn ? soundBtn.querySelector(".intro-sound-on") : null;
  const offLabel = soundBtn ? soundBtn.querySelector(".intro-sound-off") : null;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { film.style.display = "none"; return; } // loader stays frame-driven

  window.W.filmGate = true; // claim the loader (cardScene.hideLoader defers to us)
  let dismissed = false, started = false;

  // keep the page from scrolling behind the film
  document.documentElement.style.overflow = "hidden";
  if (window.__lenis) window.__lenis.stop();

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    window.W.filmGate = false;
    if (loader) loader.classList.add("hidden"); // never leave the visitor behind the gate
    try { video.pause(); } catch (e) {}
    film.classList.add("done");
    if (window.W.initIntroButterflies) window.W.initIntroButterflies(); // butterflies pop over the envelope
    document.documentElement.style.overflow = "";
    window.scrollTo(0, 0);
    if (window.__lenis) { window.__lenis.scrollTo(0, { immediate: true }); window.__lenis.start(); }
    film.addEventListener("transitionend", () => { film.style.display = "none"; }, { once: true });
    setTimeout(() => { film.style.display = "none"; }, 1400); // fallback if no transitionend
  }

  video.addEventListener("ended", dismiss);
  video.addEventListener("error", dismiss);          // never trap the visitor on a bad load

  skipBtn.addEventListener("click", dismiss);

  // keep the toggle label + aria in sync with the real muted state
  function setSoundLabel() {
    if (onLabel && offLabel) { onLabel.hidden = video.muted; offLabel.hidden = !video.muted; }
    soundBtn.setAttribute("aria-label", video.muted ? "Turn on sound" : "Turn off sound");
  }

  // sound is ON by default; browsers block unmuted autoplay, so if we had to
  // start muted, unmute the instant the visitor first interacts (tap/scroll/key).
  let gestureArmed = false;
  function unmute() {
    video.muted = false;
    setSoundLabel();
    video.play().catch(() => {}); // resume if unmuting paused it
  }
  function armGestureUnmute() {
    if (gestureArmed || !video.muted) return;
    gestureArmed = true;
    const evs = ["pointerdown", "touchstart", "keydown", "wheel"];
    const on = () => { evs.forEach((e) => window.removeEventListener(e, on)); unmute(); };
    evs.forEach((e) => window.addEventListener(e, on, { once: true, passive: true }));
  }
  function attemptSound() {
    // NB: do NOT optimistically unmute here — on strict browsers unmuting an
    // autoplaying video pauses it, which would break the autoplay. Keep the
    // reliable muted autoplay and turn sound on at the first visitor gesture.
    setSoundLabel();
    armGestureUnmute();
  }

  soundBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    setSoundLabel();
    if (!video.muted) video.play().catch(() => {});
  });

  // once playback truly starts, lift the gate, try for sound, arm the end safety.
  // "playing" is the source of truth — it fires whether the attribute autoplay,
  // our play() calls, or the visitor's tap started it.
  function onStarted() {
    if (started || dismissed) return;
    started = true;
    beginBtn.hidden = true;
    if (loader) loader.classList.add("hidden");
    window.W.filmGate = false; // frames may hide the (already hidden) loader freely
    attemptSound();
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
    video.muted = false; // started by a real tap, so audio is allowed
    if (onLabel && offLabel) { onLabel.hidden = false; offLabel.hidden = true; }
    video.play().catch(() => {
      video.muted = true;
      if (onLabel && offLabel) { onLabel.hidden = true; offLabel.hidden = false; }
      video.play().catch(dismiss);
    });
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
