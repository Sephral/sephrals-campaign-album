/**
 * The moments the album captures on its own. Only the active GM's client watches, so each moment is taken once:
 * critical hits and fumbles (after Dice So Nice has rolled), a boss that falls, the last enemy that falls, a player
 * character who dies, a character who reaches a new level and the sunrise of a new day. A limit per session and a
 * cooldown keep the album special.
 */

import {setting, t} from "./config.mjs";
import {DebugTrace} from "./debug-file.mjs";
import {takePhoto} from "./photographer.mjs";
import {sunrisesBetween} from "./rules.mjs";
import {messageRolls, system} from "./systems.mjs";

/** Why automatic photos were taken or not, for debug files. Entries about a chat message carry its id. */
export const photoTrace = new DebugTrace();

/** Dead or defeated state of actors as last seen, by combat and actor (see stateKey). */
const deadState = new Map();

/** When an actor fell last, by actor uuid (a defeated mark and the dead status arrive one after the other). */
const recentFalls = new Map();

/** Levels of characters as last seen, by actor id. */
const levels = new Map();

/** Combats that already had their victory photo. */
const victories = new Set();

/** The fight of the last boss photo (its victory photo would show the same moment again). */
let lastBossCombat = null;

/** Chat messages that already had their crit or fumble photo (Ready Set Roll adds rolls by updates). */
const rolledMessages = new Set();

/** How long after its creation a Ready Set Roll card may still get its photo. */
const RSR_WINDOW = 60_000;

/**
 * Wait until Dice So Nice has shown a roll, at most a few seconds.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
function afterDice(message) {
  if ( !game.modules.get("dice-so-nice")?.active ) return new Promise(resolve => setTimeout(resolve, 600));
  return new Promise(resolve => {
    const timer = setTimeout(done, 8000);
    const id = Hooks.on("diceSoNiceRollComplete", messageId => {
      if ( messageId === message.id ) done();
    });
    function done() {
      clearTimeout(timer);
      Hooks.off("diceSoNiceRollComplete", id);
      setTimeout(resolve, 300);
    }
  });
}

/**
 * The tokens of some actors on a scene.
 * @param {Scene|null} scene
 * @param {Actor[]} actors
 * @returns {TokenDocument[]}
 */
function tokensOf(scene, actors) {
  if ( !scene ) return [];
  const uuids = new Set(actors.filter(Boolean).map(a => a.uuid));
  const ids = new Set(actors.filter(Boolean).map(a => a.id));
  return scene.tokens.filter(doc => uuids.has(doc.actor?.uuid) || (doc.actorLink && ids.has(doc.actorId)));
}

/**
 * The scene where the table plays: the scene of the fight, else the active scene, else the GM's.
 * @param {Combat} [combat]
 * @returns {Scene|null}
 */
function playScene(combat) {
  return combat?.scene ?? game.scenes.active ?? canvas?.scene ?? null;
}

/**
 * Is a moment of this kind wanted?
 * @param {string} kind
 * @returns {boolean}
 */
function wanted(kind) {
  return game.user.isActiveGM && setting("autoPhotos") && setting(`trigger${kind[0].toUpperCase()}${kind.slice(1)}`);
}

/**
 * Take an automatic photo, note the result in the trace and log why it did not happen.
 * @param {object} request
 * @param {string} [messageId]   The chat message the photo is about
 * @returns {Promise<object>}
 */
async function auto(request, messageId) {
  const result = await takePhoto({...request, auto: true});
  photoTrace.add("photo", {kind: request.kind, messageId, ok: !!result.ok, error: result.error ?? null,
    photoId: result.photo?.id ?? null, seenBy: result.seenBy ?? null,
    tokens: (request.tokens ?? []).map(token => (token?.document ?? token)?.uuid ?? null)});
  if ( !result.ok ) console.debug(`sephrals-campaign-album | No ${request.kind} photo: ${result.error}`);
  return result;
}

/* -------------------------------------------- */
/*  Critical hits and fumbles                   */
/* -------------------------------------------- */

/**
 * @typedef RollAssessment
 * @property {"crit"|"fumble"|null} kind
 * @property {string|null} reason     Why there is no photo: notActiveGM, alreadyTaken, noRolls, noCritOrFumble,
 *                                    notWanted, noActor, notCharacter or noToken. Null when the photo is due.
 * @property {boolean} wanted         The kind passed the settings, the message counts as handled
 * @property {Scene|null} scene
 * @property {Actor|null} actor
 * @property {TokenDocument|null} token
 */

