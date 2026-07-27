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

    // Section snapping + drone parallax, driven off Lenis.
    //  Parallax: the drone video drifts slower than the scroll for depth.
    //  Snap: every section is a full-screen stop. From a settled section a single
    //  scroll glides the next one fully into view; the card's final details state
    //  counts as a stop, so one scroll past it lands on the drone. Sections taller
    //  than the screen are scrolled through normally and only hand off to the next
    //  once their far edge is reached — nothing gets clipped. Scrolling back up the
    //  card scrub scene is never blocked (the card itself is not a snap stop).
    const lenis = window.__lenis;
    const droneSec = document.getElementById("drone");
    const droneVid = document.getElementById("droneVideo");
    if (lenis) {
      const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      // Phones scroll by gesture, so they get "smart scroll" instead of the peek-snap:
      // a quick flick jumps to the next section, a gentle drag scrolls normally.
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      // ordered full-screen stops, top to bottom. The card scrub scene above is
      // deliberately excluded; the footer sits naturally below the last stop.
      const stops = ["drone", "gallery", "film", "entourage", "rsvp"]
        .map((id) => document.getElementById(id)).filter(Boolean);

      const parallax = () => {
        if (!droneSec || !droneVid) return;
        const top = droneSec.getBoundingClientRect().top;
        droneVid.style.transform = "translate3d(0," + (top * -0.12) + "px,0) scale(1.25)";
      };

      // glide a stop to fill the screen. Sections that fit align to their top;
      // taller ones align to their bottom edge so lower content isn't skipped.
      const snapTo = (el, align, onDone) => {
        const h = el.getBoundingClientRect().height, ih = window.innerHeight;
        const offset = align === "bottom" ? Math.max(0, h - ih) : 0;
        lenis.scrollTo(el, { offset: offset, duration: 1.1, easing: easeInOutCubic, onComplete: onDone });
      };

      // curIdx = the stop we're anchored to (-1 = the card scene, above the first
      // stop). We move one stop at a time, so scrolling a tall stop never re-snaps
      // onto itself. cardParked = the card is fully open/revealed and waiting for
      // the user's next scroll. locked = a card-open glide owns the scroll for now.
      let snapping = false, curIdx = -1, cardParked = false, locked = false, releaseT;

      const cardEndY = () => {
        const cs = document.getElementById("cardScroll");
        return cs ? (cs.offsetTop + cs.offsetHeight - window.innerHeight) : 0;
      };
      const anchor = (i, align) => {
        snapping = true; curIdx = i; cardParked = false;
        clearTimeout(releaseT);
        const release = () => { snapping = false; };
        snapTo(stops[i], align, release);
        releaseT = setTimeout(release, 1300); // fallback if onComplete is missed
      };
      // park exactly on the fully-open card, absorbing scroll momentum so it does
      // NOT run on into the first section — the card simply stays revealed.
      const parkCard = () => {
        snapping = true; curIdx = -1; cardParked = true;
        clearTimeout(releaseT);
        const release = () => { snapping = false; };
        lenis.scrollTo(cardEndY(), { duration: 0.6, easing: easeInOutCubic, onComplete: release });
        releaseT = setTimeout(release, 900);
      };

      // let the card's click-to-open coordinate with the snap: hold off while it
      // glides, then mark the card revealed so one later scroll advances to the drone.
      window.W.snapLock = (v) => { locked = !!v; };
      window.W.cardOpened = () => { snapping = false; curIdx = -1; cardParked = true; };

      // A deep link drops the visitor straight into a section, so the snap has to be
      // told where they landed — otherwise curIdx is still -1 ("in the card scene")
      // and the card branch would glide them back up to the envelope on first scroll.
      window.W.snapSyncFromScroll = () => {
        snapping = false; cardParked = false;
        if (window.scrollY < cardEndY() - 4) { curIdx = -1; return; }
        const probe = window.innerHeight * 0.3;
        let idx = 0;
        stops.forEach((s, i) => { if (s.getBoundingClientRect().top <= probe) idx = i; });
        curIdx = idx;
      };

      const EPS = 8; // a small peek (px) of the next stop commits — no settle delay
      lenis.on("scroll", (e) => {
        parallax();
        if (snapping || locked) return;                 // a glide owns the scroll
        const ih = window.innerHeight, y = window.scrollY;
        const dir = e && e.direction != null ? e.direction : 0;
        // scrolled well back up into the card scrub — arm the reveal-pause again
        if (curIdx === -1 && y < cardEndY() - ih * 0.5) cardParked = false;
        // touch: flicks drive navigation and the branches below bail out, so re-arm
        // the card scene here when the visitor scrolls back up into it
        if (isTouch && y < cardEndY() - 4 && curIdx !== -1) { curIdx = -1; cardParked = false; }

        if (dir > 0) {
          if (curIdx === -1) {
            // in the card scene: scrub the envelope open freely. Once it is fully
            // open, PARK there (card + text revealed) and wait. Only a real scroll
            // PAST the card end slides the first section in — a stray settle event
            // (velocity ~0, still sitting on the card) must not advance on its own.
            const end = cardEndY();
            if (y >= end - 4) {
              if (!cardParked) parkCard();
              else if (y > end + EPS) anchor(0, "top");
            }
            return;
          }
          if (isTouch) return;   // touch: only a deliberate flick navigates (below)
          // scrolling down through the sections: the instant the next stop peeks in,
          // glide to it. A tall current stop only lets the next peek once its end is
          // reached, so it is scrolled through normally first.
          const n = curIdx + 1;
          if (n < stops.length) {
            const top = stops[n].getBoundingClientRect().top;
            if (top > EPS && top < ih - EPS) anchor(n, "top");
          }
        } else if (dir < 0) {
          // scrolling up: once the current stop's top edge slips past, hand off to
          // the previous stop (entering a tall one at its bottom). Above the first
          // stop lies the card scene — released to free scroll.
          if (curIdx < 0) return;
          if (isTouch) return;   // touch: only a deliberate flick navigates (below)
          if (stops[curIdx].getBoundingClientRect().top > EPS) {
            const p = curIdx - 1;
            if (p < 0) { curIdx = -1; cardParked = true; return; }
            const tall = stops[p].getBoundingClientRect().height > ih + 8;
            anchor(p, tall ? "bottom" : "top");
          }
        }
      });
      // MOBILE SMART SCROLL. A quick flick reads as "take me to the next section" and
      // glides to it; a gentle drag is left alone so the whole section can be read at
      // the visitor's own pace. Thresholds: the swipe must be both long enough and
      // fast enough, so ordinary reading-scrolls never trigger navigation.
      if (isTouch) {
        const FLICK_V = 0.55;  // px per ms — above this reads as a deliberate swipe
        const FLICK_D = 45;    // px — ignore small nudges
        let sy = 0, st = 0;
        // Flick destinations are the sections a visitor actually moves between — the
        // linked ones plus the drone. Note this INCLUDES the tall Our Story timeline,
        // which the desktop peek-snap deliberately skips; a flick should land on it,
        // not jump over it to the gallery.
        const flickStops = ["drone", "story", "gallery", "film", "entourage", "rsvp"]
          .map((id) => document.getElementById(id)).filter(Boolean);

        // glide to a section that may or may not be a peek-snap stop, keeping curIdx
        // meaningful (it only has to stay >= 0 to mean "past the card scene")
        const flickGlide = (el, align) => {
          snapping = true; cardParked = false;
          clearTimeout(releaseT);
          const release = () => { snapping = false; };
          const i = stops.indexOf(el);
          curIdx = i >= 0 ? i : (curIdx < 0 ? 0 : curIdx);
          snapTo(el, align, release);
          releaseT = setTimeout(release, 1300);
        };

        // Which section are we on? Test against a probe line a third of the way down
        // the screen rather than the very top edge — parking on a section leaves its
        // top at ~0 give or take a sub-pixel, and a hairline test flickers between
        // this section and the previous one. -1 = above them all (the card scene).
        const currentIdx = () => {
          const probe = window.innerHeight * 0.3;
          for (let i = flickStops.length - 1; i >= 0; i--) {
            const r = flickStops[i].getBoundingClientRect();
            if (r.top <= probe && r.bottom > probe) return i;
          }
          return -1;
        };

        const flick = (d) => {
          if (snapping || locked) return;
          if (window.scrollY < cardEndY() - 4) return; // the card intro owns its own scrub
          const t = currentIdx() + (d > 0 ? 1 : -1);
          if (t < 0 || t >= flickStops.length) return;
          const el = flickStops[t];
          const tall = el.getBoundingClientRect().height > window.innerHeight + 8;
          // going back up into a tall section, enter at its far end
          flickGlide(el, d < 0 && tall ? "bottom" : "top");
        };
        window.addEventListener("touchstart", (e) => {
          if (!e.touches || !e.touches.length) return;
          sy = e.touches[0].clientY; st = performance.now();
        }, { passive: true });
        window.addEventListener("touchend", (e) => {
          const t = e.changedTouches && e.changedTouches[0];
          if (!t || !st) return;
          const dy = sy - t.clientY, dt = performance.now() - st;
          st = 0;
          if (dt <= 0 || Math.abs(dy) < FLICK_D) return;   // too small — normal scroll
          if (Math.abs(dy) / dt < FLICK_V) return;          // too slow — normal scroll
          flick(dy > 0 ? 1 : -1);                           // swipe up = go down the page
        }, { passive: true });
      }

      parallax();
      window.addEventListener("resize", parallax);
    }

    // nav: hidden for the whole card/envelope scene, slides in only once the first
    // non-card section takes over the viewport (card end-state stays nav-free).
    const nav = document.getElementById("nav");
    const cardScroll = document.getElementById("cardScroll");
    const afterCard = document.getElementById("drone"); // first section past the card
    const onScroll = () => {
      let past;
      if (afterCard) past = afterCard.getBoundingClientRect().top <= window.innerHeight * 0.5;
      else if (cardScroll) past = window.scrollY >= cardScroll.offsetHeight - window.innerHeight;
      else past = window.scrollY > 80;
      document.body.classList.toggle("nav-visible", past);
      document.documentElement.classList.toggle("intro", !past); // hide scrollbar during intro
      nav.classList.toggle("scrolled", past);
    };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-jump");
      const map = { intro: "#top", story: "#story", gallery: "#gallery", film: "#film",
                    entourage: "#entourage", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
