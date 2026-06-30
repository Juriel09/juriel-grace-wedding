/* Card scene controller. One smoothed progress value (lerp + rAF) drives:
     OPEN     [0, P_OPEN)  the card cover opens (frame scrub)
     DETAILS  [P_OPEN, 1]  the card is open; the main details fade in.
   The card is drawn to fit the screen (contain-fit, whole frame visible) as the
   site intro, on a beige tabletop background so it feels full-screen. The details are
   fitted onto the real frosted acrylic page of the open card — no zoom, no extra
   acrylic panel. */
(function () {
  "use strict";
  window.W = window.W || {};
  const G = window.W.geom;

  const FRAME_COUNT = 193;
  const FRAME_W = 1280, FRAME_H = 720;
  const framePath = (i) => `media/frames/frame_${String(i).padStart(4, "0")}.webp`;

  // the acrylic (right) page as a fraction of the frame
  const AX0 = 0.371, AX1 = 0.719, AY0 = 0.094, AY1 = 0.919;

  const DOC_HTML =
    '<div class="doc-inner">' +
      '<div class="doc-block doc-names" data-at="0.0">' +
        '<p class="doc-eyebrow">together with their families</p>' +
        '<h1 class="doc-couple"><span>Grace</span> <span class="amp foil">&amp;</span> <span>Juriel</span></h1>' +
        '<p class="doc-date">November 11, 2026</p>' +
      '</div>' +
      '<div class="doc-block" data-at="0.4">' +
        '<span class="doc-rule" aria-hidden="true"></span>' +
        '<div class="doc-facts">' +
          '<div><span class="k">When</span><span class="v">November 11, 2026 · 3:00 PM</span></div>' +
          '<div><span class="k">Where</span><span class="v">The Forest Pavilion, Your City</span></div>' +
          '<div><span class="k">Attire</span><span class="v">Formal · Emerald &amp; Gold</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const P_OPEN = 0.7;

  function CardScene() {
    this.canvas = document.getElementById("cardCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.layer = document.getElementById("cardLayer");
    this.stage = document.getElementById("cardStage");
    this.scroll = document.getElementById("cardScroll");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.eased = 0; this.target = 0; this.lastIdx = -1;
    this.doc = document.getElementById("cardDoc");
  }

  CardScene.prototype.init = function () {
    const self = this;
    this.doc.innerHTML = DOC_HTML;
    this.pre = new window.W.Preloader({
      count: FRAME_COUNT, path: framePath,
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
    requestAnimationFrame(function loop() { self.tick(); requestAnimationFrame(loop); });
  };

  CardScene.prototype.hideLoader = function () {
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
    const scale = Math.min(w / FRAME_W, h / FRAME_H);
    const dw = FRAME_W * scale, dh = FRAME_H * scale;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  };

  // the acrylic page rect in CSS px (for positioning the details over it)
  CardScene.prototype.acRect = function () {
    const f = this.frameDrawRect(this.canvas.clientWidth, this.canvas.clientHeight);
    return { x: f.x + AX0 * f.w, y: f.y + AY0 * f.h, w: (AX1 - AX0) * f.w, h: (AY1 - AY0) * f.h };
  };

  // size/position the details onto the acrylic page; type scales with the page
  CardScene.prototype.layout = function () {
    const a = this.acRect(), s = this.doc.style;
    s.left = a.x + "px"; s.top = a.y + "px"; s.width = a.w + "px"; s.height = a.h + "px";
    s.fontSize = (a.w * 0.075) + "px";
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
    idx = G.clamp(idx, 0, FRAME_COUNT - 1);
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
    if (p < P_OPEN) {                          // OPEN: scrub frames open the card
      this.draw(G.frameIndexForProgress(p / P_OPEN, FRAME_COUNT));
      this.doc.style.opacity = "0";
      this.reveals(-1);
    } else {                                   // DETAILS: card open, fade details in
      this.draw(FRAME_COUNT - 1);
      this.doc.style.opacity = "1";
      this.reveals(G.mapRange(p, P_OPEN, 1, 0, 1, true));
    }
    const hint = document.getElementById("scrollHint");
    if (hint) hint.style.opacity = p > 0.02 ? "0" : "1";
  };

  // reduced-motion: static open card + details shown immediately, no scrub
  CardScene.prototype.initLite = function () {
    const self = this;
    document.body.classList.add("lite");
    this.doc.innerHTML = DOC_HTML;
    this.doc.querySelectorAll(".doc-block").forEach((b) => b.classList.add("show"));
    this.pre = new window.W.Preloader({
      count: FRAME_COUNT, path: framePath,
      onFirst: () => { self.sizeCanvas(); self.draw(FRAME_COUNT - 1); self.hideLoader(); },
      onDone: () => self.hideLoader(),
    });
    this.pre.start();
    setTimeout(() => self.hideLoader(), 8000);
    window.addEventListener("resize", () => { self.sizeCanvas(); self.draw(FRAME_COUNT - 1); });
  };

  window.W.CardScene = CardScene;
})();
