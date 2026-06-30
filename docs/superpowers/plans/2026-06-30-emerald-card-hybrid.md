# Emerald Card Intro (Hybrid Extraction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the invitation card sit cleanly on deep emerald (no pink tabletop, no letterbox seam) by toning the opening animation toward emerald and crossfading to a pristine AI-extracted still of the open card for the resting/reading state.

**Architecture:** Keep the real frames for the smooth opening scrub (per-frame AI matting flickers, so it's not used for motion). Extract ONE clean still (frame 193) onto transparency via AI segmentation, mask its stray artifact, and ship it as `media/card/open-card.webp`. The card scene draws frames during the opening, then crossfades the canvas → the extracted still (and fades out an emerald vignette) once the card is open; the details fade onto the still's frosted page using the existing `acRect` geometry.

**Tech Stack:** Vanilla HTML/CSS/JS (no build); `@imgly/background-removal-node` (dev-only, already installed `--no-save`) + `ffmpeg` (on PATH) for the one-time extraction tool; existing GSAP/Lenis CDN; Node `node --test` for the unchanged geometry tests.

---

## File Structure

- `tools/extract-card.js` — **new**: one-time Node tool that produces the extracted still.
- `media/card/open-card.webp` — **new**: shipped artifact (open card, transparent background).
- `index.html` — **modify**: add `#cardStill` `<img>` + `.card-vignette` inside `#cardLayer`; preload the still.
- `css/card.css` — **modify**: emerald background, `.card-still` + `.card-vignette` styles, lite-mode tweaks.
- `js/cardScene.js` — **modify**: crossfade canvas→still + vignette fade in `render()`; lite uses the still (no preloader).

---

## Task 0: Checkpoint-commit the pending intro refinements

The working tree has today's un-committed tweaks (full-screen fit, fitted details, no-nav/no-scrollbar intro, drone backdrop section + parallax/snap). Commit them first so the hybrid work lands in clean, separate commits.

**Files:** all currently-modified tracked files.

- [ ] **Step 1: Review what's pending**

Run (from `wedding_website/`):
```bash
git status --short
```
Expected: modified `css/base.css`, `css/card.css`, `css/sections.css`, `index.html`, `js/cardScene.js`, `js/sections.js` (untracked `docs/`, `.claude/`, `frames/` are expected and handled later).

- [ ] **Step 2: Commit the refinements**

```bash
git add css/base.css css/card.css css/sections.css index.html js/cardScene.js js/sections.js \
        tools/shoot.js package.json .gitignore
git commit -m "refine: card intro polish, drone backdrop, + screenshot/extraction tooling"
```
(This also commits the new screenshot harness `tools/shoot.js`, the `devDependencies`
in `package.json`, and the `.gitignore` additions for `shots/` and `.claude/`.)
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 3: Verify clean tree**

Run: `git status --short | grep -v '^??'` → Expected: no output (no tracked changes remain).

---

## Task 1: Card extraction tool + `open-card.webp` asset

**Files:**
- Create: `tools/extract-card.js`
- Produces: `media/card/open-card.webp`

- [ ] **Step 1: Write the extraction tool**

Create `tools/extract-card.js`:
```js
/* Extract the open invitation card from a frame onto transparency (AI segmentation),
   mask off the stray top-right artifact, and save as a WebP with alpha.
   One-time tool. Usage:
     node tools/extract-card.js [--frame 0193] [--out media/card/open-card.webp] [--cropw 0.75]
   Requires: @imgly/background-removal-node (dev dep, installed with `npm i --no-save`)
   and ffmpeg on PATH. */
const { removeBackground } = require("@imgly/background-removal-node");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const FRAME = arg("frame", "0193");
const OUT = path.resolve(arg("out", "media/card/open-card.webp"));
const CROPW = parseFloat(arg("cropw", "0.75")); // keep this fraction of width from the left (drops the top-right smudge)
const FW = 1280, FH = 720;

const SRC = path.resolve("media/frames", `frame_${FRAME}.webp`);
if (!fs.existsSync(SRC)) { console.error("Frame not found:", SRC); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardx-"));
const pngIn = path.join(tmp, "in.png"), pngCut = path.join(tmp, "cut.png");

(async () => {
  // 1. webp -> png (reliable decode for the segmenter)
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", SRC, pngIn], { stdio: "inherit" });
  // 2. AI background removal -> transparent png
  const blob = await removeBackground(new Blob([fs.readFileSync(pngIn)], { type: "image/png" }));
  fs.writeFileSync(pngCut, Buffer.from(await blob.arrayBuffer()));
  // 3. mask the stray top-right artifact: keep left CROPW, pad back to full size (transparent), encode webp+alpha
  const keep = Math.round(FW * CROPW);
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", pngCut,
    "-vf", `crop=${keep}:${FH}:0:0,format=rgba,pad=${FW}:${FH}:0:0:color=black@0.0`,
    "-c:v", "libwebp", "-lossless", "0", "-quality", "92", OUT], { stdio: "inherit" });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("Wrote", OUT, (fs.statSync(OUT).size / 1e3).toFixed(0), "KB");
})().catch((e) => { console.error("ERR", e && e.message ? e.message : e); process.exit(1); });
```

- [ ] **Step 2: Ensure the dev dependency is present**

The segmenter was installed earlier with `npm i --no-save`. If `node_modules/@imgly/background-removal-node` is missing (fresh checkout), install it (no-save keeps it out of package.json):
```bash
node -e "require.resolve('@imgly/background-removal-node')" 2>/dev/null || npm install --no-save @imgly/background-removal-node
```

- [ ] **Step 3: Run the extraction**

Run (from `wedding_website/`):
```bash
node tools/extract-card.js
```
Expected: prints `Wrote ...media/card/open-card.webp <NN> KB`. First run may download the segmentation model (needs internet).

- [ ] **Step 4: Verify the asset programmatically**

Run:
```bash
node -e "const fs=require('fs');const p='media/card/open-card.webp';if(!fs.existsSync(p)||fs.statSync(p).size<5000){console.error('bad asset');process.exit(1)}console.log('ok',(fs.statSync(p).size/1e3).toFixed(0),'KB')"
ffprobe -v error -show_entries stream=width,height,pix_fmt -of csv=p=0 media/card/open-card.webp
```
Expected: `ok <NN> KB`, then `1280,720,...` (pix_fmt should include alpha, e.g. `yuva420p`/`bgra`).

- [ ] **Step 5: VISUAL CHECK — Read the asset**

Any agent can view images with the `Read` tool. `Read` `media/card/open-card.webp` and confirm: the open card (green cover + frosted page + gold botanicals) is cleanly cut out, the frosted page is intact, and the background (incl. the former top-right smudge) is fully transparent. If the smudge remains, re-run with a smaller `--cropw` (e.g. `0.72`); if edges are poor, stop and reconsider (fall back to the emerald-grade approach from the spec's "Out of scope" note).

- [ ] **Step 6: Commit**

```bash
git add tools/extract-card.js media/card/open-card.webp
git commit -m "feat: add card extraction tool and clean open-card still"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: HTML + CSS — emerald background, vignette, still element

**Files:**
- Modify: `index.html` (inside `#cardLayer`; preload in `<head>`)
- Modify: `css/card.css`

- [ ] **Step 1: Add the still + vignette to the card layer**

In `index.html`, replace this block:
```html
        <div class="card-layer" id="cardLayer">
          <canvas id="cardCanvas" class="card-canvas"></canvas>
          <div class="card-doc" id="cardDoc" aria-hidden="true"></div>
        </div>
```
with:
```html
        <div class="card-layer" id="cardLayer">
          <canvas id="cardCanvas" class="card-canvas"></canvas>
          <img id="cardStill" class="card-still" src="media/card/open-card.webp" alt="" aria-hidden="true" />
          <div class="card-vignette" aria-hidden="true"></div>
          <div class="card-doc" id="cardDoc" aria-hidden="true"></div>
        </div>
```

- [ ] **Step 2: Preload the still**

In `index.html` `<head>`, add after the existing `<link rel="preload" as="image" href="media/frames/frame_0001.webp" />` line:
```html
<link rel="preload" as="image" href="media/card/open-card.webp" />
```

- [ ] **Step 3: Emerald background**

In `css/card.css`, replace:
```css
.card-scroll { position: relative; height: 400vh; background: #e6d8c2; }
.card-stage {
  position: sticky; top: 0; height: 100vh; width: 100%;
  overflow: hidden; background: #e6d8c2; /* beige tabletop — blends with the card art */
}
```
with:
```css
.card-scroll { position: relative; height: 400vh; background: var(--green-900); }
.card-stage {
  position: sticky; top: 0; height: 100vh; width: 100%;
  overflow: hidden; background: radial-gradient(ellipse at center, var(--green-800), var(--green-900));
}
```

- [ ] **Step 4: Still + vignette styles**

In `css/card.css`, immediately AFTER the `.card-canvas { ... }` line, add:
```css
.card-still { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; pointer-events: none; }
.card-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 42%, var(--green-900) 100%); }
```

- [ ] **Step 5: Lite-mode tweaks (use the still, not the canvas)**

In `css/card.css`, replace the lite block:
```css
body.lite .card-canvas { position: relative; height: 55vh; }
body.lite .card-doc { position: relative; inset: auto; width: min(620px, 92%); height: auto; margin: 4vh auto 0; font-size: 18px; opacity: 1 !important; }
```
with:
```css
body.lite .card-canvas { display: none; }
body.lite .card-vignette { display: none; }
body.lite .card-still { position: relative; inset: auto; display: block; width: min(680px, 92%); height: auto; opacity: 1 !important; margin: 0 auto; }
body.lite .card-doc { position: relative; inset: auto; width: min(620px, 92%); height: auto; margin: 4vh auto 0; font-size: 18px; opacity: 1 !important; }
```

- [ ] **Step 6: Verify**

Run:
```bash
node -e "const h=require('fs').readFileSync('index.html','utf8');['id=\"cardStill\"','card-vignette','open-card.webp'].forEach(s=>{if(!h.includes(s)){console.error('missing',s);process.exit(1)}});console.log('html ok')"
node -e "const c=require('fs').readFileSync('css/card.css','utf8');['.card-still','.card-vignette','radial-gradient(ellipse at center, var(--green-800)'].forEach(s=>{if(!c.includes(s)){console.error('missing',s);process.exit(1)}});console.log('css ok')"
```
Expected: `html ok`, `css ok`.

- [ ] **Step 7: Commit**

```bash
git add index.html css/card.css
git commit -m "feat: emerald card background, vignette and extracted-still element"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 3: `cardScene.js` — crossfade to the still + lite uses still

**Files:**
- Modify: `js/cardScene.js`

- [ ] **Step 1: Grab the still + vignette in the constructor**

In `js/cardScene.js`, in the `CardScene` constructor, replace:
```js
    this.doc = document.getElementById("cardDoc");
  }
```
with:
```js
    this.doc = document.getElementById("cardDoc");
    this.still = document.getElementById("cardStill");
    this.vignette = document.querySelector(".card-vignette");
  }
