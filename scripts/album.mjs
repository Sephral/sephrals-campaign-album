/**
 * The album itself: a journal everyone may read, one page per session. Each page keeps its photos as a list in its
 * flags and shows them as figures in its text, so the journal also works without the module. The image files lie in
 * the world folder (on The Forge in the Assets Library). Only the active GM's client writes here.
 */

import {MODULE_ID, esc, flag, setting, t} from "./config.mjs";
import {needsNewSession, pageHtml, photoFileName} from "./rules.mjs";

/** Album changes run one after another. */
let queue = Promise.resolve();

/**
 * Run a change of the album after the ones before it.
 * @param {() => Promise<*>} fn
 * @returns {Promise<*>}
 */
export function serialize(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

/* -------------------------------------------- */
/*  Journal and pages                           */
/* -------------------------------------------- */

/**
 * The album journal.
 * @returns {JournalEntry|null}
 */
export function albumJournal() {
  return game.journal.get(setting("albumJournal")) ?? null;
}

/**
 * Is this journal page part of the album?
 * @param {JournalEntryPage} page
 * @returns {boolean}
 */
export function isAlbumPage(page) {
  return !!page && (page.parent?.id === setting("albumJournal")) && !!flag(page, "session");
}

/**
 * The session pages in order.
 * @returns {JournalEntryPage[]}
 */
export function sessionPages() {
  const journal = albumJournal();
  if ( !journal ) return [];
  return journal.pages.contents.filter(p => flag(p, "session"))
    .sort((a, b) => (flag(a, "session.number") - flag(b, "session.number")) || (a.sort - b.sort));
}

/**
 * The photos of a page.
 * @param {JournalEntryPage} page
 * @returns {object[]}
 */
export function photosOf(page) {
  return [...(flag(page, "photos") ?? [])];
}

/**
 * Every photo of the album in order, with its page.
 * @returns {{page: JournalEntryPage, photo: object}[]}
 */
export function allPhotos() {
  return sessionPages().flatMap(page => photosOf(page).map(photo => ({page, photo})));
}

/**
 * Create the album journal if it is missing (active GM).
 * @returns {Promise<JournalEntry|null>}
 */
export async function ensureAlbum() {
  if ( !game.user.isActiveGM ) return albumJournal();
  let journal = albumJournal();
  if ( journal ) return journal;
  journal = await JournalEntry.implementation.create({
    name: t("SCA.Storage.journalName"),
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER},
    flags: {[MODULE_ID]: {album: true}}
  });
  await game.settings.set(MODULE_ID, "albumJournal", journal.id);
  await game.settings.set(MODULE_ID, "session", {number: 0, pageId: "", lastPhoto: 0, autoCount: 0, lastAuto: 0,
    forceNew: false});
  return journal;
}

/**
 * The state of the current session.
 * @returns {{number: number, pageId: string, lastPhoto: number, autoCount: number, lastAuto: number, forceNew: boolean}}
 */
export function sessionState() {
  return {number: 0, pageId: "", lastPhoto: 0, autoCount: 0, lastAuto: 0, forceNew: false,
    ...(setting("session") ?? {})};
}

/**
 * Would the next photo start a new session?
 * @param {number} [now]
 * @returns {boolean}
 */
export function nextIsNewSession(now=Date.now()) {
  const state = sessionState();
  const page = albumJournal()?.pages.get(state.pageId);
  return !page || needsNewSession(state, now, setting("sessionGap"));
}

/**
 * Let the next photo start a new session (GM).
 * @returns {Promise<void>}
 */
export async function startNewSession() {
  await game.settings.set(MODULE_ID, "session", {...sessionState(), forceNew: true});
}

/**
 * The page of the current session, created when a new session starts.
 * @param {number} now
 * @returns {Promise<{page: JournalEntryPage, state: object}>}
 */
