"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { LayoutEngine } = require("../lib/layout.js");

function node(id, x, y, width = 80, height = 40) {
  return {
    id,
    x,
    y,
    width,
    height,
    type: "text",
    moveTo(position) {
      this.x = position.x;
      this.y = position.y;
    }
  };
}

function edge(from, to) {
  return { from: { node: from }, to: { node: to } };
}

function canvasOf(nodes, edges) {
  return {
    nodes: new Map(nodes.map((item) => [item.id, item])),
    edges: new Map(edges.map((item, index) => [`edge-${index}`, item])),
    getData: () => ({
      nodes: nodes.map((item) => ({ id: item.id, type: "text" })),
      edges: edges.map((item) => ({
        fromNode: item.from.node.id,
        toNode: item.to.node.id
      }))
    }),
    requestFrame() {},
    requestSave() {}
  };
}

function overlaps(left, right, gap = 0) {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

test("pushes a floating card clear of a laid out map", () => {
  const root = node("root", 0, 0);
  const child = node("child", 200, 0);
  const floating = node("floating", 210, 10);
  const canvas = canvasOf(
    [root, child, floating],
    [edge(root, child)]
  );
  const engine = new LayoutEngine({ animate: false });

  const moved = engine.displaceFloatingNodes(canvas);

  assert.deepEqual(moved, ["floating"]);
  assert.equal(overlaps(floating, child, 0), false);
  assert.equal(overlaps(floating, root, 0), false);
});

test("leaves a floating card alone when it is already out of the way", () => {
  const root = node("root", 0, 0);
  const child = node("child", 200, 0);
  const floating = node("floating", 4000, 4000);
  const canvas = canvasOf([root, child, floating], [edge(root, child)]);
  const engine = new LayoutEngine({ animate: false });

  const before = { x: floating.x, y: floating.y };
  const moved = engine.displaceFloatingNodes(canvas);

  assert.deepEqual(moved, []);
  assert.deepEqual({ x: floating.x, y: floating.y }, before);
});

test("separates two overlapping floating cards from each other", () => {
  const root = node("root", 0, 0);
  const child = node("child", 200, 0);
  const first = node("first", 3000, 0);
  const second = node("second", 3020, 5);
  const canvas = canvasOf(
    [root, child, first, second],
    [edge(root, child)]
  );
  const engine = new LayoutEngine({ animate: false });

  engine.displaceFloatingNodes(canvas);

  assert.equal(overlaps(first, second, 0), false);
});

test("reflow keeps floating cards out of the newly packed map", () => {
  const root = node("root", 0, 0);
  const first = node("first", 0, 0);
  const second = node("second", 0, 0);
  const floating = node("floating", 120, 0);
  const canvas = canvasOf(
    [root, first, second, floating],
    [edge(root, first), edge(root, second)]
  );
  const engine = new LayoutEngine({
    horizontalGap: 80,
    verticalGap: 20,
    animate: false
  });

  engine.layout(canvas);

  for (const mapNode of [root, first, second])
    assert.equal(
      overlaps(floating, mapNode, 0),
      false,
      `floating card overlaps ${mapNode.id}`
    );
});

test("never treats a connected root as a floating card", () => {
  const root = node("root", 0, 0);
  const child = node("child", 200, 0);
  const canvas = canvasOf([root, child], [edge(root, child)]);
  const engine = new LayoutEngine({ animate: false });

  const { floating } = engine.collectFloatingNodes(canvas);

  assert.deepEqual(floating, []);
});
