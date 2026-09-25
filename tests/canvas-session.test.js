"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  finalizeNewTextNode,
  removeEmptyNodeOnEditExit,
  pruneEmptyLeafTopics,
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

function specCanvas(spec) {
  const nodes = new Map(
    Object.entries(spec).map(([id, data]) => [
      id,
      { id, text: "", ...data }
    ])
  );
  const canvas = { nodes, requestSave() {} };
  const canvasApi = {
    getParentNode: (_canvas, node) => {
      const parentId = spec[node.id]?.parent;
      return parentId ? nodes.get(parentId) || null : null;
    },
    getChildNodes: (_canvas, node) =>
      Object.entries(spec)
        .filter(([, data]) => data.parent === node.id)
        .map(([id]) => nodes.get(id))
        .filter(Boolean),
    removeNode: (_canvas, node) => {
      nodes.delete(node.id);
    }
  };
  return { canvas, canvasApi, nodes };
}

test("removes blank leaves and cascades to a parent left empty", () => {
  const spec = {
    root: { text: "Root" },
    middle: { text: "", parent: "root" },
    leaf: { text: "", parent: "middle" }
  };
  const { canvas, canvasApi, nodes } = specCanvas(spec);

  const removed = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.deepEqual(
    removed.map((entry) => entry.node.id),
    ["leaf", "middle"]
  );
  assert.equal(nodes.has("root"), true);
  assert.equal(nodes.has("middle"), false);
  assert.equal(nodes.has("leaf"), false);
});

test("keeps blank cards that still carry children and non-empty cards", () => {
  const spec = {
    root: { text: "Root" },
    parent: { text: "", parent: "root" },
    child: { text: "Child", parent: "parent" },
    titled: { text: "Titled", parent: "root" }
  };
  const { canvas, canvasApi, nodes } = specCanvas(spec);

  const removed = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.deepEqual(removed, []);
  assert.equal(nodes.size, 4);
});

test("never removes the lone blank central topic or a card being edited", () => {
  const lone = specCanvas({ root: { text: "" } });
  assert.deepEqual(
    pruneEmptyLeafTopics(lone.canvas, lone.canvasApi),
    []
  );
  assert.equal(lone.nodes.has("root"), true);

  const editing = specCanvas({
    root: { text: "Root" },
    draft: { text: "", parent: "root", isEditing: true },
    pending: {
      text: "",
      parent: "root",
      __tomindmapPendingCreation: true
    }
  });
  assert.deepEqual(
    pruneEmptyLeafTopics(editing.canvas, editing.canvasApi),
    []
  );
  assert.equal(editing.nodes.has("draft"), true);
  assert.equal(editing.nodes.has("pending"), true);
});

test("ignores group, file, and link cards when pruning", () => {
  const spec = {
    root: { text: "Root" },
    spare: { text: "", parent: "root" },
    group: { label: "Group", unknownData: { type: "group" } },
    file: { file: "image.png" },
    link: { url: "https://example.com" }
  };
  const { canvas, canvasApi, nodes } = specCanvas(spec);

  const removed = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.deepEqual(
    removed.map((entry) => entry.node.id),
    ["spare"]
  );
  assert.equal(nodes.has("group"), true);
  assert.equal(nodes.has("file"), true);
  assert.equal(nodes.has("link"), true);
  assert.equal(nodes.has("root"), true);
});

test("collapses a blank branch deeper than the old fixed sweep limit", () => {
  const depth = 60;
  const spec = { root: { text: "Root" } };
  for (let level = 1; level <= depth; level++) {
    spec[`blank-${level}`] = {
      text: "",
      parent: level === 1 ? "root" : `blank-${level - 1}`
    };
  }
  const { canvas, canvasApi, nodes } = specCanvas(spec);

  const removed = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.equal(removed.length, depth);
  assert.deepEqual(
    removed.map((entry) => entry.node.id),
    Array.from({ length: depth }, (_unused, index) => `blank-${depth - index}`)
  );
  assert.deepEqual(Array.from(nodes.keys()), ["root"]);
});

