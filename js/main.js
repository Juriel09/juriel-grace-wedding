(function () {
  "use strict";
  const scene = new window.W.CardScene();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noGSAP = typeof window.gsap === "undefined";

  if (reduce) {
    scene.initLite();
  } else {
    if (typeof window.Lenis !== "undefined") {
      // normal, smooth scroll pace for opening the card; a small touch bump helps
      // phones. Getting to the next section is handled by the section snap, not by
      // over-sensitive scrolling. syncTouch lets Lenis own touch scrolling too, so
      // the section snap (which drives scroll via lenis.scrollTo) works on mobile.
      const lenis = new window.Lenis({
        lerp: 0.1, smoothWheel: true, wheelMultiplier: 1.15,
        syncTouch: true, touchMultiplier: 1.5,
      });
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      window.__lenis = lenis;
    }
    scene.init();
  }

  if (window.W.initSections) window.W.initSections();
  if (window.W.Theme) window.W.Theme.init();
  if (window.W.BackgroundScene) { var bg = new window.W.BackgroundScene(); bg.start(); window.__bg = bg; }
})();
