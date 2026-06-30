/* Extract the open invitation card from a frame onto transparency (AI segmentation),
   mask off the stray top-right artifact, and save as a WebP with alpha.
   One-time tool. Usage:
     node tools/extract-card.js [--frame 0193] [--out media/card/open-card.webp] [--cropw 0.75]
   Requires: @imgly/background-removal-node (dev dep) and ffmpeg on PATH. */
const { removeBackground } = require("@imgly/background-removal-node");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const FRAME = arg("frame", "0193");
const OUT = path.resolve(arg("out", "media/card/open-card.png")); // PNG = reliable alpha
const CROPW = parseFloat(arg("cropw", "0.75")); // keep this fraction of width from the left (drops the top-right smudge)
const FW = 1280, FH = 720;

const SRC = path.resolve("media/frames", `frame_${FRAME}.webp`);
if (!fs.existsSync(SRC)) { console.error("Frame not found:", SRC); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardx-"));
const pngIn = path.join(tmp, "in.png"), pngCut = path.join(tmp, "cut.png");

(async () => {
  // 1. webp -> png (reliable decode for the segmenter)
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", SRC, pngIn], { stdio: "inherit" });
  // 2. AI background removal -> transparent png
  const blob = await removeBackground(new Blob([fs.readFileSync(pngIn)], { type: "image/png" }));
  fs.writeFileSync(pngCut, Buffer.from(await blob.arrayBuffer()));
  // 3. normalize (the segmenter may output paletted/downscaled) to rgba @ frame size,
  //    then mask the stray top-right artifact (keep left CROPW, pad back, transparent)
  const keep = Math.round(FW * CROPW);
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", pngCut,
    "-vf", `format=rgba,scale=${FW}:${FH},crop=${keep}:${FH}:0:0,pad=${FW}:${FH}:0:0:color=black@0.0`,
    OUT], { stdio: "inherit" });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("Wrote", OUT, (fs.statSync(OUT).size / 1e3).toFixed(0), "KB");
})().catch((e) => { console.error("ERR", e && e.message ? e.message : e); process.exit(1); });
