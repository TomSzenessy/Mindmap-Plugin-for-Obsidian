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
