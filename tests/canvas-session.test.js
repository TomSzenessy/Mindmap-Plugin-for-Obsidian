"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  flushCanvasView,
  reflowCanvasAfterMove
} = require("../lib/canvas-session");

test("flushes the native Canvas save before a view is detached", async () => {
  const calls = [];
  const canvas = {
    requestSave: () => calls.push("request"),
    view: { save: async () => calls.push("save") }
  };

  await flushCanvasView(canvas);

  assert.deepEqual(calls, ["request", "save"]);
});

test("falls back to requestSave when a Canvas view has no immediate save API", async () => {
  let requests = 0;
  await flushCanvasView({ requestSave: () => requests++, view: {} });
  assert.equal(requests, 1);
});

test("writes an authoritative Canvas snapshot when leaving the view", async () => {
  let stored = '{"nodes":[]}';
  const file = { path: "Map.canvas" };
  const canvas = {
    getData: () => ({ nodes: [{ id: "a", x: 10 }], edges: [] }),
    requestSave() {},
    view: { file }
  };
  const vault = {
    async process(target, update) {
      assert.equal(target, file);
      stored = update(stored);
    }
  };

  await flushCanvasView(canvas, vault);

  assert.deepEqual(JSON.parse(stored), canvas.getData());
});

test("reflows the complete canvas after any topic move", () => {
  const calls = [];
  const canvas = { requestSave: () => calls.push("save") };
  const changed = reflowCanvasAfterMove(canvas, {
    isMindmap: () => true,
    layout: { layout: () => calls.push("layout") },
    updateGroups: () => calls.push("groups"),
    autoColor: () => true,
    colors: { applyColors: () => calls.push("colors") },
    markOrderDirty: () => calls.push("order")
  });

  assert.equal(changed, true);
  assert.deepEqual(calls, ["layout", "groups", "colors", "order", "save"]);
});

test("does not alter ordinary canvases", () => {
  let called = false;
  const changed = reflowCanvasAfterMove({}, {
    isMindmap: () => false,
    layout: { layout: () => { called = true; } }
  });
  assert.equal(changed, false);
  assert.equal(called, false);
});
