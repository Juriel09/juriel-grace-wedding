# Guest Photo Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests scan a QR at the reception, upload photos from their phones straight into the couple's Google Drive, and watch a shared wall fill up in real time.

**Architecture:** A standalone `share.html` (no film, no frame-scrub, no GSAP/Lenis) talks to a *new, separate* Apps Script web app that reads config from the couple's existing RSVP spreadsheet and writes files to a Drive folder. Photo bytes cross the script exactly once, on upload; every view afterwards is served by Google's own thumbnail CDN. The open/close gate is enforced server-side against the server's clock.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, global-namespace IIFE modules (must work over `file://` too). Google Apps Script (ES5-flavoured JS) for the backend. `node --test` for pure logic. Playwright for headless visual verification. `qrcode` as a devDependency.

**Spec:** `docs/superpowers/specs/2026-08-04-guest-photo-album-design.md` — read it before starting.

## Global Constraints

- **Photos only.** No video, ever. Enforced twice: `accept="image/*"` on the input, and a server-side check that `mime` starts with `image/`.
- **ES5 syntax in `google-apps-script/*.gs`.** `var`, `function`, no arrow functions, no `const`/`let`, no template literals. Apps Script's runtime accepts modern syntax but the existing `rsvp.gs` is written in ES5 and consistency matters more than novelty.
- **Browser JS follows the existing house style:** `(function () { "use strict"; ... })()` IIFE, attaching to `window.W`, no ES modules, no bundler. Match the neighbours on syntax level, which differs by directory: `js/lib/*.js` are modern (`const`, arrows — see `js/lib/storyGeometry.js`), while the page modules `js/*.js` are ES5-flavoured (`var`, `function` — see `js/rsvp.js`). Where a task's plan text contains the code, that code's syntax is authoritative.
- **All POSTs use `Content-Type: text/plain;charset=utf-8`.** This is the only content type an Apps Script web app can accept without triggering a CORS preflight it cannot answer. `js/rsvp.js:169` already relies on this. Do not "fix" it to `application/json`.
- **Brand tokens come from `css/tokens.css`** — `--ivory`, `--ivory-deep`, `--forest`, `--forest-deep`, `--gold`, `--gold-light`, `--gold-deep`, `--gold-foil`, `--ink`, `--ink-soft`, `--paper-grain`, `--serif`, `--sans`. Never hard-code a hex that a token already names.
- **Dark theme must work.** The site defaults to dark (`index.html:9`). `share.html` must run the same anti-FOUC theme script and carry dark styling.
- **Long edge 2400px, JPEG quality 0.85** for resized uploads. Never upscale.
- **Timezone is `Asia/Manila`.** Default `open_at` is `2026-11-11 13:00`.
- **Secrets live in the spreadsheet, not in git.** `admin_key` is a Config cell. `SHEET_ID` / `FOLDER_ID` / `ENDPOINT` ship as clearly-marked empty placeholder constants.

## File Structure

| File | Responsibility |
|---|---|
| `js/lib/imageFit.js` | **Create.** Pure resize math. UMD, no DOM, node-testable. |
| `test/imageFit.test.js` | **Create.** Tests for the above. |
| `google-apps-script/photos.gs` | **Create.** The backend. Pure gate/config helpers at the top (node-testable), Apps Script entry points below. |
| `test/photoGate.test.js` | **Create.** Tests the pure helpers inside `photos.gs`. |
| `share.html` | **Create.** The guest page: markup for all three states. |
| `css/share.css` | **Create.** Its styling, light and dark. |
| `js/shareApi.js` | **Create.** Transport: endpoint calls, server-clock skew, admin key, device tag. |
| `js/shareUpload.js` | **Create.** Resize → base64 → serial upload queue with retry. |
| `js/shareWall.js` | **Create.** The grid, polling, lightbox, admin hide. |
| `js/share.js` | **Create.** Gate/countdown and wiring. Loaded last. |
| `tools/share-preview.js` | **Create.** Dev-only Playwright harness that stubs the API and screenshots each state. Keeps mock code out of the shipped site. |
| `tools/make-qr.js` | **Create.** Generates the QR SVG and a printable table card. |
| `package.json` | **Modify.** Add `qrcode` devDependency and two scripts. |
| `index.html:56-62` | **Modify.** Add a "Guest Album" nav link. |

