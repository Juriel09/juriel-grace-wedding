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
    // every photo in mosaic order — the lightbox tour, and the index each tile carries.
    // Held out here because the tiles are distributed across columns, so DOM order is
    // column-by-column and no longer the order a guest reads them in.
    let galleryOrder = [];
    if (grid) {
      // Mixed, not filename-ordered: shot 01..31 came off the camera in sequence, so
      // running them in order groups every photo from the same setup together. The
      // shuffle is seeded, so the mosaic is a mix but the SAME mix on every visit —
      // a gallery that re-orders itself each reload reads as a glitch, and the preview
      // nine would be different every time anyone shared it.
      const mix = (arr) => {
        const a = arr.slice();
        let seed = 11112026;                 // the wedding date, for a repeatable order
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      };
      const shots = mix(Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")));
      // photo-25 opens the gallery — the couple's chosen lead; the rest keep the seeded mix
      shots.splice(shots.indexOf("25"), 1);
      shots.unshift("25");
      // deliberately mixed tile shapes — this is what gives the mosaic its Pinterest
      // stagger; the couple's photos fill whichever tile they land in. The source
      // frames are landscape, so the cycle mixes landscape ratios (3/2, 4/3) with
      // portrait ones instead of cropping every shot down to a tight portrait tile.
      const ars = ["3/2","4/5","1/1","2/3","4/3","3/4","3/2","2/3","4/5","1/1","4/3","3/4","3/2","2/3","4/5","1/1"];

      // Real masonry, not a CSS multicol flow. Multicol balances its columns, so every
      // batch of new photos re-flowed the whole mosaic and threw already-visible tiles
      // up to ~2800px across the page. Here each tile is dealt to the shortest column
      // and then left alone, so revealing more only ever grows the bottom.
      const tiles = shots.map((n, i) => {
        const src = "media/gallery/photo-" + n + ".jpg";
        const ar = ars[i % ars.length];
        const el = document.createElement("button");
        el.className = "gallery-item";
        el.style.setProperty("--ar", ar);
        el.setAttribute("data-index", String(i));
        el.setAttribute("data-full", src);
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "Juriel and Grace, photo " + n;
        // both paths settle the tile: the shimmer in sections.css means "still
        // coming", so a photo that will never arrive must stop it too — otherwise
        // a single missing file shimmers under the gradient for the whole visit
        img.onload = function () { el.classList.add("is-loaded"); };
        img.onerror = function () { el.classList.add("is-loaded"); this.remove(); };
        // Only the preview tiles are put on the wire. The rest stay unfetched until
        // "see more" reaches them: a guest who never expands downloads 9 photos, not 31.
        if (i < PREVIEW) img.src = src;
        el.appendChild(img);
        const parts = ar.split("/");
        // tile height as a multiple of the column width — known from the aspect ratio,
        // so columns can be balanced without waiting for a single image to load
        return { el: el, img: img, src: src, h: Number(parts[1]) / Number(parts[0]), shown: i < PREVIEW };
      });
      galleryOrder = tiles.map((t) => t.src);

      let cols = [];
      const columnCount = () => {
        const cs = getComputedStyle(grid);
        const min = parseFloat(cs.getPropertyValue("--col-min")) || 210;
        const gap = parseFloat(cs.columnGap) || 12;
        return Math.max(1, Math.floor((grid.clientWidth + gap) / (min + gap)));
      };
      const place = (t) => {
        let best = 0;
        for (let i = 1; i < cols.length; i++) if (cols[i].h < cols[best].h) best = i;
        cols[best].el.appendChild(t.el);
        cols[best].h += t.h;
      };
      // full re-deal — only on a width change, where a reflow is expected anyway
      const layout = () => {
        const n = columnCount();
        grid.innerHTML = "";
        cols = [];
        for (let i = 0; i < n; i++) {
          const c = document.createElement("div");
          c.className = "gallery-col";
          grid.appendChild(c);
          cols.push({ el: c, h: 0 });
        }
        tiles.forEach((t) => { if (t.shown) place(t); });
      };
      layout();

      let gt, lastW = grid.clientWidth;
      window.addEventListener("resize", () => {
        if (grid.clientWidth === lastW) return;    // height-only changes (mobile URL bar)
        lastW = grid.clientWidth;
        clearTimeout(gt); gt = setTimeout(layout, 200);
      });

      if (moreBtn) {
        if (tiles.length <= PREVIEW) moreBtn.hidden = true;
        else {
          // "See more" adds a few rows at a time rather than dropping all 22 remaining
          // photos at once — on a phone that was a wall of images and a very long way
          // back to the button.
          const ROWS_PER_PRESS = 3;
          const label = moreBtn.textContent;
          const left = () => tiles.filter((t) => !t.shown).length;
          // The count is the standing indicator: it tells a guest more exists and, once
          // they press, that the number went down — the press is visibly doing something
          // even for the tiles that land below the fold.
          const setLabel = () => { moreBtn.textContent = label + " (" + left() + ")"; };
          setLabel();

          let busy = false;
          moreBtn.addEventListener("click", () => {
            if (busy) return;
            busy = true;
            // a beat on the button first, so the arrival is something you watch happen
            // rather than a batch that has already appeared by the time you look up
            moreBtn.textContent = "Adding photos…";
            moreBtn.classList.add("is-busy");
            setTimeout(() => {
              let budget = columnCount() * ROWS_PER_PRESS, k = 0;
              for (let i = 0; i < tiles.length && budget > 0; i++) {
                const t = tiles[i];
                if (t.shown) continue;
                if (!t.img.getAttribute("src")) t.img.src = t.src;
                // stagger the arrival so the batch reads as photos dropping in one after
                // another, not a block that blinks into place
                t.el.style.animationDelay = (k++ * 70) + "ms";
                t.el.classList.add("is-in");
                t.shown = true;
                place(t);
                budget--;
              }
              moreBtn.classList.remove("is-busy");
              busy = false;
              if (!left()) moreBtn.hidden = true; else setLabel();
            }, 320);
          });
        }
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
      box.classList.remove("open", "has-nav", "is-chart"); body.innerHTML = ""; box.setAttribute("aria-hidden", "true");
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
      // from galleryOrder, not the DOM: tiles live inside their column, so document
      // order runs down column one then column two, which is not the order anyone
      // reading the mosaic would expect the arrows to follow.
      tour = galleryOrder.slice();
      box.classList.add("has-nav");
      openBox("");
      show(Number(item.getAttribute("data-index")) || 0);
    });

    // The dress-code guide opens in this same lightbox — the colour names printed on it
    // are tiny on a phone, and "what do I wear" is the thing a guest most wants to zoom
    // into. Deliberately NOT the `tour` path: it is one image, so it gets no arrows and
    // no "1 / 1" counter, and it keeps its own alt text rather than the gallery's.
    const attireBtn = document.querySelector(".attire-guide");
    if (attireBtn) attireBtn.addEventListener("click", () => {
      const img = attireBtn.querySelector("img");
      if (!img) return;
      tour = []; at = -1;
      if (counter) counter.textContent = "";
      // a reference chart, not a photo — see .lightbox.is-chart in base.css
      box.classList.add("is-chart");
      openBox("");
      const big = document.createElement("img");
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      body.appendChild(big);
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

    // The films — The Proposal and the Wedding Teaser, each in its own full-bleed
    //   section. Each panel names its own file in data-src; the <video> is only created
    //   when its section first scrolls near, so neither film costs anything until it is
    //   looked at. Playing one pauses the other — two soundtracks at once is the one
    //   thing these sections must never do.
    const filmPanels = Array.prototype.slice.call(document.querySelectorAll(".film-panel"));
    if (filmPanels.length) {
      // shown when a film has no file yet, or when the one named fails to load —
      // the section still reads as finished rather than as a broken black box
      const showComingSoon = (panel) => {
        const ph = document.createElement("div");
        ph.className = "film-missing";
        ph.innerHTML = '<span class="film-play">▶</span><span>film coming soon</span>';
        panel.appendChild(ph);
      };

      // Seeking before the metadata has landed is ignored by some browsers and throws
      // in others, so a film that is not ready yet is rewound the moment it is.
      const rewind = (v) => {
        const zero = () => { try { v.currentTime = 0; } catch (e) {} };
        if (v.readyState >= 1) zero();
        else v.addEventListener("loadedmetadata", zero, { once: true });
      };

      const mountFilm = (panel) => {
        if (panel.dataset.mounted) return;
        panel.dataset.mounted = "1";
        // no data-src at all: the film is not cut yet, so say so and load nothing
        if (!panel.getAttribute("data-src")) { showComingSoon(panel); return; }
        const v = document.createElement("video");
        v.src = panel.getAttribute("data-src");
        v.poster = panel.getAttribute("data-poster") || "";
        v.controls = true; v.playsInline = true; v.preload = "metadata";
        v.addEventListener("error", () => { v.remove(); showComingSoon(panel); });
        v.addEventListener("play", () => {
          filmPanels.forEach((p) => {
            const o = p.querySelector("video");
            if (o && o !== v) o.pause();
          });
          // the film takes the stage: the background song steps aside
          if (window.W.Music) window.W.Music.duck();
        });
        // when no film is left playing, the song comes back — but only if it was
        // on before (music.js remembers). Checked across panels because pausing
        // one film to start the other must not resume the song in between.
        const unduckIfIdle = () => {
          const playing = filmPanels.some((p) => {
            const o = p.querySelector("video");
            return o && !o.paused && !o.ended;
          });
          if (!playing && window.W.Music) window.W.Music.unduck();
        };
        v.addEventListener("pause", unduckIfIdle);
        v.addEventListener("ended", unduckIfIdle);
        panel.appendChild(v);
      };

      // Mount early — 200px before the section arrives — so the <video> exists and has
      // its metadata by the time the play observer below wants it.
      const fio = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        mountFilm(e.target);
        fio.unobserve(e.target);
      }), { rootMargin: "200px 0px" });
      filmPanels.forEach((p) => fio.observe(p));

      // Scrolling to a film starts it, and starting it pauses the song (the `play`
      // handler above ducks). Scrolling away pauses it and rewinds, so the film always
      // opens on its first frame rather than resuming from wherever it was abandoned —
      // and pausing lets the song back in through `unduckIfIdle`.
      //
      // The play() may be refused: browsers only allow sound without a gesture once the
      // visitor has interacted with the page. There is no fallback to muted playback on
      // purpose — a wedding film running silently is worse than one waiting politely on
      // its poster, and the controls are right there.
      const playio = new IntersectionObserver((es) => es.forEach((e) => {
        const v = e.target.querySelector("video");
        if (!v) return;
        if (e.isIntersecting) {
          rewind(v);
          v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();                       // `pause` unducks; rewind waits for re-entry
        }
      }), { threshold: 0.5 });
      filmPanels.forEach((p) => playio.observe(p));
    }

    // drone-shot section video: lazy-load + play only when visible (perf)
    const dv = document.getElementById("droneVideo");
    if (dv) {
      const vio = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { if (!dv.src) dv.src = "media/video/drone-shot.mp4"; dv.play().catch(() => {}); }
        else dv.pause();
      }), { threshold: 0.2 });
      vio.observe(document.getElementById("hero"));
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
    const droneSec = document.getElementById("hero");
    const droneVid = document.getElementById("droneVideo");
    const cardScroll = document.getElementById("cardScroll");
    // The nav appears as the card scene hands off to whatever section follows it.
    // Derived rather than named: the running order has been rearranged more than
    // once, and hard-coding the wrong section leaves the nav hidden for pages.
    const handoffSec = (cardScroll && cardScroll.nextElementSibling) || droneSec;

    let handoffTop = 0, droneTop = 0;
    const measure = () => {
      // offsetTop is layout-relative, so it is stable regardless of scroll position
      handoffTop = handoffSec ? handoffSec.offsetTop
                 : cardScroll ? cardScroll.offsetHeight
                 : 0;
      droneTop = droneSec ? droneSec.offsetTop : 0;
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    let lastY = -1, navOn = null;
    const frame = () => {
      const y = window.pageYOffset;
      if (y !== lastY) {
        lastY = y;
        const dist = handoffTop - y;            // handoff section's distance from the top
        if (droneVid) {
          // parallax is measured from the drone section itself, which no longer
          // sits at the handoff point. Snap to a tenth of a pixel: raw sub-pixel
          // values make the video shimmer.
          const shift = Math.round((droneTop - y) * -0.12 * 10) / 10;
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
                    teaser: "#teaser", details: "#details", entourage: "#entourage", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.W.cardOpened) window.W.cardOpened(); // lift the card gate for a deliberate jump
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
