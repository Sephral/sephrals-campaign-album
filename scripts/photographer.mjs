/**
 * The photographer runs on the active GM's client. It decides whose eyes a photo is taken through (a player who has
 * a character in the picture, else another player, else the GM), asks that client for the image, puts it into the
 * album and tells the table. It also handles the photos players send.
 */

import {MODULE_ID, esc, flag, setting, t} from "./config.mjs";
import {addPhoto, cardHtml, nextIsNewSession, sessionState} from "./album.mjs";
import {capture, visibleFrame} from "./capture.mjs";
import {photoFrame} from "./frame.mjs";
import {onGMMessage, onMessageFromGM, requestCapture, send} from "./net.mjs";
import {autoAllowed, photographers} from "./rules.mjs";
import {countFeature} from "./usage.mjs";

/**
 * @typedef PhotoRequest
 * @property {string} kind                 crit, fumble, boss, victory, death, levelUp, dawn, manual
 * @property {(Token|TokenDocument)[]} [tokens]   Tokens in the picture
 * @property {Scene} [scene]               The scene; by default the scene of the tokens, else the GM's
 * @property {object} [frame]              Scene rectangle when there are no tokens; none takes the GM's view
 * @property {string} [caption]
 * @property {string[]} [actors]           Names for the caption line
 * @property {User} [by]                   Who asked for it
 * @property {boolean} [auto]              Automatic photo (limit and cooldown apply)
 */

/**
 * The GMs to whisper to.
 * @returns {string[]}
 */
function gmIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

/**
 * Tell the table about a new photo, as the world chose.
 * @param {object} photo
 * @returns {Promise<void>}
 */
async function postCard(photo) {
  const mode = setting("chatCards");
  if ( mode === "off" ) return;
  await ChatMessage.implementation.create({
    content: cardHtml(photo),
    speaker: {alias: t("SCA.Card.speaker")},
    whisper: (mode === "gm") ? gmIds() : [],
    flags: {[MODULE_ID]: {card: true, photo: photo.id}}
  });
}

/**
 * Is an automatic photo allowed now?
 * @returns {{ok: boolean, reason?: string}}
 */
export function autoPhotoAllowed() {
  if ( !setting("autoPhotos") ) return {ok: false, reason: "off"};
  // A photo that opens a new session starts the counting again
  if ( nextIsNewSession() ) return {ok: true};
  return autoAllowed(sessionState(), Date.now(), {max: setting("maxAuto"), cooldown: setting("cooldown")});
}

/**
 * Take a photo and put it into the album (active GM).
 * @param {PhotoRequest} request
 * @returns {Promise<{ok: boolean, photo?: object, error?: string, seenBy?: string}>}
 */
