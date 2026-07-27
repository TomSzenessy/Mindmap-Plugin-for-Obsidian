"use strict";

const { genId } = require("./canvas-api.js");

function parseFreeMindXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const errorNode = doc.querySelector("parsererror");
  if (errorNode)
    return [];
  const mapEl = doc.querySelector("map");
  if (!mapEl)
    return [];
  const roots = [];
  for (const child of Array.from(mapEl.children)) {
    if (child.tagName === "node" || child.tagName === "x-coggle-rootnode") {
      roots.push(parseNode(child, "right"));
    }
  }
  return roots;
}
function parseNode(el, inheritedPosition) {
  const text = el.getAttribute("TEXT") || "Untitled";
  const posAttr = el.getAttribute("POSITION");
  const position = posAttr === "left" ? "left" : posAttr === "right" ? "right" : inheritedPosition;
  const children = [];
  for (const child of Array.from(el.children)) {
    if (child.tagName === "node" || child.tagName === "x-coggle-rootnode") {
      children.push(parseNode(child, position));
    }
  }
  return { text, position, children };
}
function estimateNodeHeight(text, nodeWidth, minHeight, maxHeight) {
  const AVG_CHAR_WIDTH = 8;
  const LINE_HEIGHT = 22;
  const PADDING = 20;
  const charsPerLine = Math.max(1, Math.floor((nodeWidth - PADDING) / AVG_CHAR_WIDTH));
  const paragraphs = text.split("\n");
  let totalLines = 0;
  for (const para of paragraphs) {
    if (para.length === 0) {
      totalLines += 1;
    } else {
      totalLines += Math.ceil(para.length / charsPerLine);
    }
  }
  const estimated = totalLines * LINE_HEIGHT + PADDING;
  return Math.min(Math.max(estimated, minHeight), maxHeight);
}
function nodeHeight(node, opts) {
  return estimateNodeHeight(node.text, opts.nodeWidth, opts.nodeHeight, opts.maxNodeHeight);
}
function subtreeHeight(node, opts) {
  if (node.children.length === 0)
    return nodeHeight(node, opts);
  let total = 0;
  for (let i = 0; i < node.children.length; i++) {
    if (i > 0)
      total += opts.verticalGap;
    total += subtreeHeight(node.children[i], opts);
  }
  return Math.max(nodeHeight(node, opts), total);
}
function groupHeight(children, opts) {
  if (children.length === 0)
    return 0;
  let total = 0;
  for (let i = 0; i < children.length; i++) {
    if (i > 0)
      total += opts.verticalGap;
    total += subtreeHeight(children[i], opts);
  }
  return total;
}
function layoutTree(root, startX, startY, opts, nodes, edges) {
  const rootH = nodeHeight(root, opts);
  const rootId = root.id || genId();
  if (root.type === "file" || root.file) {
    nodes.push({ id: rootId, type: "file", file: root.file || root.text, x: startX, y: startY, width: opts.nodeWidth, height: rootH });
  } else if (root.type === "link" || root.url) {
    nodes.push({ id: rootId, type: "link", url: root.url || root.text, x: startX, y: startY, width: opts.nodeWidth, height: rootH });
  } else {
    nodes.push({ id: rootId, type: "text", text: root.text, x: startX, y: startY, width: opts.nodeWidth, height: rootH });
  }
  if (root.children.length === 0)
    return rootH;
  const rightChildren = root.children.filter((c) => c.position === "right");
  const leftChildren = root.children.filter((c) => c.position === "left");
  const rootCy = startY + rootH / 2;
  layoutSide(rootId, rightChildren, "right", startX, rootCy, opts, nodes, edges);
  layoutSide(rootId, leftChildren, "left", startX, rootCy, opts, nodes, edges);
  const rightH = groupHeight(rightChildren, opts);
  const leftH = groupHeight(leftChildren, opts);
  return Math.max(rootH, rightH, leftH);
}
function layoutSide(parentId, children, side, parentX, parentCy, opts, nodes, edges) {
  if (children.length === 0)
    return;
  const totalH = groupHeight(children, opts);
  let childY = parentCy - totalH / 2;
  const fromSide = side === "right" ? "right" : "left";
  const toSide = side === "right" ? "left" : "right";
  const childX = side === "right" ? parentX + opts.nodeWidth + opts.horizontalGap : parentX - opts.nodeWidth - opts.horizontalGap;
  for (const child of children) {
    const childH = subtreeHeight(child, opts);
    const childNodeY = childY + childH / 2 - nodeHeight(child, opts) / 2;
    const childId = layoutBranch(child, childX, childNodeY, side, opts, nodes, edges);
    edges.push({
      id: genId(),
      fromNode: parentId,
      fromSide,
      fromEnd: "none",
      toNode: childId,
      toSide,
      toEnd: "arrow"
    });
    childY += childH + opts.verticalGap;
  }
}
function layoutBranch(node, x, y, side, opts, nodes, edges) {
  const h = nodeHeight(node, opts);
  const id = node.id || genId();
  if (node.type === "file" || node.file) {
    nodes.push({ id, type: "file", file: node.file || node.text, x, y, width: opts.nodeWidth, height: h });
  } else if (node.type === "link" || node.url) {
    nodes.push({ id, type: "link", url: node.url || node.text, x, y, width: opts.nodeWidth, height: h });
  } else {
    nodes.push({ id, type: "text", text: node.text, x, y, width: opts.nodeWidth, height: h });
  }
  if (node.children.length === 0)
    return id;
  const fromSide = side === "right" ? "right" : "left";
  const toSide = side === "right" ? "left" : "right";
  const childX = side === "right" ? x + opts.nodeWidth + opts.horizontalGap : x - opts.nodeWidth - opts.horizontalGap;
  const totalH = groupHeight(node.children, opts);
  let childY = y + h / 2 - totalH / 2;
  for (const child of node.children) {
    const childH = subtreeHeight(child, opts);
    const childNodeY = childY + childH / 2 - nodeHeight(child, opts) / 2;
    const childId = layoutBranch(child, childX, childNodeY, side, opts, nodes, edges);
    edges.push({
      id: genId(),
      fromNode: id,
      fromSide,
      fromEnd: "none",
      toNode: childId,
      toSide,
      toEnd: "arrow"
    });
    childY += childH + opts.verticalGap;
  }
  return id;
}
function freemindToCanvas(xml, opts) {
  const roots = parseFreeMindXml(xml);
  if (roots.length === 0)
    return null;
  const nodes = [];
  const edges = [];
  let currentY = 0;
  const treeGap = opts.verticalGap * 4;
  for (const root of roots) {
    const height = layoutTree(root, 0, currentY, opts, nodes, edges);
    currentY += height + treeGap;
  }
  return { nodes, edges, mindmap: true };
}

module.exports = { freemindToCanvas, layoutTree, parseFreeMindXml };
