# Our Story — The Red String of Fate

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation plan
**Supersedes the metaphor of:** the current "two lines that kiss then merge in gold" Our Story timeline.

## Concept

Recast the existing pinned, horizontally-scrubbed "Our Story" timeline around the
**red string of fate**: an unbroken red thread that runs from Grace and Juriel's
parallel childhoods all the way to the 2025 proposal.

- **Juriel** rides the **top** lane, **Grace Ann** the **bottom** lane.
- The red string is loose and parallel while they live separate-but-mirrored
  childhoods, pinches together the years they meet, and **knots into a single red
  line from 2015 on** — one thread to the proposal 💍.

This replaces the gold "merge" metaphor with red throughout. The section keeps its
current mechanics: pinned stage, scroll pans the track left→right 1:1, reduced-motion
falls back to a vertical list.

## The narrative, in order (left → right)

| # | Era / year | What it shows | Source photos |
|---|-----------|----------------|---------------|
| 1 | **Before 2002** — "we were already parallel" | **Matched pair: same bike.** His photo on the top lane, hers on the bottom, joined by a short vertical red string. | `red_string/bike/bike_juriel.jpeg`, `red_string/bike/bike_grace.jpeg` |
| 2 | **Before 2002** | **Matched pair: same eyeglasses.** Same paired treatment. | `red_string/eyeglass/same_eyeglass_juriel.jpeg`, `red_string/eyeglass/same_eye_glass_grasya.jpeg` |
| 3 | **2002** | **Met in kindergarten.** The two lanes pinch to the centre (a "kiss"); one shared photo disc. | `red_string/2002/kinder_duye_grasa.jpeg` |
| 4 | **2008** | **Mr. & Ms. Agham** — won the competition together. Lanes kiss again; one shared disc. | `red_string/2008/mr&ms_agham_2008.JPG` |
| 5 | **2015** | **"It all started."** The two strings **knot into one** red line. First together-year circle. | `2015/` |
| 6 | **2015 → 2025** | **A circle per year** strung along the single red line, staggered above/below, ending at the **proposal**. | `2016_date/`, `2017/`, `2018/`, `2019/`, `2022/`, `2023/`, `2024/`, `2025/` |

Years with **no photos (2020–2021)** are shown as a small **dashed break** in the red
string between 2019 and 2022 — a deliberate, quiet gap rather than a hidden one.

Source root: `C:\Users\jurie\Desktop\our_story`.

## Decisions locked with the couple

