"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { LayoutEngine } = require("../lib/layout.js");

function tree(id, children = [], height = 60) {
  const result = {
    canvasNode: { id, x: 0, y: 0, width: 300, height },
    children
  };
  for (const child of children) child.parent = result;
  return result;
}

test("compacts vertical contours without collapsing the visual gutter", () => {
  const engine = new LayoutEngine({ verticalGap: 20 });
  assert.equal(engine.compactVerticalGap(), 14);
  assert.equal(
    new LayoutEngine({ verticalGap: 4 }).compactVerticalGap(),
    8
  );
});

test("uses side space to round out tall shallow maps", () => {
  const engine = new LayoutEngine({
    horizontalGap: 80,
    verticalGap: 20,
    nodeWidth: 300
  });
  const tallBranches = Array.from(
    { length: 8 },
    (_, index) => tree(`branch-${index}`, [], 90)
  );
  const adaptive = engine.getAdaptiveHorizontalGap(tallBranches);
  assert.ok(adaptive > 80);
  assert.ok(adaptive <= 100);
});

test("keeps similarly sized branches close to their parent", () => {
  const engine = new LayoutEngine({
    nodeWidth: 200,
    horizontalGap: 80,
    verticalGap: 20
  });
  const branch = (left, right) => ({
    positions: new Map(),
    contour: new Map(),
    rectangles: [{ left, right, top: 0, bottom: 200 }]
  });
  const packed = engine.packRootSubtrees(
    [branch(300, 500), branch(300, 500), branch(300, 500)],
    "right"
  );
  assert.equal(packed.xOffsets.length, 3);
  assert.equal(new Set(packed.xOffsets).size, 1);
  assert.equal(Math.max(...packed.yOffsets), 428);
});

test("keeps packed subtree cards collision-free", () => {
  const engine = new LayoutEngine({
    nodeWidth: 160,
    horizontalGap: 60,
    verticalGap: 20
  });
  const branch = (left, top) => ({
    positions: new Map(),
    contour: new Map(),
    rectangles: [{ left, right: left + 160, top, bottom: top + 60 }]
  });
  const packed = engine.packRootSubtrees(
    [branch(220, 0), branch(220, 0), branch(220, 0)],
    "right",
    { left: 0, right: 160, top: 0, bottom: 60 }
  );
  for (let index = 0; index < packed.combinedRectangles.length; index++) {
    const current = packed.combinedRectangles[index];
    for (let other = index + 1; other < packed.combinedRectangles.length; other++) {
      const candidate = packed.combinedRectangles[other];
      assert.ok(
        current.right <= candidate.left ||
        candidate.right <= current.left ||
        current.bottom <= candidate.top ||
        candidate.bottom <= current.top
      );
    }
  }
});

test("lets non-overlapping outward bands reuse the same vertical level", () => {
  const engine = new LayoutEngine({
    nodeWidth: 160,
    horizontalGap: 60,
    verticalGap: 20
  });
  const branch = (height) => ({
    positions: new Map(),
    contour: new Map(),
    rectangles: [{ left: 220, right: 380, top: 0, bottom: height }]
  });
  const packed = engine.packRootSubtrees(
    [branch(260), branch(260), branch(260), branch(260)],
    "right"
  );
  const byColumn = new Map();
  for (let index = 0; index < packed.xOffsets.length; index++) {
    const x = packed.xOffsets[index];
    if (!byColumn.has(x)) byColumn.set(x, []);
    byColumn.get(x).push(packed.yOffsets[index]);
  }
  assert.ok(byColumn.size > 1);
  const firstOffsets = Array.from(byColumn.values()).map((values) => values[0]);
  assert.ok(new Set(firstOffsets).size < firstOffsets.length);
});

test("spreads a large sibling set across variable visual depths", () => {
  const engine = new LayoutEngine({
    nodeWidth: 160,
    horizontalGap: 60,
    verticalGap: 20
  });
  const branches = Array.from({ length: 12 }, () => ({
    positions: new Map(),
    contour: new Map(),
    rectangles: [{ left: 220, right: 380, top: 0, bottom: 60 }]
  }));
  const packed = engine.packRootSubtrees(branches, "right");
  assert.ok(new Set(packed.xOffsets).size >= 3);
  assert.ok(Math.max(...packed.yOffsets) < 11 * 74);
});

