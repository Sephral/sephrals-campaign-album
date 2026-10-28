import assert from "node:assert/strict";
import test from "node:test";

// settings.mjs and the modules it imports touch these Foundry APIs at import time
globalThis.foundry = {
  utils: {debounce: fn => fn, deepClone: value => structuredClone(value)},
  applications: {api: {ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}, DialogV2: class {}}},
  data: {fields: {NumberField: class {
    constructor(options) {
      Object.assign(this, options);
    }
  }}}
};
globalThis.game = {system: {id: "dnd5e"}};

const {MODULE_ID} = await import("../scripts/config.mjs");
const {FOLLOW_FOUNDRY} = await import("../scripts/language.mjs");
const {TRIGGERS} = await import("../scripts/rules.mjs");
const {SETTINGS, registerSettings} = await import("../scripts/settings.mjs");

/**
 * Register the settings with a stub of game.settings which records every call.
 * @returns {{settings: Map<string, object>, menus: Map<string, object>}}
 */
function register() {
  const settings = new Map();
  const menus = new Map();
  globalThis.game = {system: {id: "dnd5e"}, settings: {
    register: (module, key, data) => settings.set(`${module}.${key}`, data),
    registerMenu: (module, key, data) => menus.set(`${module}.${key}`, data)
  }};
  registerSettings();
  const strip = map => new Map([...map].map(([key, data]) => [key.replace(`${MODULE_ID}.`, ""), data]));
  return {settings: strip(settings), menus: strip(menus)};
}

test("the module language comes first and follows Foundry by default", () => {
  const {settings} = register();
  assert.equal([...settings.keys()][0], "uiLanguage");
  assert.equal(settings.get("uiLanguage").scope, "client");
  assert.equal(settings.get("uiLanguage").default, FOLLOW_FOUNDRY);
});

test("every visible setting has a localized name and hint, the storage settings are hidden", () => {
  const {settings} = register();
  for ( const key of Object.keys(SETTINGS) ) {
    assert.equal(settings.get(key).name, `SCA.SETTINGS.${key}.name`);
    assert.equal(settings.get(key).hint, `SCA.SETTINGS.${key}.hint`);
    assert.equal(settings.get(key).config, true);
  }
  for ( const key of ["albumJournal", "session", "acknowledgedVersions"] ) assert.equal(settings.get(key).config, false);
});

test("defaults: crits, bosses, victories, farewells and level ups on, fumbles off, five per session", () => {
  const {settings} = register();
  for ( const trigger of TRIGGERS ) {
    const key = `trigger${trigger[0].toUpperCase()}${trigger.slice(1)}`;
    assert.equal(settings.get(key).default, trigger !== "fumble", key);
  }
  assert.equal(settings.get("maxAuto").default, 5);
  assert.equal(settings.get("perspective").default, "players");
  assert.equal(settings.get("playerPhotos").default, "approve");
});

test("the self test and the debug file are GM only menus", () => {
  const {menus} = register();
  assert.equal(menus.get("selfTest").restricted, true);
  assert.equal(menus.get("debugFile").restricted, true);
  assert.equal(menus.get("debugFile").label, "SCA.DEBUG.Save");
});
