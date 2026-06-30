/* Screenshot harness: drive the served site in headless Chromium and capture PNGs
   at given scroll positions, so an agent can Read() and verify the rendered UI.
   Usage:
     node tools/shoot.js [--url http://localhost:8000] [--out shots] [--w 1440] [--h 900] [--reduced]
       --at 0,0.4,0.8,1       whole-page scroll fractions (0..1 of scrollable height)
       --cardp 0,0.7,0.8,1    card-scene progress (0..1 through #cardScroll) — best for the intro
   Output PNGs land in <out>/ (gitignored). Requires the site served + playwright (devDependency). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const URL = arg("url", "http://localhost:8000");
const OUT = path.resolve(arg("out", "shots"));
const W = parseInt(arg("w", "1440"), 10), H = parseInt(arg("h", "900"), 10);
const REDUCED = process.argv.includes("--reduced");
const CARDP = arg("cardp", null);
const ATS = arg("at", "0,0.4,0.8,1");

const targets = CARDP !== null
  ? CARDP.split(",").map(Number).map((v) => ({ mode: "card", v }))
  : ATS.split(",").map(Number).map((v) => ({ mode: "page", v }));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    reducedMotion: REDUCED ? "reduce" : "no-preference",
    deviceScaleFactor: 1,
  });
  await page.goto(URL, { waitUntil: "load" });
  // wait for the intro loader to hide (frames decoded) — best-effort
  await page.waitForFunction(() => {
    const l = document.getElementById("loader");
    return !l || l.classList.contains("hidden");
  }, { timeout: 25000 }).catch(() => {});
  for (const t of targets) {
    await page.evaluate((t) => {
      let y;
      if (t.mode === "card") {
        const cs = document.getElementById("cardScroll");
        const total = cs.offsetHeight - window.innerHeight;
        y = Math.round(cs.offsetTop + total * t.v);
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        y = Math.round(max * t.v);
      }
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    }, t);
    await page.waitForTimeout(1300); // let the eased rAF / canvas / crossfade settle
    const tag = t.mode === "card" ? "card" : "pg";
    const name = `shot_${tag}_${String(t.v).replace(".", "_")}${REDUCED ? "_reduced" : ""}.png`;
    await page.screenshot({ path: path.join(OUT, name) });
    console.log("shot", name);
  }
  await browser.close();
  console.log("done ->", OUT);
})().catch((e) => { console.error("ERR", e && e.message ? e.message : e); process.exit(1); });
