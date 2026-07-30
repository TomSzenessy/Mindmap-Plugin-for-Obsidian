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
    name: "clipboard-markdown",
    source: "lib/clipboard-markdown.js",
    requireLine: 'var { normalizeClipboardMarkdown } = require("./lib/clipboard-markdown.js");',
    declaration: "var { normalizeClipboardMarkdown }"
  },
  {
    name: "export",
    source: "lib/export.js",
    requireLine: 'var { createExportMindMapModal, rasterizeSvg, saveToDownloads } = require("./lib/export.js");',
    declaration: "var { createExportMindMapModal, rasterizeSvg, renderHtmlAsVectorPdf, saveToDownloads }"
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
  },
  {
    name: "canvas-api",
    source: "lib/canvas-api.js",
    requireLine: 'var { CanvasAPI, findNodeFromEvent, genId } = require("./lib/canvas-api.js");',
    declaration: "var { CanvasAPI, findNodeFromEvent, genId }"
  },
  {
    name: "node-operations",
    source: "lib/node-operations.js",
    requireLine: 'var { NodeOperations } = require("./lib/node-operations.js");',
    declaration: "var { NodeOperations }"
  },
  {
    name: "layout",
    source: "lib/layout.js",
    requireLine: 'var { LayoutEngine, BranchColors, computeEdgeSides, registerDragEndHandler, updateAllEdgeSides } = require("./lib/layout.js");',
    declaration: "var { LayoutEngine, BranchColors, computeEdgeSides, registerDragEndHandler, updateAllEdgeSides }"
  },
  {
    name: "keyboard-navigation",
    source: "lib/keyboard-navigation.js",
    requireLine: 'var { KeyboardHandler, Navigation } = require("./lib/keyboard-navigation.js");',
    declaration: "var { KeyboardHandler, Navigation }"
  },
  {
    name: "freemind",
    source: "lib/freemind.js",
    requireLine: 'var { freemindToCanvas, layoutTree, parseFreeMindXml } = require("./lib/freemind.js");',
    declaration: "var { freemindToCanvas, layoutTree, parseFreeMindXml }"
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
