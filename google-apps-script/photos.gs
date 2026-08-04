/* Juriel & Grace — guest photo album backend.
 *
 * A SEPARATE Apps Script project from rsvp.gs. Both read the same spreadsheet,
 * but a project may only define one doGet/doPost, and more importantly a bug in
 * photo upload code on the wedding day must not be able to take down the RSVP.
 *
 * The spreadsheet is the control panel. A "Config" tab holds the switches; a
 * "Photos" tab logs every upload and offers a second way to hide one.
 *
 *   Setting     | Value              | Meaning
 *   ------------|--------------------|-------------------------------------------
 *   open_at     | 2026-11-11 13:00   | uploads open at this moment (Asia/Manila)
 *   close_at    |                    | uploads stop; blank means never
 *   force_open  | FALSE              | TRUE overrides both dates — open right now
 *   admin_key   | (a secret string)  | unlocks hiding; always bypasses the gate
 *
 * Setup (once):
 *   1. Add the "Config" tab above to the RSVP spreadsheet; copy the spreadsheet
 *      ID out of its URL into SHEET_ID below.
 *   2. Create the Drive folder for the photos; copy its ID into FOLDER_ID below.
 *   3. New standalone Apps Script project (script.new), paste this file.
 *      Project Settings → Time zone → (GMT+08:00) Manila.
 *   4. Deploy → New deployment → Web app.
 *        Execute as: Me    ·    Who has access: Anyone
 *   5. Paste the /exec URL into ENDPOINT in js/shareApi.js.
 *
 * Redeploy (Deploy → Manage deployments → edit → New version) after editing this
 * code. Editing the spreadsheet never needs a redeploy — config changes take
 * effect within CACHE_SECS.
 */

var SHEET_ID  = "";                    // RSVP spreadsheet ID — see setup step 1
var FOLDER_ID = "";                    // Drive folder for the photos — step 2

var TZ         = "Asia/Manila";
var MAX_BYTES  = 8 * 1024 * 1024;      // decoded; the client sends ~1MB, this is a backstop
var RATE_MAX   = 60;                   // uploads per device tag per rolling hour
var CACHE_SECS = 20;                   // config + folder listing TTL

/* ---------------------------------------------------------------------------
 * Pure helpers. No Apps Script APIs in here, so test/photoGate.test.js can run
 * them under plain Node. The gate is the one thing that must not be wrong.
 * ------------------------------------------------------------------------- */

/* The Config tab as a plain object, keyed by lower-cased setting name. */
function parseConfig(rows) {
  var cfg = {};
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] == null ? "" : rows[i][0]).trim().toLowerCase();
    if (!k || k === "setting") continue;          // header row, blank rows
    cfg[k] = rows[i][1];
  }
  return cfg;
}

/* The spellings a person actually types into a spreadsheet cell. */
function truthy(v) {
  if (v === true) return true;
  var s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

/* A Config time cell -> epoch ms, or null if it is blank or unreadable.
 * The cell may be a real Sheets date, an epoch number (that is how config_()
 * caches Dates, since JSON has no date type), or a bare string like
 * "2026-11-11 13:00" — which carries no zone, so it is read as venue time using
 * offsetMinutes rather than as UTC. */
function parseWhen(v, offsetMinutes) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v == null ? "" : v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return utc - offsetMinutes * 60000;
}

/* Is the album open right now? force_open beats both dates. Anything unreadable
 * fails SHUT — an album that will not open is a phone call; an album that opens
 * itself three months early is not fixable. */
function gateState(cfg, nowMs, offsetMinutes) {
  var opensAt  = parseWhen(cfg.open_at, offsetMinutes);
  var closesAt = parseWhen(cfg.close_at, offsetMinutes);
  var forced   = truthy(cfg.force_open);
  var open = forced || (opensAt !== null && nowMs >= opensAt &&
                        (closesAt === null || nowMs < closesAt));
  return { open: open, opensAt: opensAt, closesAt: closesAt, forced: forced };
}

/* ---------------------------------------------------------------------------
 * Apps Script side.
 * ------------------------------------------------------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The venue's UTC offset in minutes, asked of the runtime rather than hard-coded
 * so the script keeps working if the project timezone is ever changed. */
function offsetMinutes_() {
  var s = Utilities.formatDate(new Date(), TZ, "Z");     // e.g. "+0800"
  var sign = s.charAt(0) === "-" ? -1 : 1;
  return sign * (parseInt(s.substr(1, 2), 10) * 60 + parseInt(s.substr(3, 2), 10));
}

function iso_(ms) {
  if (ms === null || ms === undefined) return null;
  return Utilities.formatDate(new Date(ms), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/* Config, cached. Without the cache a hundred phones polling every 15s would
 * read the spreadsheet several times a second. With it the sheet is read a few
 * times a minute and an edit still lands within CACHE_SECS. */
function config_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("cfg");
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var cfg = sh ? parseConfig(sh.getDataRange().getValues()) : {};
  // Dates do not survive a JSON round-trip as Dates, so flatten them to epoch ms
  // before caching — parseWhen accepts numbers for exactly this reason
  for (var k in cfg) if (cfg[k] instanceof Date) cfg[k] = cfg[k].getTime();
  cache.put("cfg", JSON.stringify(cfg), CACHE_SECS);
  return cfg;
}

function isAdmin_(cfg, key) {
  var want = String(cfg.admin_key == null ? "" : cfg.admin_key).trim();
  return want !== "" && String(key == null ? "" : key) === want;
}

/* File IDs the couple hid by typing TRUE in the Photos tab. The ✕ on the page
 * writes the same cell, so the sheet and Drive never disagree. */
function hiddenSet_() {
  var out = {};
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Photos");
  if (!sh || sh.getLastRow() < 2) return out;
  var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 4).getValues();   // File ID .. Hidden
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][3]).trim().toLowerCase() === "true") out[String(rows[i][0])] = 1;
  }
  return out;
}

