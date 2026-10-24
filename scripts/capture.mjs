/**
 * Taking a photo on this client. The canvas is rendered once more without the parts that do not belong into a
 * memory (the grid, selection borders, target markers, rulers, other users' cursors, wall and light handles), then the frame is
 * copied out of the WebGL canvas in the same task, before the browser shows that frame. If the frame lies outside
 * the user's view, the view is moved for that one render and moved back right away, so the user notices nothing.
 *
 * Everything the user's own client draws stays in the photo: lighting, vision, fog of war. A photo taken on a
 * player's client therefore shows exactly what that player could see. A photo on the GM's client also leaves out
 * hidden tokens, tiles and drawings and the map notes.
 */

import {clipToScreen, fitAspect, outputSize, toScreen, viewFor} from "./frame.mjs";

/** Canvas layers whose drawings never go into a photo. */
const HIDDEN_LAYERS = ["controls", "walls", "lighting", "sounds", "regions", "notes"];

/** Parts of a token that only help to play (selection, targets, elevation, rulers). */
const TOKEN_PARTS = ["border", "targetArrows", "targetPips", "tooltip", "levelIndicator", "ruler"];

/** Largest image width. */
const MAX_WIDTH = 1600;

/** Largest image size as data URL; larger images are encoded again smaller. */
const MAX_BYTES = 750 * 1024;

/**
 * Hide some display objects for one render.
 */
class Hider {
  #hidden = [];

  /**
   * @param {object|null|undefined} object   A display object or anything with a visible property
   */
  hide(object) {
    if ( !object || (object.visible === false) ) return;
    this.#hidden.push(object);
    object.visible = false;
  }

  /** Show everything again. */
  restore() {
    for ( const object of this.#hidden ) {
      try {
        object.visible = true;
      } catch {}
    }
    this.#hidden.length = 0;
  }
}

/**
 * The part of the scene the user sees right now.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function visibleFrame() {
  const m = canvas.stage.worldTransform;
  const screen = canvas.app.renderer.screen;
  const x = -m.tx / m.a;
  const y = -m.ty / m.d;
  return fitAspect({x, y, width: screen.width / m.a, height: screen.height / m.d});
}

/**
 * Hide what does not belong into a photo.
 * @param {Hider} hider
 * @param {boolean} gmView   Also hide what only the GM sees
 */
function hideClutter(hider, gmView) {
  for ( const name of HIDDEN_LAYERS ) hider.hide(canvas[name]);
  // The grid with its highlights: movement paths, and in Crucible the hit boxes of controlled and targeted tokens
  hider.hide(canvas.interface?.grid);
  // Scrolling texts (damage numbers, "+Dead"): a private container of the interface group, found by its z-index
  const scrollingZ = CONFIG.Canvas?.groups?.interface?.zIndexScrollingText;
  if ( scrollingZ !== undefined ) hider.hide(canvas.interface?.children?.find(c => c.zIndex === scrollingZ));
  for ( const token of canvas.tokens?.placeables ?? [] ) {
    for ( const part of TOKEN_PARTS ) hider.hide(token[part]);
    if ( gmView && token.document.hidden ) {
      hider.hide(token);
      hider.hide(token.mesh);
    }
  }
  if ( !gmView ) return;
  for ( const tile of canvas.tiles?.placeables ?? [] ) {
    if ( !tile.document.hidden ) continue;
    hider.hide(tile);
    hider.hide(tile.mesh);
  }
  for ( const drawing of canvas.drawings?.placeables ?? [] ) {
    if ( !drawing.document.hidden ) continue;
    hider.hide(drawing);
    hider.hide(drawing.shape);
  }
}

/**
 * Encode a canvas element as WebP, smaller if the image would be too large.
 * @param {HTMLCanvasElement} element
 * @returns {string}
 */
function encode(element) {
  let image = element.toDataURL("image/webp", 0.85);
  for ( const quality of [0.7, 0.55] ) {
    if ( image.length <= MAX_BYTES ) break;
    image = element.toDataURL("image/webp", quality);
  }
  return image;
}

/**
 * Take a photo of a part of the scene on this client.
 * @param {object|null} frame               Scene rectangle; null takes the current view
 * @param {object} [options]
 * @param {boolean} [options.gmView=false]  Leave out what only the GM sees
 * @param {boolean} [options.pan=true]      Move the view for the photo if the frame is not fully on screen
 * @returns {{image: string, width: number, height: number, share: number}}
 */
export function capture(frame, {gmView=false, pan=true}={}) {
  if ( !canvas?.ready || !canvas.app?.renderer ) throw new Error("SCA.Error.noCanvas");
  const renderer = canvas.app.renderer;
  const screen = {width: renderer.screen.width, height: renderer.screen.height};
  const original = {x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x};
  frame ??= visibleFrame();

  // Move the view only if the frame is not on screen at a useful size
  const before = clipToScreen(toScreen(frame, canvas.stage.worldTransform), screen);
  const fits = (before.share >= 0.999) && ((frame.width * original.scale) >= (screen.width * 0.5));
  const moved = pan && !fits;
  const hider = new Hider();
  let copy;
  let share;
  try {
    if ( moved ) {
      const limits = {minScale: CONFIG.Canvas?.minZoom ?? 0.1, maxScale: CONFIG.Canvas?.maxZoom ?? 3};
      canvas.pan(viewFor(frame, screen, limits));
    }
    hideClutter(hider, gmView);
    canvas.app.render();
    const visible = clipToScreen(toScreen(frame, canvas.stage.worldTransform), screen);
    share = visible.share;
    if ( share < 0.5 ) throw new Error("SCA.Error.offscreen");
    const r = renderer.resolution;
    const source = {x: visible.rect.x * r, y: visible.rect.y * r, width: visible.rect.width * r, height: visible.rect.height * r};
    const size = outputSize(source.width, source.height, MAX_WIDTH);
    copy = document.createElement("canvas");
    copy.width = size.width;
    copy.height = size.height;
    const ctx = copy.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(canvas.app.view, source.x, source.y, source.width, source.height, 0, 0, size.width, size.height);
  }
  finally {
    hider.restore();
    if ( moved ) canvas.pan(original);
  }
  return {image: encode(copy), width: copy.width, height: copy.height, share};
}
