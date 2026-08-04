const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../google-apps-script/photos.gs");

const MNL = 480;                       // Asia/Manila, minutes east of UTC
const at = (s) => Date.parse(s);       // ISO with explicit offset

test("parseConfig lowercases keys, trims, and skips the header row", () => {
  const cfg = P.parseConfig([
    ["Setting", "Value"],
    [" Open_At ", "2026-11-11 13:00"],
    ["FORCE_OPEN", "TRUE"],
    ["", "ignored"],
  ]);
  assert.equal(cfg.open_at, "2026-11-11 13:00");
  assert.equal(cfg.force_open, "TRUE");
  assert.equal(Object.keys(cfg).length, 2);
});

test("truthy accepts the spellings a person actually types", () => {
  for (const v of ["TRUE", "true", " Yes ", "1", true]) assert.equal(P.truthy(v), true, String(v));
  for (const v of ["FALSE", "no", "0", "", null, undefined, false]) assert.equal(P.truthy(v), false, String(v));
});

test("parseWhen reads a bare string as Manila time", () => {
  assert.equal(P.parseWhen("2026-11-11 13:00", MNL), at("2026-11-11T13:00:00+08:00"));
  assert.equal(P.parseWhen("2026-11-11T13:00:00", MNL), at("2026-11-11T13:00:00+08:00"));
});

test("parseWhen passes through Dates and epoch numbers", () => {
  const d = new Date("2026-11-11T05:00:00Z");
  assert.equal(P.parseWhen(d, MNL), d.getTime());
  assert.equal(P.parseWhen(d.getTime(), MNL), d.getTime());
});

test("parseWhen returns null for blank or unparseable values", () => {
  for (const v of ["", "   ", "soon", "11/11/2026", null, undefined, new Date("nope")]) {
    assert.equal(P.parseWhen(v, MNL), null, String(v));
  }
});

test("the gate is shut before open_at and open from the exact minute onward", () => {
  const cfg = { open_at: "2026-11-11 13:00" };
  assert.equal(P.gateState(cfg, at("2026-11-11T12:59:59+08:00"), MNL).open, false);
  assert.equal(P.gateState(cfg, at("2026-11-11T13:00:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2026-11-12T03:00:00+08:00"), MNL).open, true);
});

test("close_at shuts it again; blank close_at never does", () => {
  const cfg = { open_at: "2026-11-11 13:00", close_at: "2026-11-12 06:00" };
  assert.equal(P.gateState(cfg, at("2026-11-12T05:59:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2026-11-12T06:00:00+08:00"), MNL).open, false);
  const never = { open_at: "2026-11-11 13:00", close_at: "" };
  assert.equal(P.gateState(never, at("2027-01-01T00:00:00+08:00"), MNL).open, true);
});

test("force_open overrides both dates", () => {
  const cfg = { open_at: "2026-11-11 13:00", close_at: "2026-11-12 06:00", force_open: "TRUE" };
  assert.equal(P.gateState(cfg, at("2026-08-04T21:00:00+08:00"), MNL).open, true);
  assert.equal(P.gateState(cfg, at("2027-01-01T00:00:00+08:00"), MNL).open, true);
});

test("a missing or broken open_at fails SHUT, never open", () => {
  assert.equal(P.gateState({}, Date.now(), MNL).open, false);
  assert.equal(P.gateState({ open_at: "" }, Date.now(), MNL).open, false);
  assert.equal(P.gateState({ open_at: "whenever" }, Date.now(), MNL).open, false);
});

test("gateState reports the parsed times back for the countdown", () => {
  const g = P.gateState({ open_at: "2026-11-11 13:00" }, at("2026-08-04T21:00:00+08:00"), MNL);
  assert.equal(g.opensAt, at("2026-11-11T13:00:00+08:00"));
  assert.equal(g.closesAt, null);
  assert.equal(g.forced, false);
});
