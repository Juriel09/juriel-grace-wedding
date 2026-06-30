# Grace & Juriel Wedding Invitation Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, cinematic wedding invitation site where a deep-green acrylic card slowly opens on scroll, is then read top-to-bottom while zoomed (like a real invitation), and finally expands into fuller wedding-site sections — fixing the choppy scrub and "pasted-on text" problems of the prior build.

**Architecture:** Vanilla HTML/CSS/JS, no build step. A single tall sticky "card scene" drives everything from one smoothed scroll progress value (lerp + `requestAnimationFrame`), eliminating frame-stepping. Pure geometry/camera math lives in a testable module (`js/lib/geometry.js`) with Node unit tests. The readable surface is real, sharp CSS DOM styled to match the frosted-glass card (not mismatched PNG crops). Below the card scene, normal-flow sections handle gallery, film, entourage, RSVP, and a drone-footage footer.

**Tech Stack:** HTML5, CSS custom properties, vanilla ES5-compatible JS (global-namespace IIFE modules, no bundler — works over `file://` and any static host), GSAP 3.12.5 + ScrollTrigger + Lenis (CDN), Node's built-in test runner (`node --test`, zero dependencies) for unit tests, `ffmpeg-static` (already present in `..\website_card\.tools`) for media transcoding. Source assets reused from `..\website_card\media\frames` (193 card-opening frames) and `..\website_card\media\acrylic`.

---

## File Structure

```
wedding_website/
  index.html                 # single page; all sections
  css/
    tokens.css               # palette, type, spacing variables + @font-face/import
    base.css                 # reset, typography, layout primitives, nav, loader, lightbox
    card.css                 # card scene: stage, canvas, frosted reading surface, names, reveals
    sections.css             # gallery, prenup film, entourage, RSVP, footer/drone
  js/
    lib/
      geometry.js            # PURE camera/frame math (UMD: window.W.geom + module.exports)
      preloader.js           # progressive frame image preloader (window.W.Preloader)
    cardScene.js             # Act 1 + Act 2: smoothed progress -> frame draw + camera + reveals
    sections.js              # Act 3: section reveal, lightbox, film player, drone loop
    main.js                  # bootstrap: lite-mode detect, Lenis init, wire modules
  media/
    frames/                  # optimized card-opening frames (produced by tools/optimize-frames.js)
    gallery/                 # placeholder photos now; real photos later
    video/                   # prenup film + transcoded drone loop
    art/                     # gold botanical corner SVG(s)
  tools/
    optimize-frames.js       # re-encode/resize source frames -> media/frames
    transcode-drone.js       # transcode a chosen DJI clip -> small muted web loop
  test/
    geometry.test.js         # Node unit tests for js/lib/geometry.js
  package.json               # scripts: test, optimize:frames, transcode:drone (no runtime deps)
  docs/superpowers/...       # spec + this plan (already present)
```

**Namespace convention:** every browser JS file is an IIFE that reads/writes `window.W = window.W || {}`. `geometry.js` additionally supports CommonJS so Node tests can `require` it.

---

## Task 1: Project scaffold, design tokens, base shell

**Files:**
- Create: `wedding_website/package.json`
- Create: `wedding_website/.gitignore`
- Create: `wedding_website/css/tokens.css`
- Create: `wedding_website/css/base.css`
- Create: `wedding_website/index.html`

- [ ] **Step 1: Initialize git + package.json**

Run (from `wedding_website/`):
```bash
git init
```

Create `package.json`:
```json
{
  "name": "wedding-website",
  "version": "1.0.0",
  "private": true,
  "description": "Grace & Juriel wedding invitation site",
  "scripts": {
    "test": "node --test",
    "optimize:frames": "node tools/optimize-frames.js",
    "transcode:drone": "node tools/transcode-drone.js"
  }
}
```

Create `.gitignore`:
```
node_modules/
.DS_Store
Thumbs.db
*.log
```

- [ ] **Step 2: Design tokens**

Create `css/tokens.css`:
```css
@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500&display=swap");

:root {
  /* greens */
  --green-900: #14271b;
  --green-800: #1d3527;
  --green-700: #2a4d38;
  --green-600: #3a6149;
  /* gold */
  --gold-deep: #a17f30;
  --gold: #c9a24b;
  --gold-light: #e3c581;
  /* paper */
  --beige: #e9ddc9;
  --cream: #faf4e8;
  --ink: #3a352c;
  --ink-soft: #6f6757;

  --gold-foil: linear-gradient(100deg, var(--gold-deep) 0%, var(--gold-light) 40%, #fff4d6 50%, var(--gold-light) 60%, var(--gold-deep) 100%);

  --serif: "Cormorant Garamond", Georgia, serif;
  --sans: "Jost", system-ui, sans-serif;

  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 1.5rem;
  --space-4: 2.5rem;
  --space-5: 4rem;
  --space-6: 6rem;

  --maxw: 1100px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- [ ] **Step 3: Base styles**

Create `css/base.css`:
```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { scroll-behavior: auto; } /* Lenis handles smoothing */
body {
  background: var(--green-900);
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
img, canvas, video { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: var(--serif); font-weight: 500; margin: 0; line-height: 1.1; }

.eyebrow {
  font-family: var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.42em;
  font-size: 0.72rem;
  color: var(--gold-deep);
  margin: 0 0 var(--space-2);
}
.foil {
  background: var(--gold-foil);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.flourish {
  width: 120px; height: 14px; margin: var(--space-3) auto;
  background:
    radial-gradient(circle at 50% 50%, var(--gold) 0 2px, transparent 3px) center/14px 14px no-repeat,
    linear-gradient(90deg, transparent, var(--gold-deep), transparent) center/100% 1px no-repeat;
}

/* NAV */
.nav {
  position: fixed; inset: 0 0 auto 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  transition: background .4s var(--ease), backdrop-filter .4s var(--ease);
}
.nav.scrolled { background: rgba(20,39,27,.92); backdrop-filter: blur(8px); }
.nav-monogram { font-family: var(--serif); font-size: 1.4rem; color: var(--cream); letter-spacing: .1em; }
.nav-links { display: flex; gap: var(--space-3); align-items: center; }
.nav-links a { font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream); opacity: .85; }
.nav-links a:hover { opacity: 1; color: var(--gold-light); }
.nav-cta {
  border: 1px solid var(--gold); border-radius: 999px;
  padding: .5rem 1.1rem; color: var(--gold-light) !important; opacity: 1 !important;
}

/* LOADER */
.loader {
  position: fixed; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center;
  background: var(--green-900); color: var(--cream); gap: var(--space-2);
  transition: opacity .8s var(--ease), visibility .8s var(--ease);
}
.loader.hidden { opacity: 0; visibility: hidden; }
.loader-seal { font-family: var(--serif); font-style: italic; font-size: 3rem; color: var(--gold-light); }
.loader-text { letter-spacing: .3em; text-transform: uppercase; font-size: .72rem; opacity: .7; }
.loader-pct { font-size: .8rem; color: var(--gold); }

/* SCROLL HINT */
.scroll-hint {
  position: fixed; left: 50%; bottom: 2rem; transform: translateX(-50%); z-index: 30;
  color: var(--cream); text-align: center; transition: opacity .5s var(--ease);
  font-size: .7rem; letter-spacing: .3em; text-transform: uppercase;
}
.scroll-hint-arrow { display: block; margin-top: .4rem; font-size: 1.2rem; animation: bob 1.8s var(--ease) infinite; }
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }

