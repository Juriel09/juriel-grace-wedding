/* Wedding countdown, shown at the bottom of the opening/envelope screen. Ticks to
   the ceremony (Nov 11, 2026, 2:00 PM Philippine time) and fades out as the card
   opens — so it lives "in the initial screen up to the opened card". */
(function () {
  "use strict";
  window.W = window.W || {};
  var TARGET = new Date("2026-11-11T14:00:00+08:00").getTime();
  var CAPS = { d: "days", h: "hrs", m: "min", s: "sec" };

  function two(n) { return (n < 10 ? "0" : "") + n; }
  function unit(u) {
    return '<div class="cd-unit" data-u="' + u + '"><span class="cd-num">0</span>' +
           '<span class="cd-cap">' + CAPS[u] + '</span></div>';
  }
  function sep() { return '<span class="cd-sep">:</span>'; }

  function init() {
    var el = document.getElementById("countdown");
    if (!el) return;
    el.innerHTML =
      '<span class="cd-label">countdown to forever</span>' +
      '<div class="cd-row">' + unit("d") + sep() + unit("h") + sep() + unit("m") + sep() + unit("s") + '</div>' +
      // the panel only exists once the card is open, so this reads as "you have"
      // "read it — keep going" rather than an instruction for the envelope
      '<span class="cd-next">Swipe up</span>';
    var d = el.querySelector('[data-u="d"] .cd-num'), h = el.querySelector('[data-u="h"] .cd-num'),
        m = el.querySelector('[data-u="m"] .cd-num'), s = el.querySelector('[data-u="s"] .cd-num');

    function tick() {
      var sec = Math.max(0, Math.floor((TARGET - Date.now()) / 1000));
      var days = Math.floor(sec / 86400); sec -= days * 86400;
      var hrs = Math.floor(sec / 3600); sec -= hrs * 3600;
      var mins = Math.floor(sec / 60); sec -= mins * 60;
      d.textContent = days; h.textContent = two(hrs); m.textContent = two(mins); s.textContent = two(sec);
    }
    tick();
    setInterval(tick, 1000);

    // show ONLY while the open card's details are on screen: stay hidden through the
    // closed envelope and the opening scrub, fade in as the details appear
    // (card progress ~0.8), hold on the open-card state, then fade out as we leave
    // the card scene for the next section.
    var cs = document.getElementById("cardScroll");
    // sit the panel on the card's bottom edge (the frame is contain-fit and
    // centered, so its bottom depends on the viewport aspect — compute it)
    var place = function () {
      var canvas = document.getElementById("cardCanvas");
      var aspect = window.W.cardFrameAspect;
      if (!canvas || !aspect) return;
      var r = canvas.getBoundingClientRect();
      if (!r.height) return;
      var dh = Math.min(r.height, r.width / aspect);       // drawn card-image height
      var cardBottom = r.top + (r.height + dh) / 2;        // viewport y of the card's bottom
      var inset = Math.max(16, dh * 0.06);                 // overlap onto the card's bottom
      el.style.bottom = Math.max(8, window.innerHeight - cardBottom + inset) + "px";
    };
    var onScroll = function () {
      if (!cs) { el.style.opacity = "0"; return; }
      place();                                                     // keep it pinned to the card bottom
      var total = cs.offsetHeight - window.innerHeight;
      var scrolled = -cs.getBoundingClientRect().top;              // px into the card scene
      var p = total > 0 ? Math.min(Math.max(scrolled / total, 0), 1) : 1;
      // fade in over the details window (P_OPEN 0.8 -> 0.9)
      var fadeIn = p < 0.8 ? 0 : p < 0.9 ? (p - 0.8) / 0.1 : 1;
      // fade out once we scroll past the fully-open card toward the next section
      var over = scrolled - total;
      var fadeOut = over <= 0 ? 1 : Math.max(0, 1 - over / (window.innerHeight * 0.5));
      el.style.opacity = String(Math.min(fadeIn, fadeOut));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", place);
    // Lenis owns smooth/touch scrolling; the native 'scroll' event is unreliable on
    // mobile, so update off Lenis's own scroll event too (this is why the countdown
    // wasn't appearing on phones). Retry hooking it in case Lenis inits a tick later.
    var hookLenis = function () {
      if (window.__lenis && window.__lenis.on) { window.__lenis.on("scroll", onScroll); return true; }
      return false;
    };
    if (!hookLenis()) {
      var tries = 0, iv = setInterval(function () {
        if (hookLenis() || ++tries > 20) clearInterval(iv);
      }, 100);
    }
    place();
    onScroll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.W.initCountdown = init;
})();
