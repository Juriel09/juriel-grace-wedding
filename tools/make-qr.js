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