**Serve the site for any verification step with:** `npx serve -l 8000` (this machine's `python` is only the MS Store stub — do not use `python -m http.server`).

---

### Task 1: Pure resize math

**Files:**
- Create: `js/lib/imageFit.js`
- Test: `test/imageFit.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `W.imageFit.fitWithin(w, h, max) -> { w: number, h: number }`. Integers. Never upscales. Returns `{ w: 0, h: 0 }` for invalid input. Also exported via CommonJS for Node.

- [ ] **Step 1: Write the failing test**

Create `test/imageFit.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/lib/imageFit.js");

test("landscape scales down to the max long edge", () => {
  assert.deepEqual(F.fitWithin(4000, 3000, 2400), { w: 2400, h: 1800 });
});

test("portrait scales down to the max long edge", () => {
  assert.deepEqual(F.fitWithin(3000, 4000, 2400), { w: 1800, h: 2400 });
});

test("square scales down on both edges", () => {
  assert.deepEqual(F.fitWithin(3000, 3000, 2400), { w: 2400, h: 2400 });
});

test("an image already smaller than the max is never upscaled", () => {
  assert.deepEqual(F.fitWithin(1200, 800, 2400), { w: 1200, h: 800 });
});

test("an image exactly at the max is returned untouched", () => {
  assert.deepEqual(F.fitWithin(2400, 1600, 2400), { w: 2400, h: 1600 });
});

test("an extreme panorama keeps at least one pixel of height", () => {
  assert.deepEqual(F.fitWithin(12000, 400, 2400), { w: 2400, h: 80 });
  assert.deepEqual(F.fitWithin(12000, 2, 2400), { w: 2400, h: 1 });
});

test("invalid input yields zeroes rather than NaN", () => {
  assert.deepEqual(F.fitWithin(0, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(-5, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(100, 100, 0), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(NaN, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(undefined, undefined, 2400), { w: 0, h: 0 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/imageFit.test.js`
Expected: FAIL — `Cannot find module '../js/lib/imageFit.js'`

- [ ] **Step 3: Write the implementation**

Create `js/lib/imageFit.js`. The UMD wrapper is copied deliberately from `js/lib/storyGeometry.js:8-12` so both pure modules load identically in the browser and in Node:

```js
/* Pure resize math for guest photo uploads. UMD: browser global (window.W.imageFit)
   and CommonJS (require) for Node tests. No DOM.

   One rule: fit the image inside a square of `max` pixels without ever making it
   bigger than it already was. A guest's 12MP phone photo comes down to something
   that uploads in a couple of seconds on venue wifi; a small photo is left alone. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.W = root.W || {}; root.W.imageFit = api; }
})(typeof self !== "undefined" ? self : this, function () {
  function fitWithin(w, h, max) {
    w = Number(w); h = Number(h); max = Number(max);
    if (!(w > 0) || !(h > 0) || !(max > 0)) return { w: 0, h: 0 };
    const long = Math.max(w, h);
    if (long <= max) return { w: Math.round(w), h: Math.round(h) };
    const k = max / long;
    // a very wide panorama can round its short edge to zero — a canvas of height 0
    // throws, so the floor is one pixel
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  return { fitWithin: fitWithin };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/imageFit.test.js`
Expected: PASS, 7/7.

Then run the whole suite to be sure nothing regressed: `npm test`
Expected: the pre-existing storyGeometry tests still pass alongside these.

- [ ] **Step 5: Commit**

```bash
git add js/lib/imageFit.js test/imageFit.test.js
git commit -m "feat: pure resize math for guest photo uploads"
```

---

### Task 2: The Apps Script backend

**Files:**
- Create: `google-apps-script/photos.gs`
- Test: `test/photoGate.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the HTTP contract every client task depends on —
  - `GET ?action=status[&key=]` → `{ ok, open, admin, opensAt|null, closesAt|null, now }` where the three times are ISO-8601 strings with a `+08:00` offset.
  - `GET ?action=list[&key=]` → `{ ok, now, admin, photos: [{ id, tag, ts }] }`, newest first, `ts` epoch ms.
  - `POST { action:"upload", tag, filename, mime, data, key? }` → `{ ok:true, id, tag, ts }` or `{ ok:false, error }` where error ∈ `closed|type|too_large|rate|server`.
  - `POST { action:"hide", key, id }` → `{ ok:true }` or `{ ok:false, error:"auth" }`.
  - Node-exported pure helpers: `parseConfig(rows)`, `truthy(v)`, `parseWhen(v, offsetMinutes)`, `gateState(cfg, nowMs, offsetMinutes)`.

**Why the pure helpers are separated and tested:** the gate is the one piece that must not be wrong. If it fails open, the album opens before the wedding; if it fails closed on the day, the whole feature is dead at the moment it is needed. It gets tests.

- [ ] **Step 1: Write the failing test**

Create `test/photoGate.test.js`. Requiring a `.gs` file works because it is plain JavaScript and everything at the top level is a declaration — no Apps Script API is touched at load time:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../google-apps-script/photos.gs");

const MNL = 480;                       // Asia/Manila, minutes east of UTC
const at = (s) => Date.parse(s);       // ISO with explicit offset

test("parseConfig lowercases keys, trims, and skips the header row", () => {
  const cfg = P.parseConfig([
    ["Setting", "Value"],
    [" Open_At ", "2026-11-11 13:00"],
    ["FORCE_OPEN", "TRUE"],
    ["", "ignored"],
  ]);
  assert.equal(cfg.open_at, "2026-11-11 13:00");
  assert.equal(cfg.force_open, "TRUE");
  assert.equal(Object.keys(cfg).length, 2);
});

test("truthy accepts the spellings a person actually types", () => {
  for (const v of ["TRUE", "true", " Yes ", "1", true]) assert.equal(P.truthy(v), true, String(v));
  for (const v of ["FALSE", "no", "0", "", null, undefined, false]) assert.equal(P.truthy(v), false, String(v));
});

test("parseWhen reads a bare string as Manila time", () => {
  assert.equal(P.parseWhen("2026-11-11 13:00", MNL), at("2026-11-11T13:00:00+08:00"));
  assert.equal(P.parseWhen("2026-11-11T13:00:00", MNL), at("2026-11-11T13:00:00+08:00"));
});

test("parseWhen passes through Dates and epoch numbers", () => {
  const d = new Date("2026-11-11T05:00:00Z");
  assert.equal(P.parseWhen(d, MNL), d.getTime());
  assert.equal(P.parseWhen(d.getTime(), MNL), d.getTime());
});

test("parseWhen returns null for blank or unparseable values", () => {
  for (const v of ["", "   ", "soon", "11/11/2026", null, undefined, new Date("nope")]) {
    assert.equal(P.parseWhen(v, MNL), null, String(v));
  }
});

test("the gate is shut before open_at and open from the exact minute onward", () => {
  const cfg = { open_at: "2026-11-11 13:00" };
  assert.equal(P.gateState(cfg, at("2026-11-11T12:59:59+08:00"), MNL).open, false);
  assert.equal(P.gateState(cfg, at("2026-11-11T13:00:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2026-11-12T03:00:00+08:00"), MNL).open, true);
});

test("close_at shuts it again; blank close_at never does", () => {
  const cfg = { open_at: "2026-11-11 13:00", close_at: "2026-11-12 06:00" };
  assert.equal(P.gateState(cfg, at("2026-11-12T05:59:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2026-11-12T06:00:00+08:00"), MNL).open, false);
  const never = { open_at: "2026-11-11 13:00", close_at: "" };
  assert.equal(P.gateState(never, at("2027-01-01T00:00:00+08:00"), MNL).open, true);
});

test("force_open overrides both dates", () => {
  const cfg = { open_at: "2026-11-11 13:00", close_at: "2026-11-12 06:00", force_open: "TRUE" };
  assert.equal(P.gateState(cfg, at("2026-08-04T21:00:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2027-01-01T00:00:00+08:00"), MNL).open, true);
});

test("a missing or broken open_at fails SHUT, never open", () => {
  assert.equal(P.gateState({}, Date.now(), MNL).open, false);
  assert.equal(P.gateState({ open_at: "" }, Date.now(), MNL).open, false);
  assert.equal(P.gateState({ open_at: "whenever" }, Date.now(), MNL).open, false);
});

test("gateState reports the parsed times back for the countdown", () => {
  const g = P.gateState({ open_at: "2026-11-11 13:00" }, at("2026-08-04T21:00:00+08:00"), MNL);
  assert.equal(g.opensAt, at("2026-11-11T13:00:00+08:00"));
  assert.equal(g.closesAt, null);
  assert.equal(g.forced, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/photoGate.test.js`
Expected: FAIL — `Cannot find module '../google-apps-script/photos.gs'`

- [ ] **Step 3: Write the implementation**

Create `google-apps-script/photos.gs`. The header comment carries the setup instructions, matching how `google-apps-script/rsvp.gs:1-15` documents itself:

```js
/* Juriel & Grace — guest photo album backend.
 *
 * A SEPARATE Apps Script project from rsvp.gs. Both read the same spreadsheet,
 * but a project may only define one doGet/doPost, and more importantly a bug in
 * photo upload code on the wedding day must not be able to take down the RSVP.
 *
 * The spreadsheet is the control panel. A "Config" tab holds the switches; a
 * "Photos" tab logs every upload and offers a second way to hide one.
 *
 *   Setting     | Value              | Meaning
 *   ------------|--------------------|-------------------------------------------
 *   open_at     | 2026-11-11 13:00   | uploads open at this moment (Asia/Manila)
 *   close_at    |                    | uploads stop; blank means never
 *   force_open  | FALSE              | TRUE overrides both dates — open right now
 *   admin_key   | (a secret string)  | unlocks hiding; always bypasses the gate
 *
 * Setup (once):
 *   1. Add the "Config" tab above to the RSVP spreadsheet; copy the spreadsheet
 *      ID out of its URL into SHEET_ID below.
 *   2. Create the Drive folder for the photos; copy its ID into FOLDER_ID below.
 *   3. New standalone Apps Script project (script.new), paste this file.
 *      Project Settings → Time zone → (GMT+08:00) Manila.
 *   4. Deploy → New deployment → Web app.
 *        Execute as: Me    ·    Who has access: Anyone
 *   5. Paste the /exec URL into ENDPOINT in js/shareApi.js.
 *
 * Redeploy (Deploy → Manage deployments → edit → New version) after editing this
 * code. Editing the spreadsheet never needs a redeploy — config changes take
 * effect within CACHE_SECS.
 */

var SHEET_ID  = "";                    // RSVP spreadsheet ID — see setup step 1
var FOLDER_ID = "";                    // Drive folder for the photos — step 2

var TZ         = "Asia/Manila";
var MAX_BYTES  = 8 * 1024 * 1024;      // decoded; the client sends ~1MB, this is a backstop
var RATE_MAX   = 60;                   // uploads per device tag per rolling hour
var CACHE_SECS = 20;                   // config + folder listing TTL

/* ---------------------------------------------------------------------------
 * Pure helpers. No Apps Script APIs in here, so test/photoGate.test.js can run
 * them under plain Node. The gate is the one thing that must not be wrong.
 * ------------------------------------------------------------------------- */

/* The Config tab as a plain object, keyed by lower-cased setting name. */
function parseConfig(rows) {
  var cfg = {};
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] == null ? "" : rows[i][0]).trim().toLowerCase();
    if (!k || k === "setting") continue;          // header row, blank rows
    cfg[k] = rows[i][1];
  }
  return cfg;
}

/* The spellings a person actually types into a spreadsheet cell. */
function truthy(v) {
  if (v === true) return true;
  var s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

/* A Config time cell -> epoch ms, or null if it is blank or unreadable.
 * The cell may be a real Sheets date, an epoch number (that is how config_()
 * caches Dates, since JSON has no date type), or a bare string like
 * "2026-11-11 13:00" — which carries no zone, so it is read as venue time using
 * offsetMinutes rather than as UTC. */
function parseWhen(v, offsetMinutes) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v == null ? "" : v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return utc - offsetMinutes * 60000;
}

/* Is the album open right now? force_open beats both dates. Anything unreadable
 * fails SHUT — an album that will not open is a phone call; an album that opens
 * itself three months early is not fixable. */
function gateState(cfg, nowMs, offsetMinutes) {
  var opensAt  = parseWhen(cfg.open_at, offsetMinutes);
  var closesAt = parseWhen(cfg.close_at, offsetMinutes);
  var forced   = truthy(cfg.force_open);
  var open = forced || (opensAt !== null && nowMs >= opensAt &&
                        (closesAt === null || nowMs < closesAt));
  return { open: open, opensAt: opensAt, closesAt: closesAt, forced: forced };
}

/* ---------------------------------------------------------------------------
 * Apps Script side.
 * ------------------------------------------------------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The venue's UTC offset in minutes, asked of the runtime rather than hard-coded
 * so the script keeps working if the project timezone is ever changed. */
function offsetMinutes_() {
  var s = Utilities.formatDate(new Date(), TZ, "Z");     // e.g. "+0800"
  var sign = s.charAt(0) === "-" ? -1 : 1;
  return sign * (parseInt(s.substr(1, 2), 10) * 60 + parseInt(s.substr(3, 2), 10));
}

function iso_(ms) {
  if (ms === null || ms === undefined) return null;
  return Utilities.formatDate(new Date(ms), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/* Config, cached. Without the cache a hundred phones polling every 15s would
 * read the spreadsheet several times a second. With it the sheet is read a few
 * times a minute and an edit still lands within CACHE_SECS. */
function config_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("cfg");
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var cfg = sh ? parseConfig(sh.getDataRange().getValues()) : {};
  // Dates do not survive a JSON round-trip as Dates, so flatten them to epoch ms
  // before caching — parseWhen accepts numbers for exactly this reason
  for (var k in cfg) if (cfg[k] instanceof Date) cfg[k] = cfg[k].getTime();
  cache.put("cfg", JSON.stringify(cfg), CACHE_SECS);
  return cfg;
}

function isAdmin_(cfg, key) {
  var want = String(cfg.admin_key == null ? "" : cfg.admin_key).trim();
  return want !== "" && String(key == null ? "" : key) === want;
}

/* File IDs the couple hid by typing TRUE in the Photos tab. The ✕ on the page
 * writes the same cell, so the sheet and Drive never disagree. */
function hiddenSet_() {
  var out = {};
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Photos");
  if (!sh || sh.getLastRow() < 2) return out;
  var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 4).getValues();   // File ID .. Hidden
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][3]).trim().toLowerCase() === "true") out[String(rows[i][0])] = 1;
  }
  return out;
}

/* The wall's contents, cached. getFiles() does not recurse, so anything moved
 * into _hidden/ drops out of the listing for free. */
function list_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("list");
  if (hit) return JSON.parse(hit);

  var hidden = hiddenSet_();
  var it = DriveApp.getFolderById(FOLDER_ID).getFiles();
  var out = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType().indexOf("image/") !== 0) continue;
    var id = f.getId();
    if (hidden[id]) continue;
    var name = f.getName();
    var u = name.indexOf("_");
    out.push({ id: id, tag: u > 0 ? name.substring(0, u) : "", ts: f.getDateCreated().getTime() });
  }
  out.sort(function (a, b) { return b.ts - a.ts; });          // newest first
  cache.put("list", JSON.stringify(out), CACHE_SECS);
  return out;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var cfg = config_();
    var admin = isAdmin_(cfg, p.key);
    var now = Date.now();
    if (p.action === "list") {
      return json_({ ok: true, now: iso_(now), admin: admin, photos: list_() });
    }
    var g = gateState(cfg, now, offsetMinutes_());
    return json_({ ok: true, open: g.open || admin, admin: admin,
                   opensAt: iso_(g.opensAt), closesAt: iso_(g.closesAt), now: iso_(now) });
  } catch (err) {
    return json_({ ok: false, error: "server", detail: String(err) });
  }
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) {}
  try {
    return d.action === "hide" ? hide_(d) : upload_(d);
  } catch (err) {
    return json_({ ok: false, error: "server", detail: String(err) });
  }
}