1. **Layout:** one continuous red string (chosen over a ring or a grid).
2. **Photos per year:** **one lead circle per year**; clicking it opens that year's
   *other* photos in the shared lightbox (arrows/swipe walk the year's album).
3. **2020–21:** keep a small dashed "…" break in the string (no year label needed).

## Components & where the work lands

The redesign is **mostly data + reskin + one new node type + a photo build step**.
The pin/pan engine, IntersectionObserver reveal, and reduced-motion fallback are
unchanged.

### 1. `js/story.js` — the story data & node rendering
- **Rewrite the `STORY` array** to the six-part narrative above using three node
  shapes:
  - **Pair node** (childhood): `{ pair: true, label, juriel, grace }` — no year,
    renders **two discs** (top lane + bottom lane) joined by a vertical red string,
    with one italic caption centred below.
  - **Kiss node** (2002, 2008): `{ year, who: "both", kiss: true, caption, photo }`
    — existing behaviour, one shared disc on the centre where the lanes meet.
  - **Year node** (2015–2025): `{ year, merge?, caption, photo, album }` — a single
    circle on the merged red line. `merge: true` on **2015** starts the single line.
    `album` names the folder whose photos open in the lightbox; `photo` is the lead.
- **`nodeEl`**: add a `pair` branch that builds two `.story-disc` elements at the top
  and bottom lanes plus a `.story-pair-string` vertical connector and a single caption.
- **Disc click → lightbox:** wire story discs to the **shared lightbox already in
  `sections.js`** (`#lightbox`, with its arrow/swipe "tour"). Clicking a year disc
  loads that year's `album` images as the tour; clicking a pair/kiss disc opens its
  photo(s). This means exposing a small open-with-list hook from `sections.js` (e.g.
  `window.W.openLightbox(srcs, startIndex)`) and calling it from `story.js`, so the
  two sections share one lightbox instead of duplicating it.
- **Era labels:** render two faint labels along the track — "Before 2002 · we were
  already parallel" over the childhood span and "2015 · it all started" at the knot.
- **`initLite`** (reduced motion): extend the vertical list to render pair nodes as a
  his/hers row and year nodes as before.

### 2. `js/lib/storyGeometry.js` — geometry (small additions)
- Lane lines already stay in their own lane at non-kiss nodes, so pair nodes need
  **no change to the path maths**. Add only: tag pair nodes in the laid output and
  expose the `topY`/`bottomY` a pair disc pair should sit on (already computed in
  `out`). Keep `smoothPath`, `linePoints`, `layout` otherwise intact.
- Rename the conceptual "gold" merged path to the bound red string in comments;
  the emitted path key can stay `gold` to avoid churn, or be renamed to `bound`
  (implementer's choice — update `story.js` + CSS together if renamed).

### 3. `css/story.css` — reskin gold → red
- `.story-line-j`, `.story-line-g`, and the merged line all become the **red string**
  colour (a new token, e.g. `--red-string`, added to `css/tokens.css`/`theme.css`
  for light & dark). One consistent red so the thread reads as continuous.
- `.story-disc` ring becomes red.
- New `.story-pair-string` (dashed vertical red connector) and `.story-gap` (dashed
  break drawn in the empty 2020–21 span).
- Verify dark-theme values.

### 4. `tools/build-story.js` — photo build step (new)
Mirror `tools/build-gallery.js`, using `sharp`:
- Read from `C:\Users\jurie\Desktop\our_story` (path configurable via `--src`).
- **Discs:** centre-crop square, ~600px, `fit: "cover"`, q82 → the round tile source.
- **Album/full images:** `fit: "inside"`, long edge ~1400px, q82 → lightbox source.
- Output under `media/story/` with an explicit, stable scheme, e.g.:
  - Pairs: `media/story/bike-juriel.jpg`, `bike-grace.jpg`, `glasses-juriel.jpg`,
    `glasses-grace.jpg`
  - Kiss: `media/story/2002.jpg`, `media/story/2008.jpg`
  - Years: disc `media/story/2015/lead.jpg`; album `media/story/2015/01.jpg …`
- Auto-orient (`.rotate()`), clear stale outputs before writing.
- Add `npm run build:story` to `package.json`; update `media/story/README.md`.
- **EXIF orientation** matters here — several sources are phone photos.

### 5. `index.html`
No structural change expected (`#story` markup stays). If a shared-lightbox hook is
added, ensure `sections.js` still owns the `#lightbox` element and loads before or
independently of `story.js` (both are already loaded near the end of `index.html`).

## Data flow

```
our_story/ (source) --build-story.js/sharp--> media/story/*.jpg
                                                     |
STORY[] in story.js  --storyGeometry.layout()-->  laid nodes + red paths
                                                     |
                          story.js renders discs/lines into #storyTrack
                                                     |
              scroll --> pin/pan (unchanged) ; disc click --> shared #lightbox tour
```

## Testing

- **`test/storyGeometry.test.js`**: extend for the new node mix — assert lane lines
  stay in-lane across a pair node, still dip at kiss nodes, and merge from 2015; add
  a case asserting a pair node reports both top and bottom anchors.
- **Node build**: `npm run build:story` runs clean and emits the expected files;
  spot-check a disc is square and an album image is ≤1400px.
- **Manual/headless**: `window.__story` still builds; discs open the correct album in
  the lightbox; reduced-motion list renders pairs and years; dark theme reads well.

## Out of scope (YAGNI)

- No ring/spiral layout, no per-year captions beyond one short line each.
- No new lightbox — reuse the gallery's.
- No animation of the string "tying" beyond the existing pan/reveal (can be a later
  polish pass).
- 2020–21 get a gap marker only, not placeholder tiles.
```
