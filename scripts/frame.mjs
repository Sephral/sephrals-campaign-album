/**
 * Geometry of a photo, without Foundry: which part of the scene goes into the picture, where that part lies on the
 * screen and how large the image becomes. Rectangles are {x, y, width, height}.
 */

/** Width to height of every photo in the album. */
export const ASPECT = 16 / 10;

/**
 * Limit a number to a range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * The smallest rectangle around some rectangles.
 * @param {object[]} rects
 * @returns {object|null}
 */
export function unionRect(rects) {
  const list = (rects ?? []).filter(r => r && Number.isFinite(r.x) && Number.isFinite(r.y) && (r.width >= 0) && (r.height >= 0));
  if ( !list.length ) return null;
  const x = Math.min(...list.map(r => r.x));
  const y = Math.min(...list.map(r => r.y));
  const right = Math.max(...list.map(r => r.x + r.width));
  const bottom = Math.max(...list.map(r => r.y + r.height));
  return {x, y, width: right - x, height: bottom - y};
}

/**
 * The part of the scene a photo shows around some tokens: their bounds with some room around them, at least a few
 * grid squares wide, widened to the album's aspect ratio and centered on the tokens.
 * @param {object[]} rects                 Bounds of the tokens in scene coordinates
 * @param {object} [options]
 * @param {number} [options.grid=100]      Size of a grid square in pixels
 * @param {number} [options.padding=2]     Room around the tokens in grid squares
 * @param {number} [options.minWidth=10]   Smallest width in grid squares
 * @param {number} [options.aspect]        Width to height
 * @returns {object|null}
 */
export function photoFrame(rects, {grid=100, padding=2, minWidth=10, aspect=ASPECT}={}) {
  const u = unionRect(rects);
  if ( !u ) return null;
  const pad = Math.max(padding * grid, 0.25 * Math.max(u.width, u.height));
  let width = Math.max(u.width + (2 * pad), minWidth * grid);
  let height = u.height + (2 * pad);
  if ( (width / height) < aspect ) width = height * aspect;
  else height = width / aspect;
  const cx = u.x + (u.width / 2);
  const cy = u.y + (u.height / 2);
  return {x: cx - (width / 2), y: cy - (height / 2), width, height};
}

/**
 * A frame of the album's aspect ratio inside a rectangle, centered (for a photo of the whole screen).
 * @param {object} rect
 * @param {number} [aspect]
 * @returns {object}
 */
export function fitAspect(rect, aspect=ASPECT) {
  let {width, height} = rect;
  if ( (width / height) > aspect ) width = height * aspect;
  else height = width / aspect;
  return {x: rect.x + ((rect.width - width) / 2), y: rect.y + ((rect.height - height) / 2), width, height};
}

/**
 * The view (center and zoom) which shows a frame on a screen as large as possible within the zoom limits.
 * @param {object} frame
 * @param {{width: number, height: number}} screen
 * @param {object} [limits]
 * @param {number} [limits.minScale=0.1]
 * @param {number} [limits.maxScale=3]
 * @returns {{x: number, y: number, scale: number}}
 */
export function viewFor(frame, screen, {minScale=0.1, maxScale=3}={}) {
  const scale = clamp(Math.min(screen.width / frame.width, screen.height / frame.height), minScale, maxScale);
  return {x: frame.x + (frame.width / 2), y: frame.y + (frame.height / 2), scale};
}

/**
 * Map a rectangle in scene coordinates to the screen with the stage transform (scale and translation only).
 * @param {object} rect
 * @param {{a: number, d: number, tx: number, ty: number}} m
 * @returns {object}
 */
export function toScreen(rect, m) {
  return {x: (m.a * rect.x) + m.tx, y: (m.d * rect.y) + m.ty, width: m.a * rect.width, height: m.d * rect.height};
}

/**
 * The part of a screen rectangle that is on the screen, and how much of the rectangle that is.
 * @param {object} rect
 * @param {{width: number, height: number}} screen
 * @returns {{rect: object, share: number}}
 */
export function clipToScreen(rect, screen) {
  const x = clamp(rect.x, 0, screen.width);
  const y = clamp(rect.y, 0, screen.height);
  const right = clamp(rect.x + rect.width, 0, screen.width);
  const bottom = clamp(rect.y + rect.height, 0, screen.height);
  const clipped = {x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0)};
  const area = rect.width * rect.height;
  const share = area > 0 ? (clipped.width * clipped.height) / area : 0;
  return {rect: clipped, share};
}

/**
 * The size of the image for a crop: the crop's own size, at most maxWidth wide, aspect ratio kept.
 * @param {number} width
 * @param {number} height
 * @param {number} maxWidth
 * @returns {{width: number, height: number}}
 */
export function outputSize(width, height, maxWidth) {
  if ( !(width > 0) || !(height > 0) ) return {width: 0, height: 0};
  const scale = Math.min(1, maxWidth / width);
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}
