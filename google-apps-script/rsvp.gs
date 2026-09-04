/* Juriel & Grace — RSVP backend, lives inside the couple's Google Sheet.
 *
 * The sheet is the whole admin panel. A "Guests" tab is the invite list the
 * website's name search reads, and every submission lands in "Responses".
 * Adding a guest = typing a row.
 *
 *   Guests tab
 *     A  Name
 *     B  Seats      blank = 1; an explicit 0 is meaningful (the site then
 *                   hides the guest counter for that party)
 *     C  (whatever the couple keeps here — the site does not read it)
 *     D  Response   N while that name has yet to answer, Y once it appears in
 *                   Responses. A formula does this, e.g. in D2:
 *                     =IF(COUNTIF(Responses!B:B, A2) > 0, "Y", "N")
 *                   ONLY rows reading N are offered by the site — see below.
 *
 * Why column D matters: only a guest reading N is included in what doGet returns, so
 * a name stops being offered the moment it has answered. That is what stops
 * one person answering in another's name — the site will only submit a name it
 * was offered, and an answered name is no longer on offer.
 *
 * It is a lock on the front door, not on the safe: this endpoint is public (the
 * URL ships inside js/rsvp.js) and cannot tell a hand-made POST from the site's
 * own. So doPost never overwrites either — see there.
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

/* Only a guest explicitly marked N is still to answer, and only those are offered.
 *
 * Deliberately strict: a blank cell does NOT count as N. Anything other than N hides
 * the guest from the picker, and a hidden guest cannot RSVP at all — so if you add a
 * guest by typing a new row, COPY THE FORMULA DOWN INTO COLUMN D or they will never
 * be offered. That is the one way this can quietly go wrong. */
function stillToAnswer_(cell) {
  var v = String(cell === undefined || cell === null ? "" : cell).trim().toLowerCase();
  return v === "n" || v === "no" || v === "false";
}

/* GET → the guests still to answer, for the website's type-ahead search.
 * ONLY rows reading N in column D are returned. A name that has answered is not
 * on the list the site can offer, so it cannot be answered for a second time. */
function doGet() {
  var sheet = SpreadsheetApp.getActive().getSheetByName("Guests");
  var guests = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {          // row 0 is the header
      var name = String(rows[i][0] || "").trim();
      if (!name) continue;
      if (!stillToAnswer_(rows[i][3])) continue;     // column D — only N is offered
      // a blank Seats cell means "unspecified" and defaults to 1;
      // an explicit 0 is meaningful — the site hides the guest count for them
      var s = rows[i][1] === "" ? 1 : Number(rows[i][1]);
      if (isNaN(s) || s < 0) s = 1;
      guests.push({ name: name, seats: s });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ guests: guests }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* POST → one row per submission, APPENDED. Never an overwrite.
 *
 * This used to find the row with the same name and replace it, which meant
 * anyone who knew a guest's name could replace that guest's answer and the
 * original was gone. Appending cannot destroy anything: the first answer stays
 * on the sheet, and a second one for the same name is an extra row you can see
 * and judge rather than a silent replacement.
 *
 * Read the LAST row for a name as that guest's answer. Column D on the Guests
 * tab tells you at a glance who has answered at all.
 *
 * The site sends the body as text/plain JSON — that shape avoids a CORS
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

  // has this name answered before? Only to word the thank-you honestly — the
  // row is appended either way.
  var seenBefore = false;
  if (key && sheet.getLastRow() > 1) {
    var names = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim().toLowerCase() === key) { seenBefore = true; break; }
    }
  }
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, updated: seenBefore }))
    .setMimeType(ContentService.MimeType.JSON);
}
