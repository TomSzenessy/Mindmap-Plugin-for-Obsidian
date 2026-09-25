"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

function loadRuntime() {
  const originalLoad = Module._load;
  class StubElement {
    addClass() {}
    removeClass() {}
    toggleClass() {}
    hasClass() { return false; }
    setAttribute() {}
    removeAttribute() {}
  }
  class TFile {
    constructor(filePath) {
      this.path = filePath;
      this.extension = filePath.split(".").pop();
      this.basename = filePath.split("/").pop().replace(/\.[^.]+$/, "");
      this.parent = { path: "" };
    }
  }
  class TFolder extends StubElement {}
  const obsidian = {
    Plugin: StubElement,
    PluginSettingTab: StubElement,
    ItemView: StubElement,
    Modal: StubElement,
    TFile,
    TFolder,
    Notice: StubElement,
    Setting: StubElement,
    SearchComponent: StubElement,
    MarkdownRenderer: { renderMarkdown() {} },
    Component: StubElement,
    debounce: (callback) => callback,
    setIcon() {},
    normalizePath: (value) => value
  };
  Module._load = function (request, parent, isMain) {
    if (request === "obsidian") return obsidian;
    if (request.startsWith("./lib/"))
      return originalLoad.call(this, path.resolve(__dirname, "..", request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  const mainPath = path.resolve(__dirname, "..", "src", "main.js");
  delete require.cache[mainPath];
  const { default: CanvasMindMapPlugin } = require(mainPath);
  const { CanvasAPI } = require("../lib/canvas-api.js");
  Module._load = originalLoad;
  return { CanvasMindMapPlugin, CanvasAPI, TFile };
}

function makeShell() {
  const classes = new Set();
  return {
    classes,
    classList: {
      contains: (name) => classes.has(name)
    },
    closest: () => this,
    toggleClass(name, enabled) {
      if (enabled) classes.add(name);
      else classes.delete(name);
    },
    addClass(name) { classes.add(name); },
    removeClass(name) { classes.delete(name); },
    hasClass(name) { return classes.has(name); },
    setAttribute() {},
    removeAttribute() {}
  };
}

function makeNode(id, x, y, text, data = {}) {
  const node = {
    id,
    x,
    y,
    width: 200,
    height: 60,
    text,
    type: "text",
    unknownData: { ...data },
    isEditing: false,
    nodeEl: makeShell(),
    containerEl: null,
    moveTo({ x: nextX, y: nextY }) {
      this.x = nextX;
      this.y = nextY;
    },
    moveAndResize({ x: nextX, y: nextY, width, height }) {
      this.x = nextX;
      this.y = nextY;
      this.width = width;
      this.height = height;
    },
    setColor(color) { this.color = color; },
    getData() { return this.unknownData; },
    setData(next) { this.unknownData = { ...this.unknownData, ...next }; }
  };
  node.containerEl = node.nodeEl;
  return node;
}

function makeCanvas() {
  const canvas = {
    nodes: new Map(),
    edges: new Map(),
    selection: new Set(),
    view: { file: { path: "Parent.canvas", parent: { path: "" } } },
    getData() {
      return {
        mindmap: true,
        nodes: [...this.nodes.values()].map((node) => ({
          id: node.id,
          type: node.type,
          text: node.text,
          file: node.file,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          unknownData: { ...node.unknownData },
          ...(node.color ? { color: node.color } : {})
        })),
        edges: [...this.edges.values()].map((edge) => ({
          id: edge.id,
          fromNode: edge.from.node.id,
          toNode: edge.to.node.id,
          fromSide: edge.from.side,
          toSide: edge.to.side
        }))
      };
    },
    setData(data) { Object.assign(this, data); },
    requestSave() {},
    requestFrame() {},
    createFileNode({ pos, size, file }) {
      const colliding = [...this.nodes.values()].some(
        (existing) => Math.abs(existing.x - pos.x) < 10 && Math.abs(existing.y - pos.y) < 10
      );
      const initialY = colliding ? pos.y + 120 : pos.y;
      const node = makeNode(`card-${this.nodes.size + 1}`, pos.x, initialY, "", {});
      node.type = "file";
      node.file = file.path || file;
      node.width = size.width;
      node.height = size.height;
      this.nodes.set(node.id, node);
      return node;
    },
    importData({ nodes = [], edges = [] }) {
      for (const spec of nodes) {
        if (!spec.id || this.nodes.has(spec.id)) continue;
        const node = makeNode(spec.id, spec.x, spec.y, spec.text || "", spec.unknownData || {});
        node.type = spec.type || "text";
        node.file = spec.file;
        node.width = spec.width || node.width;
        node.height = spec.height || node.height;
        this.nodes.set(node.id, node);
      }
      for (const spec of edges) {
        const from = this.nodes.get(spec.fromNode);
        const to = this.nodes.get(spec.toNode);
        if (!from || !to) continue;
        this.edges.set(spec.id, {
          id: spec.id,
          from: { node: from, side: spec.fromSide || "right" },
          to: { node: to, side: spec.toSide || "left" }
        });
      }
    },
    removeEdge(edge) { this.edges.delete(edge.id); },
    removeNode(node) {
      for (const edge of [...this.edges.values()]) {
        if (edge.from.node === node || edge.to.node === node) this.edges.delete(edge.id);
      }
      this.nodes.delete(node.id);
    },
    selectOnly(node) {
      this.selection.clear();
      if (node) this.selection.add(node);
    },
    deselectAll() { this.selection.clear(); }
  };
  const root = makeNode("root", 500, 200, "Root");
  const left = makeNode("left", 0, 200, "Left");
  const selected = makeNode("selected", 1000, 200, "Selected", { collapsed: true });
  const child = makeNode("child", 1500, 200, "Child");
  for (const node of [root, left, selected, child]) canvas.nodes.set(node.id, node);
  const connect = (id, from, to) => {
    canvas.edges.set(id, {
      id,
      from: { node: from, side: "right" },
      to: { node: to, side: "left" }
    });
  };
  connect("root-left", root, left);
  connect("root-selected", root, selected);
  connect("selected-child", selected, child);
  child.nodeEl = null;
  child.containerEl = null;
  return { canvas, root, left, selected, child };
}

test("keeps converted collapsed descendants out of later layout passes", async () => {
  const { CanvasMindMapPlugin, CanvasAPI, TFile } = loadRuntime();
  const { LayoutEngine } = require("../lib/layout.js");
  const { canvas, selected } = makeCanvas();
  const app = {
    vault: {
      getAbstractFileByPath() { return null; },
      async create(filePath) { return new TFile(filePath); },
      async modify() {}
    }
  };
  const plugin = {
    app,
    canvasApi: new CanvasAPI(app),
    settings: { defaultNodeWidth: 200, defaultNodeHeight: 60 },
    layoutEngine: new LayoutEngine({
      horizontalGap: 80,
      verticalGap: 20,
      nodeWidth: 200,
      nodeHeight: 60,
      animate: false
    }),
    branchColors: { applyColors() {} },
    isMindmapCanvas: () => true,
    markMarkdownOrderDirty() {},
    updateNodeTypeAttributes() {},
    updateGroupBounds() {},
    refreshOutline() {}
  };
  Object.setPrototypeOf(plugin, CanvasMindMapPlugin.prototype);

  const files = await CanvasMindMapPlugin.prototype.convertTopicToCleanNotes.call(
    plugin,
    canvas,
    selected,
    false
  );
  assert.equal(files.length, 1);
  const card = [...canvas.nodes.values()].find((node) => node.type === "file");
  assert.ok(card);
  assert.equal(card.unknownData.collapsed, true);

  const { buildForest } = require("../lib/tree-model.js");
  const visibleForest = buildForest(canvas, { includeHidden: false });
  const cardTree = visibleForest.flatMap((root) => [root, ...root.children]).find(
    (node) => node.canvasNode === card
  );
  assert.ok(cardTree);
  assert.equal(cardTree.children.length, 0);

  const firstCardPosition = { x: card.x, y: card.y };
  plugin.layoutEngine.layout(canvas, { preserveRootSides: true });
  plugin.layoutEngine.layout(canvas, { preserveRootSides: true });
  const nextForest = buildForest(canvas, { includeHidden: false });
  const nextCardTree = nextForest.flatMap((root) => [root, ...root.children]).find(
    (node) => node.canvasNode === card
  );
  assert.equal(nextCardTree.children.length, 0);
  assert.deepEqual({ x: card.x, y: card.y }, firstCardPosition);
});

test("removes a nested branch from the parent and keeps the replacement stable", async () => {
  const { CanvasMindMapPlugin, CanvasAPI, TFile } = loadRuntime();
  const { LayoutEngine } = require("../lib/layout.js");
  const { createMarkdownSyncOwnership } = require("../lib/markdown-sync.js");
  const { canvas, selected } = makeCanvas();
  const app = {
    vault: {
      getAbstractFileByPath() { return null; },
      async create(filePath) { return new TFile(filePath); },
      async modify() {},
      async process(file, transform) { return transform(file.content || ""); },
      async delete() {}
    }
  };
  const plugin = {
    app,
    markdownOwnership: createMarkdownSyncOwnership(),
    verifiedParentLinks: new Map(),
    persistPluginData: async () => {},
    canvasApi: new CanvasAPI(app),
    settings: { defaultNodeWidth: 200, defaultNodeHeight: 60 },
    layoutEngine: new LayoutEngine({
      horizontalGap: 80,
      verticalGap: 20,
      nodeWidth: 200,
      nodeHeight: 60,
      animate: false
    }),
    branchColors: { applyColors() {} },
    isMindmapCanvas: () => true,
    markMarkdownOrderDirty() {},
    updateNodeTypeAttributes() {},
    updateGroupBounds() {},
    refreshOutline() {}
  };
  Object.setPrototypeOf(plugin, CanvasMindMapPlugin.prototype);

  const originalPosition = { x: selected.x, y: selected.y, width: selected.width, height: selected.height };
  const result = await CanvasMindMapPlugin.prototype.convertTopicToNestedMindMap.call(
    plugin,
    canvas,
    selected
  );
  assert.ok(result);
  assert.deepEqual(
    { x: result.card.x, y: result.card.y, width: result.card.width, height: result.card.height },
    originalPosition
  );
  assert.equal(canvas.nodes.has("selected"), false);
  assert.equal(canvas.nodes.has("child"), false);
  const card = result.card;
  assert.equal(card.type, "file");
  assert.equal(card.unknownData.tomindmapCardKind, "nested-map");
  assert.equal(canvas.edges.size, 2);

  plugin.layoutEngine.layout(canvas, { preserveRootSides: true });
  const settledCardPosition = { x: card.x, y: card.y };
  plugin.layoutEngine.layout(canvas, { preserveRootSides: true });
  assert.deepEqual({ x: card.x, y: card.y }, settledCardPosition);
  assert.equal(canvas.nodes.has("child"), false);
});
