# Grace & Juriel — wedding invitation site

A static site: hand-written HTML, CSS and plain (non-module) JavaScript, with
Google Apps Script standing in for a backend. There is no bundler, no framework
and no build step — what is in the repo is what ships.

## Running it in dev mode

You need [Node.js](https://nodejs.org/) 18 or newer (developed on 24.x).

```bash
npm install          # dev tooling only — the site itself has no dependencies
npx serve -l 8000    # serve the repo root as a static site
```

Then open <http://localhost:8000/>.

Any static file server works — `npx serve` is just the one the tooling below
assumes. `npm install` is *not* required to view the site; it only installs
Playwright, the QR generator and the media-build tools. Serving the folder is
required, though: over `file://` the page is an opaque origin, so the canvas
and Three.js art textures (butterflies, fireflies, the trees) are blocked by CORS
and never draw.

Pages:

| URL | What it is |
| --- | --- |
| `/` | the invitation — card intro, story, details, RSVP |
| `/share.html` | the guest photo album (upload + wall) |
| `/share?key=<admin_key>` | the album with hide controls (see the gotcha below) |
| `/docs/guest-album-setup.html` | setup instructions for the album's spreadsheet |

Edit a file, reload the browser. Nothing watches or rebuilds.

### Screenshots instead of squinting

Two Playwright harnesses render the served site to PNGs in `shots/`
(gitignored), which is how the UI gets checked without a human at the screen.
Both need the server from above already running:

```bash
node tools/shoot.js --at 0,0.4,0.8,1          # scroll positions down the page
node tools/shoot.js --cardp 0,0.7,0.8,1       # progress through the card intro
node tools/shoot.js --w 390 --h 844           # mobile viewport
npm run preview:share                          # share.html in each of its states
```

`preview:share` stubs the album backend from outside the page, so it works
before — or without — a live Apps Script deployment. No mock code ships.

### Tests

```bash
npm test     # node --test over test/*.test.js — pure geometry and gating logic
```

These are unit tests of the maths and the album's open/closed gate. They do not
render anything; that is what the screenshot harnesses are for.

## Gotchas

- **`npx serve` drops query strings.** Its clean-URL redirect turns
  `share.html?key=secret` into `/share` with no query, so the admin key is lost.
  Navigate to `/share?key=secret` directly. Dev-server quirk only — GitHub Pages
  serves the file as-is, so production is unaffected.
- **The backends are live.** `js/rsvp.js` and `js/shareApi.js` each hold a
  deployed Apps Script `/exec` URL at the top of the file. A local dev run posts
  to the real spreadsheet — change the `ENDPOINT` constant if you want it not
  to.
- **Three.js, GSAP and Lenis load from CDNs**, so the intro needs a working
  network connection even locally.

## Media tooling

The scripts under `tools/` rebuild media from source photos and videos that live
*outside* this repo (and mostly need `ffmpeg` on PATH). They are one-off build
steps, not part of running the site: `npm run build:gallery`, `build:story`,
`optimize:frames`, `transcode:drone`, `extract:card`, and `npm run qr` for the
printable QR card. Each script's header comment documents its flags.
