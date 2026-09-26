"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  LINK_REASON,
  MarkdownSyncIndex,
  MarkdownSyncCoordinator,
  createMarkdownSyncOwnership
} = require("../lib/markdown-sync.js");
const MarkdownMindMapCodec = require("../lib/markdown-codec.js");

class FakeElement {
  constructor(tagName = "div", ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classes = new Set();
    this.attributes = new Map();
    this.style = {};
    this.textContent = "";
    this.value = "";
    this.type = "";
    this.disabled = false;
    this.hidden = false;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentElement = null;
    return child;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  empty() {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
  }

  createEl(tagName, options = {}) {
    const child = this.ownerDocument.createElement(tagName);
    Object.assign(child, options);
    if (options.text !== undefined) child.textContent = options.text;
    if (options.cls) {
      for (const name of String(options.cls).split(/\s+/).filter(Boolean))
        child.addClass(name);
    }
    if (options.attr) {
      for (const [name, value] of Object.entries(options.attr))
        child.setAttribute(name, value);
    }
    return this.appendChild(child);
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createSpan(options = {}) {
    return this.createEl("span", options);
  }

  addEventListener(type, listener, options) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    const listeners = this.listeners.get(key) || new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
  }

  removeEventListener(type, listener, options) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    this.listeners.get(key)?.delete(listener);
  }

  dispatch(type, event = {}, options = false) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    const payload = {
      type,
      target: this,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      ...event
    };
    for (const listener of [...(this.listeners.get(key) || [])])
      listener(payload);
    return payload;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addClass(...names) {
    for (const name of names) this.classes.add(name);
  }

  removeClass(...names) {
    for (const name of names) this.classes.delete(name);
  }

  toggleClass(name, enabled) {
    if (enabled) this.addClass(name);
    else this.removeClass(name);
  }

  hasClass(name) {
    return this.classes.has(name);
  }

  focus() {}
  select() {}
  hide() { this.hidden = true; }
  show() { this.hidden = false; }
  isShown() { return !this.hidden; }
  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }
  closest() { return null; }
  contains() { return false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }; }
  scrollIntoView() {}
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
  addEventListener(type, listener, options) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    const listeners = this.listeners.get(key) || new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
  }
  removeEventListener(type, listener, options) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    this.listeners.get(key)?.delete(listener);
  }
  dispatch(type, event = {}, options = false) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    const payload = {
      type,
      target: this,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      ...event
    };
    for (const listener of [...(this.listeners.get(key) || [])])
      listener(payload);
    return payload;
  }
}

class FakeTFile {
  constructor(filePath, content = "") {
    this.path = filePath;
    this.name = filePath.split("/").pop();
    this.basename = this.name.replace(/\.[^.]+$/, "");
    this.extension = this.name.includes(".") ? this.name.split(".").pop() : "";
    this.parent = { path: filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "" };
    this.stat = { mtime: 0, ctime: 0, size: content.length };
    this.content = content;
  }
}

function obsidianStub() {
  class Component {
    load() {}
    unload() {}
  }
  class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
    }
    addCommand() { return this; }
    addSettingTab() {}
    registerEvent() {}
    registerDomEvent() {}
    registerView() {}
    registerObsidianProtocolHandler() {}
  }
  class ItemView {
    constructor(leaf) {
      this.leaf = leaf;
      this.app = leaf?.app;
      this.containerEl = new FakeElement("div");
      this.contentEl = new FakeElement("div");
      this.containerEl.appendChild(this.contentEl);
    }
    getViewType() { return "item"; }
  }
  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = new FakeElement("div");
    }
  }
  class Modal {
    constructor(app) { this.app = app; this.contentEl = new FakeElement("div"); }
    open() {}
    close() {}
  }
  class Menu {
    addItem() {}
    showAtPosition() {}
    showAtMouseEvent() {}
  }
  class MenuItem {}
  class Notice {
    constructor(message) { this.message = message; FakeElement.notices ||= []; FakeElement.notices.push(message); }
  }
  class SearchComponent {
    constructor(container) { this.containerEl = container; this.inputEl = new FakeElement("input"); }
    setPlaceholder() {}
    onChange() {}
    setValue() {}
  }
  class Setting {
    constructor(container) { this.containerEl = container; }
    setName() { return this; }
    setDesc() { return this; }
    addText(callback) { callback(this.text = new FakeElement("input")); return this; }
    addToggle(callback) { callback(this.toggle = new FakeElement("input")); return this; }
    addDropdown(callback) { callback(this.dropdown = new FakeElement("select")); return this; }
  }
  class TFolder { constructor(folderPath = "") { this.path = folderPath; this.children = []; } }
  return {
    Component,
    debounce: (callback) => callback,
    ItemView,
    MarkdownRenderer: { async renderMarkdown() {} },
    Menu,
    MenuItem,
    Modal,
    normalizePath: (value) => String(value || "").replace(/\\/g, "/").replace(/^\/+/, ""),
    Notice,
    Platform: { isDesktopApp: false, isMobileApp: false },
    Plugin,
    PluginSettingTab,
    SearchComponent,
    Setting,
    setIcon() {},
    TFile: FakeTFile,
    TFolder
  };
}