/**
 * Does a chat message call for a crit or fumble photo? The checks of the hook, without side effects, so the debug
 * file can tell the same story.
 * @param {ChatMessage} message
 * @param {object} [options]
 * @param {boolean} [options.ignoreHandled]   Check a message again whose photo was already handled (debug file)
 * @returns {RollAssessment}
 */
export function assessRoll(message, {ignoreHandled=false}={}) {
  const assessment = {kind: null, reason: null, wanted: false, scene: null, actor: null, token: null};
  const stop = reason => Object.assign(assessment, {reason});
  if ( !game.user.isActiveGM ) return stop("notActiveGM");
  if ( !ignoreHandled && rolledMessages.has(message.id) ) return stop("alreadyTaken");
  if ( !messageRolls(message).length ) return stop("noRolls");
  assessment.kind = system().rollEvent(message);
  if ( !assessment.kind ) return stop("noCritOrFumble");
  if ( !wanted(assessment.kind) ) return stop("notWanted");
  assessment.wanted = true;
  const scene = assessment.scene = game.scenes.get(message.speaker?.scene) ?? playScene();
  const speakerToken = scene?.tokens.get(message.speaker?.token) ?? null;
  const actor = assessment.actor = speakerToken?.actor ?? game.actors.get(message.speaker?.actor) ?? null;
  if ( !actor ) return stop("noActor");
  if ( (setting("critsBy") === "players") && !system().isCharacter(actor) ) return stop("notCharacter");
  assessment.token = speakerToken ?? tokensOf(scene, [actor])[0] ?? null;
  if ( !assessment.token ) return stop("noToken");
  return assessment;
}

/**
 * Was the crit or fumble photo of a message already handled?
 * @param {string} messageId
 * @returns {boolean}
 */
export function wasHandled(messageId) {
  return rolledMessages.has(messageId);
}

/**
 * Hook "createChatMessage".
 * @param {ChatMessage} message
 */
async function onCreateChatMessage(message) {
  const {kind, reason, wanted: claimed, scene, actor, token} = assessRoll(message);
  if ( claimed ) rolledMessages.add(message.id);
  // Other clients and messages without rolls would only push the useful entries out of the trace
  if ( !["notActiveGM", "noRolls"].includes(reason) ) {
    photoTrace.add("roll", {messageId: message.id, kind, reason, actor: actor?.uuid ?? null, token: token?.uuid ?? null});
  }
  if ( reason ) return;
  await afterDice(message);
  const targets = [];
  for ( const uuid of system().targetUuids(message) ) {
    const doc = await fromUuid(uuid).catch(() => null);
    const target = (doc instanceof Actor) ? tokensOf(scene, [doc])[0] : (doc?.document ?? doc);
    if ( (target?.documentName === "Token") && (target.parent === scene) && (target !== token) ) targets.push(target);
  }
  const name = token.name;
  const target = targets[0]?.name;
  const caption = target ? t(`SCA.Caption.${kind}Target`, {name, target}) : t(`SCA.Caption.${kind}`, {name});
  await auto({kind, tokens: [token, ...targets], caption, actors: [...new Set([name, ...targets.map(x => x.name)])]},
    message.id);
}

/**
 * Hook "updateChatMessage": Ready Set Roll creates its card first and adds the rolls a moment later.
 * @param {ChatMessage} message
 * @param {object} changed
 */
function onUpdateChatMessage(message, changed) {
  if ( !Array.isArray(changed?.flags?.rsr5e?.rolls) ) return;
  if ( (Date.now() - (message.timestamp ?? 0)) > RSR_WINDOW ) return;
  return onCreateChatMessage(message);
}

/* -------------------------------------------- */
/*  Bosses, victories and deaths                */
/* -------------------------------------------- */

/**
 * Has an actor fallen (dead, or its combatant defeated)?
 * @param {Actor} actor
 * @param {Combatant} [combatant]
 * @returns {boolean}
 */
function fallen(actor, combatant) {
  return !!combatant?.isDefeated || system().isDead(actor);
}

/**
 * The key of an actor's state: per combat, so an enemy who fell in one fight counts again in the next.
 * @param {Combat|null} combat
 * @param {Actor} actor
 * @returns {string}
 */
