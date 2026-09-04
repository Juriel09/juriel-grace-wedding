/* Pure geometry for the "Our Story" timeline. UMD: browser global
   (window.W.storyGeom) and CommonJS (require) for Node tests. No DOM.

   Two vertical lines — Juriel (left lane) and Grace Ann (right lane) — run down the
   page through the years. At "kiss" nodes both lines lean into the centre and touch
   (they met, then parted). At the "merge" node they fuse and stay on the centre line
   to the end — drawn once more in gold to mark the union.

   The timeline runs along y; x is the cross-axis the two lanes straddle. `band` is
   how wide the whole thing is, `height` how far it falls. On a narrow screen there is
   no room for a caption beside the disc, so the milestone stacks its text under the
   disc instead (`stack`). The string itself is centred at every width. */
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

  // control points for one life-line ("juriel" rides leftX, "grace" rides rightX).
  // Pre-merge it sits in its own lane, crossing to the centre only at a kiss and
  // bowing back out to its lane between meetings (touched, then parted). At a
  // childhood pair it swings wide to pass through its own disc — the lanes run too
  // close together to carry a photo, so the string reaches out for one. From the merge
  // node on it stays on the centre line.
  function linePoints(laid, which) {
    const own = which === "juriel" ? laid.leftX : laid.rightX;
    const at = (n) => (n.kiss ? laid.centerX : n.pair ? n.pairX[which] : own);
    const nodes = laid.nodes, mi = laid.mergeIndex;
    const pts = [{ x: own, y: 0 }];
    for (let i = 0; i < mi && i < nodes.length; i++) {
      // between two meetings the line returns to its own lane, so the pair visibly parts
      if (i > 0) pts.push({ x: own, y: (nodes[i - 1].y + nodes[i].y) / 2 });
      pts.push({ x: at(nodes[i]), y: nodes[i].y });
    }
    if (mi < nodes.length) {                     // part once more, then dive into the merge
      if (mi > 0) pts.push({ x: own, y: (nodes[mi - 1].y + nodes[mi].y) / 2 });
      for (let i = mi; i < nodes.length; i++) pts.push({ x: laid.centerX, y: nodes[i].y });
      pts.push({ x: laid.centerX, y: laid.height });
    } else {
      pts.push({ x: own, y: laid.height });
    }
    return pts;
  }

  // Lay the timeline out in px. `opts.nodes` is the story data (year/who/kiss/merge…);
  // vw/vh size the stage. The page's own scroll walks the years, so the spacing is
  // chosen to keep the whole story inside about two and a half screens rather than one
  // stop per screen, so consecutive milestones read as one falling thread.
  function layout(opts) {
    const nodes = opts.nodes || [];
    const vw = opts.vw, vh = opts.vh;
    const band = opts.band != null ? opts.band : clamp(Math.min(vw * 0.92, 860), 300, 860);
    // The string is centred at every width. What changes on a narrow screen is the
    // milestone itself: there is no room for a caption beside the disc, so the text
    // stacks underneath it and the whole block stands further out from the line.
    const stack = opts.stack != null ? opts.stack : vw < 640;
    // A stacked milestone is a tall column rather than a wide row, so it needs more
    // room down the page — at the side-by-side spacing its caption lands in the next
    // milestone's photo. Within one screen the step never varies.
    const gap = opts.gap != null ? opts.gap
              : stack ? clamp(vh * 0.2, 165, 205) : clamp(vh * 0.165, 140, 180);
    const padY = opts.padY != null ? opts.padY : clamp(vh * 0.09, 60, 110);
    const centerX = band / 2;
    const laneGap = band * 0.045;                          // lanes' distance from centre
    const lane = stack ? clamp(band * 0.26, 80, 115)       // a disc's distance from its line
                       : clamp(band * 0.17, 44, 150);
    const leftX = centerX - laneGap, rightX = centerX + laneGap;
    // A childhood pair puts a disc either side of the string. The lanes themselves run
    // far too close together to hold two discs, so the pair sets its own spread and
    // each lifeline bows out to meet its half of it.
    const pairMid = centerX;
    const pairSpread = clamp(band * 0.085, 56, 100);

    const height = padY * 2 + Math.max(0, nodes.length - 1) * gap;
    let mergeIndex = nodes.findIndex((n) => n.merge);
    if (mergeIndex < 0) mergeIndex = nodes.length; // no merge -> lines never fuse

    // Every milestone that sits on the centre line — the kisses as well as the merged
    // years — takes the next side, so no two in a row stand in the same column with
    // their captions overlapping. A pair or a gap takes no turn.
    let staggerSeen = 0;
    const laid = nodes.map((n, i) => {
      const y = padY + i * gap;
      const side = n.who || "both";
      let anchorX, laneX, left;
      // Childhood "matched pair": a disc either side of the string at this y, joined
      // across by it. Consumes no merge-stagger parity.
      if (n.pair) {
        return { data: n, index: i, y: y, side: "pair", pair: true, kiss: false,
                 anchorX: centerX, laneX: centerX, left: true,
                 pairMid: pairMid,
                 pairX: { juriel: pairMid - pairSpread, grace: pairMid + pairSpread } };
      }
      // A quiet gap in the years: no disc, just a marker on the line.
      if (n.gap) {
        return { data: n, index: i, y: y, side: "gap", gap: true, kiss: false,
                 anchorX: centerX, laneX: centerX, left: true };
      }
      if (i >= mergeIndex || (side !== "juriel" && side !== "grace")) {
        // on the centre line — merged, or a kiss the two lines have come in to meet
        left = (staggerSeen % 2 === 0);
        anchorX = centerX;
        laneX = centerX + (left ? -lane : lane);
        staggerSeen++;
      } else if (side === "juriel") {
        left = true; anchorX = leftX; laneX = leftX - lane;   // his own lane, his own side
      } else {
        left = false; anchorX = rightX; laneX = rightX + lane;
      }
      return { data: n, index: i, y: y, side: side, kiss: !!n.kiss,
               anchorX: anchorX, laneX: laneX, left: left };
    });

    const out = { height: height, band: band, centerX: centerX, leftX: leftX, rightX: rightX,
                  gap: gap, padY: padY, lane: lane, stack: stack, nodes: laid,
                  mergeIndex: mergeIndex,
                  mergeY: mergeIndex < nodes.length ? padY + mergeIndex * gap : height };
    out.paths = {
      juriel: smoothPath(linePoints(out, "juriel")),
      grace: smoothPath(linePoints(out, "grace")),
      gold: "M " + centerX + " " + out.mergeY + " L " + centerX + " " + height,
    };
    return out;
  }

  return { clamp: clamp, smoothPath: smoothPath, linePoints: linePoints, layout: layout };
});
