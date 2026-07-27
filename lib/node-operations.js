"use strict";

const { buildForest, findTreeForNode, countChildrenPerSide, getGroupIds } = require("./tree-model.js");

var NodeOperations = class {
  constructor(canvasApi, config) {
    this.canvasApi = canvasApi;
    this.config = config;
  }
  /**
   * Add a child node to the selected node.
   * If parent is root, places on the side with fewer children (ties go right).
   * If parent is non-root, inherits direction from its branch.
   * Returns the new node so the caller can start editing it.
   */
  addChild(canvas, parentNode) {
    const forest = buildForest(canvas);
    const parentTreeNode = findTreeForNode(forest, parentNode.id);
    const isRoot = parentTreeNode && !parentTreeNode.parent;
    let direction;
    if (isRoot && parentTreeNode) {
      if (typeof this.config.isAutoAdjust === "function" && this.config.isAutoAdjust(canvas)) {
        direction = parentTreeNode.children.length === 0 ? "right" : "left";
      } else {
        const counts = countChildrenPerSide(parentTreeNode);
        direction = counts.left < counts.right ? "left" : "right";
      }
    } else {
      direction = this.detectDirection(canvas, parentNode);
    }
    const existingChildren = this.canvasApi.getChildNodes(canvas, parentNode);
    let x;
    if (direction === "right") {
      x = parentNode.x + parentNode.width + this.config.horizontalGap;
    } else {
      x = parentNode.x - this.config.nodeWidth - this.config.horizontalGap;
    }
    let y;
    if (existingChildren.length > 0) {
      const sameSideChildren = existingChildren.filter((c) => {
        const childCx = c.x + c.width / 2;
        const parentCx = parentNode.x + parentNode.width / 2;
        return direction === "right" ? childCx > parentCx : childCx < parentCx;
      });
      if (sameSideChildren.length > 0) {
        const lastChild = sameSideChildren[sameSideChildren.length - 1];
        y = lastChild.y + lastChild.height + this.config.verticalGap;
      } else {
        y = parentNode.y + (parentNode.height - this.config.nodeHeight) / 2;
      }
    } else {
      y = parentNode.y + (parentNode.height - this.config.nodeHeight) / 2;
    }
    ({ x, y } = this.findAvailablePosition(
      canvas,
      x,
      y,
      this.config.nodeWidth,
      this.config.nodeHeight,
      "down"
    ));
    const newNode = this.canvasApi.createTextNode(
      canvas,
      x,
      y,
      "",
      this.config.nodeWidth,
      this.config.nodeHeight
    );
    if (parentNode.color)
      newNode.setColor(parentNode.color);
    if (direction === "right") {
      this.canvasApi.createEdge(canvas, parentNode, newNode, "right", "left", parentNode.color || void 0);
    } else {
      this.canvasApi.createEdge(canvas, parentNode, newNode, "left", "right", parentNode.color || void 0);
    }
    canvas.requestSave();
    return newNode;
  }
  /**
   * Add a sibling node below the selected node (same parent).
   * Inherits the branch direction from the current node.
   * Returns the new node.
   */
  addSibling(canvas, currentNode, before = false) {
    const parent = this.canvasApi.getParentNode(canvas, currentNode);
    if (!parent) {
      return this.addChild(canvas, currentNode);
    }
    const direction = this.detectDirection(canvas, currentNode);
    let x = currentNode.x;
    const parentCenter = parent.x + parent.width / 2;
    const sameSideSiblings = this.canvasApi.getChildNodes(canvas, parent).filter((sibling) => {
      const siblingCenter = sibling.x + sibling.width / 2;
      return direction === "left" ? siblingCenter < parentCenter : siblingCenter >= parentCenter;
    }).sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
    const currentIndex = sameSideSiblings.findIndex((sibling) => sibling.id === currentNode.id);
    const adjacent = before ? sameSideSiblings[currentIndex - 1] : sameSideSiblings[currentIndex + 1];
    let y;
    if (adjacent && typeof this.config.isAutoAdjust === "function" && this.config.isAutoAdjust(canvas)) {
      // The layout engine derives sibling chronology from Y. A midpoint is an
      // order hint that places the new topic next to the current one before the
      // synchronous re-layout removes the temporary overlap.
      y = (currentNode.y + adjacent.y) / 2;
    } else {
      y = before ? currentNode.y - this.config.nodeHeight - this.config.verticalGap : currentNode.y + currentNode.height + this.config.verticalGap;
      ({ x, y } = this.findAvailablePosition(
        canvas,
        x,
        y,
        this.config.nodeWidth,
        this.config.nodeHeight,
        before ? "up" : "down"
      ));
    }
    const newNode = this.canvasApi.createTextNode(
      canvas,
      x,
      y,
      "",
      this.config.nodeWidth,
      this.config.nodeHeight
    );
    if (currentNode.color)
      newNode.setColor(currentNode.color);
    if (direction === "right") {
      this.canvasApi.createEdge(canvas, parent, newNode, "right", "left", currentNode.color || void 0);
    } else {
      this.canvasApi.createEdge(canvas, parent, newNode, "left", "right", currentNode.color || void 0);
    }
    canvas.requestSave();
    return newNode;
  }
  /**
   * Insert a new topic between the current topic and its parent.
   * For a central topic this creates a new root immediately to its left.
   */
  addParent(canvas, currentNode) {
    const parent = this.canvasApi.getParentNode(canvas, currentNode);
    const direction = parent ? this.detectDirection(canvas, currentNode) : "right";
    let x = parent ? (parent.x + parent.width / 2 + currentNode.x + currentNode.width / 2) / 2 - this.config.nodeWidth / 2 : currentNode.x - this.config.nodeWidth - this.config.horizontalGap;
    let y = currentNode.y + (currentNode.height - this.config.nodeHeight) / 2;
    ({ x, y } = this.findAvailablePosition(
      canvas,
      x,
      y,
      this.config.nodeWidth,
      this.config.nodeHeight,
      "nearest"
    ));
    const newNode = this.canvasApi.createTextNode(
      canvas,
      x,
      y,
      "",
      this.config.nodeWidth,
      this.config.nodeHeight
    );
    if (currentNode.color)
      newNode.setColor(currentNode.color);
    if (parent) {
      const edge = this.canvasApi.getOutgoingEdges(canvas, parent.id).find(
        (candidate) => candidate.to.node.id === currentNode.id
      );
      if (edge) {
        const fromSide = edge.from.side;
        const toSide = edge.to.side;
        canvas.removeEdge(edge);
        this.canvasApi.invalidateEdgeIndex();
        this.canvasApi.createEdge(canvas, parent, newNode, fromSide, toSide, currentNode.color || void 0);
        this.canvasApi.createEdge(canvas, newNode, currentNode, fromSide, toSide, currentNode.color || void 0);
      } else {
        this.canvasApi.removeNode(canvas, newNode);
        return null;
      }
    } else {
      this.canvasApi.createEdge(canvas, newNode, currentNode, "right", "left", currentNode.color || void 0);
    }
    canvas.requestSave();
    return newNode;
  }
  /**
   * Find a collision-free slot for a newly created topic without moving any
   * existing topic. Search stays on the intended branch column.
   */
  findAvailablePosition(canvas, x, y, width, height, preference = "down") {
    const groupIds = getGroupIds(canvas);
    const existing = Array.from(canvas.nodes.values()).filter((node) => !groupIds.has(node.id));
    const padding = Math.max(8, this.config.verticalGap / 2);
    const step = height + this.config.verticalGap;
    const isFree = (candidateY) => existing.every((node) => {
      return x + width + padding <= node.x || x >= node.x + node.width + padding || candidateY + height + padding <= node.y || candidateY >= node.y + node.height + padding;
    });
    if (isFree(y))
      return { x, y };
    for (let index = 1; index <= 200; index++) {
      const offsets = preference === "up" ? [-index] : preference === "down" ? [index] : [index, -index];
      for (const offset of offsets) {
        const candidateY = y + offset * step;
        if (isFree(candidateY))
          return { x, y: candidateY };
      }
    }
    return { x, y };
  }
  /**
   * Delete a topic and its complete branch, returning its parent for focus.
   * Central topics are valid targets too; deleting one removes that complete tree.
   */
  deleteSubtree(canvas, currentNode) {
    const parent = this.canvasApi.getParentNode(canvas, currentNode);
    const descendants = [];
    const visited = /* @__PURE__ */ new Set([currentNode.id]);
    const queue = [currentNode.id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      for (const edge of this.canvasApi.getOutgoingEdges(canvas, id)) {
        const child = edge.to.node;
        if (!visited.has(child.id)) {
          visited.add(child.id);
          descendants.push(child);
          queue.push(child.id);
        }
      }
    }
    for (let i = descendants.length - 1; i >= 0; i--) {
      this.canvasApi.removeNode(canvas, descendants[i]);
    }
    this.canvasApi.removeNode(canvas, currentNode);
    canvas.requestSave();
    return parent;
  }
  /**
   * Delete the current node and return the best node to focus.
   * Children of the deleted node get reconnected to the parent
   * with edge sides matching their branch direction. When deleting a root,
   * its children become independent roots and the top-left child gets focus.
   */
  deleteAndFocusParent(canvas, currentNode) {
    const parent = this.canvasApi.getParentNode(canvas, currentNode);
    const direction = this.detectDirection(canvas, currentNode);
    const orphans = this.canvasApi.getChildNodes(canvas, currentNode);
    if (parent) {
      for (const orphan of orphans) {
        if (direction === "right") {
          this.canvasApi.createEdge(canvas, parent, orphan, "right", "left");
        } else {
          this.canvasApi.createEdge(canvas, parent, orphan, "left", "right");
        }
      }
    }
    this.canvasApi.removeNode(canvas, currentNode);
    canvas.requestSave();
    if (parent)
      return parent;
    return [...orphans].sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)))[0] || null;
  }
  /**
   * Flip a branch to the other side of its parent.
   * Mirrors the node and all descendants horizontally around the parent's center X.
   * Returns the parent node (for caller to trigger restack/layout).
   */
  flipBranch(canvas, node) {
    const parent = this.canvasApi.getParentNode(canvas, node);
    if (!parent)
      return null;
    const parentCx = parent.x + parent.width / 2;
    const allNodes = [node];
    const visited = /* @__PURE__ */ new Set([node.id]);
    const queue = [node.id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      for (const edge of this.canvasApi.getOutgoingEdges(canvas, id)) {
        const childId = edge.to.node.id;
        if (!visited.has(childId)) {
          visited.add(childId);
          allNodes.push(edge.to.node);
          queue.push(childId);
        }
      }
    }
    for (const n of allNodes) {
      const newX = 2 * parentCx - n.x - n.width;
      n.moveTo({ x: newX, y: n.y });
    }
    return parent;
  }
  /**
   * Detect the branch direction of a node based on actual positions.
   * If node has children, uses their position. Otherwise, uses parent position.
   */
  detectDirection(canvas, node) {
    const nodeCx = node.x + node.width / 2;
    const existingChildren = this.canvasApi.getChildNodes(canvas, node);
    if (existingChildren.length > 0) {
      const firstChildCx = existingChildren[0].x + existingChildren[0].width / 2;
      return firstChildCx < nodeCx ? "left" : "right";
    }
    const parent = this.canvasApi.getParentNode(canvas, node);
    if (parent) {
      const parentCx = parent.x + parent.width / 2;
      return nodeCx < parentCx ? "left" : "right";
    }
    return "right";
  }
};

module.exports = { NodeOperations };
