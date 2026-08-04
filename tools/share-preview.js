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
