# Guest Photo Album — scan, upload, watch it fill

**Date:** 2026-08-04
**Status:** Approved design, ready for implementation plan
**Wedding:** 11 November 2026, The Forest Barn, Alfonso, Cavite

## Concept

A QR code on the reception tables leads to a fast, on-brand page where guests send
photos from their phones straight into the couple's Google Drive, and watch a shared
wall fill up in real time as the night goes on.

The page is deliberately *not* part of the invitation site's cinematic experience. A
guest standing at a table on venue wifi should see something usable in about a second —
no opening film, no 190-frame envelope scrub, no GSAP, no Lenis.

**Photos only. Video is excluded by design** — it is filtered out of the phone's file
picker, and rejected again on the server.

## Decisions

| Question | Decision |
|---|---|
| What guests can do | Upload **and** see the live album of everyone's photos |
| Moderation | Photos post instantly; the couple has a private hide button |
| Placement | Standalone `share.html`, plus a "Guest Album" link in the main nav |
| Photo size | Shrunk in the browser to long-edge 2400px JPEG |
| Attribution | No name field. Each device silently gets a random tag (`Guest-4821`) |
| Availability | Server-side time gate, opening 1:00 PM Manila on the wedding day |
| Config | A **Config** tab in the existing RSVP spreadsheet |
| Backend | A **separate** Apps Script project reading that same spreadsheet |

## Non-goals

- Video of any kind.
- Guest accounts, sign-in, or any Google login.
- Filters, cropping, captions, comments, or likes.
- Preserving the untouched original file. The 2400px JPEG is what is kept.
- Deleting anything permanently from the website. Hiding is reversible; real deletion
  happens in Drive, by hand, by the couple.

---

## Architecture

```
  Guest phone                    Apps Script (photos.gs)          Google
  ───────────                    ───────────────────────          ──────
  share.html
    │  GET ?action=status  ───────►  read Config tab (cached 20s)
    │  ◄─── {open, opensAt, now}
    │
    │  canvas resize → JPEG → base64
    │  POST {action:"upload"}  ───►  gate check → DriveApp.createFile ──► Drive folder
    │  ◄─── {id, ts}                 log row ──────────────────────────► Photos tab
    │
    │  GET ?action=list  ─────────►  folder listing (cached 20s)
    │  ◄─── [{id, tag, ts}]
    │
    └── <img src="drive.google.com/thumbnail?id=…">  ──────────────────► Drive (direct)
```

Photo **bytes** flow through the script exactly once, on upload. Every subsequent view
is served by Google's own thumbnail CDN, so the wall costs the script nothing no matter
how many guests are watching it.

### Why a separate Apps Script project

An Apps Script project can define only one `doGet` and one `doPost`, and `rsvp.gs`
already uses both. Rather than turn a working, single-purpose RSVP endpoint into a
router, the photo album gets its own standalone project with its own deployment URL. It
reaches the couple's spreadsheet with `SpreadsheetApp.openById(SHEET_ID)`.

The consequence that matters: **a bug in upload code on the wedding day cannot take down
the RSVP.** One spreadsheet remains the single admin panel; the two endpoints just fail
independently.

---

## The spreadsheet is the control panel

This follows the philosophy already stated at the top of `rsvp.gs`: the sheet *is* the
admin interface. Two new tabs join `Guests` and `Responses`.

### `Config` tab

Two columns, `Setting` and `Value`, read case-insensitively by key so row order does not
matter.

| Setting | Value | Meaning |
|---|---|---|
| `open_at` | `2026-11-11 13:00` | Uploads open at this moment (Asia/Manila) |
| `close_at` | *(blank)* | Uploads stop. Blank means never |
| `force_open` | `FALSE` | `TRUE` overrides both dates — open right now |
| `admin_key` | *(a secret string)* | Unlocks hiding; always bypasses the gate |

Editing a cell from the Google Sheets phone app is the entire deployment process for
opening the album. No Apps Script UI, no redeploy, no git push. Changes take effect
within about 20 seconds (the cache TTL).

`open_at` / `close_at` are read leniently: the cell may be a real Sheets date value or a
plain string like `2026-11-11 13:00`. Both parse. A blank or unparseable `open_at` means
**closed** — failing shut, not open.

`force_open` accepts `TRUE`, `true`, `yes`, or `1`.

### `Photos` tab

One row appended per accepted upload. Created automatically with headers on first use.

| Timestamp | File ID | Tag | Filename | Hidden |
|---|---|---|---|---|
| 2026-11-11 19:04:22 | `1a2B3c…` | Guest-4821 | `Guest-4821_190422.jpg` | |

`Hidden` is the couple's second lever: typing `TRUE` in that cell hides the photo on the
next poll, the same as tapping ✕ on the page. The ✕ writes `TRUE` into this cell *and*
moves the file, so the sheet and Drive never disagree.

This tab also gives a live count of how many photos have come in during the reception.

### Drive layout

```
Wedding Photos/          ← FOLDER_ID constant in photos.gs
├── Guest-4821_190422.jpg
├── Guest-1177_190455.jpg
└── _hidden/             ← created on first hide
    └── Guest-9002_191203.jpg
```

