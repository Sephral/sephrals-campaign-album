import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {KINDS, TRIGGERS, autoAllowed, combatHtml, combatLines, combatSnapshot, naturalD20, nearSpan, needsNewSession,
  pageHtml, photoFileName, photographers, sunrisesBetween, withCombatSection}
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

/* -------------------------------------------- */
/*  Combat totals                               */
/* -------------------------------------------- */

const lang = {
  en: JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8")),
  de: JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"))
};

/**
 * The formatters of a page in one language, as album.mjs builds them.
 * @param {"en"|"de"} code
 */
function formatIn(code) {
  const t = (key, data={}) => {
    const text = key.split(".").reduce((o, k) => o?.[k], lang[code]) ?? key;
    return Object.entries(data).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
  };
  return {t, num: value => new Intl.NumberFormat(code).format(value),
    join: names => new Intl.ListFormat(code, {type: "conjunction"}).format(names)};
}

/** Totals as the API of Combat Log & Stats returns them. */
const TOTALS = {
  sessionIds: ["session-a"], startedAt: "2026-10-24T19:00:00.000Z", endedAt: "2026-10-24T23:00:00.000Z",
  systemId: "dnd5e", fights: 3, rounds: 14, durationMs: 3_000_000, damage: 1312, healing: 85, moraleDamage: 0,
  enemyDamage: null, enemiesDefeated: 11, partyDowned: 2, criticalHits: 4,
  members: [{name: "Aria", damage: 900}, {name: "Bram", damage: 412}],
  awards: [{key: "healer", names: ["Bram"], value: 85}, {key: "mvp", label: "MVP", names: ["Aria", "Bram"], value: 900}]
};

test("a page keeps only the totals it shows, and nothing without a fight", () => {
  assert.deepEqual(combatSnapshot(TOTALS), {fights: 3, rounds: 14, damage: 1312, healing: 85, moraleDamage: 0,
    enemiesDefeated: 11, partyDowned: 2, criticalHits: 4, mvp: {names: ["Aria", "Bram"], value: 900}});
  assert.equal(combatSnapshot(null), null);
  assert.equal(combatSnapshot({...TOTALS, fights: 0}), null);
  assert.equal(combatSnapshot({...TOTALS, awards: []}).mvp, null);
  assert.equal(combatSnapshot({fights: 1}).damage, 0);
});

test("the combat totals read like a short story of the night, in English and German", () => {
  const combat = combatSnapshot(TOTALS);
  assert.deepEqual(combatLines(combat, formatIn("en")), [
    "3 fights in 14 rounds.",
    "The heroes dealt 1,312 damage and 85 healing.",
    "11 foes defeated.",
    "Heroes went down 2 times.",
    "The heroes landed 4 critical hits.",
    "Hero of the night: Aria and Bram with 900 damage and healing."
  ]);
  assert.deepEqual(combatLines(combat, formatIn("de")), [
    "3 Kämpfe in 14 Runden.",
    "Die Helden teilten 1.312 Schaden und 85 Heilung aus.",
    "11 Gegner besiegt.",
    "Helden gingen 2 Mal zu Boden.",
    "Die Helden landeten 4 kritische Treffer.",
    "Held des Abends: Aria und Bram mit 900 Schaden und Heilung."
  ]);
  // One of each, Crucible morale, nothing that did not happen
  const single = {fights: 1, rounds: 1, damage: 0, healing: 6, moraleDamage: 4, enemiesDefeated: 1, partyDowned: 1,
    criticalHits: 1, mvp: null};
  assert.deepEqual(combatLines(single, formatIn("en")), ["1 fight in 1 round.", "The heroes dealt 6 healing.",
    "The heroes dealt 4 morale damage.", "1 foe defeated.", "A hero went down once.", "The heroes landed 1 critical hit."]);
  assert.deepEqual(combatLines({...single, healing: 0, moraleDamage: 0, enemiesDefeated: 0, partyDowned: 0,
    criticalHits: 0}, formatIn("en")), ["1 fight in 1 round."]);
  assert.deepEqual(combatLines(null, formatIn("en")), []);
});

test("the combat section is escaped, sits after the photos and replaces itself without touching the rest", () => {
  const section = combatHtml("Battles <of> the night", ["Hero of the night: <b>Aria</b> & Bram."]);
  assert.equal(section, "<section class=\"sca-combat\"><h3>Battles &lt;of&gt; the night</h3>"
    + "<ul><li>Hero of the night: &lt;b&gt;Aria&lt;/b&gt; &amp; Bram.</li></ul></section>");
  assert.equal(combatHtml("Title", []), "");

  const photo = {id: "a1", src: "x.webp", caption: "Boom", width: 10, height: 10};
  const page = pageHtml([photo], {intro: "Intro", meta: () => "", empty: "none", combat: section});
  assert.ok(page.endsWith(section));
  assert.ok(page.indexOf("sca-page") < page.indexOf("sca-combat"));
  assert.ok(!pageHtml([photo], {intro: "Intro", meta: () => "", empty: "none"}).includes("sca-combat"));

  // The GM wrote a note into the page: refreshing the totals keeps it
  const edited = `${pageHtml([photo], {intro: "Intro", meta: () => "", empty: "none"})}<p>Our notes $& more</p>`;
  const added = withCombatSection(edited, section);
  assert.equal(added, `${edited}${section}`);
  const newer = combatHtml("Battles", ["4 fights in 20 rounds."]);
  assert.equal(withCombatSection(added, newer), `${edited}${newer}`);
  assert.equal(withCombatSection(added, ""), edited);
  assert.equal(withCombatSection(edited, ""), edited);
  assert.equal(withCombatSection(null, ""), "");
});

test("a fight belongs to the pages whose photos lie less than the margin away", () => {
  const span = {from: Date.UTC(2026, 9, 24, 19), to: Date.UTC(2026, 9, 24, 23)};
  assert.equal(nearSpan(span, Date.UTC(2026, 9, 24, 20), 12 * HOUR), true);
  assert.equal(nearSpan(span, Date.UTC(2026, 9, 24, 10), 12 * HOUR), true);
  assert.equal(nearSpan(span, Date.UTC(2026, 9, 25, 12), 12 * HOUR), false);
  assert.equal(nearSpan(span, NaN, 12 * HOUR), false);
});
