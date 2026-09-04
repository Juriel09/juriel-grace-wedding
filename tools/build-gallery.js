/* Build the gallery mosaic from the couple's selected prenup photos.
   Reads full-res DSC_*.JPG from ../selected-photos (in the order listed in SELECTED
   below), auto-orients them, resizes to a web-friendly size, and writes
   media/gallery/photo-01.jpg … photo-NN.jpg — the names sections.js loads.
   A second mode takes a whole folder instead of the DSC numbers listed below:
     node tools/build-gallery.js --from "<dir>" [--width 1400] [--quality 82]
   Every image in <dir> is used, in natural filename order (Website_2 before
   Website_10, not after it), which is the shape a hand-picked folder arrives in.
   Usage: node tools/build-gallery.js [--width 1400] [--quality 82] */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
// selected-photos lives OUTSIDE the repo (it's 100+ MB of full-res staging); the
// built tiles under media/gallery are what ships. Override with --src if it moves.
const SRC = path.resolve(arg("src", path.resolve(ROOT, "..", "selected-photos")));
const OUT = path.resolve(ROOT, "media", "gallery");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const WIDTH = parseInt(arg("width", "1400"), 10);   // long-edge cap
const QUALITY = parseInt(arg("quality", "82"), 10);

// The couple's most-selected shots, in the order they should appear in the mosaic.
// (4522 was pulled from the set — the tiles renumber from 01 on the next build.)
const SELECTED = [
  4655, 4835, 4861, 4873, 4912, 4938, 4943, 5015, 5092,
  5103, 5139, 5201, 5412, 5436, 5816, 5885, 5923, 5989, 6017,
  6109, 6142,
  6341, 6351, 6397, 6447, 6490, 6541, 6617, 6677, 6821, 6930,
];

// Either a folder of already-chosen images, or the DSC numbers listed above.
const FROM = arg("from", null);
// plain sort puts Website_10 before Website_2; the couple's order is the numeric one
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const sources = FROM
  ? fs.readdirSync(FROM).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort(natural)
      .map((f) => ({ label: f, file: path.join(FROM, f) }))
  : SELECTED.map((n) => ({ label: String(n), file: path.join(SRC, "DSC_" + n + ".JPG") }));

fs.mkdirSync(OUT, { recursive: true });

// clear old placeholder / previous-run tiles so removed photos never linger
for (const f of fs.readdirSync(OUT)) {
  if (/^photo-\d+\.jpg$/i.test(f)) fs.unlinkSync(path.join(OUT, f));
}

(async () => {
  let n = 0, bytes = 0;
  const missing = [];
  for (let i = 0; i < sources.length; i++) {
    const inP = sources[i].file;
    if (!fs.existsSync(inP)) { missing.push(sources[i].label); continue; }
    n++;
    const out = path.join(OUT, `photo-${String(n).padStart(2, "0")}.jpg`);
    await sharp(inP)
      .rotate()                                   // honor EXIF orientation
      .resize({ width: WIDTH, height: WIDTH, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
      .toFile(out);
    bytes += fs.statSync(out).size;
  }
  console.log(`Wrote ${n} tiles -> ${OUT} (long-edge ${WIDTH}px, q${QUALITY}), total ${(bytes / 1e6).toFixed(2)} MB.`);
  if (missing.length) console.warn("MISSING:", missing.join(", "));
  console.log("sections.js hard-codes the tile count — it must say " + n + ".");
})().catch((e) => { console.error(e); process.exit(1); });
