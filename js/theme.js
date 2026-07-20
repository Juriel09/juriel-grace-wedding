/* Light/dark theme: persists to localStorage, reflects on <html data-theme>,
   and announces changes via a "themechange" window event. The initial value is
   set by an inline <head> script (anti-FOUC); this module wires the toggle and
   keeps everything in sync. */
(function () {
  "use strict";
  window.W = window.W || {};
  var KEY = "jg-theme";
  var root = document.documentElement;

  function get() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function apply(mode) {
    root.setAttribute("data-theme", mode);
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: mode } }));
  }
  function set(mode) { if (mode !== get()) apply(mode); }
  function toggle() { apply(get() === "dark" ? "light" : "dark"); }

  function init() {
    var btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", toggle);
    // announce the initial (inline-set) theme once, so the scene can sync on load
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: get() } }));
  }

  window.W.Theme = { get: get, set: set, toggle: toggle, init: init };
})();
