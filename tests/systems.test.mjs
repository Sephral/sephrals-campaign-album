import assert from "node:assert/strict";
import test from "node:test";

// Stand ins for the Foundry globals systems.mjs reads
class Roll {
  static fromData(data) {
    return Object.assign(new Roll(), data);
  }
}
globalThis.Roll = Roll;
globalThis.game = {system: {id: "dnd5e"}};
globalThis.CONFIG = {};

const {messageRolls, system} = await import("../scripts/systems.mjs");

const d20 = result => ({faces: 20, results: [{result, active: true}]});

test("the rolls of a message: message.rolls, or the Ready Set Roll flag when it is there", () => {
  const plain = [Roll.fromData({total: 7})];
  assert.equal(messageRolls({rolls: plain}), plain);
  assert.deepEqual(messageRolls({}), []);
  const rolls = messageRolls({rolls: [], flags: {rsr5e: {rolls: [{total: 12}, null, {total: 3}]}}});
  assert.equal(rolls.length, 2);
  assert.ok(rolls.every(r => r instanceof Roll));
  assert.deepEqual(rolls.map(r => r.total), [12, 3]);
  // an empty flag means the card has no rolls yet, message.rolls is not used
  assert.deepEqual(messageRolls({rolls: plain, flags: {rsr5e: {rolls: []}}}), []);
});

test("D&D 5e: the attack of a Ready Set Roll card decides crit and fumble, its damage does not", () => {
  const rules = system();
  assert.equal(rules.id, "dnd5e");
  const card = (attack, damage = {options: {rollType: "damage"}, isCritical: true}) => ({rolls: [], flags: {rsr5e:
    {rolls: [attack, damage].filter(Boolean)}}});
  assert.equal(rules.rollEvent(card({options: {rollType: "attack"}, isCritical: true})), "crit");
  assert.equal(rules.rollEvent(card({options: {rollType: "attack"}, isFumble: true})), "fumble");
  assert.equal(rules.rollEvent(card({options: {rollType: "attack"}})), null);
  // a card without an attack (a spell with a save, a damage roll on its own) is no crit
  assert.equal(rules.rollEvent(card(null)), null);
  // without the flag the message type decides as before
  assert.equal(rules.rollEvent({type: "attack", rolls: [Roll.fromData({isCritical: true})]}), "crit");
  assert.equal(rules.rollEvent({flags: {dnd5e: {roll: {type: "attack"}}}, rolls: [Roll.fromData({isFumble: true})]}), "fumble");
  assert.equal(rules.rollEvent({type: "check", rolls: [Roll.fromData({isCritical: true})]}), null);
});

test("generic rules read natural d20s from Ready Set Roll cards too", () => {
  game.system.id = "plain";
  try {
    const rules = system();
    assert.equal(rules.id, "generic");
    assert.equal(rules.rollEvent({rolls: [], flags: {rsr5e: {rolls: [{dice: [d20(20)]}]}}}), "crit");
    assert.equal(rules.rollEvent({rolls: [], flags: {rsr5e: {rolls: [{dice: [d20(1)]}]}}}), "fumble");
    assert.equal(rules.rollEvent({rolls: [Roll.fromData({dice: [d20(11)]})]}), null);
  } finally {
    game.system.id = "dnd5e";
  }
});

/** Run a test body with Pathfinder 2e as the running system and the given world. */
function withPf2e(world, body) {
  const saved = {combats: game.combats, combat: game.combat, actors: game.actors, settings: game.settings};
  game.system.id = "pf2e";
  Object.assign(game, {combats: [], combat: null, actors: [], settings: {get: (id, key) => (world.settings ?? {})[key]}}, world.game);
  try {
    return body(system());
  } finally {
    game.system.id = "dnd5e";
    for ( const key of Object.keys(saved) ) game[key] = saved[key];
  }
}

const check = (type, outcome, extra = {}) => ({flags: {pf2e: {context: {type, outcome}}}, rolls: [{}], ...extra});

test("Pathfinder 2e: the degree of success of strikes and spell attacks decides crit and fumble", () => withPf2e({}, rules => {
  assert.equal(rules.id, "pf2e");
  assert.equal(rules.rollEvent(check("attack-roll", "criticalSuccess")), "crit");
  assert.equal(rules.rollEvent(check("attack-roll", "criticalFailure")), "fumble");
  assert.equal(rules.rollEvent(check("spell-attack-roll", "criticalSuccess")), "crit");
  assert.equal(rules.rollEvent(check("attack-roll", "success")), null);
  assert.equal(rules.rollEvent(check("attack-roll", "failure")), null);
  assert.equal(rules.isAttack(check("attack-roll", "criticalSuccess")), true);
  // the damage roll of a critical strike carries the outcome, but is no new moment
  assert.equal(rules.rollEvent(check("damage-roll", "criticalSuccess")), null);
  assert.equal(rules.rollEvent(check("flat-check", "criticalSuccess")), null);
  assert.equal(rules.rollEvent({rolls: [{}], flags: {}}), null);
}));

