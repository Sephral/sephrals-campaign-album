/**
 * "Last time": the photos of a past session shown to everyone, one after another, behind an intro slide with the
 * session title and date. The GM is offered it when a new session starts and can start it for any session from the
 * album window. The running recap lives in one world setting (which session, which slide), so every connected client
 * opens the viewer when it changes, a player who joins late finds it still running, and the GM leads. Only photos of
 * pages a user may read are shown to that user.
 */

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

import {MODULE_ID, TEMPLATES, esc, flag, setting, t} from "./config.mjs";
import {albumJournal, photoMeta, photosOf, sessionState} from "./album.mjs";
import {RECAP_INTRO, recapRunning, recapSlides, recapStep} from "./rules.mjs";
import {runShareImage, shareButtons} from "./share-image-actions.mjs";
import {countFeature} from "./usage.mjs";

/** Seconds of the intro slide and of each photo while the recap plays. */
const INTRO_SECONDS = 5;
const SLIDE_SECONDS = 6;

/** A recap that started longer ago than this is a leftover and does not open for a client that joins. */
const MAX_AGE_MS = 3 * 3600 * 1000;

/** The recap the user closed for themselves (its id), so it does not open again with the next slide. */
let dismissed = null;

/**
 * The running recap, or null.
 * @returns {{id: string, pageId: string, slide: string, active: boolean, at: number, playing: boolean}|null}
 */
export function liveRecap() {
  const state = setting("recap");
  return recapRunning(state, Date.now(), MAX_AGE_MS) ? state : null;
}

/**
 * Can everyone read this page? Only such a session may be shown to all.
 * @param {JournalEntryPage} page
 * @returns {boolean}
 */
export function visibleToAll(page) {
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  let level = page?.ownership?.default ?? levels.INHERIT;
  if ( level === levels.INHERIT ) level = page?.parent?.ownership?.default ?? levels.NONE;
  return level >= levels.OBSERVER;
}

/**
 * The photos of a page this user may see in a recap.
 * @param {JournalEntryPage|undefined} page
 * @returns {object[]}
 */
function photosForMe(page) {
  if ( !page || !page.testUserPermission(game.user, "OBSERVER") ) return [];
  return photosOf(page);
}

/**
 * "3 photos".
 * @param {number} count
 * @returns {string}
 */
export function photoCount(count) {
  return (count === 1) ? t("SCA.Recap.photosOne") : t("SCA.Recap.photosOther", {count});
}

/* -------------------------------------------- */
/*  Offer and start                             */
/* -------------------------------------------- */

/**
 * The card that offers the recap of a session: text and the button that starts it.
 * @param {JournalEntryPage} page   The session that ended
 * @param {number} count            Its photos
 * @returns {string}
 */
export function offerHtml(page, count) {
  const text = t("SCA.Recap.offer", {count: photoCount(count), session: page.name});
  return `<div class="sca-card sca-recap-offer"><p class="sca-card-title"><i class="fa-solid fa-clapperboard" inert></i> `
    + `${esc(t("SCA.Recap.title"))}</p><p>${esc(text)}</p>`
    + `<button type="button" data-sca-recap="${esc(page.id)}"><i class="fa-solid fa-play" inert></i> `
    + `${esc(t("SCA.Recap.show"))}</button></div>`;
}

/**
 * Offer the recap of a session to the GMs: a whispered card with a button and a short notice. Once per session.
 * @param {JournalEntryPage} page   The session that ended
 * @returns {Promise<boolean>}      Was an offer made?
 */
export async function offerRecap(page) {
  const count = page ? photosOf(page).length : 0;
  if ( !count || !visibleToAll(page) || (sessionState().recapFor === page.id) ) return false;
  await game.settings.set(MODULE_ID, "session", {...sessionState(), recapFor: page.id});
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  await ChatMessage.implementation.create({
    content: offerHtml(page, count),
    speaker: {alias: t("SCA.Card.speaker")},
    whisper: gms,
    flags: {[MODULE_ID]: {recapOffer: page.id}}
  });
  ui.notifications.info(t("SCA.Recap.notice", {count: photoCount(count)}));
  countFeature(MODULE_ID, "recapOffered");
  return true;
}