export async function takePhoto(request) {
  if ( !game.user.isActiveGM ) return {ok: false, error: "SCA.Error.notActiveGM"};
  if ( request.auto ) {
    const allowed = autoPhotoAllowed();
    if ( !allowed.ok ) return {ok: false, error: `SCA.Skip.${allowed.reason}`};
  }
  const docs = (request.tokens ?? []).map(token => token?.document ?? token).filter(doc => doc?.documentName === "Token");
  const scene = request.scene ?? docs[0]?.parent ?? canvas.scene;
  if ( !scene ) return {ok: false, error: "SCA.Error.noCanvas"};
  const tokens = docs.filter(doc => doc.parent === scene);
  const gmViews = !!canvas?.ready && (canvas.scene?.id === scene.id);
  const frame = tokens.length
    ? photoFrame(tokens.map(boundsOf), {grid: scene.grid.size})
    : (request.frame ?? (gmViews ? visibleFrame() : null));
  if ( !frame ) return {ok: false, error: "SCA.Error.noCanvas"};

  // Through whose eyes: the players of the characters in it first, the GM last
  const owners = tokens.flatMap(doc => game.users.filter(u => !u.isGM && doc.actor?.testUserPermission(u, "OWNER"))
    .map(u => u.id));
  const users = game.users.map(u => ({id: u.id, isGM: u.isGM, active: u.active,
    viewing: (u.id === game.user.id) ? gmViews : (u.viewedScene === scene.id)}));
  let shot = null;
  let seenBy = null;
  for ( const userId of photographers(users, owners, setting("perspective"), game.user.id) ) {
    let result;
    if ( userId === game.user.id ) {
      try {
        result = {ok: true, ...capture(frame, {gmView: true}), sceneId: canvas.scene.id};
      } catch(err) {
        result = {ok: false, error: String(err?.message ?? "SCA.Error.capture")};
      }
    }
    else result = await requestCapture(userId, frame);
    if ( result?.ok && result.image && (result.sceneId === scene.id) ) {
      shot = result;
      seenBy = game.users.get(userId);
      break;
    }
  }
  if ( !shot ) return {ok: false, error: "SCA.Error.capture"};

  const actors = request.actors ?? [...new Set(tokens.map(doc => doc.name))];
  try {
    const {photo} = await addPhoto({image: shot.image, width: shot.width, height: shot.height, kind: request.kind,
      caption: request.caption ?? "", actors, by: request.by?.name ?? game.user.name,
      seenBy: seenBy?.isGM ? "" : (seenBy?.name ?? ""), sceneName: scene.navName || scene.name, auto: !!request.auto});
    await postCard(photo);
    countFeature(MODULE_ID, request.auto ? "autoPhoto" : "manualPhoto");
    return {ok: true, photo, seenBy: seenBy?.name};
  } catch(err) {
    const key = String(err?.message ?? "");
    if ( !key.startsWith("SCA.") ) console.error(`${MODULE_ID} | The photo could not be stored`, err);
    return {ok: false, error: key.startsWith("SCA.") ? key : "SCA.Error.write"};
  }
}

/**
 * The rectangle of a token in scene coordinates.
 * @param {TokenDocument} doc
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function boundsOf(doc) {
  const size = doc.parent?.grid?.size ?? 100;
  return {x: doc.x, y: doc.y, width: doc.width * size, height: doc.height * size};
}

/* -------------------------------------------- */
/*  Photos from players                         */
/* -------------------------------------------- */

/**
 * Player: take a photo of the own view and send it to the GM.
 * @param {string} [caption]
 * @returns {Promise<void>}
 */
export async function submitOwnPhoto(caption="") {
  const gm = game.users.activeGM;
  if ( !gm ) return ui.notifications.warn(t("SCA.Error.noGM"));
  let shot;
  try {
    shot = capture(null, {gmView: false, pan: false});
  } catch(err) {
    return ui.notifications.warn(t(String(err?.message ?? "SCA.Error.capture")));
  }
  const tokens = canvas.tokens.controlled.length ? canvas.tokens.controlled : [];
  send({type: "submit", image: shot.image, width: shot.width, height: shot.height, caption,
    actors: tokens.map(token => token.name), sceneId: canvas.scene?.id}, [gm.id]);
  ui.notifications.info(t("SCA.Notice.sent"));
}

/**
 * Active GM: a player sent a photo.
 * @param {object} payload
 * @param {User} sender
 * @returns {Promise<void>}
 */
