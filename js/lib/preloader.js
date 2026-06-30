/* Progressive image preloader for the card frames. window.W.Preloader */
(function () {
  "use strict";
  window.W = window.W || {};

  function Preloader(opts) {
    this.count = opts.count;
    this.path = opts.path;              // (i) => url, i is 1-based
    this.onProgress = opts.onProgress || function () {};
    this.onFirst = opts.onFirst || function () {};
    this.onDone = opts.onDone || function () {};
    this.images = new Array(this.count);
    this.loaded = 0;
    this.firstReady = false;
  }

  Preloader.prototype.start = function () {
    const self = this;
    for (let i = 0; i < this.count; i++) {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = function () {
        self.loaded++;
        if (!self.firstReady && self.images[0] && self.images[0].naturalWidth) {
          self.firstReady = true; self.onFirst();
        }
        self.onProgress(self.loaded / self.count);
        if (self.loaded >= self.count) self.onDone();
      };
      img.src = this.path(i + 1);
      this.images[i] = img;
    }
  };

  // nearest decoded frame to idx (handles not-yet-loaded mid-stream)
  Preloader.prototype.frame = function (idx) {
    const imgs = this.images, n = imgs.length;
    const ok = (im) => im && im.complete && im.naturalWidth;
    if (ok(imgs[idx])) return imgs[idx];
    for (let d = 1; d < n; d++) {
      if (ok(imgs[idx - d])) return imgs[idx - d];
      if (ok(imgs[idx + d])) return imgs[idx + d];
    }
    return null;
  };

  window.W.Preloader = Preloader;
})();