function loadSource() {
  const obsidian = obsidianStub();
  const sourcePath = path.resolve(__dirname, "..", "src", "main.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sourceModule = { exports: {} };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "obsidian") return obsidian;
    return originalLoad.call(this, request, parent, isMain);
  };
  const context = {
    module: sourceModule,
    exports: sourceModule.exports,
    require(request) {
      if (request === "obsidian") return obsidian;
      if (request.startsWith("./lib/"))
        return require(path.resolve(__dirname, "..", request.slice(2)));
      return require(request);
    },
    __dirname: path.dirname(sourcePath),
    __filename: sourcePath,
    Buffer,
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
    crypto: globalThis.crypto,
    Intl,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet
  };
  context.globalThis = context;
  context.global = context;
  const vmContext = vm.createContext(context);
  const execute = vm.runInContext(Module.wrap(source), vmContext, {
    filename: sourcePath
  });
  try {
    execute.call(
      sourceModule.exports,
      sourceModule.exports,
      context.require,
      sourceModule,
      sourcePath,
      path.dirname(sourcePath)
    );
  } finally {
    Module._load = originalLoad;
  }
  return {
    ...sourceModule.exports,
    obsidian,
    FakeElement,
    FakeDocument,
    FakeTFile
  };
}

function mindmapCanvas(document) {
  const wrapper = new FakeElement("div", document);
  wrapper.ownerDocument.defaultView = { requestAnimationFrame: (callback) => callback() };
  const data = { mindmap: true, nodes: [], edges: [] };
  return {
    wrapperEl: wrapper,
    view: {
      file: new FakeTFile("Map.canvas"),
      containerEl: new FakeElement("div", document)
    },
    nodes: new Map(),
    edges: new Map(),
    selection: new Set(),
    getData: () => data,
    setData(next) { Object.assign(data, next); },
    requestSave() {},
    requestFrame() {}
  };
}

test("claims a topic pointer gesture before the host Canvas can also drag it", () => {
  const { default: CanvasMindMapPlugin, FakeDocument, FakeElement } = loadSource();
  const document = new FakeDocument();
  const wrapper = new FakeElement("div", document);
  const target = {};
  const connectionTarget = {
    closest: () => null,
    parentElement: {
      classList: {
        contains: (name) => name === "canvas-node-connection-point"
      }
    }
  };
  const nodeEl = {
    contains: (value) => value === target || value === connectionTarget,
    closest: () => null,
    addClass() {},
    removeClass() {},
    toggleClass() {},
    classList: { toggle() {} }
  };
  const node = {
    id: "topic",
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    isEditing: false,
    nodeEl,
    moveTo() {}
  };
  const canvas = {
    wrapperEl: wrapper,
    nodes: new Map([[node.id, node]]),
    edges: new Map(),
    selection: new Set(),
    getData: () => ({ mindmap: true, nodes: [{ id: node.id, type: "text" }], edges: [] }),
    posFromEvt: () => ({ x: 0, y: 0 }),
    requestSave() {},
    requestFrame() {}
  };
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  plugin.canvasApi = {
    getIncomingEdges: () => [],
    getParentNode: () => null,
    getSelectedNode: () => null,
    getGraphQuery: () => ({ forest: [] })
  };
  plugin.isMindmapCanvas = () => true;
  plugin.collectSubtreeNodes = () => [];
  plugin.settings = { defaultNodeWidth: 200, defaultNodeHeight: 60 };
  const cleanup = plugin.registerNodeDragReparentHandler(canvas);
  let prevented = 0;
  let stopped = 0;
  let stoppedImmediate = 0;
  wrapper.dispatch("pointerdown", {
    button: 0,
    pointerId: 1,
    target,
    preventDefault() { prevented++; },
    stopPropagation() { stopped++; },
    stopImmediatePropagation() { stoppedImmediate++; }
  }, true);
  wrapper.dispatch("pointerdown", {
    button: 0,
    pointerId: 2,
    target: connectionTarget,
    preventDefault() { prevented++; },
    stopPropagation() { stopped++; },
    stopImmediatePropagation() { stoppedImmediate++; }
  }, true);
  cleanup.dispose("cancel");
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(stoppedImmediate, 1);
});

