"use strict";

function validCanvasNodeId(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isGroupRecord(record) {
  if (!record || typeof record !== "object")
    return false;
  const data = getCanvasNodeData(record);
  return (record.type ?? data.type) === "group" || record.label !== undefined;
}

function getGroupIds(canvas) {
  const ids = new Set();
  let data = null;
  try {
    data = typeof canvas?.getData === "function" ? canvas.getData() : null;
  } catch (_) {
    data = null;
  }
  if (data && typeof data === "object" && Array.isArray(data.nodes)) {
    for (const record of data.nodes) {
      const id = validCanvasNodeId(record?.id);
      if (id && isGroupRecord(record))
        ids.add(id);
    }
  }
  if (typeof canvas?.nodes?.values === "function") {
    for (const node of canvas.nodes.values()) {
      const id = validCanvasNodeId(node?.id);
      if (id && isGroupRecord(node))
        ids.add(id);
    }
  }
  return ids;
}

function walk(root, callback) {
  if (!root)
    return null;
  const stack = [root];
  const visited = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node))
      continue;
    visited.add(node);
    const result = callback(node);
    if (result !== undefined)
      return result;
    for (let index = node.children.length - 1; index >= 0; index--)
      stack.push(node.children[index]);
  }
  return null;
}

/**
 * Convert the free-form Canvas graph into a deterministic forest.
 *
 * Mind maps require one parent per topic and cannot contain directed cycles.
 * Canvas itself permits both, so malformed surplus edges are ignored in their
 * stable insertion order instead of making layout recurse forever.
 */
function isCollapsedCanvasNodeHidden(node) {
  const element = node?.nodeEl;
  const shell =
    element?.closest?.(".canvas-node") ||
    node?.containerEl?.closest?.(".canvas-node") ||
    node?.containerEl;
  return [element, shell].some(
    (candidate) =>
      candidate?.hasClass?.("tomindmap-collapsed-hidden") ||
      candidate?.classList?.contains?.("tomindmap-collapsed-hidden")
  );
}

function canvasDataRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function getCanvasNodeData(node) {
  let data = null;
  try {
    data = typeof node?.getData === "function" ? node.getData() : null;
  } catch (_) {
    data = null;
  }
  const record = canvasDataRecord(data);
  if (record)
    return record;
  try {
    return canvasDataRecord(node?.unknownData) || {};
  } catch (_) {
    return {};
  }
}

function isPersistedCollapsedNode(node) {
  return getCanvasNodeData(node).collapsed === true;
}

function buildForest(canvas, options = {}) {
  const includeHidden = options.includeHidden !== false;
  const groupIds = getGroupIds(canvas);
  const nodeMap = new Map();
  for (const canvasNode of canvas?.nodes?.values?.() || []) {
    const id = validCanvasNodeId(canvasNode?.id);
    if (!id || groupIds.has(id))
      continue;
    nodeMap.set(id, {
      id: canvasNode.id,
      canvasNode,
      parent: null,
      children: [],
      depth: 0,
      siblingIndex: 0,
      direction: null
    });
  }

  const componentParents = new Map(Array.from(nodeMap.keys(), (id) => [id, id]));
  const findComponent = (id) => {
    let root = id;
    while (componentParents.get(root) !== root)
      root = componentParents.get(root);
    while (componentParents.get(id) !== id) {
      const parent = componentParents.get(id);
      componentParents.set(id, root);
      id = parent;
    }
    return root;
  };
  const joinComponents = (left, right) => {
    const leftRoot = findComponent(left);
    const rightRoot = findComponent(right);
    if (leftRoot === rightRoot)
      return false;
    componentParents.set(rightRoot, leftRoot);
    return true;
  };

  const edgeList = typeof canvas?.edges?.values === "function"
    ? Array.from(canvas.edges.values())
    : Array.isArray(canvas?.edges)
      ? canvas.edges
      : Array.isArray(canvas?.getData?.()?.edges)
        ? canvas.getData().edges
        : [];
  for (const edge of edgeList) {
    if (!edge || edge.__mindMapPreview)
      continue;
    const fromId = validCanvasNodeId(edge.from?.node?.id || edge.from?.id || edge.fromNode);
    const toId = validCanvasNodeId(edge.to?.node?.id || edge.to?.id || edge.toNode);
    let parent = nodeMap.get(fromId);
    let child = nodeMap.get(toId);
    if (!parent || !child || parent === child)
      continue;
    if (edge.fromEnd === "arrow" && edge.toEnd !== "arrow") {
      const temp = parent;
      parent = child;
      child = temp;
    }
    if (child.parent)
      continue;
    if (!joinComponents(parent.canvasNode.id, child.canvasNode.id))
      continue;
    child.parent = parent;
    parent.children.push(child);
  }

  for (const treeNode of nodeMap.values()) {
    treeNode.children.sort((left, right) =>
      (Number(left.canvasNode.y) || 0) - (Number(right.canvasNode.y) || 0)
      || (Number(left.canvasNode.x) || 0) - (Number(right.canvasNode.x) || 0)
      || String(left.canvasNode.id).localeCompare(String(right.canvasNode.id))
    );
    treeNode.children.forEach((child, index) => {
      child.siblingIndex = index;
    });
  }

  const roots = Array.from(nodeMap.values()).filter((node) => !node.parent);
  for (const root of roots) {
    setDepths(root, 0);
    assignDirections(root);
  }
  const reachableCounts = new Map();
  for (const root of roots) {
    let count = 0;
    const pending = [root];
    const visited = new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      count += 1;
      for (let index = current.children.length - 1; index >= 0; index--)
        pending.push(current.children[index]);
    }
    reachableCounts.set(root, count);
  }
  roots.sort((left, right) =>
    reachableCounts.get(right) - reachableCounts.get(left)
    || (Number(left.canvasNode.y) || 0) - (Number(right.canvasNode.y) || 0)
    || (Number(left.canvasNode.x) || 0) - (Number(right.canvasNode.x) || 0)
    || String(left.canvasNode.id).localeCompare(String(right.canvasNode.id))
  );
  if (!includeHidden) {
    const hiddenIds = new Set();
    const pending = [...roots]
      .reverse()
      .map((node) => ({ node, hidden: false }));
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current?.node) continue;
      const node = current.node;
      if (current.hidden || isCollapsedCanvasNodeHidden(node.canvasNode)) {
        hiddenIds.add(node.id);
        for (let index = node.children.length - 1; index >= 0; index--)
          pending.push({ node: node.children[index], hidden: true });
        continue;
      }
      const childHidden = isPersistedCollapsedNode(node.canvasNode);
      for (let index = node.children.length - 1; index >= 0; index--)
        pending.push({ node: node.children[index], hidden: childHidden });
    }
    for (const id of hiddenIds) {
      const hiddenNode = nodeMap.get(id);
      const parent = hiddenNode?.parent;
      if (!parent) continue;
      const index = parent.children.indexOf(hiddenNode);
      if (index >= 0) parent.children.splice(index, 1);
      hiddenNode.parent = null;
    }
    return roots.filter((root) => !hiddenIds.has(root.id));
  }
  return roots;
}

