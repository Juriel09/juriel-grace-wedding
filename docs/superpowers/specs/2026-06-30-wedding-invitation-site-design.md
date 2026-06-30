# Grace & Juriel — Wedding Invitation Site

**Date:** 2026-06-30
**Status:** Design approved, pending spec review
**Working dir:** `C:\Users\jurie\Desktop\website_wedd\wedding_website` (currently empty)

---

## Context

There are two prior builds of this wedding site (`..\output` and `..\website_card`). The
most developed, `website_card`, has genuinely beautiful source assets — a 193-frame rendered
animation of a deep-green acrylic invitation card opening (gold wax seal, baby's-breath sprig,
gold cords, frosted-glass inner page) — but the execution feels **choppy and unprofessional**.

Two root causes were identified by inspecting the code and assets:

1. **Choppy opening (the animation itself).** It scrubs 193 separate WebP images (~7.7 MB)
   frame-by-frame on a `<canvas>` tied directly to scroll position. Fast scroll skips frames;
   slow scroll shows discrete steps. Nothing animates until all frames preload, so it also
   loads slowly.
2. **"Pasted-on" / template feel.** The readable text is laid over the frosted inner page as
   three rigid vertical thirds using separate `top/middle/bottom.png` crops that are *dark
   green* — but the open card's inner page is *frosted sage glass*. The art does not match the
   surface it sits on, so text floats on top instead of looking printed into the card. Copy is
   generic placeholder text.

**Goal:** Rebuild from scratch in `wedding_website/`, keeping the beautiful card art but fixing
both problems, to produce a polished, cinematic invitation where the card slowly opens on
scroll and is then read top-to-bottom while zoomed — like reading a real invitation.

**Decisions made during brainstorming:**
- Opening animation: **keep the rendered frames, optimized** (not pure-CSS 3D, not video).
- Scope: **card core + fuller sections below** (intimate invitation on the card; gallery /
  film / entourage / RSVP get room to breathe below).
- RSVP: **embedded form service** (styled, embedded on the page).
- Content: build now with **elegant dummy data**; the couple swaps in real content later. All
  real assets (photos, prenup film, final wording, drone footage) exist and will be dropped in.

---

## Concept: a three-act cinematic invitation

Scroll → the real card opens → you read it zoomed like a physical invitation → it opens up
into the fuller wedding site.

### Act 1 — The Opening (optimized frames)

Reuse the 193-frame card-opening sequence from `..\website_card\media\frames`, but fixed so it
glides:

- **Re-encode** frames smaller (lower-quality WebP / resized to actual display size) to cut the
  ~7.7 MB payload substantially. Keep the frame count if it stays smooth after smoothing.
- **Smart preload** — draw frame 1 immediately; stream the rest progressively. A tasteful
  loader appears only if frames aren't ready when the user starts scrolling.
- **Smoothed scrub** — the scroll-driven frame index is *eased* (lerp toward target) and drawn
  on `requestAnimationFrame`, decoupled from raw scroll events, so the cover opens fluidly
  instead of stepping. This is the core fix for the choppiness.
- The card stage is **pinned** while scroll drives frame index 0 → 192 (cover lifts, frosted
  inner page revealed).

### Act 2 — The Reading (core of the vision)

- The frosted inner page becomes a **real DOM surface** styled to *match* the frosted-glass +
  gold-botanical look — CSS frosted gradient + gold botanical corner accents (SVG, or cropped
  from the existing art) — so text looks printed into the card, not pasted on.
- A scroll-driven **camera** (`transform: scale + translateY` on the card stage) zooms into the
  page and **pans top→bottom**, revealing content as it enters view:
  1. **Names & date** — gold-foil treatment on "Grace & Juriel"
  2. **Our Story**
  3. **When & Where** — venue + time
  4. **Dress code**
- Text is real and sharp at any zoom, fully responsive, trivially editable.

### Act 3 — The Wedding Site (fuller sections below)

After the reading completes, the camera pulls back / card recedes and the page flows into
wider sections:

- **Gallery** — photo grid + lightbox (lazy-loaded)
- **Prenup Film** — poster → click-to-play (file or YouTube/Vimeo embed)
- **Entourage & Sponsors** — refined columns
- **RSVP** — styled embedded form
- **Footer** — drone footage as a subtle, muted background loop

---

## Design system

Keep and refine the existing palette and type pairing.

- **Palette:** deep forest greens (`#14271b`–`#2a4d38`), warm golds (`#a17f30`, `#c9a24b`,
  `#e3c581`), paper tones (`#e9ddc9` beige, `#faf4e8` cream), ink (`#3a352c`).
