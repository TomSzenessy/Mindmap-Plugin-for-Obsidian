"use strict";

const {
  ATTACHMENT_DISTANCE,
  collectSubtreeIds,
  createMindMapEdge,
  getConnectionSides,
  reparentSubtree,
  snapshotEdgePayload
} = typeof TreeDrag !== "undefined" ? TreeDrag : require("./tree-drag.js");

const PRIMARY_BUTTON = 0;
const CANVAS_OWNED_CONTROL =
  ".canvas-node-connection-point, .canvas-node-resizer, .canvas-node-resizers, .canvas-node-resize-handle, [class*='resizer']";
const CANVAS_OWNED_CLASSES = [
  "canvas-node-connection-point",
  "canvas-node-resizer",
  "canvas-node-resizers",
  "canvas-node-resize-handle"
];

function isCanvasOwnedControl(target) {
  if (!target) return false;
  if (target.closest?.(CANVAS_OWNED_CONTROL)) return true;
  const candidates = [];
  if (typeof target.composedPath === "function") {
    try {
      candidates.push(...target.composedPath());
    } catch (_) {}
  }
  let current = target;
  while (current) {
    candidates.push(current);
    current = current.parentElement;
  }
  return candidates.some((element) => {
    if (element?.matches?.(CANVAS_OWNED_CONTROL)) return true;
    return CANVAS_OWNED_CLASSES.some((name) => element?.classList?.contains?.(name));
  });
}

function setCanvasEdgeHidden(edge, hidden) {
  if (!edge) return;
  for (const element of [
    edge.lineGroupEl,
    edge.lineEndGroupEl,
    edge.el,
    edge.edgeEl
  ]) {
    if (!element) continue;
    if (element.style) {
      if (typeof element.style.setProperty === "function") {
        if (hidden) {
          element.style.setProperty("display", "none", "important");
          element.style.setProperty("visibility", "hidden", "important");
          element.style.setProperty("opacity", "0", "important");
        } else {
          element.style.removeProperty("display");
          element.style.removeProperty("visibility");
          element.style.removeProperty("opacity");
        }
      } else {
        element.style.display = hidden ? "none" : "";
        element.style.visibility = hidden ? "hidden" : "";
        element.style.opacity = hidden ? "0" : "";
      }
    }
    if (hidden) {
      element.addClass?.("tomindmap-edge-hidden");
      element.classList?.add?.("tomindmap-edge-hidden");
    } else {
      element.removeClass?.("tomindmap-edge-hidden");
      element.classList?.remove?.("tomindmap-edge-hidden");
    }
  }
}

/**
 * The one predicate for a card gesture this plugin owns.
 *
 * Returns the topic card the gesture started on, or null when the gesture
 * belongs to Canvas or to another adapter: a secondary button, a connection
 * point or resizer, a group, empty space, or a Canvas whose mind-map mode is
 * off. Only claimed gestures may mutate the map.
 */
function isPrimaryCardGesture(event, context = {}) {
  if (!event || context.isEnabled?.() === false) {
    return null;
  }

  if (event.button !== PRIMARY_BUTTON) {
    return null;
  }

  if (isCanvasOwnedControl(event.target)) {
    return null;
  }

  const node = context.findNode?.(event) || null;

  if (!node || node.isEditing || event.target?.closest?.(".cm-editor, .canvas-node-content-editing") || context.isGroupNode?.(node)) {
    return null;
  }

  return node;
}

