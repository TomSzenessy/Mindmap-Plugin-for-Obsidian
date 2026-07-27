"use strict";

const modules = [
  {
    name: "tree-model",
    source: "lib/tree-model.js",
    requireLine: 'var {\n  buildForest,\n  getGroupIds,\n  findTreeForNode,\n  countReachable,\n  setDepths,\n  findTreeNode,\n  getDescendants,\n  assignDirections,\n  propagateDirection,\n  countChildrenPerSide\n} = require("./lib/tree-model.js");',
    declaration: "var {\n  buildForest,\n  getGroupIds,\n  findTreeForNode,\n  countReachable,\n  setDepths,\n  findTreeNode,\n  getDescendants,\n  assignDirections,\n  propagateDirection,\n  countChildrenPerSide\n}"
  },
  {
    name: "settings",
    source: "lib/settings.js",
    requireLine: 'var { DEFAULT_SETTINGS, normalizeSettings } = require("./lib/settings.js");',
    declaration: "var { DEFAULT_SETTINGS, normalizeSettings }"
  },
  {
    name: "media-drop",
    source: "lib/media-drop.js",
    requireLine: 'var MediaDrop = require("./lib/media-drop.js");',
    declaration: "var MediaDrop"
  },
  {
    name: "live-sizing",
    source: "lib/live-sizing.js",
    requireLine: 'var { CARD_LAYOUT_VERSION, LiveSizingController, hasAsyncRenderableContent, isResizableCanvasNode, isTextTopicCard } = require("./lib/live-sizing.js");',
    declaration: "var { CARD_LAYOUT_VERSION, LiveSizingController, hasAsyncRenderableContent, isResizableCanvasNode, isTextTopicCard }"
  },
  {
    name: "markdown-order",
    source: "lib/markdown-order.js",
    requireLine: 'var MarkdownOrder = require("./lib/markdown-order.js");',
    declaration: "var MarkdownOrder"
  },
  {
    name: "export",
    source: "lib/export.js",
    requireLine: 'var { createExportMindMapModal, rasterizeSvg, saveToDownloads } = require("./lib/export.js");',
    declaration: "var { createExportMindMapModal, rasterizeSvg, saveToDownloads }"
  },
  {
    name: "tree-drag",
    source: "lib/tree-drag.js",
    requireLine: 'var TreeDrag = require("./lib/tree-drag.js");',
    declaration: "var TreeDrag"
  },
  {
    name: "mindmap-actions",
    source: "lib/mindmap-actions.js",
    requireLine: 'var MindmapActions = require("./lib/mindmap-actions.js");',
    declaration: "var MindmapActions"
  },
  {
    name: "drag-preview-controller",
    source: "lib/drag-preview-controller.js",
    requireLine: 'var { createDragAttachmentController } = require("./lib/drag-preview-controller.js");',
    declaration: "var { createDragAttachmentController }"
  },
  {
    name: "canvas-session",
    source: "lib/canvas-session.js",
    requireLine: 'var { flushCanvasView, reflowCanvasAfterMove } = require("./lib/canvas-session.js");',
    declaration: "var { flushCanvasView, reflowCanvasAfterMove }"
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerPattern(name) {
  return new RegExp(
    `// <tomindmap:module ${escapeRegExp(name)}>\\n[\\s\\S]*?// </tomindmap:module ${escapeRegExp(name)}>`
  );
}

module.exports = { markerPattern, modules };
