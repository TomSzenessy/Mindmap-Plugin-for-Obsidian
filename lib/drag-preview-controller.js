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
   * The per-drag index: the dragged topic's subtree, and the attachable cards
   * of every map in one fixed preorder. Each card also records its nearest
   * attachable ancestor and where its branch ends in that order, so a frame
   * can measure every branch rectangle in one pass. All of it is built once
   * when the gesture starts, so an animation frame only measures cards.
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
        }
        const children = tree.children || [];
        for (let index = children.length - 1; index >= 0; index--)
          stack.push({ tree: children[index], parent: own });
      }
      const ends = cards.map((_, index) => index);
      for (let index = cards.length - 1; index >= 0; index--) {
        const parent = parents[index];
        if (parent >= 0 && ends[index] > ends[parent])
          ends[parent] = ends[index];
      }
      maps.push({ root: root.canvasNode, cards, parents, ends });
    }
    return { descendantIds, maps };
  }

  /**
   * Measure one map for the current frame: its whole rectangle, the closest
   * card, and the branch drop zone - the smallest rectangle spanned by one
   * topic and its descendants that contains the dragged card's center. A
   * topic without children is its own card, so dropping onto it works too.
   */
  function measureMap(map, draggedNode) {
    const { cards, parents } = map;
    const count = cards.length;
    if (count === 0)
      return null;
    const draggedLeft = draggedNode.x;
    const draggedTop = draggedNode.y;
    const draggedRight = draggedLeft + draggedNode.width;
    const draggedBottom = draggedTop + draggedNode.height;
    const centerX = draggedLeft + draggedNode.width / 2;
    const centerY = draggedTop + draggedNode.height / 2;
    const minX = new Float64Array(count);
    const minY = new Float64Array(count);
    const maxX = new Float64Array(count);
    const maxY = new Float64Array(count);
    let nodeDistance = Infinity;
    for (let index = 0; index < count; index++) {
      const node = cards[index];
      const left = node.x;
      const top = node.y;
      const right = left + node.width;
      const bottom = top + node.height;
      minX[index] = left;
      minY[index] = top;
      maxX[index] = right;
      maxY[index] = bottom;
      nodeDistance = Math.min(
        nodeDistance,
        Math.hypot(
          Math.max(left - draggedRight, draggedLeft - right, 0),
          Math.max(top - draggedBottom, draggedTop - bottom, 0)
        )
      );
    }
    // Children follow their parent in preorder, so a reverse pass folds every
    // branch into its topic's rectangle.
    let boxLeft = Infinity;
    let boxTop = Infinity;
    let boxRight = -Infinity;
    let boxBottom = -Infinity;
    for (let index = count - 1; index >= 0; index--) {
      const parent = parents[index];
      if (parent >= 0) {
        if (minX[index] < minX[parent]) minX[parent] = minX[index];
        if (minY[index] < minY[parent]) minY[parent] = minY[index];
        if (maxX[index] > maxX[parent]) maxX[parent] = maxX[index];
        if (maxY[index] > maxY[parent]) maxY[parent] = maxY[index];
      } else {
        if (minX[index] < boxLeft) boxLeft = minX[index];
        if (minY[index] < boxTop) boxTop = minY[index];
        if (maxX[index] > boxRight) boxRight = maxX[index];
        if (maxY[index] > boxBottom) boxBottom = maxY[index];
      }
    }
    let zone = -1;
    let zoneArea = Infinity;
    for (let index = 0; index < count; index++) {
      if (cards[index] === map.root)
        continue;
      if (
        centerX < minX[index] || centerX > maxX[index] ||
        centerY < minY[index] || centerY > maxY[index]
      )
        continue;
      const area = (maxX[index] - minX[index]) * (maxY[index] - minY[index]);
      // Ties go to the later card in preorder: the deeper branch.
      if (area <= zoneArea) {
        zone = index;
        zoneArea = area;
      }
    }
    const boxDistance = Math.hypot(
      Math.max(boxLeft - draggedRight, draggedLeft - boxRight, 0),
      Math.max(boxTop - draggedBottom, draggedTop - boxBottom, 0)
    );
    return {
      map,
      root: map.root,
      nodes: cards,
      nodeDistance,
      boxDistance,
      zone,
      // The dragged card overlaps the rectangle spanned by every card of
      // the map - the same area as selecting the whole map.
      inside: boxDistance === 0
    };
  }

  function chooseAttachmentMap(draggedNode) {
    const maps = dragIndex.maps
      .map((map) => measureMap(map, draggedNode))
      .filter(Boolean);

    // Rank by the closest actual card, not by the map's rectangle. A floating
    // card the cursor is sitting on must win over a large map whose bounding
    // box merely contains the cursor; otherwise the preview sticks to the
    // branch it came from until the whole map is left behind.
    const candidates = maps.filter(
      (map) => map.nodeDistance <= ATTACHMENT_DISTANCE || map.inside
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

  /**
   * The prospective parent, from most to least specific: inside a branch's
   * rectangle, that branch's topic - unless a nearby card within that same
   * branch is a closer fit; otherwise the nearby card; otherwise, anywhere
   * inside the map's rectangle, the map's main topic.
   */
  function chooseTarget(draggedNode, attachmentMap) {
    if (!attachmentMap)
      return null;
    const root = attachmentMap.root;
    const nearest = attachmentMap.nodes.length === 1
      ? attachmentMap.nodes[0]
      : findNearestNodeOnBranch(
        draggedNode,
        attachmentMap.nodes,
        root,
        (rootId, targetId) => dragIndex.descendantIds.has(targetId),
        ATTACHMENT_DISTANCE
      );
    const nearby =
      nearest && nodeToNodeDistance(draggedNode, nearest) <= ATTACHMENT_DISTANCE
        ? nearest
        : null;
    const zone = attachmentMap.zone;
    if (zone >= 0) {
      const nearbyIndex = nearby ? attachmentMap.nodes.indexOf(nearby) : -1;
      return nearbyIndex >= zone && nearbyIndex <= attachmentMap.map.ends[zone]
        ? nearby
        : attachmentMap.nodes[zone];
    }
    return nearby || (attachmentMap.inside ? root : null);
  }

  function updatePreview(draggedNode) {
    if (!draggedNode) {
      cancel();
      return { state: "idle", target: null };
    }
    if (activeDraggedNode?.id !== draggedNode.id)
      begin(draggedNode);

    const targetNode = chooseTarget(draggedNode, chooseAttachmentMap(draggedNode));
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