```

- [ ] **Step 2: Crossfade in `render()`**

In `js/cardScene.js`, replace the entire `render` method:
```js
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
```
with:
```js
  CardScene.prototype.render = function () {
    const p = this.eased;
    this.layout();

    // crossfade the live frames -> the clean extracted still as the card finishes opening
    const x = G.mapRange(p, P_OPEN, P_OPEN + 0.06, 0, 1, true);
    this.canvas.style.opacity = String(1 - x);
    if (this.still) this.still.style.opacity = String(x);
    if (this.vignette) this.vignette.style.opacity = String(1 - x);

    if (p < P_OPEN) {                          // OPEN: scrub frames open the card
      this.draw(G.frameIndexForProgress(p / P_OPEN, FRAME_COUNT));
      this.doc.style.opacity = "0";
      this.reveals(-1);
    } else {                                   // DETAILS: card open, fade details onto the page
      this.draw(FRAME_COUNT - 1);
      this.doc.style.opacity = "1";
      this.reveals(G.mapRange(p, P_OPEN, 1, 0, 1, true));
    }
    const hint = document.getElementById("scrollHint");
    if (hint) hint.style.opacity = p > 0.02 ? "0" : "1";
  };
```

- [ ] **Step 3: Lite uses the still (no preloader, no frames)**

In `js/cardScene.js`, replace the entire `initLite` method:
```js
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
```
with:
```js
  // reduced-motion: show the clean extracted still + details on emerald, no scrub/frames
  CardScene.prototype.initLite = function () {
    const self = this;
    document.body.classList.add("lite");
    this.doc.innerHTML = DOC_HTML;
    this.doc.querySelectorAll(".doc-block").forEach((b) => b.classList.add("show"));
    if (this.still) this.still.style.opacity = "1";
    if (this.canvas) this.canvas.style.opacity = "0";
    if (this.vignette) this.vignette.style.opacity = "0";
    this.doc.style.opacity = "1";
    if (this.still && this.still.complete) self.hideLoader();
    else if (this.still) this.still.addEventListener("load", () => self.hideLoader());
    setTimeout(() => self.hideLoader(), 6000);
  };
