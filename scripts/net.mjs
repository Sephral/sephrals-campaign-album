/**
 * Messages between the clients over the module socket. The server names the sender of every socket message, so each
 * side can check who sent it (also on Foundry 13, whose queries do not name the sender).
 *
 * - The active GM asks a player's client for a photo ("capture"); the player answers only to that GM ("captured").
 * - A player sends a photo of their view ("submit"); the GM answers whether it was added or waits for approval
 *   ("submitted").
 * - Another GM asks the active GM to take a photo ("photo").
 */

import {SOCKET} from "./config.mjs";
import {capture} from "./capture.mjs";

/** Captures the active GM waits for, by request id. */
const waiting = new Map();

/** Handlers of the active GM for messages from other users, by type. */
const handlers = new Map();

/** Handlers of any client for messages from a GM, by type. */
const fromGM = new Map();

/**
 * Register a handler the active GM runs for a message type.
 * @param {string} type
 * @param {(payload: object, sender: User) => Promise<void>|void} fn
 */
export function onGMMessage(type, fn) {
  handlers.set(type, fn);
}

/**
 * Register a handler any client runs for a message a GM sent.
 * @param {string} type
 * @param {(payload: object, sender: User) => void} fn
 */
export function onMessageFromGM(type, fn) {
  fromGM.set(type, fn);
}

/**
 * Send a message to some users.
 * @param {object} payload
 * @param {string[]} recipients
 */
export function send(payload, recipients) {
  game.socket.emit(SOCKET, payload, {recipients});
}

/**
 * Install the socket listener. Call once in "ready".
 */
export function registerSocket() {
  game.socket.on(SOCKET, (payload, senderId) => onMessage(payload ?? {}, game.users.get(senderId)));
}

/**
 * Handle a socket message.
 * @param {object} payload
 * @param {User|undefined} sender
 */
async function onMessage(payload, sender) {
  if ( !sender ) return;
  switch ( payload.type ) {
    case "capture": {
      // Only a GM may ask for a photo, and the photo goes back to that GM only
      if ( !sender.isGM ) return;
      let result;
      try {
        result = {ok: true, ...capture(payload.frame ?? null, {gmView: false})};
      } catch(err) {
        result = {ok: false, error: String(err?.message ?? "SCA.Error.capture")};
      }
      result.sceneId = canvas.scene?.id ?? null;
      send({type: "captured", id: payload.id, result}, [sender.id]);
      return;
    }
    case "captured": {
      const entry = waiting.get(payload.id);
      if ( !entry || (entry.userId !== sender.id) ) return;
      waiting.delete(payload.id);
      entry.resolve(payload.result);
      return;
    }
    default: {
      if ( sender.isGM && fromGM.has(payload.type) ) return fromGM.get(payload.type)(payload, sender);
      const handler = handlers.get(payload.type);
      if ( handler && game.user.isActiveGM ) await handler(payload, sender);
    }
  }
}

/**
 * Active GM: ask a user's client for a photo of a frame.
 * @param {string} userId
 * @param {object|null} frame
 * @param {number} [timeout=10000]
 * @returns {Promise<{ok: boolean, image?: string, width?: number, height?: number, error?: string}>}
 */
export function requestCapture(userId, frame, timeout=10000) {
  const id = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ok: false, error: "SCA.Error.timeout"});
    }, timeout);
    waiting.set(id, {userId, resolve: result => {
      clearTimeout(timer);
      resolve(result);
    }});
    send({type: "capture", id, frame}, [userId]);
  });
}
