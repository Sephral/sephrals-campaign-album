/**
 * A session as one picture to share: a contact sheet with the title of the world, the session and its date, up to nine
 * photos in a grid with their captions and a badge for the kind of moment. The picture is drawn on a canvas by this
 * file alone, so it looks the same on every screen and in every theme. The layout is pure (the only outside help is
 * measure(text, font)), so Node can test it; the canvas part at the end needs a browser.
 */

export const IMAGE_WIDTH = 1080;
export const IMAGE_SCALE = 2;
export const MAX_PHOTOS = 9;
const PAD = 48;
const GAP = 18;
/** Photo area of a tile: width times this. */
const PHOTO_RATIO = 0.625;
const CAPTION_LINES = 2;
const CAPTION_SIZE = 22;
const CAPTION_LINE_HEIGHT = 29;
const BADGE_SIZE = 16;
/** A photo takes at most this long to load before it becomes a placeholder. */
const LOAD_TIMEOUT_MS = 15000;

export const THEMES = Object.freeze({
  dark: {bg: "#17171d", card: "#23232c", text: "#f3efe4", muted: "#a8a5b2", accent: "#e3a93f", line: "#35353f", band: "#e3a93f",
    placeholder: "#2e2e38"},
  light: {bg: "#f5f0e4", card: "#ffffff", text: "#241f1d", muted: "#6a625b", accent: "#9a2a1d", line: "#dfd5c1", band: "#9a2a1d",
    placeholder: "#e9e1cf"}
});

/** Badge colors per kind of moment, with the text color on them. */
export const BADGES = Object.freeze({
  crit: {color: "#d9a21b", text: "#1b1608"},
  fumble: {color: "#7a7f8c", text: "#ffffff"},
  boss: {color: "#b3261e", text: "#ffffff"},
  victory: {color: "#2f8f4e", text: "#ffffff"},
  down: {color: "#d9731b", text: "#ffffff"},
  death: {color: "#5b3a7a", text: "#ffffff"},
  levelUp: {color: "#2b6fb8", text: "#ffffff"},
  dawn: {color: "#e0883a", text: "#ffffff"},
  manual: {color: "#4a4a58", text: "#ffffff"},
  player: {color: "#4a4a58", text: "#ffffff"}
});

/** How much a kind deserves a place when a session has more photos than the picture holds. */
const WEIGHT = {boss: 9, death: 8, victory: 8, crit: 7, levelUp: 6, down: 5, dawn: 4, manual: 3, player: 3, fumble: 2};

/**
 * Up to max photos for the picture: when a session has more, the big moments win, then the earlier photos. The chosen
 * ones stay in the order they were taken.
 * @param {object[]} photos
 * @param {number} [max]
 * @returns {object[]}
 */
export function pickPhotos(photos, max=MAX_PHOTOS) {
  const list = [...(photos ?? [])];
  if ( list.length <= max ) return list;
  return list.map((photo, index) => ({photo, index}))
    .sort((a, b) => ((WEIGHT[b.photo.kind] ?? 0) - (WEIGHT[a.photo.kind] ?? 0)) || (a.index - b.index))
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map(entry => entry.photo);
}

/**
 * Columns and rows for a number of photos.
 * @param {number} count
 * @returns {{cols: number, rows: number}}
 */
export function gridFor(count) {
  const n = Math.max(0, Math.floor(count));
  if ( n <= 1 ) return {cols: 1, rows: n};
  const cols = (n === 2 || n === 4) ? 2 : 3;
  return {cols, rows: Math.ceil(n / cols)};
}

/**
 * The words of the picture.
 * @param {object} data
 * @param {string} data.title        The world or campaign
 * @param {string} data.label        "Session 3"
 * @param {string} data.subtitle     Date and number of photos
 * @param {{caption: string, kind: string, kindLabel: string, src: string}[]} data.photos   Already limited and in order
 * @param {string} [data.more]       "+4 more photos in the album"
 * @param {string} [data.footer]     The credit line, empty for none
 * @returns {object}
 */
export function shareModel({title, label, subtitle, photos, more="", footer=""}) {
  return {
    title: String(title ?? ""),
    label: String(label ?? ""),
    subtitle: String(subtitle ?? ""),
    photos: (photos ?? []).map(photo => ({caption: String(photo.caption ?? ""), kind: photo.kind ?? "manual",
      kindLabel: String(photo.kindLabel ?? ""), src: photo.src ?? ""})),
    more: String(more ?? ""),
    footer: String(footer ?? "")
  };
}

