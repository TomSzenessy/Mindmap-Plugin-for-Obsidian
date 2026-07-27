"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildForest,
  countReachable,
  findTreeForNode,
  getDescendants
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

test("handles very deep maps without recursive tree-model overflow", () => {
  const size = 12000;
  const ids = Array.from({ length: size }, (_, index) => `n${index}`);
  const edges = ids.slice(1).map((id, index) => [ids[index], id]);
  const forest = buildForest(makeCanvas(ids, edges));

  assert.equal(forest.length, 1);
  assert.equal(countReachable(forest[0]), size);
  assert.equal(findTreeForNode(forest, ids[size - 1]).depth, size - 1);
});
