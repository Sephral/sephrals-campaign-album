/**
 * The album itself: a journal everyone may read, one page per session. Each page keeps its photos as a list in its
 * flags and shows them as figures in its text, so the journal also works without the module. The image files lie in
 * the world folder (on The Forge in the Assets Library). Only the active GM's client writes here.
 */

import {MODULE_ID, esc, flag, setting, t} from "./config.mjs";
import {combatHtml, combatLines, combatSnapshot, nearSpan, needsNewSession, pageHtml, photoFileName,
  withCombatSection} from "./rules.mjs";

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
 * @param {object|null} [combat]   The combat totals of its game night (see combatSnapshot)
 * @returns {string}
 */
function renderPage(photos, combat=null) {
  return pageHtml(photos, {intro: t("SCA.Session.intro"), meta: photoMeta, empty: t("SCA.Session.empty"),
    combat: combatSection(combat)});
}

/**
 * Write the photos of a page and its text.
 * @param {JournalEntryPage} page
 * @param {object[]} photos
 * @param {object|null} [combat]   New combat totals; left out, the page keeps the ones it has
 * @returns {Promise<void>}
 */
async function writePage(page, photos, combat) {
  const update = {[`flags.${MODULE_ID}.photos`]: photos};
  if ( combat !== undefined ) update[`flags.${MODULE_ID}.combat`] = combat;
  update["text.content"] = renderPage(photos, (combat === undefined) ? flag(page, "combat") : combat);
  await page.update(update);
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
    const photos = [...photosOf(page), photo];
    const [combat] = (await combatTotalsFor([pageSpan(page, photos)])) ?? [];
    await writePage(page, photos, combat ?? undefined);
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

/* -------------------------------------------- */
/*  Combat totals                               */
/* -------------------------------------------- */

/** Sephral's Combat Log & Stats, which counts the fights of a game night. */
export const COMBAT_LOG_ID = "sephrals-combat-log-stats";

/** Its hook after a combat log was saved (on the recording GM's client, the active GM). */
export const COMBAT_LOG_HOOK = `${COMBAT_LOG_ID}.logUpdated`;

/** Its package page, for the GM's hint in the album window. */
export const COMBAT_LOG_URL = "https://foundryvtt.com/packages/sephrals-combat-log-stats";

/**
 * The GM's hint in the album window while the combat totals are on but Combat Log & Stats is not active, or is an
 * older version without them (its API is there, the totals are not), as HTML.
 * @returns {string}
 */
export function combatTotalsHint() {
  if ( !game.user.isGM || !setting("combatTotals") ) return "";
  const module = game.modules.get(COMBAT_LOG_ID);
  if ( module?.active && (!module.api || (typeof module.api.sessionTotals === "function")) ) return "";
  const link = `<a href="${COMBAT_LOG_URL}" target="_blank" rel="noopener">Sephral’s Combat Log &amp; Stats</a>`;
  return t("SCA.Combat.hint", {link});
}

/** Fights this close to the photos of a page may belong to its game night. */
const NIGHT_MARGIN_MS = 12 * 3600 * 1000;

/** Saved combat logs wait this long, so the end of a fight and the edits after it make one refresh. */
const REFRESH_DELAY_MS = 2000;

/** A photo never waits longer than this for the combat totals. */
const TOTALS_TIMEOUT_MS = 10000;

/**
 * The API of Combat Log & Stats, when it is active and offers the totals of game sessions.
 * @returns {object|null}
 */
function combatLogApi() {
  const module = game.modules.get(COMBAT_LOG_ID);
  return (module?.active && (typeof module.api?.sessionTotals === "function")) ? module.api : null;
}

/**
 * The time a page covers: from its first photo to its last one.
 * @param {JournalEntryPage} page
 * @param {object[]} [photos]
 * @returns {{from: number, to: number}}
 */
function pageSpan(page, photos=photosOf(page)) {
  const times = photos.map(photo => Number(photo.time)).filter(Number.isFinite);
  const from = Number(flag(page, "session.started")) || Math.min(...times, Date.now());
  return {from, to: Math.max(from, ...times)};
}

/**
 * The combat totals section of a page for its stored totals, or none while the setting is off.
 * @param {object|null} combat
 * @returns {string}
 */
function combatSection(combat) {
  if ( !setting("combatTotals") ) return "";
  const lang = game.i18n.lang;
  const num = value => {
    try {
      return new Intl.NumberFormat(lang, {maximumFractionDigits: 1}).format(value);
    } catch {
      return String(Math.round(value * 10) / 10);
    }
  };
  const join = names => {
    try {
      return new Intl.ListFormat(lang, {type: "conjunction"}).format(names);
    } catch {
      return names.join(", ");
    }
  };
  return combatHtml(t("SCA.Combat.title"), combatLines(combat, {t, num, join}));
}

/**
 * Ask Combat Log & Stats for the totals of the game nights of some pages. Without it, with the setting off, when it
 * fails or takes too long, nothing changes on the pages (undefined).
 * @param {{from: number, to: number}[]} spans
 * @returns {Promise<(object|null)[]|undefined>}
 */
async function combatTotalsFor(spans) {
  const api = combatLogApi();
  if ( !api || !setting("combatTotals") || !spans.length ) return undefined;
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(resolve, TOTALS_TIMEOUT_MS);
  });
  try {
    const answers = await Promise.race([api.sessionTotals(spans), timeout]);
    return Array.isArray(answers) ? answers.map(combatSnapshot) : undefined;
  } catch(err) {
    console.warn(`${MODULE_ID} | The combat totals could not be read`, err);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bring the combat totals of some pages up to date (active GM). Only their section of the text changes, so what the
 * GM wrote into an older page stays. A page keeps the totals it has when no fights are found for it any more (player
 * reports turned off, old logs removed), like a report already posted.
 * @param {string[]} pageIds
 * @returns {Promise<void>}
 */
export function refreshCombatTotals(pageIds) {
  return serialize(async () => {
    if ( !game.user.isActiveGM ) return;
    const journal = albumJournal();
    const pages = [...new Set(pageIds)].map(id => journal?.pages.get(id)).filter(Boolean);
    const answers = await combatTotalsFor(pages.map(page => pageSpan(page)));
    if ( !answers ) return;
    for ( const [index, page] of pages.entries() ) {
      const combat = answers[index];
      if ( !combat || (JSON.stringify(flag(page, "combat")) === JSON.stringify(combat)) ) continue;
      await page.update({[`flags.${MODULE_ID}.combat`]: combat,
        "text.content": withCombatSection(page.text?.content, combatSection(combat))});
    }
  });
}

/**
 * Show or hide the stored combat totals on every page after the setting changed (active GM), then bring them up to
 * date.
 * @returns {Promise<void>}
 */
export async function onCombatTotalsSetting() {
  if ( !game.user.isActiveGM ) return;
  await serialize(async () => {
    for ( const page of sessionPages() ) {
      const content = withCombatSection(page.text?.content, combatSection(flag(page, "combat")));
      if ( content !== page.text?.content ) await page.update({"text.content": content});
    }
  });
  if ( setting("combatTotals") ) await refreshAllCombatTotals();
}

/**
 * Bring the combat totals of every page up to date in one request. Only pages whose totals changed are written, so
 * older pages also follow later corrections, sharing choices and a switch of player reports in Combat Log & Stats.
 * @returns {Promise<void>}
 */
function refreshAllCombatTotals() {
  const ids = sessionPages().map(page => page.id);
  return ids.length ? refreshCombatTotals(ids) : Promise.resolve();
}

/**
 * After the world started (active GM): wait for Combat Log & Stats, which offers its API a moment after "ready", then
 * bring the totals of every page up to date.
 * @returns {Promise<void>}
 */
export async function refreshCombatTotalsOnReady() {
  if ( !game.user.isActiveGM || !setting("combatTotals") || !game.modules.get(COMBAT_LOG_ID)?.active ) return;
  for ( let wait = 0; (wait < 60) && !combatLogApi(); wait++ ) await new Promise(resolve => setTimeout(resolve, 500));
  if ( !combatLogApi() ) return;
  try {
    await refreshAllCombatTotals();
  } catch(err) {
    console.warn(`${MODULE_ID} | The combat totals could not be updated`, err);
  }
}

/** Start times of saved fights waiting for the refresh; null for a deleted fight. */
const savedFights = new Set();
let refreshTimer = null;

/**
 * Hook of Combat Log & Stats after a combat log was saved: a fight that ended or was changed afterwards updates the
 * pages of its game night, a deleted one the latest page. Running fights wait for their end.
 * @param {object} log
 */
export function onCombatLogSaved(log) {
  if ( !game.user.isActiveGM || !setting("combatTotals") || !log || (log.status === "active") ) return;
  const started = Date.parse(log.startedAt ?? "");
  savedFights.add(Number.isFinite(started) ? started : null);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const times = [...savedFights];
    savedFights.clear();
    const pages = sessionPages();
    const ids = pages.filter(page => times.some(time => nearSpan(pageSpan(page), time, NIGHT_MARGIN_MS)))
      .map(page => page.id);
    if ( times.includes(null) && pages.length ) ids.push(pages.at(-1).id);
    if ( ids.length ) refreshCombatTotals(ids).catch(err => console.warn(`${MODULE_ID} | The combat totals could not be updated`, err));
  }, REFRESH_DELAY_MS);
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