Each file is given link-view sharing explicitly on creation
(`setSharing(ANYONE_WITH_LINK, VIEW)`) rather than relying on folder inheritance, so a
thumbnail is guaranteed to render for guests.

---

## API contract

All responses are JSON. POSTs are sent as `text/plain;charset=utf-8` — the one content
type an Apps Script web app can accept without a CORS preflight it cannot answer. This
is the same trick `rsvp.js` already uses.

### `GET ?action=status[&key=…]`

```json
{ "ok": true, "open": false, "opensAt": "2026-11-11T13:00:00+08:00",
  "closesAt": null, "now": "2026-08-04T21:15:03+08:00", "admin": false }
```

`now` is the **server's** clock. The page computes an offset from it and anchors its
countdown to that, so a guest whose phone clock is wrong still sees the truth and cannot
open the album early by changing their device time.

A valid `key` returns `admin: true` and `open: true` regardless of the dates.

### `GET ?action=list[&key=…]`

```json
{ "ok": true, "now": "…", "photos": [ { "id": "1a2B3c…", "tag": "Guest-4821", "ts": 1794567890123 } ] }
```

Newest first; new arrivals prepend to the top of the wall. Hidden files are excluded for
everyone, admin included — recovery is done from Drive or the sheet, not from the wall.

`tag` is returned even though the wall shows no captions: it is how the page recognises
its own photos coming back from the server and retires the local preview it was showing
in their place, instead of displaying the same photo twice.

### `POST { action: "upload", tag, filename, mime, data }`

`data` is base64, no data-URL prefix.

```json
{ "ok": true, "id": "1a2B3c…", "ts": 1794567890123 }
```

Rejections return `{ "ok": false, "error": "<reason>" }` where reason is one of:

| Error | Cause | What the guest sees |
|---|---|---|
| `closed` | Outside the open window | "the album isn't open yet" |
| `type` | `mime` does not start with `image/` | "photos only, please" |
| `too_large` | Decoded bytes over 8 MB | "that photo is too large" |
| `rate` | Over 60 uploads from this tag in an hour | "give us a moment, then try again" |
| `server` | Anything unexpected, caught and logged | "something went wrong — retrying" |

### `POST { action: "hide", key, id }`

Moves the file into `_hidden/` and sets `Hidden = TRUE` on its row. Returns
`{ "ok": false, "error": "auth" }` for a wrong or missing key. The key is compared
server-side; it never gates anything in client JavaScript.

---

## The page

`share.html` — one page, three states, driven by the status response.

### Closed state

Centred on ivory paper: the J&G monogram, "The guest album opens at 1:00 PM", and a live
countdown ticking down to `open_at`. Warm and expected, not an error screen. It
re-checks status every 60 seconds and flips itself to the open state on its own, so a
guest who scans at 12:58 does not have to do anything.

### Open state

A short header, then one large "Add photos" button, then the wall.

There is no name field and no keyboard. On first visit the page generates a random tag
(`Guest-` plus four digits) and stores it in `localStorage`, so every photo from one
phone carries the same tag all night and groups together in the Drive folder — while the
wall itself shows no captions at all and reads as a clean gallery.

### Upload pipeline

```
file  →  createImageBitmap  →  canvas @ fitWithin(w,h,2400)  →  toBlob(jpeg, .85)
      →  FileReader → base64  →  POST  →  progress row  →  wall
```

- The input is `<input type="file" accept="image/*" multiple>`. `image/*` means the
  phone's picker will not offer videos in the first place; the server checks again.
- Long edge 2400px at quality 0.85 lands most photos under 1 MB — fast on crowded wifi,
  still sharp enough to print at 8×10. Images already smaller are never upscaled.
- iPhone HEIC decodes natively in iOS Safari and comes out the other side as JPEG, so
  the couple never receives a file Windows struggles to open.
- **Photos upload one at a time**, in a queue, with a visible progress row each. A
  hundred phones hitting one Apps Script deployment *will* occasionally be refused;
  serialising per device keeps each guest's own batch orderly and the failures rare.
- Each photo retries twice with backoff before it reports failure. A failed row keeps a
  "try again" button rather than disappearing.
- Batches are capped at 10 photos at a time, with a clear message when more are picked.

### The wall

- Tiles render straight from `https://drive.google.com/thumbnail?id=<id>&sz=w600`, lazy
  loaded. Tapping one opens a lightbox at `sz=w1600`.
- Polls `?action=list` every 15 seconds **only while the tab is visible**
  (`visibilitychange`), and appends only IDs it has not already placed, so the wall grows
  through the reception without a refresh and without re-rendering what is already there.
- The guest's **own** photo appears instantly, from the local blob, the moment the upload
  succeeds — Drive can take several seconds to generate a thumbnail and nobody should
  stare at a gap wondering if it worked. The polled entry later replaces it by ID.
- Drive's thumbnail service is occasionally slow or rate-limited. A tile that fails to
  load retries once after a delay, then falls back to a soft placeholder rather than a
  broken image icon.

