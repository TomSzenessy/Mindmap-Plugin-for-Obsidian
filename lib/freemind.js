"use strict";

const { genId } = require("./canvas-api.js");

const DEFAULT_FREEMIND_BUDGETS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxNodes: 20000,
  maxDepth: 20000
});

const FREEMIND_REASON = Object.freeze({
  INVALID_INPUT: "invalid-input",
  INVALID_BUDGET: "invalid-budget",
  FILE_BYTE_BUDGET: "file-byte-budget",
  NODE_BUDGET: "node-budget",
  DEPTH_BUDGET: "depth-budget",
  EXTERNAL_ENTITY: "external-entity",
  PARSER_UNAVAILABLE: "parser-unavailable",
  MALFORMED: "malformed",
  LAYOUT: "layout"
});

const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  nodeWidth: 240,
  nodeHeight: 60,
  maxNodeHeight: 300,
  horizontalGap: 80,
  verticalGap: 20
});

let utf8Encoder;

function byteLength(value) {
  if (typeof TextEncoder === "function") {
    if (!utf8Encoder) utf8Encoder = new TextEncoder();
    return utf8Encoder.encode(value).length;
  }
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.codePointAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else {
      bytes += 4;
      index++;
    }
  }
  return bytes;
}

function failure(reason, details) {
  return details ? { ok: false, reason, ...details } : { ok: false, reason };
}

function success(value) {
  return { ok: true, value };
}

function numberBudget(value) {
  if (value === undefined) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return undefined;
  return number;
}

function resolveBudgets(options) {
  const source = options && typeof options === "object" ? options : {};
  const nested = source.budgets && typeof source.budgets === "object"
    ? source.budgets
    : source.limits && typeof source.limits === "object"
      ? source.limits
      : {};
  const values = {
    maxFileBytes: source.maxFileBytes ?? source.maxBytes ?? nested.maxFileBytes ?? nested.maxBytes,
    maxNodes: source.maxNodes ?? source.maxTopics ?? nested.maxNodes ?? nested.maxTopics,
    maxDepth: source.maxDepth ?? nested.maxDepth
  };
  const resolved = {};
  for (const [name, fallback] of Object.entries(DEFAULT_FREEMIND_BUDGETS)) {
    const candidate = values[name];
    if (candidate === undefined) {
      resolved[name] = fallback;
      continue;
    }
    const number = numberBudget(candidate);
    if (number === undefined) return failure(FREEMIND_REASON.INVALID_BUDGET, { budget: name });
    resolved[name] = number;
  }
  return success(resolved);
}

function normalizedLayoutOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  const result = { ...DEFAULT_LAYOUT_OPTIONS };
  for (const [key, value] of Object.entries(source)) {
    if (!(key in DEFAULT_LAYOUT_OPTIONS) || value === undefined) continue;
    const number = Number(value);
    const minimum = key === "horizontalGap" || key === "verticalGap" ? 0 : 1;
    if (!Number.isFinite(number) || number < minimum)
      throw new Error("FreeMind layout options must be finite bounds");
    result[key] = number;
  }
  return result;
}

function localName(element) {
  return String(element?.tagName || element?.nodeName || element?.localName || "")
    .split(":")
    .pop()
    .toLowerCase();
}

function childElements(element) {
  const children = element?.children || element?.childNodes || [];
  return Array.from(children);
}

function isTopicElement(element) {
  const name = localName(element);
  return name === "node" || name === "x-coggle-rootnode";
}

function hasParserError(document) {
  try {
    if (typeof document?.querySelector === "function" && document.querySelector("parsererror")) {
      return true;
    }
    if (typeof document?.getElementsByTagName === "function" && document.getElementsByTagName("parsererror").length > 0) {
      return true;
    }
  } catch (_error) {
    return true;
  }
  return false;
}

