import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test, {mock} from "node:test";

// The combat totals of the session pages with a small fake of Foundry: settings, the album journal, its pages and
// the API of Sephral's Combat Log & Stats.

const MODULE_ID = "sephrals-campaign-album";
const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
const HOUR = 3600 * 1000;

const getProperty = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);
const setProperty = (object, path, value) => {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for ( const part of parts ) target = target[part] ??= {};
  target[last] = value;
};

class FakePage {
  constructor(journal, data) {
    Object.assign(this, structuredClone(data));
    this.parent = journal;
    this.updates = 0;
  }

  async update(changes) {
    this.updates += 1;
    for ( const [key, value] of Object.entries(changes) ) setProperty(this, key, structuredClone(value));
  }
}

/** A world with an album of the given pages and Combat Log & Stats answering with answer(span). */
function world({pages=[], active=true, answer=() => null, gm=true, settings={}}={}) {
  const journal = {id: "album", pages: null};
  const list = pages.map(data => new FakePage(journal, data));
  journal.pages = {get: id => list.find(p => p.id === id), get contents() { return list; }};
  const values = new Map(Object.entries({albumJournal: "album", combatTotals: true, sessionGap: 8, ...settings}));
  const calls = [];
  let respond = answer;
  globalThis.foundry = {utils: {getProperty, randomID: () => Math.random().toString(36).slice(2, 10)}};
  globalThis.game = {
    i18n: {
      lang: "en",
      localize: key => getProperty(en, key) ?? key,
      format: (key, data) => Object.entries(data).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), getProperty(en, key) ?? key)
    },
    settings: {get: (module, key) => values.get(key), set: async (module, key, value) => values.set(key, value)},
    user: {isGM: gm, isActiveGM: gm},
    journal: {get: id => (id === "album" ? journal : undefined)},
    modules: {get: id => (id === "sephrals-combat-log-stats" ? {active, api: active ? {sessionTotals: async spans => {
      calls.push(structuredClone(spans));
      return spans.map(span => respond(span));
    }} : undefined} : undefined)}
  };
  return {pages: list, values, calls, setAnswer: fn => { respond = fn; }};
}

const album = await import("../scripts/album.mjs");

const NIGHT = Date.UTC(2026, 9, 24, 19);
const WEEK = 7 * 24 * HOUR;

/** A session page with photos at the given hours after its start. */
function page(id, number, start, hours=[0], extra={}) {
  const photos = hours.map((h, i) => ({id: `${id}-p${i}`, src: `${id}-${i}.webp`, caption: "", time: start + (h * HOUR)}));
  return {id, name: `Session ${number}`, sort: number * 1000, text: {content: `<p class="sca-intro">Intro</p><section class="sca-page"></section>`},
    flags: {[MODULE_ID]: {session: {number, started: start}, photos, ...extra}}};
}

/** API totals of a night. */
const totals = (fights, damage) => ({fights, rounds: fights * 3, damage, healing: 0, moraleDamage: 0, enemiesDefeated: fights,
  partyDowned: 0, criticalHits: 0, awards: [{key: "mvp", names: ["Aria"], value: damage}]});

test("pages without totals get the night's fights, an unchanged page is not written again", async () => {
  const {pages, calls} = world({
    pages: [page("p1", 1, NIGHT, [0, 3]), page("p2", 2, NIGHT + WEEK, [1])],
    answer: span => (span.from < NIGHT + HOUR ? totals(2, 40) : null)
  });
  await album.refreshCombatTotals(["p1", "p2"]);

  assert.deepEqual(calls, [[{from: NIGHT, to: NIGHT + (3 * HOUR)}, {from: NIGHT + WEEK, to: NIGHT + WEEK + HOUR}]],
    "one call for all pages, each from its first to its last photo");
  assert.deepEqual(pages[0].flags[MODULE_ID].combat, {fights: 2, rounds: 6, damage: 40, healing: 0, moraleDamage: 0,
    enemiesDefeated: 2, partyDowned: 0, criticalHits: 0, mvp: {names: ["Aria"], value: 40}});
  assert.match(pages[0].text.content, /<section class="sca-combat"><h3>Battles of the night<\/h3><ul><li>2 fights in 6 rounds\.<\/li>/);
  assert.match(pages[0].text.content, /<li>Hero of the night: Aria with 40 damage and healing\.<\/li>/);
  assert.equal(pages[1].flags[MODULE_ID].combat, undefined, "no fights that night");
  assert.equal(pages[1].updates, 0);
  assert.doesNotMatch(pages[1].text.content, /sca-combat/);

  const updates = pages.map(p => p.updates);
  await album.refreshCombatTotals(["p1", "p2"]);
  assert.deepEqual(pages.map(p => p.updates), updates);
});