/* LIGHTBOX */
.lightbox {
  position: fixed; inset: 0; z-index: 90; display: none; place-content: center;
  background: rgba(10,18,13,.94); padding: var(--space-4);
}
.lightbox.open { display: grid; }
.lightbox-body { max-width: 90vw; max-height: 85vh; }
.lightbox-body img, .lightbox-body iframe, .lightbox-body video { max-width: 90vw; max-height: 85vh; }
.lightbox-close {
  position: absolute; top: 1.2rem; right: 1.4rem; background: none; border: 0;
  color: var(--cream); font-size: 2rem; cursor: pointer;
}
```

- [ ] **Step 4: HTML shell**

Create `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Grace &amp; Juriel — November 11, 2026</title>
<meta name="description" content="You're invited — join us as we celebrate the wedding of Grace &amp; Juriel." />
<link rel="stylesheet" href="css/tokens.css" />
<link rel="stylesheet" href="css/base.css" />
<link rel="stylesheet" href="css/card.css" />
<link rel="stylesheet" href="css/sections.css" />
</head>
<body>
  <div id="loader" class="loader">
    <div class="loader-seal">&amp;</div>
    <div class="loader-text">preparing your invitation</div>
    <div class="loader-pct" id="loaderPct">0%</div>
  </div>

  <header class="nav" id="nav">
    <a class="nav-monogram" href="#top" data-jump="intro">G&nbsp;&amp;&nbsp;J</a>
    <nav class="nav-links">
      <a href="#gallery" data-jump="gallery">Gallery</a>
      <a href="#film" data-jump="film">Film</a>
      <a href="#rsvp" class="nav-cta" data-jump="rsvp">RSVP</a>
    </nav>
  </header>

  <div class="scroll-hint" id="scrollHint"><span>scroll to open</span><span class="scroll-hint-arrow">⌄</span></div>

  <main id="top">
    <!-- Card scene (Act 1 + Act 2) injected here in Task 5/6 -->
    <section id="cardScroll" class="card-scroll">
      <div class="card-stage" id="cardStage">
        <div class="card-layer" id="cardLayer">
          <canvas id="cardCanvas" class="card-canvas"></canvas>
          <div class="card-doc" id="cardDoc" aria-hidden="true"></div>
        </div>
      </div>
    </section>
    <!-- Sections (Act 3) injected here in Task 7 -->
  </main>

  <div class="lightbox" id="lightbox" aria-hidden="true">
    <button class="lightbox-close" id="lightboxClose" aria-label="Close">×</button>
    <div class="lightbox-body" id="lightboxBody"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
  <script src="js/lib/geometry.js"></script>
  <script src="js/lib/preloader.js"></script>
  <script src="js/cardScene.js"></script>
  <script src="js/sections.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Verify it loads**

Run (from `wedding_website/`):
```bash
python -m http.server 8000
```
Open `http://localhost:8000`. Expected: green background, fonts load (serif monogram "G & J" top-left, uppercase nav links), loader overlay shows "preparing your invitation 0%". No console errors except the not-yet-created JS files (those are created next; if you run this after later tasks there should be zero errors). Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore css/tokens.css css/base.css index.html
git commit -m "feat: scaffold wedding site shell with design tokens and base styles"
```

---

## Task 2: Geometry & camera math (TDD)

This module holds the math that, when wrong, produces the exact prior bugs (frame stepping, mispositioned/floating text). It is pure and fully unit-tested.

**Files:**
- Create: `wedding_website/js/lib/geometry.js`
- Test: `wedding_website/test/geometry.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/geometry.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/lib/geometry.js");

test("clamp bounds values", () => {
  assert.equal(G.clamp(5, 0, 10), 5);
  assert.equal(G.clamp(-3, 0, 10), 0);
  assert.equal(G.clamp(99, 0, 10), 10);
});

test("lerp interpolates", () => {
  assert.equal(G.lerp(0, 10, 0.5), 5);
  assert.equal(G.lerp(10, 20, 0), 10);
  assert.equal(G.lerp(10, 20, 1), 20);
});

test("mapRange maps and clamps", () => {
  assert.equal(G.mapRange(5, 0, 10, 0, 100), 50);
  assert.equal(G.mapRange(-1, 0, 10, 0, 100, true), 0);
  assert.equal(G.mapRange(11, 0, 10, 0, 100, true), 100);
});

test("fitContain letterboxes centered", () => {
  const r = G.fitContain(1280, 720, 640, 720);
  assert.equal(r.scale, 0.5);
  assert.equal(r.w, 640);
  assert.equal(r.h, 360);
  assert.equal(r.x, 0);
  assert.equal(r.y, 180);
});

