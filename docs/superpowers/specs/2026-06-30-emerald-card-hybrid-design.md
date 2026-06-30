# Emerald Card Intro — Hybrid Extraction Design

**Date:** 2026-06-30
**Status:** Design approved, pending spec review
**Working dir:** `C:\Users\jurie\Desktop\website_wedd\wedding_website`

---

## Context

The invitation-card intro looked "off." Investigation found the cause: the rendered card
frames have a **warm tan tabletop baked in** (≈`#c2a185`), which reads as "pink" against the
site's emerald/gold theme, and the flat CSS letterbox fill (`#e6d8c2`) is lighter than the
tabletop, creating a visible seam on non-16:9 screens.

The tabletop is baked into all 193 frames, so it can't be swapped with CSS. Two extraction
spikes were run:
- **Color-key (ffmpeg)** — failed: the frosted page (sage) keys out with the tan, and
  baby's-breath leaves artifacts.
- **AI object-segmentation (`@imgly/background-removal-node`)** — pristine on the open/mid
  frames (0096, 0193) but **fails on the closed frame (0001)** (drops the flat green cover),
  and, more fundamentally, **per-frame matting flickers** across a moving sequence (temporal
  inconsistency). Conclusion: AI extraction is right for a **single still**, wrong for the
  **moving animation**.

**Goal:** Make the card sit cleanly on the site's deep emerald — no pink, no seam — without
flicker, keeping the opening animation smooth.

**Decisions (brainstorming):**
- Approach: **hybrid** — graded/vignetted opening (real frames, no flicker) that crossfades
  to a **pristine AI-extracted still** of the open card on emerald for the resting/reading
  state.
- Opening treatment: **emerald vignette + emerald background only** (keep the opening's true
  colors; do NOT add a blend overlay that would tint the card). The crossfade removes the tan
  entirely at rest.

---

## Design

### 1. Extracted still + reusable tool
- `tools/extract-card.js` — Node script using `@imgly/background-removal-node` (already
  installed). Input: `media/frames/frame_0193.webp` (converted to PNG via ffmpeg first, since
  the lib decodes PNG reliably). Output: a transparent cutout, **smudge masked off** (zero the
  alpha outside the card's bounding region — roughly the left/center ~72% width; the stray
  artifact sits in the empty top-right), re-encoded to `media/card/open-card.webp` (WebP with
  alpha, 1280×720, card in the same position as the source frame so it aligns with the canvas).
- The script is reproducible and parameterizable (input frame, output path) for future stills.

### 2. Emerald background
- `css/card.css`: replace the beige `.card-scroll` / `.card-stage` backgrounds with a **deep
  emerald radial gradient** (lighter center → darker edges) for depth and a soft vignette,
  e.g. `radial-gradient(ellipse at center, var(--green-800), var(--green-900))`.

### 3. Opening (moving frames) — unchanged colors + vignette
- Keep the frame scrub exactly as is (contain-fit, smoothed). The emerald background shows in
  the letterbox margins; a subtle emerald vignette overlay (`.card-vignette`, radial,
  transparent center → emerald edges, `pointer-events:none`) frames the moving card so the tan
  blends toward the edges. No color-blend on the card itself.

### 4. Resting state — crossfade to the clean cutout
- `index.html`: add, inside `#cardLayer`, an `<img id="cardStill" src="media/card/open-card.webp">`
  positioned `inset:0`, `object-fit:contain`, `opacity:0` (it lines up with the canvas because
  the cutout is the full 1280×720 frame with the card in place).
- `js/cardScene.js` `render()`:
  - `p < P_OPEN` (OPEN): canvas opacity 1, `cardStill` opacity 0, vignette visible.
  - `p ≥ P_OPEN` (DETAILS): **crossfade** over a short range (e.g. `P_OPEN`→`P_OPEN+0.06`):
    canvas opacity → 0, `cardStill` opacity → 1, vignette fades out. Details (`#cardDoc`) fade
    onto the frosted page using the existing `acRect`/`layout` geometry (already aligned).
  - Keep drawing the last canvas frame underneath during the crossfade so there's no gap.
- Result: while reading, it's the pristine extracted card on emerald — no tan, no seam.

### 5. Reduced-motion / lite
- `initLite()` shows the **extracted cutout** (`cardStill` opacity 1, canvas hidden) on
  emerald, details shown immediately. Simpler and cleaner than the scrub fallback.

---

## Files touched
- Create: `tools/extract-card.js`, `media/card/open-card.webp`
- Modify: `index.html` (add `#cardStill` + `.card-vignette` in `#cardLayer`),
  `css/card.css` (emerald bg, vignette, still styling, lite tweaks),
  `js/cardScene.js` (crossfade logic in `render`, still handling in `init`/`initLite`).
- `@imgly/background-removal-node` stays a dev-only dependency (installed `--no-save`; used by
  the tool, not shipped). `media/card/open-card.webp` is the shipped artifact.

## Verification
- Run `tools/extract-card.js`; open `media/card/open-card.webp` — card cleanly cut out, frosted
  page intact, no top-right smudge, transparent elsewhere.
- Serve and scroll: opening scrub is smooth on emerald (no pink seam, gentle vignette); at the
  end it crossfades seamlessly to the clean card on emerald with the details on the frosted
  page; no visible "pop" or misalignment at the swap.
- Resize: still + details stay aligned to the card.
- `node --check` on `cardScene.js`; existing geometry tests still pass.
- Reduced-motion: shows the clean cutout + details on emerald.

## Out of scope
- Re-extracting the full 193-frame sequence (rejected: flicker). Only the single resting still
  is extracted.
