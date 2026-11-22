// The made-up data of the sample windows (api.samples, contract in samples.mjs): three game nights with photos of every
// kind, as plain objects shaped like the journal pages of the album, so the real window code reads them unchanged.
// Pure: no Foundry globals, the texts come in as a function.
import {sampleCast, sampleText} from "./samples.mjs";

const MODULE_ID = "sephrals-campaign-album";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Pictures that ship with Foundry (v13 and v14), one per photo in turn. */
export const SAMPLE_IMAGES = [
  "icons/environment/wilderness/camp-improvised.webp",
  "icons/environment/settlement/castle-gatehouse.webp",
  "icons/environment/wilderness/cave-entrance-mountain.webp",
  "icons/environment/settlement/bridge-stone.webp",
  "icons/environment/wilderness/tomb-entrance.webp",
  "icons/environment/settlement/graveyard-tombstone-night.webp",
  "icons/environment/wilderness/terrain-river-road-gray.webp",
  "icons/environment/settlement/city-gate.webp",
  "icons/environment/wilderness/portal.webp",
  "icons/environment/settlement/church.webp",
  "icons/environment/wilderness/terrain-forest-gray.webp",
  "icons/environment/wilderness/mine-interior-dungeon-door.webp",
  "icons/environment/settlement/building-rubble.webp"
];

/**
 * The combat totals of a page (the shape combatSnapshot stores).
 * @param {"night"|"first"|"healing"} [variant]   night: everything, first: singular forms and damage only, healing: healing only
 * @returns {object}
 */
export function sampleCombat(variant = "night") {
  const base = {fights: 0, rounds: 0, damage: 0, healing: 0, moraleDamage: 0, enemiesDefeated: 0, partyDowned: 0, criticalHits: 0, mvp: null};
  if ( variant === "first" ) {
    return {...base, fights: 1, rounds: 1, damage: 14, enemiesDefeated: 1, partyDowned: 1, criticalHits: 1, mvp: {names: ["Ari"], value: 14}};
  }
  if ( variant === "healing" ) {
    return {...base, fights: 2, rounds: 7, healing: 22, moraleDamage: 9, enemiesDefeated: 3, partyDowned: 2, criticalHits: 2, mvp: {names: ["Tovin"], value: 22}};
  }
  return {...base, fights: 3, rounds: 11, damage: 212, healing: 34, moraleDamage: 18, enemiesDefeated: 6, partyDowned: 1, criticalHits: 4, mvp: {names: ["Ari", "Mira"], value: 96}};
}

/** A page object that reads like a journal page of the album (flags, ownership, permission test). */
function samplePage({id, number, started, photos, combat, title}) {
  const lang = globalThis.game?.i18n?.lang ?? "en";
  const date = new Date(started).toLocaleDateString(lang, {year: "numeric", month: "long", day: "numeric"});
  return {
    id,
    name: title(number, date),
    sort: number * 1000,
    documentName: "JournalEntryPage",
    ownership: {default: 2},
    parent: {id: "sample", ownership: {default: 2}},
    flags: {[MODULE_ID]: {session: {number, started}, photos, combat}},
    testUserPermission: () => true
  };
}

/**
 * The three sessions: two earlier ones and tonight with a photo of every kind (twelve, so the share picture says "and more").
 * @param {object} options
 * @param {number} [options.now]
 * @param {(key: string, data?: object) => string} options.t   Localize with data
 * @returns {object[]}   page objects, oldest first
 */
