/* Act 3: scroll-reveal, gallery + lightbox, film player, nav state, jump links. */
(function () {
  "use strict";
  window.W = window.W || {};

  function initSections() {
    // Masonry gallery. Drop real files at media/gallery/photo-01.jpg … and they show at
    // their natural height; missing ones fall back to a varied placeholder tile. Add or
    // remove entries in `shots` to match how many photos the couple has.
    const grid = document.getElementById("galleryGrid");
    if (grid) {
      const shots = ["01","02","03","04","05","06","07","08","09"];
      const ars = ["3/4","4/5","1/1","4/5","3/4","4/3","3/4","1/1","4/5"]; // uneven placeholder heights
      grid.innerHTML = shots.map((n, i) =>
        '<button class="gallery-item is-empty" style="--ar:' + ars[i % ars.length] + '" ' +
        'data-full="media/gallery/photo-' + n + '.jpg">' +
        '<img loading="lazy" src="media/gallery/photo-' + n + '.jpg" alt="Juriel and Grace, photo ' + n + '" ' +
        'onload="this.closest(\'.gallery-item\').classList.remove(\'is-empty\')" ' +
        'onerror="this.remove()"></button>'
      ).join("");
    }

    // scroll reveal
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    // lightbox
    const box = document.getElementById("lightbox");
    const body = document.getElementById("lightboxBody");
    const openBox = (html) => { body.innerHTML = html; box.classList.add("open"); box.setAttribute("aria-hidden", "false"); };
    const shut = () => { box.classList.remove("open"); body.innerHTML = ""; box.setAttribute("aria-hidden", "true"); };
    document.getElementById("lightboxClose").addEventListener("click", shut);
    box.addEventListener("click", (e) => { if (e.target === box) shut(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") shut(); });

    if (grid) grid.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery-item"); if (!item) return;
      openBox('<img src="' + item.getAttribute("data-full") + '" alt="">');
    });

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

      const EPS = 8; // a small peek (px) of the next stop commits — no settle delay
      lenis.on("scroll", (e) => {
        parallax();
        if (snapping || locked) return;                 // a glide owns the scroll
        const ih = window.innerHeight, y = window.scrollY;
        const dir = e && e.direction != null ? e.direction : 0;
        // scrolled well back up into the card scrub — arm the reveal-pause again
        if (curIdx === -1 && y < cardEndY() - ih * 0.5) cardParked = false;

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
          if (stops[curIdx].getBoundingClientRect().top > EPS) {
            const p = curIdx - 1;
            if (p < 0) { curIdx = -1; cardParked = true; return; }
            const tall = stops[p].getBoundingClientRect().height > ih + 8;
            anchor(p, tall ? "bottom" : "top");
          }
        }
      });
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
      const map = { intro: "#top", story: "#story", gallery: "#gallery", film: "#film", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