/* A rolling-hour cap per device tag. Each accepted upload refreshes the window,
 * so this is "60 in any quiet-free hour" rather than a fixed clock hour — close
 * enough for the only thing it defends against, which is a runaway loop. */
function allow_(tag) {
  var cache = CacheService.getScriptCache();
  var k = "rate_" + tag;
  var n = Number(cache.get(k) || 0) + 1;
  if (n > RATE_MAX) return false;
  cache.put(k, String(n), 3600);
  return true;
}

function upload_(d) {
  var cfg = config_();
  var admin = isAdmin_(cfg, d.key);
  if (!gateState(cfg, Date.now(), offsetMinutes_()).open && !admin) {
    return json_({ ok: false, error: "closed" });
  }

  var mime = String(d.mime || "");
  if (mime.indexOf("image/") !== 0) return json_({ ok: false, error: "type" });

  // the tag reaches a filename and a spreadsheet cell, so it is whitelisted, not escaped
  var tag = String(d.tag || "").replace(/[^A-Za-z0-9-]/g, "").substring(0, 24) || "Guest";
  if (!allow_(tag)) return json_({ ok: false, error: "rate" });

  var bytes;
  try { bytes = Utilities.base64Decode(String(d.data || "")); }
  catch (err) { return json_({ ok: false, error: "type" }); }
  if (!bytes || !bytes.length) return json_({ ok: false, error: "type" });
  if (bytes.length > MAX_BYTES) return json_({ ok: false, error: "too_large" });

  var when = new Date();
  var ext = mime === "image/png" ? "png" : "jpg";
  var name = tag + "_" + Utilities.formatDate(when, TZ, "yyyyMMdd-HHmmss") +
             "-" + Math.floor(Math.random() * 1000) + "." + ext;

  var file = DriveApp.getFolderById(FOLDER_ID)
    .createFile(Utilities.newBlob(bytes, mime, name));
  // set on the file, not inherited from the folder, so a thumbnail is guaranteed
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Photos") || ss.insertSheet("Photos");
  if (sh.getLastRow() === 0) sh.appendRow(["Timestamp", "File ID", "Tag", "Filename", "Hidden"]);
  sh.appendRow([when, file.getId(), tag, name, ""]);

  // deliberately NOT invalidating the "list" cache: during a busy reception that
  // would mean listing the folder on every poll. Others see the photo within
  // CACHE_SECS, and the uploader already sees their own copy locally.
  return json_({ ok: true, id: file.getId(), tag: tag, ts: when.getTime() });
}

function hide_(d) {
  var cfg = config_();
  if (!isAdmin_(cfg, d.key)) return json_({ ok: false, error: "auth" });
  var id = String(d.id || "");
  if (!id) return json_({ ok: false, error: "auth" });

  var parent = DriveApp.getFolderById(FOLDER_ID);
  var subs = parent.getFoldersByName("_hidden");
  var hidden = subs.hasNext() ? subs.next() : parent.createFolder("_hidden");

  var file = DriveApp.getFileById(id);
  hidden.addFile(file);
  parent.removeFile(file);                 // moved, never destroyed — undo from Drive

  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Photos");
  if (sh && sh.getLastRow() >= 2) {
    var ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { sh.getRange(i + 2, 5).setValue("TRUE"); break; }
    }
  }

  // hides are rare and must be immediate, so this one DOES drop the cache
  CacheService.getScriptCache().remove("list");
  return json_({ ok: true });
}

/* Lets test/photoGate.test.js require this file under Node. `module` does not
 * exist in the Apps Script runtime, so this is inert there. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseConfig: parseConfig, truthy: truthy, parseWhen: parseWhen, gateState: gateState };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/photoGate.test.js`
Expected: PASS, 10/10.

Run: `npm test`
Expected: everything green — imageFit, photoGate, storyGeometry.

- [ ] **Step 5: Commit**

```bash
git add google-apps-script/photos.gs test/photoGate.test.js
git commit -m "feat: guest photo album backend with a tested open/close gate"
```

---

### Task 3: The page shell and its styling

**Files:**
- Create: `share.html`
- Create: `css/share.css`
- Create: `tools/share-preview.js`
- Modify: `package.json` (add the `preview:share` script)

**Interfaces:**
- Consumes: `css/tokens.css`.
- Produces: the DOM contract every later task binds to, by id —
  `#gate` (closed state), `#gateCountdown`, `#gateOpensAt`, `#album` (open state),
  `#pickBtn`, `#pickInput`, `#queue`, `#wall`, `#wallEmpty`, `#lightbox`, `#lightboxImg`,
  `#lightboxClose`, `#toast`, `#offline`.
  Body classes: exactly one of `is-loading` (initial) → `is-closed` | `is-open` |
  `is-offline`, plus `is-admin` alongside `is-open` when the key checks out.

The three states are all present in the markup; a body class decides which is shown. No templating, no framework.

- [ ] **Step 1: Write `share.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<script>
  /* set the theme before first paint (anti-FOUC) — same contract as index.html */
  (function () {
    try {
      var mode = localStorage.getItem("jg-theme") || "dark";
      document.documentElement.setAttribute("data-theme", mode);
    } catch (e) { document.documentElement.setAttribute("data-theme", "dark"); }
  })();
</script>
<title>Guest Album — Juriel &amp; Grace</title>
<meta name="description" content="Share your photos from Juriel &amp; Grace's wedding." />
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="css/tokens.css" />
<link rel="stylesheet" href="css/share.css" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
</head>
<body class="is-loading">

  <header class="sh-head">
    <a class="sh-mono" href="./" aria-label="Juriel &amp; Grace">
      <img src="media/art/monogram.png" alt="" />
    </a>
  </header>

  <!-- BEFORE 1:00 PM ------------------------------------------------------ -->
  <section id="gate" class="sh-gate" hidden>
    <h1 class="sh-title">The guest album<br />opens soon</h1>
    <p class="sh-sub">Come back at <span id="gateOpensAt">1:00 PM</span> and share
      the night with us.</p>
    <p id="gateCountdown" class="sh-countdown" role="timer" aria-live="off">—</p>
    <p class="sh-fineprint">This page will open by itself — no need to refresh.</p>
  </section>

  <!-- FROM 1:00 PM -------------------------------------------------------- -->
  <section id="album" class="sh-album" hidden>
    <h1 class="sh-title">Share your photos</h1>
    <p class="sh-sub">Everything you send lands straight with us — and appears
      below for everyone.</p>

    <label class="sh-pick" id="pickBtn" tabindex="0" role="button">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" fill="none" stroke="currentColor"
              stroke-width="1.4" stroke-linejoin="round" />
        <circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4" />
      </svg>
      <span>Add photos</span>
      <input id="pickInput" type="file" accept="image/*" multiple />
    </label>
    <p class="sh-fineprint">Photos only, up to 10 at a time.</p>

    <ul id="queue" class="sh-queue" aria-live="polite"></ul>

    <div id="wall" class="sh-wall"></div>
    <p id="wallEmpty" class="sh-empty">No photos yet — be the first.</p>
  </section>

  <!-- NEITHER: the endpoint is unreachable -------------------------------- -->
  <section id="offline" class="sh-gate" hidden>
    <h1 class="sh-title">We can’t reach the album</h1>
    <p class="sh-sub">Check your connection and try again in a moment.</p>
  </section>

  <div id="lightbox" class="sh-lightbox" hidden>
    <button id="lightboxClose" class="sh-lightbox-close" aria-label="Close">&times;</button>
    <img id="lightboxImg" alt="" />
  </div>

  <p id="toast" class="sh-toast" role="status" aria-live="polite"></p>

  <script src="js/lib/imageFit.js"></script>
  <script src="js/shareApi.js"></script>
  <script src="js/shareUpload.js"></script>
  <script src="js/shareWall.js"></script>
  <script src="js/share.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `css/share.css`**