function createDragAttachmentController(
  canvas,
  canvasApi,
  getForest,
  getRootNode,
  options = {}
) {
  let activeDraggedNode = null;
  let originalLinks = [];
  let originalEdgeObjects = [];
  let originalParent = null;
  let sessionForest = [];
  let dragIndex = { descendantIds: new Set(), maps: [] };
  let previewEdge = null;
  let previewParent = null;
  let state = "idle";
  let finished = false;
  let settledResult = null;
  let beginTopology = "";

  function incomingEdges(node) {
    return (canvasApi.getIncomingEdges?.(canvas, node) || [])
      .filter((edge) => edge !== previewEdge && !edge?.__mindMapPreview);
  }

  function permanentTopologySignature() {
    const nodes = [...(canvas?.nodes?.keys?.() || [])].map(String).sort();
    const edges = [...(canvas?.edges?.values?.() || [])]
      .filter((edge) => !edge?.__mindMapPreview)
      .map((edge) => `${edge?.from?.node?.id || ""}>${edge?.to?.node?.id || ""}`)
      .sort();
    return `${nodes.join(",")}|${edges.join(",")}`;
  }

  function removePreview() {
    previewParent?.nodeEl?.removeClass?.("tomindmap-reparent-target");
    if (previewEdge && canvasApi.removeEdge)
      canvasApi.removeEdge(canvas, previewEdge);
    previewEdge = null;
    previewParent = null;
  }

  function resetState() {
    for (const origEdge of originalEdgeObjects) {
      setCanvasEdgeHidden(origEdge, false);
    }
    activeDraggedNode = null;
    originalLinks = [];
    originalEdgeObjects = [];
    originalParent = null;
    sessionForest = [];
    dragIndex = { descendantIds: new Set(), maps: [] };
    previewEdge = null;
    previewParent = null;
    beginTopology = "";
    state = "idle";
  }

  function begin(draggedNode, options = {}) {
    if (activeDraggedNode)
      cancel();
    activeDraggedNode = draggedNode || null;
    sessionForest = draggedNode ? getForest?.() || [] : [];
    /*
     * The branch link is snapshotted once, in full, and every later frame
     * reuses it: preview, commit, and rollback all re-point the same authored
     * object instead of rebuilding a default arrow.
     */
    const moving = options?.movingNodes && options.movingNodes.length > 0
      ? options.movingNodes
      : (draggedNode ? [draggedNode] : []);
    originalEdgeObjects = [];
    for (const mNode of moving) {
      if (!mNode) continue;
      for (const edge of incomingEdges(mNode)) {
        if (!originalEdgeObjects.includes(edge)) {
          originalEdgeObjects.push(edge);
        }
      }
    }
    originalLinks = draggedNode ? incomingEdges(draggedNode).map(snapshotEdgePayload) : [];
    originalParent =
      canvas.nodes?.get?.(originalLinks[0]?.fromNodeId) || null;
    beginTopology = permanentTopologySignature();
    dragIndex = buildDragIndex(sessionForest, draggedNode, options?.excludedIds);
    state = draggedNode ? "original" : "idle";
    finished = false;
    settledResult = null;
    for (const origEdge of originalEdgeObjects) {
      setCanvasEdgeHidden(origEdge, true);
    }
    return originalParent;
  }

  /**
   * The drop-zone padding in canvas units, read once per frame so a settings
   * change applies to the next drag frame.
   */
  function dropZonePadding() {
    const padding = Number(options.getPadding?.());
    return Number.isFinite(padding) && padding >= 0
      ? padding
      : ATTACHMENT_DISTANCE;
  }

  /**
   * The per-drag index: the dragged topic's subtree, and the attachable cards
   * of every map in one fixed preorder. Each card also records its nearest
   * attachable ancestor and its depth, so a frame can measure every branch
   * rectangle in one pass. All of it is built once when the gesture starts,
   * so an animation frame only measures cards.
   */
  function buildDragIndex(forest, draggedNode, excludedIds = null) {
    const descendantIds = collectSubtreeIds(forest, draggedNode?.id);
    if (excludedIds) {
      for (const id of excludedIds) {
        descendantIds.add(id);
      }
    }
    const maps = [];
    for (const root of forest) {
      const cards = [];
      const parents = [];
      const depths = [];
      const stack = root ? [{ tree: root, parent: -1 }] : [];
      while (stack.length > 0) {
        const { tree, parent } = stack.pop();
        if (!tree) continue;
        const card = tree.canvasNode;
        let own = parent;
        if (
          card &&
          card.id !== draggedNode?.id &&
          !descendantIds.has(card.id)
        ) {
          own = cards.length;
          cards.push(card);
          parents.push(parent);
          depths.push(parent >= 0 ? depths[parent] + 1 : 0);
        }
        const children = tree.children || [];
        for (let index = children.length - 1; index >= 0; index--)
          stack.push({ tree: children[index], parent: own });
      }
      maps.push({ root: root.canvasNode, cards, parents, depths });
    }
    return { descendantIds, maps };
  }

  /**
   * Measure one map for the current frame.
   *
   * The map zone is the rectangle spanned by every card of the map - the area
   * selecting the whole map covers - grown by the padding. Every other topic
   * owns a branch zone: it starts at the topic's outer edge (left of a
   * left-side topic, right of a right-side topic), reaches the outer edge of
   * the map zone, and spans the topic's branch vertically, grown by the
   * padding. The dragged card is in a zone once it lies entirely beyond the
   * topic's outer edge and its center is within the zone.
   */
  function measureMap(map, draggedNode, padding) {
    const { cards, parents, depths } = map;
    const count = cards.length;
    if (count === 0)
      return null;
    const draggedLeft = draggedNode.x;
    const draggedTop = draggedNode.y;
    const draggedRight = draggedLeft + draggedNode.width;
    const draggedBottom = draggedTop + draggedNode.height;
    const centerX = draggedLeft + draggedNode.width / 2;
    const centerY = draggedTop + draggedNode.height / 2;
    const left = new Float64Array(count);
    const right = new Float64Array(count);
    const top = new Float64Array(count);
    const bottom = new Float64Array(count);
    let nodeDistance = Infinity;
    let onCard = -1;
    for (let index = 0; index < count; index++) {
      const node = cards[index];
      left[index] = node.x;
      top[index] = node.y;
      right[index] = node.x + node.width;
      bottom[index] = node.y + node.height;
      nodeDistance = Math.min(
        nodeDistance,
        Math.hypot(
          Math.max(left[index] - draggedRight, draggedLeft - right[index], 0),
          Math.max(top[index] - draggedBottom, draggedTop - bottom[index], 0)
        )
      );
      if (
        centerX >= left[index] && centerX <= right[index] &&
        centerY >= top[index] && centerY <= bottom[index]
      )
        onCard = index;
    }
    // Children follow their parent in preorder, so a reverse pass folds every
    // branch's vertical extent into its topic.
    const branchTop = Float64Array.from(top);
    const branchBottom = Float64Array.from(bottom);
    let mapLeft = Infinity;
    let mapTop = Infinity;
    let mapRight = -Infinity;
    let mapBottom = -Infinity;
    for (let index = count - 1; index >= 0; index--) {
      if (left[index] < mapLeft) mapLeft = left[index];
      if (right[index] > mapRight) mapRight = right[index];
      if (branchTop[index] < mapTop) mapTop = branchTop[index];
      if (branchBottom[index] > mapBottom) mapBottom = branchBottom[index];
      const parent = parents[index];
      if (parent < 0) continue;
      if (branchTop[index] < branchTop[parent])
        branchTop[parent] = branchTop[index];
      if (branchBottom[index] > branchBottom[parent])
        branchBottom[parent] = branchBottom[index];
    }
    mapLeft -= padding;
    mapTop -= padding;
    mapRight += padding;
    mapBottom += padding;
    const inside =
      centerX >= mapLeft && centerX <= mapRight &&
      centerY >= mapTop && centerY <= mapBottom;

    const rootIndex = cards.indexOf(map.root);
    const rootCenterX = rootIndex >= 0
      ? (left[rootIndex] + right[rootIndex]) / 2
      : (mapLeft + mapRight) / 2;
    let zone = -1;
    let zoneDistance = Infinity;
    if (inside) {
      for (let index = 0; index < count; index++) {
        if (index === rootIndex) continue;
        const leftSide = (left[index] + right[index]) / 2 < rootCenterX;
        // The whole dragged card must be past the topic's outer edge: a card
        // still overlapping the topic's column belongs to the topic inward.
        if (
          (leftSide
            ? centerX < mapLeft || draggedRight > left[index]
            : draggedLeft < right[index] || centerX > mapRight) ||
          centerY < branchTop[index] - padding ||
          centerY > branchBottom[index] + padding
        )
          continue;
        // The deepest zone wins; among zones of the same depth, the topic
        // closest to the dragged card.
        const distance = Math.hypot(
          Math.max(left[index] - draggedRight, draggedLeft - right[index], 0),
          Math.max(top[index] - draggedBottom, draggedTop - bottom[index], 0)
        );
        if (
          zone < 0 ||
          depths[index] > depths[zone] ||
          depths[index] === depths[zone] && distance < zoneDistance
        ) {
          zone = index;
          zoneDistance = distance;
        }
      }
    }
    return {
      root: map.root,
      nodes: cards,
      nodeDistance,
      inside,
      onCard,
      zone
    };
  }

  function chooseAttachmentMap(draggedNode) {
    const padding = dropZonePadding();
    const maps = dragIndex.maps
      .map((map) => measureMap(map, draggedNode, padding))
      .filter((map) => map?.inside);
    if (maps.length === 0) return null;
    // Rank by the closest actual card, not by the map's rectangle. A floating
    // card the cursor is sitting on must win over a large map whose zone
    // merely contains the cursor; otherwise the preview sticks to the branch
    // it came from until the whole map is left behind.
    maps.sort(
      (a, b) =>
        a.nodeDistance - b.nodeDistance ||
        b.nodes.length - a.nodes.length
    );
    return maps[0];
  }

  /**
   * The prospective parent, from most to least specific: the topic the
   * dragged card's center is on; the topic of the deepest branch zone it is
   * in; otherwise the map's main topic.
   */
  function chooseTarget(attachmentMap) {
    if (!attachmentMap)
      return null;
    if (attachmentMap.onCard >= 0)
      return attachmentMap.nodes[attachmentMap.onCard];
    if (attachmentMap.zone >= 0)
      return attachmentMap.nodes[attachmentMap.zone];
    return attachmentMap.root;
  }

  function updatePreview(draggedNode) {
    if (!draggedNode) {
      cancel();
      return { state: "idle", target: null };
    }
    if (activeDraggedNode?.id !== draggedNode.id)
      begin(draggedNode);

    const targetNode = chooseTarget(chooseAttachmentMap(draggedNode));
    const mainRootNode = targetNode
      ? getRootNode?.(targetNode) || targetNode
      : null;
    if (!targetNode) {
      removePreview();
      state = "detached";
      return { state, target: null };
    }

    if (previewEdge && previewParent?.id === targetNode.id) {
      // The target can stay the same while the dragged card crosses to the
      // other side of it. Rebuild the arrow so it flips sides immediately
      // instead of holding the side it first attached with.
      const desired = getConnectionSides(draggedNode, mainRootNode);
      const sideHeld =
        previewEdge.from?.side === desired.fromSide &&
        previewEdge.to?.side === desired.toSide;
      if (sideHeld) {
        for (const origEdge of originalEdgeObjects) {
          setCanvasEdgeHidden(origEdge, true);
        }
        return {
          state: "preview",
          target: targetNode,
          incomingSide: previewEdge.to?.side || null
        };
      }
    }

    removePreview();
    let edge = null;
    try {
      edge = createMindMapEdge(
        canvas,
        canvasApi,
        targetNode,
        draggedNode,
        mainRootNode,
        {
          preview: true,
          carry: originalLinks[0] || null,
          color: targetNode.color
        }
      );
    } catch (_) {
      edge = null;
    }
    if (!edge) {
      state = "original";
      return { state, target: originalParent };
    }

    previewParent = targetNode;
    previewParent?.nodeEl?.addClass?.("tomindmap-reparent-target");
    previewEdge = edge;
    for (const origEdge of originalEdgeObjects) {
      setCanvasEdgeHidden(origEdge, true);
    }
    state = "preview";
    return { state, target: targetNode, incomingSide: edge.to?.side || null };
  }

  /**
   * Close the session exactly once. Every later terminal signal answers with
   * the same result instead of touching the map again.
   */
  function settle(result) {
    resetState();
    finished = true;
    settledResult = result;
    return result;
  }

  function finish(reason, draggedNode) {
    if (finished) {
      return settledResult;
    }

    if (reason !== "commit") {
      removePreview();
      return settle({ changed: false, state: "cancelled", target: null, reason });
    }

    if (!draggedNode || activeDraggedNode?.id !== draggedNode.id) {
      removePreview();
      return settle({ changed: false, state: "idle", target: null, reason });
    }

    const draggedStillLive = canvas.nodes?.get?.(draggedNode.id) === draggedNode;
    const targetStillLive = !previewParent
      || canvas.nodes?.get?.(previewParent.id) === previewParent;
    if (
      !draggedStillLive
      || !targetStillLive
      || permanentTopologySignature() !== beginTopology
    ) {
      removePreview();
      return settle({
        changed: false,
        state: "original",
        target: originalParent,
        reason: `${reason}:stale-topology`
      });
    }

    if (state === "preview" && previewParent) {
      const targetNode = previewParent;
      const incomingSide = previewEdge?.to?.side || null;
      removePreview();
      const currentForest =
        canvasApi.getGraphQuery?.(canvas)?.forest || getForest?.() || sessionForest;
      let attached = false;
      try {
        attached = reparentSubtree(
          canvas,
          canvasApi,
          draggedNode,
          targetNode,
          "child",
          currentForest,
          getRootNode?.(targetNode) || targetNode,
          { carry: originalLinks[0] || null }
        );
      } catch (_) {
        attached = false;
      }
      if (!attached) {
        return settle({
          changed: false,
          state: "original",
          target: originalParent,
          reason
        });
      }
      const wasAlreadySingleParent =
        originalLinks.length === 1 &&
        originalLinks[0]?.fromNodeId === targetNode.id;
      const sideChanged = Boolean(
        originalLinks[0]?.toSide &&
        incomingSide &&
        originalLinks[0].toSide !== incomingSide
      );
      return settle({
        changed: !wasAlreadySingleParent || sideChanged,
        state: "attached",
        target: targetNode,
        incomingSide,
        reason
      });
    }

    if (state === "detached") {
      removePreview();
      for (const edge of incomingEdges(draggedNode))
        canvasApi.removeEdge?.(canvas, edge);
      return settle({
        changed: originalLinks.length > 0,
        state: "detached",
        target: null,
        reason
      });
    }

    /*
     * A meaningful drag that ends near the old parent keeps exactly one
     * incoming parent link, repairing malformed multi-parent branches too.
     */
    const keepEdge = originalEdgeObjects[0] || null;
    let removed = 0;
    for (const edge of incomingEdges(draggedNode)) {
      if (edge === keepEdge) continue;
      canvasApi.removeEdge?.(canvas, edge);
      removed += 1;
    }
    return settle({
      changed: removed > 0,
      state: "original",
      target: originalParent,
      reason
    });
  }

  /*
   * `commit` and `cancel` stay as the two named terminal paths; both are the
   * one `finish` policy, so a second terminal signal from a lost capture,
   * blur, mode change, or teardown can never replay or undo the first.
   */
  function commit(draggedNode) {
    return finish("commit", draggedNode);
  }

  function cancel() {
    return finish("cancel");
  }

  return {
    begin,
    updatePreview,
    finish,
    commit,
    cancel
  };
}

module.exports = {
  createDragAttachmentController,
  isPrimaryCardGesture
};
