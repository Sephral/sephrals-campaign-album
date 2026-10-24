/**
 * Self-test: checks the album journal, the image folder, taking a photo on this client and the system support.
 * Meant to be run after an update of Foundry or the game system; the GM also gets a notice once when a newer version
 * than the verified one is installed.
 */

import {MODULE_ID, TESTED_VERSIONS, esc, t} from "./config.mjs";
import {albumJournal, ensureDirectory, storageRoot} from "./album.mjs";
import {capture} from "./capture.mjs";
import {hasSystemSupport, system} from "./systems.mjs";

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const journal = albumJournal();
  check(!!journal, "SCA.SELFTEST.NoJournal");
  check(!journal || ((journal.ownership?.default ?? 0) >= levels.OBSERVER), "SCA.SELFTEST.JournalOwnership");
  check(!journal || ((journal.ownership?.default ?? 0) < levels.OWNER), "SCA.SELFTEST.JournalOwner");
  check(!!game.users.activeGM?.can("FILES_UPLOAD"), "SCA.SELFTEST.Upload");
  let folder = true;
  try {
    await ensureDirectory(storageRoot());
  } catch {
    folder = false;
  }
  check(folder, "SCA.SELFTEST.Folder", {folder: storageRoot()});
  let photo = false;
  try {
    photo = String(capture(null, {pan: false}).image).startsWith("data:image/");
  } catch {}
  check(photo, "SCA.SELFTEST.Capture");
  check(typeof game.socket?.emit === "function", "SCA.SELFTEST.Socket");
  check(hasSystemSupport(), "SCA.SELFTEST.Generic", {system: game.system.title});
  check(game.actors.some(a => system().isCharacter(a) && a.hasPlayerOwner), "SCA.SELFTEST.NoCharacters");
  return {problems, checks};
}

/**
 * The installed versions next to the tested ones.
 * @returns {string}
 */
function versionLine() {
  const current = {core: game.version, [game.system.id]: game.system.version};
  return Object.entries(TESTED_VERSIONS).filter(([id]) => id in current)
    .map(([id, tested]) => t("SCA.SELFTEST.Version", {id, current: current[id] ?? "–", tested}))
    .join(", ");
}

/**
 * Run the self-test and report the result as a notification and a whispered chat message.
 * @param {object} [options]
 * @param {boolean} [options.report=true]   Post the chat report
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report=true}={}) {
  const {problems, checks} = await checkAll();
  const versions = versionLine();
  const summary = problems.length ? t("SCA.SELFTEST.Problems", {problems: problems.length, checks})
    : t("SCA.SELFTEST.Passed", {checks, system: system().id});
  console.group(`${MODULE_ID} | Self-test`);
  console.log(versions);
  if ( problems.length ) console.warn("Problems:", problems);
  console.groupEnd();
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    let content = `<h3>${esc(t("SCA.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id],
      speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry or the system is newer than the versions the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  const current = {core: game.version, [game.system.id]: game.system.version};
  const newer = Object.entries(current)
    .filter(([id, version]) => TESTED_VERSIONS[id] && version && foundry.utils.isNewerVersion(version, TESTED_VERSIONS[id]))
    .map(([id, version]) => `${id} ${version}`);
  if ( !newer.length ) return;
  const signature = newer.join(",");
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("SCA.SELFTEST.NewVersions", {versions: newer.join(", ")}), {permanent: true});
}