/**
 * Start the recap of a session for everyone (GM).
 * @param {string} pageId
 * @returns {Promise<boolean>}
 */
export async function startRecap(pageId) {
  if ( !game.user.isGM ) return false;
  const page = albumJournal()?.pages.get(pageId);
  if ( !page || !photosOf(page).length ) {
    ui.notifications.info(t("SCA.Recap.empty"));
    return false;
  }
  if ( !visibleToAll(page) ) {
    ui.notifications.warn(t("SCA.Recap.hidden"));
    return false;
  }
  dismissed = null;
  await game.settings.set(MODULE_ID, "recap",
    {id: foundry.utils.randomID(), pageId, slide: RECAP_INTRO, active: true, at: Date.now(), playing: true});
  countFeature(MODULE_ID, "recapShown");
  return true;
}

/**
 * Stop the running recap for everyone (GM).
 * @returns {Promise<void>}
 */
export async function stopRecap() {
  if ( !game.user.isGM || !setting("recap")?.active ) return;
  await game.settings.set(MODULE_ID, "recap", {...setting("recap"), active: false});
}

/**
 * Open the viewer for the running recap again after the user closed it (the album's join button).
 */
export function joinRecap() {
  dismissed = null;
  onRecapChange();
}

/* -------------------------------------------- */
/*  Following the setting                       */
/* -------------------------------------------- */

/**
 * The setting "recap" changed (or the world started): open, update or close the viewer on this client.
 */
export function onRecapChange() {
  const app = foundry.applications.instances.get(RecapViewer.DEFAULT_OPTIONS.id);
  const state = liveRecap();
  if ( !state ) {
    app?.closeRemote();
    dismissed = null;
  } else if ( state.id !== dismissed ) {
    if ( app ) app.render();
    else new RecapViewer().render({force: true});
  }
  const album = foundry.applications.instances.get("sca-album");
  if ( album?.rendered ) album.render();
}

/**
 * After the world started: the active GM ends a recap left over from an earlier run, everyone else joins a running one.
 */
export function recapOnReady() {
  const state = setting("recap");
  if ( state?.active && !liveRecap() ) {
    if ( game.user.isActiveGM ) game.settings.set(MODULE_ID, "recap", {...state, active: false}).catch(() => {});
    return;
  }
  if ( liveRecap() ) onRecapChange();
}

/* -------------------------------------------- */

