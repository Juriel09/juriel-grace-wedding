/* Pure camera/frame geometry. UMD: works as a browser global (window.W.geom)
   and as a CommonJS module (require) for Node tests. No DOM, no side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.W = root.W || {}; root.W.geom = api; }
})(typeof self !== "undefined" ? self : this, function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mapRange(v, inMin, inMax, outMin, outMax, clamped) {
    const t = (v - inMin) / (inMax - inMin);
    const out = outMin + (outMax - outMin) * t;
    return clamped ? clamp(out, Math.min(outMin, outMax), Math.max(outMin, outMax)) : out;
  }

  // contain-fit src into dst, centered. Returns {scale,w,h,x,y}
  function fitContain(sw, sh, dw, dh) {
    const scale = Math.min(dw / sw, dh / sh);
    const w = sw * scale, h = sh * scale;
    return { scale, w, h, x: (dw - w) / 2, y: (dh - h) / 2 };
  }

  // rect of a frame (fw x fh) drawn contain-fit, centered in viewport
  function frameRect(vw, vh, fw, fh) {
    const f = fitContain(fw, fh, vw, vh);
    return { x: f.x, y: f.y, w: f.w, h: f.h };
  }

  // fractional sub-rectangle of a rect
  function subRect(r, fx0, fy0, fx1, fy1) {
    return { x: r.x + fx0 * r.w, y: r.y + fy0 * r.h, w: (fx1 - fx0) * r.w, h: (fy1 - fy0) * r.h };
  }

  // vertical slice `index` of `count` equal regions
  function regionRect(r, index, count) {
    const h = r.h / count;
    return { x: r.x, y: r.y + index * h, w: r.w, h };
  }

  // camera transform (translate then scale, origin 0,0) to frame rect r into viewport.
  // mode "cover" fills, "contain" fits; pad scales the result (e.g. 0.96 to add margin).
  function frameTo(r, vw, vh, mode, pad) {
    pad = pad == null ? 1 : pad;
    const pick = mode === "contain" ? Math.min : Math.max;
    const scale = pick(vw / r.w, vh / r.h) * pad;
    return { x: vw / 2 - scale * (r.x + r.w / 2), y: vh / 2 - scale * (r.y + r.h / 2), scale };
  }

  function frameIndexForProgress(p, count) {
    return clamp(Math.round(p * (count - 1)), 0, count - 1);
  }

  return { clamp, lerp, mapRange, fitContain, frameRect, subRect, regionRect, frameTo, frameIndexForProgress };
});
