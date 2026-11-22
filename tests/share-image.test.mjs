import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {BADGES, IMAGE_WIDTH, MAX_PHOTOS, THEMES, gridFor, layoutShareImage, paintShareImage, pickPhotos, shareFileName,
  shareModel, wrapText} from "../scripts/share-image.mjs";
import {KINDS} from "../scripts/rules.mjs";

const fakeMeasure = (text, font) => String(text).length * (Number(/(\d+)px/.exec(font)?.[1]) || 16) * 0.5;
const photo = (n, kind="manual", caption=`Photo ${n}`) => ({id: `p${n}`, kind, caption, src: `worlds/x/p${n}.webp`, time: n});
const modelOf = (photos, extra={}) => shareModel({title: "The Ember Road", label: "Session 3", subtitle: "20 November 2026 · 5 photos",
  photos: photos.map(p => ({caption: p.caption, kind: p.kind, kindLabel: `K-${p.kind}`, src: p.src})), footer: "Made with Sephral’s Campaign Album", ...extra});

test("grid shapes for one to nine photos", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => Object.values(gridFor(n)).join("x")),
    ["1x0", "1x1", "2x1", "3x1", "2x2", "3x2", "3x2", "3x3", "3x3", "3x3"]);
});

test("pickPhotos keeps up to nine in order and prefers big moments", () => {
  const few = [photo(1), photo(2)];
  assert.deepEqual(pickPhotos(few), few);
  const many = Array.from({length: 12}, (_, i) => photo(i + 1, i === 10 ? "boss" : "manual"));
  const picked = pickPhotos(many);
  assert.equal(picked.length, MAX_PHOTOS);
  assert.ok(picked.some(p => p.id === "p11"), "the boss photo is in");
  assert.deepEqual(picked.map(p => p.time), [...picked.map(p => p.time)].sort((a, b) => a - b), "chronological");
  assert.equal(pickPhotos(many, 4).length, 4);
});

test("every kind has a badge color", () => {
  for ( const kind of KINDS ) assert.ok(BADGES[kind], kind);
});

test("wrapText breaks at words and cuts words that are too wide", () => {
  const m = t => t.length * 10;
  assert.deepEqual(wrapText(m, "aaa bbb ccc", 70), ["aaa bbb", "ccc"]);
  assert.deepEqual(wrapText(m, "abcdefghij", 40), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapText(m, "", 40), []);
});

test("layout: width, height grows with the rows, tiles stay inside", () => {
  const sizes = [1, 3, 4, 6, 9].map(n => layoutShareImage(modelOf(Array.from({length: n}, (_, i) => photo(i + 1))), {measure: fakeMeasure}));
  for ( const layout of sizes ) {
    assert.equal(layout.width, IMAGE_WIDTH);
    for ( const op of layout.ops.filter(o => o.type === "image" || o.type === "rect") ) {
      assert.ok(op.x >= 0 && (op.x + op.w) <= IMAGE_WIDTH, JSON.stringify(op));
      assert.ok(op.y >= 0 && (op.y + op.h) <= layout.height, JSON.stringify(op));
    }
  }
  assert.ok(sizes[2].height > sizes[1].height, "two rows are taller than one");
  assert.ok(sizes[4].height > sizes[3].height, "three rows are taller than two");
  assert.deepEqual(sizes.map(l => l.ops.filter(o => o.type === "image").length), [1, 3, 4, 6, 9]);
  for ( const layout of sizes ) for ( const op of layout.ops.filter(o => o.type === "image") ) assert.ok(op.x + op.w <= IMAGE_WIDTH - 40);
});

