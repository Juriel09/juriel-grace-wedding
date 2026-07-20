/* Butterfly burst for the envelope/opening screen. DOM sprites (butterfly.png)
   layered ABOVE the card scene (which is opaque, so the WebGL butterflies can't
   show there). Each springs up from the bottom, flutters upward on a drifting
   path, and loops while the visitor is on the intro. The whole layer fades out as
   the card opens (scroll), then removes itself. Skipped under reduced motion. */
(function () {
  "use strict";
  window.W = window.W || {};
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var started = false;

  function spawn(layer) {
    var wrap = document.createElement("div");
    wrap.className = "ib-fly";
    var img = document.createElement("img");
    img.className = "ib-wing";
    img.src = "media/art/butterfly.png";
    img.alt = "";
    wrap.appendChild(img);

    // start anywhere on screen and drift off along a random heading (any direction)
    var ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 80;
    wrap.style.left = (Math.random() * 100) + "vw";
    wrap.style.top = (Math.random() * 100) + "vh";
    wrap.style.bottom = "auto";
    wrap.style.setProperty("--h", (24 + Math.random() * 36) + "px");          // height
    wrap.style.setProperty("--tx", (Math.cos(ang) * dist) + "vw");           // travel x
    wrap.style.setProperty("--ty", (Math.sin(ang) * dist) + "vh");           // travel y
    wrap.style.setProperty("--dur", (9 + Math.random() * 8) + "s");          // travel time
    wrap.style.setProperty("--delay", (-Math.random() * 8) + "s");           // desync (negative = mid-cycle)
    img.style.setProperty("--flap", (0.22 + Math.random() * 0.18) + "s");
    layer.appendChild(wrap);
  }

  function start() {
    if (started || reduce) return;
    var layer = document.getElementById("introButterflies");
    if (!layer) return;
    started = true;
    var count = window.innerWidth < 700 ? 8 : 16;
    for (var i = 0; i < count; i++) spawn(layer);

    // fade the burst out as the card opens; remove once it's gone
    var onScroll = function () {
      var p = Math.min(window.scrollY / (window.innerHeight * 0.6), 1);
      layer.style.opacity = String(1 - p);
      if (p >= 1) { layer.style.display = "none"; window.removeEventListener("scroll", onScroll); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  window.W.initIntroButterflies = start;
})();