```css
/* Guest photo album — a deliberately small stylesheet. This page is scanned from
   a QR code on venue wifi, so it carries the wedding's brand and almost nothing
   else: no scroll library, no WebGL, no frame sequence. */

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100dvh;
  padding: 0 1.25rem 4rem;
  background: var(--paper-grain), var(--ivory);
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 300;
  -webkit-text-size-adjust: 100%;
}

/* one body class decides which section is on screen */
body.is-loading #gate, body.is-loading #album, body.is-loading #offline { display: none; }
body.is-closed  #gate    { display: block; }
body.is-open    #album   { display: block; }
body.is-offline #offline { display: block; }

.sh-head { display: flex; justify-content: center; padding: 1.75rem 0 0.5rem; }
.sh-mono img { height: 54px; width: auto; display: block; }

.sh-gate, .sh-album { max-width: 940px; margin: 0 auto; text-align: center; }
.sh-gate { padding-top: 12vh; }
.sh-album { padding-top: 2.5rem; }

.sh-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(2rem, 7vw, 3rem);
  line-height: 1.12;
  color: var(--forest-deep);
  margin: 0 0 0.75rem;
}
.sh-sub {
  font-size: 0.98rem; line-height: 1.6; color: var(--ink-soft);
  max-width: 30rem; margin: 0 auto 2rem;
}
.sh-fineprint { font-size: 0.78rem; color: var(--ink-soft); margin: 0.9rem 0 0; opacity: 0.8; }

.sh-countdown {
  font-family: var(--serif);
  font-size: clamp(2.2rem, 9vw, 3.4rem);
  letter-spacing: 0.06em;
  margin: 1.5rem 0 0;
  background: var(--gold-foil);
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  font-variant-numeric: tabular-nums;
}

/* the one thing a guest has to tap */
.sh-pick {
  display: inline-flex; align-items: center; gap: 0.6rem;
  padding: 1rem 2rem;
  border: 1px solid var(--gold);
  border-radius: 999px;
  background: transparent;
  color: var(--forest-deep);
  font-family: var(--sans); font-size: 1.02rem; letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.35s ease, transform 0.35s ease;
}
.sh-pick:hover, .sh-pick:focus-visible { background: rgba(191, 163, 114, 0.12); transform: translateY(-1px); }
.sh-pick svg { width: 22px; height: 22px; }
.sh-pick input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

/* upload progress — one row per photo, never silently disappearing */
.sh-queue { list-style: none; margin: 1.75rem auto 0; padding: 0; max-width: 26rem; text-align: left; }
.sh-queue li {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.5rem 0; font-size: 0.86rem; color: var(--ink-soft);
  border-bottom: 1px solid rgba(122, 116, 102, 0.15);
}
.sh-queue img { width: 38px; height: 38px; object-fit: cover; border-radius: 4px; flex: none; }
.sh-queue .sh-qname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-queue .sh-qstate { flex: none; font-size: 0.78rem; letter-spacing: 0.05em; }
.sh-queue li.is-done .sh-qstate { color: var(--olive); }
.sh-queue li.is-failed .sh-qstate { color: #b4574b; }
.sh-qretry {
  border: 1px solid var(--gold); background: none; color: var(--gold-deep);
  border-radius: 999px; font-size: 0.72rem; padding: 0.2rem 0.7rem; cursor: pointer;
}

/* the wall — the same masonry idea as the main gallery */
.sh-wall { columns: 190px; column-gap: 0.6rem; margin-top: 3rem; width: 100%; }
@media (max-width: 720px) { .sh-wall { columns: 140px; } }
.sh-tile {
  position: relative; break-inside: avoid; margin-bottom: 0.6rem;
  border-radius: 6px; overflow: hidden;
  background: var(--ivory-deep);
  box-shadow: 0 2px 12px rgba(60, 79, 67, 0.1);
  animation: shFade 0.6s ease both;
}
@keyframes shFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sh-tile img { display: block; width: 100%; height: auto; cursor: zoom-in; }
.sh-tile.is-broken { aspect-ratio: 3 / 4; }
.sh-empty { color: var(--ink-soft); font-size: 0.88rem; margin-top: 2.5rem; }
.sh-wall:not(:empty) + .sh-empty { display: none; }

/* admin ✕ — only ever rendered when the key checks out server-side */
.sh-hide {
  position: absolute; top: 6px; right: 6px;
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(20, 26, 20, 0.62); color: #fff;
  font-size: 15px; line-height: 1; cursor: pointer;
  display: none;
}
body.is-admin .sh-hide { display: block; }

.sh-lightbox {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(16, 20, 16, 0.93);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.sh-lightbox[hidden] { display: none; }
.sh-lightbox img { max-width: 100%; max-height: 100%; border-radius: 4px; }
.sh-lightbox-close {
  position: absolute; top: 1rem; right: 1.25rem;
  background: none; border: none; color: var(--ivory);
  font-size: 2.2rem; line-height: 1; cursor: pointer;
}

.sh-toast {
  position: fixed; left: 50%; bottom: 1.5rem; transform: translate(-50%, 1rem);
  margin: 0; padding: 0.7rem 1.2rem; border-radius: 999px;
  background: var(--forest-deep); color: var(--ivory);
  font-size: 0.85rem; opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s ease;
  max-width: calc(100vw - 2rem);
}
.sh-toast.is-on { opacity: 1; transform: translate(-50%, 0); }

/* ---- dark, which is this site's default theme ---- */
:root[data-theme="dark"] body { background: var(--paper-grain), #0d110b; color: #d8ddd2; }
:root[data-theme="dark"] .sh-title { color: #e6ede0; }
:root[data-theme="dark"] .sh-sub,
:root[data-theme="dark"] .sh-fineprint,
:root[data-theme="dark"] .sh-empty { color: #9aa694; }
:root[data-theme="dark"] .sh-mono img { filter: brightness(1.5) saturate(0.85); }
:root[data-theme="dark"] .sh-pick { color: var(--gold-light); border-color: var(--gold-light); }
:root[data-theme="dark"] .sh-pick:hover { background: rgba(219, 198, 156, 0.12); }
:root[data-theme="dark"] .sh-tile { background: #161c15; box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45); }
:root[data-theme="dark"] .sh-queue li { border-bottom-color: rgba(154, 166, 148, 0.18); }
:root[data-theme="dark"] .sh-toast { background: #e6ede0; color: #1a221a; }

@media (prefers-reduced-motion: reduce) {
  .sh-tile { animation: none; }
  .sh-pick { transition: none; }
}
```

- [ ] **Step 3: Write the preview harness**

The real endpoint does not exist yet, and mock code must not ship to guests. `tools/share-preview.js` stubs the API from outside the page, via Playwright's `addInitScript`, so `js/` stays clean:

Create `tools/share-preview.js`:

```js
/* Dev-only: screenshot share.html in each of its states with a stubbed backend,
   so the page can be verified before the Apps Script deployment exists. The stub
   is injected from OUTSIDE the page — no mock code ships to guests.
   Usage:  npx serve -l 8000    then    npm run preview:share
   PNGs land in shots/ (gitignored). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:8000/share.html";
const OUT = path.resolve("shots");

// a handful of real, public, link-shared Drive image IDs would be ideal; absent
// those, the tiles deliberately fail to load and exercise the broken-tile path.
const PHOTOS = Array.from({ length: 9 }, (_, i) => ({
  id: "fake-" + i, tag: "Guest-40" + i, ts: Date.now() - i * 60000,
}));

function stub(state) {
  return `(function () {
    window.__SHARE_STUB__ = ${JSON.stringify(state)};
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      var s = window.__SHARE_STUB__;
      var body = {};
      if (String(url).indexOf("action=list") > -1) {
        body = { ok: true, now: s.now, admin: s.admin, photos: s.photos };
      } else if (String(url).indexOf("action=status") > -1) {
        body = { ok: true, open: s.open, admin: s.admin, opensAt: s.opensAt,
                 closesAt: null, now: s.now };
      } else {
        body = { ok: true, id: "fake-new", tag: "Guest-4000", ts: Date.now() };
      }
      return Promise.resolve({ json: function () { return Promise.resolve(body); } });
    };
  })();`;
}

const STATES = {
  closed: { open: false, admin: false, photos: [], now: "2026-11-11T12:58:30+08:00", opensAt: "2026-11-11T13:00:00+08:00" },
  empty:  { open: true,  admin: false, photos: [], now: "2026-11-11T13:05:00+08:00", opensAt: "2026-11-11T13:00:00+08:00" },
  full:   { open: true,  admin: false, photos: PHOTOS, now: "2026-11-11T19:05:00+08:00", opensAt: "2026-11-11T13:00:00+08:00" },
  admin:  { open: true,  admin: true,  photos: PHOTOS, now: "2026-11-11T19:05:00+08:00", opensAt: "2026-11-11T13:00:00+08:00" },
};

const VIEWS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [state, data] of Object.entries(STATES)) {
    for (const view of VIEWS) {
      for (const theme of ["dark", "light"]) {
        const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
        await page.addInitScript(stub(data));
        await page.addInitScript(`try { localStorage.setItem("jg-theme", ${JSON.stringify(theme)}); } catch (e) {}`);
        const errors = [];
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(BASE + (state === "admin" ? "?key=test" : ""), { waitUntil: "load" });
        await page.waitForTimeout(800);
        const file = path.join(OUT, `share-${state}-${view.name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(file, errors.length ? "CONSOLE ERRORS: " + errors.join(" | ") : "ok");
        await page.close();
      }
    }
  }
  await browser.close();
})();
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add to `scripts`:

```json
"preview:share": "node tools/share-preview.js"
```

- [ ] **Step 5: Verify the shell renders**

At this point `js/shareApi.js` and friends do not exist, so the page will 404 on those scripts and stay in `is-loading`. Confirm the *shell* is correct instead:

```bash
npx serve -l 8000 &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/share.html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/css/share.css
```
Expected: `200` for both.

Then temporarily force each state to eyeball it, in a browser or via a one-off Playwright snippet: set `document.body.className = "is-closed"`, then `"is-open"`, then `"is-open is-admin"`. Confirm the monogram, the serif title, the gold countdown, and the pick button all render on ivory, and that dark theme is legible.

