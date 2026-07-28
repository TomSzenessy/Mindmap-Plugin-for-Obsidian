"use strict";

const {
  ATTACHMENT_DISTANCE,
  createMindMapEdge,
  findFirstNodeOnCornerRay,
  findNearestAttachableNode,
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
  let originalSide = null;
  let sidePivot = null;
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
    if (previewEdge && canvasApi.removeEdge)
      canvasApi.removeEdge(canvas, previewEdge);
    previewEdge = null;
    previewParent = null;
  }

  function removePermanentIncoming(node) {
    for (const edge of incomingEdges(node))
      canvasApi.removeEdge?.(canvas, edge);
    originalRemoved = originalEdges.length > 0;
  }

  function restoreOriginal() {
    removePreview();
    if (!activeDraggedNode)
      return null;
    removePermanentIncoming(activeDraggedNode);
    const original = originalEdges[0];
    if (!original?.fromNode)
      return null;
    const edge = canvasApi.createEdge?.(
      canvas,
      original.fromNode,
      activeDraggedNode,
      original.fromSide,
      original.toSide,
      original.color
    ) || null;
    originalRemoved = !edge;
    return edge;
  }

  function resetState() {
    activeDraggedNode = null;
    originalEdges = [];
    originalParent = null;
    originalRemoved = false;
    originalSide = null;
    sidePivot = null;
    previewEdge = null;
    previewParent = null;
    state = "idle";
  }

  function begin(draggedNode) {
    if (activeDraggedNode)
      cancel();
    activeDraggedNode = draggedNode || null;
    originalEdges = draggedNode
      ? incomingEdges(draggedNode).map(snapshotEdge)
      : [];
    originalParent = originalEdges[0]?.fromNode || null;
    if (originalParent) {
      sidePivot = originalParent;
      const parentCenter = sidePivot.x + sidePivot.width / 2;
      const draggedCenter = draggedNode.x + draggedNode.width / 2;
      originalSide = draggedCenter >= parentCenter ? "right" : "left";
    }
    originalRemoved = false;
    state = draggedNode ? "original" : "idle";
    return originalParent;
  }

  function getAllNodes() {
    if (canvas.nodes?.values)
      return Array.from(canvas.nodes.values());
    return canvas.getData?.().nodes || [];
  }

  function updatePreview(draggedNode) {
    if (!draggedNode) {
      cancel();
      return { state: "idle", target: null };
    }
    if (activeDraggedNode?.id !== draggedNode.id)
      begin(draggedNode);

    const forest = getForest?.() || [];
    const allNodes = getAllNodes();
    const proximityNode = findNearestAttachableNode(
      draggedNode,
      allNodes,
      (rootId, targetId) => isDescendant(forest, rootId, targetId),
      ATTACHMENT_DISTANCE
    );
    const mainRootNode = proximityNode
      ? getRootNode?.(proximityNode) || proximityNode
      : null;
    const targetNode = proximityNode
      ? findFirstNodeOnCornerRay(
        draggedNode,
        allNodes,
        mainRootNode,
        (rootId, targetId) => isDescendant(forest, rootId, targetId)
      )
      : null;
    if (targetNode?.id === originalParent?.id) {
      if (previewEdge || originalRemoved)
        restoreOriginal();
      state = "original";
      return { state, target: originalParent };
    }

    if (!targetNode) {
      const parentCenter = sidePivot
        ? sidePivot.x + sidePivot.width / 2
        : null;
      const draggedCenter = draggedNode.x + draggedNode.width / 2;
      const currentSide = parentCenter === null
        ? null
        : draggedCenter >= parentCenter
          ? "right"
          : "left";
      if (originalParent && currentSide !== originalSide) {
        if (previewEdge || originalRemoved)
          restoreOriginal();
        state = "original";
        return { state, target: originalParent };
      }
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
      restoreOriginal();
      state = "original";
      return { state, target: originalParent };
    }

    previewParent = targetNode;
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
      removePermanentIncoming(draggedNode);
      const attached = reparentSubtree(
        canvas,
        canvasApi,
        draggedNode,
        targetNode,
        "child",
        getForest?.() || [],
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
      removePermanentIncoming(draggedNode);
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
    if (hadSurplusParents) {
      removePermanentIncoming(draggedNode);
      restoreOriginal();
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
    if (activeDraggedNode && (previewEdge || originalRemoved))
      restoreOriginal();
    else
      removePreview();
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