test("prunes from one canonical graph snapshot without repeated graph lookups", () => {
  const depth = 1000;
  const nodes = new Map();
  const forest = [];
  let parent = null;
  for (let index = 0; index <= depth; index++) {
    const node = {
      id: index === 0 ? "root" : `blank-${index}`,
      text: index === 0 ? "Root" : ""
    };
    nodes.set(node.id, node);
    const treeNode = { canvasNode: node, children: [], parent };
    if (parent) parent.children.push(treeNode);
    else forest.push(treeNode);
    parent = treeNode;
  }
  let graphQueries = 0;
  const canvas = { nodes, requestSave() {} };
  const canvasApi = {
    getGraphQuery: () => {
      graphQueries += 1;
      return { forest };
    },
    getParentNode: () => assert.fail("parent graph must not be rebuilt per removal"),
    getChildNodes: () => assert.fail("child graph must not be rebuilt per removal"),
    removeNode: (_canvas, node) => nodes.delete(node.id)
  };

  const result = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.equal(result.length, depth);
  assert.equal(graphQueries, 1);
  assert.deepEqual([...nodes.keys()], ["root"]);
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
    async cachedRead() {
      return stored;
    },
    async process(target, update) {
      assert.equal(target, file);
      stored = update(stored);
    }
  };

  assert.equal(await flushCanvasView(canvas, vault), true);
  assert.deepEqual(JSON.parse(stored), canvas.getData());
});

test("never resurrects a stale Canvas snapshot over a newer saved graph", async () => {
  const stale = '{"nodes":[]}';
  const newer = '{"nodes":[{"id":"other"}]}';
  let stored = stale;
  const canvas = {
    getData: () => ({ nodes: [{ id: "a", x: 10 }], edges: [] }),
    requestSave() {},
    view: {
      file: { path: "Map.canvas" },
      // Another window or sync client persists a newer graph while the native
      // save is still in flight.
      save: async () => {
        stored = newer;
      }
    }
  };
  const vault = {
    async cachedRead() {
      return stored;
    },
    async process(_target, update) {
      stored = update(stored);
    }
  };

  assert.equal(await flushCanvasView(canvas, vault), false);
  assert.equal(stored, newer);
});

test("skips the Canvas fallback when the file cannot be read back", async () => {
  let writes = 0;
  const canvas = {
    getData: () => ({ nodes: [], edges: [] }),
    requestSave() {},
    view: { file: { path: "Map.canvas" } }
  };
  const vault = {
    async cachedRead() {
      throw new Error("missing file");
    },
    async process() {
      writes++;
    }
  };

  assert.equal(await flushCanvasView(canvas, vault), false);
  assert.equal(writes, 0);
});

test("reflows the complete canvas after any topic move", () => {
  const calls = [];
  let layoutOptions = null;
  const canvas = { requestSave: () => calls.push("save") };
  const changed = reflowCanvasAfterMove(canvas, {
    isMindmap: () => true,
    layout: { layout: (_canvas, options) => { layoutOptions = options; calls.push("layout"); } },
    updateGroups: () => calls.push("groups"),
    autoColor: () => true,
    colors: { applyColors: () => calls.push("colors") },
    markOrderDirty: () => calls.push("order")
  });

  assert.equal(changed, true);
  assert.deepEqual(layoutOptions, { preserveRootSides: true });
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

test("sweeping blank leaves stays linear instead of rescanning the Canvas", () => {
  const leaves = 200;
  const spec = { root: { text: "Root" } };
  for (let index = 0; index < leaves; index++)
    spec[`blank-${index}`] = { text: "", parent: "root" };
  const { canvas, canvasApi, nodes } = specCanvas(spec);

  // Count how many cards the sweep actually looks at. A leaf queue visits
  // each removed card a constant number of times instead of rebuilding the
  // whole topic list after every removal.
  let yields = 0;
  const real = canvas.nodes;
  canvas.nodes = {
    has: (id) => real.has(id),
    get: (id) => real.get(id),
    delete: (id) => real.delete(id),
    size: real.size,
    values() {
      const inner = real.values();
      return {
        [Symbol.iterator]() {
          return {
            next() {
              const step = inner.next();
              if (!step.done) yields++;
              return step;
            }
          };
        }
      };
    }
  };

  const removed = pruneEmptyLeafTopics(canvas, canvasApi);

  assert.equal(removed.length, leaves);
  assert.equal(real.size, 1);
  assert.ok(
    yields <= leaves * 4,
    `expected a linear sweep of ${leaves + 1} cards, saw ${yields} visits`
  );
});
