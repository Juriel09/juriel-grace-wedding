/* Card scene: the clean, pre-extracted open invitation card reveals on black
   (fade + gentle scale-in), then the details settle onto the frosted page.
   Scroll-driven and smoothed. No frame flip-book — just the extracted still,
   so the card is in normal colour on a pure-black background (no tan, no white). */
(function () {
  "use strict";
  window.W = window.W || {};
  const G = window.W.geom;

  const FRAME_W = 1280, FRAME_H = 720;
  // the acrylic (right) page as a fraction of the card image
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

  function CardScene() {
    this.stage = document.getElementById("cardStage");
    this.scroll = document.getElementById("cardScroll");
    this.still = document.getElementById("cardStill");
    this.doc = document.getElementById("cardDoc");
    this.eased = 0; this.target = 0;
  }

  CardScene.prototype.init = function () {
    const self = this;
    this.doc.innerHTML = DOC_HTML;
    // the extracted still is the only intro asset — hide the loader once it's ready
    if (this.still && this.still.complete) this.hideLoader();
    else if (this.still) this.still.addEventListener("load", () => self.hideLoader());
    setTimeout(() => self.hideLoader(), 6000);

    window.addEventListener("resize", () => self.render());
    requestAnimationFrame(function loop() { self.tick(); requestAnimationFrame(loop); });
  };

  CardScene.prototype.hideLoader = function () {
    const l = document.getElementById("loader"); if (l) l.classList.add("hidden");
  };

  // the acrylic-page rect (in CSS px) where the details sit, matching the contain-fit card image
  CardScene.prototype.acRect = function () {
    const f = G.frameRect(this.stage.clientWidth, this.stage.clientHeight, FRAME_W, FRAME_H);
    return { x: f.x + AX0 * f.w, y: f.y + AY0 * f.h, w: (AX1 - AX0) * f.w, h: (AY1 - AY0) * f.h };
  };

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

    // 1 · the card reveals: fade + gentle scale over the first stretch
    const r = G.mapRange(p, 0, 0.28, 0, 1, true);
    if (this.still) {
      this.still.style.opacity = String(r);
      this.still.style.transform = "scale(" + (0.92 + 0.08 * r) + ")";
    }

    // 2 · the details settle onto the frosted page once the card is fully in
    const dp = G.mapRange(p, 0.35, 0.9, 0, 1, true);
    this.doc.style.opacity = r > 0.6 ? "1" : "0";
    this.reveals(dp);

    const hint = document.getElementById("scrollHint");
    if (hint) hint.style.opacity = p > 0.02 ? "0" : "1";
  };

  // reduced-motion: show the clean card + details immediately, no scroll reveal
  CardScene.prototype.initLite = function () {
    const self = this;
    document.body.classList.add("lite");
    this.doc.innerHTML = DOC_HTML;
    this.doc.querySelectorAll(".doc-block").forEach((b) => b.classList.add("show"));
    if (this.still) { this.still.style.opacity = "1"; this.still.style.transform = "none"; }
    this.doc.style.opacity = "1";
    if (this.still && this.still.complete) this.hideLoader();
    else if (this.still) this.still.addEventListener("load", () => self.hideLoader());
    setTimeout(() => self.hideLoader(), 6000);
  };

  window.W.CardScene = CardScene;
})();