- [ ] **Step 6: Commit**

```bash
git add share.html css/share.css tools/share-preview.js package.json
git commit -m "feat: guest album page shell, styling, and a stubbed preview harness"
```

---

### Task 4: Transport, the device tag, and the countdown gate

**Files:**
- Create: `js/shareApi.js`
- Create: `js/share.js`

**Interfaces:**
- Consumes: the HTTP contract from Task 2; the DOM ids from Task 3.
- Produces:
  - `W.shareApi.configured() -> boolean`
  - `W.shareApi.hasKey() -> boolean`
  - `W.shareApi.tag() -> string` — this device's persisted `Guest-NNNN`
  - `W.shareApi.now() -> number` — epoch ms **corrected to the server's clock**
  - `W.shareApi.status() -> Promise<{ ok, open, admin, opensAt, closesAt, now }>`
  - `W.shareApi.list() -> Promise<{ ok, photos, admin, now }>`
  - `W.shareApi.upload({ tag, filename, mime, data }) -> Promise<{ ok, id, tag, ts } | { ok:false, error }>`
  - `W.shareApi.hide(id) -> Promise<{ ok } | { ok:false, error }>`
  - `W.share.toast(msg)` — the bottom pill, used by later tasks.

- [ ] **Step 1: Write `js/shareApi.js`**

```js
/* Transport for the guest album. One place that knows the endpoint, the admin
   key, and what time the server thinks it is.

   Everything POSTs as text/plain JSON — the only content type an Apps Script web
   app can accept without a CORS preflight it cannot answer. js/rsvp.js does the
   same; do not "fix" it to application/json. */
(function () {
  "use strict";
  window.W = window.W || {};

  // Paste the photos Apps Script Web app URL here (Deploy → Web app → /exec).
  var ENDPOINT = "";

  var KEY = "";
  try { KEY = new URLSearchParams(location.search).get("key") || ""; } catch (e) {}

  // the difference between the server's clock and this phone's. Every gate
  // decision and the countdown read through this, so a wrong device clock
  // cannot open the album early or make it look shut when it is open.
  var skew = 0;

  function absorb(d) {
    if (d && d.now) {
      var t = Date.parse(d.now);
      if (!isNaN(t)) skew = t - Date.now();
    }
    return d;
  }

  function get(action) {
    if (!ENDPOINT) return Promise.reject(new Error("no endpoint"));
    var u = ENDPOINT + "?action=" + action + (KEY ? "&key=" + encodeURIComponent(KEY) : "");
    return fetch(u).then(function (r) { return r.json(); }).then(absorb);
  }

  function post(body) {
    if (!ENDPOINT) return Promise.reject(new Error("no endpoint"));
    if (KEY) body.key = KEY;
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* This device's tag. Nobody types a name — the tag exists so one phone's
     photos group together in the Drive folder, and it is never shown on the
     wall. Losing it (cleared storage) costs nothing. */
  function tag() {
    var t = "";
    try { t = localStorage.getItem("jg-guest-tag") || ""; } catch (e) {}
    if (!/^Guest-\d{4}$/.test(t)) {
      t = "Guest-" + String(1000 + Math.floor(Math.random() * 9000));
      try { localStorage.setItem("jg-guest-tag", t); } catch (e) {}
    }
    return t;
  }

  window.W.shareApi = {
    configured: function () { return !!ENDPOINT; },
    hasKey: function () { return !!KEY; },
    tag: tag,
    now: function () { return Date.now() + skew; },
    status: function () { return get("status"); },
    list: function () { return get("list"); },
    upload: function (p) {
      return post({ action: "upload", tag: p.tag, filename: p.filename, mime: p.mime, data: p.data });
    },
    hide: function (id) { return post({ action: "hide", id: id }); }
  };
})();
```

- [ ] **Step 2: Write `js/share.js` (gate, countdown, wiring)**

```js
/* The guest album's conductor: ask the server whether the album is open, show
   either the countdown or the album, and hand the rest to shareUpload/shareWall.

   The gate here is cosmetic. The real one is in photos.gs — this page cannot
   open the album by lying to itself, it can only fail to display it. */
(function () {
  "use strict";
  window.W = window.W || {};

  var api = window.W.shareApi;
  var body = document.body;
  var toastEl = document.getElementById("toast");
  var toastTimer = 0;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 3200);
  }

  function setState(name) {
    body.classList.remove("is-loading", "is-closed", "is-open", "is-offline");
    body.classList.add(name);
  }

  var opensAtMs = null;
  var countdownTimer = 0;
  var recheckTimer = 0;

  function two(n) { return (n < 10 ? "0" : "") + n; }

  /* days only appear once they matter; the closer it gets the more precise it
     reads, so at 12:58 a guest sees seconds ticking rather than "0 days". */
  function human(ms) {
    if (ms <= 0) return "any moment now";
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + (d === 1 ? " day " : " days ") + h + "h";
    return two(h) + ":" + two(m) + ":" + two(sec);
  }

  function tickCountdown() {
    var el = document.getElementById("gateCountdown");
    if (!el || opensAtMs === null) return;
    el.textContent = human(opensAtMs - api.now());
  }

  function showGate(st) {
    opensAtMs = st.opensAt ? Date.parse(st.opensAt) : null;
    var when = document.getElementById("gateOpensAt");
    if (when && opensAtMs !== null && !isNaN(opensAtMs)) {
      when.textContent = new Date(opensAtMs).toLocaleString(undefined, {
        weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
      });
    }
    setState("is-closed");
    tickCountdown();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdown, 1000);
    // it opens itself: a guest who scans at 12:58 never has to refresh
    clearInterval(recheckTimer);
    recheckTimer = setInterval(check, 60000);
  }

  function showAlbum(st) {
    clearInterval(countdownTimer);
    clearInterval(recheckTimer);
    if (st.admin) body.classList.add("is-admin");
    setState("is-open");
    window.W.shareUpload.init({ toast: toast, onUploaded: window.W.shareWall.addLocal });
    window.W.shareWall.init({ admin: !!st.admin, toast: toast });
  }

  function check() {
    if (!api.configured()) { setState("is-offline"); return; }
    api.status().then(function (st) {
      if (!st || !st.ok) { setState("is-offline"); return; }
      if (st.open) showAlbum(st);
      else showGate(st);
    }).catch(function () {
      // only fall back to the offline card if nothing is on screen yet; a failed
      // re-check while the countdown is up should just be ignored and retried
      if (body.classList.contains("is-loading")) setState("is-offline");
    });
  }

  window.W.share = { toast: toast };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
})();
```

- [ ] **Step 3: Verify the closed state**

`js/shareUpload.js` and `js/shareWall.js` do not exist yet, so only the **closed** path can run end to end. That is the point of testing it first.

```bash
npx serve -l 8000 &
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(\`window.fetch = function () {
    return Promise.resolve({ json: function () { return Promise.resolve({
      ok: true, open: false, admin: false,
      opensAt: '2026-11-11T13:00:00+08:00', closesAt: null,
      now: '2026-11-11T12:58:30+08:00' }); } });
  };\`);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8000/share.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  console.log('body class :', await p.evaluate(() => document.body.className));
  console.log('countdown  :', await p.textContent('#gateCountdown'));
  console.log('opens at   :', await p.textContent('#gateOpensAt'));
  console.log('errors     :', errs);
  await p.screenshot({ path: 'shots/share-gate.png', fullPage: true });
  await b.close();
})();
"
```

Expected:
- `body class : is-closed`
- `countdown` reads roughly `00:01:2x` and **counts down** across the 2.5s wait (run twice and compare if unsure)
- `opens at` shows a formatted date, not the literal `1:00 PM` placeholder
- `errors : []`

**The critical check:** the countdown must come from the *stubbed server* time (12:58:30 on the wedding day), not the machine's real clock. If it shows months instead of seconds, the skew correction is broken.

- [ ] **Step 4: Verify it opens itself**

Re-run the snippet with `open: true` in the stub and confirm `body class` becomes `is-open`. It will log errors about `W.shareUpload` being undefined — that is expected until Task 5, and confirms the branch was taken.

- [ ] **Step 5: Commit**

```bash
git add js/shareApi.js js/share.js
git commit -m "feat: album transport, device tag, and the server-clock countdown gate"
```

---

### Task 5: The upload pipeline

**Files:**
- Create: `js/shareUpload.js`

**Interfaces:**
- Consumes: `W.imageFit.fitWithin` (Task 1); `W.shareApi.upload`, `W.shareApi.tag` (Task 4); `#pickBtn`, `#pickInput`, `#queue` (Task 3).
- Produces: `W.shareUpload.init({ toast, onUploaded })`, where `onUploaded(id, previewUrl)` is called once per successfully stored photo so the wall can show it immediately.

- [ ] **Step 1: Write `js/shareUpload.js`**

