/* Pure geometry for the "Our Story" timeline. UMD: browser global
   (window.W.storyGeom) and CommonJS (require) for Node tests. No DOM.

   Two horizontal lines — Juriel (top lane) and Grace (bottom lane) — run left to
   right across the years. At "kiss" nodes both lines dip to the centre and touch
   (they met, then parted). At the "merge" node they fuse and stay on the centre
   line to the end — drawn once more in gold to mark the union. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.W = root.W || {}; root.W.storyGeom = api; }
})(typeof self !== "undefined" ? self : this, function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Catmull-Rom through the points -> a smooth SVG cubic-bezier path `d` string.
  function smoothPath(pts) {
    if (!pts || pts.length < 2) return "";
    const r = (n) => Math.round(n * 100) / 100;
    let d = "M " + r(pts[0].x) + " " + r(pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C " + r(c1x) + " " + r(c1y) + ", " + r(c2x) + " " + r(c2y) + ", " + r(p2.x) + " " + r(p2.y);
    }
    return d;
  }

  // control points for one life-line ("juriel" rides topY, "grace" rides bottomY).
  // Pre-merge it sits in its own lane, dropping to the centre only at a kiss and
  // bowing back out to its lane between meetings (touched, then parted). From the
  // merge node on it stays on the centre line.
  function linePoints(laid, which) {
    const own = which === "juriel" ? laid.topY : laid.bottomY;
    const nodes = laid.nodes, mi = laid.mergeIndex;
    const pts = [{ x: 0, y: own }];
    for (let i = 0; i < mi && i < nodes.length; i++) {
      // between two meetings the line returns to its own lane, so the pair visibly parts
      if (i > 0) pts.push({ x: (nodes[i - 1].x + nodes[i].x) / 2, y: own });
      pts.push({ x: nodes[i].x, y: nodes[i].kiss ? laid.centerY : own });
    }
    if (mi < nodes.length) {                     // part once more, then dive into the merge
      if (mi > 0) pts.push({ x: (nodes[mi - 1].x + nodes[mi].x) / 2, y: own });
      for (let i = mi; i < nodes.length; i++) pts.push({ x: nodes[i].x, y: laid.centerY });
      pts.push({ x: laid.width, y: laid.centerY });
    } else {
      pts.push({ x: laid.width, y: own });
    }
    return pts;
  }

  // Lay the timeline out in px. `opts.nodes` is the story data (year/who/kiss/merge…);
  // vw/vh size the stage. Nodes travel from screen-centre to screen-centre, so the
  // lead-in/out pad is half a viewport and each stop passes dead-centre as you scroll.
  function layout(opts) {
    const nodes = opts.nodes || [];
    const vw = opts.vw, vh = opts.vh;
    const band = opts.band != null ? opts.band : clamp(Math.min(vh * 0.62, 380), 220, 420);
    const gap = opts.gap != null ? opts.gap : clamp(vw * 0.6, 240, 440);
    const padX = opts.padX != null ? opts.padX : vw / 2;
    const centerY = band / 2;
    const laneGap = band * 0.17;   // how far the two lanes sit from centre
    const lane = band * 0.30;      // how far a photo sits from its line
    const topY = centerY - laneGap, bottomY = centerY + laneGap;

    const width = padX * 2 + Math.max(0, nodes.length - 1) * gap;
    let mergeIndex = nodes.findIndex((n) => n.merge);
    if (mergeIndex < 0) mergeIndex = nodes.length; // no merge -> lines never fuse

    let mergedSeen = 0;
    const laid = nodes.map((n, i) => {
      const x = padX + i * gap;
      const side = n.who || "both";
      let anchorY, laneY, above;
      if (i >= mergeIndex) {                 // merged: alternate above/below the gold line
        above = (mergedSeen % 2 === 0);
        anchorY = centerY;
        laneY = centerY + (above ? -lane : lane);
        mergedSeen++;
      } else if (side === "juriel") {
        above = true; anchorY = topY; laneY = topY - lane;
      } else if (side === "grace") {
        above = false; anchorY = bottomY; laneY = bottomY + lane;
      } else {                                // pre-merge shared moment (a kiss)
        above = true; anchorY = centerY; laneY = centerY - lane;
      }
      return { data: n, index: i, x: x, side: side, kiss: !!n.kiss,
               anchorY: anchorY, laneY: laneY, above: above };
    });

    const out = { width: width, band: band, centerY: centerY, topY: topY, bottomY: bottomY,
                  gap: gap, padX: padX, nodes: laid, mergeIndex: mergeIndex,
                  mergeX: mergeIndex < nodes.length ? padX + mergeIndex * gap : width };
    out.paths = {
      juriel: smoothPath(linePoints(out, "juriel")),
      grace: smoothPath(linePoints(out, "grace")),
      gold: "M " + out.mergeX + " " + centerY + " L " + width + " " + centerY,
    };
    return out;
  }

  return { clamp: clamp, smoothPath: smoothPath, linePoints: linePoints, layout: layout };
});
