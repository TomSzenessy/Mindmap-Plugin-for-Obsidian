"use strict";

const { buildForest, getDescendants, findTreeNode, countReachable, setDepths, assignDirections } = require("./tree-model.js");

function getCenter(node) {
  return {
    cx: node.x + node.width / 2,
    cy: node.y + node.height / 2
  };
}
function computeEdgeSides(fromNode, toNode) {
  const fromCenter = getCenter(fromNode);
  const toCenter = getCenter(toNode);
  const dx = toCenter.cx - fromCenter.cx;
  if (dx >= 0) {
    return { fromSide: "right", toSide: "left" };
  } else {
    return { fromSide: "left", toSide: "right" };
  }
}
function updateAllEdgeSides(canvas) {
  let changed = false;
  for (const edge of canvas.edges.values()) {
    if (edge.__mindMapPreview)
      continue;
    const fromNode = edge.from.node;
    const toNode = edge.to.node;
    if (!fromNode || !toNode)
      continue;
    const { fromSide, toSide } = computeEdgeSides(fromNode, toNode);
    if (edge.from.side !== fromSide || edge.to.side !== toSide) {
      edge.from.side = fromSide;
      edge.to.side = toSide;
      changed = true;
    }
  }
  if (changed) {
    canvas.requestFrame();
    canvas.requestSave();
  }
}
function registerDragEndHandler(canvas) {
  var _a, _b;
  let lastMoveUpdate = 0;
  const THROTTLE_MS = 40;
  const moveHandler = (e) => {
    if (e.buttons === 0)
      return;
    const now = Date.now();
    if (now - lastMoveUpdate < THROTTLE_MS)
      return;
    lastMoveUpdate = now;
    updateAllEdgeSides(canvas);
  };
  const upHandler = () => {
    updateAllEdgeSides(canvas);
  };
  (_a = canvas.wrapperEl) == null ? void 0 : _a.addEventListener("pointermove", moveHandler);
  (_b = canvas.wrapperEl) == null ? void 0 : _b.addEventListener("pointerup", upHandler);
  return () => {
    var _a2, _b2;
    (_a2 = canvas.wrapperEl) == null ? void 0 : _a2.removeEventListener("pointermove", moveHandler);
    (_b2 = canvas.wrapperEl) == null ? void 0 : _b2.removeEventListener("pointerup", upHandler);
  };
}