export class RecapViewer extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sca-recap",
    classes: ["sca-recap"],
    window: {title: "SCA.Recap.title", icon: "fa-solid fa-clapperboard", resizable: true},
    position: {width: 860, height: 620},
    actions: {
      prev: RecapViewer.#onPrev,
      next: RecapViewer.#onNext,
      play: RecapViewer.#onPlay,
      stop: RecapViewer.#onStop,
      shareImage: RecapViewer.#onShareImage
    }
  };

  /** @override */
  static PARTS = {
    main: {template: `${TEMPLATES}/recap.hbs`}
  };

  /** The timer to the next slide (active GM). */
  #timer = null;

  /** Closed because the recap ended, not by the user. */
  #remote = false;

  /** @override */
  get title() {
    return t("SCA.Recap.title");
  }

  /**
   * The state of the recap this window shows: the running one. Sample windows keep their own in memory.
   * @returns {object|null}
   */
  _state() {
    return liveRecap();
  }

  /**
   * The session page of a recap state.
   * @param {object} state
   * @returns {JournalEntryPage|undefined}
   */
  _page(state) {
    return albumJournal()?.pages.get(state.pageId);
  }

  /**
   * The slides this client shows.
   * @param {object} state
   * @returns {string[]}
   */
  #slides(state) {
    return recapSlides(photosForMe(this._page(state)));
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this._state();
    context.isGM = game.user.isGM;
    if ( !state ) return context;
    const page = this._page(state);
    const photos = photosForMe(page);
    const slides = recapSlides(photos);
    const index = Math.max(0, slides.indexOf(state.slide));
    context.playing = !!state.playing;
    context.hasPrev = index > 0;
    context.hasNext = index < (slides.length - 1);
    // At the end of the recap everyone can take the session home as one picture
    if ( !context.hasNext && photos.length ) Object.assign(context, shareButtons(page), {sharePageId: page.id});
    if ( (index === 0) || !photos.length ) {
      const started = Number(flag(page ?? {}, "session.started")) || photos[0]?.time || Date.now();
      context.intro = {
        heading: t("SCA.Recap.introHeading"),
        title: page?.name ?? "",
        date: new Date(started).toLocaleDateString(game.i18n.lang, {year: "numeric", month: "long", day: "numeric"}),
        count: photoCount(photos.length)
      };
    } else {
      const photo = photos[index - 1];
      context.photo = {...photo, label: photo.caption || t(`SCA.Kind.${photo.kind}`), meta: photoMeta(photo),
        position: t("SCA.Album.position", {index, count: photos.length})};
    }
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    clearTimeout(this.#timer);
    const state = this._state();
    // Only the active GM's client moves the recap on by itself (a sample window stays where it is)
    if ( !state || !state.playing || !game.user.isActiveGM || this.isSample ) return;
    const slides = this.#slides(state);
    const seconds = (state.slide === RECAP_INTRO) ? INTRO_SECONDS : SLIDE_SECONDS;
    this.#timer = setTimeout(() => {
      const current = liveRecap();
      if ( !current || (current.id !== state.id) || !current.playing ) return;
      const {slide, last} = recapStep(slides, current.slide, 1);
      if ( (slide === current.slide) && last ) return stopRecap();
      game.settings.set(MODULE_ID, "recap", {...current, slide});
    }, seconds * 1000);
  }

  /** @override */
  async _onClose(options) {
    clearTimeout(this.#timer);
    if ( this.isSample ) return super._onClose(options);
    const state = setting("recap");
    if ( !this.#remote && state?.active ) {
      // A player closes it for themselves, the GM ends it for everyone
      if ( game.user.isGM ) stopRecap();
      else dismissed = state.id;
    }
    this.#remote = false;
    const album = foundry.applications.instances.get("sca-album");
    if ( album?.rendered ) album.render();
    return super._onClose(options);
  }

  /**
   * Close because the recap ended for everyone.
   * @returns {Promise<void>}
   */
  closeRemote() {
    this.#remote = true;
    return this.close();
  }

  /**
   * Move the recap by a slide (GM). Moving by hand pauses the automatic run.
   * @param {number} delta
   */
  async #move(delta) {
    if ( !game.user.isGM ) return;
    const state = liveRecap();
    if ( !state ) return;
    const {slide} = recapStep(this.#slides(state), state.slide, delta);
    await game.settings.set(MODULE_ID, "recap", {...state, slide, playing: false});
  }

  /** @this {RecapViewer} */
  static #onPrev() {
    return this.#move(-1);
  }

  /** @this {RecapViewer} */
  static #onNext() {
    return this.#move(1);
  }

  /** @this {RecapViewer} */
  static async #onPlay() {
    const state = liveRecap();
    if ( !game.user.isGM || !state ) return;
    await game.settings.set(MODULE_ID, "recap", {...state, playing: !state.playing});
  }

  /** @this {RecapViewer} */
  static async #onShareImage(event, target) {
    const buttons = target.closest("[data-share-page]")?.querySelectorAll("button") ?? [target];
    for ( const button of buttons ) button.disabled = true;
    try {
      await runShareImage(target.dataset.kind, target.closest("[data-share-page]")?.dataset.sharePage);
    } finally {
      for ( const button of buttons ) button.disabled = false;
    }
  }

  /** @this {RecapViewer} */
  static #onStop() {
    return stopRecap();
  }
}
