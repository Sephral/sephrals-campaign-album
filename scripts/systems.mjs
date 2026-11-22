/**
 * What the album needs to know about the game system: which rolls are critical, who counts as a player character,
 * a boss, dead, and which level a character has. D&D 5e, Pathfinder 2e and Crucible are built in, other systems use the generic
 * rules (a natural 20 or 1 on a d20, the "dead" status, no bosses, no levels).
 */

import {setting} from "./config.mjs";
import {isAboveParty, naturalD20, partyLevelOf, pf2eOutcome} from "./rules.mjs";

/**
 * The defeated status id of this world.
 * @returns {string}
 */
function deadStatus() {
  return CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
}

/**
 * Dice of a roll in the plain form naturalD20 reads.
 * @param {Roll} roll
 * @returns {object[]}
 */
function diceOf(roll) {
  return (roll?.dice ?? []).map(d => ({faces: d.faces, results: (d.results ?? []).map(r => ({result: r.result,
    active: r.active, discarded: r.discarded}))}));
}

/**
 * The rolls of a chat message. Ready Set Roll (D&D 5e) keeps the rolls of its cards serialized in flags.rsr5e.rolls
 * and leaves message.rolls empty; the flag wins whenever it is there, as in Ready Set Roll itself.
 * @param {ChatMessage} message
 * @returns {Roll[]}
 */
