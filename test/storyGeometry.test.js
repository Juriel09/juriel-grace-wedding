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
const laid = () => S.layout({ nodes: NODES, vw: 1280, vh: 800, gap: 400, padY: 640 });
const phone = (nodes) => S.layout({ nodes: nodes || NODES, vw: 390, vh: 844 });

test("smoothPath starts with a move and emits a cubic per gap", () => {
  const d = S.smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]);
  assert.match(d, /^M 0 0 C/);
  assert.equal((d.match(/C/g) || []).length, 2);
});

test("smoothPath is empty for <2 points", () => {
  assert.equal(S.smoothPath([]), "");
  assert.equal(S.smoothPath([{ x: 1, y: 1 }]), "");
});

test("nodes are laid out top-to-bottom, evenly spaced", () => {
  const L = laid();
  assert.equal(L.nodes.length, 5);
  assert.equal(L.nodes[0].y, 640);            // padY
  assert.equal(L.nodes[1].y, 1040);           // padY + gap
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].y > L.nodes[i - 1].y);
  assert.equal(L.height, 640 * 2 + 4 * 400);  // padY*2 + (n-1)*gap
});

test("the spacing is one number, so every gap in the story is the same", () => {
  const L = S.layout({ nodes: NODES, vw: 1280, vh: 900 });
  const steps = L.nodes.slice(1).map((n, i) => n.y - L.nodes[i].y);
  steps.forEach((s) => assert.equal(s, steps[0]));
});

test("merge index/y found from the merge flag", () => {
  const L = laid();
  assert.equal(L.mergeIndex, 2);
  assert.equal(L.mergeY, 640 + 2 * 400);
});

test("kiss nodes anchor on the centre line", () => {
  const L = laid();
  assert.equal(L.nodes[0].anchorX, L.centerX);
  assert.equal(L.nodes[1].anchorX, L.centerX);
});

test("merged nodes anchor on the centre line and alternate left/right", () => {
  const L = laid();
  assert.equal(L.nodes[2].anchorX, L.centerX);
  assert.equal(L.nodes[3].anchorX, L.centerX);
  assert.equal(L.nodes[4].anchorX, L.centerX);
  assert.equal(L.nodes[2].left, true);    // first merged sits left of the string
  assert.equal(L.nodes[3].left, false);   // then right
  assert.equal(L.nodes[4].left, true);
});

test("pre-merge single-person node rides its own lane", () => {
  const L = S.layout({
    nodes: [{ year: 2010, who: "juriel" }, { year: 2015, who: "grace", merge: true }],
    vw: 1000, vh: 800, gap: 300, padY: 500,
  });
  assert.equal(L.nodes[0].anchorX, L.leftX);   // juriel -> left line
  assert.equal(L.nodes[0].side, "juriel");
});

test("both life-lines pass through the same point at a kiss", () => {
  const L = laid();
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  // control point for the first kiss (index 0) is entry 1 in each list (0 = top edge)
  assert.deepEqual(j[1], { x: L.centerX, y: L.nodes[0].y });
  assert.deepEqual(g[1], { x: L.centerX, y: L.nodes[0].y });
});

test("both life-lines end merged on the centre line", () => {
  const L = laid();
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  assert.equal(j[j.length - 1].x, L.centerX);
  assert.equal(g[g.length - 1].x, L.centerX);
});

test("gold union path runs down the centre line from the merge to the end", () => {
  const L = laid();
  assert.equal(L.paths.gold, "M " + L.centerX + " " + L.mergeY + " L " + L.centerX + " " + L.height);
});

test("with no merge flag the lines never fuse to centre at nodes", () => {
  const L = S.layout({ nodes: [{ year: 2001, who: "juriel" }], vw: 800, vh: 600, gap: 300, padY: 400 });
  assert.equal(L.mergeIndex, 1);
  assert.equal(L.nodes[0].anchorX, L.leftX);
});

test("pair nodes report a pair side and are not dragged to the centre", () => {
  const L = S.layout({
    nodes: [{ pair: true, key: "bike" }, { year: 2002, who: "both", kiss: true }, { year: 2015, merge: true }],
    vw: 1000, vh: 800, gap: 300, padY: 500,
  });
  assert.equal(L.nodes[0].side, "pair");
  assert.equal(L.nodes[0].pair, true);
  const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
  assert.ok(j.every((p) => p.y !== L.nodes[0].y || p.x !== L.centerX));
  assert.ok(g.every((p) => p.y !== L.nodes[0].y || p.x !== L.centerX));
});

test("gap nodes are marked and don't shift the merge stagger", () => {
  const L = S.layout({
    nodes: [{ year: 2015, merge: true }, { year: 2019, who: "both" }, { gap: true, key: "g" }, { year: 2022, who: "both" }],
    vw: 1000, vh: 800, gap: 300, padY: 500,
  });
  assert.equal(L.nodes[2].gap, true);
  // 2015 left, 2019 right, gap consumes no parity, 2022 left again
  assert.equal(L.nodes[0].left, true);
  assert.equal(L.nodes[1].left, false);
  assert.equal(L.nodes[3].left, true);
});

