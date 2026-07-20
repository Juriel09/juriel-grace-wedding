/* Card scene controller. One smoothed progress value (lerp + rAF) drives:
     OPEN     [0, P_OPEN)  the envelope opens and the card rises (frame scrub)
     DETAILS  [P_OPEN, 1]  the card is out; the main details fade in.
   The envelope frames are drawn contain-fit on the ivory paper; an ivory vignette
   melts the video's studio-gray backdrop into the page while it plays. As the card
   finishes rising it crossfades to the clean extracted still (transparent
   background), and the details settle onto the blank ivory card. */
(function () {
  "use strict";
  window.W = window.W || {};
  const G = window.W.geom;

  const pad = (i) => String(i).padStart(4, "0");

  // Two shoots of the same envelope: a landscape one for wide screens and a
  // portrait one for phones. Each declares its frame set, extracted still,
  // rise timing, and the card-face rect the details sit on. The variant is
  // chosen once at init by viewport (see pickVariant).
  const VARIANTS = {
    desktop: {
      count: 190, fw: 1280, fh: 720,               // trailing full-card frames trimmed (was 240)
      path: (i) => `media/frames/frame_${pad(i)}.webp`,
      still: "media/card/open-card.png",
      riseFrame: 130 / 189, riseAt: 0.35,          // flap opens, then the card rises
      ax0: 0.357, ax1: 0.643, ay0: 0.15, ay1: 0.52, // card face (above the fold)
      fontKW: 0.075, fontKH: 0.06,                  // type scale vs rect width / height
    },
    mobile: {
      count: 190, fw: 1080, fh: 1920,              // trailing full-card frames trimmed (was 240)
      path: (i) => `media/frames-mobile/frame_${pad(i)}.webp`,
      still: "media/card/open-card-mobile.png",
      riseFrame: 168 / 189, riseAt: 0.35,
      // the portrait card is large, so the details use a generous slice of its face
      ax0: 0.24, ax1: 0.76, ay0: 0.25, ay1: 0.58,
      fontKW: 0.09, fontKH: 0.072,
    },
  };

  // match the video's orientation to the viewport: the portrait shoot fills a
  // phone (or any taller-than-wide window); the landscape shoot fills wide screens
  const pickVariant = () =>
    window.matchMedia("(orientation: portrait)").matches ? VARIANTS.mobile : VARIANTS.desktop;

  const DOC_HTML =
    '<div class="doc-inner">' +
      '<div class="doc-block doc-names" data-at="0.0">' +
        '<p class="doc-eyebrow">together with their families</p>' +
        '<h1 class="doc-couple"><span>Juriel</span> <span class="amp foil">&amp;</span> <span>Grace</span></h1>' +
      '</div>' +
      '<div class="doc-block" data-at="0.4">' +
        '<span class="doc-rule" aria-hidden="true"></span>' +
        '<div class="doc-facts">' +
          '<div><span class="k">When</span><span class="v">November 11, 2026 · 3:00 PM</span></div>' +
          '<div><span class="k">Where</span><span class="v">The Forest Barn, Alfonso, Cavite</span></div>' +
          '<div><span class="k">Attire</span><span class="v">Formal · Forest Greens &amp; Soft Neutrals</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const P_OPEN = 0.8;

  // the video spends the first stretch opening the flap and the rest raising the
  // card; a linear scrub rushes the rise, so give it the bulk of the scroll: the
  // first riseAt of the opening scroll plays the flap, the remainder the rise
  const frameFrac = (v, u) => u < v.riseAt
    ? G.mapRange(u, 0, v.riseAt, 0, v.riseFrame, true)
    : G.mapRange(u, v.riseAt, 1, v.riseFrame, 1, true);

  function CardScene() {
    this.canvas = document.getElementById("cardCanvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.stage = document.getElementById("cardStage");
    this.scroll = document.getElementById("cardScroll");
    this.still = document.getElementById("cardStill");
    this.bgIvory = document.getElementById("cardBgIvory");
    this.doc = document.getElementById("cardDoc");
    this.intro = document.getElementById("cardIntro");
    this.vignette = document.querySelector(".card-vignette");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.v = pickVariant();
    window.W.cardFrameAspect = this.v.fw / this.v.fh; // so the countdown can sit on the card's bottom edge
    if (this.still) this.still.src = this.v.still;   // swap in the matching still
    this.eased = 0; this.target = 0; this.lastIdx = -1;
  }

  CardScene.prototype.init = function () {
    const self = this;
    this.doc.innerHTML = DOC_HTML;
    this.pre = new window.W.Preloader({
      count: this.v.count, path: this.v.path,
      onFirst: () => { self.sizeCanvas(); self.draw(0); },
      onProgress: (p) => {
        const el = document.getElementById("loaderPct");
        if (el) el.textContent = Math.round(p * 100) + "%";
      },
      onDone: () => self.hideLoader(),
    });
    this.pre.start();
    setTimeout(() => self.hideLoader(), 15000); // safety

    this.sizeCanvas();
    window.addEventListener("resize", () => { self.sizeCanvas(); self.render(); });
    // tap/click the closed card to auto-scroll it open (in addition to scrolling)
    if (this.stage) this.stage.addEventListener("click", () => self.openByClick());
    requestAnimationFrame(function loop() { self.tick(); requestAnimationFrame(loop); });
  };

  // glide the card fully open (only while it is still closed/opening). Ease-OUT so
  // the card moves at full speed the instant it's tapped — no dead, motionless
  // beat that reads as lag — then decelerates into a soft landing on the open card.
  CardScene.prototype.openByClick = function () {
    if (this.eased > 0.85) return;
    const target = this.scroll.offsetTop + this.scroll.offsetHeight - window.innerHeight;
    // easeOutCubic — moves right away (no dead beat) but at a calm pace, easing
    // into a soft landing on the open card
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    if (window.__lenis) {
      // hold the section-snap off while the card glides open, then hand back with
      // the card marked "revealed & waiting" — so it stays put on the open card and
      // only the user's next scroll slides the first section in.
      if (window.W.snapLock) window.W.snapLock(true);
      const done = () => {
        if (window.W.snapLock) window.W.snapLock(false);
        if (window.W.cardOpened) window.W.cardOpened();
      };
      window.__lenis.scrollTo(target, { duration: 3.4, easing: easeOutCubic, onComplete: done });
      clearTimeout(window.__cardOpenT);
      window.__cardOpenT = setTimeout(done, 3800); // safety: always release the lock
    } else {
      window.scrollTo({ top: target, behavior: "smooth" });
    }
  };

  CardScene.prototype.hideLoader = function () {
    if (window.W.filmGate) return; // the opening film owns the loader until it starts
    const l = document.getElementById("loader"); if (l) l.classList.add("hidden");
  };

  CardScene.prototype.sizeCanvas = function () {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.draw(this.lastIdx < 0 ? 0 : this.lastIdx);
  };

  // contain-fit the frame into a w×h box, centered (whole frame visible, no crop)
  CardScene.prototype.frameDrawRect = function (w, h) {
    const scale = Math.min(w / this.v.fw, h / this.v.fh);
    const dw = this.v.fw * scale, dh = this.v.fh * scale;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  };

  // the card-face rect in CSS px (for positioning the details over it)
  CardScene.prototype.acRect = function () {
    const f = this.frameDrawRect(this.canvas.clientWidth, this.canvas.clientHeight), v = this.v;
    return { x: f.x + v.ax0 * f.w, y: f.y + v.ay0 * f.h, w: (v.ax1 - v.ax0) * f.w, h: (v.ay1 - v.ay0) * f.h };
  };

  // size/position the details onto the acrylic page; type scales with the page
  CardScene.prototype.layout = function () {
    const a = this.acRect(), s = this.doc.style, v = this.v;
    s.left = a.x + "px"; s.top = a.y + "px"; s.width = a.w + "px"; s.height = a.h + "px";
    s.fontSize = Math.min(a.w * v.fontKW, a.h * v.fontKH) + "px";
  };

  CardScene.prototype.progress = function () {
    const rect = this.scroll.getBoundingClientRect();
    const total = this.scroll.offsetHeight - window.innerHeight;
    return G.clamp(-rect.top / total, 0, 1);
  };

  CardScene.prototype.tick = function () {
    this.target = this.progress();
    this.eased += (this.target - this.eased) * 0.09;        // smoothing
    if (Math.abs(this.target - this.eased) < 0.0002) this.eased = this.target;
    this.render();
  };

  // draw a frame index to the canvas (contain-fit, whole frame visible)
  CardScene.prototype.draw = function (idx) {
    const ctx = this.ctx; if (!ctx || !this.pre) return;
    idx = G.clamp(idx, 0, this.v.count - 1);
    const img = this.pre.frame(idx); if (!img) return;
    this.lastIdx = idx;
    const cw = this.canvas.width, ch = this.canvas.height;
    const r = this.frameDrawRect(cw, ch);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  };

  // fade the detail blocks in, staggered by their data-at over the details progress
  CardScene.prototype.reveals = function (dp) {
    this.doc.querySelectorAll(".doc-block").forEach((b) => {
      const at = parseFloat(b.getAttribute("data-at")) || 0;
      b.classList.toggle("show", dp >= at);
    });
  };

  CardScene.prototype.render = function () {
    const p = this.eased;
    this.layout();

    // crossfade the live frames -> the clean extracted still as the card finishes
    // opening (tight band, so the card image doesn't ghost during the swap)
    const x = G.mapRange(p, P_OPEN, P_OPEN + 0.06, 0, 1, true);
    this.canvas.style.opacity = String(1 - x);
    if (this.still) this.still.style.opacity = String(x);
    // Dissolve the studio-gray stage backdrop to transparent so the fixed three.js
    // forest + fireflies show behind the open card. Give it its own wide, eased
    // curve over the whole details phase so the trees ease in gently as the
    // details settle — rather than popping in over the narrow crossfade band.
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const reveal = easeInOutCubic(G.mapRange(p, P_OPEN, 1, 0, 1, true));
    if (this.bgIvory) this.bgIvory.style.opacity = "0";
    if (this.stage) this.stage.style.background = "rgba(213,213,213," + (1 - reveal) + ")";
    if (this.vignette) this.vignette.style.opacity = String(1 - reveal);

    if (p < P_OPEN) {                          // OPEN: scrub frames open the card
      this.draw(G.frameIndexForProgress(frameFrac(this.v, p / P_OPEN), this.v.count));
      this.doc.style.opacity = "0";
      this.reveals(-1);
    } else {                                   // DETAILS: card open — all details fade in together
      this.draw(this.v.count - 1);
      this.doc.style.opacity = "1";
      this.reveals(1); // show every block at once (no per-block scroll stagger)
    }
    // the love-letter intro + hint live only on the closed screen; fade both as
    // scrolling begins, and offer a pointer cursor while a click will open the card
    if (this.intro) this.intro.style.opacity = String(G.mapRange(p, 0, 0.08, 1, 0, true));
    if (this.stage) this.stage.style.cursor = p < 0.85 ? "pointer" : "";
  };

  // reduced-motion: static open card + details shown immediately, no scrub
  CardScene.prototype.initLite = function () {
    const self = this;
    document.body.classList.add("lite");
    this.doc.innerHTML = DOC_HTML;
    this.doc.querySelectorAll(".doc-block").forEach((b) => b.classList.add("show"));
    if (this.still) this.still.style.opacity = "1";
    if (this.canvas) this.canvas.style.opacity = "0";
    if (this.vignette) this.vignette.style.opacity = "0";
    if (this.intro) this.intro.style.display = "none";
    this.doc.style.opacity = "1";
    if (this.still && this.still.complete) self.hideLoader();
    else if (this.still) this.still.addEventListener("load", () => self.hideLoader());
    setTimeout(() => self.hideLoader(), 6000);
  };

  window.W.CardScene = CardScene;
})();