function stateKey(combat, actor) {
  return `${combat?.id ?? "-"}:${actor.uuid}`;
}

/**
 * Look at an actor after a change: did it just fall?
 * @param {Actor} actor
 * @param {Combat} [combat]
 */
async function checkActor(actor, combat=(game.combats.active ?? game.combat)) {
  if ( !game.user.isActiveGM || !actor ) return;
  const combatant = combat?.combatants.find(c => c.actor === actor || c.actor?.uuid === actor.uuid);
  if ( !combatant ) combat = null;
  const key = stateKey(combat, actor);
  const now = fallen(actor, combatant);
  const before = deadState.get(key) ?? false;
  deadState.set(key, now);
  if ( !now || before ) return;
  const last = recentFalls.get(actor.uuid) ?? 0;
  recentFalls.set(actor.uuid, Date.now());
  if ( (Date.now() - last) < 5000 ) return;
  // Let the defeated overlay settle on every client before the photo
  await new Promise(resolve => setTimeout(resolve, 1200));
  const sys = system();
  const scene = playScene(combat);
  const tokens = tokensOf(scene, [actor]);

  // A player character dies
  if ( sys.isCharacter(actor) && actor.hasPlayerOwner && sys.isDead(actor) && wanted("death") ) {
    await auto({kind: "death", tokens, caption: t("SCA.Caption.death", {name: actor.name}), actors: [actor.name]});
    return;
  }

  // A boss falls
  if ( sys.isBoss(actor) && wanted("boss") ) {
    const result = await auto({kind: "boss", tokens: [...tokens, ...heroTokens(combat)],
      caption: t("SCA.Caption.boss", {name: actor.name}), actors: [actor.name]});
    if ( result.ok ) lastBossCombat = combat?.id ?? null;
  }
  if ( combat?.started ) await checkVictory(combat, actor);
}

/**
 * The tokens of the heroes still standing in a combat.
 * @param {Combat} [combat]
 * @returns {TokenDocument[]}
 */
function heroTokens(combat) {
  if ( !combat ) return [];
  return combat.combatants.filter(c => c.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY && !fallen(c.actor, c))
    .map(c => c.token).filter(Boolean);
}

/**
 * Did the last enemy of a combat just fall?
 * @param {Combat} combat
 * @param {Actor} actor    The one who fell last
 */
