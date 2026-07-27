"use strict";

/**
 * Finish native Canvas persistence before plugin handlers are detached.
 *
 * Canvas.requestSave() is debounced by Obsidian. Calling the view's save
 * method when it is available prevents a leaf change from discarding a
 * pending native save. The fallback remains compatible with Canvas versions
 * that expose only requestSave().
 */
async function flushCanvasView(canvas, vault = null) {
  if (!canvas)
    return;
  const file = canvas.view?.file;
  const snapshot = typeof canvas.getData === "function"
    ? JSON.stringify(canvas.getData(), null, "\t")
    : null;
  canvas.requestSave?.();
  const view = canvas.view;
  if (typeof view?.save === "function")
    await view.save();
  if (snapshot !== null && file && typeof vault?.process === "function")
    await vault.process(file, (current) => current === snapshot ? current : snapshot);
}

/**
 * A manual topic move invalidates the contours of its complete mind map.
 * Reflow the canvas as one transaction so independent drag handlers do not
 * leave partially updated geometry behind.
 */
function reflowCanvasAfterMove(canvas, services) {
  if (!canvas || !services?.isMindmap(canvas))
    return false;
  services.layout.layout(canvas);
  services.updateGroups?.(canvas);
  if (services.autoColor?.())
    services.colors?.applyColors(canvas);
  services.markOrderDirty?.(canvas);
  canvas.requestSave?.();
  return true;
}

module.exports = {
  flushCanvasView,
  reflowCanvasAfterMove
};
