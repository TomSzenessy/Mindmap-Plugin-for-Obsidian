"use strict";

const { buildForest, getGroupIds, getDescendants, findTreeNode, findTreeForNode, countReachable, setDepths, assignDirections, propagateDirection } = require("./tree-model.js");

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
function updateAllEdgeSides(canvas, persist = true) {
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
    if (persist)
      canvas.requestSave();
  }
}
function registerDragEndHandler(canvas, enabled = () => true) {
  var _a, _b;
  let lastMoveUpdate = 0;
  const THROTTLE_MS = 40;
  const moveHandler = (e) => {
    if (!enabled())
      return;
    if (e.buttons === 0)
      return;
    const now = Date.now();
    if (now - lastMoveUpdate < THROTTLE_MS)
      return;
    lastMoveUpdate = now;
    updateAllEdgeSides(canvas);
  };
  const upHandler = () => {
    if (!enabled())
      return;
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
  updateEdgeSides(canvas, options = {}) {
    updateAllEdgeSides(canvas, options.persist !== false);
  }
  layout(canvas, options = {}) {
    const forest = buildForest(canvas, { includeHidden: false });
    if (forest.length === 0)
      return;
    const nestedDirections = new Map();
    for (const root of forest) {
      const stack = [...root.children];
      while (stack.length > 0) {
        const node = stack.pop();
        if (node.parent?.parent) {
          const nodeCenter = node.canvasNode.x + node.canvasNode.width / 2;
          const parentCenter = node.parent.canvasNode.x + node.parent.canvasNode.width / 2;
          nestedDirections.set(node.canvasNode.id, nodeCenter >= parentCenter ? "right" : "left");
        }
        stack.push(...node.children);
      }
    }
    const positions = /* @__PURE__ */ new Map();
    for (const root of forest) {
      const rootX = root.canvasNode.x;
      const rootY = root.canvasNode.y;
      positions.set(root.canvasNode.id, { x: rootX, y: rootY });
      const { rightChildren, leftChildren } = this.balanceRootChildren(
        root,
        Boolean(options.preserveRootSides),
        options.branchDirectionOverride
      );
      // A complete mind-map reflow is radial: once a top-level branch has a
      // side, every descendant must continue outward on that same side. Keeping
      // old nested directions here lets translated subtrees fold back through
      // the root and overlap branches already packed on the opposite side.
      const forceRootBranchIds = new Set(
        [...rightChildren, ...leftChildren].map((child) => child.canvasNode.id)
      );
      const layoutOptions = { ...options, nestedDirections, forceRootBranchIds };
      this.layoutGroup(root, rightChildren, "right", rootX, rootY, positions, layoutOptions);
      this.layoutGroup(root, leftChildren, "left", rootX, rootY, positions, layoutOptions);
    }
    this.applyPositions(canvas, positions);
    if (options.persist !== false && options.displaceFloating !== false)
      this.displaceFloatingNodes(canvas, options);
    updateAllEdgeSides(canvas);
    const override = options.branchDirectionOverride;
    if (override?.nodeId && override.direction) {
      const branch = findTreeForNode(forest, override.nodeId);
      if (branch)
        this.enforceSubtreeDirection(canvas, branch, override.direction);
    }
  }
  /**
   * Partially re-layout only the children of a specific parent node
   * (and their subtrees). The parent stays in place; everything
   * outside this parent's subtree is untouched.
   */
  layoutChildren(canvas, parentNodeId, directionOverride = null, options = {}) {
    const forest = buildForest(canvas, { includeHidden: false });
    if (forest.length === 0)
      return;
    const parentTreeNode = findTreeForNode(forest, parentNodeId);
    if (!parentTreeNode || parentTreeNode.children.length === 0)
      return;
    const positions = /* @__PURE__ */ new Map();
    if (!parentTreeNode.parent) {
      const rootX = parentTreeNode.canvasNode.x;
      const rootY = parentTreeNode.canvasNode.y;
      if (directionOverride) {
        propagateDirection(parentTreeNode, directionOverride);
        this.layoutGroup(parentTreeNode, parentTreeNode.children, directionOverride, rootX, rootY, positions);
      } else {
        const { rightChildren, leftChildren } = this.balanceRootChildren(
          parentTreeNode,
          Boolean(options.preserveRootSides)
        );
        this.layoutGroup(parentTreeNode, rightChildren, "right", rootX, rootY, positions);
        this.layoutGroup(parentTreeNode, leftChildren, "left", rootX, rootY, positions);
      }
    } else {
      const px = parentTreeNode.canvasNode.x;
      const py = parentTreeNode.canvasNode.y;
      const direction = directionOverride || parentTreeNode.direction || (parentTreeNode.canvasNode.x >= parentTreeNode.parent.canvasNode.x ? "right" : "left");
      propagateDirection(parentTreeNode, direction);
      this.layoutGroup(parentTreeNode, parentTreeNode.children, direction, px, py, positions);
    }
    this.applyPositions(canvas, positions, options);
    updateAllEdgeSides(canvas, options.persist !== false);
    if (directionOverride)
      this.enforceSubtreeDirection(canvas, parentTreeNode, directionOverride);
  }
  /**
   * Attached branches have one non-negotiable orientation: their outgoing
   * edges leave opposite the branch root's incoming arrow. Apply this after
   * geometry-based edge updates so coordinates cannot contradict topology.
   */
  enforceSubtreeDirection(canvas, root, direction) {
    const fromSide = direction === "left" ? "left" : "right";
    const toSide = fromSide === "left" ? "right" : "left";
    const stack = [root];
    let changed = false;
    while (stack.length > 0) {
      const parent = stack.pop();
      for (const child of parent.children || []) {
        for (const edge of canvas.edges.values()) {
          if (
            !edge.__mindMapPreview &&
            edge.from?.node?.id === parent.canvasNode.id &&
            edge.to?.node?.id === child.canvasNode.id
          ) {
            if (edge.from.side !== fromSide || edge.to.side !== toSide) {
              edge.from.side = fromSide;
              edge.to.side = toSide;
              changed = true;
            }
            break;
          }
        }
        stack.push(child);
      }
    }
    if (changed)
      canvas.requestFrame();
  }
  /**
   * Preserve the visible branch order (right top-to-bottom, then left
   * top-to-bottom) and choose the split that best balances rendered subtree
   * height. This permits unequal topic counts when a few tall branches occupy
   * the same visual height as several short ones.
   */
  balanceRootChildren(root, preserveExistingSides = false, branchDirectionOverride = null) {
    const rootCx = root.canvasNode.x + root.canvasNode.width / 2;
    const byPosition = (a, b) => a.canvasNode.y - b.canvasNode.y || a.canvasNode.x - b.canvasNode.x || String(a.canvasNode.id).localeCompare(String(b.canvasNode.id));
    const right = root.children.filter((child) => child.canvasNode.x + child.canvasNode.width / 2 >= rootCx).sort(byPosition);
    const left = root.children.filter((child) => child.canvasNode.x + child.canvasNode.width / 2 < rootCx).sort(byPosition);
    if (preserveExistingSides) {
      root.children = [...right, ...left];
      for (const child of right) {
        child.direction = "right";
        propagateDirection(child, "right");
      }
      for (const child of left) {
        child.direction = "left";
        propagateDirection(child, "left");
      }
      return { rightChildren: right, leftChildren: left };
    }
    const ordered = [...right, ...left];
    root.children = ordered;
    if (ordered.length === 0)
      return { rightChildren: [], leftChildren: [] };
    const pinnedChild = branchDirectionOverride?.nodeId
      ? ordered.find((child) => child.canvasNode.id === branchDirectionOverride.nodeId)
      : null;
    const pinnedDirection = pinnedChild && (branchDirectionOverride.direction === "left" || branchDirectionOverride.direction === "right")
      ? branchDirectionOverride.direction
      : null;
    const assignments = new Map();
    let rightHeight = 0;
    let leftHeight = 0;
    let rightCount = 0;
    let leftCount = 0;
    const addHeight = (total, count, height) => total + height + (count > 0 ? this.config.verticalGap : 0);
    if (pinnedChild && pinnedDirection) {
      const height = this.measureSubtreeHeight(pinnedChild);
      assignments.set(pinnedChild, pinnedDirection);
      if (pinnedDirection === "right") {
        rightHeight = height;
        rightCount = 1;
      } else {
        leftHeight = height;
        leftCount = 1;
      }
    }
    const candidates = ordered
      .map((child, index) => ({ child, index, height: this.measureSubtreeHeight(child) }))
      .filter(({ child }) => child !== pinnedChild)
      .sort((a, b) => b.height - a.height || a.index - b.index);
    for (const { child, height } of candidates) {
      const direction = rightHeight <= leftHeight ? "right" : "left";
      assignments.set(child, direction);
      if (direction === "right") {
        rightHeight = addHeight(rightHeight, rightCount, height);
        rightCount++;
      } else {
        leftHeight = addHeight(leftHeight, leftCount, height);
        leftCount++;
      }
    }
    const rightChildren = ordered.filter((child) => assignments.get(child) === "right");
    const leftChildren = ordered.filter((child) => assignments.get(child) === "left");
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
  layoutGroup(root, children, direction, rootX, rootY, positions, options = {}) {
    if (children.length === 0)
      return;
    const rootH = root.canvasNode.height || this.config.nodeHeight;
    const rootW = root.canvasNode.width || this.config.nodeWidth;
    const rootCenterY = rootY + rootH / 2;
    const subtrees = [];
    for (const child of children) {
      const childDirection = options.branchDirectionOverride?.nodeId === child.canvasNode.id
        ? options.branchDirectionOverride.direction
        : direction;
      const forceChildDirection = options.branchDirectionOverride?.nodeId === child.canvasNode.id
        || options.forceRootBranchIds?.has(child.canvasNode.id);
      const childW = child.canvasNode.width || this.config.nodeWidth;
      const childX = childDirection === "right" ? rootX + rootW + this.config.horizontalGap : rootX - childW - this.config.horizontalGap;
      const tempPositions = /* @__PURE__ */ new Map();
      const layout = this.layoutSubtree(
        child,
        childX,
        0,
        0,
        childDirection,
        tempPositions,
        options,
        forceChildDirection
      );
      subtrees.push({ positions: tempPositions, contour: layout.contour, rectangles: layout.rectangles });
    }
    const foldSign = direction === "left" ? -1 : 1;
    const { xOffsets, yOffsets, combinedContour } = this.foldPack(subtrees, subtrees.map(() => foldSign));
    const contourExtents = Array.from(combinedContour.values());
    const blockTop = Math.min(...contourExtents.map((extent) => extent.top));
    const blockBottom = Math.max(...contourExtents.map((extent) => extent.bottom));
    const globalShift = rootCenterY - (blockTop + blockBottom) / 2;
    for (let i = 0; i < subtrees.length; i++) {
      const xShift = xOffsets[i];
      const yShift = yOffsets[i] + globalShift;
      for (const [id, pos] of subtrees[i].positions) {
        positions.set(id, { x: pos.x + xShift, y: pos.y + yShift });
      }
    }
  }
  /**
   * Recursively lay out a node and all its descendants.
   * Returns the contour (vertical extent per depth column).
   */
  layoutSubtree(node, nodeX, nodeY, depth, direction, positions, options = {}, forcedDirection = false) {
    const nodeH = node.canvasNode.height || this.config.nodeHeight;
    const nodeW = node.canvasNode.width || this.config.nodeWidth;
    positions.set(node.canvasNode.id, { x: nodeX, y: nodeY });
    const contour = /* @__PURE__ */ new Map();
    contour.set(depth, { top: nodeY, bottom: nodeY + nodeH });
    const ownRectangle = { left: nodeX, right: nodeX + nodeW, top: nodeY, bottom: nodeY + nodeH };
    if (node.children.length === 0)
      return { contour, rectangles: [ownRectangle] };
    const childSubtrees = [];
    const childSigns = [];
    for (const child of node.children) {
      const isDirectionOverride = options.branchDirectionOverride?.nodeId === child.canvasNode.id;
      const childDirection = forcedDirection
        ? direction
        : isDirectionOverride
          ? options.branchDirectionOverride.direction
          : options.nestedDirections?.get(child.canvasNode.id) || direction;
      const childW = child.canvasNode.width || this.config.nodeWidth;
      const childX = childDirection === "right" ? nodeX + nodeW + this.config.horizontalGap : nodeX - childW - this.config.horizontalGap;
      const tempPositions = /* @__PURE__ */ new Map();
      const childLayout = this.layoutSubtree(
        child,
        childX,
        0,
        depth + 1,
        childDirection,
        tempPositions,
        options,
        forcedDirection || isDirectionOverride
      );
      childSubtrees.push({ positions: tempPositions, contour: childLayout.contour, rectangles: childLayout.rectangles });
      childSigns.push(childDirection === "left" ? -1 : 1);
    }
    const { xOffsets, yOffsets, combinedContour, combinedRectangles } = this.foldPack(childSubtrees, childSigns);
    const contourExtents = Array.from(combinedContour.values());
    const blockTop = Math.min(...contourExtents.map((extent) => extent.top));
    const blockBottom = Math.max(...contourExtents.map((extent) => extent.bottom));
    const centerShift = nodeY + nodeH / 2 - (blockTop + blockBottom) / 2;
    for (let i = 0; i < childSubtrees.length; i++) {
      const xShift = xOffsets[i];
      const yShift = yOffsets[i] + centerShift;
      for (const [id, pos] of childSubtrees[i].positions) {
        positions.set(id, { x: pos.x + xShift, y: pos.y + yShift });
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
   * Compacted vertical gutter used between stacked cards: 70% of the
   * configured gap — tight enough that a folded band reads as one column,
   * never tighter than 8px so card edges stay visually distinct.
   */
  compactVerticalGap() {
    return Math.max(8, Math.round(this.config.verticalGap * 0.7));
  }
  /**
   * Horizontal gap scaled to the map's silhouette. A tall shallow map (a big
   * stack of branches, few levels deep) has free side space, so the gap grows
   * up to 125% of the configured value to round the map out; a map that is
   * wider than tall tightens to 55% so deep chains stay compact.
   */
  getAdaptiveHorizontalGap(branches) {
    const list = branches || [];
    let height = 0;
    let maxDepth = 1;
    for (let index = 0; index < list.length; index++) {
      height += this.measureSubtreeHeight(list[index]);
      if (index > 0)
        height += this.compactVerticalGap();
      let depth = 0;
      const stack = [{ node: list[index], level: 1 }];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current.level > depth)
          depth = current.level;
        for (const child of current.node.children)
          stack.push({ node: child, level: current.level + 1 });
      }
      if (depth > maxDepth)
        maxDepth = depth;
    }
    const width = maxDepth * (this.config.nodeWidth || 300);
    const tallness = width > 0 ? height / width : 1;
    const factor = Math.min(1.25, Math.max(0.55, 0.55 * Math.max(1, tallness)));
    return Math.round(this.config.horizontalGap * factor);
  }
  /**
   * Pack subtrees into outward bands.
   *
   * Cards stack downward at compactVerticalGap(), but a band holds at most
   * three subtrees and at most nodeHeight*12 of stacked extent — past either
   * limit the packing folds into the next OUTWARD band (a horizontal offset
   * along `signs`), so tall or dense sibling sets spread sideways instead of
   * draping into a ribbon. Bands never share an x-range, so they reuse the
   * same vertical levels freely — which is what keeps a folded map compact in
   * both axes at once. Options let callers stack at the full gap without
   * folding (packSubtrees).
   */
  foldPack(subtrees, signs, seedRect = null, options = {}) {
    const compact = options.gap ?? this.compactVerticalGap();
    const folding = options.fold !== false;
    const xClearance = Math.max(8, this.config.verticalGap);
    const foldExtent = (this.config.nodeHeight || 60) * 12;
    const MAX_PER_BAND = folding ? 3 : Infinity;
    const combinedRectangles = seedRect ? [{ ...seedRect }] : [];
    const combinedContour = /* @__PURE__ */ new Map();
    if (subtrees.length === 0)
      return { xOffsets: [], yOffsets: [], combinedContour, combinedRectangles };
    const extents = subtrees.map((sub) => {
      const rectangles = sub.rectangles || [];
      let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
      for (const rectangle of rectangles) {
        top = Math.min(top, rectangle.top);
        bottom = Math.max(bottom, rectangle.bottom);
        left = Math.min(left, rectangle.left);
        right = Math.max(right, rectangle.right);
      }
      return { top, bottom, height: bottom - top, width: right - left };
    });
    const pitch = Math.max(...extents.map((extent) => extent.width)) + this.config.horizontalGap;
    const xOffsets = [];
    const bands = /* @__PURE__ */ new Map();
    for (let i = 0; i < subtrees.length; i++) {
      const sign = signs[i] >= 0 ? 1 : -1;
      let band = bands.get(sign);
      if (!band) {
        band = { index: 0, count: 0, extent: 0 };
        bands.set(sign, band);
      }
      const height = extents[i].height;
      if (band.count >= MAX_PER_BAND || folding && band.count > 0 && band.extent + compact + height > foldExtent) {
        band.index++;
        band.count = 0;
        band.extent = 0;
      }
      band.extent = band.count === 0 ? height : band.extent + compact + height;
      band.count++;
      xOffsets.push(sign * band.index * pitch || 0);
    }
    const yOffsets = [];
    for (let i = 0; i < subtrees.length; i++) {
      const sub = subtrees[i];
      const shifted = (sub.rectangles || []).map((rectangle) => ({
        left: rectangle.left + xOffsets[i],
        right: rectangle.right + xOffsets[i],
        top: rectangle.top,
        bottom: rectangle.bottom
      }));
      let shift = 0;
      for (const rectangle of shifted) {
        for (const previous of combinedRectangles) {
          const overlapsHorizontally = rectangle.left < previous.right + xClearance
            && rectangle.right > previous.left - xClearance;
          if (!overlapsHorizontally)
            continue;
          const needed = previous.bottom + compact - rectangle.top;
          if (needed > shift)
            shift = needed;
        }
      }
      yOffsets.push(shift);
      for (const [d, ext] of sub.contour || []) {
        const moved = { top: ext.top + shift, bottom: ext.bottom + shift };
        const existing = combinedContour.get(d);
        if (existing) {
          if (moved.top < existing.top)
            existing.top = moved.top;
          if (moved.bottom > existing.bottom)
            existing.bottom = moved.bottom;
        } else {
          combinedContour.set(d, { ...moved });
        }
      }
      for (const rectangle of shifted) {
        combinedRectangles.push({
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top + shift,
          bottom: rectangle.bottom + shift
        });
      }
    }
    return { xOffsets, yOffsets, combinedContour, combinedRectangles };
  }
  /**
   * Stack subtrees vertically at the FULL configured gap, never folding:
   * neighboring cards keep their complete visual gutter. Same collision
   * engine as foldPack, without the band folding and with no compaction.
   */
  packSubtrees(subtrees) {
    return this.foldPack(subtrees, subtrees.map(() => 1), null, {
      gap: this.config.verticalGap,
      fold: false
    });
  }
  /**
   * Pack complete root subtrees on one side of a map (public entry point for
   * tooling; the engine itself folds through layoutGroup/layoutSubtree).
   */
  packRootSubtrees(subtrees, side, parentRect = null) {
    const sign = side === "left" ? -1 : 1;
    return this.foldPack(subtrees, subtrees.map(() => sign), parentRect);
  }
  /**
   * Pull every complete subtree inward toward its parent like a spring whose
   * rest length is the adaptive horizontal gap. Parents settle before
   * children (breadth-first), each subtree translating as a unit so internal
   * geometry survives; the gap floor is what keeps pulled cards from
   * colliding.
   */
  compactHorizontalSprings(canvas, roots, positions) {
    const gap = this.getAdaptiveHorizontalGap(roots);
    const queue = [...(roots || [])];
    while (queue.length > 0) {
      const node = queue.shift();
      const parentPos = positions.get(node.canvasNode.id);
      for (const child of node.children) {
        const childPos = positions.get(child.canvasNode.id);
        if (parentPos && childPos) {
          const direction = child.direction || "right";
          const parentW = node.canvasNode.width;
          const childW = child.canvasNode.width;
          const target = direction === "left"
            ? parentPos.x - childW - gap
            : parentPos.x + parentW + gap;
          const pull = direction === "left" ? target - childPos.x : childPos.x - target;
          if (pull > 0) {
            const delta = direction === "left" ? pull : -pull;
            const stack = [child];
            while (stack.length > 0) {
              const moved = stack.pop();
              const movedPos = positions.get(moved.canvasNode.id);
              if (movedPos)
                positions.set(moved.canvasNode.id, { x: movedPos.x + delta, y: movedPos.y });
              stack.push(...moved.children);
            }
          }
        }
        queue.push(child);
      }
    }
    return positions;
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
    const forest = buildForest(canvas, { includeHidden: false });
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
  applyPositions(canvas, positions, options = {}) {
    var _a;
    const animate = options.animate ?? this.config.animate;
    const persist = options.persist !== false;
    for (const [nodeId, pos] of positions) {
      const node = canvas.nodes.get(nodeId);
      if (!node)
        continue;
      if (animate) {
        (_a = node.nodeEl) == null ? void 0 : _a.addClass("mindmap-animating");
      }
      node.moveTo({ x: pos.x, y: pos.y });
    }
    if (persist)
      canvas.requestSave();
    canvas.requestFrame();
    if (animate) {
      setTimeout(() => {
        var _a2;
        for (const node of canvas.nodes.values()) {
          (_a2 = node.nodeEl) == null ? void 0 : _a2.removeClass("mindmap-animating");
        }
      }, 350);
    }
  }
  /**
   * A floating topic is a card that participates in no edge: neither a map
   * topic nor the child of one. Media cards, notes and loose text cards all
   * qualify, so the automatic layout treats them as movable obstacles.
   */
  collectFloatingNodes(canvas, groupIds = getGroupIds(canvas)) {
    const connected = /* @__PURE__ */ new Set();
    for (const edge of canvas.edges.values()) {
      if (edge?.__mindMapPreview)
        continue;
      const fromId = edge.from?.node?.id;
      const toId = edge.to?.node?.id;
      if (fromId)
        connected.add(fromId);
      if (toId)
        connected.add(toId);
    }
    const floating = [];
    const anchored = [];
    for (const node of canvas.nodes.values()) {
      if (!node || groupIds.has(node.id) || node.unknownData?.type === "group")
        continue;
      if (connected.has(node.id))
        anchored.push(node);
      else
        floating.push(node);
    }
    return { floating, anchored };
  }
  /**
   * Nudge floating topics out of the way of a laid-out map without moving the
   * map itself. Each pass pushes every overlap along its shallowest axis; the
   * damping factor turns the discrete axis-aligned resolution into a stable
   * settle instead of a ping-pong between two obstacles.
   */
  resolveFloatingOverlaps(nodes, obstacles, padding = 8, options = {}) {
    const maxPasses = options.maxPasses ?? 30;
    const damping = options.damping ?? 0.6;
    const positions = /* @__PURE__ */ new Map();
    for (const node of nodes)
      positions.set(node.id, { x: Number(node.x) || 0, y: Number(node.y) || 0 });
    const rectOf = (node, position) => {
      const left = Number(position?.x) || 0;
      const top = Number(position?.y) || 0;
      return {
        left,
        top,
        right: left + Math.max(1, Number(node.width) || 1),
        bottom: top + Math.max(1, Number(node.height) || 1)
      };
    };
    for (let pass = 0; pass < maxPasses; pass++) {
      let moved = false;
      for (const node of nodes) {
        const position = positions.get(node.id);
        const rect = rectOf(node, position);
        let dx = 0;
        let dy = 0;
        const resolve = (other) => {
          const overlapX = Math.min(rect.right, other.right) - Math.max(rect.left, other.left) + padding;
          const overlapY = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) + padding;
          if (overlapX <= 0 || overlapY <= 0)
            return;
          const centerX = (rect.left + rect.right) / 2;
          const centerY = (rect.top + rect.bottom) / 2;
          const otherCenterX = (other.left + other.right) / 2;
          const otherCenterY = (other.top + other.bottom) / 2;
          if (overlapX <= overlapY)
            dx += (centerX < otherCenterX ? -1 : 1) * overlapX;
          else
            dy += (centerY < otherCenterY ? -1 : 1) * overlapY;
        };
        for (const obstacle of obstacles)
          resolve(obstacle);
        for (const other of nodes) {
          if (other.id === node.id)
            continue;
          resolve(rectOf(other, positions.get(other.id)));
        }
        if (dx === 0 && dy === 0)
          continue;
        positions.set(node.id, {
          x: position.x + dx * damping,
          y: position.y + dy * damping
        });
        moved = true;
      }
      if (!moved)
        break;
    }
    return positions;
  }
  /**
   * Move every floating topic clear of the connected mind map(s) on a Canvas.
   * Returns the ids that actually moved so callers can decide whether to save.
   */
  displaceFloatingNodes(canvas, options = {}) {
    if (!canvas?.nodes || !canvas?.edges)
      return [];
    const { floating, anchored } = this.collectFloatingNodes(canvas);
    if (floating.length === 0 || anchored.length === 0)
      return [];
    const padding = Math.max(
      8,
      Number(options.floatingPadding) || this.config.verticalGap || 0
    );
    const obstacles = anchored.map((node) => ({
      left: Number(node.x) || 0,
      top: Number(node.y) || 0,
      right: (Number(node.x) || 0) + Math.max(1, Number(node.width) || 1),
      bottom: (Number(node.y) || 0) + Math.max(1, Number(node.height) || 1)
    }));
    const settled = this.resolveFloatingOverlaps(floating, obstacles, padding, options);
    const movedIds = [];
    for (const node of floating) {
      const next = settled.get(node.id);
      if (!next)
        continue;
      const dx = next.x - (Number(node.x) || 0);
      const dy = next.y - (Number(node.y) || 0);
      if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5)
        continue;
      node.moveTo?.({ x: next.x, y: next.y });
      movedIds.push(node.id);
    }
    if (movedIds.length > 0) {
      canvas.requestFrame?.();
      if (options.persist !== false)
        canvas.requestSave?.();
    }
    return movedIds;
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
    const forest = buildForest(canvas, { includeHidden: false });
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