### Admin

`share.html?key=<admin_key>` puts a small ✕ on every tile. Tapping it hides that photo
within one poll cycle for every guest. Nothing is destroyed — the file moves to
`_hidden/` and can be moved back from Drive at any time.

The key also forces the page open, which is how the couple test the whole flow long
before 1:00 PM without opening it to anyone else.

---

## Scale and quotas

The reception is the load test, and there is no second chance at it, so the numbers are
worth stating.

- **Sheet reads:** every request would otherwise read the spreadsheet, which is slow
  (~200ms) and quota-bearing. Config and the photo list both go through `CacheService`
  with a 20-second TTL, so the sheet is read a few times a minute regardless of whether
  10 or 200 guests are polling.
- **Photo serving:** zero script involvement. Google's thumbnail CDN carries it.
- **Concurrent executions:** consumer Apps Script allows a limited number of simultaneous
  executions. The client-side serial queue and the retry-with-backoff exist precisely to
  absorb this; a guest sees a slightly slower upload, never a lost photo.
- **Payload:** a 1 MB JPEG is ~1.4 MB as base64, comfortably inside what a `doPost` can
  receive. The 8 MB server-side ceiling exists to reject anything pathological.

## Security posture, honestly

This is a wedding album, not a bank. What the design does and does not promise:

- **The time gate is real.** It is enforced server-side against the server's clock.
  Editing client JavaScript or changing a phone's clock does not open it early.
- **The admin key is real.** Hiding is authorised inside Apps Script. It is, however, a
  shared secret sitting in a spreadsheet cell — anyone the couple share the sheet with
  can read it. That is acceptable and intended.
- **Anyone with the QR can upload.** There is no attempt to verify a guest is a guest.
  The instant-hide button is the mitigation, chosen deliberately over an approval queue
  so that photos appear immediately on the night.
- **The random tag is not identity.** It groups one phone's photos. It is trivially
  resettable by clearing site data, and nothing depends on it being honest.

---

## Files

| File | Purpose |
|---|---|
| `share.html` | The standalone guest page |
| `css/share.css` | Its styling, importing `css/tokens.css` for the brand |
| `js/share.js` | Status gate, countdown, upload queue, wall, lightbox, admin |
| `js/lib/imageFit.js` | Pure `fitWithin()` resize math, UMD, no DOM |
| `google-apps-script/photos.gs` | The backend, with setup instructions in its header |
| `tools/make-qr.js` | Generates the QR and a printable table card |
| `test/imageFit.test.js` | `node --test` coverage for the resize math |
| `index.html` | Gains a "Guest Album" nav link |

Styling reuses the existing tokens — ivory paper and its grain, `--forest` /
`--forest-deep`, the antique golds, the serif display face and the J&G monogram — so the
page is unmistakably the same wedding, while loading almost none of the main site's
JavaScript.

## The QR

`npm run qr` writes `media/qr/share-qr.svg` (vector, so it prints at any size) plus a
printable ivory table card carrying the monogram and "Scan to share your photos from
tonight". The URL is a single constant at the top of `tools/make-qr.js`.

Uses the `qrcode` package as a devDependency, consistent with how `playwright` and
`@imgly` are already kept out of the shipped site.

## Testing

- `node --test` — `fitWithin()` across landscape, portrait, square, already-smaller (must
  not upscale), exactly-at-max, and invalid input.
- `node --check` on `js/share.js` and `js/lib/imageFit.js`.
- `npm run shoot -- --url http://localhost:8000/share.html` — headless captures of the
  closed/countdown state, the open/empty state, and the open/populated state, at desktop
  and 390px phone widths, light and dark. `shoot.js` already accepts `--url`, so no
  change is needed to the harness.
- End-to-end against a real deployment before the day: upload from an actual phone,
  confirm the file lands in Drive with the right name, confirm it appears on a second
  device's wall, confirm ✕ removes it from both, confirm `force_open` toggling works from
  the Sheets phone app.

## Setup, once

1. In the RSVP spreadsheet, add a `Config` tab with the four settings above.
2. Create the Drive folder for the photos; copy its ID.
3. Create a **new** standalone Apps Script project, paste `photos.gs`, and fill in the
   `SHEET_ID` and `FOLDER_ID` constants. Set the project timezone to `Asia/Manila`.
4. Deploy → New deployment → Web app, *Execute as: Me*, *Who has access: Anyone*.
5. Paste the `/exec` URL into the `ENDPOINT` constant in `js/share.js`.
6. Set `admin_key` in the Config tab to something only the couple know.
7. Set the site URL in `tools/make-qr.js`, run `npm run qr`, print the card.

## Open items

- **The live URL.** There is no `CNAME` or Pages configuration in the repo, so the
  hosting address is not yet known. `tools/make-qr.js` ships with a placeholder constant
  to fill in. The QR cannot be printed until this is settled.
- **`open_at` is assumed to be 1:00 PM Asia/Manila on 2026-11-11.** It is a config value,
  so this is trivially changed, but that is the default the spec ships with.