```js
/* Turning a phone photo into something a wedding guest can actually send.

   Each file is redrawn at long-edge 2400px and re-encoded as JPEG — usually
   under a megabyte, still sharp enough to print, and iPhone HEIC comes out the
   other side as something Windows can open. Then they go up ONE AT A TIME: a
   hundred phones hitting one Apps Script deployment will occasionally be
   refused, and a serial queue with retries turns that into a slower upload
   rather than a lost photo. Nothing ever fails silently. */
(function () {
  "use strict";
  window.W = window.W || {};

  var MAX_EDGE = 2400;
  var QUALITY = 0.85;
  var MAX_BATCH = 10;
  var RETRIES = 2;

  var api = window.W.shareApi;
  var queueEl, hooks = {}, pending = [], running = false, uid = 0;

  var MESSAGES = {
    closed: "the album isn’t open yet",
    type: "photos only, please",
    too_large: "that photo is too large",
    rate: "give us a moment, then try again",
    server: "something went wrong"
  };

  function shrink(file) {
    return createImageBitmap(file).then(function (bmp) {
      var fit = window.W.imageFit.fitWithin(bmp.width, bmp.height, MAX_EDGE);
      if (!fit.w) throw new Error("bad image");
      var c = document.createElement("canvas");
      c.width = fit.w; c.height = fit.h;
      c.getContext("2d").drawImage(bmp, 0, 0, fit.w, fit.h);
      if (bmp.close) bmp.close();
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error("encode")); }, "image/jpeg", QUALITY);
      });
    });
  }

  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var comma = s.indexOf(",");
        comma > -1 ? res(s.substring(comma + 1)) : rej(new Error("read"));
      };
      fr.onerror = function () { rej(new Error("read")); };
      fr.readAsDataURL(blob);
    });
  }

  function row(item) {
    var li = document.createElement("li");
    li.id = "q" + item.id;
    var img = document.createElement("img");
    img.src = item.preview; img.alt = "";
    var name = document.createElement("span");
    name.className = "sh-qname";
    name.textContent = item.file.name || "photo";
    var state = document.createElement("span");
    state.className = "sh-qstate";
    state.textContent = "waiting";
    li.appendChild(img); li.appendChild(name); li.appendChild(state);
    queueEl.appendChild(li);
    return li;
  }

  function mark(item, cls, text) {
    var li = document.getElementById("q" + item.id);
    if (!li) return;
    li.classList.remove("is-done", "is-failed");
    if (cls) li.classList.add(cls);
    li.querySelector(".sh-qstate").textContent = text;
  }

  function offerRetry(item) {
    var li = document.getElementById("q" + item.id);
    if (!li || li.querySelector(".sh-qretry")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sh-qretry";
    b.textContent = "try again";
    b.addEventListener("click", function () {
      b.remove();
      item.attempt = 0;
      mark(item, null, "waiting");
      pending.push(item);
      pump();
    });
    li.appendChild(b);
  }

  function send(item) {
    mark(item, null, "sending…");
    return shrink(item.file)
      .then(toBase64)
      .then(function (b64) {
        return api.upload({
          tag: api.tag(),
          filename: item.file.name || "photo.jpg",
          mime: "image/jpeg",
          data: b64
        });
      })
      .then(function (res) {
        if (res && res.ok) {
          mark(item, "is-done", "sent ✓");
          if (hooks.onUploaded) hooks.onUploaded(res.id, item.preview);
          return;
        }
        var err = (res && res.error) || "server";
        // a rejection the server will keep making is not worth retrying
        if (err === "closed" || err === "type" || err === "too_large") {
          mark(item, "is-failed", MESSAGES[err]);
          if (hooks.toast) hooks.toast(MESSAGES[err]);
          return;
        }
        throw new Error(err);
      })
      .catch(function (e) {
        if (item.attempt < RETRIES) {
          item.attempt++;
          mark(item, null, "retrying…");
          return new Promise(function (r) { setTimeout(r, 900 * item.attempt); })
            .then(function () { return send(item); });
        }
        mark(item, "is-failed", "didn’t send");
        offerRetry(item);
        if (hooks.toast) hooks.toast(MESSAGES[String(e.message)] || "some photos didn’t send");
      });
  }

  function pump() {
    if (running) return;
    var item = pending.shift();
    if (!item) return;
    running = true;
    send(item).then(function () { running = false; pump(); });
  }

  function accept(files) {
    var list = [], i;
    for (i = 0; i < files.length; i++) {
      if (String(files[i].type || "").indexOf("image/") === 0) list.push(files[i]);
    }
    if (list.length < files.length && hooks.toast) hooks.toast("photos only, please");
    if (!list.length) return;
    if (list.length > MAX_BATCH) {
      list = list.slice(0, MAX_BATCH);
      if (hooks.toast) hooks.toast("sending the first " + MAX_BATCH + " — add the rest after");
    }
    list.forEach(function (f) {
      var item = { id: ++uid, file: f, attempt: 0, preview: URL.createObjectURL(f) };
      row(item);
      pending.push(item);
    });
    pump();
  }

  function init(opts) {
    hooks = opts || {};
    queueEl = document.getElementById("queue");
    var input = document.getElementById("pickInput");
    var btn = document.getElementById("pickBtn");
    if (!input || !queueEl) return;

    input.addEventListener("change", function () {
      accept(input.files || []);
      input.value = "";                  // so picking the same photo twice still fires
    });
    // the label already opens the picker on click; this is only for keyboard users
    if (btn) {
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
      });
    }
  }

  window.W.shareUpload = { init: init };
})();
```

- [ ] **Step 2: Verify the resize and the queue**

```bash
npx serve -l 8000 &
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(\`
    window.__sent = [];
    window.fetch = function (url, opts) {
      if (opts && opts.method === 'POST') {
        window.__sent.push(JSON.parse(opts.body));
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, id: 'x' + window.__sent.length, ts: Date.now() }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, open: true, admin: false,
        opensAt: '2026-11-11T13:00:00+08:00', now: '2026-11-11T19:00:00+08:00', photos: [] }) });
    };\`);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8000/share.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  // a synthetic 4000x3000 JPEG, larger than MAX_EDGE on both axes
  const buf = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const g = c.getContext('2d'); g.fillStyle = '#576f61'; g.fillRect(0, 0, 4000, 3000);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await p.setInputFiles('#pickInput', { name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buf) });
  await p.waitForTimeout(3000);
  const sent = await p.evaluate(() => window.__sent);
  console.log('posts        :', sent.length);
  console.log('action/mime  :', sent[0] && sent[0].action, sent[0] && sent[0].mime);
  console.log('tag          :', sent[0] && sent[0].tag);
  console.log('base64 KB    :', sent[0] ? Math.round(sent[0].data.length * 0.75 / 1024) : 0);
  console.log('queue text   :', await p.textContent('#queue'));
  console.log('errors       :', errs);
  await b.close();
})();
"
```

Expected:
- `posts : 1`
- `action/mime : upload image/jpeg` — **`image/jpeg`, never the original type**
- `tag` matches `Guest-\d{4}`
- `base64 KB` is a few hundred at most. A 4000×3000 original would be far larger; if this number is in the megabytes, the resize did not happen.
- `queue text` contains `sent ✓`
- `errors : []`