```

- [ ] **Step 4: Verify syntax + edits**

Run:
```bash
node --check js/cardScene.js && echo "cardScene OK"
node -e "const s=require('fs').readFileSync('js/cardScene.js','utf8');['this.still = document.getElementById','this.vignette = document.querySelector','this.canvas.style.opacity = String(1 - x)','this.still.style.opacity = String(x)'].forEach(k=>{if(!s.includes(k)){console.error('missing',k);process.exit(1)}});console.log('edits ok')"
node -e "const s=require('fs').readFileSync('js/cardScene.js','utf8');if((s.match(/CardScene.prototype.render = function/g)||[]).length!==1){console.error('render count wrong');process.exit(1)}if((s.match(/CardScene.prototype.initLite = function/g)||[]).length!==1){console.error('initLite count wrong');process.exit(1)}console.log('counts ok')"
```
Expected: `cardScene OK`, `edits ok`, `counts ok`.

- [ ] **Step 5: Commit**

```bash
git add js/cardScene.js
git commit -m "feat: crossfade card frames to extracted still; lite shows still"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 4: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Geometry tests still pass**

Run: `node --test` → Expected: 8 tests pass, 0 fail.

- [ ] **Step 2: All JS parses**

Run: `for f in js/lib/geometry.js js/lib/preloader.js js/cardScene.js js/sections.js js/main.js; do node --check "$f" && echo "ok $f"; done`
Expected: all `ok`.