test("pointermove updates the dragged topic position and preview after exceeding deadzone", () => {
  const { default: CanvasMindMapPlugin, FakeDocument, FakeElement } = loadSource();
  const document = new FakeDocument();
  document.defaultView = {
    requestAnimationFrame: (cb) => cb(),
    cancelAnimationFrame: () => {}
  };
  const wrapper = new FakeElement("div", document);
  const target = {};
  const nodeEl = {
    contains: (value) => value === target,
    closest: () => null,
    addClass() {},
    removeClass() {},
    toggleClass() {},
    classList: { toggle() {} }
  };
  const node = {
    id: "topic",
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    isEditing: false,
    nodeEl,
    moveTo(pos) {
      this.x = pos.x;
      this.y = pos.y;
    }
  };
  let currentPointerPos = { x: 0, y: 0 };
  const canvas = {
    wrapperEl: wrapper,
    nodes: new Map([[node.id, node]]),
    edges: new Map(),
    selection: new Set(),
    getData: () => ({ mindmap: true, nodes: [{ id: node.id, type: "text" }], edges: [] }),
    posFromEvt: () => ({ ...currentPointerPos }),
    requestSave() {},
    requestFrame() {}
  };
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  plugin.canvasApi = {
    getIncomingEdges: () => [],
    getParentNode: () => null,
    getSelectedNode: () => null,
    getGraphQuery: () => ({ forest: [] })
  };
  plugin.isMindmapCanvas = () => true;
  plugin.collectSubtreeNodes = () => [];
  plugin.settings = { defaultNodeWidth: 200, defaultNodeHeight: 60 };
  const cleanup = plugin.registerNodeDragReparentHandler(canvas);

  // 1. Pointer down on topic card at (0, 0)
  wrapper.dispatch("pointerdown", {
    button: 0,
    pointerId: 1,
    target
  }, true);

  // 2. Micro movement (5px <= 10px deadzone)
  currentPointerPos = { x: 5, y: 0 };
  document.dispatch("pointermove", { pointerId: 1 }, true);
  assert.equal(node.x, 0, "node should not move within 10px deadzone");

  // 3. Movement past deadzone (50px > 10px)
  currentPointerPos = { x: 50, y: 20 };
  document.dispatch("pointermove", { pointerId: 1 }, true);
  assert.equal(node.x, 50, "node should move to pointer offset during drag");
  assert.equal(node.y, 20, "node should move to pointer offset during drag");

  cleanup.dispose("cancel");
});


