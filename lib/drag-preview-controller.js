"use strict";

const {
  ATTACHMENT_DISTANCE,
  collectSubtreeIds,
  createMindMapEdge,
  findNearestNodeOnBranch,
  getConnectionSides,
  nodeToNodeDistance,
  reparentSubtree,
  snapshotEdgePayload
} = typeof TreeDrag !== "undefined" ? TreeDrag : require("./tree-drag.js");

const PRIMARY_BUTTON = 0;
const CANVAS_OWNED_CONTROL =
  ".canvas-node-connection-point, .canvas-node-resizer, .canvas-node-resizers";

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

  if (event.target?.closest?.(CANVAS_OWNED_CONTROL)) {
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
  getRootNode
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
    originalEdgeObjects = draggedNode ? incomingEdges(draggedNode) : [];
    originalLinks = originalEdgeObjects.map(snapshotEdgePayload);
    originalParent =
      canvas.nodes?.get?.(originalLinks[0]?.fromNodeId) || null;
    beginTopology = permanentTopologySignature();
    dragIndex = buildDragIndex(sessionForest, draggedNode, options?.excludedIds);
    state = draggedNode ? "original" : "idle";
    finished = false;
    settledResult = null;
    return originalParent;
  }

  /**
   * The per-drag index: the dragged topic's subtree, and the attachable cards
   * of every map in one fixed order. Both are built once when the gesture
   * starts, so an animation frame only measures cards.
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
      const stack = root ? [root] : [];
      while (stack.length > 0) {
        const tree = stack.pop();
        if (!tree) continue;
        cards.push(tree.canvasNode);
        const children = tree.children || [];
        for (let index = children.length - 1; index >= 0; index--)
          stack.push(children[index]);
      }
      maps.push({
        root: root.canvasNode,
        cards: cards.filter(
          (card) =>
            card &&
            card.id !== draggedNode?.id &&
            !descendantIds.has(card.id)
        )
      });
    }
    return { descendantIds, maps };
  }

  function chooseAttachmentMap(draggedNode) {
    const maps = dragIndex.maps
      .map((map) => {
        const cards = map.cards;
        if (cards.length === 0)
          return null;
        const draggedLeft = draggedNode.x;
        const draggedTop = draggedNode.y;
        const draggedRight = draggedLeft + draggedNode.width;
        const draggedBottom = draggedTop + draggedNode.height;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of cards) {
          const left = node.x;
          const top = node.y;
          const right = left + node.width;
          const bottom = top + node.height;
          if (left < minX) minX = left;
          if (top < minY) minY = top;
          if (right > maxX) maxX = right;
          if (bottom > maxY) maxY = bottom;
        }
        const boxDistance = Math.hypot(
          Math.max(minX - draggedRight, draggedLeft - maxX, 0),
          Math.max(minY - draggedBottom, draggedTop - maxY, 0)
        );
        let nodeDistance = Infinity;
        for (const node of cards)
          nodeDistance = Math.min(
            nodeDistance,
            nodeToNodeDistance(draggedNode, node)
          );
        return {
          root: map.root,
          nodes: cards,
          nodeDistance,
          boxDistance,
          contains: boxDistance <= ATTACHMENT_DISTANCE
        };
      })
      .filter(Boolean);

    // Rank by the closest actual card, not by the map's buffered rectangle.
    // A floating card the cursor is sitting on must win over a large map whose
    // bounding box merely reaches the cursor; otherwise the preview sticks to
    // the branch it came from until the whole map is left behind.
    const candidates = maps.filter(
      (map) =>
        map.contains || map.nodeDistance <= ATTACHMENT_DISTANCE
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) =>
        a.nodeDistance - b.nodeDistance ||
        b.nodes.length - a.nodes.length ||
        a.boxDistance - b.boxDistance
    );
    return candidates[0];
  }

  function updatePreview(draggedNode) {
    if (!draggedNode) {
      cancel();
      return { state: "idle", target: null };
    }
    if (activeDraggedNode?.id !== draggedNode.id)
      begin(draggedNode);

    const attachmentMap = chooseAttachmentMap(draggedNode);
    const candidate = attachmentMap?.root || null;
    const rayTarget = candidate
      ? attachmentMap.nodes.length === 1
        ? candidate
        : findNearestNodeOnBranch(
          draggedNode,
          attachmentMap.nodes,
          candidate,
          (rootId, targetId) => dragIndex.descendantIds.has(targetId)
        )
      : null;
    const targetNode = rayTarget;
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
      if (sideHeld)
        return {
          state: "preview",
          target: targetNode,
          incomingSide: previewEdge.to?.side || null
        };
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
      return settle({
        changed: !wasAlreadySingleParent,
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
