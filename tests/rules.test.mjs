import assert from "node:assert/strict";
import test from "node:test";
import {KINDS, TRIGGERS, autoAllowed, naturalD20, needsNewSession, pageHtml, photoFileName, photographers,
  sunrisesBetween}
  from "../scripts/rules.mjs";

const HOUR = 3600 * 1000;

test("a new session starts without a session, on request and after the gap", () => {
  const now = Date.UTC(2026, 9, 14, 20);
  assert.equal(needsNewSession({}, now, 8), true);
  assert.equal(needsNewSession({number: 2, lastPhoto: now - HOUR}, now, 8), false);
  assert.equal(needsNewSession({number: 2, lastPhoto: now - (9 * HOUR)}, now, 8), true);
  assert.equal(needsNewSession({number: 2, lastPhoto: now - HOUR, forceNew: true}, now, 8), true);
  // a fresh session page without photos stays
  assert.equal(needsNewSession({number: 3, lastPhoto: 0}, now, 8), false);
});

test("automatic photos respect the limit per session and the cooldown", () => {
  const now = 1_000_000;
  assert.deepEqual(autoAllowed({autoCount: 0}, now, {max: 5, cooldown: 60}), {ok: true});
  assert.deepEqual(autoAllowed({autoCount: 5}, now, {max: 5, cooldown: 60}), {ok: false, reason: "limit"});
  assert.deepEqual(autoAllowed({autoCount: 99}, now, {max: 0, cooldown: 0}), {ok: true});
  assert.deepEqual(autoAllowed({autoCount: 1, lastAuto: now - 30000}, now, {max: 5, cooldown: 60}),
    {ok: false, reason: "cooldown"});
  assert.deepEqual(autoAllowed({autoCount: 1, lastAuto: now - 61000}, now, {max: 5, cooldown: 60}), {ok: true});
});

test("naturalD20 reads the kept d20 and ignores dropped dice", () => {
  assert.deepEqual(naturalD20([{faces: 20, results: [{result: 20, active: true}]}]), {natural: 20, max: true, min: false});
  assert.deepEqual(naturalD20([{faces: 20, results: [{result: 1}]}]), {natural: 1, max: false, min: true});
  // advantage: the 20 was dropped, the 7 kept
  assert.deepEqual(naturalD20([{faces: 20, results: [{result: 20, active: false, discarded: true}, {result: 7, active: true}]}]),
    {natural: 7, max: false, min: false});
  assert.deepEqual(naturalD20([{faces: 8, results: [{result: 8}]}]), {natural: null, max: false, min: false});
  assert.deepEqual(naturalD20([]), {natural: null, max: false, min: false});
  // two kept d20 (a pool) is not a natural roll
  assert.equal(naturalD20([{faces: 20, results: [{result: 20}, {result: 20}]}]).natural, null);
});

test("pageHtml escapes captions and shows a note for an empty page", () => {
  const html = pageHtml([{id: "a1", src: "worlds/w/x.webp", caption: "<b>Boom</b> & \"bang\"", width: 1600, height: 1000}],
    {intro: "Intro", meta: () => "today · Aria", empty: "none"});
  assert.match(html, /&lt;b&gt;Boom&lt;\/b&gt; &amp; &quot;bang&quot;/);
  assert.match(html, /src="worlds\/w\/x\.webp"/);
  assert.match(html, /today · Aria/);
  assert.ok(!html.includes("<b>Boom"));
  assert.match(pageHtml([], {intro: "Intro", meta: () => "", empty: "none"}), /<em>none<\/em>/);
});

test("photo file names are unique per random part and safe", () => {
  const name = photoFileName(Date.UTC(2026, 0, 2, 3, 4, 5), "a/b!c9");
  assert.match(name, /^photo-\d{8}-\d{6}-abc9\.webp$/);
});

test("photographers: owners first, then other players, the GM last; only users on the scene", () => {
  const users = [
    {id: "gm", isGM: true, active: true, viewing: true},
    {id: "p1", isGM: false, active: true, viewing: true},
    {id: "p2", isGM: false, active: true, viewing: true},
    {id: "p3", isGM: false, active: false, viewing: true},
    {id: "p4", isGM: false, active: true, viewing: false}
  ];
  assert.deepEqual(photographers(users, ["p2"], "players", "gm"), ["p2", "p1", "gm"]);
  assert.deepEqual(photographers(users, [], "players", "gm"), ["p1", "p2", "gm"]);
  assert.deepEqual(photographers(users, ["p2"], "gm", "gm"), ["gm"]);
  assert.deepEqual(photographers([], [], "players", "gm"), ["gm"]);
  // the GM looks at another scene: only players
  const away = users.map(u => (u.id === "gm" ? {...u, viewing: false} : u));
  assert.deepEqual(photographers(away, ["p2"], "players", "gm"), ["p2", "p1"]);
  assert.deepEqual(photographers(away, [], "gm", "gm"), []);
});

test("every trigger is a kind", () => {
  for ( const trigger of TRIGGERS ) assert.ok(KINDS.includes(trigger));
});

test("sunrisesBetween counts the sunrises a change of the world time passed", () => {
  const DAY = 86400;
  // Sunrise at 6:00 of every day, world time 0 is midnight of day 0
  const at = 6 * 3600;
  assert.equal(sunrisesBetween(5 * 3600, 7 * 3600, DAY, at), 1);
  assert.equal(sunrisesBetween(7 * 3600, 12 * 3600, DAY, at), 0);
  assert.equal(sunrisesBetween(22 * 3600, DAY + (8 * 3600), DAY, at), 1);
  assert.equal(sunrisesBetween(0, 10 * DAY, DAY, at), 10);
  // Exactly at sunrise counts once, a step back or no day length never
  assert.equal(sunrisesBetween(at - 60, at, DAY, at), 1);
  assert.equal(sunrisesBetween(at, at + 60, DAY, at), 0);
  assert.equal(sunrisesBetween(7 * 3600, 5 * 3600, DAY, at), 0);
  assert.equal(sunrisesBetween(0, DAY, 0, at), 0);
  // Any sunrise serves as the reference, also one far in the future
  assert.equal(sunrisesBetween(5 * 3600, 7 * 3600, DAY, at + (400 * DAY)), 1);
});