// src/mindmap/layout-engine.ts
var DEFAULT_CONFIG = {
  horizontalGap: 80,
  verticalGap: 20,
  nodeWidth: 300,
  nodeHeight: 60,
  animate: true
};
var LayoutEngine = class {
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Recalculate and apply layout to all trees in the canvas.
   * Each root's children are partitioned into left/right groups and
   * laid out independently, centered around their own root.
   */
  layout(canvas) {
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    const positions = /* @__PURE__ */ new Map();
    for (const root of forest) {
      const rootX = root.canvasNode.x;
      const rootY = root.canvasNode.y;
      positions.set(root.canvasNode.id, { x: rootX, y: rootY });
      const { rightChildren, leftChildren } = this.balanceRootChildren(root);
      this.layoutGroup(root, rightChildren, "right", rootX, rootY, positions);
      this.layoutGroup(root, leftChildren, "left", rootX, rootY, positions);
    }
    this.applyPositions(canvas, positions);
    updateAllEdgeSides(canvas);
  }
  /**
   * Partially re-layout only the children of a specific parent node
   * (and their subtrees). The parent stays in place; everything
   * outside this parent's subtree is untouched.
   */
  layoutChildren(canvas, parentNodeId) {
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    const parentTreeNode = findTreeForNode(forest, parentNodeId);
    if (!parentTreeNode || parentTreeNode.children.length === 0)
      return;
    const positions = /* @__PURE__ */ new Map();
    if (!parentTreeNode.parent) {
      const { rightChildren, leftChildren } = this.balanceRootChildren(parentTreeNode);
      const rootX = parentTreeNode.canvasNode.x;
      const rootY = parentTreeNode.canvasNode.y;
      this.layoutGroup(parentTreeNode, rightChildren, "right", rootX, rootY, positions);
      this.layoutGroup(parentTreeNode, leftChildren, "left", rootX, rootY, positions);
    } else {
      const px = parentTreeNode.canvasNode.x;
      const py = parentTreeNode.canvasNode.y;
      const direction = parentTreeNode.direction || (parentTreeNode.canvasNode.x >= parentTreeNode.parent.canvasNode.x ? "right" : "left");
      propagateDirection(parentTreeNode, direction);
      this.layoutGroup(parentTreeNode, parentTreeNode.children, direction, px, py, positions);
    }
    this.applyPositions(canvas, positions);
    updateAllEdgeSides(canvas);
  }
  /**
   * Preserve the visible branch order (right top-to-bottom, then left
   * top-to-bottom) and choose the split that best balances rendered subtree
   * height. This permits unequal topic counts when a few tall branches occupy
   * the same visual height as several short ones.
   */
  balanceRootChildren(root) {
    const rootCx = root.canvasNode.x + root.canvasNode.width / 2;
    const byPosition = (a, b) => a.canvasNode.y - b.canvasNode.y || a.canvasNode.x - b.canvasNode.x || String(a.canvasNode.id).localeCompare(String(b.canvasNode.id));
    const right = root.children.filter((child) => child.canvasNode.x + child.canvasNode.width / 2 >= rootCx).sort(byPosition);
    const left = root.children.filter((child) => child.canvasNode.x + child.canvasNode.width / 2 < rootCx).sort(byPosition);
    const ordered = [...right, ...left];
    root.children = ordered;
    if (ordered.length === 0)
      return { rightChildren: [], leftChildren: [] };
    const heights = ordered.map((child) => this.measureSubtreeHeight(child));
    const heightPrefix = [0];
    for (const height of heights)
      heightPrefix.push(heightPrefix[heightPrefix.length - 1] + height);
    const groupHeight = (start, end) => {
      const count = end - start;
      if (count <= 0)
        return 0;
      return heightPrefix[end] - heightPrefix[start] + this.config.verticalGap * (count - 1);
    };
    let split = ordered.length === 1 ? 1 : Math.ceil(ordered.length / 2);
    if (ordered.length > 1) {
      let best = null;
      for (let candidate = 1; candidate < ordered.length; candidate++) {
        const rightHeight = groupHeight(0, candidate);
        const leftHeight = groupHeight(candidate, ordered.length);
        const score = {
          difference: Math.abs(rightHeight - leftHeight),
          countDifference: Math.abs(candidate - (ordered.length - candidate)),
          rightPreference: Math.abs(candidate - Math.ceil(ordered.length / 2))
        };
        if (!best || score.difference < best.score.difference || score.difference === best.score.difference && (score.countDifference < best.score.countDifference || score.countDifference === best.score.countDifference && score.rightPreference < best.score.rightPreference)) {
          best = { candidate, score };
        }
      }
      split = best.candidate;
    }
    const rightChildren = ordered.slice(0, split);
    const leftChildren = ordered.slice(split);
    for (const child of rightChildren) {
      child.direction = "right";
      propagateDirection(child, "right");
    }
    for (const child of leftChildren) {
      child.direction = "left";
      propagateDirection(child, "left");
    }
    return { rightChildren, leftChildren };
  }
  measureSubtreeHeight(node) {
    const heights = /* @__PURE__ */ new Map();
    const stack = [{ node, expanded: false }];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current.expanded) {
        stack.push({ node: current.node, expanded: true });
        for (let index = current.node.children.length - 1; index >= 0; index--)
          stack.push({ node: current.node.children[index], expanded: false });
        continue;
      }
      const ownHeight = current.node.canvasNode.height || this.config.nodeHeight;
      let childHeight = 0;
      for (let index = 0; index < current.node.children.length; index++) {
        if (index > 0)
          childHeight += this.config.verticalGap;
        childHeight += heights.get(current.node.children[index]) || 0;
      }
      heights.set(current.node, Math.max(ownHeight, childHeight));
    }
    return heights.get(node) || this.config.nodeHeight;
  }
  /**
   * Layout a group of same-side children, vertically centered around root.
   * Uses contour-based packing for compact spacing.
   */
  layoutGroup(root, children, direction, rootX, rootY, positions) {
    if (children.length === 0)
      return;
    const rootH = root.canvasNode.height || this.config.nodeHeight;
    const rootW = root.canvasNode.width || this.config.nodeWidth;
    const rootCenterY = rootY + rootH / 2;
    const subtrees = [];
    for (const child of children) {
      const childW = child.canvasNode.width || this.config.nodeWidth;
      const childX = direction === "right" ? rootX + rootW + this.config.horizontalGap : rootX - childW - this.config.horizontalGap;
      const tempPositions = /* @__PURE__ */ new Map();
      const layout = this.layoutSubtree(
        child,
        childX,
        0,
        0,
        direction,
        tempPositions
      );
      subtrees.push({ positions: tempPositions, contour: layout.contour, rectangles: layout.rectangles });
    }
    const { yOffsets, combinedContour } = this.packSubtrees(subtrees);
    const contourExtents = Array.from(combinedContour.values());
    const blockTop = Math.min(...contourExtents.map((extent) => extent.top));
    const blockBottom = Math.max(...contourExtents.map((extent) => extent.bottom));
    const globalShift = rootCenterY - (blockTop + blockBottom) / 2;
    for (let i = 0; i < subtrees.length; i++) {
      const yShift = yOffsets[i] + globalShift;
      for (const [id, pos] of subtrees[i].positions) {
        positions.set(id, { x: pos.x, y: pos.y + yShift });
      }
    }
  }
  /**
   * Recursively lay out a node and all its descendants.
   * Returns the contour (vertical extent per depth column).
   */
  layoutSubtree(node, nodeX, nodeY, depth, direction, positions) {
    const nodeH = node.canvasNode.height || this.config.nodeHeight;
    const nodeW = node.canvasNode.width || this.config.nodeWidth;
    positions.set(node.canvasNode.id, { x: nodeX, y: nodeY });
    const contour = /* @__PURE__ */ new Map();
    contour.set(depth, { top: nodeY, bottom: nodeY + nodeH });
    const ownRectangle = { left: nodeX, right: nodeX + nodeW, top: nodeY, bottom: nodeY + nodeH };
    if (node.children.length === 0)
      return { contour, rectangles: [ownRectangle] };
    const childSubtrees = [];
    for (const child of node.children) {
      const childW = child.canvasNode.width || this.config.nodeWidth;
      const childX = direction === "right" ? nodeX + nodeW + this.config.horizontalGap : nodeX - childW - this.config.horizontalGap;
      const tempPositions = /* @__PURE__ */ new Map();
      const childLayout = this.layoutSubtree(
        child,
        childX,
        0,
        depth + 1,
        direction,
        tempPositions
      );
      childSubtrees.push({ positions: tempPositions, contour: childLayout.contour, rectangles: childLayout.rectangles });
    }
    const { yOffsets, combinedContour, combinedRectangles } = this.packSubtrees(childSubtrees);
    const contourExtents = Array.from(combinedContour.values());
    const blockTop = Math.min(...contourExtents.map((extent) => extent.top));
    const blockBottom = Math.max(...contourExtents.map((extent) => extent.bottom));
    const centerShift = nodeY + nodeH / 2 - (blockTop + blockBottom) / 2;
    for (let i = 0; i < childSubtrees.length; i++) {
      const yShift = yOffsets[i] + centerShift;
      for (const [id, pos] of childSubtrees[i].positions) {
        positions.set(id, { x: pos.x, y: pos.y + yShift });
      }
    }
    for (const [d, ext] of combinedContour) {
      const shifted = { top: ext.top + centerShift, bottom: ext.bottom + centerShift };
      const existing = contour.get(d);
      if (existing) {
        if (shifted.top < existing.top)
          existing.top = shifted.top;
        if (shifted.bottom > existing.bottom)
          existing.bottom = shifted.bottom;
      } else {
        contour.set(d, { ...shifted });
      }
    }
    const rectangles = [ownRectangle];
    for (const rectangle of combinedRectangles) {
      rectangles.push({
        left: rectangle.left,
        right: rectangle.right,
        top: rectangle.top + centerShift,
        bottom: rectangle.bottom + centerShift
      });
    }
    return { contour, rectangles };
  }
  /**
   * Pack an array of subtrees vertically using contour comparison.
   * First subtree stays at y=0; each subsequent one is shifted down
   * just enough to clear the combined contour at all shared depths.
   */
  packSubtrees(subtrees) {
    if (subtrees.length === 0) {
      return { yOffsets: [], combinedContour: /* @__PURE__ */ new Map(), combinedRectangles: [] };
    }
    const yOffsets = [0];
    const combinedContour = /* @__PURE__ */ new Map();
    const combinedRectangles = (subtrees[0].rectangles || []).map((rectangle) => ({ ...rectangle }));
    for (const [d, ext] of subtrees[0].contour) {
      combinedContour.set(d, { top: ext.top, bottom: ext.bottom });
    }
    for (let i = 1; i < subtrees.length; i++) {
      const sub = subtrees[i];
      let shift = 0;
      for (const rectangle of sub.rectangles || []) {
        for (const previous of combinedRectangles) {
          const overlapsHorizontally = rectangle.left < previous.right && rectangle.right > previous.left;
          if (!overlapsHorizontally)
            continue;
          const needed = previous.bottom + this.config.verticalGap - rectangle.top;
          if (needed > shift)
            shift = needed;
        }
      }
      yOffsets.push(shift);
      for (const [d, ext] of sub.contour) {
        const shifted = { top: ext.top + shift, bottom: ext.bottom + shift };
        const existing = combinedContour.get(d);
        if (existing) {
          if (shifted.top < existing.top)
            existing.top = shifted.top;
          if (shifted.bottom > existing.bottom)
            existing.bottom = shifted.bottom;
        } else {
          combinedContour.set(d, { ...shifted });
        }
      }
      for (const rectangle of sub.rectangles || []) {
        combinedRectangles.push({
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top + shift,
          bottom: rectangle.bottom + shift
        });
      }
    }
    return { yOffsets, combinedContour, combinedRectangles };
  }
  /**
   * Arrange multiple trees within a group using flow-based packing.
   * Lays out each tree internally first, then packs them into rows
   * targeting a roughly square overall shape.
   */
  layoutForest(canvas, groupId) {
    const group = canvas.nodes.get(groupId);
    if (!group)
      return;
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    const roots = forest.filter((root) => {
      const cx = root.canvasNode.x + root.canvasNode.width / 2;
      const cy = root.canvasNode.y + root.canvasNode.height / 2;
      return cx >= group.x && cx <= group.x + group.width && cy >= group.y && cy <= group.y + group.height;
    });
    for (const root of roots) {
      this.layoutChildren(canvas, root.canvasNode.id);
    }
    if (roots.length <= 1)
      return;
    const treeBboxes = roots.map((root) => ({
      root,
      bbox: this.getTreeBbox(root, canvas)
    }));
    treeBboxes.sort((a, b) => {
      const dy = a.root.canvasNode.y - b.root.canvasNode.y;
      if (Math.abs(dy) > 50)
        return dy;
      return a.root.canvasNode.x - b.root.canvasNode.x;
    });
    const gap = this.config.horizontalGap * 1.5;
    const vGap = this.config.verticalGap * 3;
    const treeSizes = treeBboxes.map((t) => ({
      w: t.bbox.maxX - t.bbox.minX,
      h: t.bbox.maxY - t.bbox.minY
    }));
    const treesPerRow = Math.ceil(Math.sqrt(roots.length));
    const avgWidth = treeSizes.reduce((sum, s) => sum + s.w, 0) / treeSizes.length;
    const targetWidth = treesPerRow * (avgWidth + gap);
    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;
    for (let i = 0; i < treeBboxes.length; i++) {
      const treeW = treeSizes[i].w + (currentRow.length > 0 ? gap : 0);
      if (currentRow.length > 0 && currentRowWidth + treeW > targetWidth) {
        rows.push(currentRow);
        currentRow = [i];
        currentRowWidth = treeSizes[i].w;
      } else {
        currentRow.push(i);
        currentRowWidth += treeW;
      }
    }
    if (currentRow.length > 0)
      rows.push(currentRow);
    const PADDING = 20;
    const originX = group.x + PADDING;
    const originY = group.y + PADDING;
    let cursorY = originY;
    const positions = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const rowHeight = Math.max(...row.map((i) => treeSizes[i].h));
      let cursorX = originX;
      for (const i of row) {
        const t = treeBboxes[i];
        const dx = cursorX - t.bbox.minX;
        const dy = cursorY - t.bbox.minY;
        const allNodes = [t.root, ...getDescendants(t.root)];
        for (const treeNode of allNodes) {
          const n = treeNode.canvasNode;
          positions.set(n.id, { x: n.x + dx, y: n.y + dy });
        }
        cursorX += treeSizes[i].w + gap;
      }
      cursorY += rowHeight + vGap;
    }
    this.applyPositions(canvas, positions);
    updateAllEdgeSides(canvas);
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    for (const [nodeId, pos] of positions) {
      const node = canvas.nodes.get(nodeId);
      if (!node)
        continue;
      gMinX = Math.min(gMinX, pos.x);
      gMinY = Math.min(gMinY, pos.y);
      gMaxX = Math.max(gMaxX, pos.x + node.width);
      gMaxY = Math.max(gMaxY, pos.y + node.height);
    }
    group.moveAndResize({
      x: gMinX - PADDING,
      y: gMinY - PADDING,
      width: gMaxX - gMinX + PADDING * 2,
      height: gMaxY - gMinY + PADDING * 2
    });
    canvas.requestSave();
  }
  getTreeBbox(root, canvas) {
    const allNodes = [root, ...getDescendants(root)];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const treeNode of allNodes) {
      const n = treeNode.canvasNode;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return { minX, minY, maxX, maxY };
  }
  /**
   * Apply calculated positions to canvas nodes.
   */
  applyPositions(canvas, positions) {
    var _a;
    for (const [nodeId, pos] of positions) {
      const node = canvas.nodes.get(nodeId);
      if (!node)
        continue;
      if (this.config.animate) {
        (_a = node.nodeEl) == null ? void 0 : _a.addClass("mindmap-animating");
      }
      node.moveTo({ x: pos.x, y: pos.y });
    }
    canvas.requestSave();
    canvas.requestFrame();
    if (this.config.animate) {
      setTimeout(() => {
        var _a2;
        for (const node of canvas.nodes.values()) {
          (_a2 = node.nodeEl) == null ? void 0 : _a2.removeClass("mindmap-animating");
        }
      }, 350);
    }
  }
};