- [ ] **Step 3: Asset/serve audit (self-contained Node static check)**

Run:
```bash
node -e "
const http=require('http'),fs=require('fs'),path=require('path');
const t={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{let p='.'+decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.statusCode=404;r.end()}else{r.setHeader('content-type',t[path.extname(p)]||'application/octet-stream');r.end(d)}})});
srv.listen(8131,async()=>{const u=['/','/css/card.css','/js/cardScene.js','/media/card/open-card.webp','/media/frames/frame_0193.webp','/media/video/drone-shot.mp4'];let bad=0;for(const x of u){const r=await fetch('http://localhost:8131'+x);console.log(r.status,x);if(r.status!==200)bad++}srv.close();console.log('non-200:',bad);process.exit(bad?1:0)});
"
```
Expected: every line `200`, `non-200: 0`.

- [ ] **Step 4: VISUAL CHECK — screenshot harness (agent-runnable)**

Ensure the site is served (`npx serve -l 8000`, or the node static server). Capture the intro
phases and Read the PNGs:
```bash
npm run shoot -- --cardp 0.3,0.69,0.72,0.78,1
npm run shoot -- --reduced --cardp 1
```
Then `Read` `shots/shot_card_0_3.png` … `shots/shot_card_1.png` and `shots/shot_card_1_reduced.png` and confirm against the spec's Verification list:
- Opening (`0.3`) is on emerald with a gentle vignette — no pink seam.
- Across the crossfade window (`0.69`→`0.72`) the canvas hands off to the clean cutout with **no visible pop or misalignment**.
- At rest (`1`) it's the pristine card on emerald with the details on the frosted page.
- Reduced-motion (`1_reduced`) shows the clean still + details on emerald.

Fix any issues found (e.g. tune the crossfade range `P_OPEN+0.06`, vignette stop `42%`, or `--cropw`), re-shoot, and commit each fix separately.

- [ ] **Step 5: Final housekeeping commit (optional, ask user first)**

If the user agrees, tidy untracked dirs: add `docs/` to git, and add `.claude/` and `frames/` (stray) to `.gitignore`. Do NOT delete the stray `frames/` without explicit confirmation.

---

## Self-Review (completed during planning)

- **Spec coverage:** extraction tool + still → Task 1; emerald bg + vignette + still element → Task 2; crossfade at rest → Task 3; lite uses still → Tasks 2+3; verification → Task 4. Pending-tweaks checkpoint → Task 0. ✓
- **Placeholder scan:** every code step contains complete code; controller visual checks are explicit (implementer can't see images), not placeholders. ✓
- **Type/name consistency:** element ids `cardStill`, class `card-vignette`, `cardCanvas`, `cardDoc` consistent across `index.html`, `css/card.css`, `js/cardScene.js`. `this.still`/`this.vignette`/`this.canvas`/`this.doc` consistent in `cardScene.js`. Crossfade var `x` from `G.mapRange` (existing geometry API). Asset path `media/card/open-card.webp` consistent in tool output, HTML `src`, preload, and serve audit. ✓
