"use strict";

const ATTACHMENT_DISTANCE = 180;

const treeModel = (
  typeof require === "function"
    ? (() => {
        try {
          return require("./tree-model.js");
        } catch (_) {
          return {};
        }
      })()
    : {}
) || {};

function getFindTreeForNode() {
  return (
    treeModel.findTreeForNode ||
    (typeof findTreeForNode === "function" ? findTreeForNode : null)
  );
}

function getGetDescendants() {
  return (
    treeModel.getDescendants ||
    (typeof getDescendants === "function" ? getDescendants : null)
  );
}

function getNodeCenter(node) {
  return {
    x: Number(node?.x || 0) + Number(node?.width || 0) / 2,
    y: Number(node?.y || 0) + Number(node?.height || 0) / 2
  };
}

/**
 * Determine which side of the main/root node a topic currently occupies.
 *
 * Right-side topic:
 *   parent right -> child left
 *
 * Left-side topic:
 *   parent left -> child right
 */
function getBranchSide(node, mainRootNode) {
  if (!node || !mainRootNode) {
    return "right";
  }

  return getNodeCenter(node).x >= getNodeCenter(mainRootNode).x
    ? "right"
    : "left";
}

function getConnectionSides(childNode, mainRootNode, parentNode = null) {
  // Once a branch exists, its parent determines its immutable left/right side.
  // Only a direct child of the central root uses its own dragged position.
  const sideAnchor = parentNode && parentNode.id !== mainRootNode?.id
    ? parentNode
    : childNode;
  const branchSide = getBranchSide(sideAnchor, mainRootNode);

  if (branchSide === "right") {
    return {
      branchSide,
      fromSide: "right",
      toSide: "left"
    };
  }

  return {
    branchSide,
    fromSide: "left",
    toSide: "right"
  };
}

function classifyDropZone(targetNode, point) {
  if (!targetNode || !point) {
    return "child";
  }

  const width = Math.max(1, Number(targetNode.width) || 1);
  const height = Math.max(1, Number(targetNode.height) || 1);

  const relX =
    (Number(point.x || 0) - Number(targetNode.x || 0)) / width;
  const relY =
    (Number(point.y || 0) - Number(targetNode.y || 0)) / height;

  if (
    relX >= 0.2 &&
    relX <= 0.8 &&
    relY >= 0.2 &&
    relY <= 0.8
  ) {
    return "child";
  }

  if (relY < 0.2) {
    return "sibling-above";
  }

  if (relY > 0.8) {
    return "sibling-below";
  }

  if (relX < 0.2) {
    return "sibling-left";
  }

  if (relX > 0.8) {
    return "sibling-right";
  }

  return "child";
}

/**
 * Returns true when targetId is rootId itself or belongs to its subtree.
 */
function isDescendant(forest, rootId, targetId) {
  if (!rootId || !targetId) {
    return false;
  }

  if (rootId === targetId) {
    return true;
  }

  const findFn = getFindTreeForNode();
  const descendantsFn = getGetDescendants();

  if (!findFn || !descendantsFn) {
    return false;
  }

  const treeNode = findFn(forest, rootId);

  if (!treeNode) {
    return false;
  }

  const descendants = descendantsFn(treeNode);

  return descendants.some(
    (item) => item?.canvasNode?.id === targetId
  );
}

/**
 * Distance from point C to finite segment A-B.
 *
 * `t` is deliberately returned unclamped:
 *   t < 0: before A
 *   0..1: between A and B
 *   t > 1: beyond B
 */