test("Pathfinder 2e: skill checks, saves and Perception count unless the setting is off", () => {
  for ( const type of ["skill-check", "saving-throw", "perception-check"] ) {
    withPf2e({settings: {critChecks: true}}, rules => {
      assert.equal(rules.rollEvent(check(type, "criticalSuccess")), "crit", type);
      assert.equal(rules.rollEvent(check(type, "criticalFailure")), "fumble", type);
      assert.equal(rules.isAttack(check(type, "criticalSuccess")), false, type);
    });
    withPf2e({settings: {critChecks: false}}, rules => {
      assert.equal(rules.rollEvent(check(type, "criticalSuccess")), null, type);
    });
  }
  // an attack counts with the setting off
  withPf2e({settings: {critChecks: false}}, rules => assert.equal(rules.rollEvent(check("attack-roll", "criticalSuccess")), "crit"));
});

test("Pathfinder 2e: secret and blind rolls stay out of the album", () => withPf2e({}, rules => {
  assert.equal(rules.rollEvent(check("attack-roll", "criticalSuccess", {blind: true})), null);
  assert.equal(rules.rollEvent(check("attack-roll", "criticalSuccess", {whisper: ["gm"]})), null);
  assert.equal(rules.rollEvent(check("attack-roll", "criticalSuccess", {whisper: []})), "crit");
}));

test("Pathfinder 2e: the target of a strike is the token named in the context", () => withPf2e({}, rules => {
  const message = {flags: {pf2e: {context: {target: {actor: "Actor.a", token: "Scene.s.Token.t"}}}}};
  assert.deepEqual(rules.targetUuids(message), ["Scene.s.Token.t"]);
  assert.deepEqual(rules.targetUuids({flags: {pf2e: {context: {target: {actor: "Actor.a"}}}}}), ["Actor.a"]);
  assert.deepEqual(rules.targetUuids({flags: {pf2e: {context: {target: null}}}}), []);
  assert.deepEqual(rules.targetUuids({}), []);
}));

const hero = (level, extra = {}) => ({type: "character", hasPlayerOwner: true, system: {details: {level: {value: level}},
  attributes: {dying: {value: 0, max: 4}}}, statuses: new Set(), ...extra});
const npc = (level, extra = {}) => ({type: "npc", hasPlayerOwner: false, system: {details: {level: {value: level}}},
  statuses: new Set(), isDead: false, ...extra});

test("Pathfinder 2e: a boss is an NPC two or more levels above the party, the party of the fight first", () => {
  const party = [hero(5), hero(5), hero(6)];
  withPf2e({game: {actors: party}}, rules => {
    assert.equal(rules.isBoss(npc(7)), true);
    assert.equal(rules.isBoss(npc(9)), true);
    assert.equal(rules.isBoss(npc(6)), false);
    assert.equal(rules.isBoss(npc(1)), false);
    // player characters and other actors are never bosses
    assert.equal(rules.isBoss(hero(20)), false);
    assert.equal(rules.isBoss({...npc(20), hasPlayerOwner: true}), false);
    assert.equal(rules.isBoss({type: "hazard", system: {details: {level: {value: 20}}}}), false);
  });
  // the combat decides which characters make the party
  const fight = {combatants: [{actor: hero(10)}, {actor: npc(12)}]};
  withPf2e({game: {actors: party, combats: {active: fight}}}, rules => {
    assert.equal(rules.isBoss(npc(11)), false);
    assert.equal(rules.isBoss(npc(12)), true);
  });
  // no player characters, no party level, no boss
  withPf2e({}, rules => assert.equal(rules.isBoss(npc(20)), false));
});

test("Pathfinder 2e: dying and death of a character", () => withPf2e({}, rules => {
  const dying = value => hero(3, {system: {details: {level: {value: 3}}, attributes: {dying: {value, max: 4}}}});
  assert.equal(rules.isDown(dying(1)), true);
  assert.equal(rules.isDown(dying(0)), false);
  assert.equal(rules.isDead(dying(3)), false);
  assert.equal(rules.isDead(dying(4)), true);
  // doomed lowers the maximum
  assert.equal(rules.isDead(hero(3, {system: {attributes: {dying: {value: 2, max: 2}}}})), true);
  // 0 hit points alone are only the moment before the dying condition arrives
  assert.equal(rules.isDead(hero(3, {isDead: true})), false);
  assert.equal(rules.isDead(hero(3, {statuses: new Set(["dead"])})), true);
  // monsters are dead at 0 hit points
  assert.equal(rules.isDead(npc(3, {isDead: true})), true);
  assert.equal(rules.isDead(npc(3)), false);
  assert.equal(rules.isDown(npc(3)), false);
  assert.equal(rules.isCharacter(hero(1)), true);
  assert.equal(rules.isCharacter(npc(1)), false);
}));

test("Pathfinder 2e: levels of characters, hazards are no foes", () => withPf2e({}, rules => {
  assert.equal(rules.level(hero(7)), 7);
  assert.equal(rules.level(npc(7)), null);
  assert.equal(rules.isFoe(npc(1)), true);
  assert.equal(rules.isFoe({type: "hazard"}), false);
  assert.equal(rules.isFoe({type: "loot"}), false);
}));

test("other systems know no dying heroes, every actor may be a foe, every critical roll is an attack", () => {
  const rules = system();
  assert.equal(rules.id, "dnd5e");
  assert.equal(rules.isDown(hero(1)), false);
  assert.equal(rules.isFoe({type: "hazard"}), true);
  assert.equal(rules.isAttack({}), true);
});
