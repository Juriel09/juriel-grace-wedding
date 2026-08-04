/* Juriel & Grace — RSVP backend, lives inside the couple's Google Sheet.
 *
 * The sheet is the whole admin panel: a "Guests" tab is the invite list the
 * website's name search reads (column A: name, column B: seats), and every
 * submission lands as a row in "Responses". Adding a guest = typing a row.
 *
 * Setup (once):
 *   1. In the RSVP spreadsheet: Extensions → Apps Script, paste this file.
 *   2. Deploy → New deployment → Web app.
 *        Execute as: Me    ·    Who has access: Anyone
 *   3. Copy the Web app URL (ends in /exec) into ENDPOINT in js/rsvp.js.
 *
 * Redeploy (Deploy → Manage deployments → edit → New version) after editing
 * this code; editing the sheet itself never needs a redeploy.
 */

/* GET → the guest list, for the website's type-ahead search. */
function doGet() {
  var sheet = SpreadsheetApp.getActive().getSheetByName("Guests");
  var guests = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {          // row 0 is the header
      var name = String(rows[i][0] || "").trim();
      // a blank Seats cell means "unspecified" and defaults to 1;
      // an explicit 0 is meaningful — the site hides the guest count for them
      var s = rows[i][1] === "" ? 1 : Number(rows[i][1]);
      if (isNaN(s) || s < 0) s = 1;
      if (name) guests.push({ name: name, seats: s });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ guests: guests }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* POST → one row per guest in the Responses tab: a name that has already
 * answered gets its row UPDATED (new timestamp, answer, note), never a second
 * row — so nobody can accept or decline twice, but anyone may change their
 * mind. The site sends the body as text/plain JSON — that shape avoids a CORS
 * preflight, which Apps Script web apps cannot answer. */
function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) {}
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName("Responses") || ss.insertSheet("Responses");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Name", "Attending", "Guests", "Note"]);
  }

  var row = [
    new Date(),
    String(d.name || ""),
    String(d.attending || ""),
    String(d.guests || ""),
    String(d.note || "")
  ];

  // same name (trimmed, case-insensitive) = same guest = same row
  var key = row[1].trim().toLowerCase();

  // the Guests tab's seat allotment is the real ceiling — the site enforces it
  // too, but the sheet must hold even against a hand-crafted request.
  // Declining always records 0 seats. An allotment of 0 or 1 leaves no choice:
  // accepting records exactly 1.
  var declining = row[2].toLowerCase().indexOf("declines") !== -1;
  if (declining) row[3] = "0";
  var gsheet = ss.getSheetByName("Guests");
  if (gsheet && key && !declining) {
    var glist = gsheet.getDataRange().getValues();
    for (var g = 1; g < glist.length; g++) {
      if (String(glist[g][0]).trim().toLowerCase() === key) {
        var cap = glist[g][1] === "" ? 1 : Number(glist[g][1]);
        if (isNaN(cap) || cap < 0) cap = 1;
        var asked = Number(row[3]);
        if (cap <= 1) row[3] = "1";
        else if (!isNaN(asked) && asked > cap) row[3] = String(cap);
        break;
      }
    }
  }
  var names = sheet.getRange(2, 2, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  var updated = false;
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim().toLowerCase() === key && key !== "") {
      sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
      updated = true;
      break;
    }
  }
  if (!updated) sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, updated: updated }))
    .setMimeType(ContentService.MimeType.JSON);
}
