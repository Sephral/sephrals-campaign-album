import assert from "node:assert/strict";
import test from "node:test";

// Stand ins for the Foundry globals the triggers and the debug file read
const hooks = new Map();
globalThis.Hooks = {on: (name, fn) => hooks.set(name, fn), off: () => {}};
globalThis.Roll = class Roll {};
globalThis.CONFIG = {};
globalThis.canvas = null;

const values = {autoPhotos: true, triggerCrit: true, triggerFumble: false, critsBy: "players", albumJournal: "",
  maxAuto: 5, cooldown: 60, sessionGap: 8, session: {}};
const token = {uuid: "Scene.s.Token.t", name: "Mira", actor: null};
const hero = {uuid: "Actor.hero", type: "character"};
const monster = {uuid: "Actor.monster", type: "npc"};
token.actor = hero;
const scene = {uuid: "Scene.s", tokens: {get: id => (id === "t" ? token : undefined), filter: () => []}};
globalThis.game = {
  system: {id: "dnd5e"},
  user: {isActiveGM: true, isGM: true},
  settings: {get: (module, key) => values[key]},
  scenes: {get: id => (id === "s" ? scene : undefined), active: scene},
  actors: {get: id => ({hero, monster})[id]},
  journal: {get: () => undefined},
  messages: {get: () => undefined}
};

const {MODULE_ID} = await import("../scripts/config.mjs");
const {assessRoll, photoTrace, registerTriggers, wasHandled} = await import("../scripts/triggers.mjs");
const {albumState, describeMessage} = await import("../scripts/debug.mjs");
registerTriggers();

let next = 0;
/**
 * A dnd5e 6 attack message.
 * @param {object} [options]
 * @returns {object}
 */
function attack({critical = true, fumble = false, speaker = {scene: "s", token: "t", actor: "hero"}, rolls} = {}) {
  return {id: `m${++next}`, type: "attack", speaker, rolls: rolls ?? [{isCritical: critical, isFumble: fumble}],
    system: {targets: [{token: "Scene.s.Token.goblin"}]}};
}

test("the assessment names the reason of every check in the order of the hook", () => {
  game.user.isActiveGM = false;
  assert.equal(assessRoll(attack()).reason, "notActiveGM");
  game.user.isActiveGM = true;
  assert.equal(assessRoll(attack({rolls: []})).reason, "noRolls");
  assert.equal(assessRoll(attack({critical: false})).reason, "noCritOrFumble");
  const fumble = assessRoll(attack({critical: false, fumble: true}));
  assert.deepEqual([fumble.kind, fumble.reason, fumble.wanted], ["fumble", "notWanted", false]);
  assert.equal(assessRoll(attack({speaker: {}})).reason, "noActor");
  assert.equal(assessRoll(attack({speaker: {actor: "monster"}})).reason, "notCharacter");
  assert.equal(assessRoll(attack({speaker: {actor: "hero"}})).reason, "noToken");
  const due = assessRoll(attack());
  assert.deepEqual([due.kind, due.reason, due.wanted, due.actor, due.token], ["crit", null, true, hero, token]);
  // critsBy all lets monsters through
  values.critsBy = "all";
  assert.equal(assessRoll(attack({speaker: {scene: "s", token: "t", actor: "monster"}})).reason, null);
  values.critsBy = "players";
});

test("the hook notes its decision in the trace and marks the message once the kind is wanted", async () => {
  const unwanted = attack({critical: false, fumble: true});
  await hooks.get("createChatMessage")(unwanted);
  assert.equal(wasHandled(unwanted.id), false);
  assert.deepEqual(photoTrace.forMessage(unwanted.id).map(entry => [entry.event, entry.kind, entry.reason]),
    [["roll", "fumble", "notWanted"]]);

  const lost = attack({speaker: {actor: "monster"}});
  await hooks.get("createChatMessage")(lost);
  assert.equal(wasHandled(lost.id), true);
  const [entry] = photoTrace.forMessage(lost.id);
  assert.deepEqual([entry.reason, entry.actor], ["notCharacter", "Actor.monster"]);
  // A second look stops at the mark, the debug file looks past it
  assert.equal(assessRoll(lost).reason, "alreadyTaken");
  assert.equal(assessRoll(lost, {ignoreHandled: true}).reason, "notCharacter");
});

test("the debug file describes a message with the rolls, the assessment and the targets", () => {
  const message = attack();
  const description = describeMessage(message);
  assert.equal(description.messageId, message.id);
  assert.equal(description.system, "dnd5e");
  assert.equal(description.rollEvent, "crit");
  assert.deepEqual(description.rolls.map(roll => roll.critical), [true]);
  assert.deepEqual(description.assessment, {kind: "crit", reason: null, wanted: true, scene: "Scene.s",
    actor: "Actor.hero", token: "Scene.s.Token.t"});
  assert.deepEqual(description.targetUuids, ["Scene.s.Token.goblin"]);
  assert.equal(description.handled, false);
});

test("the album state names the journal, the session and the limits", () => {
  const state = albumState();
  assert.equal(state.journalFound, false);
  assert.equal(state.maxAuto, 5);
  assert.equal(state.cooldown, 60);
  assert.equal(state.sessionPhotos, 0);
  assert.equal(state.session.autoCount, 0);
  assert.equal(MODULE_ID, "sephrals-campaign-album");
});
