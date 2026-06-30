/* Transcode a chosen DJI drone clip to a small muted web loop + poster.
   Usage: npm run transcode:drone -- "..\\DJI_20251122093515_0029_D.MP4" [--seconds 12]
   Defaults to the smallest of the three known DJI clips in the parent folder. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PARENT = path.resolve(ROOT, "..");
const OUT = path.resolve(ROOT, "media", "video");
fs.mkdirSync(OUT, { recursive: true });

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : def; }
const SECONDS = arg("seconds", "12");
const input = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(PARENT, "DJI_20251122093515_0029_D.MP4"); // smallest clip (~160 MB)

function ffmpeg() {
  const c = [
    path.resolve(PARENT, "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.resolve(PARENT, "website_card", ".tools", "node_modules", "ffmpeg-static", "ffmpeg"),
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  return "ffmpeg";
}
const FF = ffmpeg();
if (!fs.existsSync(input)) { console.error("Input not found:", input); process.exit(1); }

const loop = path.join(OUT, "drone-loop.mp4");
const poster = path.join(OUT, "drone-poster.jpg");
console.log("Transcoding", input, "->", loop);
execFileSync(FF, ["-y", "-t", SECONDS, "-i", input,
  "-vf", "scale=1280:-2,fps=30", "-an",
  "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-movflags", "+faststart", loop], { stdio: "inherit" });
execFileSync(FF, ["-y", "-i", loop, "-frames:v", "1", "-q:v", "4", poster], { stdio: "inherit" });
console.log("Done:", (fs.statSync(loop).size / 1e6).toFixed(2), "MB loop +", poster);
