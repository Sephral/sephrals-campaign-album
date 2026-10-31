import {MODULE_ID, TESTED_VERSIONS, flag, setting, t} from "./config.mjs";
import {COMBAT_LOG_HOOK, albumJournal, allPhotos, ensureAlbum, isAlbumPage, onCombatLogSaved,
  refreshCombatTotalsOnReady} from "./album.mjs";
import {openAlbum, refreshAlbum, takePhotoAsUser} from "./app.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {registerHubModule} from "./hub.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {registerSocket} from "./net.mjs";
import {answerSubmission, registerPhotographer, takePhoto} from "./photographer.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {registerSettings} from "./settings.mjs";
import {system} from "./systems.mjs";
import {registerTriggers, rememberState} from "./triggers.mjs";
import {registerUsage} from "./usage.mjs";

/** The names of the tools in the token controls. */
const TOOLS = {album: "sca-album", photo: "sca-photo"};

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  registerSettings();
  registerUsage(MODULE_ID, {
    features: ["autoPhoto", "manualPhoto", "playerPhoto", "slideshow", "newSession", "captionEdit", "photoRemove"],
    settings: ["autoPhotos", "perspective", "playerPhotos"]
  });
  registerTriggers();
  registerDebug();

  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("renderJournalDirectory", onRenderJournalDirectory);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  // The combat totals of a game night follow the fights Sephral's Combat Log & Stats saves
  Hooks.on(COMBAT_LOG_HOOK, onCombatLogSaved);
  for ( const kind of ["create", "update", "delete"] ) {
    Hooks.on(`${kind}JournalEntryPage`, page => {
      if ( isAlbumPage(page) || (page.parent?.id === setting("albumJournal")) ) refreshAlbum();
    });
  }

  game.modules.get(MODULE_ID).api = {
    /** Open the album, optionally at a photo id. */
    open: openAlbum,
    /** Take a photo (active GM): {kind, tokens, frame, caption, actors}. */
    takePhoto,
    /** Every photo of the album in order. */
    photos: () => allPhotos().map(({page, photo}) => ({...photo, pageId: page.id, session: page.name})),
    /** The album journal. */
    journal: albumJournal,
    /** The rules of the running system. */
    system,
    /** Check the album, the image folder and taking photos (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM): about one chat message, or without an id the latest picture. */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(game.settings.get(MODULE_ID, "uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  registerSocket();
  registerPhotographer();
  await ensureAlbum();
  if ( game.user.isActiveGM ) rememberState();
  refreshCombatTotalsOnReady();
  noticeNewVersions();
});

/* -------------------------------------------- */

/**
 * Hook "getSceneControlButtons": the album and the camera in the token controls.
 * @param {Record<string, object>|object[]} controls
 */
function onGetSceneControlButtons(controls) {
  const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === "token") : null);
  if ( !tokens ) return;
  const tools = [
    {name: TOOLS.album, title: "SCA.Title", icon: "fa-solid fa-images", button: true, visible: true,
      onChange: () => openAlbum()},
    {name: TOOLS.photo, title: "SCA.Album.takePhoto", icon: "fa-solid fa-camera", button: true,
      visible: game.user.isGM || (setting("playerPhotos") !== "off"),
      onChange: () => takePhotoAsUser()}
  ];
  for ( const tool of tools ) {
    if ( Array.isArray(tokens.tools) ) tokens.tools.push({...tool, onClick: tool.onChange});
    else {
      tool.order = Object.keys(tokens.tools ?? {}).length;
      tokens.tools[tool.name] = tool;
    }
  }
}

/**
 * Hook "renderJournalDirectory": a button above the journal list.
 * @param {Application} app
 * @param {HTMLElement} html
 */
function onRenderJournalDirectory(app, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  const actions = element?.querySelector(".header-actions");
  if ( !actions || actions.querySelector(".sca-open") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sca-open";
  button.innerHTML = `<i class="fa-solid fa-images" inert></i> <span>${t("SCA.Title")}</span>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    openAlbum();
  });
  actions.append(button);
}

/**
 * Hook "renderChatMessageHTML": the button of a photo card, and the answer buttons of a photo a player sent.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function onRenderChatMessage(message, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  if ( !element ) return;
  for ( const button of element.querySelectorAll("button[data-sca-open]") ) {
    button.addEventListener("click", event => {
      event.preventDefault();
      openAlbum({photoId: button.dataset.scaOpen});
    });
  }
  if ( !flag(message, "submission") ) return;
  const box = element.querySelector(".sca-card-buttons");
  if ( !box ) return;
  if ( !game.user.isGM ) return box.remove();
  for ( const button of box.querySelectorAll("button[data-sca-answer]") ) {
    button.addEventListener("click", async event => {
      event.preventDefault();
      for ( const b of box.querySelectorAll("button") ) b.disabled = true;
      try {
        await answerSubmission(message, button.dataset.scaAnswer === "yes");
      } catch(err) {
        console.error(`${MODULE_ID} |`, err);
        ui.notifications.warn(t("SCA.Error.write"));
        for ( const b of box.querySelectorAll("button") ) b.disabled = false;
      }
    });
  }
}