/** Breaks a text into lines no wider than maxWidth. A word wider than a line is cut by characters. */
export function wrapText(measure, text, maxWidth) {
  const lines = [];
  let current = "";
  const push = () => {
    if ( current ) lines.push(current);
    current = "";
  };
  for ( const word of String(text ?? "").split(/\s+/).filter(Boolean) ) {
    const attempt = current ? `${current} ${word}` : word;
    if ( measure(attempt) <= maxWidth ) {
      current = attempt;
      continue;
    }
    push();
    if ( measure(word) <= maxWidth ) {
      current = word;
      continue;
    }
    for ( const char of Array.from(word) ) {
      if ( current && (measure(current + char) > maxWidth) ) push();
      current += char;
    }
  }
  push();
  return lines;
}

/** Shortens a line with an ellipsis until it fits. */
function ellipsize(measure, line, maxWidth) {
  let value = line;
  while ( (value.length > 1) && (measure(`${value}…`) > maxWidth) ) value = value.slice(0, -1);
  return `${value}…`;
}

/** The lines of a text, at most maxLines, the last one shortened when text was cut. */
function limitedLines(measure, text, maxWidth, maxLines) {
  let lines = wrapText(measure, text, maxWidth);
  if ( lines.length > maxLines ) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsize(measure, lines[maxLines - 1], maxWidth);
  }
  return lines;
}

/**
 * Positions everything.
 * @param {object} model          see shareModel
 * @param {object} options
 * @param {"dark"|"light"} [options.theme]
 * @param {(text: string, font: string) => number} options.measure
 * @param {string} [options.family]
 * @returns {{width: number, height: number, theme: object, tiles: number, ops: object[]}} drawing operations in picture pixels
 */
export function layoutShareImage(model, {theme="dark", measure, family="sans-serif"}={}) {
  const colors = THEMES[theme] ?? THEMES.dark;
  const font = (size, weight=400) => `${weight} ${size}px ${family}`;
  const inner = IMAGE_WIDTH - (2 * PAD);
  const rects = [];
  const images = [];
  const badges = [];
  const texts = [];
  const text = (value, x, baseline, f, color, align="left") => texts.push({type: "text", text: value, x, y: baseline, font: f,
    color, align});
  let y = 14 + 40;

  rects.push({type: "rect", x: 0, y: 0, w: IMAGE_WIDTH, h: 14, color: colors.band, radius: 0});
  if ( model.label ) {
    text(model.label.toUpperCase(), PAD, y + 16, font(22, 700), colors.accent);
    y += 36;
  }
  const titleFont = font(52, 700);
  const titleLines = limitedLines(t => measure(t, titleFont), model.title, inner, 2);
  titleLines.forEach((line, i) => text(line, PAD, y + 48 + (i * 60), titleFont, colors.text));
  y += titleLines.length * 60;
  if ( model.subtitle ) {
    y += 4;
    const f = font(24, 400);
    const [line] = limitedLines(t => measure(t, f), model.subtitle, inner, 1);
    text(line ?? "", PAD, y + 26, f, colors.muted);
    y += 34;
  }
  y += 28;

  // The grid
  const count = model.photos.length;
  const {cols, rows} = gridFor(count);
  if ( count ) {
    const tileW = Math.floor((inner - (GAP * (cols - 1))) / cols);
    const photoH = Math.round(tileW * PHOTO_RATIO);
    const captionSize = (cols === 1) ? 28 : CAPTION_SIZE;
    const lineHeight = (cols === 1) ? 36 : CAPTION_LINE_HEIGHT;
    const captionH = (lineHeight * CAPTION_LINES) + 22;
    const tileH = photoH + captionH;
    model.photos.forEach((photo, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = PAD + (col * (tileW + GAP));
      const top = y + (row * (tileH + GAP));
      rects.push({type: "rect", x, y: top, w: tileW, h: tileH, color: colors.card, radius: 16, stroke: colors.line});
      images.push({type: "image", index, x: x + 8, y: top + 8, w: tileW - 16, h: photoH - 8, radius: 10,
        placeholder: colors.placeholder, cross: colors.line});
      if ( photo.kindLabel ) {
        const badge = BADGES[photo.kind] ?? BADGES.manual;
        const bf = font(BADGE_SIZE, 700);
        const label = limitedLines(t => measure(t, bf), photo.kindLabel.toUpperCase(), tileW - 16 - 32, 1)[0] ?? "";
        const bw = Math.ceil(measure(label, bf)) + 20;
        badges.push({type: "rect", x: x + 18, y: top + 18, w: bw, h: 28, color: badge.color, radius: 14});
        text(label, x + 18 + (bw / 2), top + 18 + 20, bf, badge.text, "center");
      }
      const shown = photo.caption || photo.kindLabel;
      const f = font(captionSize, 600);
      const lines = limitedLines(t => measure(t, f), shown, tileW - 28, CAPTION_LINES);
      lines.forEach((line, i) => text(line, x + 14, top + photoH + 12 + Math.round(captionSize * 1.05) + (i * lineHeight), f,
        colors.text));
    });
    y += (rows * tileH) + ((rows - 1) * GAP) + 22;
  }

  if ( model.more ) {
    const f = font(22, 500);
    const [line] = limitedLines(t => measure(t, f), model.more, inner, 1);
    text(line ?? "", PAD, y + 20, f, colors.muted);
    y += 38;
  }

  // Footer
  if ( model.footer ) {
    rects.push({type: "rect", x: PAD, y: y + 6, w: inner, h: 2, color: colors.line, radius: 1});
    y += 36;
    text(model.footer, IMAGE_WIDTH - PAD, y + 12, font(21, 600), colors.muted, "right");
    y += 40;
  } else y += 20;
  y += 24;

  const height = Math.max(320, Math.ceil(y));
  return {
    width: IMAGE_WIDTH,
    height,
    theme: colors,
    tiles: count,
    ops: [{type: "rect", x: 0, y: 0, w: IMAGE_WIDTH, h: height, color: colors.bg, radius: 0}, ...rects, ...images, ...badges, ...texts]
  };
}