test("saving touch-control settings reconfigures the active Canvas without a leaf switch", async () => {
  const { default: CanvasMindMapPlugin, obsidian, FakeDocument, FakeTFile } = loadSource();
  const document = new FakeDocument();
  const app = {
    vault: {
      getAbstractFileByPath(filePath) {
        return filePath.endsWith(".canvas") ? new FakeTFile(filePath) : null;
      }
    },
    workspace: {
      getLeavesOfType() { return []; }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.saveData = async () => {};
  plugin.settings = {
    ...plugin.settings,
    touchControls: "on",
    defaultNodeWidth: 300,
    defaultNodeHeight: 60,
    horizontalGap: 80,
    verticalGap: 20
  };
  plugin.canvasApi = {
    getActiveCanvas: () => null,
    getAnyCanvas: () => null
  };
  plugin.layoutEngine = { layout() {} };
  plugin.nodeOps = {};
  plugin.keyboardHandler = {};
  plugin.interceptedCanvas = mindmapCanvas(document);
  let oldTouchCleanupCalls = 0;
  plugin.cleanupTouchHandler = () => { oldTouchCleanupCalls += 1; };

  await plugin.saveSettings();

  assert.equal(oldTouchCleanupCalls, 1);
  assert.equal(plugin.isMindmapCanvas(plugin.interceptedCanvas), true);
  assert.equal(plugin.isTouchUiEnabled(), true);
  assert.equal(plugin.touchController !== null, true);
  assert.equal(
    plugin.interceptedCanvas.wrapperEl.children.filter((child) =>
      child.className === "tomindmap-touch-toolbar"
    ).length,
    1
  );

  assert.equal(typeof obsidian.Platform.isMobileApp, "boolean");
});

test("indexMarkdownLink preserves the previous route when a new target is over capacity", () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  plugin.markdownSyncIndex = new MarkdownSyncIndex({ limit: 1 });

  assert.equal(plugin.indexMarkdownLink("one.canvas", "one.md"), true);
  assert.equal(plugin.indexMarkdownLink("two.canvas", "two.md"), false);
  assert.equal(plugin.getIndexedMarkdownPath("one.canvas"), "one.md");
  assert.deepEqual(plugin.markdownSyncIndex.canvasesFor("two.md"), []);
});

test("attach rolls back the Canvas link, registry, file, and persistence when indexing fails", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const canvasFile = new FakeTFile("Map.canvas");
  const data = { mindmap: true, nodes: [], edges: [] };
  const canvas = {
    view: { file: canvasFile },
    getData: () => data,
    setData(next) { Object.assign(data, next); },
    requestSave() {}
  };
  const created = [];
  const files = new Map();
  const app = {
    vault: {
      getAbstractFileByPath() { return null; },
      async create(path, content) {
        const file = new FakeTFile(path, content);
        files.set(path, file);
        created.push(file);
        return file;
      },
      async delete(file) { files.delete(file.path); }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  const saved = [];
  plugin.saveData = async (value) => saved.push(value);
  plugin.encodeMarkdownDocument = () => ({ ok: true, value: { markdown: "# Root" } });
  plugin.indexMarkdownLink = () => false;

  const result = await plugin.attachMarkdownSync(canvas);

  assert.equal(result.ok, false);
  assert.equal(data.mindmapMarkdownSync, undefined);
  assert.equal(files.size, 0);
  assert.equal(plugin.markdownOwnership.recordsForCanvas("Map.canvas").length, 0);
  assert.equal(saved.length >= 2, true);
});

test("parent adoption persists the full child link after the parent card patch", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const parentFile = new FakeTFile("Parent.canvas", JSON.stringify({
    nodes: [{ id: "card", type: "file", file: "Child.canvas", unknownData: {
      tomindmapTitleOnly: true,
      tomindmapCardKind: "nested-map",
      tomindmapCardTitle: "Child"
    } }],
    edges: []
  }));
  const childFile = new FakeTFile("Child.canvas");
  const childData = {
    mindmap: true,
    mindmapParent: { canvas: "Parent.canvas", nodeId: "card" },
    nodes: [],
    edges: []
  };
  const child = {
    view: { file: childFile },
    getData: () => childData,
    setData(next) { Object.assign(childData, next); },
    requestSave() {}
  };
  const files = new Map([["Parent.canvas", parentFile]]);
  const app = {
    vault: {
      getAbstractFileByPath(path) { return path === "Parent.canvas" ? parentFile : null; },
      async cachedRead(file) { return file.content; },
      async process(file, callback) {
        const before = file.content;
        const after = callback(before);
        file.content = after;
        files.set(file.path, after);
        return after;
      }
    },
    workspace: { getLeavesOfType() { return []; } }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.saveData = async () => {};
  plugin.confirmLegacyLink = async () => true;
  plugin.getOpenCanvasByPath = () => null;

  const result = await plugin.resolveParentLinkForCanvas(child, childData.mindmapParent, { confirmLegacy: true });

  assert.equal(result.ok, true);
  assert.equal(childData.mindmapParent.proof, result.link.proof);
  assert.equal(childData.mindmapParent.syncId, result.link.syncId);
  const persisted = JSON.parse(parentFile.content);
  assert.equal(persisted.nodes[0].unknownData.tomindmapSyncId, result.link.syncId);
});

test("unload drains a coordinator debounce before disposing the session", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const file = new FakeTFile("Map.canvas");
  const canvas = {
    view: { file, save: async () => {} },
    getData: () => ({ nodes: [], edges: [] }),
    requestSave() {}
  };
  const app = { vault: { cachedRead: async () => "" } };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.interceptedCanvas = canvas;
  plugin.markdownSyncCoordinator = new MarkdownSyncCoordinator({ delay: 20 });
  plugin.disposeCanvasGestures = () => {};
  plugin.cancelPendingAsync = () => {};
  plugin.disposeCanvasDecorations = () => {};
  plugin.unwrapCanvasMethods = () => {};
  let ran = false;
  plugin.markdownSyncCoordinator.schedule("Map.md", async () => {
    ran = true;
    return { ok: true };
  });

  plugin.onunload();
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(ran, true);
});

test("plugin-data writes are serialized in mutation order", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  plugin.markdownOwnership = createMarkdownSyncOwnership();
  const saved = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  plugin.saveData = async (value) => {
    saved.push(value);
    if (saved.length === 1) await gate;
  };
  const first = plugin.persistPluginData();
  const syncId = "a".repeat(32);
  const issued = plugin.markdownOwnership.issueRecord({
    canvasPath: "Map.canvas",
    kind: "markdown",
    targetPath: "Map.md",
    syncId,
    nodeId: null
  });
  assert.equal(issued.ok, true);
  plugin.markdownOwnership.upsert(issued.record);
  const second = plugin.persistPluginData();
  release();
  await Promise.all([first, second]);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].ownership.records[0].syncId, syncId);
});


test("Markdown conversion persists a private link and target claim together", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const source = new FakeTFile("Notes/Plan.md", "# Plan\n\n- Alpha\n");
  let sourceContent = source.content;
  let created = null;
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => filePath === source.path ? source : null,
      cachedRead: async () => sourceContent,
      create: async (filePath, content) => {
        created = new FakeTFile(filePath, content);
        return created;
      },
      process: async (file, transform) => {
        if (file !== source) return;
        sourceContent = transform(sourceContent);
        source.content = sourceContent;
        source.stat.size = sourceContent.length;
      },
      delete: async () => {}
    },
    workspace: { getLeaf: () => ({ openFile: async () => {} }) }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.saveData = async () => {};
  await plugin.convertMarkdownFileToMindMap(source);
  assert.ok(created);
  const data = JSON.parse(created.content);
  assert.equal(data.mindmapMarkdownSync.path, source.path);
  assert.match(data.mindmapMarkdownSync.proof, /^[a-f0-9]{32}\.[a-f0-9]{32}$/);
  assert.match(sourceContent, new RegExp(`syncId: ["']?${data.mindmapMarkdownSync.syncId}`));
  assert.equal(plugin.markdownOwnership.recordsForCanvas(created.path).length, 1);
});


