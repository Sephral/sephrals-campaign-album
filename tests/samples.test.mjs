import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {KINDS} from "../scripts/rules.mjs";
import {MESSAGE_KEYS, SAMPLE_IMAGES, SELFTEST_PROBLEMS, sampleCombat, sampleEmptySession, sampleSessions} from "../scripts/sample-data.mjs";
import {combatLines} from "../scripts/rules.mjs";

const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
const get = key => key.split(".").reduce((o, k) => o?.[k], en);
const t = (key, data = {}) => String(get(key) ?? key).replace(/\{(\w+)\}/g, (m, name) => data[name] ?? m);
const photosOf = page => page.flags["sephrals-campaign-album"].photos;

test("the sample sessions are three ordered pages shaped like journal pages", () => {
  const pages = sampleSessions({now: Date.UTC(2026, 10, 22, 20), t});
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map(page => page.flags["sephrals-campaign-album"].session.number), [1, 2, 3]);
  assert.deepEqual(new Set(pages.map(page => page.id)).size, 3);
  for ( const page of pages ) {
    assert.match(page.name, /^Session \d, /);
    assert.equal(page.testUserPermission(), true);
  }
});

test("tonight has a photo of every kind, with unique ids and a picture each", () => {
  const photos = photosOf(sampleSessions({now: Date.UTC(2026, 10, 22, 20), t}).at(-1));
  assert.deepEqual(new Set(photos.map(photo => photo.kind)), new Set(KINDS));
  assert.equal(new Set(photos.map(photo => photo.id)).size, photos.length);
  assert.ok(photos.length > 9, "more than the nine photos of the share picture");
  for ( const photo of photos ) assert.ok(SAMPLE_IMAGES.includes(photo.src) && photo.time > 0, photo.id);
  assert.ok(photos.every((photo, index) => !index || photo.time > photos[index - 1].time));
});

test("captions use the module's own texts without leftovers", () => {
  for ( const page of sampleSessions({now: 1_800_000_000_000, t}) ) {
    for ( const photo of photosOf(page) ) assert.ok(!/[{}]/.test(photo.caption), photo.caption);
  }
});

test("an empty session has no photos", () => {
  assert.deepEqual(photosOf(sampleEmptySession({now: 1_800_000_000_000, t})), []);
});

test("the combat variants cover the singular, damage only and healing only lines", () => {
  const format = {t, num: String, join: names => names.join(" and ")};
  const lines = variant => combatLines(sampleCombat(variant), format);
  assert.ok(lines("night").some(line => line.includes("damage and")));
  assert.ok(lines("first").some(line => line.includes("1 fight")));
  assert.ok(lines("first").some(line => line.includes("dealt 14 damage.")));
  assert.ok(lines("healing").some(line => line.includes("healing.") && !line.includes("damage")));
  assert.ok(lines("night").some(line => line.includes("Ari and Mira")));
});

test("the listed messages and self test problems exist in the language file", () => {
  for ( const key of [...MESSAGE_KEYS, ...SELFTEST_PROBLEMS.map(([key]) => key)] ) assert.equal(typeof get(key), "string", key);
});