async function currentPage(now) {
  const journal = await ensureAlbum();
  if ( !journal ) throw new Error("SCA.Error.noAlbum");
  let state = sessionState();
  let page = journal.pages.get(state.pageId);
  if ( !page || needsNewSession(state, now, setting("sessionGap")) ) {
    const number = Math.max(state.number, ...sessionPages().map(p => flag(p, "session.number") ?? 0)) + 1;
    const date = new Date(now).toLocaleDateString(game.i18n.lang, {year: "numeric", month: "long", day: "numeric"});
    [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: t("SCA.Session.title", {number, date}),
      type: "text",
      sort: number * 1000,
      text: {content: renderPage([])},
      flags: {[MODULE_ID]: {session: {number, started: now}, photos: []}}
    }]);
    state = {number, pageId: page.id, lastPhoto: 0, autoCount: 0, lastAuto: 0, forceNew: false};
    await game.settings.set(MODULE_ID, "session", state);
  }
  return {page, state};
}

/* -------------------------------------------- */
/*  Files                                       */
/* -------------------------------------------- */

/**
 * Is the world running on The Forge?
 * @returns {boolean}
 */
function isForge() {
  // The Forge may declare ForgeVTT as a top-level class, which is global but not a globalThis property.
  return (typeof ForgeVTT !== "undefined") && (ForgeVTT?.usingTheForge === true);
}

/**
 * Where uploads go: the user data folder, or the Assets Library on The Forge.
 * @returns {string}
 */
export function storageSource() {
  return isForge() ? "forgevtt" : "data";
}

/**
 * The folder of the album's images.
 * @returns {string}
 */
export function storageRoot() {
  return isForge() ? `${MODULE_ID}/${game.world.id}` : `worlds/${game.world.id}/${MODULE_ID}`;
}

/**
 * The FilePicker class.
 * @returns {typeof FilePicker}
 */
function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/**
 * Create a folder and the folders above it.
 * @param {string} target
 * @returns {Promise<void>}
 */
export async function ensureDirectory(target) {
  const FP = filePicker();
  if ( storageSource() === "forgevtt" ) {
    try {
      await FP.createDirectory("forgevtt", target, {notify: false});
    } catch {}
    return;
  }
  let current = "";
  for ( const segment of target.split("/").filter(Boolean) ) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await FP.createDirectory("data", current, {notify: false});
    } catch(err) {
      const message = String(err?.message ?? err ?? "");
      if ( !/EEXIST|already exists|ErrorCreateDirExists/i.test(message) ) throw err;
    }
  }
}

/**
 * Upload an image given as data URL.
 * @param {string} dataUrl
 * @param {string} folder
 * @param {string} name
 * @returns {Promise<string>}   The path of the stored file
 */
async function uploadImage(dataUrl, folder, name) {
  await ensureDirectory(folder);
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], name, {type: blob.type || "image/webp"});
  const response = await filePicker().upload(storageSource(), folder, file, {}, {notify: false});
  if ( !response?.path ) throw new Error("SCA.Error.upload");
  return response.path;
}

/* -------------------------------------------- */
/*  Photos                                      */
/* -------------------------------------------- */

/**
 * The small line under a caption: date and time, who is in it and through whose eyes.
 * @param {object} photo
 * @returns {string}
 */
export function photoMeta(photo) {
  const when = new Date(photo.time).toLocaleString(game.i18n.lang, {dateStyle: "medium", timeStyle: "short"});
  const parts = [when];
  if ( photo.actors?.length ) parts.push(photo.actors.join(", "));
  if ( photo.seenBy ) parts.push(t("SCA.Photo.seenBy", {name: photo.seenBy}));
  return parts.join(" · ");
}

/**
 * The HTML of a page.
 * @param {object[]} photos
 * @returns {string}
 */
function renderPage(photos) {
  return pageHtml(photos, {intro: t("SCA.Session.intro"), meta: photoMeta, empty: t("SCA.Session.empty")});
}

