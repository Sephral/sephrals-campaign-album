import assert from "node:assert/strict";
import test from "node:test";
import {ASPECT, clipToScreen, fitAspect, outputSize, photoFrame, toScreen, unionRect, viewFor} from "../scripts/frame.mjs";

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("unionRect covers all rectangles and ignores broken ones", () => {
  assert.deepEqual(unionRect([{x: 0, y: 0, width: 100, height: 100}, {x: 300, y: 50, width: 100, height: 200}, null,
    {x: NaN, y: 0, width: 1, height: 1}]), {x: 0, y: 0, width: 400, height: 250});
  assert.equal(unionRect([]), null);
  assert.equal(unionRect(undefined), null);
});

test("photoFrame centers on the tokens, keeps room around them and has the album's aspect ratio", () => {
  const tokens = [{x: 1000, y: 1000, width: 100, height: 100}, {x: 1300, y: 1000, width: 100, height: 100}];
  const frame = photoFrame(tokens, {grid: 100});
  assert.ok(close(frame.width / frame.height, ASPECT));
  assert.ok(close(frame.x + (frame.width / 2), 1200));
  assert.ok(close(frame.y + (frame.height / 2), 1050));
  // every token lies inside with at least two grid squares around it
  for ( const t of tokens ) {
    assert.ok(t.x - frame.x >= 200 - 1e-6);
    assert.ok((frame.x + frame.width) - (t.x + t.width) >= 200 - 1e-6);
    assert.ok(t.y - frame.y >= 200 - 1e-6);
    assert.ok((frame.y + frame.height) - (t.y + t.height) >= 200 - 1e-6);
  }
  // a single token gets the minimum width of ten squares
  const single = photoFrame([{x: 0, y: 0, width: 100, height: 100}], {grid: 100});
  assert.ok(close(single.width, 1000));
  assert.ok(close(single.height, 1000 / ASPECT));
});

test("photoFrame grows the height for tall groups and the width for wide ones", () => {
  const tall = photoFrame([{x: 0, y: 0, width: 100, height: 2000}], {grid: 100});
  assert.ok(tall.height >= 2000);
  assert.ok(close(tall.width / tall.height, ASPECT));
  const wide = photoFrame([{x: 0, y: 0, width: 4000, height: 100}], {grid: 100});
  assert.ok(wide.width >= 4000);
  assert.ok(close(wide.width / wide.height, ASPECT));
  assert.equal(photoFrame([], {grid: 100}), null);
});

test("fitAspect cuts a centered frame out of the screen", () => {
  const f = fitAspect({x: 0, y: 0, width: 1920, height: 1080});
  assert.ok(close(f.width / f.height, ASPECT));
  assert.ok(close(f.height, 1080));
  assert.ok(close(f.x, (1920 - f.width) / 2));
  const g = fitAspect({x: 10, y: 10, width: 800, height: 1000});
  assert.ok(close(g.width, 800));
  assert.ok(close(g.y, 10 + ((1000 - g.height) / 2)));
});

test("viewFor fits the frame and respects the zoom limits", () => {
  const v = viewFor({x: 0, y: 0, width: 2000, height: 1250}, {width: 1000, height: 1000});
  assert.equal(v.scale, 0.5);
  assert.deepEqual([v.x, v.y], [1000, 625]);
  assert.equal(viewFor({x: 0, y: 0, width: 10, height: 10}, {width: 1000, height: 1000}, {maxScale: 3}).scale, 3);
  assert.equal(viewFor({x: 0, y: 0, width: 1e6, height: 1e6}, {width: 1000, height: 1000}, {minScale: 0.1}).scale, 0.1);
});

test("toScreen and clipToScreen measure how much of a frame is visible", () => {
  const m = {a: 0.5, d: 0.5, tx: -100, ty: -50};
  const r = toScreen({x: 400, y: 200, width: 800, height: 400}, m);
  assert.deepEqual(r, {x: 100, y: 50, width: 400, height: 200});
  const full = clipToScreen(r, {width: 1000, height: 800});
  assert.equal(full.share, 1);
  const half = clipToScreen({x: 800, y: 0, width: 400, height: 100}, {width: 1000, height: 800});
  assert.equal(half.share, 0.5);
  assert.deepEqual(half.rect, {x: 800, y: 0, width: 200, height: 100});
  assert.equal(clipToScreen({x: 2000, y: 0, width: 100, height: 100}, {width: 1000, height: 800}).share, 0);
  assert.equal(clipToScreen({x: 0, y: 0, width: 0, height: 0}, {width: 1000, height: 800}).share, 0);
});

test("outputSize limits the width and keeps the aspect ratio", () => {
  assert.deepEqual(outputSize(3200, 2000, 1600), {width: 1600, height: 1000});
  assert.deepEqual(outputSize(800, 500, 1600), {width: 800, height: 500});
  assert.deepEqual(outputSize(0, 500, 1600), {width: 0, height: 0});
});
