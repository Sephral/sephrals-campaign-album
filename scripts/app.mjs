/**
 * The album window: the sessions with their photos, a large view with captions, a slideshow through the whole
 * campaign, and the buttons to take a photo. Everyone may look; the GM edits captions, removes photos and starts a
 * new session.
 */

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, setting, t} from "./config.mjs";
import {albumJournal, allPhotos, combatTotalsHint, nextIsNewSession, photoMeta, photosOf, removePhoto, sessionPages,
  setCaption, startNewSession} from "./album.mjs";
import {photoByGM, submitOwnPhoto} from "./photographer.mjs";
import {countFeature, markUsed} from "./usage.mjs";

/** Seconds per photo in the slideshow. */
const SLIDE_SECONDS = 5;

/**
 * Open the album, optionally at a photo.
 * @param {object} [options]
 * @param {string} [options.photoId]
 * @returns {Promise<CampaignAlbum>}
 */
export async function openAlbum({photoId}={}) {
  const app = foundry.applications.instances.get(CampaignAlbum.DEFAULT_OPTIONS.id) ?? new CampaignAlbum();
  if ( photoId ) {
    app.sessionId = "all";
    app.viewing = photoId;
  }
  await app.render({force: true});
  app.bringToFront?.();
  markUsed(MODULE_ID);
  return app;
}

/**
 * The camera button: the GM takes a photo for the album, a player sends a photo of the own view with a caption.
 * @returns {Promise<void>}
 */
export async function takePhotoAsUser() {
  if ( game.user.isGM ) return photoByGM();
  if ( setting("playerPhotos") === "off" ) return ui.notifications.warn(t("SCA.Error.playerPhotosOff"));
  const caption = await DialogV2.prompt({
    window: {title: t("SCA.Album.takePhoto")},
    content: `<p>${esc(t("SCA.Album.playerHint"))}</p><div class="form-group"><label>${esc(t("SCA.Album.caption"))}</label>`
      + `<input type="text" name="caption" maxlength="300" autofocus></div>`,
    rejectClose: false,
    ok: {label: t("SCA.Album.send"), callback: (event, button) => button.form.elements.caption.value}
  });
  if ( (caption === null) || (caption === undefined) ) return;
  // Let the dialog disappear before the photo
  await new Promise(resolve => setTimeout(resolve, 100));
  await submitOwnPhoto(caption);
}

/**
 * Redraw the album window if it is open.
 */
export function refreshAlbum() {
  const app = foundry.applications.instances.get(CampaignAlbum.DEFAULT_OPTIONS.id);
  if ( app?.rendered ) app.render();
}

/* -------------------------------------------- */

