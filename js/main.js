(function () {
  "use strict";
  const scene = new window.W.CardScene();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noGSAP = typeof window.gsap === "undefined";

  if (reduce) {
    scene.initLite();
  } else {
    if (typeof window.Lenis !== "undefined") {
      const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      window.__lenis = lenis;
    }
    scene.init();
  }

  if (window.W.initSections) window.W.initSections();
})();
