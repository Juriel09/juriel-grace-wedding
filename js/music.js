/* Background music — a little vinyl toggle by the theme button, and the ONE sound
   on the page: the song plays from the opening film onward (the film itself is
   always muted — its own audio is unused), and the same vinyl floats above the
   film and toggles the song there like everywhere else. ALWAYS on by default —
   every visit opens with the vinyl spinning; stopping it lasts for the visit only.
   Browsers block unmuted autoplay without user activation, so the song is attempted at
   once and, if refused, starts on the visitor's first real interaction (tap, click, key
   — the Skip button counts). It is also re-attempted on jg:intro-done, when the opening
   film ends or is skipped.
   One more thing: tapping the vinyl 11 times in a row — the couple's 11.11 — swaps
   the record for the joke track; 11 more swaps back. Both filenames live in the two
   constants below and nowhere else. */
(function () {
  "use strict";
  window.W = window.W || {};
  var TRACK_MAIN = "media/audio/bless-the-broken-road-violin.mp3";
  var TRACK_PREV = "media/audio/never-gonna-give-you-up.mp3";   // the joke on the B-side
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

  // Autoplay fallback: start the song on the very first interaction, film or no film.
  //
  // The list names every event that can grant *user activation*, which is what unlocks
  // sound. click / touchend / pointerup are the canonical ones — a touch grants
  // activation on release, not on touchstart, and a wheel never grants it at all — so
  // they lead. The rest follow as a wider net; whichever fires first wins, and the
  // handler is one-shot. (Measured: the older, narrower list also caught the first tap
  // under emulated touch. This is hardening for real devices, not a fixed bug.)
  var GESTURES = ["click", "touchend", "pointerup", "pointerdown", "mousedown",
                  "keydown", "touchstart", "wheel"];
  var gestureOn = null;
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
    // read the constant, never a filename spelled out again here: when the tracks were
    // last swapped this test still named the retired file, so 11 more taps could never
    // bring the main song back
    var onPrev = audio.src.indexOf(TRACK_PREV) !== -1;
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
    started = false;
    reallyPlay();          // reflect(true) lands only if it really resumes
  }

  function init() {
    audio = document.getElementById("bgMusic");
    btn = document.getElementById("musicToggle");
    if (!btn) return;
    if (audio) audio.volume = 0.5;
    wantOn = true;                  // every visit opens with the music on
    btn.addEventListener("click", toggle);
    // Honest, not hopeful: the vinyl spun from load because this reflected the *intent*
    // to play. On a browser that refuses autoplay that meant a spinning record over a
    // silent page — the single loudest reason the music looks broken. It now starts
    // still and spins when sound actually arrives.
    reflect(false);
    // Try immediately: a returning visitor whose browser already trusts this site
    // gets the song from the moment the page paints, under the opening film.
    if (wantOn) start();
    // intro.js fires this when the film ends or is skipped, and again when the film is
    // bypassed outright (reduced motion, deep link). It was being dispatched with
    // nobody listening, so that second chance to start the song was simply lost.
    window.addEventListener("jg:intro-done", start);
  }

  window.W.Music = { init: init, toggle: toggle, duck: duck, unduck: unduck };
})();