export function messageRolls(message) {
  const stored = message?.flags?.rsr5e?.rolls;
  if ( !Array.isArray(stored) ) return message?.rolls ?? [];
  return stored.map(data => {
    if ( !data || (data instanceof Roll) ) return data;
    try {
      return Roll.fromData(data);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/** Rules for any system. */
const generic = {
  id: "generic",

  /**
   * Is this actor a player character?
   * @param {Actor} actor
   * @returns {boolean}
   */
  isCharacter(actor) {
    return !!actor?.hasPlayerOwner;
  },

  /**
   * A critical moment in a chat message: "crit", "fumble" or null.
   * @param {ChatMessage} message
   * @returns {"crit"|"fumble"|null}
   */
  rollEvent(message) {
    for ( const roll of messageRolls(message) ) {
      const d20 = naturalD20(diceOf(roll));
      if ( d20.max ) return "crit";
      if ( d20.min ) return "fumble";
    }
    return null;
  },

  /**
   * Does the critical roll of a message count as an attack (a "critical hit") rather than another kind of check?
   * @param {ChatMessage} message
   * @returns {boolean}
   */
  isAttack(message) {
    return true;
  },

  /**
   * The actors a roll was aimed at, as UUIDs.
   * @param {ChatMessage} message
   * @returns {string[]}
   */
  targetUuids(message) {
    return [];
  },

  /**
   * @param {Actor} actor
   * @returns {boolean}
   */
  isBoss(actor) {
    return false;
  },

  /**
   * @param {Actor} actor
   * @returns {boolean}
   */
  isDead(actor) {
    return !!actor?.statuses?.has(deadStatus());
  },

  /**
   * Is this character down but not dead (dying)? Only systems with a dying state know it.
   * @param {Actor} actor
   * @returns {boolean}
   */
  isDown(actor) {
    return false;
  },

  /**
   * May this actor stand on the enemy side of a fight? Hazards and the like never "fall" and would stop a victory.
   * @param {Actor} actor
   * @returns {boolean}
   */
  isFoe(actor) {
    return true;
  },

  /**
   * The level of a character, or null if the system has none.
   * @param {Actor} actor
   * @returns {number|null}
   */
  level(actor) {
    return null;
  }
};

/** D&D 5e (5.x and 6.x). Crits and fumbles of attack rolls, legendary creatures as bosses, three failed death saves. */
const dnd5e = {
  ...generic,
  id: "dnd5e",

  /** @override */
  isCharacter(actor) {
    return actor?.type === "character";
  },

  /** @override */
  rollEvent(message) {
    // dnd5e 5 names the roll type in flags.dnd5e.roll, dnd5e 6 gives attacks their own message type. A Ready Set
    // Roll card holds the attack and the damage of one use, each roll names its type.
    let roll;
    if ( Array.isArray(message.flags?.rsr5e?.rolls) ) {
      roll = messageRolls(message).find(r => r.options?.rollType === "attack");
    } else {
      const type = message.flags?.dnd5e?.roll?.type ?? ((message.type === "attack") ? "attack" : null);
      if ( type !== "attack" ) return null;
      roll = message.rolls?.[0];
    }
    if ( roll?.isCritical ) return "crit";
    if ( roll?.isFumble ) return "fumble";
    return null;
  },

  /** @override */
  targetUuids(message) {
    // dnd5e 5: flags.dnd5e.targets with actor UUIDs, dnd5e 6: system.targets with token and actor UUIDs
    const targets = message.flags?.dnd5e?.targets ?? message.system?.targets ?? [];
    return targets.map(target => target?.uuid ?? target?.token ?? target?.actor).filter(Boolean);
  },

  /** @override */
  isBoss(actor) {
    const resources = actor?.system?.resources;
    return (actor?.type === "npc") && (((resources?.legact?.max ?? 0) > 0) || ((resources?.legres?.max ?? 0) > 0));
  },

  /** @override */
  isDead(actor) {
    if ( generic.isDead(actor) ) return true;
    return (actor?.type === "character") && ((actor.system?.attributes?.death?.failure ?? 0) >= 3);
  },

  /** @override */
  level(actor) {
    return actor?.type === "character" ? (Number(actor.system?.details?.level) || 0) : null;
  }
};

/** Crucible (0.11). Critical successes and failures of actions, boss adversaries, dead heroes, hero levels. */
const crucible = {
  ...generic,
  id: "crucible",

  /** @override */
  isCharacter(actor) {
    return actor?.type === "hero";
  },

  /** @override */
  rollEvent(message) {
    if ( !message.flags?.crucible?.action ) return null;
    const rolls = message.rolls ?? [];
    if ( rolls.some(r => r?.isCriticalSuccess) ) return "crit";
    if ( rolls.some(r => r?.isCriticalFailure) ) return "fumble";
    return null;
  },

  /** @override */
  targetUuids(message) {
    // Each target is {actor, token} with UUIDs; the token says which one was meant
    return (message.flags?.crucible?.targets ?? [])
      .map(target => (typeof target === "string" ? target : (target?.token ?? target?.actor ?? target?.uuid)))
      .filter(Boolean);
  },

  /** @override */
  isBoss(actor) {
    return (actor?.type === "adversary") && (actor.system?.advancement?.rank === "boss");
  },

  /** @override */
  isDead(actor) {
    return generic.isDead(actor) || (actor?.system?.isDead === true);
  },

  /** @override */
  level(actor) {
    return actor?.type === "hero" ? (Number(actor.system?.advancement?.level) || 0) : null;
  }
};

/**
 * The level of the party in a Pathfinder 2e fight: the average of the player characters in the active fight,
 * else of all player characters in the world.
 * @returns {number|null}
 */
function pf2ePartyLevel() {
  const fight = game.combats?.active ?? game.combat;
  const inFight = (fight?.combatants ?? []).map(c => c.actor).filter(a => a?.type === "character" && a.hasPlayerOwner);
  const owned = [...(game.actors ?? [])].filter(a => a.type === "character" && a.hasPlayerOwner);
  // Without a fight: the heroes on the scene, else every player character (retired ones skew the average)
  const onScene = new Set([...(globalThis.canvas?.scene?.tokens ?? [])].map(t => t.actorId));
  const there = owned.filter(a => onScene.has(a.id));
  const actors = inFight.length ? inFight : (there.length ? there : owned);
  return partyLevelOf(actors.map(a => Number(a.system?.details?.level?.value)));
}

/**
 * Pathfinder 2e (7.x and 8.x). Critical successes and failures from the degree of success of attacks (and, by a
 * setting, of skill checks, saves and Perception), creatures clearly above the party as bosses, dying and dead
 * characters, character levels.
 */
const pf2e = {
  ...generic,
  id: "pf2e",

  /** @override */
  isCharacter(actor) {
    return actor?.type === "character";
  },

  /** @override */
  rollEvent(message) {
    // Secret and blind rolls of the GM stay out of the album
    if ( message?.blind || (message?.whisper?.length > 0) ) return null;
    const context = message?.flags?.pf2e?.context;
    if ( !context ) return null;
    let checks = false;
    try {
      checks = setting("critChecks") === true;
    } catch {}
    return pf2eOutcome(context, {checks}).kind;
  },

  /** @override */
  isAttack(message) {
    return /attack-roll$/.test(String(message?.flags?.pf2e?.context?.type ?? ""));
  },

  /** @override */
  targetUuids(message) {
    // The context names the target as {actor, token} UUIDs; the token tells which creature was meant
    const target = message?.flags?.pf2e?.context?.target;
    return [target?.token, target?.actor].filter(Boolean).slice(0, 1);
  },

  /** @override */
  isBoss(actor) {
    // An NPC two or more levels above the party; the level of an elite creature already includes its raise
    if ( actor?.type !== "npc" || actor.hasPlayerOwner ) return false;
    return isAboveParty(Number(actor.system?.details?.level?.value), pf2ePartyLevel());
  },

  /** @override */
  isDead(actor) {
    if ( generic.isDead(actor) ) return true;
    if ( actor?.type !== "character" ) return actor?.isDead === true;
    // A character at 0 Hit Points is only dying until the condition arrives, so the hit points do not count here.
    // At the maximum dying value the character is dead, whether or not the dead mark is set yet.
    const dying = actor.system?.attributes?.dying;
    return ((dying?.max ?? 0) > 0) && ((dying?.value ?? 0) >= dying.max);
  },

  /** @override */
  isDown(actor) {
    return (actor?.type === "character") && ((actor.system?.attributes?.dying?.value ?? 0) > 0);
  },

  /** @override */
  isFoe(actor) {
    return !["hazard", "loot", "party", "vehicle"].includes(actor?.type);
  },

  /** @override */
  level(actor) {
    return actor?.type === "character" ? (Number(actor.system?.details?.level?.value) || 0) : null;
  }
};

/** Built in systems. */
const SYSTEMS = {dnd5e, pf2e, crucible};

/**
 * The rules of the running system.
 * @returns {typeof generic}
 */
export function system() {
  return SYSTEMS[game.system.id] ?? generic;
}

/**
 * Does the running system have built in support?
 * @returns {boolean}
 */
export function hasSystemSupport() {
  return game.system.id in SYSTEMS;
}
