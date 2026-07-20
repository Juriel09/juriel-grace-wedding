/* Ambient WebGL background: a fixed orthographic three.js scene that renders
   theme-specific creatures over the page's base colour. Reduced-motion disables
   it entirely; it pauses when the tab is hidden. One smoothed rAF loop. */
(function () {
  "use strict";
  window.W = window.W || {};
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // the watercolor art is authored at 1024x1536 (portrait). Sprites treat `size`
  // as height and derive width from this ratio so the art never distorts. Swap
  // in art of a different shape? update this one number.
  var ART_ASPECT = 1024 / 1536;
  var PINES_ASPECT = 1536 / 1024; // the wide pinetrees.png backdrop (landscape)

  // tiny code-drawn placeholder so the build works before real PNGs land
  function placeholder(color) {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function BackgroundScene() {
    this.canvas = document.getElementById("bgCanvas");   // background layer (behind content)
    this.fgCanvas = document.getElementById("fgCanvas"); // foreground layer (over content)
    this.groups = {};
    this.running = false;
    this.time = 0;
  }

  BackgroundScene.prototype.start = function () {
    if (reduce || !this.canvas || typeof THREE === "undefined") return; // graceful no-op
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      if (this.fgCanvas) this.fgRenderer = new THREE.WebGLRenderer({ canvas: this.fgCanvas, alpha: true, antialias: true });
    } catch (e) { return; } // no WebGL → leave the canvases blank, site still works
    this.renderer.setClearColor(0x000000, 0); // transparent: body colour shows through
    if (this.fgRenderer) this.fgRenderer.setClearColor(0x000000, 0);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (window.innerWidth * window.innerHeight > 2600000) this.dpr = Math.min(this.dpr, 1.5); // ease big screens

    this.scene = new THREE.Scene();    // background: the pine forest sits behind the content
    this.fgScene = new THREE.Scene();  // foreground: flying creatures pass OVER the content
    // Orthographic camera: world units == CSS pixels, origin at screen centre (shared).
    this.camera = new THREE.OrthographicCamera(0, 0, 0, 0, -100, 100);
    this.loader = new THREE.TextureLoader();
    this.textures = {};
    this.updaters = [];

    var self = this;
    this.groups.pines = new THREE.Group(); this.scene.add(this.groups.pines);
    ["fireflies", "butterflies"].forEach(function (k) {
      self.groups[k] = new THREE.Group();
      self.fgScene.add(self.groups[k]);   // creatures render on the foreground canvas
    });

    this.resize();
    this.buildPines();
    this.buildFireflies();
    this.buildButterflies();

    window.addEventListener("resize", function () { self.resize(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) self.stop(); else self.run();
    });
    window.addEventListener("themechange", function (e) { self.setTheme(e.detail.theme); });

    this.setTheme(window.W.Theme ? window.W.Theme.get() : "light");
    this.run();
  };

  // walk every sprite across both scenes (used to repoint textures on load)
  BackgroundScene.prototype.eachSprite = function (cb) {
    this.scene.traverse(cb);
    if (this.fgScene) this.fgScene.traverse(cb);
  };

  // half-extents in px; camera maps world px → screen px
  BackgroundScene.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    if (this.fgRenderer) { this.fgRenderer.setPixelRatio(this.dpr); this.fgRenderer.setSize(w, h, false); }
    var c = this.camera;
    c.left = -w / 2; c.right = w / 2; c.top = h / 2; c.bottom = -h / 2;
    c.updateProjectionMatrix();
    if (this.layoutPines) this.layoutPines();
  };

  BackgroundScene.prototype.setTheme = function (mode) {
    var dark = mode === "dark";
    this.groups.pines.visible = true;        // pine forest shows in both themes
    this.groups.fireflies.visible = dark;    // fireflies at night only
    this.groups.butterflies.visible = !dark; // butterflies by day only
  };

  BackgroundScene.prototype.run = function () {
    if (this.running || reduce || !this.renderer || document.hidden) return;
    this.running = true; this.last = performance.now();
    var self = this;
    (function loop(now) {
      if (!self.running) return;
      var dt = Math.min((now - self.last) / 1000, 0.05); self.last = now;
      self.time += dt;
      self.update(dt);
      self.renderer.render(self.scene, self.camera);
      if (self.fgRenderer) self.fgRenderer.render(self.fgScene, self.camera);
      self._raf = requestAnimationFrame(loop);
    })(performance.now());
  };

  BackgroundScene.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  // per-frame hook; creature systems push updaters here
  BackgroundScene.prototype.update = function (dt) {
    if (!this.updaters) return;
    for (var i = 0; i < this.updaters.length; i++) this.updaters[i](dt, this.time);
  };

  // cached texture load with a placeholder that is swapped in on success; on error
  // the placeholder stays, so the site never breaks on a missing/failed asset.
  BackgroundScene.prototype.tex = function (name, url, fallbackColor) {
    if (this.textures[name]) return this.textures[name];
    var t = placeholder(fallbackColor || "rgba(219,198,156,1)");
    this.textures[name] = t;
    var self = this;
    this.loader.load(url, function (loaded) {
      loaded.colorSpace = THREE.SRGBColorSpace;
      self.textures[name] = loaded;
      // repoint any sprites already using the placeholder (across both scenes)
      self.eachSprite(function (o) {
        if (o.isSprite && o.material && o.material.map === t) { o.material.map = loaded; o.material.needsUpdate = true; }
      });
    }, undefined, function () { /* keep placeholder on error */ });
    return t;
  };

  // `size` is the sprite HEIGHT in px; width = size * aspect (default ART_ASPECT)
  // load an image and knock out its (assumed flat) background colour so art exported
  // WITHOUT alpha (e.g. pinetrees.png) still reads as a transparent cut-out. Keys on
  // the average corner colour with a feathered colour-distance threshold.
  BackgroundScene.prototype.keyedTex = function (name, url, fallbackColor) {
    if (this.textures[name]) return this.textures[name];
    var t = placeholder(fallbackColor || "rgba(34,48,40,1)");
    this.textures[name] = t;
    var self = this, img = new Image();
    img.onload = function () {
      try {
        var cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
        var id = cx.getImageData(0, 0, cv.width, cv.height), p = id.data, W = cv.width, H = cv.height;
        var corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + (W - 1)) * 4];
        var kr = 0, kg = 0, kb = 0, c;
        for (c = 0; c < 4; c++) { kr += p[corners[c]]; kg += p[corners[c] + 1]; kb += p[corners[c] + 2]; }
        kr /= 4; kg /= 4; kb /= 4;
        var near = 55, far = 130;                       // 0 alpha within `near`, full past `far`
        for (var i = 0; i < p.length; i += 4) {
          var dr = p[i] - kr, dg = p[i + 1] - kg, db = p[i + 2] - kb;
          var d = Math.sqrt(dr * dr + dg * dg + db * db);
          var a = d <= near ? 0 : d >= far ? 1 : (d - near) / (far - near);
          p[i + 3] = Math.round(p[i + 3] * a);
        }
        cx.putImageData(id, 0, 0);
        var ct = new THREE.CanvasTexture(cv); ct.colorSpace = THREE.SRGBColorSpace;
        self.textures[name] = ct;
        self.eachSprite(function (o) {
          if (o.isSprite && o.material && o.material.map === t) { o.material.map = ct; o.material.needsUpdate = true; }
        });
      } catch (e) { /* keep placeholder */ }
    };
    img.onerror = function () {};
    img.src = url;
    return t;
  };

  BackgroundScene.prototype.makeSprite = function (texture, opts) {
    opts = opts || {};
    var m = new THREE.SpriteMaterial({
      map: texture, transparent: true, opacity: opts.opacity != null ? opts.opacity : 1,
      depthTest: false, depthWrite: false, blending: opts.blending || THREE.NormalBlending
    });
    var s = new THREE.Sprite(m);
    var h = opts.size || 64, w = h * (opts.aspect != null ? opts.aspect : ART_ASPECT);
    s.scale.set(w, h, 1);
    s.userData.baseScale = w;      // width — flutter squashes around this
    return s;
  };

  // wing-flap by squashing scale.x around the sprite's base width; returns an updater
  BackgroundScene.prototype.flutter = function (sprite, opts) {
    opts = opts || {};
    var base = sprite.userData.baseScale || sprite.scale.x;
    var flap = opts.flap != null ? opts.flap : 0.35;      // 0..1 squash depth
    var speed = opts.flapSpeed != null ? opts.flapSpeed : 8;
    var dir = sprite.scale.x < 0 ? -1 : 1;                 // preserve facing (mirrored sprites)
    var phase = Math.random() * Math.PI * 2;
    return function (dt, t) {
      var k = 1 - flap * (0.5 + 0.5 * Math.sin(t * speed + phase));
      sprite.scale.x = base * k * dir;
    };
  };

  // --- Fireflies (dark) — warm additive points drifting upward, twinkling ---
  BackgroundScene.prototype.buildFireflies = function () {
    var count = this.w < 700 ? 34 : 80;                 // denser swarm
    var tex = this.tex("firefly", "media/art/firefly.png", "rgba(230,210,140,1)");
    var g = this.groups.fireflies, flies = [], self = this;
    for (var i = 0; i < count; i++) {
      var s = this.makeSprite(tex, { size: 7 + Math.random() * 16, opacity: 0, blending: THREE.AdditiveBlending });
      s.position.set((Math.random() - 0.5) * this.w, (Math.random() - 0.5) * this.h, 0);
      s.userData.bw = s.scale.x; s.userData.bh = s.scale.y;   // base size for the swell
      s.userData.ang = Math.random() * Math.PI * 2;           // heading — drifts in any direction
      s.userData.spd = 10 + Math.random() * 20;               // px/s
      s.userData.wf = 0.2 + Math.random() * 0.5;              // wander frequency
      s.userData.wamp = 0.8 + Math.random() * 1.4;            // how sharply the heading curves
      s.userData.ph = Math.random() * Math.PI * 2;
      s.userData.tw = 1.6 + Math.random() * 1.8;              // per-fly twinkle speed
      g.add(s); flies.push(s);
    }
    this.updaters.push(function (dt, t) {
      var mx = self.w / 2 + 20, my = self.h / 2 + 20;
      for (var i = 0; i < flies.length; i++) {
        var f = flies[i], d = f.userData;
        d.ang += Math.sin(t * d.wf + d.ph) * d.wamp * dt;     // meander: heading curves over time
        f.position.x += Math.cos(d.ang) * d.spd * dt;
        f.position.y += Math.sin(d.ang) * d.spd * dt;
        if (f.position.x > mx) f.position.x = -mx; else if (f.position.x < -mx) f.position.x = mx;
        if (f.position.y > my) f.position.y = -my; else if (f.position.y < -my) f.position.y = my;
        var glow = 0.5 + 0.5 * Math.sin(t * d.tw + d.ph);     // 0..1 twinkle
        f.material.opacity = 0.12 + 0.72 * glow;              // fade in/out
        var pulse = 0.8 + 0.35 * glow;                        // swell as it brightens
        f.scale.set(d.bw * pulse, d.bh * pulse, 1);
      }
    });
  };

  // --- Pine forest (dark) — a wide backdrop treeline (pinetrees.png) spans the
  // bottom, with individual trees (pinetree.png) arranged in front in depth layers
  // for parallax. Foreground trees get a faint independent sway. ---
  BackgroundScene.prototype.buildPines = function () {
    var g = this.groups.pines, self = this;
    this.pines = [];

    // Backdrop: the wide treeline, full width along the bottom, rearmost. (No alpha,
    // so it reads as a solid forest band; opacity lets a touch of night through.)
    var bgTex = this.keyedTex("pinesBg", "media/art/pinetrees.png", "rgba(26,38,32,1)");
    var bg = this.makeSprite(bgTex, { size: 1, opacity: 0.95, aspect: PINES_ASPECT });
    bg.center.set(0.5, 0);
    bg.userData.backdrop = true;
    g.add(bg); this.pines.push(bg);

    // Foreground: individual trees add depth and break the backdrop's straight top.
    var tex = this.tex("pines", "media/art/pinetree.png", "rgba(34,48,40,1)");
    var small = this.w < 700;
    var bands = [
      { n: small ? 6 : 11, h: 0.34, op: 0.7,  y: 0.03 },  // mid
      { n: small ? 4 : 7,  h: 0.58, op: 0.95, y: -0.02 }, // foreground
    ];
    for (var b = 0; b < bands.length; b++) {
      var band = bands[b];
      for (var i = 0; i < band.n; i++) {
        var s = this.makeSprite(tex, { size: 1, opacity: band.op });
        s.center.set(0.5, 0);                                  // anchor at the base
        s.userData.nx = (i + 0.15 + Math.random() * 0.7) / band.n; // spread 0..1 w/ jitter
        s.userData.hf = band.h * (0.82 + Math.random() * 0.36);    // per-tree height jitter
        s.userData.yf = band.y;
        s.userData.sway = Math.random() * Math.PI * 2;
        s.userData.swayAmp = 0.004 + Math.random() * 0.006;
        g.add(s); this.pines.push(s);
      }
    }
    this.layoutPines();
    this.updaters.push(function (dt, t) {
      for (var i = 0; i < self.pines.length; i++) {
        var p = self.pines[i];
        if (p.userData.backdrop) continue;                     // don't rotate the wide band
        p.material.rotation = Math.sin(t * 0.4 + p.userData.sway) * p.userData.swayAmp;
      }
    });
  };

  BackgroundScene.prototype.layoutPines = function () {
    if (!this.pines) return;
    for (var i = 0; i < this.pines.length; i++) {
      var p = this.pines[i], d = p.userData;
      if (d.backdrop) {
        var bw = this.w * 1.04, bh = bw / PINES_ASPECT;        // full-width forest band
        p.scale.set(bw, bh, 1);
        p.position.set(0, -this.h / 2, 0);                     // bottom-anchored, centred
      } else {
        var h = this.h * d.hf, w = h * ART_ASPECT;
        p.scale.set(w, h, 1);
        p.userData.baseScale = w;
        p.position.set((-0.5 + d.nx) * this.w, -this.h / 2 + this.h * d.yf, 0);
      }
    }
  };

  // --- Butterflies (light) — wander on gentle sine paths, banking + flapping ---
  BackgroundScene.prototype.buildButterflies = function () {
    var count = this.w < 700 ? 6 : 12;
    var tex = this.tex("butterfly", "media/art/butterfly.png", "rgba(133,150,110,1)");
    var g = this.groups.butterflies, flock = [], self = this;
    for (var i = 0; i < count; i++) {
      var s = this.makeSprite(tex, { size: 34 + Math.random() * 26, opacity: 0.85 });
      s.position.set((Math.random() - 0.5) * this.w, (Math.random() - 0.5) * this.h, 0);
      s.userData.ang = Math.random() * Math.PI * 2;           // heading — wanders in any direction
      s.userData.spd = 14 + Math.random() * 22;               // px/s
      s.userData.wf = 0.25 + Math.random() * 0.4;             // wander frequency
      s.userData.wamp = 0.9 + Math.random() * 1.3;            // how sharply the heading curves
      s.userData.ph = Math.random() * Math.PI * 2;
      s.userData.flap = this.flutter(s, { flap: 0.6, flapSpeed: 9 + Math.random() * 4 });
      g.add(s); flock.push(s);
    }
    this.updaters.push(function (dt, t) {
      var mx = self.w / 2 + 60, my = self.h / 2 + 60;
      for (var i = 0; i < flock.length; i++) {
        var b = flock[i], d = b.userData;
        d.ang += Math.sin(t * d.wf + d.ph) * d.wamp * dt;     // meander: heading curves over time
        b.position.x += Math.cos(d.ang) * d.spd * dt;
        b.position.y += Math.sin(d.ang) * d.spd * dt;
        // face the way it's going (flap re-scales width but keeps this sign) and bank into the climb/dive
        b.scale.x = Math.abs(b.scale.x) * (Math.cos(d.ang) < 0 ? -1 : 1);
        b.material.rotation = Math.sin(d.ang) * 0.22 * (Math.cos(d.ang) < 0 ? -1 : 1);
        d.flap(dt, t);
        if (b.position.x > mx) b.position.x = -mx; else if (b.position.x < -mx) b.position.x = mx;
        if (b.position.y > my) b.position.y = -my; else if (b.position.y < -my) b.position.y = my;
      }
    });
  };

  window.W.BackgroundScene = BackgroundScene;
})();