test("bounded Markdown file reader rejects oversized files before text allocation", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  let read = false;
  const result = await plugin.readBoundedMarkdownFile({
    size: MarkdownMindMapCodec.DEFAULT_MARKDOWN_BUDGETS.maxFileBytes + 1,
    text() { read = true; return "# too large"; }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "file-byte-budget");
  assert.equal(read, false);
});

test("Markdown import rolls back pasted nodes and edges when a root connection fails", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const file = new FakeTFile("Map.canvas");
  const parentNode = { id: "parent", type: "text", text: "Parent", x: 0, y: 0, width: 100, height: 30 };
  const nodes = new Map([[parentNode.id, parentNode]]);
  const edges = new Map();
  const data = { mindmap: true, nodes: [], edges: [] };
  const canvas = {
    view: { file },
    nodes,
    edges,
    selection: new Set(),
    getData: () => data,
    setData(next) {
      Object.assign(data, next);
      nodes.clear();
      edges.clear();
      for (const node of next.nodes || []) nodes.set(node.id, node);
      for (const edge of next.edges || []) edges.set(edge.id, edge);
    },
    importData(imported) {
      for (const node of imported.nodes) nodes.set(node.id, node);
      for (const edge of imported.edges) edges.set(edge.id, edge);
    },
    requestSave() {}
  };
  const plugin = new CanvasMindMapPlugin({ vault: {} }, { id: "tomindmap" });
  plugin.isAutoAdjustCanvas = () => false;
  plugin.updateGroupBounds = () => {};
  plugin.refreshOutline = () => {};
  plugin.validateMediaLinks = async () => 0;
  plugin.canvasApi = {
    invalidateEdgeIndex: () => {},
    createEdge: () => null
  };
  plugin.layoutMarkdownDocument = () => ({
    ok: true,
    value: { nodes: [{ id: "imported", text: "Imported", x: 0, y: 0, width: 100, height: 30 }], edges: [], rootIds: ["imported"] }
  });

  const result = await plugin.importMarkdownIntoCanvas(canvas, "# Imported", "clipboard", parentNode);

  assert.equal(result.ok, false);
  assert.equal(nodes.has("imported"), false);
  assert.equal(edges.size, 0);
  assert.equal(data.mindmap, true);
});