export class CampaignAlbum extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sca-album",
    classes: ["sca-album"],
    window: {title: "SCA.Title", icon: "fa-solid fa-images", resizable: true},
    position: {width: 960, height: 720},
    actions: {
      view: CampaignAlbum.#onView,
      prev: CampaignAlbum.#onPrev,
      next: CampaignAlbum.#onNext,
      closeViewer: CampaignAlbum.#onCloseViewer,
      slideshow: CampaignAlbum.#onSlideshow,
      photo: CampaignAlbum.#onPhoto,
      newSession: CampaignAlbum.#onNewSession,
      openJournal: CampaignAlbum.#onOpenJournal,
      caption: CampaignAlbum.#onCaption,
      remove: CampaignAlbum.#onRemove
    }
  };

  /** @override */
  static PARTS = {
    main: {template: `${TEMPLATES}/album.hbs`, scrollable: [".sca-scroll"]}
  };

  /** The session shown: a page id, or "all". */
  sessionId = null;

  /** The photo in the large view, or null. */
  viewing = null;

  /** The slideshow timer. */
  #slideshow = null;

  /** @override */
  get title() {
    return t("SCA.Title");
  }

  /* -------------------------------------------- */

  /**
   * The photos the window shows, in order.
   * @returns {{page: JournalEntryPage, photo: object}[]}
   */
  #shown() {
    const all = allPhotos();
    if ( this.#slideshow || (this.sessionId === "all") || !this.sessionId ) return all;
    return all.filter(entry => entry.page.id === this.sessionId);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const pages = sessionPages();
    const isGM = game.user.isGM;
    context.ready = !!albumJournal();
    context.isGM = isGM;
    context.canTake = isGM || (setting("playerPhotos") !== "off");
    context.noGM = !game.users.activeGM;
    if ( !this.sessionId || ((this.sessionId !== "all") && !pages.some(p => p.id === this.sessionId)) ) {
      this.sessionId = pages.at(-1)?.id ?? "all";
    }
    context.sessionId = this.sessionId;
    context.options = [{id: "all", label: t("SCA.Album.allSessions"), selected: this.sessionId === "all"},
      ...pages.map(p => ({id: p.id, label: `${p.name} (${photosOf(p).length})`, selected: p.id === this.sessionId}))];
    context.sessions = pages.filter(p => (this.sessionId === "all") || (p.id === this.sessionId)).map(page => ({
      id: page.id,
      title: page.name,
      photos: photosOf(page).map(photo => ({...photo, pageId: page.id, meta: photoMeta(photo),
        label: photo.caption || t(`SCA.Kind.${photo.kind}`)}))
    }));
    context.count = allPhotos().length;
    context.newNext = isGM && nextIsNewSession();
    // GM only: where the combat totals of the session pages would come from
    context.combatHint = combatTotalsHint();

    // The large view
    const shown = this.#shown();
    const index = shown.findIndex(entry => entry.photo.id === this.viewing);
    if ( index < 0 ) this.viewing = null;
    if ( this.viewing ) {
      const {page, photo} = shown[index];
      context.viewer = {...photo, pageId: page.id, session: page.name, meta: photoMeta(photo),
        kindLabel: t(`SCA.Kind.${photo.kind}`), position: t("SCA.Album.position", {index: index + 1, count: shown.length}),
        hasPrev: index > 0 || !!this.#slideshow, hasNext: index < (shown.length - 1) || !!this.#slideshow,
        slideshow: !!this.#slideshow};
    }
    return context;
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const select = this.element.querySelector("select[name=session]");
    select?.addEventListener("change", () => {
      this.sessionId = select.value;
      this.render();
    });
    if ( !this._keys ) {
      this._keys = event => {
        if ( !this.viewing || (event.target instanceof HTMLInputElement) ) return;
        if ( event.key === "ArrowRight" ) this.#step(1);
        else if ( event.key === "ArrowLeft" ) this.#step(-1);
        else if ( event.key === "Escape" ) {
          event.preventDefault();
          event.stopPropagation();
          this.#closeViewer();
        }
      };
      this.element.addEventListener("keydown", this._keys);
    }
    if ( this.viewing ) this.element.querySelector(".sca-viewer")?.focus();
  }

  /** @override */
  async _onClose(options) {
    this.#stopSlideshow();
    this.viewing = null;
    return super._onClose(options);
  }

  /* -------------------------------------------- */

  /**
   * Move the large view by some photos.
   * @param {number} delta
   */
  #step(delta) {
    const shown = this.#shown();
    if ( !shown.length ) return;
    const index = shown.findIndex(entry => entry.photo.id === this.viewing);
    let next = index + delta;
    if ( this.#slideshow ) next = (next + shown.length) % shown.length;
    if ( (next < 0) || (next >= shown.length) ) return;
    this.viewing = shown[next].photo.id;
    this.render();
  }

  /** Close the large view and stop the slideshow. */
  #closeViewer() {
    this.#stopSlideshow();
    this.viewing = null;
    this.render();
  }

  /** Stop the slideshow. */
  #stopSlideshow() {
    if ( this.#slideshow ) clearInterval(this.#slideshow);
    this.#slideshow = null;
  }

  /**
   * The page and photo of an element.
   * @param {HTMLElement} target
   * @returns {{pageId: string, photoId: string}}
   */
  static #ids(target) {
    const el = target.closest("[data-photo-id]");
    return {pageId: el?.dataset.pageId, photoId: el?.dataset.photoId};
  }

  /* -------------------------------------------- */

  /** @this {CampaignAlbum} */
  static #onView(event, target) {
    this.viewing = CampaignAlbum.#ids(target).photoId;
    this.render();
  }

  /** @this {CampaignAlbum} */
  static #onPrev() {
    this.#step(-1);
  }

  /** @this {CampaignAlbum} */
  static #onNext() {
    this.#step(1);
  }

  /** @this {CampaignAlbum} */
  static #onCloseViewer() {
    this.#closeViewer();
  }

  /** @this {CampaignAlbum} */
  static #onSlideshow() {
    if ( this.#slideshow ) return this.#closeViewer();
    const all = allPhotos();
    if ( !all.length ) return ui.notifications.info(t("SCA.Album.empty"));
    this.viewing = all[0].photo.id;
    this.#slideshow = setInterval(() => {
      if ( !this.rendered ) return this.#stopSlideshow();
      this.#step(1);
    }, SLIDE_SECONDS * 1000);
    countFeature(MODULE_ID, "slideshow");
    this.render();
  }

  /** @this {CampaignAlbum} */
  static async #onPhoto() {
    await takePhotoAsUser();
  }

  /** @this {CampaignAlbum} */
  static async #onNewSession() {
    if ( !game.user.isGM ) return;
    await startNewSession();
    countFeature(MODULE_ID, "newSession");
    ui.notifications.info(t("SCA.Notice.newSession"));
    this.render();
  }

  /** @this {CampaignAlbum} */
  static #onOpenJournal() {
    const journal = albumJournal();
    if ( !journal ) return;
    const pageId = (this.sessionId && (this.sessionId !== "all")) ? this.sessionId : undefined;
    journal.sheet.render(true, pageId ? {pageId} : {});
  }

  /** @this {CampaignAlbum} */
  static async #onCaption(event, target) {
    if ( !game.user.isGM ) return;
    const {pageId, photoId} = CampaignAlbum.#ids(target);
    const photo = photosOf(albumJournal()?.pages.get(pageId) ?? {}).find(p => p.id === photoId);
    if ( !photo ) return;
    const caption = await DialogV2.prompt({
      window: {title: t("SCA.Album.editCaption")},
      content: `<div class="form-group"><label>${esc(t("SCA.Album.caption"))}</label>`
        + `<input type="text" name="caption" maxlength="300" value="${esc(photo.caption)}" autofocus></div>`,
      rejectClose: false,
      ok: {label: t("SCA.Album.save"), callback: (event, button) => button.form.elements.caption.value}
    });
    if ( caption === null || caption === undefined ) return;
    countFeature(MODULE_ID, "captionEdit");
    await GMWrite(() => setCaption(pageId, photoId, caption));
  }

  /** @this {CampaignAlbum} */
  static async #onRemove(event, target) {
    if ( !game.user.isGM ) return;
    const {pageId, photoId} = CampaignAlbum.#ids(target);
    const ok = await DialogV2.confirm({window: {title: t("SCA.Album.remove")},
      content: `<p>${esc(t("SCA.Album.removeConfirm"))}</p>`, rejectClose: false});
    if ( !ok ) return;
    this.#step(1);
    if ( this.viewing === photoId ) this.viewing = null;
    countFeature(MODULE_ID, "photoRemove");
    await GMWrite(() => removePhoto(pageId, photoId));
  }
}

/**
 * Run a change of the album as a GM, and report an error.
 * @param {() => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function GMWrite(fn) {
  try {
    await fn();
  } catch(err) {
    const key = String(err?.message ?? "");
    ui.notifications.warn(key.startsWith("SCA.") ? t(key) : t("SCA.Error.write"));
    if ( !key.startsWith("SCA.") ) console.error(`${MODULE_ID} |`, err);
  }
}

