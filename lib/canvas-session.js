"use strict";

/**
 * Finish native Canvas persistence before plugin handlers are detached.
 *
 * Canvas.requestSave() is debounced by Obsidian. Calling the view's save
 * method when it is available lets Obsidian serialize the graph itself, and
 * the vault fallback is then a last resort rather than a second writer.
 *
 * The fallback only owns the file while the bytes on disk are still the ones
 * this session started from. A newer graph written by a second window or a
 * sync client during the save attempt therefore survives, instead of the
 * pending snapshot resurrecting a discarded hierarchy.
 *
 * @returns {Promise<boolean>} true when the vault fallback persisted the
 * pending graph, false when the native save or another writer already owns it.
 */
async function flushCanvasView(canvas, vault = null) {
  if (!canvas)
    return false;
  const file = canvas.view?.file;
  const snapshot = typeof canvas.getData === "function"
    ? JSON.stringify(canvas.getData(), null, "\t")
    : null;
  const read = typeof vault?.cachedRead === "function"
    ? vault.cachedRead
    : typeof vault?.read === "function"
      ? vault.read
      : null;
  let owned = null;
  if (file && snapshot !== null && read) {
    try {
      owned = await read.call(vault, file);
    } catch (_) {
      owned = null;
    }
  }
  canvas.requestSave?.();
  const view = canvas.view;
  if (typeof view?.save === "function")
    await view.save();
  if (snapshot === null || !file || owned === null ||
    typeof vault?.process !== "function")
    return false;
  let written = false;
  await vault.process(file, (current) => {
    if (current !== owned) return current;
    written = current !== snapshot;
    return written ? snapshot : current;
  });
  return written;
}

/**
 * A manual topic move invalidates the contours of its complete mind map.
 * Reflow the canvas as one transaction so independent drag handlers do not
 * leave partially updated geometry behind.
 */
function reflowCanvasAfterMove(canvas, services) {
  if (!canvas || !services?.isMindmap(canvas))
    return false;
  services.layout.layout(canvas, { preserveRootSides: true });
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

/** A blank leaf topic is swept away; every other topic is kept. */
function isBlankLeafTopic(canvas, node, canvasApi, childCount = null) {
  if (!isPlainTextTopic(node)) return false;
  if (String(node.text ?? "").trim()) return false;
  // A card that is still being created is owned by the edit-exit path, so a
  // concurrent sweep must not delete it before editing can begin.
  if (node.__tomindmapPendingCreation) return false;
  return childCount === null
    ? (canvasApi?.getChildNodes?.(canvas, node) || []).length === 0
    : childCount === 0;
}

/**
 * Remove blank topic cards that no longer carry a branch. Deleting a child can
 * leave its parent as an empty leaf, so each removal queues that parent
 * instead of re-scanning the whole Canvas; the queue drains to a fixed point
 * at any depth. Cards still being edited are never touched, and a lone blank
 * card is kept so the automatic central topic survives until it is titled.
 */
function pruneEmptyLeafTopics(canvas, canvasApi) {
  const removed = [];
  if (!canvas || typeof canvas.nodes?.values !== "function")
    return removed;
  const parentById = new Map();
  const childCounts = new Map();
  const query = canvasApi?.getGraphQuery?.(canvas) || null;
  if (query?.forest) {
    const pending = [...query.forest].reverse();
    while (pending.length > 0) {
      const treeNode = pending.pop();
      if (!treeNode?.canvasNode) continue;
      const id = treeNode.canvasNode.id;
      childCounts.set(id, treeNode.children.length);
      if (treeNode.parent?.canvasNode)
        parentById.set(id, treeNode.parent.canvasNode);
      for (let index = treeNode.children.length - 1; index >= 0; index--)
        pending.push(treeNode.children[index]);
    }
  } else {
    for (const node of canvas.nodes.values()) {
      if (!isPlainTextTopic(node)) continue;
      const children = canvasApi?.getChildNodes?.(canvas, node) || [];
      childCounts.set(node.id, children.length);
      const parent = canvasApi?.getParentNode?.(canvas, node) || null;
      if (parent) parentById.set(node.id, parent);
    }
  }

  const queue = [];
  let cursor = 0;
  let topicsLeft = 0;
  for (const node of canvas.nodes.values()) {
    if (!isPlainTextTopic(node)) continue;
    topicsLeft++;
    const childCount = childCounts.get(node.id) ?? 0;
    if (isBlankLeafTopic(canvas, node, canvasApi, childCount))
      queue.push(node);
  }
  while (cursor < queue.length && topicsLeft > 1) {
    const node = queue[cursor++];
    if (!canvas.nodes.has(node.id) || node.isEditing) continue;
    const childCount = childCounts.get(node.id) ?? 0;
    if (!isBlankLeafTopic(canvas, node, canvasApi, childCount)) continue;
    const parent = parentById.get(node.id) || null;
    canvasApi?.removeNode?.(canvas, node);
    removed.push({ node, parent });
    topicsLeft--;
    if (parent && isPlainTextTopic(parent)) {
      const remaining = Math.max(0, (childCounts.get(parent.id) ?? 0) - 1);
      childCounts.set(parent.id, remaining);
      if (remaining === 0) queue.push(parent);
    }
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