test("recursively settles a bulky middle subtree outward to reduce height", () => {
  const engine = new LayoutEngine({
    nodeWidth: 160,
    nodeHeight: 60,
    horizontalGap: 60,
    verticalGap: 20,
    animate: false
  });
  const leaf = (id) => tree(id, [], 60);
  const bulky = tree(
    "bulky",
    Array.from({ length: 9 }, (_, index) => leaf(`leaf-${index}`))
  );
  const root = tree("root", [leaf("before"), bulky, leaf("after")]);
  const positions = new Map();
  engine.layoutSubtree(root, 0, 0, 0, "right", positions);
  const before = positions.get("before");
  const bulkyPosition = positions.get("bulky");
  assert.ok(bulkyPosition.x >= before.x);
  const ys = Array.from(positions.values()).map((position) => position.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 9 * 80);
});

test("folds dense child groups into a paper-shaped footprint without card overlap", () => {
  const engine = new LayoutEngine({
    nodeWidth: 180,
    nodeHeight: 60,
    horizontalGap: 80,
    verticalGap: 20,
    animate: false
  });
  const groups = Array.from({ length: 4 }, (_, groupIndex) =>
    tree(
      `group-${groupIndex}`,
      Array.from({ length: 7 }, (_, leafIndex) =>
        tree(`leaf-${groupIndex}-${leafIndex}`)
      )
    )
  );
  const root = tree("root", groups);
  const positions = new Map();
  const layout = engine.layoutSubtree(
    root,
    0,
    0,
    0,
    "right",
    positions,
    {},
    true
  );
  const rectangles = layout.rectangles;
  const width =
    Math.max(...rectangles.map((item) => item.right)) -
    Math.min(...rectangles.map((item) => item.left));
  const height =
    Math.max(...rectangles.map((item) => item.bottom)) -
    Math.min(...rectangles.map((item) => item.top));
  assert.ok(height < 4 * 7 * 80 * 0.82);
  assert.ok(width / height > 0.65);
  for (let index = 0; index < rectangles.length; index++) {
    for (let other = index + 1; other < rectangles.length; other++) {
      const left = rectangles[index];
      const right = rectangles[other];
      assert.ok(
        left.right <= right.left ||
        right.right <= left.left ||
        left.bottom <= right.top ||
        right.bottom <= left.top
      );
    }
  }
});

test("pulls complete subtrees inward like collision-limited springs", () => {
  const engine = new LayoutEngine({
    horizontalGap: 80,
    verticalGap: 20,
    animate: false
  });
  const leaf = tree("leaf");
  const first = tree("first", [leaf]);
  const second = tree("second");
  const root = tree("root", [first, second]);
  first.direction = "right";
  second.direction = "right";
  leaf.direction = "right";
  const nodes = [root, first, second, leaf].map((item) => item.canvasNode);
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    getData: () => ({
      nodes: nodes.map((node) => ({ id: node.id, type: "text" }))
    })
  };
  const positions = new Map([
    ["root", { x: 0, y: 0 }],
    ["first", { x: 600, y: 0 }],
    ["second", { x: 600, y: 200 }],
    ["leaf", { x: 1000, y: 0 }]
  ]);

  engine.compactHorizontalSprings(canvas, [root], positions);

  assert.equal(positions.get("first").x, 344);
  assert.equal(positions.get("second").x, 344);
  assert.equal(positions.get("leaf").x, 688);
  assert.equal(positions.get("first").y, 0);
  assert.equal(positions.get("leaf").y, 0);
});

test("balances root sides by rendered branch height, not a contiguous split", () => {
  const engine = new LayoutEngine({ verticalGap: 20 });
  const branches = [
    tree("tall-a", [], 400),
    tree("tall-b", [], 380),
    tree("short-a", [], 60),
    tree("short-b", [], 60)
  ];
  const root = tree("root", branches);
  const { rightChildren, leftChildren } = engine.balanceRootChildren(root);
  assert.equal(rightChildren.length, 2);
  assert.equal(leftChildren.length, 2);
  assert.notEqual(rightChildren[0].canvasNode.id, rightChildren[1].canvasNode.id);
  const rightHeight = rightChildren.reduce(
    (sum, child) => sum + child.canvasNode.height,
    0
  );
  const leftHeight = leftChildren.reduce(
    (sum, child) => sum + child.canvasNode.height,
    0
  );
  assert.ok(Math.abs(rightHeight - leftHeight) <= 20);
});
