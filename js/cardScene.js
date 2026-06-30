/* Act 1 + Act 2 controller. Driven by one smoothed progress value.
   Phases (of eased progress p in [0,1]):
     OPEN   [0.00, 0.42)  card cover opens (frame scrub), camera identity
     INTRO  [0.42, 0.52)  zoom to whole inner page, names fade in        (Task 6)
     READ   [0.52, 0.90)  zoom + pan top->bottom through the text         (Task 6)
     OUT    [0.90, 1.00]  pull back to whole open card                    (Task 6) */
(function () {
  "use strict";
  window.W = window.W || {};
  const G = window.W.geom;

  const FRAME_COUNT = 193;
  const FRAME_W = 1280, FRAME_H = 720;
  const framePath = (i) => `media/frames/frame_${String(i).padStart(4, "0")}.webp`;

  const P_OPEN = 0.42;

  function CardScene() {
    this.canvas = document.getElementById("cardCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.layer = document.getElementById("cardLayer");
    this.stage = document.getElementById("cardStage");
    this.scroll = document.getElementById("cardScroll");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.eased = 0; this.target = 0; this.lastIdx = -1;
    this.getScroll = () => window.scrollY; // overridden by main.js when Lenis is active
  }

  CardScene.prototype.init = function () {
    const self = this;
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
    window.addEventListener("resize", () => { self.sizeCanvas(); self.render(true); });
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

  CardScene.prototype.progress = function () {
    const rect = this.scroll.getBoundingClientRect();
    const total = this.scroll.offsetHeight - window.innerHeight;
    return G.clamp(-rect.top / total, 0, 1);
  };

  CardScene.prototype.tick = function () {
    this.target = this.progress();
    this.eased += (this.target - this.eased) * 0.09;        // smoothing
    if (Math.abs(this.target - this.eased) < 0.0002) this.eased = this.target;
    this.render(false);
  };

  // draw a frame index to the canvas (contain-fit, centered)
  CardScene.prototype.draw = function (idx) {
    const ctx = this.ctx; if (!ctx || !this.pre) return;
    idx = G.clamp(idx, 0, FRAME_COUNT - 1);
    const img = this.pre.frame(idx); if (!img) return;
    this.lastIdx = idx;
    const cw = this.canvas.width, ch = this.canvas.height;
    const r = G.frameRect(cw, ch, img.naturalWidth, img.naturalHeight);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  };

  // render visual state from eased progress. (camera/reading added in Task 6)
  CardScene.prototype.render = function (force) {
    const p = this.eased;
    // OPEN phase: scrub frames
    const op = G.clamp(p / P_OPEN, 0, 1);
    this.draw(G.frameIndexForProgress(op, FRAME_COUNT));
    // camera identity for now
    this.layer.style.transform = "translate(0px,0px) scale(1)";
    // scroll hint fades once opening begins
    const hint = document.getElementById("scrollHint");
    if (hint) hint.style.opacity = p > 0.02 ? "0" : "1";
  };

  window.W.CardScene = CardScene;
})();
