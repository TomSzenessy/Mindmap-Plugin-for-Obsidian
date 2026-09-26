"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class Element {
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

  remove() { this.parentElement?.removeChild(this); }
  empty() {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
  }
  createEl(tagName, options = {}) {
    const child = this.ownerDocument.createElement(tagName);
    if (options.cls) {
      for (const name of String(options.cls).split(/\s+/).filter(Boolean))
        child.addClass(name);
    }
    if (options.attr) {
      for (const [name, value] of Object.entries(options.attr))
        child.setAttribute(name, value);
    }
    if (options.text !== undefined) child.textContent = options.text;
    if (options.type) child.type = options.type;
    return this.appendChild(child);
  }
  createDiv(options = {}) { return this.createEl("div", options); }
  createSpan(options = {}) { return this.createEl("span", options); }
  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }
  addEventListener(type, listener, options) {
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    const listeners = this.listeners.get(key) || new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
  }
  removeEventListener(type, listener, options) {
    this.listeners.get(`${type}:${options === true ? "capture" : "bubble"}`)?.delete(listener);
  }
  dispatch(type, event = {}, options = false) {
    const payload = {
      type,
      target: this,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      ...event
    };
    const key = `${type}:${options === true ? "capture" : "bubble"}`;
    for (const listener of [...(this.listeners.get(key) || [])])
      listener(payload);
    return payload;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  addClass(...names) { for (const name of names) this.classes.add(name); }
  removeClass(...names) { for (const name of names) this.classes.delete(name); }
  toggleClass(name, enabled) { enabled ? this.addClass(name) : this.removeClass(name); }
  hasClass(name) { return this.classes.has(name); }
  matches(selector) {
    if (selector === ".canvas-node") return this.hasClass("canvas-node");
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith(".")) return this.hasClass(value.slice(1));
      if (value.startsWith("[") && value.endsWith("]")) {
        const expression = value.slice(1, -1);
        const exact = expression.match(/^([^~^$*|=]+)=(?:['"](.*)['"]|['"](.*)['"]|([^\]]+))$/);
        if (exact) {
          const name = exact[1].trim();
          const expected = exact[2] ?? exact[3] ?? exact[4] ?? "";
          return this.getAttribute(name) === expected;
        }
        const contains = expression.match(/^([^~^$*|=]+)\*=([\s\S]*)$/);
        if (contains) {
          const value = contains[2].replace(/^['"]|['"]$/g, "");
          return String(this.getAttribute(contains[1]) || "").includes(value);
        }
        return this.hasAttribute(expression);
      }
      return value.toUpperCase() === this.tagName;
    });
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  contains(candidate) {
    let current = candidate;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }
  querySelectorAll(selector) {
    const result = [];
    const pending = [...this.children];
    while (pending.length > 0) {
      const node = pending.pop();
      if (node.matches(selector)) result.push(node);
      for (let index = node.children.length - 1; index >= 0; index--)
        pending.push(node.children[index]);
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {}
  select() {}
  hide() { this.hidden = true; }
  show() { this.hidden = false; }
  isShown() { return !this.hidden; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }; }
  scrollIntoView() {}
  setText(value) { this.textContent = value; }
}

class Document {
  constructor() {
    this.defaultView = {
      requestAnimationFrame: (callback) => callback(),
      cancelAnimationFrame() {},
      getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      getComputedStyle: () => ({})
    };
  }
  createElement(tagName) { return new Element(tagName, this); }
  createRange() { return { selectNodeContents() {} }; }
  addEventListener() {}
  removeEventListener() {}
  dispatch(type, event = {}, options = false) {
    const payload = { type, target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...event };
    for (const listener of this.listeners?.get?.(`${type}:${options ? "capture" : "bubble"}`) || [])
      listener(payload);
    return payload;
  }
}

class TFile {
  constructor(filePath) {
    this.path = filePath;
    this.name = filePath.split("/").pop();
    this.basename = this.name.replace(/\.[^.]+$/, "");
    this.extension = this.name.split(".").pop();
    this.parent = { path: "" };
  }
}

function obsidianStub(document) {
  class Component { load() {} unload() {} }
  class Plugin {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; }
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
      this.containerEl = document.createElement("div");
      this.contentEl = document.createElement("div");
      this.containerEl.appendChild(this.contentEl);
    }
    getViewType() { return "item"; }
  }
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
  class Modal { constructor(app) { this.app = app; this.contentEl = document.createElement("div"); } }
  class Menu { addItem() {} showAtPosition() {} showAtMouseEvent() {} }
  class Notice { constructor(message) { this.message = message; } }
  class SearchComponent {
    constructor(container) { this.containerEl = container; this.inputEl = document.createElement("input"); }
    setPlaceholder() {}
    onChange() {}
    setValue() {}
  }
  class Setting { constructor(container) { this.containerEl = container; } }
  class TFolder { constructor(folderPath = "") { this.path = folderPath; } }
  return {
    Component,
    debounce: (callback) => callback,
    ItemView,
    MarkdownRenderer: { async renderMarkdown() {} },
    Menu,
    Modal,
    normalizePath: (value) => String(value || ""),
    Notice,
    Platform: { isDesktopApp: false, isMobileApp: false },
    Plugin,
    PluginSettingTab,
    SearchComponent,
    Setting,
    setIcon() {},
    TFile,
    TFolder
  };
}

function loadSource(document) {
  const obsidian = obsidianStub(document);
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
    document,
    window: document.defaultView,
    navigator: { clipboard: { async writeText() {} } },
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
    requestAnimationFrame: document.defaultView.requestAnimationFrame,
    cancelAnimationFrame() {},
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
  const execute = vm.runInContext(Module.wrap(source), vmContext, { filename: sourcePath });
  try {
    execute.call(sourceModule.exports, sourceModule.exports, context.require, sourceModule, sourcePath, path.dirname(sourcePath));
  } finally {
    Module._load = originalLoad;
  }
  return sourceModule.exports.default;
}

async function createOutline(document) {
  const CanvasMindMapPlugin = loadSource(document);
  const registrations = new Map();
  const app = {
    vault: {
      on() { return {}; },
      getAbstractFileByPath() { return null; }
    },
    workspace: {
      on() { return {}; },
      onLayoutReady() {},
      getActiveViewOfType() { return null; },
      getLeavesOfType() { return []; },
      trigger() {}
    }
  };
  const plugin = new CanvasMindMapPlugin(app, { id: "tomindmap" });
  plugin.loadData = async () => ({});
  plugin.saveData = async () => {};
  plugin.registerView = (type, factory) => registrations.set(type, factory);
  const previousDocument = global.document;
  const previousWindow = global.window;
  global.document = document;
  global.window = document.defaultView;
  try {
    await plugin.onload();
  } finally {
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
  const factory = registrations.get("tomindmap-outline");
  assert.equal(typeof factory, "function");
  return factory({ app, document });
}

function node(document, id, text, data = {}) {
  const shell = document.createElement("div");
  shell.addClass("canvas-node");
  const element = document.createElement("div");
  shell.appendChild(element);
  return {
    id,
    text,
    unknownData: { ...data },
    x: 0,
    y: Number(id.replace(/\D/g, "")) || 0,
    width: 200,
    height: 60,
    nodeEl: element,
    containerEl: shell,
    isEditing: false,
    getData() { return this.unknownData; },
    setData(next) { this.unknownData = { ...this.unknownData, ...next }; }
  };
}

function canvas(document, records) {
  const nodes = new Map(records.map((record) => [record.id, node(document, record.id, record.text || "", record.unknownData || {})]));
  const data = { mindmap: true, nodes: records, edges: [] };
  return {
    wrapperEl: document.createElement("div"),
    view: { file: new TFile("Map.canvas") },
    nodes,
    edges: new Map(),
    selection: new Set(),
    getData: () => data,
    setData(next) { Object.assign(data, next); },
    selectOnly(value) { this.selection = new Set(value ? [value] : []); },
    zoomToBbox() {}
  };
}

test("OutlineView validates a complete model before replacing the current tree", async () => {
  const document = new Document();
  const view = await createOutline(document);
  view.refresh(canvas(document, [{ id: "root", text: "Root" }]));
  const priorTree = view.contentEl.children[0];

  const malformed = canvas(document, [
    { id: "root", text: "Root" },
    { id: "group", type: "group", label: 42 }
  ]);
  malformed.nodes.get("group").label = 42;

  assert.doesNotThrow(() => view.refresh(malformed));
  assert.equal(view.contentEl.children[0], priorTree);
  assert.equal(view.contentEl.getAttribute("role"), "tree");
});

test("OutlineView renders semantic native controls and a 12,000-level chain iteratively", async () => {
  const document = new Document();
  const view = await createOutline(document);
  const records = Array.from({ length: 12000 }, (_, index) => ({
    id: `topic-${index}`,
    text: `Topic ${index}`
  }));
  const deep = canvas(document, records);
  for (let index = 1; index < records.length; index++) {
    deep.edges.set(`edge-${index}`, {
      id: `edge-${index}`,
      from: { node: deep.nodes.get(records[index - 1].id), side: "right" },
      to: { node: deep.nodes.get(records[index].id), side: "left" }
    });
  }
  deep.getData().edges = [...deep.edges.values()].map((edge) => ({
    id: edge.id,
    fromNode: edge.from.node.id,
    toNode: edge.to.node.id
  }));

  assert.doesNotThrow(() => view.refresh(deep));
  const treeItems = view.contentEl.querySelectorAll("[role='treeitem']");
  assert.equal(treeItems.length, 12000);
  const root = treeItems[0];
  assert.equal(root.getAttribute("aria-expanded"), "true");
  assert.equal(root.querySelectorAll("button").length >= 2, true);
  assert.equal(view.contentEl.querySelector("[aria-label*='Topic 11999']") !== null, true);
});

test("lib/outline-view exports OutlineView, OUTLINE_VIEW_TYPE, and outline helpers", () => {
  const outlineModule = require("../lib/outline-view.js");
  assert.equal(typeof outlineModule.OutlineView, "function");
  assert.equal(outlineModule.OUTLINE_VIEW_TYPE, "tomindmap-outline");
  assert.equal(typeof outlineModule.buildOutlineModel, "function");
  assert.equal(typeof outlineModule.outlineTreeDescendants, "function");
  assert.equal(typeof outlineModule.writeClipboardText, "function");
});
