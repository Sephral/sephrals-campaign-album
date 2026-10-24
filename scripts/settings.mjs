/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language. World settings apply to everyone and are only shown to the GM; client
 * settings follow the user.
 */

import {MODULE_ID, t} from "./config.mjs";
import {refreshAlbum} from "./app.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * @typedef SettingDefinition
 * @property {Function} type                  Boolean, String or Number
 * @property {*} default
 * @property {Record<string, string>} [choices]
 * @property {{min: number, max: number, step: number}} [range]
 * @property {"world"|"client"} [scope="world"]
 * @property {Function} [onChange]
 */

/** Redraw what shows settings. */
const redraw = () => {
  refreshAlbum();
  ui.controls?.render({reset: true});
};

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, SettingDefinition>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: onLanguageChange, choices: {
    [FOLLOW_FOUNDRY]: "SCA.LANGUAGE.default", de: "SCA.LANGUAGE.de", en: "SCA.LANGUAGE.en"}},
  autoPhotos: {type: Boolean, default: true},
  triggerCrit: {type: Boolean, default: true},
  triggerFumble: {type: Boolean, default: false},
  triggerBoss: {type: Boolean, default: true},
  triggerVictory: {type: Boolean, default: true},
  triggerDeath: {type: Boolean, default: true},
  triggerLevelUp: {type: Boolean, default: true},
  triggerDawn: {type: Boolean, default: true},
  critsBy: {type: String, default: "players", choices: {
    players: "SCA.SETTINGS.critsBy.players", all: "SCA.SETTINGS.critsBy.all"}},
  maxAuto: {type: Number, default: 5, range: {min: 0, max: 50, step: 1}},
  cooldown: {type: Number, default: 60, range: {min: 0, max: 600, step: 10}},
  perspective: {type: String, default: "players", choices: {
    players: "SCA.SETTINGS.perspective.players", gm: "SCA.SETTINGS.perspective.gm"}},
  playerPhotos: {type: String, default: "approve", onChange: redraw, choices: {
    off: "SCA.SETTINGS.playerPhotos.off", approve: "SCA.SETTINGS.playerPhotos.approve",
    direct: "SCA.SETTINGS.playerPhotos.direct"}},
  chatCards: {type: String, default: "all", choices: {
    all: "SCA.SETTINGS.chatCards.all", gm: "SCA.SETTINGS.chatCards.gm", off: "SCA.SETTINGS.chatCards.off"}},
  sessionGap: {type: Number, default: 8, range: {min: 1, max: 72, step: 1}}
};

/* -------------------------------------------- */

/**
 * Switch the module strings when the user picks another module language, and redraw what shows them.
 * @param {string} value
 */
function onLanguageChange(value) {
  applyModuleLanguage(value).then(() => {
    // The window title is part of the frame, which a normal redraw keeps
    foundry.applications.instances.get("sca-album")?.render({window: {title: t("SCA.Title")}});
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}

/* -------------------------------------------- */

/**
 * The menu button which runs the self-test. Foundry only accepts application classes as menus; this one runs the test
 * instead of opening a window.
 */
class AlbumSelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/* -------------------------------------------- */

/**
 * Register all settings of the module and the self-test menu button.
 */
export function registerSettings() {
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SCA.SETTINGS.${key}.name`,
      hint: `SCA.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.range ? new foundry.data.fields.NumberField({...def.range, initial: def.default}) : def.type,
      choices: def.choices,
      default: def.default,
      onChange: def.onChange
    });
  }

  // The album journal and the state of the current session, written by the GM's client
  game.settings.register(MODULE_ID, "albumJournal", {scope: "world", config: false, type: String, default: "",
    onChange: () => refreshAlbum()});
  game.settings.register(MODULE_ID, "session", {scope: "world", config: false, type: Object, default: {}});

  // The newer Foundry and system versions the GM was already told about
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});

  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SCA.SELFTEST.Title",
    label: "SCA.SELFTEST.Run",
    hint: "SCA.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: AlbumSelfTestMenu,
    restricted: true
  });
}
