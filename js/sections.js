/* Act 3: scroll-reveal, gallery + lightbox, film player, nav state, jump links. */
(function () {
  "use strict";
  window.W = window.W || {};

  function initSections() {
    // dummy gallery (swap data-src + add real files to media/gallery/ later)
    const grid = document.getElementById("galleryGrid");
    if (grid) {
      const shots = ["01","02","03","04","05","06"];
      grid.innerHTML = shots.map((n) =>
        '<button class="gallery-item" data-full="media/gallery/photo-' + n + '.jpg">' +
        '<img loading="lazy" src="media/gallery/photo-' + n + '.jpg" ' +
        'onerror="this.style.opacity=.25" alt="Grace and Juriel, photo ' + n + '"></button>'
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

    // drone section: smooth parallax backdrop + magnetic snap.
    // Parallax: the video drifts slower than the scroll for depth.
    // Snap: once the section is >=50% in view and scrolling settles, glide it
    // to fill the screen — so one scroll auto-shows the drone shot.
    const lenis = window.__lenis;
    const droneSec = document.getElementById("drone");
    const droneVid = document.getElementById("droneVideo");
    if (lenis && droneSec) {
      const parallax = () => {
        const top = droneSec.getBoundingClientRect().top;
        if (droneVid) droneVid.style.transform = "translate3d(0," + (top * -0.12) + "px,0) scale(1.25)";
      };
      let snapT;
      lenis.on("scroll", () => {
        parallax();
        clearTimeout(snapT);
        snapT = setTimeout(() => {
          const top = droneSec.getBoundingClientRect().top, ih = window.innerHeight;
          if (Math.abs(top) < ih * 0.5 && Math.abs(top) > 6) lenis.scrollTo(droneSec, { duration: 0.8 });
        }, 110);
      });
      parallax();
      window.addEventListener("resize", parallax);
    }

    // nav: hidden during the full-screen card intro, slides in for the site body
    const nav = document.getElementById("nav");
    const cardScroll = document.getElementById("cardScroll");
    const onScroll = () => {
      const total = cardScroll ? cardScroll.offsetHeight - window.innerHeight : 0;
      const past = cardScroll ? window.scrollY >= total * 0.96 : window.scrollY > 80;
      document.body.classList.toggle("nav-visible", past);
      document.documentElement.classList.toggle("intro", !past); // hide scrollbar during intro
      nav.classList.toggle("scrolled", past);
    };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-jump");
      const map = { intro: "#top", gallery: "#gallery", film: "#film", rsvp: "#rsvp" };
      const t = document.querySelector(map[id] || "#top"); if (!t) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(t, { duration: 1.4 });
      else t.scrollIntoView({ behavior: "smooth" });
    }));
  }

  window.W.initSections = initSections;
})();
