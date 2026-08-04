/* Background music — a little vinyl toggle by the theme button, and the ONE sound
   on the page: the song plays from the opening film onward (the film itself is
   always muted — its own audio is unused), and the same vinyl floats above the
   film and toggles the song there like everywhere else. ALWAYS on by default —
   every visit opens with the vinyl spinning; stopping it lasts for the visit only.
   Browsers block unmuted autoplay, so playback starts on the visitor's first
   interaction (tap, scroll, key — the skip button counts).
   One more thing: tapping the vinyl 11 times in a row — the couple's 11.11 — swaps
   in the previous background song; 11 more swaps back. */
(function () {
  "use strict";
  window.W = window.W || {};
  var TRACK_MAIN = "media/audio/bless-the-broken-road.mp3";
  var TRACK_PREV = "media/audio/bg-music.mp3";      // the old song lives on as the code
  var audio, btn, wantOn = false, started = false, armed = false;

  // reflect the toggle's *intent*: the vinyl spins whenever music is enabled
  function reflect(on) {
    if (!btn) return;
    btn.classList.toggle("playing", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Turn music off" : "Turn music on");
  }

  function reallyPlay() {
    if (!audio || !wantOn) return;
    audio.play().then(function () { started = true; disarm(); reflect(true); }).catch(armGesture);
  }

  // autoplay fallback: start the song on the very first interaction, film or no film
  var GESTURES = ["pointerdown", "touchstart", "keydown", "wheel"], gestureOn = null;
  function disarm() {
    if (gestureOn) GESTURES.forEach(function (e) { window.removeEventListener(e, gestureOn); });
    gestureOn = null; armed = false;
  }
  function armGesture() {
    if (armed) return; armed = true;
    gestureOn = function () {
      disarm();                                  // one-shot — never linger to hijack later clicks
      reallyPlay();
    };
    GESTURES.forEach(function (e) { window.addEventListener(e, gestureOn, { passive: true }); });
  }

  function start() {
    if (started || !wantOn) return;
    reallyPlay();
  }

  // ---- the 11-tap code: consecutive means less than a beat apart ----
  var taps = 0, tapTimer = null;
  function countTap() {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { taps = 0; }, 1000);
    if (taps < 11) return false;
    taps = 0;
    if (!audio) return false;
    var onPrev = audio.src.indexOf("bg-music") !== -1;
    audio.src = onPrev ? TRACK_MAIN : TRACK_PREV;
    wantOn = true; started = false;
    reallyPlay();
    return true;             // the 11th tap changes the record instead of toggling
  }

  function toggle() {
    if (countTap()) return;
    ducked = false;                 // a deliberate tap overrides any film ducking
    wantOn = !wantOn;
    reflect(wantOn);
    if (wantOn) { started = false; reallyPlay(); }   // a click is a gesture, so this plays
    else if (audio) { audio.pause(); started = false; }
  }

  // ---- ducking: a playing film owns the stage ----
  // sections.js calls duck() when a film video starts and unduck() when none is
  // playing anymore. The song only resumes if it was actually on before the film —
  // a vinyl that was already stopped stays stopped.
  var ducked = false, resumeAfter = false;
  function duck() {
    if (ducked) return;
    ducked = true;
    resumeAfter = wantOn;
    wantOn = false; started = false;
    if (audio) audio.pause();
    reflect(false);
  }
  function unduck() {
    if (!ducked) return;
    ducked = false;
    if (!resumeAfter) return;       // it was silent before the film — stay silent
    wantOn = true;
    reflect(true);
    started = false;
    reallyPlay();
  }

  function init() {
    audio = document.getElementById("bgMusic");
    btn = document.getElementById("musicToggle");
    if (!btn) return;
    if (audio) audio.volume = 0.5;
    wantOn = true;                  // every visit opens with the music on
    btn.addEventListener("click", toggle);
    reflect(wantOn);
    if (wantOn) start();
  }

  window.W.Music = { init: init, toggle: toggle, duck: duck, unduck: unduck };
})();