function pointToSegmentDistance(C, A, B) {
  const vx = B.x - A.x;
  const vy = B.y - A.y;
  const lengthSquared = vx * vx + vy * vy;

  if (lengthSquared === 0) {
    const dx = C.x - A.x;
    const dy = C.y - A.y;

    return {
      dist: Math.hypot(dx, dy),
      t: 0,
      clampedT: 0,
      proj: {
        x: A.x,
        y: A.y
      }
    };
  }

  const t =
    ((C.x - A.x) * vx + (C.y - A.y) * vy) /
    lengthSquared;

  const clampedT = Math.max(0, Math.min(1, t));

  const projectedPoint = {
    x: A.x + clampedT * vx,
    y: A.y + clampedT * vy
  };

  return {
    dist: Math.hypot(
      C.x - projectedPoint.x,
      C.y - projectedPoint.y
    ),
    t,
    clampedT,
    proj: projectedPoint
  };
}

/**
 * Approximate distance between a point and a node's rectangular bounds.
 *
 * Returns zero if the point lies inside the node.
 */
function pointToNodeDistance(point, node) {
  const left = Number(node.x || 0);
  const top = Number(node.y || 0);
  const right = left + Math.max(1, Number(node.width) || 1);
  const bottom = top + Math.max(1, Number(node.height) || 1);

  const dx = Math.max(left - point.x, 0, point.x - right);
  const dy = Math.max(top - point.y, 0, point.y - bottom);

  return Math.hypot(dx, dy);
}

/**
 * Shortest edge-to-edge distance between two rectangular Canvas nodes.
 *
 * This is deliberately a fixed local distance, not a radius around a root or
 * around the complete graph. Overlapping/touching cards have distance zero.
 */
function nodeToNodeDistance(leftNode, rightNode) {
  if (!leftNode || !rightNode)
    return Infinity;
  const left = Number(leftNode.x || 0);
  const top = Number(leftNode.y || 0);
  const right = left + Math.max(1, Number(leftNode.width) || 1);
  const bottom = top + Math.max(1, Number(leftNode.height) || 1);
  const otherLeft = Number(rightNode.x || 0);
  const otherTop = Number(rightNode.y || 0);
  const otherRight = otherLeft + Math.max(1, Number(rightNode.width) || 1);
  const otherBottom = otherTop + Math.max(1, Number(rightNode.height) || 1);
  const dx = Math.max(left - otherRight, otherLeft - right, 0);
  const dy = Math.max(top - otherBottom, otherTop - bottom, 0);
  return Math.hypot(dx, dy);
}

function getNodeCorners(node) {
  const left = Number(node?.x || 0);
  const top = Number(node?.y || 0);
  const right = left + Math.max(1, Number(node?.width) || 1);
  const bottom = top + Math.max(1, Number(node?.height) || 1);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom }
  ];
}

function closestPointOnNode(point, node) {
  const left = Number(node?.x || 0);
  const top = Number(node?.y || 0);
  const right = left + Math.max(1, Number(node?.width) || 1);
  const bottom = top + Math.max(1, Number(node?.height) || 1);
  return {
    x: Math.max(left, Math.min(right, Number(point?.x || 0))),
    y: Math.max(top, Math.min(bottom, Number(point?.y || 0)))
  };
}

function closestCornerToNode(node, targetNode) {
  let bestCorner = null;
  let bestDistance = Infinity;
  for (const corner of getNodeCorners(node)) {
    const targetPoint = closestPointOnNode(corner, targetNode);
    const distance = Math.hypot(
      targetPoint.x - corner.x,
      targetPoint.y - corner.y
    );
    if (distance < bestDistance) {
      bestCorner = corner;
      bestDistance = distance;
    }
  }
  return bestCorner;
}

/**
 * Return where segment start-end first enters a rectangular node, or null.
 * The result is progress along the finite segment: 0 is start and 1 is end.
 */
function segmentNodeEntry(start, end, node) {
  const left = Number(node?.x || 0);
  const top = Number(node?.y || 0);
  const right = left + Math.max(1, Number(node?.width) || 1);
  const bottom = top + Math.max(1, Number(node?.height) || 1);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let entry = 0;
  let exit = 1;

  for (const [origin, direction, minimum, maximum] of [
    [start.x, dx, left, right],
    [start.y, dy, top, bottom]
  ]) {
    if (Math.abs(direction) < 1e-9) {
      if (origin < minimum || origin > maximum)
        return null;
      continue;
    }
    const first = (minimum - origin) / direction;
    const second = (maximum - origin) / direction;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit)
      return null;
  }
  return entry >= 0 && entry <= 1 ? entry : null;
}

