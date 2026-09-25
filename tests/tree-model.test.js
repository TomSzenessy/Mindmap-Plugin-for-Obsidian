"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildForest,
  countReachable,
  findTreeForNode,
  getDescendants,
  getGroupIds
} = require("../lib/tree-model.js");

function makeCanvas(nodeIds, edgePairs, groupIds = []) {
  const nodes = new Map(nodeIds.map((id, index) => [
    id,
    { id, x: index * 100, y: index * 20, width: 80, height: 40 }
  ]));
  for (const id of groupIds)
    nodes.set(id, { id, x: 0, y: 0, width: 500, height: 500 });
  const edges = new Map(edgePairs.map(([fromId, toId], index) => [
    `edge-${index}`,
    {
      from: { node: nodes.get(fromId) },
      to: { node: nodes.get(toId) }
    }
  ]));
  return {
    nodes,
    edges,
    getData: () => ({
      nodes: [
        ...nodeIds.map((id) => ({ id, type: "text" })),
        ...groupIds.map((id) => ({ id, type: "group" }))
      ]
    })
  };
}

test("builds a deterministic forest from a valid canvas tree", () => {
  const canvas = makeCanvas(["root", "a", "b", "c"], [
    ["root", "a"],
    ["root", "b"],
    ["a", "c"]
  ]);
  const forest = buildForest(canvas);

  assert.equal(forest.length, 1);
  assert.equal(forest[0].canvasNode.id, "root");
  assert.equal(countReachable(forest[0]), 4);
  assert.deepEqual(getDescendants(forest[0]).map((node) => node.canvasNode.id), ["a", "c", "b"]);
  assert.equal(findTreeForNode(forest, "c").depth, 2);
});

test("ignores groups, self-links, cycles, and surplus parents safely", () => {
  const canvas = makeCanvas(["a", "b", "c"], [
    ["a", "a"],
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
    ["a", "c"],
    ["group", "b"]
  ], ["group"]);
  const forest = buildForest(canvas);

  assert.equal(forest.length, 1);
  assert.equal(forest[0].canvasNode.id, "a");
  assert.equal(countReachable(forest[0]), 3);
  assert.equal(findTreeForNode(forest, "b").parent.canvasNode.id, "a");
  assert.equal(findTreeForNode(forest, "c").parent.canvasNode.id, "b");
  assert.equal(findTreeForNode(forest, "group"), null);
});

test("ignores transient drag preview edges when deriving hierarchy", () => {
  const root = { id: "root", x: 0, y: 0, width: 200, height: 60 };
  const parent = { id: "parent", x: 300, y: 0, width: 200, height: 60 };
  const dragged = { id: "dragged", x: 600, y: 0, width: 200, height: 60 };
  const permanent = {
    id: "permanent",
    from: { node: root },
    to: { node: dragged }
  };
  const preview = {
    id: "preview",
    from: { node: parent },
    to: { node: dragged },
    __mindMapPreview: true
  };
  const canvas = {
    nodes: new Map([root, parent, dragged].map((node) => [node.id, node])),
    edges: new Map([[preview.id, preview], [permanent.id, permanent]]),
    getData: () => ({
      nodes: [root, parent, dragged].map((node) => ({ ...node, type: "text" }))
    })
  };

  const forest = buildForest(canvas);
  const draggedTree = findTreeForNode(forest, "dragged");
  assert.equal(draggedTree.parent.canvasNode.id, "root");
});

test("can omit collapsed descendants from layout forests", () => {
  const canvas = makeCanvas(["root", "hidden", "visible"], [
    ["root", "hidden"],
    ["root", "visible"]
  ]);
  canvas.nodes.get("hidden").nodeEl = {
    classList: { contains: (className) => className === "tomindmap-collapsed-hidden" }
  };
  const forest = buildForest(canvas, { includeHidden: false });
  assert.deepEqual(getDescendants(forest[0]).map((node) => node.canvasNode.id), ["visible"]);
  assert.equal(findTreeForNode(forest, "hidden"), null);
});

test("uses persisted collapse state when descendants are not mounted", () => {
  const canvas = makeCanvas(["root", "child", "leaf"], [
    ["root", "child"],
    ["child", "leaf"]
  ]);
  canvas.nodes.get("root").unknownData = { collapsed: true };

  const forest = buildForest(canvas, { includeHidden: false });

  assert.equal(forest[0].children.length, 0);
  assert.equal(findTreeForNode(forest, "child"), null);
  assert.equal(findTreeForNode(forest, "leaf"), null);
  assert.equal(buildForest(canvas)[0].children[0].canvasNode.id, "child");
});

test("ignores non-boolean persisted collapse values", () => {
  const canvas = makeCanvas(["root", "child"], [["root", "child"]]);
  canvas.nodes.get("root").unknownData = { collapsed: "false" };

  const forest = buildForest(canvas, { includeHidden: false });
  assert.equal(forest[0].children[0].canvasNode.id, "child");
});

test("handles very deep maps without recursive tree-model overflow", () => {
  const size = 12000;
  const ids = Array.from({ length: size }, (_, index) => `n${index}`);
  const edges = ids.slice(1).map((id, index) => [ids[index], id]);
  const forest = buildForest(makeCanvas(ids, edges));

  assert.equal(forest.length, 1);
  assert.equal(countReachable(forest[0]), size);
  assert.equal(findTreeForNode(forest, ids[size - 1]).depth, size - 1);
});

test("validates malformed Canvas group metadata and falls back to live group cards", () => {
  const group = {
    id: "group",
    x: 0,
    y: 0,
    width: 500,
    height: 500,
    unknownData: { type: "group" },
    getData() {
      throw new Error("malformed live node");
    }
  };
  const topic = { id: "topic", x: 0, y: 0, width: 100, height: 40 };
  const edge = { from: { node: group }, to: { node: topic } };
  const canvas = {
    nodes: new Map([[group.id, group], [topic.id, topic]]),
    edges: new Map([["edge", edge]]),
    getData: () => ({ nodes: { malformed: true } })
  };

  assert.deepEqual([...getGroupIds(canvas)], ["group"]);
  const forest = buildForest(canvas);
  assert.deepEqual(forest.map((node) => node.canvasNode.id), ["topic"]);
});

test("treats missing Canvas collections and malformed edges as an empty topic graph", () => {
  assert.deepEqual(buildForest({}), []);
  const topic = { id: "topic", x: 0, y: 0, width: 100, height: 40 };
  const canvas = {
    nodes: new Map([[topic.id, topic]]),
    edges: new Map([
      ["null", null],
      ["missing-endpoint", { from: {}, to: { node: topic } }],
      ["unknown-topic", { from: { node: {} }, to: { node: topic } }]
    ]),
    getData: () => ({ nodes: "malformed", edges: {} })
  };

  assert.deepEqual(buildForest(canvas).map((node) => node.canvasNode.id), ["topic"]);
});
