/**
 * What the buttons "Copy as image", "Save as image" and "Post as image in chat" do with the picture of a session
 * (share-image.mjs). Everyone may copy and save the sessions they can read. Posting in the chat needs the permission to
 * upload files and a session page that all players may read, because the picture shows its photos to everyone.
 */

import {MODULE_ID, esc, flag, setting, t} from "./config.mjs";
import {albumJournal, ensureDirectory, photosOf, storageRoot, storageSource} from "./album.mjs";
import {visibleToAll} from "./recap.mjs";
import {MAX_PHOTOS, pickPhotos, renderShareImage, shareFileName, shareModel} from "./share-image.mjs";
import {countFeature} from "./usage.mjs";

const UPLOAD_TIMEOUT_MS = 20000;
const IMAGE_FOLDER = "share";

const notify = (type, key, data) => ui.notifications?.[type]?.(t(key, data));

/**
 * The photos of a page this user may see: all of them for a page the user may read, none otherwise.
 * @param {JournalEntryPage|undefined} page
 * @returns {object[]}
 */
export function photosFor(page) {
  if ( !page || !page.testUserPermission(game.user, "OBSERVER") ) return [];
  return photosOf(page);
}

/** The clipboard takes pictures on secure pages only (https or localhost), and only in browsers with ClipboardItem. */
export function canCopyImage() {
  return !!(globalThis.isSecureContext && navigator.clipboard?.write && (typeof ClipboardItem !== "undefined"));
}

/**
 * Can this user post pictures at all? Uploading needs the permission and a file picker.
 * @returns {boolean}
 */
export function canUploadImage() {
  const user = game.user;
  return !!(user && (user.isGM || user.can?.("FILES_UPLOAD")) && filePicker()?.upload);
}

function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/**
 * Which share buttons a session shows to this user.
 * @param {JournalEntryPage|undefined} page
 * @returns {{canShare: boolean, canPost: boolean}}
 */
export function shareButtons(page) {
  const canShare = photosFor(page).length > 0;
  return {canShare, canPost: canShare && canUploadImage() && visibleToAll(page)};
}

/**
 * The words of the picture for a session page, from the photos this user may see.
 * @param {JournalEntryPage} page
 * @param {object} [options]
 * @param {boolean} [options.credit]   The footer line; default: the setting
 * @param {object[]} [options.photos]  The photos to show instead of the ones this user may see (sample windows)
 * @returns {object|null}   null without photos
 */
export function sessionModel(page, {credit=(setting("shareImageCredit") !== false), photos=null}={}) {
  const all = photos ?? photosFor(page);
  if ( !all.length ) return null;
  const picked = pickPhotos(all, MAX_PHOTOS);
  const started = Number(flag(page, "session.started")) || Number(all[0]?.time) || Date.now();
  const date = new Date(started).toLocaleDateString(game.i18n.lang, {year: "numeric", month: "long", day: "numeric"});
  const count = all.length;
  const number = Number(flag(page, "session.number")) || 0;
  return shareModel({
    title: game.world?.title || t("SCA.Title"),
    label: number ? t("SCA.ShareImage.Session", {number}) : t("SCA.Title"),
    subtitle: `${date} · ${t(count === 1 ? "SCA.Recap.photosOne" : "SCA.Recap.photosOther", {count})}`,
    photos: picked.map(photo => ({caption: photo.caption, kind: photo.kind, kindLabel: t(`SCA.Kind.${photo.kind}`), src: photo.src})),
    more: (count > picked.length) ? t("SCA.ShareImage.More", {count: count - picked.length}) : "",
    footer: credit ? t("SCA.ShareImage.Credit") : ""
  });
}

/** The format of saved and posted pictures: the client setting. */
function chosenFormat() {
  return (setting("shareImageFormat") === "png") ? "png" : "webp";
}

/** The picture of a page as a blob in a format, with its file name. */
async function draw(page, format) {
  const model = sessionModel(page);
  if ( !model ) throw new Error("SCA.ShareImage.None");
  const {blob, missing} = await renderShareImage(model, {format});
  const extension = (blob.type === "image/webp") ? "webp" : "png";
  const name = shareFileName(game.world?.title, flag(page, "session.number"), extension);
  return {blob, name, missing, extension};
}

// Like Foundry's own saveDataToFile: a detached link that gets a click event. A link in the page can be taken over
// by other click handlers and open the picture in a tab instead.
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function warnMissing(count) {
  notify("warn", count === 1 ? "SCA.ShareImage.MissingOne" : "SCA.ShareImage.MissingOther", {count});
}