function findTreeForNode(forest, nodeId) {
  for (const root of forest) {
    const found = findTreeNode(root, nodeId);
    if (found)
      return found;
  }
  return null;
}

function countReachable(root) {
  let count = 0;
  walk(root, () => {
    count++;
  });
  return count;
}

function setDepths(root, depth) {
  const stack = [{ node: root, depth }];
  const visited = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current.node || visited.has(current.node))
      continue;
    visited.add(current.node);
    current.node.depth = current.depth;
    for (let index = current.node.children.length - 1; index >= 0; index--) {
      stack.push({ node: current.node.children[index], depth: current.depth + 1 });
    }
  }
}

function findTreeNode(root, nodeId) {
  return walk(root, (node) => node.canvasNode.id === nodeId ? node : undefined);
}

function getDescendants(root) {
  const result = [];
  const stack = [...root.children].reverse();
  const visited = new Set([root]);
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node))
      continue;
    visited.add(node);
    result.push(node);
    for (let index = node.children.length - 1; index >= 0; index--)
      stack.push(node.children[index]);
  }
  return result;
}

function assignDirections(root) {
  const rootCenter = (Number(root.canvasNode.x) || 0) + (Number(root.canvasNode.width) || 0) / 2;
  for (const child of root.children) {
    const childCenter = (Number(child.canvasNode.x) || 0) + (Number(child.canvasNode.width) || 0) / 2;
    child.direction = childCenter >= rootCenter ? "right" : "left";
    propagateDirection(child, child.direction);
  }
}

function propagateDirection(root, direction) {
  const stack = [];
  for (let index = root.children.length - 1; index >= 0; index--)
    stack.push(root.children[index]);
  const visited = new Set([root]);
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node))
      continue;
    visited.add(node);
    node.direction = direction;
    for (let index = node.children.length - 1; index >= 0; index--)
      stack.push(node.children[index]);
  }
}

function countChildrenPerSide(root) {
  let left = 0;
  let right = 0;
  for (const child of root.children) {
    if (child.direction === "left")
      left++;
    else
      right++;
  }
  return { left, right };
}

/**
 * Tree-axis traversal target for spatial navigation.
 * - "left" / "right" walk the branch axis: travelling along the branch's own
 *   side descends to the nearest child, travelling back toward the centre
 *   ascends to the parent. A central topic picks its child on that side.
 * - "up" / "down" walk visual siblings on the same root side in Y order.
 * Returns null at tree edges so the flat navigator can decide about wrapping.
 */
function findTreeTraversalTarget(forest, nodeId, direction) {
  const node = findTreeForNode(forest, nodeId);
  if (!node)
    return null;
  if (direction === "up" || direction === "down") {
    if (!node.parent)
      return null;
    const siblings = node.parent.children.filter(
      (sibling) => sibling.direction === node.direction
    );
    const index = siblings.indexOf(node);
    if (index < 0)
      return null;
    const target2 = direction === "down" ? siblings[index + 1] : siblings[index - 1];
    return target2 || null;
  }
  if (direction !== "left" && direction !== "right")
    return null;
  if (!node.parent) {
    const candidates = node.children.filter(
      (child) => child.direction === direction
    );
    return nearestInY(candidates, node);
  }
  if (direction === node.direction)
    return nearestInY(node.children, node);
  return node.parent;
}

function nearestInY(candidates, anchor) {
  if (candidates.length === 0)
    return null;
  const anchorCenter = (Number(anchor.canvasNode.y) || 0) + (Number(anchor.canvasNode.height) || 0) / 2;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const center = (Number(candidate.canvasNode.y) || 0) + (Number(candidate.canvasNode.height) || 0) / 2;
    const distance = Math.abs(center - anchorCenter);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

module.exports = {
  buildForest,
  getGroupIds,
  findTreeForNode,
  countReachable,
  setDepths,
  findTreeNode,
  getDescendants,
  assignDirections,
  propagateDirection,
  countChildrenPerSide,
  findTreeTraversalTarget
};
