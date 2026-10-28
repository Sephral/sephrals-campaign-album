/**
 * The album's part of the debug file: the roll messages, what the album saw in them, why it took a photo or not and
 * the state of the album. Only GMs can save one, it contains chat text and whispers.
 */

import {MODULE_ID, setting, t} from "./config.mjs";
import {albumJournal, allPhotos, nextIsNewSession, photosOf, sessionState} from "./album.mjs";
import {recentMessages, registerDebugProvider} from "./debug-file.mjs";
import {autoPhotoAllowed} from "./photographer.mjs";
import {messageRolls, system} from "./systems.mjs";
import {assessRoll, photoTrace, wasHandled} from "./triggers.mjs";



/**
 * Run a check that may fail on an unusual message and keep the error instead.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.stack ?? err)};
  }
}

/**
 * What the album makes of a chat message: the rolls it sees, the crit or fumble, the checks of the hook and the
 * targets of the photo.
 * @param {ChatMessage} message
 * @returns {object}
 */
export function describeMessage(message) {
  const sys = system();
  return {
    messageId: message.id,
    system: sys.id,
    rolls: attempt(() => messageRolls(message).map(roll => ({
      class: roll?.constructor?.name ?? null,
      formula: roll?.formula ?? null,
      total: roll?.total ?? null,
      rollType: roll?.options?.rollType ?? null,
      critical: roll?.isCritical ?? roll?.isCriticalSuccess ?? null,
      fumble: roll?.isFumble ?? roll?.isCriticalFailure ?? null
    }))),
    rollEvent: attempt(() => sys.rollEvent(message)),
    assessment: attempt(() => {
      const {kind, reason, wanted, scene, actor, token} = assessRoll(message, {ignoreHandled: true});
      return {kind, reason, wanted, scene: scene?.uuid ?? null, actor: actor?.uuid ?? null, token: token?.uuid ?? null};
    }),
    targetUuids: attempt(() => sys.targetUuids(message)),
    handled: wasHandled(message.id)
  };
}

/**
 * The album in short: journal, photos, the current session and whether an automatic photo may be taken now.
 * @returns {object}
 */
export function albumState() {
  const session = sessionState();
  const page = albumJournal()?.pages.get(session.pageId) ?? null;
  return {
    journalId: setting("albumJournal") || null,
    journalFound: !!albumJournal(),
    photos: attempt(() => allPhotos().length),
    session,
    sessionPhotos: page ? photosOf(page).length : 0,
    maxAuto: setting("maxAuto"),
    cooldown: setting("cooldown"),
    nextIsNewSession: attempt(() => nextIsNewSession()),
    autoPhotoAllowed: attempt(() => autoPhotoAllowed())
  };
}

/**
 * The latest roll messages, what the album saw in them and the state of the album.
 * @returns {{messages: ChatMessage[], details: object}}
 */
export function describeRecent() {
  const messages = recentMessages(undefined, message => messageRolls(message).length > 0);
  return {
    messages,
    details: {messages: Object.fromEntries(messages.map(message => [message.id, describeMessage(message)])),
      album: albumState()}
  };
}

/**
 * The album's part of the debug file of Sephral's modules. Call in "init": the chat log builds its context menu before
 * "ready". t() follows a fixed module language.
 */
export function registerDebug() {
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("SCA.DEBUG.Entry"),
    notice: file => t("SCA.DEBUG.Saved", {file}),
    applies: message => messageRolls(message).length > 0,
    message: message => ({message: describeMessage(message), album: albumState()}),
    recent: describeRecent,
    trace: photoTrace
  });
}