async function checkVictory(combat, actor) {
  if ( victories.has(combat.id) || !wanted("victory") ) return;
  const enemies = combat.combatants.filter(c => c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
  if ( !enemies.length || !enemies.every(c => fallen(c.actor, c)) ) return;
  victories.add(combat.id);
  if ( lastBossCombat && (lastBossCombat === combat.id) ) return;
  const last = tokensOf(playScene(combat), [actor]);
  await auto({kind: "victory", tokens: [...last, ...heroTokens(combat)], caption: t("SCA.Caption.victory"),
    actors: heroTokens(combat).map(token => token.name)});
}

/**
 * Hook "updateCombatant".
 * @param {Combatant} combatant
 * @param {object} changes
 */
function onUpdateCombatant(combatant, changes) {
  if ( "defeated" in (changes ?? {}) ) checkActor(combatant.actor, combatant.parent);
}

/**
 * Hook "createCombatant": remember whether the new combatant has fallen already.
 * @param {Combatant} combatant
 */
function onCreateCombatant(combatant) {
  if ( game.user.isActiveGM && combatant.actor ) {
    deadState.set(stateKey(combatant.parent, combatant.actor), fallen(combatant.actor, combatant));
  }
}

/**
 * Hooks on actors and effects: a fall or a new level.
 * @param {Actor} actor
 */
function onActorChange(actor) {
  if ( !(actor instanceof Actor) ) return;
  checkActor(actor);
  checkLevel(actor);
}

/* -------------------------------------------- */
/*  Level ups                                   */
/* -------------------------------------------- */

/**
 * Did a character reach a new level?
 * @param {Actor} actor
 */
async function checkLevel(actor) {
  if ( !game.user.isActiveGM || actor.isToken ) return;
  const level = system().level(actor);
  if ( level === null ) return;
  const before = levels.get(actor.id);
  levels.set(actor.id, level);
  if ( (before === undefined) || (level <= before) || !actor.hasPlayerOwner || !wanted("levelUp") ) return;
  const tokens = tokensOf(playScene(), [actor]);
  if ( !tokens.length ) return;
  await auto({kind: "levelUp", tokens, caption: t("SCA.Caption.levelUp", {name: actor.name, level}), actors: [actor.name]});
}

/* -------------------------------------------- */
/*  Sunrise                                     */
/* -------------------------------------------- */

/**
 * The day length and one sunrise of the world calendar. Calendars with a sun know their sunrise hour: the calendar of
 * D&D 5e 6 and the one of Ember. Others have none.
 * @param {number} time
 * @returns {{secondsPerDay: number, sunriseAt: number}|null}
 */
function sunriseOf(time) {
  const calendar = game.time?.calendar;
  if ( (typeof calendar?.sunrise !== "function") || (typeof calendar.timeToComponents !== "function") ) return null;
  const components = calendar.timeToComponents(time);
  const {secondsPerMinute=60, minutesPerHour=60, hoursPerDay=24} = calendar.days ?? {};
  const secondsPerHour = secondsPerMinute * minutesPerHour;
  const sunrise = Number(calendar.sunrise(components));
  if ( !Number.isFinite(sunrise) ) return null;
  const intoDay = (components.hour * secondsPerHour) + (components.minute * secondsPerMinute) + components.second;
  return {secondsPerDay: hoursPerDay * secondsPerHour, sunriseAt: time - intoDay + (sunrise * secondsPerHour)};
}

/**
 * Hook "updateWorldTime": a new day dawns. The photo shows the heroes on the scene where the table plays, or the GM's
 * view of it. A jump over several days gives one photo, a fight keeps its own photos.
 * @param {number} worldTime
 * @param {number} deltaTime
 */
async function onUpdateWorldTime(worldTime, deltaTime) {
  if ( !(deltaTime > 0) || !wanted("dawn") || game.combat?.started ) return;
  const day = sunriseOf(worldTime);
  if ( !day || !sunrisesBetween(worldTime - deltaTime, worldTime, day.secondsPerDay, day.sunriseAt) ) return;
  const scene = playScene();
  if ( !scene ) return;
  const heroes = scene.tokens.filter(doc => !doc.hidden && doc.actor?.hasPlayerOwner
    && (system().isCharacter(doc.actor) || ["group", "party"].includes(doc.actor.type)));
  // Let the light of the new morning settle on every client
  await new Promise(resolve => setTimeout(resolve, 4000));
  await auto({kind: "dawn", tokens: heroes, scene, caption: t("SCA.Caption.dawn"), actors: heroes.map(doc => doc.name)});
}

/* -------------------------------------------- */

/**
 * Remember the current state, so only changes count (active GM, on ready and when the scene changes).
 */
export function rememberState() {
  const sys = system();
  for ( const actor of game.actors ) {
    const level = sys.level(actor);
    if ( level !== null ) levels.set(actor.id, level);
    deadState.set(stateKey(null, actor), sys.isDead(actor));
  }
  for ( const combat of game.combats ) {
    for ( const c of combat.combatants ) if ( c.actor ) deadState.set(stateKey(combat, c.actor), fallen(c.actor, c));
  }
  for ( const scene of new Set([game.scenes.active, canvas?.scene].filter(Boolean)) ) {
    for ( const doc of scene.tokens ) if ( doc.actor ) deadState.set(stateKey(null, doc.actor), sys.isDead(doc.actor));
  }
}

/**
 * Register the hooks.
 */
export function registerTriggers() {
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("updateChatMessage", onUpdateChatMessage);
  Hooks.on("updateCombatant", onUpdateCombatant);
  Hooks.on("createCombatant", onCreateCombatant);
  Hooks.on("updateActor", onActorChange);
  Hooks.on("createActiveEffect", effect => onActorChange(effect.parent));
  Hooks.on("deleteActiveEffect", effect => onActorChange(effect.parent));
  for ( const kind of ["create", "update", "delete"] ) Hooks.on(`${kind}Item`, item => {
    if ( item.parent instanceof Actor ) setTimeout(() => checkLevel(item.parent), 50);
  });
  Hooks.on("canvasReady", () => {
    if ( game.user.isActiveGM ) rememberState();
  });
  Hooks.on("updateWorldTime", onUpdateWorldTime);
}
