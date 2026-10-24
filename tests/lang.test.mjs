import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {KINDS, TRIGGERS} from "../scripts/rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * All keys of a nested translation object, dotted.
 * @param {object} object
 * @param {string} [prefix]
 * @returns {string[]}
 */
function keysOf(object, prefix="") {
  return Object.entries(object).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return (value && (typeof value === "object")) ? keysOf(value, full) : [full];
  });
}

/**
 * All files of a folder, recursively.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function files(dir) {
  const list = await readdir(dir, {withFileTypes: true});
  return (await Promise.all(list.map(e => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
}

const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const de = JSON.parse(await readFile(path.join(root, "lang/de.json"), "utf8"));
const enKeys = new Set(keysOf(en));

test("English and German have the same keys", () => {
  assert.deepEqual([...keysOf(de)].sort(), [...enKeys].sort());
});

test("no key is both a text and a group", () => {
  for ( const key of enKeys ) assert.ok(![...enKeys].some(other => other.startsWith(`${key}.`)), key);
});

test("placeholders match between English and German", () => {
  const get = (obj, key) => key.split(".").reduce((o, k) => o?.[k], obj);
  const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for ( const key of enKeys ) assert.deepEqual(holes(get(de, key)), holes(get(en, key)), key);
});

test("every key used by scripts and templates exists", async () => {
  const sources = [...await files(path.join(root, "scripts")), ...await files(path.join(root, "templates"))];
  const used = new Set();
  for ( const file of sources ) {
    const text = await readFile(file, "utf8");
    for ( const match of text.matchAll(/["'`](SCA\.[A-Za-z0-9_.]+)["'`]/g) ) used.add(match[1]);
  }
  for ( const key of Object.keys(en.SCA.SETTINGS) ) {
    used.add(`SCA.SETTINGS.${key}.name`);
    used.add(`SCA.SETTINGS.${key}.hint`);
  }
  // Keys built from parts
  for ( const kind of KINDS ) used.add(`SCA.Kind.${kind}`);
  for ( const kind of ["crit", "fumble"] ) used.add(`SCA.Caption.${kind}Target`);
  for ( const reason of ["off", "limit", "cooldown"] ) used.add(`SCA.Skip.${reason}`);
  for ( const key of used ) if ( key.endsWith(".") ) used.delete(key);
  const missing = [...used].filter(key => !enKeys.has(key) && ![...enKeys].some(k => k.startsWith(`${key}.`)));
  assert.deepEqual(missing, []);
});

test("every automatic trigger has a setting and a caption", () => {
  for ( const trigger of TRIGGERS ) {
    const key = `trigger${trigger[0].toUpperCase()}${trigger.slice(1)}`;
    assert.ok(en.SCA.SETTINGS[key], key);
    assert.equal(typeof en.SCA.Caption[trigger], "string", trigger);
  }
});
