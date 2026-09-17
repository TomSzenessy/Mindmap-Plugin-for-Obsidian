"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  finalizeNewTextNode,
  removeEmptyNodeOnEditExit,
  isBlankMindmapCanvas,
  isRootTopicNode,
  deriveCanvasTitle,
  flushCanvasView,
  reflowCanvasAfterMove
} = require("../lib/canvas-session");

test("removes a newly-created card when editing finishes with blank text", () => {
  const parent = { id: "parent" };
  const node = { id: "new", text: "  \n", __tomindmapPendingCreation: true };
  const calls = [];
  const canvas = { requestSave: () => calls.push("save") };
  const result = finalizeNewTextNode(canvas, node, {
    getParentNode: () => parent,
    removeNode: (candidateCanvas, candidateNode) =>
      calls.push([candidateCanvas, candidateNode])
  });

  assert.deepEqual(result, { removed: true, parent });
  assert.deepEqual(calls, [[canvas, node], "save"]);
});

test("keeps a newly-created card after its first non-empty edit", () => {
  const node = { id: "new", text: "Topic", __tomindmapPendingCreation: true };
  const result = finalizeNewTextNode({}, node, {
    removeNode: () => assert.fail("non-empty node must not be removed")
  });

  assert.deepEqual(result, { removed: false, parent: null });
  assert.equal(node.__tomindmapPendingCreation, undefined);
});

test("removes an existing card emptied by editing", () => {
  const parent = { id: "parent" };
  const node = { id: "card", text: "   " };
  const calls = [];
  const canvas = { requestSave: () => calls.push("save") };
  const result = removeEmptyNodeOnEditExit(canvas, node, {
    getParentNode: () => parent,
    getChildNodes: () => [],
    removeNode: (candidateCanvas, candidateNode) =>
      calls.push([candidateCanvas, candidateNode])
  });

  assert.deepEqual(result, { removed: true, parent });
  assert.deepEqual(calls, [[canvas, node], "save"]);
});

test("never removes the root topic even when empty", () => {
  const node = { id: "root", text: "" };
  const result = removeEmptyNodeOnEditExit({}, node, {
    getParentNode: () => null,
    removeNode: () => assert.fail("root must not be removed")
  });

  assert.deepEqual(result, { removed: false, parent: null });
});

test("never removes a card that still carries a subtree", () => {
  const node = { id: "branch", text: "" };
  const result = removeEmptyNodeOnEditExit({}, node, {
    getParentNode: () => ({ id: "root" }),
    getChildNodes: () => [{ id: "child" }],
    removeNode: () => assert.fail("card with children must not be removed")
  });

  assert.deepEqual(result, { removed: false, parent: null });
});

test("keeps non-empty cards and group cards", () => {
  const canvasApi = {
    getParentNode: () => ({ id: "root" }),
    getChildNodes: () => [],
    removeNode: () => assert.fail("card must not be removed")
  };
  assert.deepEqual(
    removeEmptyNodeOnEditExit({}, { id: "a", text: "Topic" }, canvasApi),
    { removed: false, parent: null }
  );
  assert.deepEqual(
    removeEmptyNodeOnEditExit(
      {},
      { id: "g", unknownData: { type: "group" }, label: "Group" },
      canvasApi
    ),
    { removed: false, parent: null }
  );
});

test("treats a canvas without topics as blank but ignores groups", () => {
  const empty = { nodes: new Map() };
  assert.equal(isBlankMindmapCanvas(empty), true);

  const grouped = {
    nodes: new Map([
      ["g", { id: "g", unknownData: { type: "group" }, label: "Group" }]
    ])
  };
  assert.equal(isBlankMindmapCanvas(grouped), true);

  const populated = {
    nodes: new Map([["a", { id: "a", text: "Topic" }]])
  };
  assert.equal(isBlankMindmapCanvas(populated), false);
});

test("only a parentless text card is a root topic", () => {
  const canvas = {};
  const node = { id: "root", text: "Title" };
  assert.equal(
    isRootTopicNode(canvas, node, { getParentNode: () => null }),
    true
  );
  assert.equal(
    isRootTopicNode(canvas, node, { getParentNode: () => ({ id: "p" }) }),
    false
  );
  assert.equal(
    isRootTopicNode(canvas, { id: "g", label: "Group" }, {
      getParentNode: () => null
    }),
    false
  );
  assert.equal(
    isRootTopicNode(canvas, { id: "f", file: "a.md" }, {
      getParentNode: () => null
    }),
    false
  );
});

test("flattens markdown into a safe canvas filename", () => {
  assert.equal(deriveCanvasTitle("Project plan"), "Project plan");
  assert.equal(deriveCanvasTitle("# Heading\nsecond line"), "Heading");
  assert.equal(deriveCanvasTitle("**Bold** _idea_"), "Bold idea");
  assert.equal(
    deriveCanvasTitle("[[Notes/Deep work|Deep work]]"),
    "Deep work"
  );
  assert.equal(
    deriveCanvasTitle("A/B: C? D* E"),
    "A B C D E"
  );
  assert.equal(deriveCanvasTitle("   "), "");
  assert.equal(deriveCanvasTitle("Trailing dots..."), "Trailing dots");
});

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
