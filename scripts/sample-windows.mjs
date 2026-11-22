// Sample windows (api.samples, contract in samples.mjs): the album, the recap, the journal page, the chat cards and the
// questions of the module filled with made-up photos, so translators and testers see every text in its place without
// playing a session first. Nothing here writes: the pages are plain objects in memory, every button that would change,
// post or share something only says that it does nothing, no usage counter counts.
import {MODULE_ID, esc, t} from "./config.mjs";
import {combatHintHtml, cardHtml, renderPage} from "./album.mjs";
import {CampaignAlbum, captionPromptHtml, photoPromptHtml} from "./app.mjs";
import {RecapViewer, offerHtml} from "./recap.mjs";
import {approvalHtml} from "./photographer.mjs";
import {reportHtml, versionsText} from "./selftest.mjs";
import {sessionModel, shareMessageHtml} from "./share-image-actions.mjs";
import {renderShareImage} from "./share-image.mjs";
import {RECAP_INTRO, recapSlides, recapStep} from "./rules.mjs";
import {MESSAGE_KEYS, SELFTEST_PROBLEMS, sampleCombat, sampleEmptySession, sampleSessions} from "./sample-data.mjs";
import {markSample, openSampleChat, openSampleHtml, sampleActions, sampleCast, sampleId} from "./samples.mjs";

// Actions of the album window that only look: open a photo, step through, slideshow, close the large view.
const ALBUM_LOOKING = ["view", "prev", "next", "closeViewer", "slideshow"];

const photosOf = page => page.flags[MODULE_ID].photos;

/* -------------------------------------------- */
/*  The windows                                 */
/* -------------------------------------------- */

/** The album window over made-up pages. The GM buttons show for a GM view whoever opens it. */
class SampleAlbum extends CampaignAlbum {
  constructor({pages, key, ready = true, player = false, noGM = false, newNext = false, recapLive = false, hint = false,
    sessionId = null, viewing = null}) {
    super({id: sampleId(MODULE_ID, key), actions: sampleActions(CampaignAlbum, ALBUM_LOOKING)});
    this.samplePages = pages;
    this.sampleReady = ready;
    this.sampleView = {player, noGM, newNext, recapLive, hint};
    if ( sessionId ) this.sessionId = sessionId;
    if ( viewing ) this.viewing = viewing;
    markSample(this);
  }

  _pages() {
    return this.samplePages;
  }

  _ready() {
    return this.sampleReady;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {player, noGM, newNext, recapLive, hint} = this.sampleView;
    context.isGM = !player;
    context.canTake = true;
    context.noGM = noGM;
    context.newNext = !player && newNext;
    context.canRecap = !player && this.samplePages.some(page => photosOf(page).length);
    context.recapLive = recapLive;
    context.combatHint = (!player && hint) ? combatHintHtml() : "";
    return context;
  }
}

/** The recap window over a made-up session, held in memory: the buttons step through it without writing anything. */
class SampleRecap extends RecapViewer {
  constructor({page, key, slide = RECAP_INTRO, player = false, over = false}) {
    const step = delta => function() {
      const slides = recapSlides(photosOf(this.samplePage));
      const {slide: next} = recapStep(slides, this.sampleState.slide, delta);
      this.sampleState = {...this.sampleState, slide: next, playing: false};
      this.render();
    };
    const play = function() {
      this.sampleState = {...this.sampleState, playing: !this.sampleState.playing};
      this.render();
    };
    super({id: sampleId(MODULE_ID, key), actions: {...sampleActions(RecapViewer, []), prev: step(-1), next: step(1), play}});
    this.samplePage = page;
    this.samplePlayer = player;
    this.sampleOver = over;
    this.sampleState = {id: "sample", pageId: page.id, slide, active: true, at: Date.now(), playing: false};
    markSample(this);
  }

  _state() {
    return this.sampleOver ? null : this.sampleState;
  }

  _page() {
    return this.samplePage;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = !this.samplePlayer;
    return context;
  }
}