/* The wall's contents, cached. getFiles() does not recurse, so anything moved
 * into _hidden/ drops out of the listing for free. */
function list_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("list");
  if (hit) return JSON.parse(hit);

  var hidden = hiddenSet_();
  var it = DriveApp.getFolderById(FOLDER_ID).getFiles();
  var out = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType().indexOf("image/") !== 0) continue;
    var id = f.getId();
    if (hidden[id]) continue;
    var name = f.getName();
    var u = name.indexOf("_");
    out.push({ id: id, tag: u > 0 ? name.substring(0, u) : "", ts: f.getDateCreated().getTime() });
  }
  out.sort(function (a, b) { return b.ts - a.ts; });          // newest first
  cache.put("list", JSON.stringify(out), CACHE_SECS);
  return out;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var cfg = config_();
    var admin = isAdmin_(cfg, p.key);
    var now = Date.now();
    if (p.action === "list") {
      return json_({ ok: true, now: iso_(now), admin: admin, photos: list_() });
    }
    var g = gateState(cfg, now, offsetMinutes_());
    return json_({ ok: true, open: g.open || admin, admin: admin,
                   opensAt: iso_(g.opensAt), closesAt: iso_(g.closesAt), now: iso_(now) });
  } catch (err) {
    return json_({ ok: false, error: "server", detail: String(err) });
  }
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) {}
  try {
    return d.action === "hide" ? hide_(d) : upload_(d);
  } catch (err) {
    return json_({ ok: false, error: "server", detail: String(err) });
  }
}

/* A rolling-hour cap per device tag. Each accepted upload refreshes the window,
 * so this is "60 in any quiet-free hour" rather than a fixed clock hour — close
 * enough for the only thing it defends against, which is a runaway loop. */
function allow_(tag) {
  var cache = CacheService.getScriptCache();
  var k = "rate_" + tag;
  var n = Number(cache.get(k) || 0) + 1;
  if (n > RATE_MAX) return false;
  cache.put(k, String(n), 3600);
  return true;
}

function upload_(d) {
  var cfg = config_();
  var admin = isAdmin_(cfg, d.key);
  if (!gateState(cfg, Date.now(), offsetMinutes_()).open && !admin) {
    return json_({ ok: false, error: "closed" });
  }

  var mime = String(d.mime || "");
  if (mime.indexOf("image/") !== 0) return json_({ ok: false, error: "type" });

  // the tag reaches a filename and a spreadsheet cell, so it is whitelisted, not escaped
  var tag = String(d.tag || "").replace(/[^A-Za-z0-9-]/g, "").substring(0, 24) || "Guest";
  if (!allow_(tag)) return json_({ ok: false, error: "rate" });

  var bytes;
  try { bytes = Utilities.base64Decode(String(d.data || "")); }
  catch (err) { return json_({ ok: false, error: "type" }); }
  if (!bytes || !bytes.length) return json_({ ok: false, error: "type" });
  if (bytes.length > MAX_BYTES) return json_({ ok: false, error: "too_large" });

  var when = new Date();
  var ext = mime === "image/png" ? "png" : "jpg";
  var name = tag + "_" + Utilities.formatDate(when, TZ, "yyyyMMdd-HHmmss") +
             "-" + Math.floor(Math.random() * 1000) + "." + ext;

  var file = DriveApp.getFolderById(FOLDER_ID)
    .createFile(Utilities.newBlob(bytes, mime, name));
  // set on the file, not inherited from the folder, so a thumbnail is guaranteed
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Photos") || ss.insertSheet("Photos");
  if (sh.getLastRow() === 0) sh.appendRow(["Timestamp", "File ID", "Tag", "Filename", "Hidden"]);
  sh.appendRow([when, file.getId(), tag, name, ""]);

  // deliberately NOT invalidating the "list" cache: during a busy reception that
  // would mean listing the folder on every poll. Others see the photo within
  // CACHE_SECS, and the uploader already sees their own copy locally.
  return json_({ ok: true, id: file.getId(), tag: tag, ts: when.getTime() });
}

function hide_(d) {
  var cfg = config_();
  if (!isAdmin_(cfg, d.key)) return json_({ ok: false, error: "auth" });
  var id = String(d.id || "");
  if (!id) return json_({ ok: false, error: "auth" });

  var parent = DriveApp.getFolderById(FOLDER_ID);
  var subs = parent.getFoldersByName("_hidden");
  var hidden = subs.hasNext() ? subs.next() : parent.createFolder("_hidden");

  var file = DriveApp.getFileById(id);
  hidden.addFile(file);
  parent.removeFile(file);                 // moved, never destroyed — undo from Drive

  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Photos");
  if (sh && sh.getLastRow() >= 2) {
    var ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { sh.getRange(i + 2, 5).setValue("TRUE"); break; }
    }
  }

  // hides are rare and must be immediate, so this one DOES drop the cache
  CacheService.getScriptCache().remove("list");
  return json_({ ok: true });
}

/* Lets test/photoGate.test.js require this file under Node. `module` does not
 * exist in the Apps Script runtime, so this is inert there. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseConfig: parseConfig, truthy: truthy, parseWhen: parseWhen, gateState: gateState };
}
