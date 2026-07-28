/* Act 3: scroll-reveal, gallery + lightbox, film player, nav state, jump links. */
(function () {
  "use strict";
  window.W = window.W || {};

  function initSections() {
    // Masonry gallery. Drop real files at media/gallery/photo-01.jpg … and they show at
    // their natural height; missing ones fall back to a varied placeholder tile. Add or
    // remove entries in `shots` to match how many photos the couple has (tools/build-gallery.js
    // writes them, so keep this count in step with that script's SELECTED list).
    const grid = document.getElementById("galleryGrid");
    const moreBtn = document.getElementById("galleryMore");
    // The section opens as a tidy 9-tile preview; "see more" unfolds the rest, so the
    // gallery never dumps 29 photos on a guest who is just passing through.
    const PREVIEW = 9;
    if (grid) {
      const shots = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
      // deliberately mixed tile shapes — this is what gives the mosaic its Pinterest
      // stagger; the couple's photos fill whichever tile they land in. The source
      // frames are landscape, so the cycle mixes landscape ratios (3/2, 4/3) with
      // portrait ones instead of cropping every shot down to a tight portrait tile.
      const ars = ["3/2","4/5","1/1","2/3","4/3","3/4","3/2","2/3","4/5","1/1","4/3","3/4","3/2","2/3","4/5","1/1"];
      // Only the 9 preview tiles carry a real `src`. The rest hold their file in
      // `data-src` and stay off the wire entirely until "see more" is pressed —
      // a guest who never expands the mosaic downloads 9 photos, not 29.
      grid.innerHTML = shots.map((n, i) => {
        const more = i >= PREVIEW;
        const src = "media/gallery/photo-" + n + ".jpg";
        return '<button class="gallery-item' + (more ? " is-more" : "") + '" ' +
          'style="--ar:' + ars[i % ars.length] + '" ' +
          'data-index="' + i + '" data-full="' + src + '">' +
          '<img loading="lazy" ' + (more ? 'data-src="' : 'src="') + src + '" ' +
          'alt="Juriel and Grace, photo ' + n + '" onerror="this.remove()"></button>';
      }).join("");

      if (moreBtn) {
        if (shots.length <= PREVIEW) moreBtn.hidden = true;
        else moreBtn.addEventListener("click", () => {
          // hand the deferred tiles their src; `loading="lazy"` still keeps the ones
          // below the fold from fetching until they are scrolled towards.
          grid.querySelectorAll(".gallery-item.is-more img[data-src]").forEach((img) => {
            img.src = img.getAttribute("data-src");
            img.removeAttribute("data-src");
          });
          grid.classList.add("show-all");
          moreBtn.hidden = true;
        }, { once: true });
      }
    }

    // scroll reveal
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    // lightbox — doubles as the film player, so the photo arrows only appear when a
    // gallery tile opened it (`.has-nav`).
    const box = document.getElementById("lightbox");
    const body = document.getElementById("lightboxBody");
    const counter = document.getElementById("lightboxCount");
    const openBox = (html) => { body.innerHTML = html; box.classList.add("open"); box.setAttribute("aria-hidden", "false"); };
    const shut = () => {
      box.classList.remove("open", "has-nav"); body.innerHTML = ""; box.setAttribute("aria-hidden", "true");
      tour = []; at = -1;
    };
    document.getElementById("lightboxClose").addEventListener("click", shut);
    box.addEventListener("click", (e) => { if (e.target === box) shut(); });

    // The arrows walk every photo in the gallery, not just the 9 in the preview — once
    // a guest is looking at one frame there is no reason to stop them at the fold.
    let tour = [];   // full-size srcs, in mosaic order
    let at = -1;     // which one is on screen

    const show = (i) => {
      if (!tour.length) return;
      at = (i + tour.length) % tour.length;                 // wrap at both ends
      body.innerHTML = '<img src="' + tour[at] + '" alt="Juriel and Grace, photo ' + (at + 1) + '">';
      if (counter) counter.textContent = (at + 1) + " / " + tour.length;
      // warm the neighbours so a click on the arrow feels instant
      [at + 1, at - 1].forEach((j) => {
        const src = tour[(j + tour.length) % tour.length];
        if (src) { const pre = new Image(); pre.src = src; }
      });
    };
    const step = (d) => { if (box.classList.contains("has-nav")) show(at + d); };

    document.getElementById("lightboxPrev").addEventListener("click", () => step(-1));
    document.getElementById("lightboxNext").addEventListener("click", () => step(1));
    document.addEventListener("keydown", (e) => {
      if (!box.classList.contains("open")) return;
      if (e.key === "Escape") shut();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });

    // swipe, for the phones this site mostly gets viewed on
    let touchX = null;
    box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    if (grid) grid.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery-item"); if (!item) return;
      tour = Array.from(grid.querySelectorAll(".gallery-item")).map((el) => el.getAttribute("data-full"));
      box.classList.add("has-nav");
      openBox("");
      show(Number(item.getAttribute("data-index")) || 0);
    });

    // Shared opener so other sections (Our Story) can reuse this one lightbox and its
    // arrow/swipe tour instead of standing up a second one.
    window.W.openLightbox = (srcs, start) => {
      if (!srcs || !srcs.length) return;
      tour = srcs.slice();
      box.classList.add("has-nav");
      openBox("");
      show(start || 0);
    };

    const film = document.getElementById("filmPlay");
    if (film) film.addEventListener("click", () =>
      // Replace src with the couple's real film (file or YouTube/Vimeo embed).
      openBox('<video src="media/video/prenup.mp4" controls autoplay playsinline style="max-width:90vw;max-height:85vh"></video>')
    );

    // drone-shot section video: lazy-load + play only when visible (perf)
    const dv = document.getElementById("droneVideo");
    if (dv) {
      const vio = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { if (!dv.src) dv.src = "media/video/drone-shot.mp4"; dv.play().catch(() => {}); }
        else dv.pause();
      }), { threshold: 0.2 });
      vio.observe(document.getElementById("drone"));
    }

    // (Section snapping and the mobile flick-to-next navigation were removed so
    // scrolling is fully natural on every device; the hooks below stay as no-ops so
    // their callers in cardScene/router keep working. `cardOpened` is a real hook —
    // cardScene owns it, so it is deliberately NOT stubbed here.)
    window.W.snapLock = function () {};
    window.W.snapSyncFromScroll = function () {};

    // Drone parallax + nav state, on one rAF.
    //   Both of these used to run off scroll events and read getBoundingClientRect()
    //   every time — a forced synchronous layout per event, on top of Lenis's own
    //   per-frame work. That is what made the drone section stutter. Offsets are now
    //   measured once (and on resize) and the transform is written a single time per
    //   frame, so scrolling never triggers a layout.
    const nav = document.getElementById("nav");
    const droneSec = document.getElementById("drone");
    const droneVid = document.getElementById("droneVideo");
    const cardScroll = document.getElementById("cardScroll");

    let handoffTop = 0;
    const measure = () => {
      // offsetTop is layout-relative, so it is stable regardless of scroll position
      handoffTop = droneSec ? droneSec.offsetTop
                 : cardScroll ? cardScroll.offsetHeight
                 : 0;
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    let lastY = -1, navOn = null;
    const frame = () => {
      const y = window.pageYOffset;
      if (y !== lastY) {
        lastY = y;
        const dist = handoffTop - y;            // drone section's distance from the top
        if (droneVid) {
          // snap to a tenth of a pixel: raw sub-pixel values make the video shimmer
          const shift = Math.round(dist * -0.12 * 10) / 10;
          droneVid.style.transform = "translate3d(0," + shift + "px,0) scale(1.25)";
        }
        // nav: hidden for the whole card/envelope scene, slides in once the first
        // non-card section takes over. The two thresholds give it hysteresis — with a
        // single one, a hair of scroll flipped the class back and forth, and since
        // `.intro` hides the scrollbar that re-flowed the page on every flip.
        const past = navOn ? dist <= window.innerHeight * 0.58
                           : dist <= window.innerHeight * 0.5;
        if (past !== navOn) {
          navOn = past;
          document.body.classList.toggle("nav-visible", past);
          document.documentElement.classList.toggle("intro", !past);
          if (nav) nav.classList.toggle("scrolled", past);
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-jump");
      const map = { intro: "#top", story: "#story", gallery: "#gallery", film: "#film",
                    entourage: "#entourage", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.W.cardOpened) window.W.cardOpened(); // lift the card gate for a deliberate jump
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