test("a refresh changes only the totals section and keeps what the GM wrote", async () => {
  const {pages, setAnswer} = world({pages: [page("p1", 1, NIGHT)], answer: () => totals(1, 12)});
  pages[0].text.content += "<p>The GM's own recap</p>";
  await album.refreshCombatTotals(["p1"]);
  assert.match(pages[0].text.content, /<p>The GM's own recap<\/p><section class="sca-combat">.*1 fight in 3 rounds/);

  setAnswer(() => totals(2, 30));
  await album.refreshCombatTotals(["p1"]);
  assert.equal(pages[0].text.content.match(/sca-combat/g).length, 1);
  assert.match(pages[0].text.content, /The GM's own recap.*2 fights in 6 rounds/);

  // No fights found any more (player reports off, old logs removed): the page keeps its totals
  setAnswer(() => null);
  const updates = pages[0].updates;
  await album.refreshCombatTotals(["p1"]);
  assert.equal(pages[0].updates, updates);
  assert.equal(pages[0].flags[MODULE_ID].combat.fights, 2);
});

test("without Combat Log & Stats, with the setting off or for players nothing is asked or written", async () => {
  for ( const options of [{active: false}, {settings: {combatTotals: false}}, {gm: false}] ) {
    const {pages, calls} = world({pages: [page("p1", 1, NIGHT)], answer: () => totals(1, 5), ...options});
    await album.refreshCombatTotals(["p1"]);
    assert.equal(calls.length, 0, JSON.stringify(options));
    assert.equal(pages[0].updates, 0);
  }
});

test("the setting hides and shows the stored totals on every page", async () => {
  const {pages, values} = world({pages: [page("p1", 1, NIGHT), page("p2", 2, NIGHT + WEEK)], answer: () => totals(1, 9)});
  await album.refreshCombatTotals(["p1", "p2"]);
  pages[0].text.content += "<p>note</p>";

  values.set("combatTotals", false);
  await album.onCombatTotalsSetting();
  assert.ok(pages.every(p => !p.text.content.includes("sca-combat")));
  assert.ok(pages[0].text.content.endsWith("<p>note</p>"));
  assert.equal(pages[0].flags[MODULE_ID].combat.fights, 1, "the totals stay stored");

  values.set("combatTotals", true);
  await album.onCombatTotalsSetting();
  assert.ok(pages.every(p => p.text.content.includes("<li>1 fight in 3 rounds.</li>")));
});

test("a saved fight updates the pages of its night once, running fights wait for their end", async () => {
  mock.timers.enable({apis: ["setTimeout"]});
  try {
    const {pages, calls} = world({pages: [page("p1", 1, NIGHT, [0, 2]), page("p2", 2, NIGHT + WEEK)], answer: () => totals(1, 7)});
    album.onCombatLogSaved({id: "f1", status: "active", startedAt: new Date(NIGHT).toISOString()});
    mock.timers.tick(5000);
    assert.equal(calls.length, 0);

    album.onCombatLogSaved({id: "f1", status: "ended", startedAt: new Date(NIGHT + HOUR).toISOString()});
    album.onCombatLogSaved({id: "f1", status: "ended", startedAt: new Date(NIGHT + HOUR).toISOString()});
    mock.timers.tick(2000);
    await album.serialize(async () => {});
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].length, 1, "only the page of that night");
    assert.equal(pages[0].flags[MODULE_ID].combat.fights, 1);
    assert.equal(pages[1].flags[MODULE_ID].combat, undefined);

    // A deleted fight has no time: the latest page
    album.onCombatLogSaved({id: "f2", deleted: true});
    mock.timers.tick(2000);
    await album.serialize(async () => {});
    assert.equal(calls.length, 2);
    assert.equal(pages[1].flags[MODULE_ID].combat.fights, 1);
  } finally {
    mock.timers.reset();
  }
});

