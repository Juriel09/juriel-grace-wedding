/* RSVP — a searchable guest list and live submissions, both backed by one
   Google Sheet through an Apps Script web app (google-apps-script/rsvp.gs).
   The guest list is fetched once when the form is first seen; every keystroke
   filters locally, so typing never touches the network. Submissions POST as
   text/plain JSON — the one content type Apps Script can take without a CORS
   preflight. With no ENDPOINT set the form is a visual demo: search and
   validation work, nothing is sent. */
(function () {
  "use strict";
  window.W = window.W || {};

  // Paste the Apps Script Web app URL here (Deploy → Web app → URL ending in /exec).
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbzjiOW3zqJsDKe2K4EVhc8lvkWmhsAPNK6vnFOaiGlUa2NqHTmsXyqbiT2vZlg0OZAZ/exec";

  function init() {
    var form = document.getElementById("rsvpForm");
    if (!form) return;
    var nameEl = form.querySelector('input[name="name"]');
    var seatsEl = form.querySelector('input[name="guests"]');
    var list = document.getElementById("rsvpMatches");
    var status = document.getElementById("rsvpStatus");
    var button = form.querySelector('button[type="submit"]');
    var guests = [];
    var active = -1;   // keyboard cursor in the dropdown; -1 = nothing highlighted

    var say = function (msg) { if (status) status.textContent = msg; };
    // the name field's own error, shown under the input rather than by the button
    var nameErr = document.getElementById("rsvpNameError");
    var sayName = function (msg) {
      if (!nameErr) { say(msg); return; }          // no element: better said late than not at all
      nameErr.textContent = msg || "";
      nameErr.hidden = !msg;
      if (nameEl) nameEl.classList.toggle("is-wrong", !!msg);
    };

    // one fetch for the whole visit, deferred until the RSVP section approaches —
    // nobody pays for the guest list while they are still reading the story
    // One fetch for the whole visit, kicked off as the section approaches. Held as a
    // promise rather than fired and forgotten, because submit has to be sure the list
    // really arrived before it decides a name is not on it.
    var loading = null;
    var loadGuests = function () {
      if (loading) return loading;
      loading = fetch(ENDPOINT)
        .then(function (r) { return r.json(); })
        .then(function (d) { guests = (d && d.guests) || []; return guests.length > 0; })
        .catch(function () { loading = null; return false; });   // null, so a retry refetches
      return loading;
    };
    if (ENDPOINT && nameEl) {
      var io = new IntersectionObserver(function (es) {
        if (!es.some(function (e) { return e.isIntersecting; })) return;
        io.disconnect();
        loadGuests();
      }, { rootMargin: "400px 0px" });
      io.observe(form);
    }

    // the one place that decides whether a typed name is a real guest
    var findGuest = function (v) {
      var q = String(v || "").trim().toLowerCase();
      for (var i = 0; i < guests.length; i++) {
        if (guests[i].name.trim().toLowerCase() === q) return guests[i];
      }
      return null;
    };

    var hide = function () { if (list) { list.hidden = true; list.innerHTML = ""; } active = -1; };

    var seatsHint = document.getElementById("rsvpSeatsHint");
    var seatsRow = document.getElementById("rsvpSeats");
    // The guest-count row steps aside when there is no choice to make: a decline, a
    // party allotted 0 or 1 seats (accepting then simply means "one seat"), or — the
    // default — no name matched yet. Until the sheet says how many seats this party
    // has, a stepper is asking a question nobody can answer: it would start at 1 with
    // no ceiling, and any number typed into it would be a guess. It appears once the
    // name is recognised and there is a real allotment to spend.
    var declined = false, autoOne = false, matched = false;
    var syncSeatsRow = function () {
      var moot = declined || autoOne || !matched;
      if (seatsRow) seatsRow.classList.toggle("is-moot", moot);
      // A stepper nobody can see must not submit a number nobody chose. Matching a
      // party of four and then editing the name left "4" sitting in a hidden field.
      // Not reset on a decline: that count is moot either way, and flipping back to
      // accepting should not have quietly wiped the number they had already picked.
      if ((!matched || autoOne) && seatsEl) seatsEl.value = 1;
    };
    // the sheet says how many seats this party was given: that number becomes the
    // stepper's hard ceiling, and the default answer
    var applySeats = function (g) {
      if (!seatsEl) return;
      matched = true;
      autoOne = g.seats <= 1;
      syncSeatsRow();
      if (autoOne) { if (seatsHint) seatsHint.textContent = ""; return; }
      var fresh = Number(seatsEl.max) !== g.seats;
      seatsEl.max = g.seats;
      if (fresh) seatsEl.value = g.seats;                       // new match: offer the full party
      else if (Number(seatsEl.value) > g.seats) seatsEl.value = g.seats;
      if (seatsHint) {
        seatsHint.textContent = "we've reserved " + g.seats + " seats for your party";
      }
    };
    // a typed name that exactly matches the list counts the same as picking it —
    // the cap must not be dodgeable by not touching the dropdown
    var matchTyped = function () {
      var g = findGuest(nameEl.value);
      if (g) { applySeats(g); return; }
      matched = false;                 // an unrecognised name has no allotment to show
      autoOne = false;
      syncSeatsRow();
      if (seatsEl) { seatsEl.removeAttribute("max"); }
      if (seatsHint) seatsHint.textContent = "";
    };

    var pick = function (g) {
      nameEl.value = g.name;
      applySeats(g);
      hide();
      nameEl.focus();
    };

    // seat stepper — the field is readonly, so these two buttons are the only way
    // to change it, clamped to [1, the party's allotted seats]
    var step = function (dir) {
      if (!seatsEl) return;
      var max = Number(seatsEl.max) || 99;
      seatsEl.value = Math.min(max, Math.max(1, Number(seatsEl.value || 1) + dir));
    };
    var minus = document.getElementById("seatMinus");
    var plus = document.getElementById("seatPlus");
    if (minus) minus.addEventListener("click", function () { step(-1); });
    if (plus) plus.addEventListener("click", function () { step(1); });

    var attendEl = form.querySelector('select[name="attending"]');
    if (attendEl) attendEl.addEventListener("change", function () {
      declined = attendEl.value.indexOf("declines") !== -1;
      syncSeatsRow();
    });

    var render = function (matches) {
      list.innerHTML = "";
      matches.forEach(function (g, i) {
        var li = document.createElement("li");
        li.textContent = g.name;
        li.setAttribute("role", "option");
        // mousedown, not click: click fires after the input's blur has hidden the list
        li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(g); });
        if (i === active) li.classList.add("is-active");
        list.appendChild(li);
      });
      list.hidden = matches.length === 0;
    };

    var currentMatches = [];
    var search = function () {
      sayName("");                                  // they are fixing it; drop the complaint
      var q = nameEl.value.trim().toLowerCase();
      active = -1;
      if (q.length < 2 || !guests.length) { hide(); matchTyped(); return; }
      currentMatches = guests.filter(function (g) {
        return g.name.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 6);
      render(currentMatches);
      matchTyped();
    };

    if (nameEl && list) {
      nameEl.addEventListener("input", search);
      nameEl.addEventListener("blur", function () { setTimeout(hide, 150); });
      nameEl.addEventListener("keydown", function (e) {
        if (list.hidden) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          active += e.key === "ArrowDown" ? 1 : -1;
          active = (active + currentMatches.length) % currentMatches.length;
          render(currentMatches);
        } else if (e.key === "Enter" && active >= 0) {
          e.preventDefault();
          pick(currentMatches[active]);
        } else if (e.key === "Escape") {
          hide();
        }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hide();
      var attending = attendEl ? attendEl.value : "";
      var declining = attending.indexOf("declines") !== -1;
      var data = {
        name: nameEl ? nameEl.value.trim() : "",
        attending: attending,
        guests: declining ? "0" : autoOne ? "1" : (seatsEl ? seatsEl.value : ""),
        note: (form.querySelector('textarea[name="note"]') || {}).value || ""
      };
      if (!data.name) { say("please tell us your name"); return; }
      if (!ENDPOINT) { say("the rsvp isn’t connected yet — check back soon"); return; }

      // Only a name on the couple's list may be sent. The sheet writes whatever it is
      // given, so this is the only gate: without it a typo becomes a new guest, and the
      // seat count it was checked against is meaningless.
      //
      // The list may not have arrived yet — a guest can reach the button before the
      // observer's fetch lands, or the fetch may have failed. Rather than wave those
      // through (which would leave free text as a hole) or refuse outright (which would
      // strand a real guest on a flaky connection), wait for it here and say so if it
      // still cannot be had, so they can try again.
      button.disabled = true;
      say(guests.length ? "sending…" : "checking the guest list…");
      Promise.resolve(guests.length ? true : loadGuests()).then(function (ok) {
        if (!ok && !guests.length) {
          button.disabled = false;
          say("we couldn’t reach the guest list — please try again in a moment");
          return;
        }
        if (!findGuest(data.name)) {
          button.disabled = false;
          say("");
          sayName("We can’t find that name on our list — please pick yours from the suggestions.");
          if (nameEl) { nameEl.focus(); nameEl.select(); }
          return;
        }
        say("sending…");
        send();
      });
    });

    function send() {
      var attending = attendEl ? attendEl.value : "";
      var declining = attending.indexOf("declines") !== -1;
      var data = {
        name: nameEl ? nameEl.value.trim() : "",
        attending: attending,
        guests: declining ? "0" : autoOne ? "1" : (seatsEl ? seatsEl.value : ""),
        note: (form.querySelector('textarea[name="note"]') || {}).value || ""
      };
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var first = data.name.split(" ")[0].replace(/[<>&]/g, "");
          // the sheet keeps one row per guest: answering again replaces the old
          // answer, and the wording owns that so nobody fears they double-booked
          form.innerHTML = (res && res.updated)
            ? '<p class="rsvp-thanks">All set, ' + first +
              " — we’ve updated your earlier response. 💚</p>"
            : declining
            ? '<p class="rsvp-thanks">Thank you for telling us, ' + first +
              " — you’ll be missed. 🤍</p>"
            : '<p class="rsvp-thanks">Thank you, ' + first +
              " — your seats are saved. See you among the trees. 💚</p>";
        })
        .catch(function () {
          button.disabled = false;
          say("something went wrong — please try again");
        });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