export function sampleSessions({now = Date.now(), t} = {}) {
  const title = (number, date) => t("SCA.Session.title", {number, date});
  const [ari, mira, tovin, sela] = sampleCast().filter(member => member.side === "party");
  const troll = sampleText("troll");
  const wolf = sampleText("wolf");
  const everyone = [ari.name, mira.name, tovin.name, sela.name];
  let counter = 0;
  const photo = (id, started, minutes, {kind, caption = "", actors = [], seenBy = "", by = ""}) => ({
    id, src: SAMPLE_IMAGES[counter++ % SAMPLE_IMAGES.length], width: 256, height: 256, kind, caption, actors, by, seenBy,
    sceneName: sampleText("place"), time: started + (minutes * MINUTE)
  });
  const tonight = now - (200 * MINUTE);
  const night = [
    photo("n01", tonight, 2, {kind: "manual", actors: everyone, by: "Gamemaster"}),
    photo("n02", tonight, 20, {kind: "crit", caption: t("SCA.Caption.critTarget", {name: ari.name, target: troll}), actors: [ari.name], seenBy: ari.player}),
    photo("n03", tonight, 34, {kind: "fumble", caption: t("SCA.Caption.fumbleTarget", {name: sela.name, target: wolf}), actors: [sela.name], seenBy: sela.player}),
    photo("n04", tonight, 41, {kind: "crit", caption: t("SCA.Caption.critCheck", {name: mira.name}), actors: [mira.name], seenBy: mira.player}),
    photo("n05", tonight, 48, {kind: "fumble", caption: t("SCA.Caption.fumbleCheck", {name: tovin.name}), actors: [tovin.name], seenBy: tovin.player}),
    photo("n06", tonight, 62, {kind: "down", caption: t("SCA.Caption.down", {name: mira.name}), actors: [mira.name], seenBy: tovin.player}),
    photo("n07", tonight, 75, {kind: "boss", caption: t("SCA.Caption.boss", {name: troll}), actors: [troll], seenBy: ari.player}),
    photo("n08", tonight, 77, {kind: "victory", caption: t("SCA.Caption.victory"), actors: everyone, seenBy: ari.player}),
    photo("n09", tonight, 100, {kind: "levelUp", caption: t("SCA.Caption.levelUp", {name: ari.name, level: 6}), actors: [ari.name], seenBy: ari.player}),
    photo("n10", tonight, 130, {kind: "death", caption: t("SCA.Caption.death", {name: "Bram"}), actors: ["Bram"], seenBy: sela.player}),
    photo("n11", tonight, 160, {kind: "dawn", caption: t("SCA.Caption.dawn"), actors: [ari.name, sela.name], seenBy: sela.player}),
    photo("n12", tonight, 170, {kind: "player", caption: `${ari.name}: ${sampleText("longsword")}`, actors: [ari.name], by: ari.player, seenBy: ari.player})
  ];
  const second = now - (7 * DAY);
  const week = [
    photo("w1", second, 15, {kind: "crit", caption: t("SCA.Caption.crit", {name: mira.name}), actors: [mira.name], seenBy: mira.player}),
    photo("w2", second, 55, {kind: "victory", caption: t("SCA.Caption.victory"), actors: [ari.name, mira.name], seenBy: ari.player}),
    photo("w3", second, 90, {kind: "manual", actors: [tovin.name], by: "Gamemaster"}),
    photo("w4", second, 120, {kind: "levelUp", caption: t("SCA.Caption.levelUp", {name: sela.name, level: 5}), actors: [sela.name], seenBy: sela.player})
  ];
  const first = now - (14 * DAY);
  const start = [
    photo("f1", first, 10, {kind: "manual", actors: [ari.name, mira.name], by: "Gamemaster"}),
    photo("f2", first, 70, {kind: "dawn", caption: t("SCA.Caption.dawn"), actors: [ari.name], seenBy: ari.player}),
    photo("f3", first, 95, {kind: "victory", caption: t("SCA.Caption.victory"), actors: [ari.name, mira.name, tovin.name], seenBy: ari.player})
  ];
  return [
    samplePage({id: "s1", number: 1, started: first, photos: start, combat: null, title}),
    samplePage({id: "s2", number: 2, started: second, photos: week, combat: sampleCombat("first"), title}),
    samplePage({id: "s3", number: 3, started: tonight, photos: night, combat: sampleCombat("night"), title})
  ];
}

/** A session without photos (for the empty state). */
export function sampleEmptySession({now = Date.now(), t} = {}) {
  return samplePage({id: "s4", number: 4, started: now, photos: [], combat: null, title: (number, date) => t("SCA.Session.title", {number, date})});
}

/** The keys of the texts a failed photo shows (skipped automatic photos and errors), in the order they are told. */
export const MESSAGE_KEYS = [
  "SCA.Skip.off", "SCA.Skip.limit", "SCA.Skip.cooldown",
  "SCA.Error.noCanvas", "SCA.Error.offscreen", "SCA.Error.capture", "SCA.Error.timeout", "SCA.Error.notActiveGM",
  "SCA.Error.otherScene", "SCA.Error.upload", "SCA.Error.noAlbum", "SCA.Error.photoGone"
];

/** The problems a self test can list, with the data their texts take. */
export const SELFTEST_PROBLEMS = [
  ["SCA.SELFTEST.NoJournal"], ["SCA.SELFTEST.JournalOwnership"], ["SCA.SELFTEST.JournalOwner"], ["SCA.SELFTEST.Upload"],
  ["SCA.SELFTEST.Folder", {folder: "worlds/sample/sephrals-campaign-album"}], ["SCA.SELFTEST.Capture"], ["SCA.SELFTEST.Socket"],
  ["SCA.SELFTEST.Generic", {system: "Sample System"}], ["SCA.SELFTEST.NoCharacters"]
];