async function openAlbum(key, options) {
  await foundry.applications.instances.get(sampleId(MODULE_ID, key))?.close({animate: false});
  const app = new SampleAlbum({key, ...options});
  await app.render({force: true});
  return app;
}

async function openRecap(key, options) {
  await foundry.applications.instances.get(sampleId(MODULE_ID, key))?.close({animate: false});
  const app = new SampleRecap({key, ...options});
  await app.render({force: true});
  return app;
}

/** The share picture of tonight's session as an image URL (the real drawing code over the sample photos). */
async function shareImageUrl(page) {
  const model = sessionModel(page, {credit: true, photos: photosOf(page)});
  const {blob} = await renderShareImage(model, {format: "png"});
  return URL.createObjectURL(blob);
}

/** A form with its buttons, as the dialogs of the module show it. */
function questionHtml(form, buttons, cancel = game.i18n.localize("Cancel")) {
  return `<form class="sca-sample-question">${form}<footer class="form-footer" style="display:flex;gap:6px;margin-top:8px;">`
    + `${buttons.map(label => `<button type="button" class="default">${esc(label)}</button>`).join("")}`
    + `<button type="button">${esc(cancel)}</button></footer></form>`;
}

/* -------------------------------------------- */

/**
 * The sample windows of the module (api.samples).
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const now = Date.now();
  const pages = () => sampleSessions({now, t});
  const tonight = () => pages().at(-1);
  const entries = [];
  const album = (id, label, options) => entries.push({
    id, label: t(label), group: t("SCA.Title"),
    open: () => openAlbum(id, {pages: pages(), ...options})
  });
  const recap = (id, label, options) => entries.push({
    id, label: t(label), group: t("SCA.Recap.title"),
    open: () => openRecap(id, {page: tonight(), ...options})
  });
  const text = (id, label, group, open) => entries.push({id, label: t(label), group: t(group), open});

  // The album window
  album("album-gm", "SCA.Sample.AlbumGm", {});
  album("album-all", "SCA.Sample.AlbumAll", {sessionId: "all"});
  album("album-player", "SCA.Sample.AlbumPlayer", {player: true});
  album("album-viewer", "SCA.Sample.AlbumViewer", {sessionId: "all", viewing: "n07"});
  album("album-viewer-player", "SCA.Sample.AlbumViewerPlayer", {sessionId: "all", viewing: "n12", player: true});
  entries.push({
    id: "album-slideshow", label: t("SCA.Sample.AlbumSlideshow"), group: t("SCA.Title"),
    open: async () => {
      const app = await openAlbum("album-slideshow", {pages: pages(), sessionId: "all"});
      app.element.querySelector("[data-action=slideshow]")?.click();
      await new Promise(resolve => setTimeout(resolve, 400));
      return app;
    }
  });
  album("album-hints", "SCA.Sample.AlbumHints", {noGM: true, newNext: true, recapLive: true, hint: true});
  entries.push({
    id: "album-empty-session", label: t("SCA.Sample.AlbumEmptySession"), group: t("SCA.Title"),
    open: () => openAlbum("album-empty-session", {pages: [sampleEmptySession({now, t})]})
  });
  entries.push({
    id: "album-empty", label: t("SCA.Sample.AlbumEmpty"), group: t("SCA.Title"),
    open: () => openAlbum("album-empty", {pages: []})
  });
  entries.push({
    id: "album-not-ready", label: t("SCA.Sample.AlbumNotReady"), group: t("SCA.Title"),
    open: () => openAlbum("album-not-ready", {pages: [], ready: false})
  });

  // The recap
  recap("recap-intro", "SCA.Sample.RecapIntro", {});
  recap("recap-photo", "SCA.Sample.RecapPhoto", {slide: "n03"});
  recap("recap-last", "SCA.Sample.RecapLast", {slide: "n12"});
  recap("recap-player", "SCA.Sample.RecapPlayer", {slide: "n07", player: true});
  recap("recap-over", "SCA.Sample.RecapOver", {over: true});

  // The journal page of a session, with the combat totals of its night
  const journal = (id, label, variant) => text(id, label, "SCA.Sample.Journal", async () => {
    const page = tonight();
    const body = () => `<div class="journal-entry-page"><div class="journal-page-content">${renderPage(photosOf(page).slice(0, 1), sampleCombat(variant), {always: true})}</div></div>`;
    return openSampleHtml({moduleId: MODULE_ID, id, title: page.name, body, width: 560});
  });
  journal("journal-night", "SCA.Sample.JournalNight", "night");
  journal("journal-first", "SCA.Sample.JournalFirst", "first");
  journal("journal-healing", "SCA.Sample.JournalHealing", "healing");

  // Chat cards
  const chat = (id, label, content, options = {}) => text(id, label, "SCA.Sample.Chat",
    () => openSampleChat({moduleId: MODULE_ID, id, title: t(label), content, ...options}));
  chat("chat-photo", "SCA.Sample.ChatPhoto", () => cardHtml(photosOf(tonight())[1]),
    {flags: {[MODULE_ID]: {card: true, photo: "n02"}}});
  chat("chat-offer", "SCA.Sample.ChatOffer", () => offerHtml(pages()[1], photosOf(pages()[1]).length),
    {whisper: [game.user.id], flags: {[MODULE_ID]: {recapOffer: "s2"}}});
  chat("chat-approval", "SCA.Sample.ChatApproval",
    () => approvalHtml(sampleCast()[0].player, {image: photosOf(tonight())[11].src, caption: photosOf(tonight())[11].caption}),
    {whisper: [game.user.id], flags: {[MODULE_ID]: {submission: {userId: game.user.id}}}});
  chat("chat-share-image", "SCA.Sample.ChatShareImage", async () => shareMessageHtml(await shareImageUrl(tonight()), tonight().name),
    {flags: {[MODULE_ID]: {shareImage: {pageId: "s3"}}}, width: 420});
  chat("chat-selftest", "SCA.Sample.ChatSelftest",
    () => reportHtml(t("SCA.SELFTEST.Problems", {problems: SELFTEST_PROBLEMS.length, checks: SELFTEST_PROBLEMS.length + 3}), versionsText(),
      SELFTEST_PROBLEMS.map(([key, data]) => t(key, data))),
    {whisper: [game.user.id]});

  // The picture of a session
  text("share-image", "SCA.Sample.ShareImage", "SCA.Sample.Picture", async () => {
    const img = document.createElement("img");
    img.src = await shareImageUrl(tonight());
    img.alt = tonight().name;
    img.style.cssText = "display:block;width:100%;height:auto;";
    return openSampleHtml({moduleId: MODULE_ID, id: "share-image", title: t("SCA.Sample.ShareImage"), body: img, width: 560});
  });

  // Questions
  const question = (id, label, title, form, buttons, cancel) => text(id, label, "SCA.Sample.Questions",
    () => openSampleHtml({moduleId: MODULE_ID, id, title, body: () => questionHtml(form(), buttons(), cancel?.()), width: 420}));
  question("question-photo", "SCA.Sample.QuestionPhoto", t("SCA.Album.takePhoto"), photoPromptHtml, () => [t("SCA.Album.send")]);
  question("question-caption", "SCA.Sample.QuestionCaption", t("SCA.Album.editCaption"),
    () => captionPromptHtml(photosOf(tonight())[1].caption), () => [t("SCA.Album.save")]);
  question("question-remove", "SCA.Sample.QuestionRemove", t("SCA.Album.remove"),
    () => `<p>${esc(t("SCA.Album.removeConfirm"))}</p>`, () => [game.i18n.localize("Yes")], () => game.i18n.localize("No"));

  // What a photo that cannot be taken says
  text("messages", "SCA.Sample.Messages", "SCA.Sample.Texts", () => openSampleHtml({
    moduleId: MODULE_ID, id: "messages", title: t("SCA.Sample.Messages"), width: 460,
    body: () => `<ul class="sca-sample-messages">${MESSAGE_KEYS.map(key => `<li>${esc(t(key))}</li>`).join("")}</ul>`
  }));
  return entries;
}