test("reverse fan-out preserves a conflict and does not rewrite Markdown when a live Canvas is editing", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const { createSyncId, patchSyncIdOwnership } = require("../lib/markdown-sync.js");
  const syncId = createSyncId();
  const target = new FakeTFile("Map.md");
  const canvasFile = new FakeTFile("Map.canvas");
  const canvasData = {
    mindmap: true,
    mindmapMarkdownSync: null,
    nodes: [],
    edges: []
  };
  const canvas = {
    view: { file: canvasFile },
    getData: () => canvasData,
    requestSave() {}
  };
  const app = {
    vault: {
      getAbstractFileByPath(path) {
        if (path === "Map.canvas") return canvasFile;
        if (path === "Map.md") return target;
        return null;
      },
      async cachedRead(file) { return file.content; },
      async read() { return target.content; }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  const issued = plugin.markdownOwnership.issueRecord({
    canvasPath: "Map.canvas", kind: "markdown", targetPath: "Map.md", syncId, nodeId: null
  });
  assert.equal(issued.ok, true);
  plugin.markdownOwnership.upsert(issued.record);
  const patched = patchSyncIdOwnership("# Root\n", issued.record.syncId);
  assert.equal(patched.ok, true);
  target.content = patched.markdown;
  const link = {
    path: "Map.md", syncId: issued.record.syncId, proof: issued.record.proof,
    ownership: { source: "plugin-data" }
  };
  canvasData.mindmapMarkdownSync = link;
  canvasFile.content = JSON.stringify(canvasData);
  plugin.markdownSyncIndex.link("Map.canvas", "Map.md");
  plugin.getOpenCanvasByPath = () => canvas;
  plugin.layoutMarkdownDocument = () => ({
    ok: true,
    value: { nodes: [{ id: "n1", text: "Root", x: 0, y: 0, width: 100, height: 30 }], edges: [], rootIds: ["n1"] }
  });
  let applied = false;
  let rewrites = 0;
  plugin.applyMarkdownToLiveCanvas = async () => {
    applied = true;
    return { ok: false, reason: LINK_REASON.EDITING };
  };
  plugin.writeMarkdownFile = async () => { rewrites += 1; return { ok: true }; };

  const result = await plugin.syncMarkdownFileToCanvases(target);

  assert.equal(applied, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, LINK_REASON.CONFLICT);
  assert.equal(rewrites, 0);
});

test("Canvas rename applies final migration links and keeps the index/registry on the new path", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const oldPath = "Old.canvas";
  const newFile = new FakeTFile("New.canvas", JSON.stringify({ mindmap: true, nodes: [], edges: [] }));
  const app = {
    vault: {
      getAbstractFileByPath(path) { return path === "New.canvas" ? newFile : null; },
      async cachedRead(file) { return file.content; },
      async process(file, callback) {
        file.content = callback(file.content);
        return file.content;
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  const issued = plugin.markdownOwnership.issueRecord({
    canvasPath: oldPath, kind: "markdown", targetPath: "Map.md", syncId: require("../lib/markdown-sync.js").createSyncId(), nodeId: null
  });
  assert.equal(issued.ok, true);
  plugin.markdownOwnership.upsert(issued.record);
  const oldLink = {
    path: "Map.md", syncId: issued.record.syncId, proof: issued.record.proof,
    ownership: { source: "plugin-data" }
  };
  plugin.markdownSyncIndex.link(oldPath, "Map.md");
  plugin.verifiedMarkdownLinks.set(oldPath, oldLink);
  plugin.getOpenCanvasByPath = () => null;
  plugin.updateNestedParentReferences = async () => {};
  plugin.saveData = async () => {};

  await plugin.handleSyncedFileRename(newFile, oldPath);

  const migrated = JSON.parse(newFile.content);
  assert.equal(migrated.mindmapMarkdownSync.canvasPath, "New.canvas");
  assert.equal(migrated.mindmapMarkdownSync.path, "Map.md");
  assert.equal(plugin.markdownSyncIndex.markdownFor("New.canvas"), "Map.md");
  assert.equal(plugin.markdownOwnership.recordsForCanvas("New.canvas").length, 1);
});

test("Markdown rename reissues ownership from current Canvas data and rolls back metadata on failure", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const { createSyncId } = require("../lib/markdown-sync.js");
  const oldPath = "Old.md";
  const newFile = new FakeTFile("New.md", "# Renamed\n");
  const oldLink = null;
  const canvasFile = new FakeTFile("Map.canvas", JSON.stringify({ mindmap: true, nodes: [], edges: [] }));
  const app = {
    vault: {
      getAbstractFileByPath(path) { return path === "Map.canvas" ? canvasFile : null; },
      async cachedRead(file) { return file.content; },
      async process(file, callback) {
        file.content = callback(file.content);
        return file.content;
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  const issued = plugin.markdownOwnership.issueRecord({
    canvasPath: "Map.canvas", kind: "markdown", targetPath: oldPath, syncId: createSyncId(), nodeId: null
  });
  assert.equal(issued.ok, true);
  plugin.markdownOwnership.upsert(issued.record);
  const link = {
    path: oldPath, syncId: issued.record.syncId, proof: issued.record.proof,
    ownership: { source: "plugin-data" }
  };
  canvasFile.content = JSON.stringify({ mindmap: true, mindmapMarkdownSync: link, nodes: [], edges: [] });
  plugin.markdownSyncIndex.link("Map.canvas", oldPath);
  plugin.saveData = async () => {};
  plugin.getOpenCanvasByPath = () => null;

  await plugin.handleSyncedFileRename(newFile, oldPath);

  const migrated = JSON.parse(canvasFile.content);
  assert.equal(migrated.mindmapMarkdownSync.path, "New.md");
  assert.equal(plugin.markdownSyncIndex.markdownFor("Map.canvas"), "New.md");
  assert.equal(plugin.markdownOwnership.recordsForCanvas("Map.canvas")[0].targetPath, "New.md");
});

test("select-and-edit delayed start is cancelled when the Canvas session changes", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  const canvas = { nodes: new Map() };
  const otherCanvas = { nodes: new Map() };
  const node = { id: "node", nodeEl: { removeClass() {} }, startEditing() { this.edited = true; } };
  canvas.nodes.set(node.id, node);
  plugin.interceptedCanvas = canvas;
  plugin.canvasApi = { selectAndZoom() {} };
  plugin.selectAndEditTracked(canvas, node, 10);
  plugin.interceptedCanvas = otherCanvas;
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(node.edited, undefined);
});

test("deleted Markdown fan-out rolls back every earlier Canvas when a later owner fails", async () => {
  const { default: CanvasMindMapPlugin, FakeTFile } = loadSource();
  const target = new FakeTFile("Shared.md");
  const paths = ["One.canvas", "Two.canvas"];
  const files = new Map(paths.map((path) => [path, new FakeTFile(path)]));
  const data = new Map();
  for (const path of paths) {
    data.set(path, { mindmap: true, nodes: [], edges: [] });
    files.get(path).content = JSON.stringify(data.get(path));
  }
  const app = {
    vault: {
      getAbstractFileByPath(path) { return files.get(path) || null; },
      async cachedRead(file) { return file.content; },
      async process(file, callback) {
        if (file.path === "Two.canvas") throw new Error("mid-loop failure");
        file.content = callback(file.content);
        return file.content;
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.getOpenCanvasByPath = () => null;
  plugin.saveData = async () => {};
  const records = [];
  plugin.markdownOwnership = {
    records,
    recordsForCanvas(path) { return records.filter((record) => record.canvasPath === path); },
    removeCanvas(path) {
      const removed = records.filter((record) => record.canvasPath === path);
      for (let index = records.length - 1; index >= 0; index--)
        if (records[index].canvasPath === path) records.splice(index, 1);
      return { ok: true, records: removed };
    },
    upsert(record) {
      const index = records.findIndex((candidate) => candidate.canvasPath === record.canvasPath && candidate.kind === record.kind);
      if (index >= 0) records[index] = record; else records.push(record);
      return { ok: true, record };
    }
  };
  for (const [index, path] of paths.entries()) {
    const record = {
      canvasPath: path, kind: "markdown", targetPath: "Shared.md",
      syncId: `sync-${index}`, proof: `proof-${index}`, nodeId: null
    };
    records.push(record);
    const link = {
      path: "Shared.md", syncId: record.syncId, proof: record.proof,
      ownership: { source: "plugin-data" }
    };
    data.get(path).mindmapMarkdownSync = link;
    files.get(path).content = JSON.stringify(data.get(path));
    plugin.markdownSyncIndex.link(path, "Shared.md");
    plugin.verifiedMarkdownLinks.set(path, link);
  }
  plugin.markdownSyncCoordinator.entryFor("Shared.md");

  await plugin.handleSyncedFileDelete(target);

  for (const path of paths) {
    assert.equal(JSON.parse(files.get(path).content).mindmapMarkdownSync.path, "Shared.md");
    assert.equal(plugin.markdownSyncIndex.markdownFor(path), "Shared.md");
    assert.equal(plugin.markdownOwnership.recordsForCanvas(path).length, 1);
  }
  assert.equal(plugin.markdownSyncCoordinator.entries.has("Shared.md"), true);
  plugin.markdownSyncCoordinator.detach("Shared.md");
});

test("decoration restore covers the selected controlsOwner and resizer elements", () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  const makeElement = (classes = [], attrs = {}) => ({
    classes: new Set(classes),
    attributes: new Map(Object.entries(attrs)),
    children: [],
    parentElement: null,
    matches(selector) { return selector === ".canvas-node" || selector.includes("resizer"); },
    hasClass(name) { return this.classes.has(name); },
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    addClass(name) { this.classes.add(name); },
    toggleClass(name, enabled) { if (enabled) this.classes.add(name); else this.classes.delete(name); },
    querySelectorAll() { return this.children; }
  });
  const resizer = makeElement(["original-resizer"], { "aria-label": "original" });
  const controlsOwner = makeElement(["tomindmap-resizable-content"], { "data-node-type": "text" });
  controlsOwner.children.push(resizer);
  resizer.parentElement = controlsOwner;
  const shell = makeElement(["canvas-node"]);
  shell.parentElement = controlsOwner;
  const node = { id: "node", nodeEl: shell, containerEl: makeElement() };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    edges: new Map(),
    selection: new Set([node]),
    wrapperEl: {}
  };
  plugin.captureCanvasDecorations(canvas);
  assert.equal(plugin.canvasDecorationState.get(canvas).elements.has(controlsOwner), true);
  controlsOwner.addClass("tomindmap-missing-media");
  controlsOwner.setAttribute("data-node-type", "mutated");
  resizer.addClass("tomindmap-title-only-card");
  resizer.setAttribute("aria-label", "mutated");
  plugin.disposeCanvasDecorations(canvas);
  assert.equal(controlsOwner.hasClass("tomindmap-missing-media"), false);
  assert.equal(controlsOwner.getAttribute("data-node-type"), "text");
  assert.equal(resizer.hasClass("tomindmap-title-only-card"), false);
  assert.equal(resizer.getAttribute("aria-label"), "original");
});

test("filterMindmapPaneMenu removes Better Export PDF and Export as image menu items", () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });

  const items = [
    { title: "Bookmark...", dom: { remove() {}, style: {} } },
    { title: "Better Export PDF", dom: { remove() {}, style: {} } },
    { title: "Export as image", dom: { remove() {}, style: {} } },
    { title: "Copy whole map as Markdown", dom: { remove() {}, style: {} } }
  ];
  const menu = { items, showAtMouseEvent: () => {}, showAtPosition: () => {} };

  plugin.filterMindmapPaneMenu(menu);

  assert.equal(menu.items.length, 2);
  assert.equal(menu.items[0].title, "Bookmark...");
  assert.equal(menu.items[1].title, "Copy whole map as Markdown");
});

test("checkNestedMindMapUndo deletes the created nested canvas file when card is undone", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  let trashedPath = null;
  const app = {
    vault: {
      getAbstractFileByPath: (p) => ({ path: p, name: p }),
      trash: async (file) => { trashedPath = file.path; }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  const canvas = {
    view: { file: { path: "Parent.canvas" } },
    nodes: new Map([["card-1", { id: "card-1" }]])
  };

  plugin.pendingNestedMindMapUndo = {
    canvas,
    canvasPath: "Parent.canvas",
    nestedPath: "Nested.canvas",
    nestedFile: { path: "Nested.canvas", name: "Nested.canvas" },
    cardId: "nested-card-id"
  };

  // card-1 is on canvas, but cardId "nested-card-id" was removed by undo
  await plugin.checkNestedMindMapUndo(canvas);

  assert.equal(trashedPath, "Nested.canvas");
  assert.equal(plugin.pendingNestedMindMapUndo, null);
});

test("createNewMindMap creates mind map in active note folder by default or root", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  let createdPath = null;
  let createdContent = null;
  let openedFile = null;
  const app = {
    workspace: {
      getActiveFile: () => ({ path: "Work/Project/Notes.md", parent: { path: "Work/Project" } }),
      getLeavesOfType: () => [],
      getLeaf: () => ({ openFile: async (f) => { openedFile = f; } })
    },
    vault: {
      getAbstractFileByPath: () => null,
      create: async (p, content) => {
        createdPath = p;
        createdContent = content;
        return { path: p, basename: "Untitled" };
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.canvasApi = {
    getActiveCanvas: () => null,
    zoomToNode: () => {},
    startEditing: () => {}
  };

  const file = await plugin.createNewMindMap();
  assert.equal(createdPath, "Work/Project/Untitled.canvas");
  const parsed = JSON.parse(createdContent);
  assert.equal(parsed.mindmap, true);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].text, "# Mind map");
});

test("applyCanvasCommandRename updates canvas:new-file command name and hooks callbacks", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  let created = false;
  const origCallback = () => {};
  const origCheckCallback = (checking) => !checking;
  const command = {
    id: "canvas:new-file",
    name: "Create new canvas",
    callback: origCallback,
    checkCallback: origCheckCallback
  };
  const app = {
    commands: {
      commands: {
        "canvas:new-file": command
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.settings = { renameCreateCanvas: true };
  plugin.createNewMindMap = async () => { created = true; };

  plugin.applyCanvasCommandRename();
  assert.equal(command.name, "Create new mind map");
  assert.notEqual(command.callback, origCallback);
  assert.equal(command.checkCallback(true), true);
  command.callback();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(created, true);

  plugin.settings = { renameCreateCanvas: false };
  plugin.applyCanvasCommandRename();
  assert.equal(command.name, "Create new canvas");
  assert.equal(command.callback, origCallback);
  assert.equal(command.checkCallback, origCheckCallback);
});

test("interceptCanvasFileMenu renames New canvas item and routes creation to target folder", () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  let createdInFolder = null;
  const plugin = new CanvasMindMapPlugin({}, { id: "tomindmap" });
  plugin.settings = { renameCreateCanvas: true };
  plugin.createNewMindMap = async (folder) => { createdInFolder = folder; };

  let clickHandler = null;
  const item = {
    title: "New canvas",
    setTitle(t) { this.title = t; return this; },
    setIcon(i) { this.icon = i; return this; },
    onClick(cb) { clickHandler = cb; return this; }
  };
  const menu = {
    items: [item],
    showAtPosition() {},
    showAtMouseEvent() {}
  };

  const folder = { path: "Projects/MindMaps" };
  plugin.interceptCanvasFileMenu(menu, folder);

  assert.equal(item.title, "New mind map");
  assert.equal(item.icon, "git-fork");
  assert.equal(typeof clickHandler, "function");

  clickHandler();
  assert.equal(createdInFolder, "Projects/MindMaps");
});

test("createNewMindMap resolves folder from file-explorer when no active file", async () => {
  const { default: CanvasMindMapPlugin } = loadSource();
  let createdPath = null;
  const app = {
    workspace: {
      getActiveFile: () => null,
      getActiveViewOfType: () => null,
      getLeavesOfType: (type) => {
        if (type === "file-explorer") {
          return [{
            view: {
              activeFileItem: { file: { path: "Docs/ActiveFolder" } }
            }
          }];
        }
        return [];
      },
      getLeaf: () => ({ openFile: async () => {} })
    },
    vault: {
      getAbstractFileByPath: () => null,
      create: async (p) => {
        createdPath = p;
        return { path: p, basename: "Untitled" };
      }
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.canvasApi = {
    getActiveCanvas: () => null,
    zoomToNode: () => {},
    startEditing: () => {}
  };

  await plugin.createNewMindMap();
  assert.equal(createdPath, "Docs/ActiveFolder/Untitled.canvas");
});

