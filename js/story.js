/* "Our Story" — a pinned, horizontally-scrubbed timeline. The section pins to the
   screen and downward scroll pans the years leftward (2002 -> 2025); the two life-
   lines kiss at the early meetings and merge into one gold line once they became a
   couple. Reduced-motion falls back to a static vertical list. Data-driven: edit
   STORY below (year / who / caption / photo) and everything re-lays-out. */
(function () {
  "use strict";
  window.W = window.W || {};
  const geom = window.W.storyGeom;

  // ---- The story. Fill in real years, captions and photo paths later. --------
  //  who:   "juriel" (top lane) · "grace" (bottom lane) · "both" (shared moment)
  //  kiss:  the two lines touch here, then part (a meeting before you were a couple)
  //  merge: from here on the lines fuse into one — the start of you two
  //  photo: path to a round photo; empty = a placeholder disc for now
  //  To preview real photos: drop a file at the photo path below (media/story/<year>.jpg
  //  by default) and it appears in that milestone's disc — until then the J&G monogram
  //  shows. Change the caption/year/photo freely; the timeline re-lays-out from this.
  const STORY = [
    { year: 2002, who: "both",  kiss: true,  caption: "We first met",           photo: "media/story/2002.jpg" },
    { year: 2008, who: "both",  kiss: true,  caption: "Our paths crossed again", photo: "media/story/2008.jpg" },
    { year: 2015, who: "grace", merge: true, caption: "She said yes 💚", photo: "media/story/2015.jpg" },
    { year: 2016, who: "both",               caption: "Our first date",          photo: "media/story/2016.jpg" },
    { year: 2018, who: "both",               caption: "First trip together",     photo: "media/story/2018.jpg" },
    { year: 2022, who: "both",               caption: "A favourite adventure",   photo: "media/story/2022.jpg" },
    { year: 2025, who: "both",               caption: "The proposal 💍", photo: "media/story/2025.jpg" },
  ];

  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  function initialsFor(who) {
    if (who === "juriel") return "J";
    if (who === "grace") return "G";
    return "J & G";
  }

  // Fill a disc: the monogram always sits behind, so a missing/broken photo simply
  // falls back to it. A real photo (once dropped in) loads on top and covers it.
  function fillDisc(disc, photo, who) {
    disc.classList.add("is-empty");
    const glyph = el("span", "story-disc-glyph");
    glyph.textContent = initialsFor(who);
    disc.appendChild(glyph);
    if (photo) {
      const img = el("img");
      img.alt = ""; img.loading = "lazy";
      img.onload = function () { disc.classList.remove("is-empty"); };
      img.onerror = function () { this.remove(); }; // keep the monogram showing
      img.src = photo;
      disc.appendChild(img);
    }
    return disc;
  }

  // one milestone: a round photo (or placeholder disc), a connector tick down/up to
  // the line, the year, and a one-line caption.
  function nodeEl(n) {
    const wrap = el("div", "story-node " + (n.above ? "is-above" : "is-below") +
      (n.kiss ? " is-kiss" : "") + (n.index >= 0 && n.data.merge ? " is-merge" : ""));
    wrap.style.left = n.x + "px";
    wrap.style.top = n.anchorY + "px";   // sit on the line; CSS grows the card outward
    wrap.style.setProperty("--tick", Math.abs(n.laneY - n.anchorY) + "px");

    const disc = fillDisc(el("div", "story-disc"), n.data.photo, n.side);
    const tick = el("span", "story-tick");
    const year = el("span", "story-year"); year.textContent = n.data.year;
    const cap = el("span", "story-caption"); cap.textContent = n.data.caption;

    // stack order reads outward from the line: tick, then disc, then year+caption
    if (n.above) { wrap.append(cap, year, disc, tick); }
    else { wrap.append(tick, disc, year, cap); }
    return wrap;
  }

  function StoryScene() {
    this.section = document.getElementById("story");
    this.scroll = document.getElementById("storyScroll");
    this.stage = document.getElementById("storyStage");
    this.track = document.getElementById("storyTrack");
    this.viewport = this.section ? this.section.querySelector(".story-viewport") : null;
    this.eased = 0; this.target = 0; this.pinScroll = 0; this.built = false;
  }

  StoryScene.prototype.build = function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    // lay the band out in the height left below the headline, not the whole screen
    const avail = (this.viewport && this.viewport.clientHeight) || vh;
    const L = geom.layout({ nodes: STORY, vw: vw, vh: avail });
    this.L = L;
    this.pinScroll = Math.max(0, L.width - vw);
    // give the outer wrapper exactly enough scroll to pan the whole track (1:1)
    this.scroll.style.height = (vh + this.pinScroll) + "px";

    this.track.style.width = L.width + "px";
    this.track.style.height = L.band + "px";
    this.track.innerHTML = "";

    const svg = svgEl("svg", {
      class: "story-lines", width: L.width, height: L.band,
      viewBox: "0 0 " + L.width + " " + L.band, preserveAspectRatio: "none", "aria-hidden": "true",
    });
    svg.appendChild(svgEl("path", { class: "story-line story-line-j", d: L.paths.juriel }));
    svg.appendChild(svgEl("path", { class: "story-line story-line-g", d: L.paths.grace }));
    svg.appendChild(svgEl("path", { class: "story-line story-line-gold", d: L.paths.gold }));
    this.track.appendChild(svg);

    L.nodes.forEach((n) => this.track.appendChild(nodeEl(n)));
    this.nodeEls = Array.prototype.slice.call(this.track.querySelectorAll(".story-node"));
    this.built = true;
    this.apply(true);
  };

  StoryScene.prototype.progress = function () {
    const rect = this.scroll.getBoundingClientRect();
    if (this.pinScroll <= 0) return 0;
    return geom.clamp(-rect.top / this.pinScroll, 0, 1);
  };

  // pan the track and pop each stop in as it enters the viewport
  StoryScene.prototype.apply = function (instant) {
    const panX = -this.eased * this.pinScroll;
    this.track.style.transform = "translate3d(" + panX + "px,-50%,0)";
    const vw = window.innerWidth;
    for (let i = 0; i < this.nodeEls.length; i++) {
      const n = this.L.nodes[i];
      const screenX = n.x + panX;                 // node centre in viewport px
      if (screenX < vw * 0.9 && screenX > -vw * 0.3) this.nodeEls[i].classList.add("in");
    }
    // headline recedes gently as the story gets going
    if (this.head) this.head.style.opacity = String(geom.clamp(1 - this.eased * 3, 0.25, 1));
  };

  StoryScene.prototype.tick = function () {
    this.target = this.progress();
    this.eased += (this.target - this.eased) * 0.12;
    if (Math.abs(this.target - this.eased) < 0.0003) this.eased = this.target;
    this.apply(false);
  };

  StoryScene.prototype.init = function () {
    if (!this.section) return;
    const self = this;
    this.head = this.section.querySelector(".story-head");
    window.__story = this;   // handy for headless verification
    this.build();

    // Skip: glide past the timeline straight to the gallery.
    const skip = document.getElementById("storySkip");
    if (skip) skip.addEventListener("click", () => {
      const g = document.getElementById("gallery");
      if (window.__lenis && g) window.__lenis.scrollTo(g, { duration: 1.2 });
      else if (g) g.scrollIntoView({ behavior: "smooth" });
    });

    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => self.build(), 200); });
    requestAnimationFrame(function loop() { self.tick(); requestAnimationFrame(loop); });
  };

  // reduced-motion: no pin, no horizontal pan — a calm vertical list of the moments.
  StoryScene.prototype.initLite = function () {
    if (!this.section) return;
    this.section.classList.add("story--lite");
    this.scroll.style.height = "auto";
    this.track.style.cssText = "";
    this.track.innerHTML = "";
    const list = el("ol", "story-list");
    STORY.forEach((n) => {
      const li = el("li", "story-list-item");
      const disc = fillDisc(el("div", "story-disc"), n.photo, n.who || "both");
      const txt = el("div", "story-list-text");
      const year = el("span", "story-year"); year.textContent = n.year;
      const cap = el("span", "story-caption"); cap.textContent = n.caption;
      txt.append(year, cap);
      li.append(disc, txt);
      list.appendChild(li);
    });
    this.track.appendChild(list);
    const skip = document.getElementById("storySkip");
    if (skip) skip.style.display = "none"; // nothing to skip out of when it's a plain list
  };

  window.W.StoryScene = StoryScene;
})();