/**
 * Follow the exact edge-to-root line requested by the drag interaction:
 * start at the dragged card corner closest to the central root, then select
 * the first card whose bounds that finite segment enters. If there is no
 * intervening card, the central root is the prospective parent.
 */
function findFirstNodeOnCornerRay(
  draggedNode,
  allNodes,
  mainRootNode,
  isDescendantFn = null
) {
  if (!draggedNode || !mainRootNode || draggedNode.id === mainRootNode.id)
    return null;
  const start = closestCornerToNode(draggedNode, mainRootNode);
  const end = closestPointOnNode(start, mainRootNode);
  let bestNode = null;
  let bestEntry = Infinity;
  for (const node of Array.isArray(allNodes) ? allNodes : Array.from(allNodes || [])) {
    const type = node?.unknownData?.type || node?.type;
    if (
      !node ||
      node.id === draggedNode.id ||
      node.id === mainRootNode.id ||
      type === "group" ||
      (isDescendantFn && isDescendantFn(draggedNode.id, node.id))
    ) {
      continue;
    }
    const entry = segmentNodeEntry(start, end, node);
    if (entry !== null && entry < bestEntry) {
      bestNode = node;
      bestEntry = entry;
    }
  }
  return bestNode || mainRootNode;
}

function findNearestAttachableNode(
  draggedNode,
  allNodes,
  isDescendantFn = null,
  maximumDistance = ATTACHMENT_DISTANCE
) {
  if (!draggedNode)
    return null;
  const nodes = Array.isArray(allNodes)
    ? allNodes
    : Array.from(allNodes || []);
  const draggedCenter = getNodeCenter(draggedNode);
  let bestNode = null;
  let bestDistance = Math.max(0, Number(maximumDistance) || 0);
  let bestCenterDistance = Infinity;
  for (const node of nodes) {
    const type = node?.unknownData?.type || node?.type;
    if (
      !node ||
      node.id === draggedNode.id ||
      type === "group" ||
      (isDescendantFn && isDescendantFn(draggedNode.id, node.id))
    ) {
      continue;
    }
    const distance = nodeToNodeDistance(draggedNode, node);
    if (distance > bestDistance)
      continue;
    const center = getNodeCenter(node);
    const centerDistance = Math.hypot(
      center.x - draggedCenter.x,
      center.y - draggedCenter.y
    );
    if (
      distance < bestDistance - 0.0001 ||
      Math.abs(distance - bestDistance) <= 0.0001 &&
        centerDistance < bestCenterDistance
    ) {
      bestNode = node;
      bestDistance = distance;
      bestCenterDistance = centerDistance;
    }
  }
  return bestNode;
}

/**
 * Find the first valid node encountered while moving from the dragged node
 * toward the main root.
 *
 * The important comparison is `t`, not merely Euclidean distance:
 *
 *   t = 0 is the dragged node
 *   t = 1 is the root
 *
 * Therefore, the smallest valid positive t is the first node on the path.
 */