async function onSubmit(payload, sender) {
  const mode = setting("playerPhotos");
  const answer = (key, data) => send({type: "submitted", key, data}, [sender.id]);
  if ( sender.isGM ) return;
  if ( (mode === "off") || !String(payload.image ?? "").startsWith("data:image/") ) return answer("SCA.Error.playerPhotosOff");
  countFeature(MODULE_ID, "playerPhoto");
  const scene = game.scenes.get(payload.sceneId);
  const data = {image: payload.image, width: Number(payload.width) || 0, height: Number(payload.height) || 0,
    kind: "player", caption: String(payload.caption ?? "").slice(0, 300),
    actors: (payload.actors ?? []).map(String).slice(0, 12), by: sender.name, seenBy: sender.name,
    sceneName: scene?.navName || scene?.name || ""};
  if ( mode === "direct" ) {
    const {photo} = await addPhoto(data);
    await postCard(photo);
    return answer("SCA.Notice.added");
  }
  // Waits for the GM: the image travels in the GM's card until it is answered, so a declined photo leaves no file
  await ChatMessage.implementation.create({
    content: `<div class="sca-card sca-approval"><p class="sca-card-title">${esc(t("SCA.Card.approval", {name: sender.name}))}</p>`
      + `<img src="${esc(payload.image)}" alt="">${data.caption ? `<p class="sca-card-caption">${esc(data.caption)}</p>` : ""}`
      + `<div class="sca-card-buttons"><button type="button" data-sca-answer="yes"><i class="fa-solid fa-check" inert></i> `
      + `${esc(t("SCA.Card.approve"))}</button><button type="button" data-sca-answer="no"><i class="fa-solid fa-xmark" inert></i> `
      + `${esc(t("SCA.Card.decline"))}</button></div></div>`,
    speaker: {alias: t("SCA.Card.speaker")},
    whisper: gmIds(),
    flags: {[MODULE_ID]: {submission: {...data, userId: sender.id}}}
  });
  return answer("SCA.Notice.waiting");
}

/**
 * GM: answer a photo a player sent.
 * @param {ChatMessage} message
 * @param {boolean} approve
 * @returns {Promise<void>}
 */
export async function answerSubmission(message, approve) {
  if ( !game.user.isGM ) return;
  const data = flag(message, "submission");
  if ( !data ) return;
  const {userId, ...photoData} = data;
  await message.delete();
  if ( approve ) {
    const {photo} = await addPhoto(photoData);
    await postCard(photo);
  }
  if ( game.users.get(userId)?.active ) send({type: "submitted", key: approve ? "SCA.Notice.approved" : "SCA.Notice.declined"}, [userId]);
}

/**
 * Player: the GM's answer to a sent photo.
 * @param {object} payload
 */
export function onSubmitted(payload) {
  if ( payload.key ) ui.notifications.info(t(payload.key, payload.data));
}

/* -------------------------------------------- */

/**
 * Any GM: take a photo of the GM's own view or of the controlled tokens. Another GM asks the active GM.
 * @returns {Promise<void>}
 */
export async function photoByGM() {
  const tokens = canvas.tokens?.controlled ?? [];
  if ( !game.user.isActiveGM ) {
    const gm = game.users.activeGM;
    if ( !gm ) return ui.notifications.warn(t("SCA.Error.noGM"));
    send({type: "photo", tokenIds: tokens.map(token => token.id), frame: tokens.length ? null : visibleFrame(),
      sceneId: canvas.scene?.id}, [gm.id]);
    return ui.notifications.info(t("SCA.Notice.asked"));
  }
  const result = await takePhoto({kind: "manual", tokens, by: game.user});
  if ( result.ok ) ui.notifications.info(t("SCA.Notice.taken"));
  else ui.notifications.warn(t(result.error));
}

/**
 * Active GM: another GM asked for a photo.
 * @param {object} payload
 * @param {User} sender
 * @returns {Promise<void>}
 */
async function onPhotoRequest(payload, sender) {
  const scene = game.scenes.get(payload.sceneId);
  if ( !sender.isGM || !scene ) return;
  const tokens = (payload.tokenIds ?? []).map(id => scene.tokens.get(id)).filter(Boolean);
  const result = await takePhoto({kind: "manual", tokens, scene, frame: payload.frame ?? undefined, by: sender});
  send({type: "submitted", key: result.ok ? "SCA.Notice.taken" : result.error}, [sender.id]);
}

/**
 * Register the GM's handlers for messages from other users.
 */
export function registerPhotographer() {
  onGMMessage("submit", onSubmit);
  onGMMessage("photo", onPhotoRequest);
  onMessageFromGM("submitted", onSubmitted);
}
