const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/lib/imageFit.js");

test("landscape scales down to the max long edge", () => {
  assert.deepEqual(F.fitWithin(4000, 3000, 2400), { w: 2400, h: 1800 });
});

test("portrait scales down to the max long edge", () => {
  assert.deepEqual(F.fitWithin(3000, 4000, 2400), { w: 1800, h: 2400 });
});

test("square scales down on both edges", () => {
  assert.deepEqual(F.fitWithin(3000, 3000, 2400), { w: 2400, h: 2400 });
});

test("an image already smaller than the max is never upscaled", () => {
  assert.deepEqual(F.fitWithin(1200, 800, 2400), { w: 1200, h: 800 });
});

test("an image exactly at the max is returned untouched", () => {
  assert.deepEqual(F.fitWithin(2400, 1600, 2400), { w: 2400, h: 1600 });
});

test("an extreme panorama keeps at least one pixel of height", () => {
  assert.deepEqual(F.fitWithin(12000, 400, 2400), { w: 2400, h: 80 });
  assert.deepEqual(F.fitWithin(12000, 2, 2400), { w: 2400, h: 1 });
});

test("invalid input yields zeroes rather than NaN", () => {
  assert.deepEqual(F.fitWithin(0, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(-5, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(100, 100, 0), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(NaN, 100, 2400), { w: 0, h: 0 });
  assert.deepEqual(F.fitWithin(undefined, undefined, 2400), { w: 0, h: 0 });
});