/**
 * A file name for the picture: world title, session number and day, letters and digits only.
 * @param {string} title
 * @param {number|string} number
 * @param {string} extension
 * @param {Date} [now]
 * @returns {string}
 */
export function shareFileName(title, number, extension="png", now=new Date()) {
  const slug = String(title ?? "album").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "album";
  const session = Number(number) ? `-session-${Number(number)}` : "";
  return `${slug}${session}-${now.toISOString().slice(0, 10)}.${extension}`;
}

/* -------------------------------------------- */
/*  Painting (needs a canvas)                   */
/* -------------------------------------------- */

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

/** Draws a picture so that it fills the box and is cut at the edges (like CSS object-fit: cover). */
function drawCover(context, bitmap, op) {
  const sw = bitmap.width;
  const sh = bitmap.height;
  if ( !sw || !sh ) return false;
  const scale = Math.max(op.w / sw, op.h / sh);
  const cw = op.w / scale;
  const ch = op.h / scale;
  context.drawImage(bitmap, (sw - cw) / 2, (sh - ch) / 2, cw, ch, op.x, op.y, op.w, op.h);
  return true;
}

/**
 * Draws a layout on a 2d context (any canvas): scale the context first.
 * @param {CanvasRenderingContext2D} context
 * @param {object} layout
 * @param {(ImageBitmap|null)[]} [images]   The loaded photos by tile index. A missing one is drawn as a placeholder.
 */