/**
 * Write the photos of a page and its text.
 * @param {JournalEntryPage} page
 * @param {object[]} photos
 * @returns {Promise<void>}
 */
async function writePage(page, photos) {
  await page.update({[`flags.${MODULE_ID}.photos`]: photos, "text.content": renderPage(photos)});
}

/**
 * Put a photo into the album (active GM).
 * @param {object} data
 * @param {string} data.image        Data URL
 * @param {number} data.width
 * @param {number} data.height
 * @param {string} data.kind         See KINDS
 * @param {string} [data.caption]
 * @param {string[]} [data.actors]   Names of the characters in it
 * @param {string} [data.by]         Who took or asked for it
 * @param {string} [data.seenBy]     Through whose eyes
 * @param {string} [data.sceneName]
 * @param {boolean} [data.auto]      Taken automatically (counts against the limit)
 * @returns {Promise<{page: JournalEntryPage, photo: object}>}
 */
export function addPhoto(data) {
  return serialize(async () => {
    const now = Date.now();
    const {page, state} = await currentPage(now);
    const folder = `${storageRoot()}/session-${state.number}`;
    const src = await uploadImage(data.image, folder, photoFileName(now, foundry.utils.randomID(8)));
    const photo = {
      id: foundry.utils.randomID(), src, width: data.width, height: data.height, kind: data.kind,
      caption: String(data.caption ?? "").slice(0, 300), actors: data.actors ?? [], by: data.by ?? "",
      seenBy: data.seenBy ?? "", sceneName: data.sceneName ?? "", time: now
    };
    await writePage(page, [...photosOf(page), photo]);
    await game.settings.set(MODULE_ID, "session", {...state, lastPhoto: now,
      autoCount: state.autoCount + (data.auto ? 1 : 0), lastAuto: data.auto ? now : state.lastAuto});
    return {page, photo};
  });
}

/**
 * Change the caption of a photo (active GM).
 * @param {string} pageId
 * @param {string} photoId
 * @param {string} caption
 * @returns {Promise<void>}
 */
export function setCaption(pageId, photoId, caption) {
  return serialize(async () => {
    const page = albumJournal()?.pages.get(pageId);
    if ( !page ) throw new Error("SCA.Error.photoGone");
    const photos = photosOf(page);
    const photo = photos.find(p => p.id === photoId);
    if ( !photo ) throw new Error("SCA.Error.photoGone");
    photo.caption = String(caption ?? "").slice(0, 300);
    await writePage(page, photos);
  });
}

/**
 * Take a photo out of the album (active GM). Foundry cannot delete files, so the image stays in the folder.
 * @param {string} pageId
 * @param {string} photoId
 * @returns {Promise<void>}
 */
export function removePhoto(pageId, photoId) {
  return serialize(async () => {
    const page = albumJournal()?.pages.get(pageId);
    if ( !page ) throw new Error("SCA.Error.photoGone");
    const photos = photosOf(page);
    if ( !photos.some(p => p.id === photoId) ) throw new Error("SCA.Error.photoGone");
    await writePage(page, photos.filter(p => p.id !== photoId));
  });
}

/**
 * Text and image of a chat card about a new photo.
 * @param {object} photo
 * @returns {string}
 */
export function cardHtml(photo) {
  const caption = photo.caption ? `<p class="sca-card-caption">${esc(photo.caption)}</p>` : "";
  return `<div class="sca-card"><p class="sca-card-title"><i class="fa-solid fa-camera-retro" inert></i> `
    + `${esc(t("SCA.Card.title"))}</p><img src="${esc(photo.src)}" alt="">${caption}`
    + `<p class="sca-card-meta">${esc(photoMeta(photo))}</p>`
    + `<button type="button" data-sca-open="${esc(photo.id)}"><i class="fa-solid fa-images" inert></i> `
    + `${esc(t("SCA.Card.open"))}</button></div>`;
}
