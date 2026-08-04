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
    var DATA = ${JSON.stringify(state)};
    var skew = 0;
    function absorb(d) {
      if (d && d.now) {
        var t = Date.parse(d.now);
        if (!isNaN(t)) skew = t - Date.now();
      }
      return d;
    }
    // js/shareApi.js's get()/post() reject before ever touching fetch while
    // ENDPOINT is "" — the committed, shipped value — so stubbing window.fetch
    // alone can never be reached. Mutate the real shareApi object's methods in
    // place instead. js/share.js does "var api = window.W.shareApi" at parse
    // time, so replacing window.W.shareApi wholesale would not affect it —
    // only mutating the object it already has a reference to will.
    function patch() {
      var api = window.W && window.W.shareApi;
      if (!api) return false;
      api.configured = function () { return true; };
      api.now = function () { return Date.now() + skew; };
      api.status = function () {
        return Promise.resolve(absorb({
          ok: true, open: DATA.open, admin: DATA.admin,
          opensAt: DATA.opensAt, closesAt: null, now: DATA.now
        }));
      };
      api.list = function () {
        return Promise.resolve(absorb({
          ok: true, now: DATA.now, admin: DATA.admin, photos: DATA.photos
        }));
      };
      api.upload = function () {
        return Promise.resolve({ ok: true, id: "fake-new", tag: "Guest-4000", ts: Date.now() });
      };
      api.hide = function () { return Promise.resolve({ ok: true }); };
      return true;
    }
    // addInitScript runs before every page script, including js/shareApi.js,
    // so window.W.shareApi does not exist yet at this line — patch() is
    // retried on DOMContentLoaded. That listener is registered here, before
    // the page has run any of its own <script> tags, so it fires before
    // js/share.js's own DOMContentLoaded listener (registered later, when
    // that script executes) — same-target listeners fire in registration
    // order, so patch() always wins the race and check()'s first call already
    // sees the stubbed methods.
    if (!patch()) document.addEventListener("DOMContentLoaded", patch);
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
