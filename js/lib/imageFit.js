/* Pure resize math for guest photo uploads. UMD: browser global (window.W.imageFit)
   and CommonJS (require) for Node tests. No DOM.

   One rule: fit the image inside a square of `max` pixels without ever making it
   bigger than it already was. A guest's 12MP phone photo comes down to something
   that uploads in a couple of seconds on venue wifi; a small photo is left alone. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.W = root.W || {}; root.W.imageFit = api; }
})(typeof self !== "undefined" ? self : this, function () {
  function fitWithin(w, h, max) {
    w = Number(w); h = Number(h); max = Number(max);
    if (!(w > 0) || !(h > 0) || !(max > 0)) return { w: 0, h: 0 };
    const long = Math.max(w, h);
    if (long <= max) return { w: Math.round(w), h: Math.round(h) };
    const k = max / long;
    // a very wide panorama can round its short edge to zero — a canvas of height 0
    // throws, so the floor is one pixel
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  return { fitWithin: fitWithin };
});
