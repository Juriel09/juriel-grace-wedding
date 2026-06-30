const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/lib/geometry.js");

test("clamp bounds values", () => {
  assert.equal(G.clamp(5, 0, 10), 5);
  assert.equal(G.clamp(-3, 0, 10), 0);
  assert.equal(G.clamp(99, 0, 10), 10);
});

test("lerp interpolates", () => {
  assert.equal(G.lerp(0, 10, 0.5), 5);
  assert.equal(G.lerp(10, 20, 0), 10);
  assert.equal(G.lerp(10, 20, 1), 20);
});

test("mapRange maps and clamps", () => {
  assert.equal(G.mapRange(5, 0, 10, 0, 100), 50);
  assert.equal(G.mapRange(-1, 0, 10, 0, 100, true), 0);
  assert.equal(G.mapRange(11, 0, 10, 0, 100, true), 100);
});

test("fitContain letterboxes centered", () => {
  const r = G.fitContain(1280, 720, 640, 720);
  assert.equal(r.scale, 0.5);
  assert.equal(r.w, 640);
  assert.equal(r.h, 360);
  assert.equal(r.x, 0);
  assert.equal(r.y, 180);
});

test("subRect takes fractional sub-rectangle", () => {
  const r = G.subRect({ x: 0, y: 0, w: 100, h: 100 }, 0.2, 0, 0.5, 1);
  assert.deepEqual(r, { x: 20, y: 0, w: 30, h: 100 });
});

test("regionRect slices vertically", () => {
  const r = G.regionRect({ x: 0, y: 0, w: 90, h: 90 }, 1, 3);
  assert.deepEqual(r, { x: 0, y: 30, w: 90, h: 30 });
});

test("frameTo cover frames a rect to fill viewport", () => {
  const t = G.frameTo({ x: 0, y: 0, w: 100, h: 50 }, 200, 100, "cover", 1);
  assert.equal(t.scale, 2);
  assert.equal(t.x, 0);
  assert.equal(t.y, 0);
});

test("frameIndexForProgress maps 0..1 to integer frames", () => {
  assert.equal(G.frameIndexForProgress(0, 193), 0);
  assert.equal(G.frameIndexForProgress(1, 193), 192);
  assert.equal(G.frameIndexForProgress(0.5, 193), 96);
  assert.equal(G.frameIndexForProgress(1.5, 193), 192); // clamped
});