test("the band is a cross-axis width, and the lanes straddle its centre", () => {
  const L = laid();
  assert.equal(L.centerX, L.band / 2);
  assert.ok(L.leftX < L.centerX && L.centerX < L.rightX);
  assert.equal(L.centerX - L.leftX, L.rightX - L.centerX);   // lanes are symmetric
});

test("a disc's lane sits further from the string than its anchor", () => {
  const L = laid();
  const merged = L.nodes[2];                     // first merged node, disc on the left
  assert.ok(merged.laneX < merged.anchorX);
  const below = L.nodes[3];                      // next one, disc on the right
  assert.ok(below.laneX > below.anchorX);
});

test("the two lifelines run close together — one thread, not two columns", () => {
  assert.ok(laid().rightX - laid().leftX < 90);
  assert.ok(phone().rightX - phone().leftX < 45);
});

/* ---- one design at every width: the string is always centred ---- */

test("the string stays dead centre on a phone, exactly as on a desktop", () => {
  const L = phone();
  assert.equal(L.centerX, L.band / 2);
  assert.equal(L.nodes[2].left, true);      // and the milestones still alternate
  assert.equal(L.nodes[3].left, false);
});

test("a narrow viewport stacks each milestone under its disc instead of beside it", () => {
  assert.equal(phone().stack, true);
  assert.equal(S.layout({ nodes: NODES, vw: 1280, vh: 900 }).stack, false);
});

test("a stacked milestone's block still fits inside the band", () => {
  const L = phone();
  const half = L.lane;                       // disc centre's distance from the string
  assert.ok(L.centerX - half > 0, "the left column starts inside the band");
  assert.ok(L.centerX + half < L.band, "and the right one ends inside it");
});

test("a pair's discs sit outside the lanes, so the two cannot collide", () => {
  [laid(), phone()].forEach((L) => {
    const p = S.layout({ nodes: [{ pair: true }, { year: 2015, merge: true }], vw: L.band > 500 ? 1280 : 390, vh: 844 }).nodes[0].pairX;
    const M = L.band > 500 ? laid() : phone();
    assert.ok(p.juriel < M.leftX && p.grace > M.rightX, "discs clear the lanes");
    assert.ok(p.grace - p.juriel > 100, "two discs need room between them");
  });
});

test("a pair's discs are symmetric about the string and stay inside the band", () => {
  const L = phone(), p = S.layout({ nodes: [{ pair: true }, { year: 2015, merge: true }], vw: 390, vh: 844 }).nodes[0].pairX;
  assert.equal(L.centerX - p.juriel, p.grace - L.centerX);
  assert.ok(p.juriel > 0 && p.grace < L.band);
});

test("a lifeline bows out to meet its own half of a childhood pair", () => {
  [{ vw: 1280, vh: 900 }, { vw: 390, vh: 844 }].forEach((v) => {
    const L = S.layout({ nodes: [{ pair: true }, { year: 2015, merge: true }], vw: v.vw, vh: v.vh });
    const y = L.nodes[0].y, px = L.nodes[0].pairX;
    const j = S.linePoints(L, "juriel"), g = S.linePoints(L, "grace");
    assert.ok(j.some((p) => p.y === y && p.x === px.juriel), "his line reaches his disc");
    assert.ok(g.some((p) => p.y === y && p.x === px.grace), "hers reaches hers");
  });
});

test("the whole story stays inside two and a half screens", () => {
  const vh = 900;
  const L = S.layout({ nodes: new Array(15).fill({ who: "both" }), vw: 1280, vh: vh });
  assert.ok(L.height / vh > 1.8 && L.height / vh < 2.6,
    "expected ~2.4 screens, got " + (L.height / vh).toFixed(2));
});

test("a stacked milestone gets more room down the page than a side-by-side one", () => {
  // stacked, the year and caption hang below the disc instead of sitting beside it,
  // so the same spacing would drop them into the next milestone's photo
  const wide = S.layout({ nodes: NODES, vw: 1280, vh: 844 });
  assert.ok(phone().gap > wide.gap);
});

test("the story stays inside three screens on a phone too", () => {
  const vh = 844;
  const L = S.layout({ nodes: new Array(15).fill({ who: "both" }), vw: 390, vh: vh });
  assert.ok(L.height / vh < 3, "expected under 3 screens, got " + (L.height / vh).toFixed(2));
});

test("no two milestones in a row sit on the same side of the string", () => {
  // the kisses used to be pinned left while only the merged years alternated, so
  // 2002 / 2008 / 2015 landed in a column and their captions ran into each other
  const REAL = [
    { pair: true }, { pair: true },
    { who: "both", kiss: true, year: 2002 }, { who: "both", kiss: true, year: 2008 },
    { merge: true, year: 2015 }, { year: 2016 }, { year: 2017 }, { year: 2018 },
  ];
  [{ vw: 1280, vh: 900 }, { vw: 390, vh: 844 }].forEach((v) => {
    const L = S.layout({ nodes: REAL, vw: v.vw, vh: v.vh });
    const sides = L.nodes.filter((n) => !n.pair && !n.gap).map((n) => n.left);
    sides.slice(1).forEach((s, i) =>
      assert.notEqual(s, sides[i], "milestone " + (i + 1) + " repeats side at " + v.vw + "px"));
  });
});