- **Type:** Cormorant Garamond (serif, headings + italic ampersand) + Jost (sans, body/UI).
- **Refinements:** cleaner modular type scale, consistent spacing rhythm, real gold-foil
  gradient accents on names/dividers, generous breathing room. Cohesive, not template-y.

---

## Tech & architecture

- **Stack:** vanilla HTML / CSS / JS, no build step (matches existing approach and is correct
  for a static site of this size). GSAP 3.12.5 + ScrollTrigger + Lenis smooth scroll via CDN.
- **Fonts:** Google Fonts (Cormorant Garamond + Jost).
- **File structure:**
  ```
  wedding_website/
    index.html
    css/styles.css
    js/main.js
    media/
      frames/            # optimized card-opening frames
      gallery/           # couple drops photos here later
      video/             # prenup film + transcoded drone loop
      art/               # gold botanical corners / decorative SVGs
  ```
- **Code organization:** `main.js` split into clear, independently-understandable units —
  frame preloader/drawer, opening-scrub controller, reading-camera timeline, section reveals,
  lightbox, lite-mode fallback. Each has one purpose and a small surface.
- **Reduced-motion / lite mode:** full fallback — static open card + stacked, readable sections,
  no scrub dependency (mirrors the robust fallback already in the old build).

### Performance

- **Drone footage:** raw DJI clips are 800 MB–1.7 GB. Transcode one chosen clip to a small,
  muted, web-optimized MP4 loop (a few seconds, ~720p, heavily compressed) using the `ffmpeg`
  binary already in `..\website_card\.tools`. Provide a poster image and `preload="none"`.
- **Frames:** resize to display resolution + lower WebP quality; preload progressively.
- **Gallery:** lazy-load images; `loading="lazy"` + responsive sizes.
- **Film:** poster + click-to-play (no autoload of heavy video).

### Responsive

- Desktop: full zoom-and-read camera experience.
- Mobile: card opening preserved; reading camera tuned for portrait (or gracefully degraded to
  a vertically-scrolled readable card), sections stack naturally. Test both orientations.

---

## Dummy content (placeholders to ship now)

All written so the couple can swap real content in later without touching layout:

- **Names/date:** Grace & Juriel — November 11, 2026, 3:00 PM (already real).
- **Our Story:** 2–3 warm placeholder paragraphs.
- **When & Where:** "The Forest Pavilion, Your City" + map link placeholder.
- **Dress code:** "Formal · Emerald & Gold".
- **Gallery:** 6–8 placeholder images (tasteful, on-palette) in `media/gallery/`.
- **Prenup film:** placeholder poster + a stand-in video (or the existing `invt_card_raw.mp4`)
  wired to the player.
- **Entourage & Sponsors:** generic placeholder name lists.
- **RSVP:** embedded demo form (clearly marked) with the intended fields (name, attending
  y/n, guests, notes).

---

## Build phases

1. **Scaffold + assets** — create folder structure, copy + optimize frames, set up design
   tokens and base layout/typography.
2. **Act 1** — smooth, pinned, eased frame-scrub opening.
3. **Act 2** — reading camera (zoom + top→bottom pan) over the real DOM frosted surface.
4. **Act 3** — gallery, prenup film, entourage, RSVP, footer sections.
5. **Assets** — wire dummy content; transcode chosen drone clip; lazy-loading.
6. **Polish** — performance pass, responsive/mobile, reduced-motion fallback, cross-check.

---

## Verification

- **Smoothness (fixes problem 1):** open in a browser, scroll slowly and quickly through Act 1;
  the cover must glide with no visible frame-stepping or skipping. Throttle CPU in DevTools to
  confirm it holds up.
- **Reading experience (the vision):** confirm the camera zooms and pans top→bottom through
  sharp, correctly-positioned text that reads like a real invitation.
- **No "pasted-on" feel (fixes problem 2):** text visually sits *on* the frosted surface with
  matching styling; no mismatched green crops.
- **Load time:** measure total payload and first-paint; opening should start near-instantly,
  not block on full frame preload.
- **Sections:** gallery lightbox opens/closes; film plays on click; RSVP form renders; drone
  loop plays muted in footer.
- **Fallback:** with `prefers-reduced-motion: reduce`, the static open card + stacked sections
  are fully readable.
- **Responsive:** verify desktop + mobile (portrait/landscape).

---

## Handoff — what the couple provides later

- **Gallery photos** → drop into `media/gallery/`.
- **Prenup film** → a file into `media/video/`, or a YouTube/Vimeo link.
- **Final wording** → Our Story text, venue name & address, exact time, dress code, entourage &
  sponsor names.
- **Drone footage** → name the clip to use; it will be transcoded.
- **RSVP** → chosen service (Formspree / Google Form embed / etc.) and the desired fields.
