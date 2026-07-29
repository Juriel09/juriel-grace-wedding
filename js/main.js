(function () {
  "use strict";
  const scene = new window.W.CardScene();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noGSAP = typeof window.gsap === "undefined";

  if (reduce) {
    scene.initLite();
  } else {
    if (typeof window.Lenis !== "undefined") {
      // Smooth the WHEEL only. Touch is left to the browser: `syncTouch` was turned on
      // so the old section snap could drive mobile scrolling through lenis.scrollTo,
      // but that snap is gone (W.snapLock and W.snapSyncFromScroll are empty stubs in
      // sections.js), and all it did afterwards was re-implement touch scrolling in JS
      // — amplified 1.5x, which made a phone feel twitchy and overshoot whole sections.
      // A phone's native momentum scrolling is better than any approximation of it.
      // lenis.scrollTo still works for nav jumps and deep links either way.
      const lenis = new window.Lenis({
        lerp: 0.1, smoothWheel: true, wheelMultiplier: 1.15,
        syncTouch: false, touchMultiplier: 1,
      });
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      window.__lenis = lenis;
    }
    scene.init();
  }

  if (window.W.StoryScene) {
    const story = new window.W.StoryScene();
    if (reduce) story.initLite(); else story.init();
  }

  if (window.W.initSections) window.W.initSections();
  if (window.W.Router) window.W.Router.init(); // after the snap exists, so deep links can sync it
  if (window.W.Theme) window.W.Theme.init();
  if (window.W.Music) window.W.Music.init();
  if (window.W.BackgroundScene) { var bg = new window.W.BackgroundScene(); bg.start(); window.__bg = bg; }
})();