function findClosestNodeOnRay(
  draggedNode,
  allNodes,
  mainRootNode,
  isDescendantFn = null,
  options = {}
) {
  if (!draggedNode || !mainRootNode) {
    return null;
  }

  if (draggedNode.id === mainRootNode.id) {
    return null;
  }

  const nodes = Array.isArray(allNodes)
    ? allNodes
    : Array.from(allNodes || []);

  const draggedCenter = getNodeCenter(draggedNode);
  const rootCenter = getNodeCenter(mainRootNode);

  const {
    corridorWidth = 90,
    minimumProgress = 0.025,
    maximumProgress = 1.025
  } = options;

  let bestNode = null;
  let bestProgress = Infinity;
  let bestPerpendicularDistance = Infinity;

  for (const node of nodes) {
    if (!node) {
      continue;
    }

    if (
      node.id === draggedNode.id ||
      node.id === mainRootNode.id ||
      node.type === "group"
    ) {
      continue;
    }

    if (
      isDescendantFn &&
      isDescendantFn(draggedNode.id, node.id)
    ) {
      continue;
    }

    const nodeCenter = getNodeCenter(node);

    const result = pointToSegmentDistance(
      nodeCenter,
      draggedCenter,
      rootCenter
    );

    if (
      result.t < minimumProgress ||
      result.t > maximumProgress
    ) {
      continue;
    }

    /*
     * Account for the node's dimensions. A line may pass through the node
     * even when it does not pass close to the exact center.
     */
    const distanceToBounds = pointToNodeDistance(
      result.proj,
      node
    );

    if (distanceToBounds > corridorWidth) {
      continue;
    }

    const isEarlierOnPath =
      result.t < bestProgress - 0.0001;

    const isSamePositionButCloser =
      Math.abs(result.t - bestProgress) <= 0.0001 &&
      distanceToBounds < bestPerpendicularDistance;

    if (isEarlierOnPath || isSamePositionButCloser) {
      bestNode = node;
      bestProgress = result.t;
      bestPerpendicularDistance = distanceToBounds;
    }
  }

  return bestNode || mainRootNode;
}

function removeIncomingParentEdges(
  canvas,
  canvasApi,
  draggedNode
) {
  if (!canvasApi.getIncomingEdges) {
    return;
  }

  const incomingEdges =
    canvasApi.getIncomingEdges(canvas, draggedNode) || [];

  for (const edge of incomingEdges) {
    if (canvasApi.removeEdge) {
      canvasApi.removeEdge(canvas, edge);
    }
  }
}

function applyCurvedArrowStyle(
  canvas,
  canvasApi,
  edge,
  options = {}
) {
  if (!edge) {
    return;
  }

  const {
    preview = false,
    color,
    curvature = 0.35
  } = options;

  /*
   * Different Canvas wrappers expose different APIs. These fallbacks let
   * the same logic work without crashing when one method is unavailable.
   */
  if (canvasApi.setEdgeCurved) {
    canvasApi.setEdgeCurved(canvas, edge, true, curvature);
  } else if (canvasApi.updateEdge) {
    canvasApi.updateEdge(canvas, edge, {
      lineType: "curved",
      curve: true,
      curvature
    });
  } else {
    edge.lineType = "curved";
    edge.curve = true;
    edge.curvature = curvature;
  }

  if (canvasApi.setEdgeArrow) {
    canvasApi.setEdgeArrow(canvas, edge, "to");
  } else if (canvasApi.updateEdge) {
    canvasApi.updateEdge(canvas, edge, {
      fromEnd: "none",
      toEnd: "arrow"
    });
  } else {
    edge.fromEnd = "none";
    edge.toEnd = "arrow";
  }

  if (color) {
    if (canvasApi.setEdgeColor) {
      canvasApi.setEdgeColor(canvas, edge, color);
    } else {
      edge.color = color;
    }
  }

  if (preview) {
    edge.__mindMapPreview = true;
  }

  canvas?.requestFrame?.();
}

/**
 * Create a parent-child edge with correctly mirrored attachment points.
 */
function createMindMapEdge(
  canvas,
  canvasApi,
  parentNode,
  childNode,
  mainRootNode,
  options = {}
) {
  if (
    !canvas ||
    !canvasApi ||
    !parentNode ||
    !childNode ||
    !canvasApi.createEdge
  ) {
    return null;
  }

  const { fromSide, toSide } = getConnectionSides(
    childNode,
    mainRootNode,
    parentNode
  );

  const color =
    options.color ??
    parentNode.color ??
    childNode.color ??
    undefined;

  const edge = canvasApi.createEdge(
    canvas,
    parentNode,
    childNode,
    fromSide,
    toSide,
    color
  );

  applyCurvedArrowStyle(canvas, canvasApi, edge, {
    preview: Boolean(options.preview),
    color,
    curvature: options.curvature ?? 0.35
  });

  return edge;
}