export function paintShareImage(context, layout, images=[]) {
  for ( const op of layout.ops ) {
    if ( op.type === "rect" ) {
      context.fillStyle = op.color;
      if ( op.radius ) {
        roundRect(context, op.x, op.y, op.w, op.h, op.radius);
        context.fill();
        if ( op.stroke ) {
          context.strokeStyle = op.stroke;
          context.lineWidth = 2;
          roundRect(context, op.x + 1, op.y + 1, op.w - 2, op.h - 2, op.radius);
          context.stroke();
        }
      } else context.fillRect(op.x, op.y, op.w, op.h);
    } else if ( op.type === "image" ) {
      context.save();
      roundRect(context, op.x, op.y, op.w, op.h, op.radius);
      context.clip();
      let drawn = false;
      const bitmap = images[op.index];
      if ( bitmap ) {
        try {
          drawn = drawCover(context, bitmap, op);
        } catch(err) {
          console.debug("sephrals-campaign-album | A photo could not be drawn", err);
        }
      }
      if ( !drawn ) {
        context.fillStyle = op.placeholder;
        context.fillRect(op.x, op.y, op.w, op.h);
        context.strokeStyle = op.cross;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(op.x + (op.w * 0.4), op.y + (op.h * 0.35));
        context.lineTo(op.x + (op.w * 0.6), op.y + (op.h * 0.65));
        context.moveTo(op.x + (op.w * 0.6), op.y + (op.h * 0.35));
        context.lineTo(op.x + (op.w * 0.4), op.y + (op.h * 0.65));
        context.stroke();
      }
      context.restore();
    } else if ( op.type === "text" ) {
      context.font = op.font;
      context.fillStyle = op.color;
      context.textAlign = op.align;
      context.textBaseline = "alphabetic";
      context.fillText(op.text, op.x, op.y);
    }
  }
}

/** "light" or "dark", as Foundry shows its interface (the body class, then the user's setting, then the browser). */
export function foundryColorScheme() {
  try {
    const classes = globalThis.document?.body?.classList;
    if ( classes?.contains("theme-light") ) return "light";
    if ( classes?.contains("theme-dark") ) return "dark";
    const configured = globalThis.game?.settings?.get?.("core", "uiConfig")?.colorScheme?.interface;
    if ( (configured === "light") || (configured === "dark") ) return configured;
    if ( globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches ) return "light";
  } catch {
    // The default below.
  }
  return "dark";
}

function fontFamily() {
  const computed = globalThis.document?.body ? globalThis.getComputedStyle?.(globalThis.document.body)?.fontFamily : "";
  return `${computed ? `${computed}, ` : ""}Signika, "Segoe UI", sans-serif`;
}

/** The address of a photo file as the browser needs it (module files and uploads are relative to the Foundry route). */
function photoUrl(src) {
  if ( /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) || src.startsWith("/") ) return src;
  return globalThis.foundry?.utils?.getRoute?.(src) ?? `/${src}`;
}

/**
 * Loads the photos as bitmaps. A photo that cannot be loaded (missing file, another origin without CORS, too slow)
 * gives null and the picture shows a placeholder for it; nothing else fails.
 * @param {string[]} sources
 * @returns {Promise<(ImageBitmap|null)[]>}
 */
export async function loadPhotos(sources) {
  return Promise.all(sources.map(async src => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
      const response = await fetch(photoUrl(String(src)), {signal: controller.signal});
      if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
      return await createImageBitmap(await response.blob());
    } catch(err) {
      console.warn(`sephrals-campaign-album | A photo is missing in the picture: ${src}`, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }));
}

/**
 * The picture as a blob. Needs a browser (canvas); the layout itself is tested apart.
 * @param {object} model                  see shareModel
 * @param {object} [options]
 * @param {"png"|"webp"} [options.format]
 * @param {"dark"|"light"} [options.theme]
 * @returns {Promise<{blob: Blob, width: number, height: number, missing: number}>}
 */
export async function renderShareImage(model, {format="png", theme=foundryColorScheme()}={}) {
  const family = fontFamily();
  try {
    await Promise.all(["400", "500", "600", "700"].map(weight => globalThis.document.fonts.load(`${weight} 24px ${family}`)));
  } catch {
    // A missing font only changes the look.
  }
  const photos = await loadPhotos(model.photos.map(photo => photo.src));
  const canvas = globalThis.document.createElement("canvas");
  const probe = canvas.getContext("2d");
  const layout = layoutShareImage(model, {theme, family, measure: (value, font) => {
    probe.font = font;
    return probe.measureText(value).width;
  }});
  canvas.width = layout.width * IMAGE_SCALE;
  canvas.height = layout.height * IMAGE_SCALE;
  const context = canvas.getContext("2d");
  context.scale(IMAGE_SCALE, IMAGE_SCALE);
  paintShareImage(context, layout, photos);
  for ( const bitmap of photos ) bitmap?.close?.();
  const type = (format === "webp") ? "image/webp" : "image/png";
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
  if ( !blob ) throw new Error("The canvas gave no picture");
  return {blob, width: canvas.width, height: canvas.height, missing: photos.filter(photo => !photo).length};
}