function findMap(document) {
  try {
    if (typeof document?.querySelector === "function") {
      const map = document.querySelector("map");
      if (map) return map;
    }
    if (typeof document?.getElementsByTagName === "function") {
      return document.getElementsByTagName("map")[0] || null;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function parseFreeMindDocument(xml, options) {
  if (typeof xml !== "string") return failure(FREEMIND_REASON.INVALID_INPUT);
  const budgetResult = resolveBudgets(options);
  if (!budgetResult.ok) return budgetResult;
  const budgets = budgetResult.value;
  const fileBytes = byteLength(xml);
  if (fileBytes > budgets.maxFileBytes) {
    return failure(FREEMIND_REASON.FILE_BYTE_BUDGET, {
      bytes: fileBytes,
      maxFileBytes: budgets.maxFileBytes
    });
  }
  const hasEntityDeclaration = /<!\s*ENTITY\b/i.test(xml);
  const hasExternalDoctype = /<!\s*DOCTYPE\b[^>]*\b(?:SYSTEM|PUBLIC)\b/i.test(xml);
  if (hasEntityDeclaration || hasExternalDoctype) {
    return failure(FREEMIND_REASON.EXTERNAL_ENTITY);
  }
  const Parser = options?.DOMParser || options?.domParser || options?.parser || globalThis.DOMParser;
  let parser;
  try {
    parser = typeof Parser === "function" ? new Parser() : Parser;
  } catch (_error) {
    return failure(FREEMIND_REASON.PARSER_UNAVAILABLE);
  }
  if (!parser || typeof parser.parseFromString !== "function") {
    return failure(FREEMIND_REASON.PARSER_UNAVAILABLE);
  }
  let document;
  try {
    document = parser.parseFromString(xml, "text/xml");
  } catch (_error) {
    return failure(FREEMIND_REASON.MALFORMED);
  }
  if (!document || hasParserError(document)) return failure(FREEMIND_REASON.MALFORMED);
  const map = findMap(document);
  if (!map) return failure(FREEMIND_REASON.MALFORMED);

  const roots = [];
  let nodeCount = 0;
  let maxDepth = 0;
  const rootElements = childElements(map).filter(isTopicElement);
  for (const rootElement of rootElements) {
    if (nodeCount >= budgets.maxNodes) {
      return failure(FREEMIND_REASON.NODE_BUDGET, {
        nodes: nodeCount + 1,
        maxNodes: budgets.maxNodes
      });
    }
    if (1 > budgets.maxDepth) {
      return failure(FREEMIND_REASON.DEPTH_BUDGET, { depth: 1, maxDepth: budgets.maxDepth });
    }
    const root = {
      text: rootElement.getAttribute("TEXT") || "Untitled",
      position: rootElement.getAttribute("POSITION") === "left" ? "left" : "right",
      children: []
    };
    nodeCount++;
    maxDepth = 1;
    roots.push(root);
    const stack = [{ element: rootElement, node: root, depth: 1, index: 0 }];
    const childStack = new Map([[rootElement, childElements(rootElement)]]);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = childStack.get(frame.element) || [];
      if (frame.index >= children.length) {
        stack.pop();
        continue;
      }
      const childElement = children[frame.index++];
      if (!isTopicElement(childElement)) continue;
      const depth = frame.depth + 1;
      if (depth > budgets.maxDepth) {
        return failure(FREEMIND_REASON.DEPTH_BUDGET, {
          depth,
          maxDepth: budgets.maxDepth
        });
      }
      if (nodeCount >= budgets.maxNodes) {
        return failure(FREEMIND_REASON.NODE_BUDGET, {
          nodes: nodeCount + 1,
          maxNodes: budgets.maxNodes
        });
      }
      const child = {
        text: childElement.getAttribute("TEXT") || "Untitled",
        position: childElement.getAttribute("POSITION") === "left"
          ? "left"
          : childElement.getAttribute("POSITION") === "right"
            ? "right"
            : frame.node.position,
        children: []
      };
      nodeCount++;
      maxDepth = Math.max(maxDepth, depth);
      frame.node.children.push(child);
      childStack.set(childElement, childElements(childElement));
      stack.push({ element: childElement, node: child, depth, index: 0 });
    }
  }
  return success({ roots, nodeCount, maxDepth });
}

function parseFreeMindXml(xml, options) {
  try {
    const parsed = parseFreeMindDocument(xml, options);
    return parsed.ok ? parsed.value.roots : [];
  } catch (_error) {
    return [];
  }
}

function estimateNodeHeight(text, nodeWidth, minHeight, maxHeight) {
  const AVG_CHAR_WIDTH = 8;
  const LINE_HEIGHT = 22;
  const PADDING = 20;
  const charsPerLine = Math.max(1, Math.floor((nodeWidth - PADDING) / AVG_CHAR_WIDTH));
  const paragraphs = String(text ?? "").split("\n");
  let totalLines = 0;
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) totalLines += 1;
    else totalLines += Math.ceil(paragraph.length / charsPerLine);
  }
  const estimated = totalLines * LINE_HEIGHT + PADDING;
  return Math.min(Math.max(estimated, minHeight), maxHeight);
}