test("subRect takes fractional sub-rectangle", () => {
  const r = G.subRect({ x: 0, y: 0, w: 100, h: 100 }, 0.2, 0, 0.5, 1);
  assert.deepEqual(r, { x: 20, y: 0, w: 30, h: 100 });
});

test("regionRect slices vertically", () => {
  const r = G.regionRect({ x: 0, y: 0, w: 90, h: 90 }, 1, 3);
  assert.deepEqual(r, { x: 0, y: 30, w: 90, h: 30 });
});

test("frameTo cover frames a rect to fill viewport", () => {
  const t = G.frameTo({ x: 0, y: 0, w: 100, h: 50 }, 200, 100, "cover", 1);
  assert.equal(t.scale, 2);
  assert.equal(t.x, 0);
  assert.equal(t.y, 0);
});

test("frameIndexForProgress maps 0..1 to integer frames", () => {
  assert.equal(G.frameIndexForProgress(0, 193), 0);
  assert.equal(G.frameIndexForProgress(1, 193), 192);
  assert.equal(G.frameIndexForProgress(0.5, 193), 96);
  assert.equal(G.frameIndexForProgress(1.5, 193), 192); // clamped
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `wedding_website/`):
```bash
node --test
```
Expected: FAIL — `Cannot find module '../js/lib/geometry.js'`.

- [ ] **Step 3: Implement the module**

Create `js/lib/geometry.js`:
```js
/* Pure camera/frame geometry. UMD: works as a browser global (window.W.geom)
   and as a CommonJS module (require) for Node tests. No DOM, no side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.W = root.W || {}; root.W.geom = api; }
})(typeof self !== "undefined" ? self : this, function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mapRange(v, inMin, inMax, outMin, outMax, clamped) {
    const t = (v - inMin) / (inMax - inMin);
    const out = outMin + (outMax - outMin) * t;
    return clamped ? clamp(out, Math.min(outMin, outMax), Math.max(outMin, outMax)) : out;
  }

  // contain-fit src into dst, centered. Returns {scale,w,h,x,y}
  function fitContain(sw, sh, dw, dh) {
    const scale = Math.min(dw / sw, dh / sh);
    const w = sw * scale, h = sh * scale;
    return { scale, w, h, x: (dw - w) / 2, y: (dh - h) / 2 };
  }

  // rect of a frame (fw x fh) drawn contain-fit, centered in viewport
  function frameRect(vw, vh, fw, fh) {
    const f = fitContain(fw, fh, vw, vh);
    return { x: f.x, y: f.y, w: f.w, h: f.h };
  }

  // fractional sub-rectangle of a rect
  function subRect(r, fx0, fy0, fx1, fy1) {
    return { x: r.x + fx0 * r.w, y: r.y + fy0 * r.h, w: (fx1 - fx0) * r.w, h: (fy1 - fy0) * r.h };
  }

  // vertical slice `index` of `count` equal regions
  function regionRect(r, index, count) {
    const h = r.h / count;
    return { x: r.x, y: r.y + index * h, w: r.w, h };
  }

  // camera transform (translate then scale, origin 0,0) to frame rect r into viewport.
  // mode "cover" fills, "contain" fits; pad scales the result (e.g. 0.96 to add margin).
  function frameTo(r, vw, vh, mode, pad) {
    pad = pad == null ? 1 : pad;
    const pick = mode === "contain" ? Math.min : Math.max;
    const scale = pick(vw / r.w, vh / r.h) * pad;
    return { x: vw / 2 - scale * (r.x + r.w / 2), y: vh / 2 - scale * (r.y + r.h / 2), scale };
  }

  function frameIndexForProgress(p, count) {
    return clamp(Math.round(p * (count - 1)), 0, count - 1);
  }

  return { clamp, lerp, mapRange, fitContain, frameRect, subRect, regionRect, frameTo, frameIndexForProgress };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --test
```
Expected: PASS — 8 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add js/lib/geometry.js test/geometry.test.js
git commit -m "feat: add tested camera/frame geometry module"
```

---

## Task 3: Frame optimization tooling + import frames

The prior build loaded 193 frames at 1280×720 (~7.7 MB). Re-encode to a smaller display size and lower quality to cut load time. The script is idempotent and resolves `ffmpeg-static` from the existing tools install.

**Files:**
- Create: `wedding_website/tools/optimize-frames.js`
- Produces: `wedding_website/media/frames/frame_0001.webp` … `frame_0193.webp`

- [ ] **Step 1: Write the optimizer**

Create `tools/optimize-frames.js`:
```js
/* Resize + recompress the source card-opening frames into media/frames.
   Uses the ffmpeg-static binary already installed under ..\website_card\.tools.
   Usage: npm run optimize:frames -- [--width 1024] [--quality 72] */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.resolve(ROOT, "..", "website_card", "media", "frames");
const OUT = path.resolve(ROOT, "media", "frames");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const WIDTH = parseInt(arg("width", "1024"), 10);
const QUALITY = parseInt(arg("quality", "72"), 10);

function resolveFfmpeg() {
  const candidates = [
    path.resolve(ROOT, "..", "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.resolve(ROOT, "..", "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "ffmpeg"; // fall back to PATH
}
const FFMPEG = resolveFfmpeg();

if (!fs.existsSync(SRC)) { console.error("Source frames not found:", SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /^frame_\d+\.webp$/i.test(f)).sort();
console.log(`Optimizing ${files.length} frames -> ${OUT} (width=${WIDTH}, q=${QUALITY})`);
let bytes = 0;
for (const f of files) {
  const inP = path.join(SRC, f), outP = path.join(OUT, f);
  execFileSync(FFMPEG, ["-y", "-i", inP, "-vf", `scale=${WIDTH}:-1`, "-quality", String(QUALITY), outP], { stdio: "ignore" });
  bytes += fs.statSync(outP).size;
}
console.log(`Done. Total: ${(bytes / 1e6).toFixed(2)} MB across ${files.length} frames.`);
```

- [ ] **Step 2: Run the optimizer**

Run (from `wedding_website/`):
```bash
npm run optimize:frames
```
Expected: prints "Optimizing 193 frames", then "Done. Total: X MB" where X is meaningfully below 7.7 (target ~2–4 MB). `media/frames/` now holds 193 `.webp` files.

If `ffmpeg-static` is not found at the expected path, run once with PATH ffmpeg or pass a wider width; if no ffmpeg at all is available, fall back: copy the source frames unchanged so the site still works —
```bash
node -e "const fs=require('fs'),p=require('path');const s=p.resolve('..','website_card','media','frames'),o='media/frames';fs.mkdirSync(o,{recursive:true});for(const f of fs.readdirSync(s))fs.copyFileSync(p.join(s,f),p.join(o,f));console.log('copied frames')"
```

- [ ] **Step 3: Verify frame integrity**

Run:
```bash
node -e "const fs=require('fs');const n=fs.readdirSync('media/frames').filter(f=>/frame_\d+\.webp/.test(f)).length;console.log('frames:',n);if(n!==193)process.exit(1)"
```
Expected: `frames: 193`.

- [ ] **Step 4: Commit**

```bash
git add tools/optimize-frames.js media/frames
git commit -m "feat: add frame optimizer and import optimized card frames"
```

---

## Task 4: Frame preloader

Progressive loader: draws frame 1 ASAP, streams the rest, reports percent, never blocks the opening on a full preload.

**Files:**
- Create: `wedding_website/js/lib/preloader.js`

- [ ] **Step 1: Implement the preloader**

Create `js/lib/preloader.js`:
```js
/* Progressive image preloader for the card frames. window.W.Preloader */
(function () {
  "use strict";
  window.W = window.W || {};

  function Preloader(opts) {
    this.count = opts.count;
    this.path = opts.path;              // (i) => url, i is 1-based
    this.onProgress = opts.onProgress || function () {};
    this.onFirst = opts.onFirst || function () {};
    this.onDone = opts.onDone || function () {};
    this.images = new Array(this.count);
    this.loaded = 0;
    this.firstReady = false;
  }

  Preloader.prototype.start = function () {
    const self = this;
    for (let i = 0; i < this.count; i++) {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = function () {
        self.loaded++;
        if (!self.firstReady && self.images[0] && self.images[0].naturalWidth) {
          self.firstReady = true; self.onFirst();
        }
        self.onProgress(self.loaded / self.count);
        if (self.loaded >= self.count) self.onDone();
      };
      img.src = this.path(i + 1);
      this.images[i] = img;
    }
  };

  // nearest decoded frame to idx (handles not-yet-loaded mid-stream)
  Preloader.prototype.frame = function (idx) {
    const imgs = this.images, n = imgs.length;
    const ok = (im) => im && im.complete && im.naturalWidth;
    if (ok(imgs[idx])) return imgs[idx];
    for (let d = 1; d < n; d++) {
      if (ok(imgs[idx - d])) return imgs[idx - d];
      if (ok(imgs[idx + d])) return imgs[idx + d];
    }
    return null;
  };

  window.W.Preloader = Preloader;
})();
```

- [ ] **Step 2: Verify it parses**

Run:
```bash
node -e "global.window={};global.Image=function(){};require('./js/lib/preloader.js');if(!window.W.Preloader)process.exit(1);console.log('Preloader OK')"
```
Expected: `Preloader OK`.

- [ ] **Step 3: Commit**

```bash
git add js/lib/preloader.js
git commit -m "feat: add progressive frame preloader"
```

---

## Task 5: Card scene — Act 1 (smoothed opening)

One sticky scene drives a single `eased` progress value via lerp + rAF. Act 1 maps the first portion of progress to the frame index and draws to canvas. Smoothing + generous scroll length eliminate the stepping.

**Files:**
- Create: `wedding_website/css/card.css`
- Create: `wedding_website/js/cardScene.js`
- Create: `wedding_website/js/main.js` (initial version; extended in later tasks)

- [ ] **Step 1: Card scene CSS**

Create `css/card.css`:
```css
.card-scroll { position: relative; height: 600vh; background: var(--green-900); }
.card-stage {
  position: sticky; top: 0; height: 100vh; width: 100%;
  overflow: hidden; background: var(--green-900);
}
.card-layer {
  position: absolute; inset: 0; transform-origin: 0 0; will-change: transform;
}
.card-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

/* Reading surface (Task 6) — placed over the frame's inner page by JS */
.card-doc {
  position: absolute; left: 0; top: 0; width: 0; height: 0;
  opacity: 0; pointer-events: none;
}
```

- [ ] **Step 2: Card scene controller (Act 1 only)**

Create `js/cardScene.js`:
```js
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
```

- [ ] **Step 3: Bootstrap (initial main.js)**

Create `js/main.js`:
```js
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
})();
```

- [ ] **Step 4: Verify the opening is smooth**

Run (from `wedding_website/`):
```bash
python -m http.server 8000
```
Open `http://localhost:8000`. Verify:
- Loader shows increasing % then hides.
- Scrolling down opens the card cover; it **glides** with no visible frame-stepping at normal speed, and no large jumps on fast scroll.
- In DevTools → Performance/Rendering, enable 4× CPU throttle and confirm it still feels smooth (this is the core fix for the prior choppiness).
- The card stays pinned (sticky) for the full scene; no console errors.

Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add css/card.css js/cardScene.js js/main.js
git commit -m "feat: smoothed card-opening (Act 1) with sticky scene + eased rAF scrub"
```

---

## Task 6: Card scene — Act 2 (reading camera + frosted surface)

Add the zoom-to-page, top→bottom pan, the real CSS frosted reading surface (fixes the "pasted-on" look), and text reveals. All driven by the same eased progress.

**Files:**
- Modify: `wedding_website/css/card.css` (add `.card-doc` surface + content styles)
- Modify: `wedding_website/js/cardScene.js` (add layout, camera, reveals)
- Create: `wedding_website/media/art/corner.svg`

- [ ] **Step 1: Gold botanical corner art**

Create `media/art/corner.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <g stroke="#c9a24b" stroke-width="1.4" stroke-linecap="round" fill="#c9a24b">
    <path d="M8 112 C 40 96, 70 70, 96 30" stroke-width="1.6" fill="none"/>
    <g>
      <ellipse cx="30" cy="92" rx="5" ry="2.4" transform="rotate(-35 30 92)"/>
      <ellipse cx="46" cy="78" rx="5.5" ry="2.6" transform="rotate(-38 46 78)"/>
      <ellipse cx="62" cy="62" rx="6" ry="2.8" transform="rotate(-42 62 62)"/>
      <ellipse cx="78" cy="46" rx="5.5" ry="2.6" transform="rotate(-45 78 46)"/>
      <ellipse cx="92" cy="30" rx="5" ry="2.4" transform="rotate(-48 92 30)"/>
    </g>
  </g>
</svg>
```

- [ ] **Step 2: Reading surface + content CSS**

Add to `css/card.css`:
```css
.card-doc {
  border-radius: 4px;
  background:
    linear-gradient(160deg, rgba(228,236,226,.86), rgba(196,210,198,.82) 60%, rgba(208,220,206,.86));
  box-shadow: inset 0 0 0 1px rgba(201,162,75,.55), inset 0 0 60px rgba(255,255,255,.25);
  backdrop-filter: blur(2px);
  overflow: hidden;
}
.card-doc::before, .card-doc::after {
  content: ""; position: absolute; width: 26%; aspect-ratio: 1;
  background: url("../media/art/corner.svg") center/contain no-repeat; opacity: .9;
}
.card-doc::before { top: 2%; right: 2%; transform: scaleX(-1); }
.card-doc::after  { bottom: 2%; left: 2%; }

.doc-inner { position: absolute; inset: 0; padding: 7% 9%; display: flex; flex-direction: column; }
.doc-block { opacity: 0; transform: translateY(14px); transition: opacity .7s var(--ease), transform .7s var(--ease); }
.doc-block.show { opacity: 1; transform: none; }

.doc-names { text-align: center; margin: auto 0; }
.doc-eyebrow { font-family: var(--sans); text-transform: uppercase; letter-spacing: .4em; font-size: .55em; color: var(--gold-deep); }
.doc-couple { font-family: var(--serif); font-size: 3.4em; line-height: 1; color: var(--green-800); margin: .2em 0; }
.doc-couple .amp { font-style: italic; display: inline-block; margin: 0 .15em; }
.doc-date { font-family: var(--serif); font-size: 1.1em; letter-spacing: .12em; color: var(--green-700); }

.doc-section { margin: 6% 0; }
.doc-section h2 { font-size: 2em; color: var(--green-800); margin-bottom: .3em; }
.doc-section p { font-family: var(--serif); font-size: 1.1em; line-height: 1.5; color: var(--ink); }
.doc-facts { margin-top: .8em; display: grid; gap: .5em; }
.doc-facts .k { font-family: var(--sans); text-transform: uppercase; letter-spacing: .25em; font-size: .55em; color: var(--gold-deep); }
.doc-facts .v { font-family: var(--serif); font-size: 1.05em; color: var(--green-800); }
```

Note: `.card-doc` font-size is set in px by JS (`layout()`), so all `em` sizes above scale with the card.

- [ ] **Step 3: Inject reading content + add camera/reveal logic**

In `js/cardScene.js`, add the acrylic-page fractions and content near the top constants (after `framePath`):
```js
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
```

Replace the constructor body's end and add a `layout` method + reading phase. Update `init` to inject content, and replace `render`:
```js
  // --- add inside CardScene constructor, after existing lines ---
  // this.doc already exists in HTML as #cardDoc
  this.doc = document.getElementById("cardDoc");
```
Add methods (before `window.W.CardScene = CardScene;`):
```js
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
```
Replace the existing `render` with the full phased version:
```js
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
```
Update `init` to inject the doc HTML once (add near the start of `init`, after `const self = this;`):
```js
    this.doc.innerHTML = DOC_HTML;
```

- [ ] **Step 4: Verify the reading experience**

Run `python -m http.server 8000`, open the site. Verify:
- After the card opens, the camera zooms to the whole inner page; the names "Grace **&** Juriel" + date fade in **on a frosted surface that matches the card** (gold corners, sage frosted glass) — text looks printed in, not floated.
- Continuing to scroll **pans top→bottom** through Our Story → When & Where → Dress code, each fading in as it enters, all sharp.
- Near the end the camera eases back to show the whole open card.
- Resize the window mid-scene: the surface and text re-fit to the card with no drift. No console errors.

- [ ] **Step 5: Commit**

```bash
git add css/card.css js/cardScene.js media/art/corner.svg
git commit -m "feat: reading camera (Act 2) with matching frosted CSS surface and reveals"
```

---

## Task 7: Act 3 — sections (gallery, film, entourage, RSVP, footer)

Below the card scene, normal-flow sections with scroll-reveal, lightbox, click-to-play film, and an embedded RSVP form. Uses elegant dummy content/images.

**Files:**
- Modify: `wedding_website/index.html` (add sections after `#cardScroll`)
- Create: `wedding_website/css/sections.css`
- Create: `wedding_website/js/sections.js`
- Create: `wedding_website/media/gallery/README.txt` (placeholder note)

- [ ] **Step 1: Section markup**

In `index.html`, insert immediately after the closing `</section>` of `#cardScroll` (before the Act-3 comment / `</main>`):
```html
    <section id="gallery" class="section section-gallery reveal">
      <p class="eyebrow">moments</p>
      <h2 class="section-title">Our Gallery</h2>
      <div class="flourish"></div>
      <div class="gallery-grid" id="galleryGrid"></div>
    </section>

    <section id="film" class="section section-film reveal">
      <p class="eyebrow">our prenup</p>
      <h2 class="section-title">The Film</h2>
      <div class="flourish"></div>
      <button class="film-poster" id="filmPlay" aria-label="Play prenup film">
        <span class="film-play">▶</span>
      </button>
    </section>

    <section id="entourage" class="section section-entourage reveal">
      <p class="eyebrow">with us</p>
      <h2 class="section-title">Entourage &amp; Sponsors</h2>
      <div class="flourish"></div>
      <div class="entourage-cols">
        <div><h3>Principal Sponsors</h3><p>Mr. &amp; Mrs. Reyes · Mr. &amp; Mrs. Santos · Mr. &amp; Mrs. Cruz</p></div>
        <div><h3>Best Man &amp; Maid of Honor</h3><p>Daniel Lim · Sofia Marquez</p></div>
        <div><h3>Groomsmen &amp; Bridesmaids</h3><p>Names · Names · Names · Names</p></div>
      </div>
    </section>

    <section id="rsvp" class="section section-rsvp reveal">
      <p class="eyebrow">kindly respond</p>
      <h2 class="section-title">RSVP</h2>
      <div class="flourish"></div>
      <p class="rsvp-note">We would be honored by your presence. Please respond by October 1, 2026.</p>
      <div class="rsvp-embed" id="rsvpEmbed">
        <!-- Replace with the couple's chosen form embed (Formspree / Google Form iframe). Demo below. -->
        <form class="rsvp-form" onsubmit="return false">
          <label>Full name <input type="text" name="name" placeholder="Your name" /></label>
          <label>Will you attend?
            <select name="attending"><option>Joyfully accepts</option><option>Regretfully declines</option></select>
          </label>
          <label>Number of guests <input type="number" name="guests" min="0" value="1" /></label>
          <label>A note for the couple <textarea name="note" rows="3"></textarea></label>
          <button class="btn-gold" type="submit">Send RSVP</button>
        </form>
      </div>
    </section>

    <footer class="footer" id="footer">
      <video class="footer-video" id="footerVideo" muted loop playsinline preload="none" poster="media/video/drone-poster.jpg"></video>
      <div class="footer-overlay">
        <p class="footer-names foil">Grace &amp; Juriel</p>
        <p class="footer-date">November 11, 2026</p>
      </div>
    </footer>
```

- [ ] **Step 2: Sections CSS**

Create `css/sections.css`:
```css
.section { max-width: var(--maxw); margin: 0 auto; padding: var(--space-6) var(--space-4); text-align: center; color: var(--cream); }
.section-title { font-size: clamp(2rem, 5vw, 3.2rem); color: var(--cream); }
.section .eyebrow { color: var(--gold-light); }
.reveal { opacity: 0; transform: translateY(24px); transition: opacity .8s var(--ease), transform .8s var(--ease); }
.reveal.in { opacity: 1; transform: none; }

.gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin-top: var(--space-4); }
.gallery-item { position: relative; aspect-ratio: 4/5; overflow: hidden; border-radius: 3px; cursor: pointer; background: var(--green-700); }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform .6s var(--ease); }
.gallery-item:hover img { transform: scale(1.05); }

.film-poster {
  position: relative; width: min(880px, 92%); aspect-ratio: 16/9; margin: var(--space-4) auto 0;
  border: 1px solid var(--gold); border-radius: 4px; cursor: pointer;
  background: linear-gradient(135deg, var(--green-700), var(--green-900)); color: var(--gold-light);
  display: grid; place-content: center;
}
.film-play { font-size: 2rem; width: 4rem; height: 4rem; border: 1px solid var(--gold); border-radius: 999px; display: grid; place-content: center; }

.entourage-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); margin-top: var(--space-4); }
.entourage-cols h3 { color: var(--gold-light); font-size: 1.2rem; margin-bottom: .4em; }
.entourage-cols p { font-family: var(--serif); color: var(--cream); line-height: 1.6; }

.rsvp-note { font-family: var(--serif); font-size: 1.2rem; color: var(--cream); max-width: 540px; margin: 0 auto var(--space-4); }
.rsvp-form { display: grid; gap: var(--space-2); max-width: 460px; margin: 0 auto; text-align: left; }
.rsvp-form label { display: grid; gap: .3em; font-size: .8rem; letter-spacing: .15em; text-transform: uppercase; color: var(--gold-light); }
.rsvp-form input, .rsvp-form select, .rsvp-form textarea {
  font-family: var(--sans); font-size: 1rem; padding: .7em .8em; border: 1px solid var(--green-600);
  background: rgba(255,255,255,.06); color: var(--cream); border-radius: 3px;
}
.btn-gold {
  margin-top: var(--space-1); justify-self: start; cursor: pointer;
  padding: .8em 1.8em; border: 0; border-radius: 999px; color: var(--green-900);
  font-family: var(--sans); letter-spacing: .15em; text-transform: uppercase; font-size: .8rem;
  background: var(--gold-foil);
}

.footer { position: relative; height: 70vh; display: grid; place-content: center; text-align: center; overflow: hidden; }
.footer-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.footer::after { content: ""; position: absolute; inset: 0; background: rgba(10,18,13,.55); }
.footer-overlay { position: relative; z-index: 1; color: var(--cream); }
.footer-names { font-family: var(--serif); font-size: clamp(2rem,6vw,3.6rem); }
.footer-date { letter-spacing: .3em; text-transform: uppercase; font-size: .8rem; opacity: .85; }

@media (max-width: 720px) {
  .gallery-grid, .entourage-cols { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .gallery-grid, .entourage-cols { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Sections JS (reveal, gallery, lightbox, film, nav)**

Create `js/sections.js`:
```js
/* Act 3: scroll-reveal, gallery + lightbox, film player, nav state, jump links. */
(function () {
  "use strict";
  window.W = window.W || {};

  function initSections() {
    // dummy gallery (swap data-src + add real files to media/gallery/ later)
    const grid = document.getElementById("galleryGrid");
    if (grid) {
      const shots = ["01","02","03","04","05","06"];
      grid.innerHTML = shots.map((n) =>
        '<button class="gallery-item" data-full="media/gallery/photo-' + n + '.jpg">' +
        '<img loading="lazy" src="media/gallery/photo-' + n + '.jpg" ' +
        'onerror="this.style.opacity=.25" alt="Grace and Juriel, photo ' + n + '"></button>'
      ).join("");
    }

    // scroll reveal
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    // lightbox
    const box = document.getElementById("lightbox");
    const body = document.getElementById("lightboxBody");
    const openBox = (html) => { body.innerHTML = html; box.classList.add("open"); box.setAttribute("aria-hidden", "false"); };
    const shut = () => { box.classList.remove("open"); body.innerHTML = ""; box.setAttribute("aria-hidden", "true"); };
    document.getElementById("lightboxClose").addEventListener("click", shut);
    box.addEventListener("click", (e) => { if (e.target === box) shut(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") shut(); });

    if (grid) grid.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery-item"); if (!item) return;
      openBox('<img src="' + item.getAttribute("data-full") + '" alt="">');
    });

    const film = document.getElementById("filmPlay");
    if (film) film.addEventListener("click", () =>
      // Replace src with the couple's real film (file or YouTube/Vimeo embed).
      openBox('<video src="media/video/prenup.mp4" controls autoplay playsinline style="max-width:90vw;max-height:85vh"></video>')
    );

    // footer drone video: play only when visible (perf)
    const fv = document.getElementById("footerVideo");
    if (fv) {
      const vio = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { if (!fv.src) fv.src = "media/video/drone-loop.mp4"; fv.play().catch(() => {}); }
        else fv.pause();
      }), { threshold: 0.25 });
      vio.observe(document.getElementById("footer"));
    }

    // nav state + jump links
    const nav = document.getElementById("nav");
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-jump");
      const map = { intro: "#top", gallery: "#gallery", film: "#film", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
```

Create `media/gallery/README.txt`:
```
Drop the couple's real photos here named photo-01.jpg ... photo-06.jpg
(4:5 portrait crops look best). Missing files dim gracefully via the onerror handler.
```

- [ ] **Step 4: Call initSections from main.js**

In `js/main.js`, add before the final `})();` (after `scene.init();`):
```js
  if (window.W.initSections) window.W.initSections();
```

- [ ] **Step 5: Verify sections**

Run `python -m http.server 8000`. Scroll past the card scene and verify:
- Sections fade/slide in on scroll.
- Gallery shows a grid (placeholder tiles dim since no photos yet); clicking a tile opens the lightbox; Esc / click-outside closes it.
- Film poster opens a video lightbox (will show a broken/empty player until a real `media/video/prenup.mp4` exists — acceptable for now).
- Nav turns to dark glass after scrolling; nav links jump to sections; "RSVP" CTA scrolls to the form.
- RSVP form renders and is styled. No console errors (a 404 for missing media is expected until assets are added).

- [ ] **Step 6: Commit**

```bash
git add index.html css/sections.css js/sections.js js/main.js media/gallery/README.txt
git commit -m "feat: add gallery, film, entourage, RSVP and drone footer sections (Act 3)"
```

---

## Task 8: Drone footage transcode + placeholder media

Transcode one DJI clip to a small, muted, web-optimized loop and generate a poster. Add tasteful placeholder gallery images and a stand-in film so the page is complete with dummy data.

**Files:**
- Create: `wedding_website/tools/transcode-drone.js`
- Produces: `wedding_website/media/video/drone-loop.mp4`, `media/video/drone-poster.jpg`
- Produces (placeholders): `media/gallery/photo-01.jpg` … `06`, `media/video/prenup.mp4`

- [ ] **Step 1: Write the transcoder**

Create `tools/transcode-drone.js`:
```js
/* Transcode a chosen DJI drone clip to a small muted web loop + poster.
   Usage: npm run transcode:drone -- "..\\DJI_20251122093515_0029_D.MP4" [--seconds 12]
   Defaults to the smallest of the three known DJI clips in the parent folder. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PARENT = path.resolve(ROOT, "..");
const OUT = path.resolve(ROOT, "media", "video");
fs.mkdirSync(OUT, { recursive: true });

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const SECONDS = arg("seconds", "12");
const input = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(PARENT, "DJI_20251122093515_0029_D.MP4"); // smallest clip (~160 MB)

function ffmpeg() {
  const c = [
    path.resolve(PARENT, "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.resolve(PARENT, "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg"),
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  return "ffmpeg";
}
const FF = ffmpeg();
if (!fs.existsSync(input)) { console.error("Input not found:", input); process.exit(1); }

const loop = path.join(OUT, "drone-loop.mp4");
const poster = path.join(OUT, "drone-poster.jpg");
console.log("Transcoding", input, "->", loop);
execFileSync(FF, ["-y", "-t", SECONDS, "-i", input,
  "-vf", "scale=1280:-2,fps=30", "-an",
  "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-movflags", "+faststart", loop], { stdio: "inherit" });
execFileSync(FF, ["-y", "-i", loop, "-frames:v", "1", "-q:v", "4", poster], { stdio: "inherit" });
console.log("Done:", (fs.statSync(loop).size / 1e6).toFixed(2), "MB loop +", poster);
```

- [ ] **Step 2: Run the transcoder**

Run (from `wedding_website/`):
```bash
npm run transcode:drone
```
Expected: produces `media/video/drone-loop.mp4` (target < ~8 MB) and `media/video/drone-poster.jpg`. If ffmpeg is unavailable, skip — the footer falls back to its dark gradient via CSS (poster simply 404s, which is harmless).

- [ ] **Step 3: Generate placeholder gallery + film (dummy data)**

Run (from `wedding_website/`) to create on-palette placeholder images and a short stand-in film from the existing card video:
```bash
node -e "const{execFileSync}=require('child_process'),fs=require('fs'),path=require('path');const PARENT=path.resolve('..');function ff(){const c=[path.resolve(PARENT,'website_card','.tools','node_modules','ffmpeg-static','ffmpeg.exe'),path.resolve(PARENT,'website_card','.tools','node_modules','ffmpeg-static','ffmpeg')];for(const p of c)if(fs.existsSync(p))return p;return 'ffmpeg'}const FF=ff();fs.mkdirSync('media/gallery',{recursive:true});fs.mkdirSync('media/video',{recursive:true});for(let i=1;i<=6;i++){const n=String(i).padStart(2,'0');execFileSync(FF,['-y','-f','lavfi','-i','color=c=0x2a4d38:s=800x1000','-vf','drawtext=text=Photo '+n+':fontcolor=0xc9a24b:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2','-frames:v','1','media/gallery/photo-'+n+'.jpg'],{stdio:'ignore'})}const raw=path.resolve(PARENT,'website_card','media','..','..','invt_card_raw.mp4');const src=fs.existsSync(raw)?raw:path.resolve(PARENT,'invt_card_raw.mp4');if(fs.existsSync(src))execFileSync(FF,['-y','-t','8','-i',src,'-vf','scale=1280:-2','-c:v','libx264','-crf','28','-an','-movflags','+faststart','media/video/prenup.mp4'],{stdio:'ignore'});console.log('placeholders created')"
```
Expected: `media/gallery/photo-01.jpg … photo-06.jpg` (green tiles labeled "Photo NN") and `media/video/prenup.mp4` if a source video was found. Prints `placeholders created`.

- [ ] **Step 4: Verify media**

Run `python -m http.server 8000`. Verify: gallery now shows green placeholder tiles; clicking opens them in the lightbox; the film poster opens a playable stand-in video; the footer plays the muted drone loop (or shows the dark gradient if transcode was skipped). No console errors beyond optional 404s for any skipped media.

- [ ] **Step 5: Commit**

```bash
git add tools/transcode-drone.js media/video media/gallery
git commit -m "feat: drone footer transcode + placeholder gallery/film media"
```

---

## Task 9: Reduced-motion / lite fallback + responsive

Ensure the experience is readable without the scrub animation (accessibility) and works on mobile.

**Files:**
- Modify: `wedding_website/js/main.js`
- Modify: `wedding_website/js/cardScene.js`
- Modify: `wedding_website/css/card.css`

- [ ] **Step 1: Lite-mode CSS**

Add to `css/card.css`:
```css
body.lite .card-scroll { height: auto; }
body.lite .card-stage { position: relative; height: auto; min-height: 100vh; padding: 8vh 0; }
body.lite .card-layer { position: relative; transform: none !important; }
body.lite .card-canvas { position: relative; height: 60vh; }
body.lite .card-doc {
  position: relative !important; left: auto !important; top: auto !important;
  width: min(640px, 92%) !important; height: auto !important; margin: 6vh auto 0;
  opacity: 1 !important; font-size: 18px !important; aspect-ratio: 3/4;
}
body.lite .doc-block { opacity: 1 !important; transform: none !important; }
```

- [ ] **Step 2: Add a lite path**

In `js/cardScene.js`, add a method to render a static open card (before `window.W.CardScene = CardScene;`):
```js
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
```

- [ ] **Step 3: Branch in main.js**

Replace `js/main.js` body with:
```js
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
```
(`noGSAP` is reserved for future use; the scene does not require GSAP, so reduced-motion is the only lite trigger.)

- [ ] **Step 4: Verify fallback + responsive**

- In DevTools, emulate `prefers-reduced-motion: reduce` (Rendering tab) and reload: the card shows fully open, the invitation text is stacked and fully readable (no scrub), sections still reveal. 
- Toggle device toolbar → iPhone (portrait) and a narrow width: the card scene still opens and reads; gallery/entourage collapse to fewer columns; nothing overflows horizontally. Test landscape too.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add js/main.js js/cardScene.js css/card.css
git commit -m "feat: reduced-motion lite fallback and responsive layout"
```

---

## Task 10: Performance pass + final polish

**Files:**
- Modify: `wedding_website/index.html`
- Modify: as needed from findings

- [ ] **Step 1: Preconnect + preload first frame**

In `index.html` `<head>`, add after the stylesheet links:
```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="image" href="media/frames/frame_0001.webp" />
```

- [ ] **Step 2: Re-run unit tests**

Run (from `wedding_website/`):
```bash
node --test
```
Expected: all geometry tests still PASS.

- [ ] **Step 3: Measure load + smoothness**

Run `python -m http.server 8000`, open DevTools → Network (disable cache), reload:
- Confirm the opening starts before all frames finish (loader hides on done, but first frame paints early).
- Note total transferred bytes; the optimized frames should dominate but be well under the prior ~7.7 MB.
- Performance tab: record a scroll-through; confirm a steady frame rate with no long red tasks during the opening. Throttle CPU 4× and re-check.

- [ ] **Step 4: Cross-check against the spec verification list**

Walk the spec's Verification section item by item (smoothness, reading experience, no pasted-on feel, load time, sections, fallback, responsive) and confirm each. Fix any gaps found, committing each fix separately.

- [ ] **Step 5: Final commit**

```bash
git add index.html
git commit -m "perf: preconnect/preload tuning and final polish"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** Act 1 optimized frames → Tasks 3,4,5. Act 2 reading camera + matching frosted surface → Task 6. Act 3 sections (gallery/film/entourage/RSVP/footer-drone) → Tasks 7,8. Design system → Task 1. Drone transcode → Task 8. Reduced-motion + responsive → Task 9. Performance → Task 10. Dummy content throughout → Tasks 6,7,8. RSVP embedded form → Task 7. ✓
- **Placeholder scan:** No "TODO/TBD"; every code step contains complete code. Comments mark where the couple swaps real assets in later (gallery filenames, film src, RSVP embed) — these are working defaults, not gaps. ✓
- **Type consistency:** `window.W.geom` API names (clamp, lerp, mapRange, fitContain, frameRect, subRect, regionRect, frameTo, frameIndexForProgress) are used identically in `cardScene.js`. `window.W.Preloader`, `window.W.CardScene`, `window.W.initSections`, `window.__lenis` consistent across files. Element IDs (`cardCanvas`, `cardLayer`, `cardStage`, `cardScroll`, `cardDoc`, `loader`, `loaderPct`, `scrollHint`, `lightbox`, `lightboxBody`, `galleryGrid`, `filmPlay`, `footerVideo`, `footer`) consistent between HTML and JS. ✓
```
