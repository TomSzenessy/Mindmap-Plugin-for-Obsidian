"use strict";

const {
  ATTACHMENT_DISTANCE,
  createMindMapEdge,
  findNearestNodeOnBranch,
  isDescendant,
  reparentSubtree
} = typeof TreeDrag !== "undefined" ? TreeDrag : require("./tree-drag.js");

function createDragAttachmentController(
  canvas,
  canvasApi,
  getForest,
  getRootNode
) {
  let activeDraggedNode = null;
  let originalEdges = [];
  let originalParent = null;
  let originalRemoved = false;
  let sessionForest = [];
  let previewEdge = null;
  let previewParent = null;
  let state = "idle";

  function incomingEdges(node) {
    return (canvasApi.getIncomingEdges?.(canvas, node) || [])
      .filter((edge) => edge !== previewEdge && !edge?.__mindMapPreview);
  }

  function snapshotEdge(edge) {
    return {
      fromNode: edge?.from?.node || null,
      toNode: edge?.to?.node || null,
      fromSide: edge?.from?.side || "right",
      toSide: edge?.to?.side || "left",
      color: edge?.color
    };
  }

  function removePreview() {
    previewParent?.nodeEl?.removeClass?.("tomindmap-reparent-target");
    if (previewEdge && canvasApi.removeEdge)
      canvasApi.removeEdge(canvas, previewEdge);
    previewEdge = null;
    previewParent = null;
  }

  function removePermanentIncoming(node) {
    if (originalRemoved)
      return;
    for (const edge of incomingEdges(node))
      canvasApi.removeEdge?.(canvas, edge);
    originalRemoved = originalEdges.length > 0;
  }

  function restoreOriginal() {
    if (!originalRemoved || !activeDraggedNode)
      return;
    for (const edge of originalEdges) {
      if (!edge.fromNode || !edge.toNode)
        continue;
      canvasApi.createEdge?.(
        canvas,
        edge.fromNode,
        edge.toNode,
        edge.fromSide,
        edge.toSide,
        edge.color
      );
    }
    originalRemoved = false;
  }

  function resetState() {
    activeDraggedNode = null;
    originalEdges = [];
    originalParent = null;
    originalRemoved = false;
    sessionForest = [];
    previewEdge = null;
    previewParent = null;
    state = "idle";
  }

  function begin(draggedNode) {
    if (activeDraggedNode)
      cancel();
    activeDraggedNode = draggedNode || null;
    sessionForest = draggedNode ? getForest?.() || [] : [];
    originalEdges = draggedNode
      ? incomingEdges(draggedNode).map(snapshotEdge)
      : [];
    originalParent = originalEdges[0]?.fromNode || null;
    originalRemoved = false;
    state = draggedNode ? "original" : "idle";
    return originalParent;
  }

  function getAllNodes() {
    if (canvas.nodes?.values)
      return Array.from(canvas.nodes.values());
    return canvas.getData?.().nodes || [];
  }

  function treeNodes(root) {
    const nodes = [];
    const stack = root ? [root] : [];
    while (stack.length > 0) {
      const tree = stack.pop();
      nodes.push(tree.canvasNode);
      stack.push(...(tree.children || []));
    }
    return nodes;
  }

  function chooseAttachmentMap(draggedNode) {
    const maps = sessionForest.map((root) => {
      const nodes = treeNodes(root).filter(
        (node) => node.id !== draggedNode.id &&
          !isDescendant(sessionForest, draggedNode.id, node.id)
      );
      if (nodes.length === 0)
        return null;
      const minX = Math.min(...nodes.map((node) => node.x));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxX = Math.max(...nodes.map((node) => node.x + node.width));
      const maxY = Math.max(...nodes.map((node) => node.y + node.height));
      const dx = Math.max(
        minX - (draggedNode.x + draggedNode.width),
        draggedNode.x - maxX,
        0
      );
      const dy = Math.max(
        minY - (draggedNode.y + draggedNode.height),
        draggedNode.y - maxY,
        0
      );
      const distance = Math.hypot(dx, dy);
      const contains = distance <= ATTACHMENT_DISTANCE;
      return { root: root.canvasNode, nodes, contains, distance };
    }).filter(Boolean);

    // Once the dragged card is inside a real map's rectangle, standalone
    // floating cards cannot steal its target.
    const containingMaps = maps.filter((map) => map.contains);
    const substantialMaps = containingMaps.filter((map) => map.nodes.length > 1);
    const candidates = substantialMaps.length > 0 ? substantialMaps : containingMaps;
    candidates.sort((a, b) =>
      // Inside overlapping buffered rectangles, the dominant tree owns the
      // gesture. This prevents a small floating tree/card embedded in the
      // visual footprint of the main map from stealing the dragged branch.
      b.nodes.length - a.nodes.length ||
      a.distance - b.distance
    );
    return candidates[0] || null;
  }

  function updatePreview(draggedNode) {
    if (!draggedNode) {
      cancel();
      return { state: "idle", target: null };
    }
    if (activeDraggedNode?.id !== draggedNode.id)
      begin(draggedNode);

    const forest = sessionForest;
    const allNodes = getAllNodes();
    const attachmentMap = chooseAttachmentMap(draggedNode);
    const candidate = attachmentMap?.root || null;
    const candidateRoot = attachmentMap?.root || null;
    const rayNodes = attachmentMap?.nodes || allNodes;
    const rayTarget = candidate
      ? attachmentMap.nodes.length === 1
        ? candidate
        : findNearestNodeOnBranch(
          draggedNode,
          rayNodes,
          candidateRoot,
          (rootId, targetId) => isDescendant(forest, rootId, targetId)
        )
      : null;
    const targetNode = rayTarget;
    const mainRootNode = targetNode
      ? getRootNode?.(targetNode) || targetNode
      : null;
    if (!targetNode) {
      removePreview();
      removePermanentIncoming(draggedNode);
      state = "detached";
      return { state, target: null };
    }

    if (previewEdge && previewParent?.id === targetNode.id)
      return { state: "preview", target: targetNode, incomingSide: previewEdge.to?.side || null };

    removePreview();
    removePermanentIncoming(draggedNode);
    const edge = createMindMapEdge(
      canvas,
      canvasApi,
      targetNode,
      draggedNode,
      mainRootNode,
      {
        preview: true,
        color: targetNode.color,
        curvature: 0.35
      }
    );
    if (!edge) {
      removePreview();
      restoreOriginal();
      state = "original";
      return { state, target: originalParent };
    }

    previewParent = targetNode;
    previewParent?.nodeEl?.addClass?.("tomindmap-reparent-target");
    previewEdge = edge;
    state = "preview";
    return { state, target: targetNode, incomingSide: edge.to?.side || null };
  }

  function commit(draggedNode) {
    if (!draggedNode || activeDraggedNode?.id !== draggedNode.id) {
      cancel();
      return { changed: false, state: "idle", target: null };
    }

    if (state === "preview" && previewParent) {
      const targetNode = previewParent;
      const incomingSide = previewEdge?.to?.side || null;
      removePreview();
      const attached = reparentSubtree(
        canvas,
        canvasApi,
        draggedNode,
        targetNode,
        "child",
        sessionForest,
        getRootNode?.(targetNode) || targetNode
      );
      if (!attached) {
        restoreOriginal();
        const result = { changed: false, state: "original", target: originalParent };
        resetState();
        return result;
      }
      const result = {
        changed: originalParent?.id !== targetNode.id,
        state: "attached",
        target: targetNode,
        incomingSide
      };
      resetState();
      return result;
    }

    if (state === "detached") {
      removePreview();
      for (const edge of incomingEdges(draggedNode))
        canvasApi.removeEdge?.(canvas, edge);
      const result = {
        changed: originalEdges.length > 0,
        state: "detached",
        target: null
      };
      resetState();
      return result;
    }

    // A meaningful drag that ends near the old parent keeps exactly one
    // incoming parent edge, repairing malformed multi-parent branches too.
    const hadSurplusParents = originalEdges.length > 1;
    restoreOriginal();
    if (hadSurplusParents) {
      const keepParentId = originalEdges[0]?.fromNode?.id;
      for (const edge of incomingEdges(draggedNode)) {
        if (edge.from?.node?.id !== keepParentId)
          canvasApi.removeEdge?.(canvas, edge);
      }
    }
    const result = {
      changed: hadSurplusParents,
      state: "original",
      target: originalParent
    };
    resetState();
    return result;
  }

  function cancel() {
    removePreview();
    restoreOriginal();
    resetState();
  }

  return {
    begin,
    updatePreview,
    commit,
    cancel
  };
}

module.exports = {
  createDragAttachmentController
};
