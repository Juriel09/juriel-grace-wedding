/* Transcode a delivered film (proposal, teaser) to a web-ready MP4 + poster.
   Usage: npm run transcode:film -- "<input>" --out teaser [--crf 21] [--height 1080]
     --out <name>    basename under media/video/ — writes <name>.mp4 and <name>-poster.jpg
     --crf <n>       quality, lower is better; 21 is high, 23 is still good (default 21)
     --height <n>    output height, width follows the source aspect (default 1080)
     --preset <p>    x264 preset (default slow — this runs once, so spend the time)
     --maxrate <r>   ceiling, e.g. 4M. Use it on anything with a lot of moving
                     detail — grass, leaves, water, confetti. CRF alone chases that
                     detail forever: the proposal clip is a hillside of wind-blown
                     grass and came out of CRF 21 at 14.7 Mbps, twice the size of its
                     own source and over GitHub's 100 MB per-file limit. Nobody is
                     tracking individual blades, so cap it and spend the bits on faces.

   Why every one of these films goes through here, however it arrived:
     - H.264 + yuv420p, because a delivery can be HEVC (Safari plays it; Chrome and
       Firefox do not) or 10-bit, and the site must play everywhere.
     - Audio is KEPT and re-encoded to AAC. These panels are not muted — starting a
       film ducks the background song precisely so its own soundtrack is heard.
     - +faststart, so the moov atom leads and the film streams instead of making the
       visitor wait for the whole download.
   Sources live outside the repo; only the encoded result is committed. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, "media", "video");
fs.mkdirSync(OUT, { recursive: true });

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const CRF = arg("crf", "21");
const HEIGHT = arg("height", "1080");
const PRESET = arg("preset", "slow");
const MAXRATE = arg("maxrate", null);
const NAME = arg("out", null);

const input = process.argv[2] && !process.argv[2].startsWith("--") ? path.resolve(process.argv[2]) : null;
if (!input || !NAME) {
  console.error('Usage: node tools/transcode-film.js "<input>" --out <name> [--crf 21] [--height 1080]');
  process.exit(1);
}
if (!fs.existsSync(input)) { console.error("Input not found:", input); process.exit(1); }

const mp4 = path.join(OUT, NAME + ".mp4");
const poster = path.join(OUT, NAME + "-poster.jpg");
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(1);

console.log("Transcoding", path.basename(input), "(" + mb(input) + " MB) ->", path.relative(ROOT, mp4));
// bufsize at 2x maxrate: a one-second window would clamp every cut, where two lets a
// busy shot borrow from the quiet one before it
const cap = MAXRATE ? ["-maxrate", MAXRATE, "-bufsize", (parseFloat(MAXRATE) * 2) + "M"] : [];
execFileSync("ffmpeg", ["-y", "-i", input,
  // -2 keeps the width even, which yuv420p requires; never upscale past the source
  "-vf", "scale=-2:'min(" + HEIGHT + ",ih)'",
  "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-crf", CRF, "-preset", PRESET, ...cap,
  "-c:a", "aac", "-b:a", "160k", "-ac", "2",
  "-movflags", "+faststart", mp4], { stdio: "inherit" });

// `thumbnail` picks the most representative frame of the batch it is given, which
// keeps posters off the fades to black that films tend to open on.
execFileSync("ffmpeg", ["-y", "-i", mp4,
  "-vf", "thumbnail=300,scale=-2:720", "-frames:v", "1", "-q:v", "3", poster], { stdio: "inherit" });

console.log("Done:", mb(mp4), "MB film +", mb(poster), "MB poster");