- [ ] **Step 3: Verify a video is refused and a failure is visible**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(\`
    window.__posts = 0;
    window.fetch = function (url, opts) {
      if (opts && opts.method === 'POST') { window.__posts++;
        return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: 'server' }) }); }
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, open: true, admin: false,
        opensAt: '2026-11-11T13:00:00+08:00', now: '2026-11-11T19:00:00+08:00', photos: [] }) });
    };\`);
  await p.goto('http://localhost:8000/share.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.setInputFiles('#pickInput', { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0,0,0,24]) });
  await p.waitForTimeout(1200);
  console.log('posts after video :', await p.evaluate(() => window.__posts));
  console.log('toast             :', await p.textContent('#toast'));
  await b.close();
})();
"
```

Expected: `posts after video : 0` and a toast reading `photos only, please`. A video must never reach the network.

- [ ] **Step 4: Commit**

```bash
git add js/shareUpload.js
git commit -m "feat: browser-side photo resize and a serial upload queue with retry"
```

---

### Task 6: The wall

**Files:**
- Create: `js/shareWall.js`

**Interfaces:**
- Consumes: `W.shareApi.list` (Task 4); `#wall`, `#wallEmpty`, `#lightbox`, `#lightboxImg`, `#lightboxClose` (Task 3).
- Produces:
  - `W.shareWall.init({ admin, toast })`
  - `W.shareWall.addLocal(id, previewUrl)` — shows a just-uploaded photo instantly, before Drive has generated a thumbnail. Called by `shareUpload`'s `onUploaded` hook.

- [ ] **Step 1: Write `js/shareWall.js`**

```js
/* The wall: everyone's photos, growing through the reception.

   Tiles come straight from Google's thumbnail service, so no photo byte passes
   through the Apps Script deployment after the upload itself — the wall costs
   the backend nothing no matter how many guests are watching it. */
(function () {
  "use strict";
  window.W = window.W || {};

  var POLL_MS = 15000;
  var THUMB = "https://drive.google.com/thumbnail?id=";

  var api = window.W.shareApi;
  var wall, lightbox, lightboxImg;
  var seen = {};                 // file id -> tile element, so nothing renders twice
  var opts = {};
  var timer = 0;

  function thumbUrl(id, w) { return THUMB + encodeURIComponent(id) + "&sz=w" + w; }

  function openLightbox(src) {
    if (!lightbox) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.documentElement.style.overflow = "hidden";
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
    document.documentElement.style.overflow = "";
  }

  function tile(id, src, fullSrc) {
    var d = document.createElement("div");
    d.className = "sh-tile";
    d.setAttribute("data-id", id);

    var img = document.createElement("img");
    img.alt = "A guest's photo";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    // Drive can take a few seconds to generate a thumbnail and occasionally rate-
    // limits. One retry, then a soft placeholder — never a broken-image icon.
    img.addEventListener("error", function () {
      if (d.getAttribute("data-retried")) { d.classList.add("is-broken"); img.remove(); return; }
      d.setAttribute("data-retried", "1");
      setTimeout(function () { img.src = src + "&r=" + Date.now(); }, 2500);
    });
    img.addEventListener("click", function () { openLightbox(fullSrc); });
    d.appendChild(img);

    var x = document.createElement("button");
    x.type = "button";
    x.className = "sh-hide";
    x.setAttribute("aria-label", "Hide this photo");
    x.innerHTML = "&times;";
    x.addEventListener("click", function () { hide(id, d); });
    d.appendChild(x);

    return d;
  }

  function hide(id, el) {
    if (!window.confirm("Hide this photo from the album?")) return;
    api.hide(id).then(function (res) {
      if (res && res.ok) {
        el.remove();
        delete seen[id];
        if (opts.toast) opts.toast("hidden");
      } else if (opts.toast) {
        opts.toast("couldn’t hide that one");
      }
    }).catch(function () { if (opts.toast) opts.toast("couldn’t hide that one"); });
  }

  /* Newest first, so new arrivals go to the top. */
  function place(id, src, fullSrc) {
    if (seen[id]) return;
    var el = tile(id, src, fullSrc);
    seen[id] = el;
    wall.insertBefore(el, wall.firstChild);
  }

  /* The uploader's own photo, from the local file, the moment the POST returns.
     Drive may not have a thumbnail for seconds and nobody should sit staring at
     a gap wondering whether it worked. The poll later recognises the id in
     `seen` and leaves this tile alone. */
  function addLocal(id, previewUrl) {
    if (!wall || seen[id]) return;
    place(id, previewUrl, previewUrl);
  }

  function poll() {
    api.list().then(function (d) {
      if (!d || !d.ok || !d.photos) return;
      // oldest first on insert, because place() prepends — the result is newest-first
      for (var i = d.photos.length - 1; i >= 0; i--) {
        var p = d.photos[i];
        place(p.id, thumbUrl(p.id, 600), thumbUrl(p.id, 1600));
      }
    }).catch(function () { /* one dropped poll is not worth telling a guest about */ });
  }

  function schedule() {
    clearInterval(timer);
    // polling a hidden tab wastes a guest's battery and the script's quota
    if (document.hidden) return;
    timer = setInterval(poll, POLL_MS);
  }

  function init(o) {
    opts = o || {};
    wall = document.getElementById("wall");
    lightbox = document.getElementById("lightbox");
    lightboxImg = document.getElementById("lightboxImg");
    if (!wall) return;

    var close = document.getElementById("lightboxClose");
    if (close) close.addEventListener("click", closeLightbox);
    if (lightbox) {
      lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) poll();
      schedule();
    });

    poll();
    schedule();
  }

  window.W.shareWall = { init: init, addLocal: addLocal };
})();
```

- [ ] **Step 2: Verify tiles, dedupe, and the lightbox**

```bash
npx serve -l 8000 &
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(\`
    window.__lists = 0;
    var PHOTOS = [];
    for (var i = 0; i < 6; i++) PHOTOS.push({ id: 'p' + i, tag: 'Guest-400' + i, ts: Date.now() - i * 1000 });
    window.fetch = function (url, opts) {
      if (String(url).indexOf('action=list') > -1) { window.__lists++;
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, admin: false,
          now: '2026-11-11T19:00:00+08:00', photos: PHOTOS }) }); }
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, open: true, admin: false,
        opensAt: '2026-11-11T13:00:00+08:00', now: '2026-11-11T19:00:00+08:00' }) });
    };\`);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8000/share.html', { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  console.log('tiles        :', await p.locator('#wall .sh-tile').count());
  console.log('newest first :', await p.evaluate(() => document.querySelector('#wall .sh-tile').dataset.id));
  console.log('first img src:', await p.evaluate(() => document.querySelector('#wall img').src));
  // a second poll must not duplicate anything
  await p.evaluate(() => window.W.shareWall.init({ admin: false, toast: function () {} }));
  await p.waitForTimeout(800);
  console.log('after repoll :', await p.locator('#wall .sh-tile').count());
  console.log('x visible    :', await p.evaluate(() => getComputedStyle(document.querySelector('.sh-hide')).display));
  await p.evaluate(() => document.querySelector('#wall img').click());
  await p.waitForTimeout(300);
  console.log('lightbox open:', await p.evaluate(() => !document.getElementById('lightbox').hidden));
  console.log('lightbox src :', await p.evaluate(() => document.getElementById('lightboxImg').src));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  console.log('after Escape :', await p.evaluate(() => document.getElementById('lightbox').hidden));
  console.log('errors       :', errs);
  await b.close();
})();
"
```

Expected:
- `tiles : 6`
- `newest first : p0` (the largest `ts`)
- `first img src` contains `drive.google.com/thumbnail?id=p0&sz=w600`
- `after repoll : 6` — **not 12.** Deduping by id is what keeps the wall from doubling every 15 seconds.
- `x visible : none` — no admin key, so the hide button must not be reachable
- `lightbox open : true`, `lightbox src` contains `sz=w1600`
- `after Escape : true`
- `errors : []`

- [ ] **Step 3: Verify a locally-added photo appears and is not duplicated by the poll**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(\`
    window.__photos = [];
    window.fetch = function (url, opts) {
      if (String(url).indexOf('action=list') > -1)
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, admin: false,
          now: '2026-11-11T19:00:00+08:00', photos: window.__photos }) });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, open: true, admin: false,
        opensAt: '2026-11-11T13:00:00+08:00', now: '2026-11-11T19:00:00+08:00' }) });
    };\`);
  await p.goto('http://localhost:8000/share.html', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  await p.evaluate(() => window.W.shareWall.addLocal('mine', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='));
  console.log('after local  :', await p.locator('#wall .sh-tile').count());
  // now the server reports the same photo back
  await p.evaluate(() => { window.__photos = [{ id: 'mine', tag: 'Guest-4000', ts: Date.now() }]; });
  await p.evaluate(() => window.W.shareWall.init({ admin: false, toast: function () {} }));
  await p.waitForTimeout(800);
  console.log('after poll   :', await p.locator('#wall .sh-tile').count());
  await b.close();
})();
"
```

Expected: `after local : 1` and `after poll : 1`. If the second number is 2, the local preview and the server's copy are not being recognised as the same photo.

- [ ] **Step 4: Commit**

```bash
git add js/shareWall.js
git commit -m "feat: the live guest wall with polling, dedupe, and a lightbox"
```

---

### Task 7: Admin hide, end to end

**Files:**
- Modify: `js/shareWall.js` (only if Step 1 finds a gap — the ✕ was built in Task 6)
- Test: verification only

This task exists because the hide path crosses every layer — URL key → `shareApi` → `photos.gs` → Drive → the sheet → the next poll — and a reviewer should be able to accept or reject it independently of the wall itself.

- [ ] **Step 1: Verify admin mode from the URL key**

```bash
npx serve -l 8000 &
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(\`
    window.__hidden = [];
    window.__urls = [];
    var PHOTOS = [{ id: 'p1', tag: 'Guest-4001', ts: Date.now() }];
    window.confirm = function () { return true; };
    window.fetch = function (url, opts) {
      window.__urls.push(String(url));
      if (opts && opts.method === 'POST') {
        var body = JSON.parse(opts.body);
        if (body.action === 'hide') { window.__hidden.push(body); 
          return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); }
      }
      if (String(url).indexOf('action=list') > -1)
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, admin: true,
          now: '2026-11-11T19:00:00+08:00', photos: PHOTOS }) });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, open: true, admin: true,
        opensAt: '2026-11-11T13:00:00+08:00', now: '2026-11-11T19:00:00+08:00' }) });
    };\`);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8000/share.html?key=s3cret', { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  console.log('body class   :', await p.evaluate(() => document.body.className));
  console.log('x visible    :', await p.evaluate(() => getComputedStyle(document.querySelector('.sh-hide')).display));
  console.log('key on GET   :', await p.evaluate(() => window.__urls.some(u => u.indexOf('key=s3cret') > -1)));
  await p.click('.sh-hide');
  await p.waitForTimeout(600);
  console.log('hide body    :', JSON.stringify(await p.evaluate(() => window.__hidden)));
  console.log('tiles left   :', await p.locator('#wall .sh-tile').count());
  console.log('toast        :', await p.textContent('#toast'));
  console.log('errors       :', errs);
  await b.close();
})();
"
```

Expected:
- `body class` includes `is-admin`
- `x visible : block`
- `key on GET : true`
- `hide body : [{"action":"hide","id":"p1","key":"s3cret"}]` — **the key must be in the POST body**, since that is what `photos.gs:hide_` checks
- `tiles left : 0`
- `toast : hidden`
- `errors : []`

If any of these fail, fix `js/shareWall.js` / `js/shareApi.js` and re-run before committing.

- [ ] **Step 2: Confirm a non-admin cannot even ask**

Re-run the same snippet without `?key=` and with `admin: false` in both stub responses. Expected: `body class` has no `is-admin`, `x visible : none`. Note this is only cosmetic — the real refusal is `photos.gs` returning `{ ok:false, error:"auth" }`, which is why the key is never trusted client-side.

- [ ] **Step 3: Run the full preview sweep**

```bash
npm run preview:share
```

Read every PNG in `shots/`. Expected: 16 files (4 states × 2 viewports × 2 themes), no `CONSOLE ERRORS` in the log, the closed state showing a gold countdown, the admin state showing ✕ badges, and both themes legible.

- [ ] **Step 4: Commit**

```bash
git add -A js/ 
git commit -m "feat: verify admin hide end to end across the wall, api, and gate"
```

(If Steps 1–2 required no code change, skip the commit and say so.)

---

### Task 8: The QR code and the printable table card

**Files:**
- Create: `tools/make-qr.js`
- Modify: `package.json` (add `qrcode` devDependency and the `qr` script)
- Modify: `.gitignore` (only if `media/qr/` should be ignored — it should **not** be; the card is an asset the couple will want)

**Interfaces:**
- Consumes: nothing at runtime.
- Produces: `media/qr/share-qr.svg` and `media/qr/table-card.html`.

- [ ] **Step 1: Install the dependency**

```bash
npm install --save-dev qrcode
```

Note: `npm install --no-save X` mutually prunes this project's devDependencies — use `--save-dev` as above.

- [ ] **Step 2: Write `tools/make-qr.js`**

```js
/* Generates the QR guests scan, plus a printable table card to put it on.
   Usage:  npm run qr  [-- --url https://example.com/share.html]
   Writes media/qr/share-qr.svg (vector, prints at any size) and
   media/qr/table-card.html (open it and print to a 5x7 card or a PDF). */
const QRCode = require("qrcode");
const fs = require("node:fs");
const path = require("node:path");

// ⚠ FILL THIS IN. There is no CNAME in the repo yet, so the hosting address is
// not yet decided. The QR is worthless until this is the real, final URL — a
// printed card cannot be edited later.
const DEFAULT_URL = "https://REPLACE-ME.example.com/share.html";

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}

const URL_ = arg("url", DEFAULT_URL);
const OUT = path.resolve("media/qr");

(async () => {
  if (URL_.indexOf("REPLACE-ME") > -1) {
    console.error("\n  Set the real share URL first — edit DEFAULT_URL in tools/make-qr.js");
    console.error("  or run:  npm run qr -- --url https://your-site/share.html\n");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });

  // high error correction: these cards will sit on tables and get wine on them
  const svg = await QRCode.toString(URL_, {
    type: "svg", errorCorrectionLevel: "H", margin: 1,
    color: { dark: "#3c4f43", light: "#00000000" },
  });
  fs.writeFileSync(path.join(OUT, "share-qr.svg"), svg);

  const card = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Scan to share — Juriel &amp; Grace</title>
<link rel="stylesheet" href="../../css/tokens.css" />
<style>
  @page { size: 5in 7in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 5in; height: 7in;
    background: var(--paper-grain), var(--ivory);
    color: var(--forest-deep);
    font-family: var(--sans); font-weight: 300;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 0.5in; box-sizing: border-box;
  }
  img.mono { width: 1.1in; margin-bottom: 0.28in; }
  h1 { font-family: var(--serif); font-weight: 500; font-size: 30pt; line-height: 1.1; margin: 0 0 0.12in; }
  p.lead { font-size: 11pt; color: var(--ink-soft); margin: 0 0 0.3in; max-width: 3.4in; line-height: 1.5; }
  .qr { width: 2.2in; height: 2.2in; padding: 0.16in; border: 1px solid var(--gold); border-radius: 0.1in; }
  .qr svg { width: 100%; height: 100%; display: block; }
  p.foot { font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase;
           color: var(--gold-deep); margin: 0.3in 0 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <img class="mono" src="../art/monogram.png" alt="" />
  <h1>Share your<br />photos with us</h1>
  <p class="lead">Point your camera at the code — everything you send goes
    straight into our album.</p>
  <div class="qr">${svg}</div>
  <p class="foot">11 · 11 · 26</p>
</body></html>`;
  fs.writeFileSync(path.join(OUT, "table-card.html"), card);

  console.log("  QR   → media/qr/share-qr.svg");
  console.log("  card → media/qr/table-card.html   (open it and print to 5x7)");
  console.log("  url  → " + URL_);
})();
```

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`:

