"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildForest, findTreeTraversalTarget } = require("../lib/tree-model.js");

function node(id, x, y) {
  return { id, x, y, width: 100, height: 40 };
}

function canvas(nodes, edges) {
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  return {
    nodes: nodeMap,
    edges: new Map(edges.map(([from, to], index) => [
      String(index),
      { from: { node: nodeMap.get(from) }, to: { node: nodeMap.get(to) } }
    ])),
    getData: () => ({ nodes: nodes.map((item) => ({ id: item.id, type: "text" })) })
  };
}

function target(forest, id, direction) {
  return findTreeTraversalTarget(forest, id, direction)?.id || null;
}

test("mirrors parent and child traversal across root sides", () => {
  const forest = buildForest(canvas(
    [
      node("root", 0, 100),
      node("left", -200, 100),
      node("left-child", -400, 100),
      node("right", 200, 100),
      node("right-child", 400, 100)
    ],
    [
      ["root", "left"],
      ["left", "left-child"],
      ["root", "right"],
      ["right", "right-child"]
    ]
  ));

  assert.equal(target(forest, "right", "right"), "right-child");
  assert.equal(target(forest, "right", "left"), "root");
  assert.equal(target(forest, "left", "left"), "left-child");
  assert.equal(target(forest, "left", "right"), "root");
  assert.equal(target(forest, "root", "left"), "left");
  assert.equal(target(forest, "root", "right"), "right");
});

test("up and down traverse visual siblings on the same root side", () => {
  const forest = buildForest(canvas(
    [
      node("root", 0, 100),
      node("left-top", -200, 0),
      node("left-bottom", -200, 200),
      node("right-middle", 200, 100)
    ],
    [
      ["root", "left-bottom"],
      ["root", "right-middle"],
      ["root", "left-top"]
    ]
  ));

  assert.equal(target(forest, "left-top", "down"), "left-bottom");
  assert.equal(target(forest, "left-bottom", "up"), "left-top");
  assert.equal(target(forest, "left-top", "up"), null);
  assert.equal(target(forest, "right-middle", "down"), null);
});

test("returns null at tree edges so flat navigation can handle wrapping", () => {
  const forest = buildForest(canvas(
    [node("root", 0, 0), node("leaf", 200, 0)],
    [["root", "leaf"]]
  ));

  assert.equal(target(forest, "leaf", "right"), null);
  assert.equal(target(forest, "root", "up"), null);
});
