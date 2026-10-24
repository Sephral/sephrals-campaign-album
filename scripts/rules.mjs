/**
 * Rules of the album, without Foundry: when a session starts, when an automatic photo is allowed, how a d20 roll
 * counts and how an album page looks as HTML. Kept pure so Node can test them.
 */

/** The moments the album captures on its own, in the order of the settings. */
export const TRIGGERS = ["crit", "fumble", "boss", "victory", "death", "levelUp", "dawn"];

/** The kinds of photos: the automatic moments, a photo by the GM and a photo by a player. */
export const KINDS = [...TRIGGERS, "manual", "player"];

/**
 * Does the next photo start a new session? It does when the GM asked for one, when there is no session yet, or
 * when the last photo is older than the gap.
 * @param {{lastPhoto?: number, forceNew?: boolean, number?: number}} session
 * @param {number} now                 Real time in ms
 * @param {number} gapHours
 * @returns {boolean}
 */
export function needsNewSession(session, now, gapHours) {
  if ( !session?.number || session.forceNew ) return true;
  if ( !session.lastPhoto ) return false;
  return (now - session.lastPhoto) > (Math.max(Number(gapHours) || 0, 0) * 3600 * 1000);
}

/**
 * May the album take an automatic photo now?
 * @param {{autoCount?: number, lastAuto?: number}} session
 * @param {number} now
 * @param {{max: number, cooldown: number}} limits   max per session (0 = no limit), cooldown in seconds
 * @returns {{ok: boolean, reason?: "limit"|"cooldown"}}
 */
export function autoAllowed(session, now, {max, cooldown}) {
  if ( (max > 0) && ((session?.autoCount ?? 0) >= max) ) return {ok: false, reason: "limit"};
  if ( session?.lastAuto && ((now - session.lastAuto) < (Math.max(cooldown, 0) * 1000)) ) {
    return {ok: false, reason: "cooldown"};
  }
  return {ok: true};
}

/**
 * How many sunrises lie after one world time up to another, for days of a fixed length.
 * @param {number} from              World time in seconds
 * @param {number} to
 * @param {number} secondsPerDay
 * @param {number} sunriseAt         The world time of any sunrise
 * @returns {number}
 */
export function sunrisesBetween(from, to, secondsPerDay, sunriseAt) {
  if ( !(to > from) || !(secondsPerDay > 0) || !Number.isFinite(sunriseAt) ) return 0;
  const count = time => Math.floor((time - sunriseAt) / secondsPerDay);
  return count(to) - count(from);
}

/**
 * The natural result of the first d20 of a roll.
 * @param {{faces: number, results: {result: number, active?: boolean, discarded?: boolean}[]}[]} dice
 * @returns {{natural: number|null, max: boolean, min: boolean}}
 */
export function naturalD20(dice) {
  const die = (dice ?? []).find(d => d?.faces === 20);
  const kept = (die?.results ?? []).filter(r => (r.active !== false) && !r.discarded);
  if ( kept.length !== 1 ) return {natural: null, max: false, min: false};
  const natural = kept[0].result;
  return {natural, max: natural === 20, min: natural === 1};
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * The HTML of an album page: an introduction and the photos as figures, so the journal can be read without the
 * module too.
 * @param {object[]} photos                         Photos of the session in order
 * @param {object} text
 * @param {string} text.intro                       First paragraph
 * @param {(photo: object) => string} text.meta     The small line under a caption (date, people)
 * @param {string} text.empty                       Text for a page without photos
 * @returns {string}
 */
export function pageHtml(photos, {intro, meta, empty}) {
  const figures = (photos ?? []).map(photo => {
    const caption = photo.caption ? `<strong>${esc(photo.caption)}</strong><br>` : "";
    return `<figure class="sca-photo" data-photo-id="${esc(photo.id)}">`
      + `<img src="${esc(photo.src)}" alt="${esc(photo.caption)}" width="${Number(photo.width) || ""}" height="${Number(photo.height) || ""}">`
      + `<figcaption>${caption}<small>${esc(meta(photo))}</small></figcaption></figure>`;
  }).join("");
  return `<p class="sca-intro">${esc(intro)}</p>`
    + (figures ? `<section class="sca-page">${figures}</section>` : `<p><em>${esc(empty)}</em></p>`);
}

/**
 * A file name for a photo: time and a short random part, so names never clash.
 * @param {number} now
 * @param {string} random
 * @returns {string}
 */
export function photoFileName(now, random) {
  const d = new Date(now);
  const pad = n => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `photo-${stamp}-${String(random).replace(/[^a-z0-9]/gi, "").slice(0, 8)}.webp`;
}

/**
 * Order users for a photo of a moment: first the players of the characters in it, then the other players, the GM
 * last. Only active users who view the scene count, the GM too.
 * @param {{id: string, isGM: boolean, active: boolean, viewing: boolean}[]} users
 * @param {string[]} owners                 Ids of the users who own a character in the photo
 * @param {"players"|"gm"} perspective
 * @param {string} gmId                     The active GM
 * @returns {string[]}
 */
export function photographers(users, owners, perspective, gmId) {
  const list = users ?? [];
  const gm = list.find(u => u.id === gmId);
  const gmLast = (gm?.viewing !== false) ? [gmId] : [];
  if ( perspective === "gm" ) return gmLast;
  const ready = list.filter(u => u.active && u.viewing && !u.isGM);
  const first = ready.filter(u => owners.includes(u.id)).map(u => u.id);
  const rest = ready.filter(u => !owners.includes(u.id)).map(u => u.id);
  return [...first, ...rest, ...gmLast];
}