// src/mindmap/branch-colors.ts
var DEFAULT_PALETTE = ["1", "2", "3", "4", "5", "6"];
var BranchColors = class {
  constructor(canvasApi, palette) {
    this.canvasApi = canvasApi;
    this.palette = palette != null ? palette : DEFAULT_PALETTE;
  }
  /**
   * Apply auto-coloring to all branches.
   */
  applyColors(canvas) {
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    for (const root of forest) {
      root.children.forEach((child, index) => {
        const color = this.palette[index % this.palette.length];
        this.colorBranch(canvas, child, color);
      });
    }
    canvas.requestSave();
    canvas.requestFrame();
  }
  /**
   * Color a single branch (node + all descendants + edges).
   */
  colorBranch(canvas, node, color) {
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      current.canvasNode.setColor(color);
      const incomingEdge = this.findIncomingEdge(canvas, current.canvasNode);
      if (incomingEdge)
        incomingEdge.setColor(color);
      stack.push(...current.children);
    }
  }
  /**
   * Find the edge pointing TO this node.
   */
  findIncomingEdge(canvas, node) {
    var _a;
    const edges = this.canvasApi.getConnectedEdges(canvas, node);
    return (_a = edges.find((e) => e.to.node.id === node.id)) != null ? _a : null;
  }
};

module.exports = { LayoutEngine, BranchColors, computeEdgeSides, registerDragEndHandler, updateAllEdgeSides };
