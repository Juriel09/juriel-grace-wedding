/* Bootstrap. Wires Lenis smooth scroll + the card scene.
   Lite/reduced-motion fallback is added in Task 9. */
(function () {
  "use strict";
  const scene = new window.W.CardScene();

  // Lenis smooth scroll (optional; scene reads window.scrollY regardless)
  if (typeof window.Lenis !== "undefined") {
    const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    window.__lenis = lenis;
  }

  scene.init();
  if (window.W.initSections) window.W.initSections();
})();
