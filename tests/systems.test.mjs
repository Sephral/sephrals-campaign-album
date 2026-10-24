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
