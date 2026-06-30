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

  // inner (right) page of the open frame, as fractions of the drawn frame
  const AX0 = 0.371, AX1 = 0.719, AY0 = 0.094, AY1 = 0.919;

  const DOC_HTML =
    '<div class="doc-inner">' +
      '<div class="doc-block doc-names" data-at="0.10">' +
        '<p class="doc-eyebrow">together with their families</p>' +
        '<h1 class="doc-couple"><span>Grace</span><span class="amp foil">&amp;</span><span>Juriel</span></h1>' +
        '<p class="doc-date">November 11, 2026</p>' +
      '</div>' +
      '<div class="doc-block doc-section" data-at="0.34">' +
        '<p class="eyebrow">our story</p><h2>How it began</h2>' +
        '<p>A rainy afternoon, a shared umbrella, and a conversation that never quite ended. ' +
        'Five years later, the question was finally asked — and the answer was always going to be yes.</p>' +
      '</div>' +
      '<div class="doc-block doc-section" data-at="0.58">' +
        '<p class="eyebrow">when &amp; where</p><h2>The Celebration</h2>' +
        '<div class="doc-facts">' +
          '<div><span class="k">When</span><br><span class="v">November 11, 2026 · 3:00 PM</span></div>' +
          '<div><span class="k">Where</span><br><span class="v">The Forest Pavilion, Your City</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="doc-block doc-section" data-at="0.82">' +
        '<p class="eyebrow">attire</p><h2>Dress Code</h2>' +
        '<p>Formal · Emerald &amp; Gold. Join us dressed for an evening among the trees.</p>' +
      '</div>' +
    '</div>';

  const P_OPEN = 0.42;

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

  CardScene.prototype.acRect = function () {
    const r = G.frameRect(this.canvas.clientWidth, this.canvas.clientHeight, FRAME_W, FRAME_H);
    return G.subRect(r, AX0, AY0, AX1, AY1);
  };

  CardScene.prototype.layout = function () {
    const a = this.acRect();
    const s = this.doc.style;
    s.left = a.x + "px"; s.top = a.y + "px"; s.width = a.w + "px"; s.height = a.h + "px";
    s.fontSize = (a.w * 0.062) + "px"; // type scales with card; tuned for the read zoom
  };

  // camera presets
  CardScene.prototype.camFull = function () {
    return G.frameTo(this.acRect(), window.innerWidth, window.innerHeight, "contain", 0.92);
  };
  CardScene.prototype.camRead = function (rp) {
    const a = this.acRect(), vw = window.innerWidth, vh = window.innerHeight;
    const s = (vw / a.w) * 0.94;                       // zoom so the page width nearly fills
    const x = vw / 2 - s * (a.x + a.w / 2);            // centered horizontally
    const yTop = -s * a.y;                             // page top at viewport top
    const yBot = vh - s * (a.y + a.h);                 // page bottom at viewport bottom
    return { x, y: G.lerp(yTop, yBot, rp), scale: s };
  };
  CardScene.prototype.setCam = function (c) {
    this.layer.style.transform = "translate(" + c.x + "px," + c.y + "px) scale(" + c.scale + ")";
  };
  CardScene.prototype.lerpCam = function (a, b, t) {
    return { x: G.lerp(a.x, b.x, t), y: G.lerp(a.y, b.y, t), scale: G.lerp(a.scale, b.scale, t) };
  };

  CardScene.prototype.reveals = function (rp) {
    const blocks = this.doc.querySelectorAll(".doc-block");
    blocks.forEach((b) => {
      const at = parseFloat(b.getAttribute("data-at"));
      b.classList.toggle("show", rp >= at - 0.08);
    });
  };

  CardScene.prototype.render = function () {
    const p = this.eased;
    this.layout();

    if (p < P_OPEN) {                          // OPEN
      const op = G.clamp(p / P_OPEN, 0, 1);
      this.draw(G.frameIndexForProgress(op, FRAME_COUNT));
      this.setCam({ x: 0, y: 0, scale: 1 });
      this.doc.style.opacity = "0";
    } else {
      this.draw(FRAME_COUNT - 1);              // hold fully-open frame
      const idnt = { x: 0, y: 0, scale: 1 };
      if (p < 0.52) {                          // INTRO: identity -> full page
        const t = G.mapRange(p, P_OPEN, 0.52, 0, 1, true);
        this.setCam(this.lerpCam(idnt, this.camFull(), t));
        this.doc.style.opacity = String(t);
        this.reveals(0.05);                    // names only
      } else if (p < 0.90) {                   // READ: pan top -> bottom
        const rp = G.mapRange(p, 0.52, 0.90, 0, 1, true);
        this.setCam(this.camRead(rp));
        this.doc.style.opacity = "1";
        this.reveals(rp);
      } else {                                 // OUT: read-bottom -> whole card
        const t = G.mapRange(p, 0.90, 1, 0, 1, true);
        this.setCam(this.lerpCam(this.camRead(1), this.camFull(), t));
        this.doc.style.opacity = String(1 - t * 0.6);
        this.reveals(1);
      }
    }

    const hint = document.getElementById("scrollHint");
    if (hint) hint.style.opacity = p > 0.02 ? "0" : "1";
  };

  CardScene.prototype.initLite = function () {
    const self = this;
    document.body.classList.add("lite");
    this.doc.innerHTML = DOC_HTML;
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