test("only the GM sees the hint, while Combat Log & Stats is not active and the totals are on", () => {
  world({active: false});
  const hint = album.combatTotalsHint();
  assert.match(hint, /^With <a href="https:\/\/foundryvtt\.com\/packages\/sephrals-combat-log-stats" target="_blank" rel="noopener">Sephral’s Combat Log &amp; Stats<\/a> the session pages/);
  world({active: true});
  assert.equal(album.combatTotalsHint(), "");
  // An older Combat Log & Stats without the totals gets the hint too, one still starting does not
  globalThis.game.modules.get = () => ({active: true, api: {openCombatLog: () => {}}});
  assert.match(album.combatTotalsHint(), /foundryvtt\.com\/packages\/sephrals-combat-log-stats/);
  globalThis.game.modules.get = () => ({active: true});
  assert.equal(album.combatTotalsHint(), "");
  world({active: false, gm: false});
  assert.equal(album.combatTotalsHint(), "");
  world({active: false, settings: {combatTotals: false}});
  assert.equal(album.combatTotalsHint(), "");
});

test("a new photo writes the page with the totals of its night, without Combat Log & Stats as before", async () => {
  for ( const active of [true, false] ) {
    const start = Date.now() - HOUR;
    const {pages, calls} = world({pages: [page("p1", 1, start)], active, answer: () => totals(3, 99),
      settings: {session: {number: 1, pageId: "p1", lastPhoto: start, autoCount: 0, lastAuto: 0, forceNew: false}}});
    globalThis.game.world = {id: "w"};
    globalThis.foundry.applications = {apps: {FilePicker: {implementation: {
      createDirectory: async () => {},
      upload: async (source, folder, file) => ({path: `${folder}/${file.name}`})
    }}}};
    globalThis.fetch = async () => ({blob: async () => new Blob(["x"], {type: "image/webp"})});
    try {
      const {photo} = await album.addPhoto({image: "data:image/webp;base64,eA==", width: 10, height: 10, kind: "crit",
        caption: "Boom"});
      assert.equal(pages[0].updates, 1, "one write for photo and totals");
      assert.equal(pages[0].flags[MODULE_ID].photos.at(-1).id, photo.id);
      if ( active ) {
        assert.equal(calls[0][0].from, start);
        assert.equal(calls[0][0].to, photo.time);
        assert.equal(pages[0].flags[MODULE_ID].combat.fights, 3);
        assert.match(pages[0].text.content, /<\/section><section class="sca-combat">.*3 fights in 9 rounds/);
      } else {
        assert.equal(calls.length, 0);
        assert.equal(pages[0].flags[MODULE_ID].combat, undefined);
        assert.doesNotMatch(pages[0].text.content, /sca-combat/);
      }
    } finally {
      delete globalThis.fetch;
    }
  }
});

test("the start of the world brings every page up to date in one request", async () => {
  const {pages, calls} = world({pages: [page("p1", 1, NIGHT), page("p2", 2, NIGHT + WEEK)], answer: () => totals(1, 4)});
  pages[0].flags[MODULE_ID].combat = {...totals(5, 50), mvp: null};
  await album.refreshCombatTotalsOnReady();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.ok(pages.every(p => p.flags[MODULE_ID].combat.fights === 1), "older pages follow later changes too");

  const idle = world({pages: [page("p1", 1, NIGHT)], active: false});
  await album.refreshCombatTotalsOnReady();
  assert.equal(idle.calls.length, 0);
});

test("a photo never waits long for Combat Log & Stats", async () => {
  mock.timers.enable({apis: ["setTimeout"]});
  try {
    const {pages} = world({pages: [page("p1", 1, NIGHT)]});
    globalThis.game.modules.get = () => ({active: true, api: {sessionTotals: () => new Promise(() => {})}});
    const done = album.refreshCombatTotals(["p1"]);
    await Promise.resolve();
    await Promise.resolve();
    mock.timers.tick(10000);
    await done;
    assert.equal(pages[0].updates, 0);
  } finally {
    mock.timers.reset();
  }
});
