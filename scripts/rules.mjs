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
 * module too. The combat totals of the night follow at the end.
 * @param {object[]} photos                         Photos of the session in order
 * @param {object} text
 * @param {string} text.intro                       First paragraph
 * @param {(photo: object) => string} text.meta     The small line under a caption (date, people)
 * @param {string} text.empty                       Text for a page without photos
 * @param {string} [text.combat]                    The combat totals section (see combatHtml)
 * @returns {string}
 */
export function pageHtml(photos, {intro, meta, empty, combat=""}) {
  const figures = (photos ?? []).map(photo => {
    const caption = photo.caption ? `<strong>${esc(photo.caption)}</strong><br>` : "";
    return `<figure class="sca-photo" data-photo-id="${esc(photo.id)}">`
      + `<img src="${esc(photo.src)}" alt="${esc(photo.caption)}" width="${Number(photo.width) || ""}" height="${Number(photo.height) || ""}">`
      + `<figcaption>${caption}<small>${esc(meta(photo))}</small></figcaption></figure>`;
  }).join("");
  return `<p class="sca-intro">${esc(intro)}</p>`
    + (figures ? `<section class="sca-page">${figures}</section>` : `<p><em>${esc(empty)}</em></p>`)
    + (combat ?? "");
}

/* -------------------------------------------- */
/*  Combat totals (Sephral's Combat Log & Stats) */
/* -------------------------------------------- */

/** The combat totals section in the text of a page. It holds no other section. */
const COMBAT_SECTION = /<section class="sca-combat"[^>]*>[\s\S]*?<\/section>/;

/**
 * What a page keeps of the totals of its game night, as the API of Combat Log & Stats returns them (the numbers players
 * may see). null without a fight.
 * @param {object|null} totals
 * @returns {{fights: number, rounds: number, damage: number, healing: number, moraleDamage: number,
 *   enemiesDefeated: number, partyDowned: number, criticalHits: number, mvp: {names: string[], value: number}|null}|null}
 */
export function combatSnapshot(totals) {
  if ( !(Number(totals?.fights) > 0) ) return null;
  const n = value => Math.max(Number(value) || 0, 0);
  const mvp = (totals.awards ?? []).find(award => award?.key === "mvp");
  return {
    fights: n(totals.fights), rounds: n(totals.rounds), damage: n(totals.damage), healing: n(totals.healing),
    moraleDamage: n(totals.moraleDamage), enemiesDefeated: n(totals.enemiesDefeated), partyDowned: n(totals.partyDowned),
    criticalHits: n(totals.criticalHits),
    mvp: mvp?.names?.length ? {names: mvp.names.map(String), value: n(mvp.value)} : null
  };
}

/**
 * The combat totals of a page as lines of text, in the order shown. Only what reads well on a page for the players:
 * fights and rounds, the heroes' damage and healing, foes defeated, heroes down, critical hits and the hero of the night.
 * @param {object|null} combat                                 See combatSnapshot
 * @param {object} format
 * @param {(key: string, data?: object) => string} format.t     Localize
 * @param {(value: number) => string} format.num                A number for the reader
 * @param {(names: string[]) => string} format.join             "Aria and Bram"
 * @returns {string[]}
 */
export function combatLines(combat, {t, num, join}) {
  if ( !(combat?.fights > 0) ) return [];
  const count = (key, value) => t(`SCA.Combat.${key}${Number(value) === 1 ? "One" : "Other"}`, {count: num(value)});
  const lines = [t("SCA.Combat.overview", {fights: count("fights", combat.fights), rounds: count("rounds", combat.rounds)})];
  if ( (combat.damage > 0) && (combat.healing > 0) ) {
    lines.push(t("SCA.Combat.damageHealing", {damage: num(combat.damage), healing: num(combat.healing)}));
  }
  else if ( combat.damage > 0 ) lines.push(t("SCA.Combat.damage", {damage: num(combat.damage)}));
  else if ( combat.healing > 0 ) lines.push(t("SCA.Combat.healing", {healing: num(combat.healing)}));
  if ( combat.moraleDamage > 0 ) lines.push(t("SCA.Combat.morale", {morale: num(combat.moraleDamage)}));
  if ( combat.enemiesDefeated > 0 ) lines.push(count("defeated", combat.enemiesDefeated));
  if ( combat.partyDowned > 0 ) lines.push(count("downed", combat.partyDowned));
  if ( combat.criticalHits > 0 ) lines.push(count("crits", combat.criticalHits));
  if ( combat.mvp?.names?.length ) lines.push(t("SCA.Combat.mvp", {names: join(combat.mvp.names), amount: num(combat.mvp.value)}));
  return lines;
}

/**
 * The combat totals section of a page, empty without lines.
 * @param {string} title
 * @param {string[]} lines
 * @returns {string}
 */
export function combatHtml(title, lines) {
  if ( !lines?.length ) return "";
  return `<section class="sca-combat"><h3>${esc(title)}</h3><ul>${lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul></section>`;
}

/**
 * The text of a page with its combat totals section replaced, added at the end or taken out. Everything else stays as
 * it is, also what the GM wrote into the page.
 * @param {string} content
 * @param {string} section    The new section, empty to take it out
 * @returns {string}
 */
export function withCombatSection(content, section) {
  const text = String(content ?? "");
  if ( COMBAT_SECTION.test(text) ) return text.replace(COMBAT_SECTION, () => section ?? "");
  return section ? `${text}${section}` : text;
}

/**
 * Is a time near the span of a page, close enough that a fight then may belong to its game night?
 * @param {{from: number, to: number}} span
 * @param {number} time
 * @param {number} marginMs
 * @returns {boolean}
 */
export function nearSpan(span, time, marginMs) {
  return Number.isFinite(time) && (time >= (span.from - marginMs)) && (time <= (span.to + marginMs));
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
