/* Build the "Our Story" red-string timeline media from the couple's source photos.
   Reads from an external source tree (default C:\Users\jurie\Desktop\our_story),
   auto-orients, and writes two things per milestone into media/story/<key>/:
     - a square disc crop (the round tile on the string)   -> disc.jpg (or disc-juriel/grace)
     - the full album images shown in the lightbox          -> 01.jpg, 02.jpg, …
   It also emits js/storyAlbums.js, a generated map of web paths that story.js reads,
   so photo files never have to be hand-listed in the story data.
   Usage: node tools/build-story.js [--src <dir>] [--disc 600] [--full 1400] [--quality 82] */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const SRC = path.resolve(arg("src", "C:\\Users\\jurie\\Desktop\\our_story"));
const OUT = path.resolve(ROOT, "media", "story");
const GEN = path.resolve(ROOT, "js", "storyAlbums.js");
const DISC = parseInt(arg("disc", "600"), 10);   // square disc edge
const FULL = parseInt(arg("full", "1400"), 10);  // full-image long edge
const Q = parseInt(arg("quality", "82"), 10);

// key -> ordered source files (relative to SRC); the first is the lead / disc.
// A `pair` milestone renders two discs (his + hers), joined by the red string.
const MANIFEST = {
  bike:    { pair: { juriel: "red_string/bike/bike_juriel.jpeg",         grace: "red_string/bike/bike_grace.jpeg" } },
  glasses: { pair: { juriel: "red_string/eyeglass/same_eyeglass_juriel.jpeg", grace: "red_string/eyeglass/same_eye_glass_grasya.jpeg" },
             disc: { juriel: "red_string/eyeglass/disc_juriel.jpg" } },   // hand-picked crop, kept verbatim
  "2002":  { files: ["red_string/2002/kinder_duye_grasa.jpeg"] },
  "2008":  { files: ["red_string/2008/mr&ms_agham_2008.JPG"] },
  "2015":  { files: ["2015/first_photo_together_she_said_yes.jpeg", "2015/introduce_to_familyn.jpg"] },
  "2016":  { files: ["2016_date/first_date.jpg", "2016_date/holding.jpg", "2016_date/hands.jpg", "2016_date/look_each_other.jpg"] },
  "2017":  { files: ["2017/enchanted_kingdom.JPG", "2017/enchanted_date.JPG", "2017/enchanted_date1.JPG", "2017/graduation.JPG", "2017/selfie_2017.JPG"] },
  "2018":  { files: ["2018/palawan_travel.jpg", "2018/palawan2.jpg", "2018/bus_pic.JPG"] },
  "2019":  { files: ["2019/siargao.jpeg", "2019/glamping.jpeg"] },
  "2020":  { files: ["2020/anniv_home.jpeg", "2020/anniv_home1.jpeg", "2020/anniv_home2.jpeg"] },
  "2021":  { files: ["2021/selfie.jpeg", "2021/selfie2.jpeg"] },
  "2022":  { files: ["2022/coron_anniversary.jpeg", "2022/dynocouple.jpg", "2022/coron_palawan.jpeg", "2022/lany_concert.jpeg"] },
  "2023":  { files: ["2023/pulag_hike.jpeg", "2023/bohol.jpeg", "2023/cebu.jpeg", "2023/mindoro_bongabong.jpeg"] },
  "2024":  { files: ["2024/la_union.jpeg", "2024/la_union1.jpeg", "2024/baguio.jpeg"] },
  "2025":  { files: ["2025/propsal.jpeg", "2025/propsal1.jpeg", "2025/proposal2.jpeg", "2025/together.jpeg"] },
};

const web = (key, name) => "media/story/" + key + "/" + name;   // forward-slash web path

function disc(inP, outP) {
  return sharp(inP).rotate()
    .resize(DISC, DISC, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: Q, mozjpeg: true }).toFile(outP);
}
function full(inP, outP) {
  return sharp(inP).rotate()
    .resize({ width: FULL, height: FULL, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: Q, mozjpeg: true, progressive: true }).toFile(outP);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // clear previously generated milestone folders (keep README.md and stray files)
  for (const key of Object.keys(MANIFEST)) fs.rmSync(path.join(OUT, key), { recursive: true, force: true });

  const albums = {};
  const missing = [];
  let count = 0, bytes = 0;
  const track = async (fn, outP) => { await fn; count++; bytes += fs.statSync(outP).size; };
  // Build a pair disc, but honour a hand-picked crop override (def.disc[who]) by
  // copying it verbatim — so re-running the build never clobbers a manual edit.
  const discFor = async (who, defaultIn, outP, def) => {
    const ov = def.disc && def.disc[who] ? path.join(SRC, def.disc[who]) : null;
    if (ov && fs.existsSync(ov)) { fs.copyFileSync(ov, outP); count++; bytes += fs.statSync(outP).size; }
    else await track(disc(defaultIn, outP), outP);
  };

  for (const [key, def] of Object.entries(MANIFEST)) {
    const dir = path.join(OUT, key);
    fs.mkdirSync(dir, { recursive: true });

    if (def.pair) {
      const jIn = path.join(SRC, def.pair.juriel), gIn = path.join(SRC, def.pair.grace);
      if (!fs.existsSync(jIn)) { missing.push(def.pair.juriel); continue; }
      if (!fs.existsSync(gIn)) { missing.push(def.pair.grace); continue; }
      const jDisc = path.join(dir, "disc-juriel.jpg"), gDisc = path.join(dir, "disc-grace.jpg");
      const jFull = path.join(dir, "01.jpg"), gFull = path.join(dir, "02.jpg");
      await discFor("juriel", jIn, jDisc, def);
      await discFor("grace", gIn, gDisc, def);
      await track(full(jIn, jFull), jFull);
      await track(full(gIn, gFull), gFull);
      albums[key] = { pair: true, juriel: web(key, "disc-juriel.jpg"), grace: web(key, "disc-grace.jpg"),
                      album: [web(key, "01.jpg"), web(key, "02.jpg")] };
      continue;
    }

    const list = [];
    for (let i = 0; i < def.files.length; i++) {
      const inP = path.join(SRC, def.files[i]);
      if (!fs.existsSync(inP)) { missing.push(def.files[i]); continue; }
      const nn = String(list.length + 1).padStart(2, "0");
      const fOut = path.join(dir, nn + ".jpg");
      await track(full(inP, fOut), fOut);
      list.push(web(key, nn + ".jpg"));
      if (list.length === 1) {                       // lead becomes the disc
        const dOut = path.join(dir, "disc.jpg");
        await track(disc(inP, dOut), dOut);
      }
    }
    albums[key] = { disc: web(key, "disc.jpg"), album: list };
  }

  const banner = "/* GENERATED by tools/build-story.js — do not edit by hand. */\n";
  const body = "window.W = window.W || {};\nwindow.W.storyAlbums = " + JSON.stringify(albums, null, 2) + ";\n";
  fs.writeFileSync(GEN, banner + body);

  console.log(`Wrote ${count} images (${(bytes / 1e6).toFixed(2)} MB) -> ${OUT}`);
  console.log(`Generated ${path.relative(ROOT, GEN)} with ${Object.keys(albums).length} milestones.`);
  if (missing.length) console.warn("MISSING sources:\n  " + missing.join("\n  "));
})().catch((e) => { console.error(e); process.exit(1); });
