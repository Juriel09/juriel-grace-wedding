const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/lib/storyGeometry.js");

const NODES = [
  { year: 2002, who: "both", kiss: true },
  { year: 2008, who: "both", kiss: true },
  { year: 2015, who: "grace", merge: true },
  { year: 2016, who: "both" },
  { year: 2025, who: "both" },
];
const laid = () => S.layout({ nodes: NODES, vw: 1280, vh: 800, gap: 400, padX: 640 });

test("smoothPath starts with a move and emits a cubic per gap", () => {
  const d = S.smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]);
  assert.match(d, /^M 0 0 C/);
  assert.equal((d.match(/C/g) || []).length, 2);
});

test("smoothPath is empty for <2 points", () => {
  assert.equal(S.smoothPath([]), "");
  assert.equal(S.smoothPath([{ x: 1, y: 1 }]), "");
});

test("nodes are laid out left-to-right, evenly spaced", () => {
  const L = laid();
  assert.equal(L.nodes.length, 5);
  assert.equal(L.nodes[0].x, 640);            // padX
  assert.equal(L.nodes[1].x, 1040);           // padX + gap
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].x > L.nodes[i - 1].x);
  assert.equal(L.width, 640 * 2 + 4 * 400);   // padX*2 + (n-1)*gap
});

test("merge index/x found from the merge flag", () => {
  const L = laid();
  assert.equal(L.mergeIndex, 2);
  assert.equal(L.mergeX, 640 + 2 * 400);
});

test("kiss nodes anchor on the centre line", () => {
  const L = laid();
  assert.equal(L.nodes[0].anchorY, L.centerY);
  assert.equal(L.nodes[1].anchorY, L.centerY);
});

test("merged nodes anchor on the centre line and alternate above/below", () => {
  const L = laid();
  assert.equal(L.nodes[2].anchorY, L.centerY);
  assert.equal(L.nodes[3].anchorY, L.centerY);
  assert.equal(L.nodes[4].anchorY, L.centerY);
  assert.equal(L.nodes[2].above, true);   // first merged sits above
  assert.equal(L.nodes[3].above, false);  // then below
  assert.equal(L.nodes[4].above, true);
});

test("pre-merge single-person node rides its own lane", () => {
  const L = S.layout({
    nodes: [{ year: 2010, who: "juriel" }, { year: 2015, who: "grace", merge: true }],
    vw: 1000, vh: 800, gap: 300, padX: 500,
  });
  assert.equal(L.nodes[0].anchorY, L.topY);   // juriel -> top line
  assert.equal(L.nodes[0].side, "juriel");
});

test("both life-lines pass through the same point at a kiss", () => {
  const L = laid();
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  // control point for the first kiss (index 0) is entry 1 in each list (0 = left edge)
  assert.deepEqual(j[1], { x: L.nodes[0].x, y: L.centerY });
  assert.deepEqual(g[1], { x: L.nodes[0].x, y: L.centerY });
});

test("both life-lines end merged on the centre line", () => {
  const L = laid();
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  assert.equal(j[j.length - 1].y, L.centerY);
  assert.equal(g[g.length - 1].y, L.centerY);
});

test("gold union path spans from the merge to the end on the centre line", () => {
  const L = laid();
  assert.equal(L.paths.gold, "M " + L.mergeX + " " + L.centerY + " L " + L.width + " " + L.centerY);
});

test("with no merge flag the lines never fuse to centre at nodes", () => {
  const L = S.layout({ nodes: [{ year: 2001, who: "juriel" }], vw: 800, vh: 600, gap: 300, padX: 400 });
  assert.equal(L.mergeIndex, 1);
  assert.equal(L.nodes[0].anchorY, L.topY);
});

test("pair nodes report a pair side and keep both lanes in place", () => {
  const L = S.layout({
    nodes: [{ pair: true, key: "bike" }, { year: 2002, who: "both", kiss: true }, { year: 2015, merge: true }],
    vw: 1000, vh: 800, gap: 300, padX: 500,
  });
  assert.equal(L.nodes[0].side, "pair");
  assert.equal(L.nodes[0].pair, true);
  // both lines pass the pair's x in their own lane, not dragged to the centre
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  assert.ok(j.some((p) => p.x === L.nodes[0].x && p.y === L.topY));
  assert.ok(g.some((p) => p.x === L.nodes[0].x && p.y === L.bottomY));
});

test("gap nodes are marked and don't shift the merge stagger", () => {
  const L = S.layout({
    nodes: [{ year: 2015, merge: true }, { year: 2019, who: "both" }, { gap: true, key: "g" }, { year: 2022, who: "both" }],
    vw: 1000, vh: 800, gap: 300, padX: 500,
  });
  assert.equal(L.nodes[2].gap, true);
  // 2015 above, 2019 below, gap consumes no parity, 2022 above again
  assert.equal(L.nodes[0].above, true);
  assert.equal(L.nodes[1].above, false);
  assert.equal(L.nodes[3].above, true);
});