test("layout: rows are aligned, tiles do not overlap", () => {
  const layout = layoutShareImage(modelOf(Array.from({length: 9}, (_, i) => photo(i + 1))), {measure: fakeMeasure});
  const images = layout.ops.filter(o => o.type === "image");
  assert.equal(new Set(images.map(o => o.y)).size, 3);
  assert.equal(new Set(images.map(o => o.x)).size, 3);
  for ( const a of images ) for ( const b of images ) {
    if ( a === b ) continue;
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
});

test("layout: the credit line is the footer and disappears without it", () => {
  const on = layoutShareImage(modelOf([photo(1)]), {measure: fakeMeasure});
  const off = layoutShareImage(modelOf([photo(1)], {footer: ""}), {measure: fakeMeasure});
  const texts = layout => layout.ops.filter(o => o.type === "text").map(o => o.text);
  assert.ok(texts(on).includes("Made with Sephral’s Campaign Album"));
  assert.ok(!texts(off).includes("Made with Sephral’s Campaign Album"));
  assert.ok(off.height < on.height);
});

test("layout: title, session label, captions and badges appear; long captions end with an ellipsis", () => {
  const long = photo(2, "crit", "A very long caption that goes on and on and on and on and on and on and on and on and on and on and on");
  const layout = layoutShareImage(modelOf([photo(1, "boss", "The goblin falls"), long]), {measure: fakeMeasure});
  const texts = layout.ops.filter(o => o.type === "text").map(o => o.text);
  assert.ok(texts.includes("The Ember Road"));
  assert.ok(texts.includes("SESSION 3"));
  assert.ok(texts.includes("The goblin falls"));
  assert.ok(texts.includes("K-BOSS") && texts.includes("K-CRIT"));
  assert.ok(texts.some(t => t.endsWith("…")));
});

test("layout: more-line, light theme, and an empty caption falls back to the kind", () => {
  const layout = layoutShareImage(modelOf([photo(1, "dawn", "")], {more: "+3 more in the album"}), {theme: "light", measure: fakeMeasure});
  const texts = layout.ops.filter(o => o.type === "text").map(o => o.text);
  assert.ok(texts.includes("+3 more in the album"));
  assert.ok(texts.includes("K-dawn"));
  assert.equal(layout.theme, THEMES.light);
  assert.equal(layout.ops[0].color, THEMES.light.bg);
});

test("layout: no photos still gives a valid picture", () => {
  const layout = layoutShareImage(modelOf([]), {measure: fakeMeasure});
  assert.ok(layout.height >= 320);
  assert.equal(layout.ops.filter(o => o.type === "image").length, 0);
});

test("paint: a missing photo is drawn as a placeholder, a loaded one as cover", () => {
  const layout = layoutShareImage(modelOf([photo(1), photo(2)]), {measure: fakeMeasure});
  const calls = [];
  const context = new Proxy({}, {get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
    set: (target, key, value) => { target[key] = value; return true; }});
  paintShareImage(context, layout, [{width: 400, height: 100, close() {}}, null]);
  const draws = calls.filter(c => c[0] === "drawImage");
  assert.equal(draws.length, 1, "only the loaded photo is drawn");
  // 400x100 into a box of about 3:2: cut left and right, full height
  const [, , sx, sy, sw, sh] = draws[0];
  assert.equal(sh, 100);
  assert.ok(sy === 0 && sx > 0 && sw < 400);
  assert.ok(calls.some(c => c[0] === "lineTo"), "placeholder cross");
  assert.equal(calls.filter(c => c[0] === "clip").length, 2);
});

test("file name: world, session and day", () => {
  assert.equal(shareFileName("Die Äbte & Ritter!", 3, "webp", new Date("2026-11-21T10:00:00Z")), "die-abte-ritter-session-3-2026-11-21.webp");
  assert.equal(shareFileName("", 0, "png", new Date("2026-11-21T10:00:00Z")), "album-2026-11-21.png");
});

test("the strings of the picture exist in English and German", () => {
  for ( const lang of ["en", "de"] ) {
    const share = JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), "utf8")).SCA.ShareImage;
    for ( const key of ["Group", "Copy", "Save", "Post", "Session", "More", "Credit", "Copied", "Saved", "CopyFallback", "None", "Posted"] ) {
      assert.equal(typeof share[key], "string", `${lang} ${key}`);
    }
    assert.ok(!/[;]|\s[-–—]\s/.test(Object.values(share).join(" ")), "no semicolon or dash as punctuation");
  }
});

test("layout: badge backgrounds are drawn after the photos, so they stay visible", () => {
  const layout = layoutShareImage(modelOf([photo(1, "boss")]), {measure: fakeMeasure});
  const image = layout.ops.findIndex(o => o.type === "image");
  const badge = layout.ops.findIndex(o => o.type === "rect" && o.color === BADGES.boss.color);
  assert.ok(image >= 0 && badge > image);
});
