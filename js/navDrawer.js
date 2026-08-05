/* The phone nav drawer.

   Eight links do not fit a 390px bar, so below 720px they live in a panel that
   slides in from the right. It is the SAME <nav class="nav-links"> element the
   desktop bar uses — only the CSS moves it — so there is one copy of every link
   and js/sections.js's [data-jump] wiring keeps working with nothing to keep in
   step. Everything here is behaviour the stylesheet can't do on its own: the
   toggle, the scroll lock, and keeping the keyboard inside the drawer while it
   is open. */
(function () {
  "use strict";
  window.W = window.W || {};

  function init() {
    var burger = document.getElementById("navBurger");
    var panel = document.getElementById("navLinks");
    var scrim = document.getElementById("navScrim");
    if (!burger || !panel) return;

    var open = false;
    var mq = window.matchMedia("(max-width: 720px)");

    var links = function () {
      return Array.prototype.slice.call(panel.querySelectorAll("a[href]"));
    };

    function setOpen(next) {
      if (next === open) return;
      open = next;
      document.body.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      // the same control closes it, so it must not keep announcing itself as "Menu"
      burger.setAttribute("aria-label", open ? "Close menu" : "Menu");

      // Lenis drives the page's scroll, and overflow:hidden alone does not stop
      // it — the page would keep gliding along behind the drawer.
      if (window.__lenis) {
        if (open) window.__lenis.stop(); else window.__lenis.start();
      }
      // Both elements, because base.css puts overflow-x:hidden on <body> and that
      // makes the body its own scroll container — locking <html> alone is not
      // guaranteed to be locking the thing that actually scrolls.
      document.documentElement.style.overflow = open ? "hidden" : "";
      document.body.style.overflow = open ? "hidden" : "";

      if (open) {
        var first = links()[0];
        if (first) first.focus({ preventScroll: true });
      } else {
        // send focus back to the control that opened it, but not if the drawer
        // is closing because a link was taken — that link owns what happens next
        if (document.activeElement === document.body || panel.contains(document.activeElement)) {
          burger.focus({ preventScroll: true });
        }
      }
    }

    burger.addEventListener("click", function () { setOpen(!open); });
    if (scrim) scrim.addEventListener("click", function () { setOpen(false); });

    // Capture, so this runs BEFORE the link's own [data-jump] handler in
    // sections.js: that handler calls lenis.scrollTo, and a Lenis that is still
    // stopped will not scroll anywhere.
    panel.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a[href]")) setOpen(false);
    }, true);

    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "Tab") return;
      // the drawer covers the page, so tabbing must not wander off behind it
      var stops = [burger].concat(links());
      var first = stops[0], last = stops[stops.length - 1];
      var at = document.activeElement;
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      else if (stops.indexOf(at) === -1) { e.preventDefault(); first.focus(); }
    });

    // rotating a phone, or a tablet crossing the breakpoint, puts the links back
    // in the bar — the drawer's scroll lock must not survive that
    var onBreak = function () { if (!mq.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onBreak);
    else if (mq.addListener) mq.addListener(onBreak);
  }

  window.W.initNavDrawer = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
