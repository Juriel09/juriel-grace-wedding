/* Resize + recompress the source card-opening frames into media/frames.
   Uses the ffmpeg-static binary already installed under ..\website_card\.tools.
   Usage: npm run optimize:frames -- [--width 1024] [--quality 72] */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.resolve(ROOT, "..", "website_card", "media", "frames");
const OUT = path.resolve(ROOT, "media", "frames");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const WIDTH = parseInt(arg("width", "1024"), 10);
const QUALITY = parseInt(arg("quality", "72"), 10);

function resolveFfmpeg() {
  const candidates = [
    path.resolve(ROOT, "..", "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.resolve(ROOT, "..", "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "ffmpeg"; // fall back to PATH
}
const FFMPEG = resolveFfmpeg();

if (!fs.existsSync(SRC)) { console.error("Source frames not found:", SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /^frame_\d+\.webp$/i.test(f)).sort();
console.log(`Optimizing ${files.length} frames -> ${OUT} (width=${WIDTH}, q=${QUALITY})`);
let bytes = 0;
for (const f of files) {
  const inP = path.join(SRC, f), outP = path.join(OUT, f);
  execFileSync(FFMPEG, ["-y", "-i", inP, "-vf", `scale=${WIDTH}:-1`, "-quality", String(QUALITY), outP], { stdio: "ignore" });
  bytes += fs.statSync(outP).size;
}
console.log(`Done. Total: ${(bytes / 1e6).toFixed(2)} MB across ${files.length} frames.`);
