"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

// `obsidian` is provided by the Obsidian runtime, not npm, so unit tests that
// load a runtime module must answer its import with a minimal stub.
const obsidianStub = { Platform: { isMacOS: true } };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return obsidianStub;
  return originalLoad.call(this, request, parent, isMain);
};
const { KeyboardHandler } = require("../lib/keyboard-navigation.js");
Module._load = originalLoad;

function editingHarness() {
  const node = { id: "topic", isEditing: true };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    getData: () => ({ nodes: [{ id: node.id, type: "text" }] })
  };
  const canvasApi = {
    getActiveCanvas: () => canvas,
    getSelectedNode: () => node
  };
  const handler = new KeyboardHandler(
    { app: {} },
    canvasApi,
    {},
    {},
    {},
    () => false,
    () => true
  );
  return { canvas, handler, node };
}

test("all mutating commands are unavailable on an ordinary Canvas", () => {
  const commands = [];
  const node = { id: "ordinary", isEditing: false };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    wrapperEl: { contains: () => true }
  };
  const canvasApi = {
    getActiveCanvas: () => canvas,
    getSelectedNode: () => node
  };
  const handler = new KeyboardHandler(
    {
      app: {},
      manifest: { id: "tomindmap" },
      addCommand: (command) => commands.push(command),
      registerDomEvent: () => {}
    },
    canvasApi,
    {},
    {},
    {},
    () => false,
    () => false
  );
  const previousDocument = global.document;
  global.document = {};
  try {
    handler.register();
  } finally {
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
  const guarded = new Set([
    "mindmap-edit-node",
    "mindmap-save-node",
    "mindmap-add-child",
    "mindmap-add-sibling",
    "mindmap-add-sibling-before",
    "mindmap-add-parent",
    "mindmap-delete-branch",
    "mindmap-delete-node"
  ]);

  for (const command of commands) {
    if (guarded.has(command.id)) {
      assert.equal(command.checkCallback(true), false, command.id);
    }
  }
});

test("navigates only through visible topics and restores collapsed descendants after expansion", () => {
  const makeNode = (id, x, unknownData = {}) => ({
    id,
    x,
    y: 0,
    width: 100,
    height: 40,
    unknownData
  });
  const root = makeNode("root", 0, { collapsed: true });
  const hidden = makeNode("hidden", 120);
  const visible = makeNode("visible", 360);
  const nodes = [root, hidden, visible];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const canvas = {
    nodes: nodeMap,
    edges: new Map([
      ["root-hidden", { from: { node: root }, to: { node: hidden } }]
    ]),
    getData: () => ({
      nodes: nodes.map((node) => ({ id: node.id, type: "text" }))
    })
  };
  const handler = new KeyboardHandler(
    {
      settings: {
        navigationCrossAxisBuffer: 0,
        wrapArrowNavigation: false
      }
    },
    {},
    {},
    {},
    {},
    () => true,
    () => {}
  );

  assert.equal(handler.findSpatialTarget(canvas, root, "right")?.id, "visible");
  root.unknownData.collapsed = false;
  assert.equal(handler.findSpatialTarget(canvas, root, "right")?.id, "hidden");
});

test("captures Shift+Enter while a topic card is being edited", () => {
  const { canvas, handler } = editingHarness();
  const event = {
    key: "Enter",
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { closest: () => true }
  };

  assert.equal(handler.shouldCaptureNavigationShortcut(canvas, event), true);
});

test("leaves customizable modifier shortcuts for Obsidian commands", () => {
  const { canvas, handler, node } = editingHarness();
  node.isEditing = false;
  const event = {
    key: "C",
    shiftKey: true,
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    target: { closest: () => false }
  };
  assert.equal(handler.shouldCaptureNavigationShortcut(canvas, event), false);
  let prevented = false;
  event.preventDefault = () => { prevented = true; };
  event.stopImmediatePropagation = () => {};
  handler.handleKeydown(canvas, event);
  assert.equal(prevented, false);
  event.key = "ArrowUp";
  event.shiftKey = false;
  event.altKey = true;
  assert.equal(handler.shouldCaptureNavigationShortcut(canvas, event), true);
});

test("inserts a newline for Shift+Enter without leaving edit mode", () => {
  const { canvas, handler, node } = editingHarness();
  const calls = [];
  handler.insertEditorText = (candidate, text) => calls.push([candidate, text]);
  handler.finishEditing = () => calls.push(["finish"]);
  const event = {
    key: "Enter",
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    isComposing: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {}
  };

  handler.handleKeydown(canvas, event);

  assert.deepEqual(calls, [[node, "\n"]]);
  assert.equal(event.defaultPrevented, true);
});

test("does not reselect a blank new card removed after editing", () => {
  const { canvas, handler, node } = editingHarness();
  const calls = [];
  node.blur = () => {
    node.isEditing = false;
    calls.push("blur");
  };
  handler.canvasApi.selectForNavigation = () => calls.push("select");
  handler.onAfterFinishEditing = () => {
    calls.push("finalize");
    return true;
  };

  handler.finishEditing(canvas, node);

  assert.deepEqual(calls, ["blur", "finalize"]);
});