function failed(err) {
  const key = String(err?.message ?? "");
  if ( key === "SCA.ShareImage.None" ) return notify("warn", key);
  console.warn(`${MODULE_ID} | Could not draw the picture of the session`, err);
  notify("warn", "SCA.ShareImage.Failed");
}

/**
 * Saves the picture as a file in the browser's downloads.
 * @param {JournalEntryPage} page
 * @returns {Promise<"saved"|null>}
 */
export async function saveSessionImage(page) {
  try {
    const {blob, name, missing} = await draw(page, chosenFormat());
    download(blob, name);
    countFeature(MODULE_ID, "shareImageSaved");
    notify("info", "SCA.ShareImage.Saved");
    if ( missing ) warnMissing(missing);
    return "saved";
  } catch(err) {
    failed(err);
    return null;
  }
}

/**
 * Puts the picture on the clipboard. Where the browser refuses (plain http, no ClipboardItem, no permission) the picture
 * is saved as a file instead and the message says why.
 * @param {JournalEntryPage} page
 * @returns {Promise<"copied"|"saved"|null>}
 */
export async function copySessionImage(page) {
  // The picture is drawn while the clipboard waits for it, so the click still counts as the user's action.
  const drawing = draw(page, "png");
  drawing.catch(() => {});
  if ( canCopyImage() ) {
    try {
      await navigator.clipboard.write([new ClipboardItem({"image/png": drawing.then(result => result.blob)})]);
      countFeature(MODULE_ID, "shareImageCopied");
      notify("info", "SCA.ShareImage.Copied");
      return "copied";
    } catch(err) {
      console.debug(`${MODULE_ID} | The clipboard refused the picture`, err);
    }
  }
  try {
    const {blob, name} = await drawing;
    download(blob, name);
    countFeature(MODULE_ID, "shareImageSaved");
    notify("warn", "SCA.ShareImage.CopyFallback");
    return "saved";
  } catch(err) {
    failed(err);
    return null;
  }
}

/** The chat message for an uploaded picture. */
export function shareMessageHtml(url, title) {
  const src = esc(url);
  return `<div class="sca-card sca-shareimage"><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${esc(title)}"></a></div>`;
}

/**
 * Uploads the picture to the album's image folder and posts it in the chat for everyone.
 * @param {JournalEntryPage} page
 * @returns {Promise<ChatMessage|null>}
 */
export async function postSessionImage(page) {
  if ( !canUploadImage() ) {
    notify("warn", "SCA.ShareImage.PostNoUpload");
    return null;
  }
  if ( !visibleToAll(page) ) {
    notify("warn", "SCA.ShareImage.PostHidden");
    return null;
  }
  try {
    const {blob, name, missing, extension} = await draw(page, chosenFormat());
    const folder = `${storageRoot()}/${IMAGE_FOLDER}`;
    await ensureDirectory(folder);
    const file = new File([blob], `session-${Date.now().toString(36)}-${name}`, {type: blob.type || `image/${extension}`});
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out while uploading the picture")), UPLOAD_TIMEOUT_MS);
    });
    const response = await Promise.race([filePicker().upload(storageSource(), folder, file, {}, {notify: false}), timeout])
      .finally(() => clearTimeout(timer));
    if ( !response?.path ) throw new Error("The upload returned no file path");
    const url = (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(response.path)) ? response.path : foundry.utils.getRoute(response.path);
    const message = await ChatMessage.implementation.create({
      content: shareMessageHtml(url, page.name),
      speaker: {alias: t("SCA.Card.speaker")},
      whisper: [],
      flags: {[MODULE_ID]: {shareImage: {pageId: page.id}}}
    });
    countFeature(MODULE_ID, "shareImagePosted");
    notify("info", "SCA.ShareImage.Posted");
    if ( missing ) warnMissing(missing);
    return message;
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not post the picture of the session`, err);
    notify("warn", "SCA.ShareImage.PostFailed");
    return null;
  }
}

/**
 * One of the three buttons.
 * @param {"copy"|"save"|"post"} kind
 * @param {string} pageId
 * @returns {Promise<*>}
 */
export async function runShareImage(kind, pageId) {
  const page = albumJournal()?.pages.get(pageId);
  if ( !page || !photosFor(page).length ) {
    notify("warn", "SCA.ShareImage.None");
    return null;
  }
  if ( kind === "copy" ) return copySessionImage(page);
  if ( kind === "save" ) return saveSessionImage(page);
  if ( kind === "post" ) return postSessionImage(page);
  return null;
}