/**
 * Move a subtree under a new parent.
 *
 * For sibling drop zones, the target's parent becomes the new parent.
 */
function reparentSubtree(
  canvas,
  canvasApi,
  draggedNode,
  targetNode,
  dropZone = "child",
  forest = [],
  mainRootNode = null
) {
  if (
    !canvas ||
    !canvasApi ||
    !draggedNode ||
    !targetNode
  ) {
    return false;
  }

  if (draggedNode.id === targetNode.id) {
    return false;
  }

  if (
    forest.length > 0 &&
    isDescendant(forest, draggedNode.id, targetNode.id)
  ) {
    return false;
  }

  let newParent = targetNode;

  if (dropZone !== "child") {
    newParent = canvasApi.getParentNode
      ? canvasApi.getParentNode(canvas, targetNode)
      : null;

    /*
     * A root node has no parent. Dropping beside it therefore means
     * attaching directly to the root.
     */
    if (!newParent) {
      newParent = targetNode;
    }
  }

  if (
    !newParent ||
    newParent.id === draggedNode.id
  ) {
    return false;
  }

  if (
    forest.length > 0 &&
    isDescendant(forest, draggedNode.id, newParent.id)
  ) {
    return false;
  }

  /*
   * Remove old edges only after all validation has succeeded. Previously,
   * invalid drops could leave the node disconnected.
   */
  removeIncomingParentEdges(canvas, canvasApi, draggedNode);

  const edge = createMindMapEdge(
    canvas,
    canvasApi,
    newParent,
    draggedNode,
    mainRootNode || newParent,
    {
      preview: false,
      color: newParent.color
    }
  );

  return Boolean(edge);
}

function isWithinGraphBounds(
  draggedNode,
  allNodes,
  paddingRatio = 0.2
) {
  if (!draggedNode) {
    return false;
  }

  const nodes = Array.isArray(allNodes)
    ? allNodes
    : Array.from(allNodes || []);

  const otherNodes = nodes.filter(
    (node) =>
      node &&
      node.id !== draggedNode.id &&
      node.type !== "group"
  );

  if (otherNodes.length === 0) {
    return false;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of otherNodes) {
    const x = Number(node.x || 0);
    const y = Number(node.y || 0);
    const width = Math.max(1, Number(node.width) || 1);
    const height = Math.max(1, Number(node.height) || 1);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);

  const paddingX = graphWidth * paddingRatio;
  const paddingY = graphHeight * paddingRatio;

  const center = getNodeCenter(draggedNode);

  return (
    center.x >= minX - paddingX &&
    center.x <= maxX + paddingX &&
    center.y >= minY - paddingY &&
    center.y <= maxY + paddingY
  );
}

function isWithinAttachmentRadius(
  draggedNode,
  mainRootNode,
  radius = 500
) {
  if (!draggedNode || !mainRootNode) {
    return false;
  }

  const draggedCenter = getNodeCenter(draggedNode);
  const rootCenter = getNodeCenter(mainRootNode);

  return (
    Math.hypot(
      draggedCenter.x - rootCenter.x,
      draggedCenter.y - rootCenter.y
    ) <= radius
  );
}

module.exports = {
  ATTACHMENT_DISTANCE,
  applyCurvedArrowStyle,
  classifyDropZone,
  createMindMapEdge,
  closestCornerToNode,
  closestPointOnNode,
  findClosestNodeOnRay,
  findFirstNodeOnCornerRay,
  findNearestAttachableNode,
  getBranchSide,
  getConnectionSides,
  getNodeCorners,
  getNodeCenter,
  isDescendant,
  isWithinAttachmentRadius,
  isWithinGraphBounds,
  nodeToNodeDistance,
  pointToNodeDistance,
  pointToSegmentDistance,
  segmentNodeEntry,
  removeIncomingParentEdges,
  reparentSubtree
};
