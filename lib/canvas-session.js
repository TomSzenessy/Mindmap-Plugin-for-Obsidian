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

/** Remove only a newly-created text card that was abandoned while blank. */
function finalizeNewTextNode(canvas, node, canvasApi) {
  if (!canvas || !node?.__tomindmapPendingCreation)
    return { removed: false, parent: null };
  delete node.__tomindmapPendingCreation;
  const text = String(node.text ?? node.unknownData?.text ?? "").trim();
  if (text)
    return { removed: false, parent: null };
  const parent = canvasApi?.getParentNode?.(canvas, node) || null;
  canvasApi?.removeNode?.(canvas, node);
  canvas.requestSave?.();
  return { removed: true, parent };
}

/**
 * Remove a card that was left empty after editing it, but never touch the
 * root topic, groups, or cards that still carry a subtree.
 */
function removeEmptyNodeOnEditExit(canvas, node, canvasApi) {
  const pending = finalizeNewTextNode(canvas, node, canvasApi);
  if (pending.removed) return pending;
  if (!canvas || !node) return pending;
  const isGroup = node.unknownData?.type === "group" || node.label !== undefined;
  if (isGroup) return pending;
  const text = String(node.text ?? node.unknownData?.text ?? "").trim();
  if (text) return pending;
  const parent = canvasApi?.getParentNode?.(canvas, node) || null;
  if (!parent) return pending;
  if ((canvasApi?.getChildNodes?.(canvas, node) || []).length > 0)
    return pending;
  canvasApi?.removeNode?.(canvas, node);
  canvas.requestSave?.();
  return { removed: true, parent };
}

/** A group card is never a topic: it carries a label instead of Markdown text. */
function isGroupNode(node) {
  return Boolean(
    node && (node.unknownData?.type === "group" || node.label !== undefined)
  );
}

/** A plain text topic, as opposed to a group, file, or link card. */
function isPlainTextTopic(node) {
  return Boolean(
    node &&
    !isGroupNode(node) &&
    !node.file &&
    !node.url &&
    typeof node.text === "string"
  );
}

/**
 * Remove blank topic cards that no longer carry a branch. Deleting a child can
 * leave its parent as an empty leaf, so the sweep repeats until nothing else
 * changes. Cards still being edited are never touched, and a lone blank card is
 * kept so the automatic central topic survives until it is titled.
 */
function pruneEmptyLeafTopics(canvas, canvasApi) {
  const removed = [];
  if (!canvas || typeof canvas.nodes?.values !== "function")
    return removed;
  for (let guard = 0; guard < 50; guard++) {
    const topics = Array.from(canvas.nodes.values()).filter(isPlainTextTopic);
    if (topics.length <= 1)
      break;
    let changed = false;
    for (const node of topics) {
      if (node.isEditing)
        continue;
      // A card that is still being created is owned by the edit-exit path, so
      // a concurrent sweep must not delete it before editing can begin.
      if (node.__tomindmapPendingCreation)
        continue;
      if (String(node.text ?? "").trim())
        continue;
      if ((canvasApi?.getChildNodes?.(canvas, node) || []).length > 0)
        continue;
      const parent = canvasApi?.getParentNode?.(canvas, node) || null;
      canvasApi?.removeNode?.(canvas, node);
      removed.push({ node, parent });
      changed = true;
    }
    if (!changed)
      break;
  }
  if (removed.length > 0)
    canvas.requestSave?.();
  return removed;
}

/** A mindmap canvas is blank until it holds at least one non-group card. */
function isBlankMindmapCanvas(canvas) {
  if (!canvas || typeof canvas.nodes?.values !== "function")
    return false;
  for (const node of canvas.nodes.values()) {
    if (!isGroupNode(node))
      return false;
  }
  return true;
}

/** The central topic is the only card in its tree without an incoming parent. */
function isRootTopicNode(canvas, node, canvasApi) {
  if (!canvas || !node || isGroupNode(node))
    return false;
  if (typeof node.text !== "string")
    return false;
  return !canvasApi?.getParentNode?.(canvas, node);
}

/**
 * Turn a topic's first non-empty line into a safe Canvas filename. Markdown
 * decoration (headings, emphasis, links) is flattened so a title typed as
 * "**Project** [[Note|alias]]" becomes "Project alias" rather than literal
 * markup, and characters Obsidian reserves for links are removed.
 */
function deriveCanvasTitle(text) {
  const source = String(text ?? "");
  const firstLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine)
    return "";
  const flattened = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (match, target, alias) => alias || target
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "");
  return flattened
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 120)
    .trim();
}

module.exports = {
  finalizeNewTextNode,
  removeEmptyNodeOnEditExit,
  pruneEmptyLeafTopics,
  isBlankMindmapCanvas,
  isRootTopicNode,
  deriveCanvasTitle,
  flushCanvasView,
  reflowCanvasAfterMove
};