function nodeHeight(node, opts) {
  return estimateNodeHeight(node.text, opts.nodeWidth, opts.nodeHeight, opts.maxNodeHeight);
}

function groupHeight(children, opts, heights) {
  if (children.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < children.length; index++) {
    if (index > 0) total += opts.verticalGap;
    const child = children[index];
    const measured = heights?.get(child);
    total += measured === undefined ? measureSubtreeHeights([child], opts).get(child) : measured;
  }
  return total;
}

function measureSubtreeHeights(roots, opts) {
  const heights = new Map();
  const visiting = new Set();
  const stack = [];
  for (let index = roots.length - 1; index >= 0; index--) {
    stack.push({ node: roots[index], index: 0 });
  }
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const node = frame.node;
    if (heights.has(node)) {
      stack.pop();
      visiting.delete(node);
      continue;
    }
    if (visiting.has(node)) {
      heights.set(node, nodeHeight(node, opts));
      stack.pop();
      visiting.delete(node);
      continue;
    }
    visiting.add(node);
    const children = node.children || [];
    if (frame.index < children.length) {
      stack.push({ node: children[frame.index++], index: 0 });
      continue;
    }
    let total = 0;
    for (let index = 0; index < children.length; index++) {
      if (index > 0) total += opts.verticalGap;
      total += heights.get(children[index]) ?? nodeHeight(children[index], opts);
    }
    heights.set(node, Math.max(nodeHeight(node, opts), total));
    stack.pop();
    visiting.delete(node);
  }
  return heights;
}

function emitNode(node, id, x, y, opts, nodes) {
  const height = nodeHeight(node, opts);
  if (node.type === "file" || node.file) {
    nodes.push({ id, type: "file", file: node.file || node.text, x, y, width: opts.nodeWidth, height });
  } else if (node.type === "link" || node.url) {
    nodes.push({ id, type: "link", url: node.url || node.text, x, y, width: opts.nodeWidth, height });
  } else {
    nodes.push({ id, type: "text", text: node.text, x, y, width: opts.nodeWidth, height });
  }
  return height;
}

function layoutBranch(node, x, y, side, opts, nodes, edges, heights) {
  const rootId = node.id || genId();
  const tasks = [{ kind: "node", node, id: rootId, x, y, side }];
  while (tasks.length > 0) {
    const task = tasks.pop();
    if (task.kind === "edge") {
      edges.push({
        id: genId(),
        fromNode: task.parentId,
        fromSide: task.fromSide,
        fromEnd: "none",
        toNode: task.childId,
        toSide: task.toSide,
        toEnd: "arrow"
      });
      continue;
    }
    const height = emitNode(task.node, task.id, task.x, task.y, opts, nodes);
    const children = task.node.children || [];
    if (children.length === 0) continue;
    const fromSide = task.side === "right" ? "right" : "left";
    const toSide = task.side === "right" ? "left" : "right";
    const totalHeight = groupHeight(children, opts, heights);
    let childY = task.y + height / 2 - totalHeight / 2;
    const placements = [];
    for (const child of children) {
      const childHeight = heights.get(child) ?? measureSubtreeHeights([child], opts).get(child);
      const childNodeY = childY + childHeight / 2 - nodeHeight(child, opts) / 2;
      const childSide = child.position === "left" || child.position === "right"
        ? child.position
        : task.side;
      const childX = childSide === "right"
        ? task.x + opts.nodeWidth + opts.horizontalGap
        : task.x - opts.nodeWidth - opts.horizontalGap;
      placements.push({
        node: child,
        id: child.id || genId(),
        x: childX,
        y: childNodeY,
        side: childSide,
        height: childHeight
      });
      childY += childHeight + opts.verticalGap;
    }
    for (let index = placements.length - 1; index >= 0; index--) {
      const placement = placements[index];
      tasks.push({
        kind: "edge",
        parentId: task.id,
        childId: placement.id,
        fromSide,
        toSide
      });
      tasks.push({
        kind: "node",
        node: placement.node,
        id: placement.id,
        x: placement.x,
        y: placement.y,
        side: placement.side
      });
    }
  }
  return rootId;
}

