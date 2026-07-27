/* Background music — a little vinyl toggle by the theme button. On by default and
   persisted to localStorage. Browsers block unmuted autoplay, so playback starts
   the moment the opening film is dismissed (usually already a user gesture) or, as
   a fallback, on the visitor's first interaction — and never while the intro's own
   audio is still playing, so the two never overlap. */
(function () {
  "use strict";
  window.W = window.W || {};
  var KEY = "jg-music";
  var audio, btn, wantOn = false, started = false, armed = false;

  function lsGet() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // reflect the toggle's *intent*: the vinyl spins whenever music is enabled
  function reflect(on) {
    if (!btn) return;
    btn.classList.toggle("playing", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Turn music off" : "Turn music on");
  }

  // is the opening film still on screen (and thus its bird audio possibly playing)?
  function introActive() {
    var f = document.getElementById("introFilm");
    if (!f || f.classList.contains("done")) return false;
    return getComputedStyle(f).display !== "none";
  }

  function reallyPlay() {
    if (!audio || !wantOn) return;
    audio.play().then(function () { started = true; disarm(); reflect(true); }).catch(armGesture);
  }

  // start on the first interaction, but hold off until the intro is gone
  var GESTURES = ["pointerdown", "touchstart", "keydown", "wheel"], gestureOn = null;
  function disarm() {
    if (gestureOn) GESTURES.forEach(function (e) { window.removeEventListener(e, gestureOn); });
    gestureOn = null; armed = false;
  }
  function armGesture() {
    if (armed) return; armed = true;
    gestureOn = function () {
      if (introActive()) return;                 // let the intro's own audio finish first
      disarm();                                  // one-shot — never linger to hijack later clicks
      reallyPlay();
    };
    GESTURES.forEach(function (e) { window.addEventListener(e, gestureOn, { passive: true }); });
  }

  function start() {
    if (started || !wantOn) return;
    if (introActive()) {
      window.addEventListener("jg:intro-done", reallyPlay, { once: true }); // preferred trigger
      armGesture();                                                          // fallback
    } else {
      reallyPlay();
    }
  }

  function toggle() {
    wantOn = !wantOn;
    lsSet(wantOn ? "on" : "off");
    reflect(wantOn);
    if (wantOn) { started = false; reallyPlay(); }   // a click is a gesture, so this plays
    else if (audio) { audio.pause(); started = false; }
  }

  function init() {
    audio = document.getElementById("bgMusic");
    btn = document.getElementById("musicToggle");
    if (!btn) return;
    if (audio) audio.volume = 0.5;
    wantOn = lsGet() !== "off";     // default ON
    btn.addEventListener("click", toggle);
    reflect(wantOn);
    if (wantOn) start();
  }

  window.W.Music = { init: init, toggle: toggle };
})();