```json
"qr": "node tools/make-qr.js"
```

- [ ] **Step 4: Verify it refuses a placeholder and works with a real URL**

```bash
npm run qr
```
Expected: exits non-zero with the "Set the real share URL first" message. **This guard is the point of the step** — printing a card with a placeholder URL is unrecoverable.

```bash
npm run qr -- --url https://example.com/share.html
node -e "
const fs = require('fs');
const svg = fs.readFileSync('media/qr/share-qr.svg', 'utf8');
const card = fs.readFileSync('media/qr/table-card.html', 'utf8');
console.log('svg is svg   :', svg.trim().startsWith('<?xml') || svg.trim().startsWith('<svg'));
console.log('card has qr  :', card.indexOf('<svg') > -1);
console.log('card has mono:', card.indexOf('monogram.png') > -1);
"
```
Expected: all three `true`.

Then decode the QR to prove it encodes the right URL — a card that scans to the wrong place is the single most expensive mistake in this feature:

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:8000/media/qr/table-card.html', { waitUntil: 'load' });
  await p.screenshot({ path: 'shots/table-card.png' });
  await b.close();
})();
"
```
Read `shots/table-card.png` and confirm the card is on-brand and the QR is crisp. Scan it with an actual phone camera and confirm it opens `https://example.com/share.html`.

- [ ] **Step 5: Commit**

```bash
git add tools/make-qr.js package.json package-lock.json media/qr/
git commit -m "feat: generate the guest album QR and a printable table card"
```

---

### Task 9: Link it from the invitation site, and verify everything

**Files:**
- Modify: `index.html:56-62` (the `.nav-links` block)

**Interfaces:**
- Consumes: `share.html` from Task 3.
- Produces: nothing programmatic.

Note: `js/sections.js` owns a `data-jump` map for in-page scroll targets. The album is a **different page**, so its link must be a plain `href` with **no** `data-jump` attribute, or the scroll router will try to find a `#` section that does not exist.

- [ ] **Step 1: Add the nav link**

In `index.html`, inside `<nav class="nav-links">`, after the RSVP link:

```html
      <a href="share.html">Guest Album</a>
```

- [ ] **Step 2: Verify the nav still fits on a phone**

The memory of this project records that adding a nav link previously caused a wrap-and-collide bug at 390px (`.nav-monogram` overlapping, RSVP pushed offscreen), fixed with `white-space: nowrap` plus `overflow-x: auto` at ≤480px in `css/base.css`. A sixth link puts that back under pressure.

```bash
npx serve -l 8000 &
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [1280, 720, 480, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 } });
    await p.goto('http://localhost:8000/', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const s = document.getElementById('introSkip'); if (s) s.click(); });
    await p.waitForTimeout(600);
    const info = await p.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.nav-links a'));
      const mono = document.querySelector('.nav-monogram').getBoundingClientRect();
      return {
        count: links.length,
        multiline: links.filter(a => a.getBoundingClientRect().height > 26).map(a => a.textContent),
        collides: links.some(a => a.getBoundingClientRect().left < mono.right),
        album: !!links.find(a => a.textContent.trim() === 'Guest Album'),
      };
    });
    console.log(w, JSON.stringify(info));
    await p.close();
  }
  await b.close();
})();
"
```

Expected at every width: `count: 6`, `multiline: []`, `collides: false`, `album: true`. If a link wraps at 390px, tighten the ≤480px block in `css/base.css` rather than dropping the link.

- [ ] **Step 3: Verify the guest album is reachable and still correct**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://localhost:8000/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = document.getElementById('introSkip'); if (s) s.click(); });
  await p.waitForTimeout(600);
  await p.click('.nav-links a[href=\"share.html\"]');
  await p.waitForTimeout(1500);
  console.log('landed on :', p.url());
  console.log('title     :', await p.title());
  await b.close();
})();
"
```
Expected: URL ends `/share.html`, title `Guest Album — Juriel & Grace`.

- [ ] **Step 4: Full-suite verification**

```bash
npm test
node --check js/share.js && node --check js/shareApi.js && node --check js/shareUpload.js && node --check js/shareWall.js && node --check js/lib/imageFit.js && node --check google-apps-script/photos.gs && echo "syntax ok"
npm run preview:share
```

Expected: all tests pass (imageFit 7, photoGate 10, storyGeometry 19 — 36 total); `syntax ok`; 16 screenshots with no console errors.

Confirm no secret leaked into git:

```bash
git grep -n "AKfycb" -- share.html js/shareApi.js js/share.js js/shareUpload.js js/shareWall.js google-apps-script/photos.gs
git grep -nE "SHEET_ID *= *\"[^\"]+\"|FOLDER_ID *= *\"[^\"]+\"" -- google-apps-script/photos.gs
```
Expected: **no output from either.** `ENDPOINT`, `SHEET_ID`, and `FOLDER_ID` must all still be empty strings in the committed code; they are filled in after deployment.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: link the guest album from the invitation site's nav"
```

---

## After the plan: what a human still has to do

None of this is codeable — it needs the couple's own Google account, and it is the difference between working software and a working album.

1. Add the **Config** tab to the RSVP spreadsheet with `open_at`, `close_at`, `force_open`, `admin_key`.
2. Create the Drive folder; copy its ID into `FOLDER_ID`; copy the spreadsheet ID into `SHEET_ID`.
3. Create the standalone Apps Script project, paste `photos.gs`, set the timezone to Manila, deploy as a web app (*Execute as: Me*, *Who has access: Anyone*).
4. Paste the `/exec` URL into `ENDPOINT` in `js/shareApi.js`.
5. **Decide the hosting URL**, put it in `tools/make-qr.js`, run `npm run qr`, print the card.
6. **Rehearse before the day**, with `force_open` set to `TRUE`: upload from a real phone, confirm the file appears in Drive with a `Guest-NNNN_` name and a row in the Photos tab, confirm it shows on a second device's wall within 20 seconds, confirm ✕ removes it from both devices, confirm typing `TRUE` in the Photos tab hides one too, then set `force_open` back to `FALSE` and confirm the countdown returns.

Step 6 is the one that matters. Everything upstream is testable in this repo; that one is not.