function layoutSide(parentId, children, side, parentX, parentCy, opts, nodes, edges, heights) {
  if (children.length === 0) return;
  const totalHeight = groupHeight(children, opts, heights);
  let childY = parentCy - totalHeight / 2;
  const fromSide = side === "right" ? "right" : "left";
  const toSide = side === "right" ? "left" : "right";
  const childX = side === "right"
    ? parentX + opts.nodeWidth + opts.horizontalGap
    : parentX - opts.nodeWidth - opts.horizontalGap;
  for (const child of children) {
    const childHeight = heights.get(child) ?? measureSubtreeHeights([child], opts).get(child);
    const childNodeY = childY + childHeight / 2 - nodeHeight(child, opts) / 2;
    const childId = layoutBranch(child, childX, childNodeY, side, opts, nodes, edges, heights);
    edges.push({
      id: genId(),
      fromNode: parentId,
      fromSide,
      fromEnd: "none",
      toNode: childId,
      toSide,
      toEnd: "arrow"
    });
    childY += childHeight + opts.verticalGap;
  }
}

function layoutTree(root, startX, startY, inputOptions, nodes, edges, suppliedHeights) {
  const opts = normalizedLayoutOptions(inputOptions);
  const outputNodes = Array.isArray(nodes) ? nodes : [];
  const outputEdges = Array.isArray(edges) ? edges : [];
  const heights = suppliedHeights || measureSubtreeHeights([root], opts);
  const rootHeight = nodeHeight(root, opts);
  const rootId = root.id || genId();
  emitNode(root, rootId, startX, startY, opts, outputNodes);
  const children = root.children || [];
  if (children.length === 0) return rootHeight;
  const rightChildren = children.filter((child) => child.position === "right");
  const leftChildren = children.filter((child) => child.position === "left");
  const rootCy = startY + rootHeight / 2;
  layoutSide(rootId, rightChildren, "right", startX, rootCy, opts, outputNodes, outputEdges, heights);
  layoutSide(rootId, leftChildren, "left", startX, rootCy, opts, outputNodes, outputEdges, heights);
  return Math.max(rootHeight, groupHeight(rightChildren, opts, heights), groupHeight(leftChildren, opts, heights));
}

/**
 * Decode and lay out a FreeMind document at the single bounded import seam.
 * `options` carries the optional XML parser adapter plus explicit file-byte,
 * topic-count, and depth budgets. The legacy Canvas-shaped adapter remains
 * `freemindToCanvas` below.
 *
 * @returns {{ok:true,value:object}|{ok:false,reason:string}}
 */
function decodeFreeMind(xml, options = {}) {
  let parsed;
  try {
    parsed = parseFreeMindDocument(xml, options);
  } catch (_error) {
    return failure(FREEMIND_REASON.MALFORMED);
  }
  if (!parsed.ok) return parsed;
  const roots = parsed.value.roots;
  if (roots.length === 0) {
    return success({ roots, nodes: [], edges: [], mindmap: true, nodeCount: 0, maxDepth: 0 });
  }
  let layoutOptions;
  let heights;
  const nodes = [];
  const edges = [];
  let currentY = 0;
  let treeGap = 0;
  try {
    layoutOptions = normalizedLayoutOptions(options);
    heights = measureSubtreeHeights(roots, layoutOptions);
    treeGap = layoutOptions.verticalGap * 4;
    for (const root of roots) {
      const height = layoutTree(root, 0, currentY, layoutOptions, nodes, edges, heights);
      currentY += height + treeGap;
    }
  } catch (_error) {
    return failure(FREEMIND_REASON.LAYOUT);
  }
  return success({
    roots,
    nodes,
    edges,
    mindmap: true,
    nodeCount: parsed.value.nodeCount,
    maxDepth: parsed.value.maxDepth
  });
}

function freemindToCanvas(xml, options = {}) {
  const decoded = decodeFreeMind(xml, options);
  if (!decoded.ok || decoded.value.roots.length === 0) return null;
  const { roots: _roots, nodeCount: _nodeCount, maxDepth: _maxDepth, ...canvas } = decoded.value;
  return canvas;
}

module.exports = {
  DEFAULT_FREEMIND_BUDGETS,
  FREEMIND_REASON,
  decodeFreeMind,
  freemindToCanvas,
  layoutTree,
  parseFreeMindXml
};
