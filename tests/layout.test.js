"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { BranchColors, LayoutEngine } = require("../lib/layout.js");

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

test("settles a bulky middle subtree outward to reduce height", () => {
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

test("keeps sibling topics in the same column even when a branch has 4 or more children", () => {
  const engine = new LayoutEngine({
    nodeWidth: 200,
    nodeHeight: 60,
    horizontalGap: 80,
    verticalGap: 20,
    animate: false
  });
  const leaf = (id) => tree(id, [], 60);
  const branchWithChildren = tree("child-1", [leaf("grandchild-1"), leaf("grandchild-2")]);
  const root = tree("root", [
    branchWithChildren,
    leaf("child-2"),
    leaf("child-3"),
    leaf("child-4"),
    leaf("child-5")
  ]);
  const positions = new Map();
  engine.layoutSubtree(root, 0, 0, 0, "right", positions);
  const child1X = positions.get("child-1").x;
  assert.equal(positions.get("child-2").x, child1X);
  assert.equal(positions.get("child-3").x, child1X);
  assert.equal(positions.get("child-4").x, child1X);
  assert.equal(positions.get("child-5").x, child1X);
  assert.ok(positions.get("grandchild-1").x > child1X);
  assert.ok(positions.get("grandchild-2").x > child1X);
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

test("preserves root branch sides when an edit-triggered relayout requests it", () => {
	const engine = new LayoutEngine({ verticalGap: 20, animate: false });
	const makeNode = (id, x, height) => ({
		id,
		x,
		y: 0,
		width: 200,
		height,
		moveTo({ x: nextX, y }) {
			this.x = nextX;
			this.y = y;
		},
		nodeEl: { addClass() {}, removeClass() {} }
	});
	const root = makeNode("root", 500, 60);
	const left = makeNode("left", 0, 400);
	const right = makeNode("right", 800, 60);
	const edges = new Map([
		["left", { id: "left", from: { node: root, side: "left" }, to: { node: left, side: "right" } }],
		["right", { id: "right", from: { node: root, side: "right" }, to: { node: right, side: "left" } }]
	]);
	const canvas = {
		nodes: new Map([[root.id, root], [left.id, left], [right.id, right]]),
		edges,
		getData: () => ({ nodes: [root, left, right].map((node) => ({ id: node.id, type: "text" })) }),
		requestSave() {},
		requestFrame() {}
	};
	engine.layoutChildren(canvas, "root", null, { preserveRootSides: true });
	assert.ok(left.x + left.width / 2 < root.x + root.width / 2);
	assert.ok(right.x + right.width / 2 >= root.x + root.width / 2);
});

test("rebalances the surrounding root branches while keeping a dragged branch on its dropped side", () => {
  const engine = new LayoutEngine({ verticalGap: 20 });
  const branches = [
    tree("right-a", [], 220),
    tree("right-b", [], 180),
    tree("right-c", [], 60),
    tree("moved-left", [], 60)
  ];
  const root = tree("root", branches);
  root.canvasNode.x = 500;
  root.canvasNode.width = 200;
  branches[0].canvasNode.x = 800;
  branches[1].canvasNode.x = 800;
  branches[2].canvasNode.x = 800;
  branches[3].canvasNode.x = 200;

  const { rightChildren, leftChildren } = engine.balanceRootChildren(
    root,
    false,
    { nodeId: "moved-left", direction: "left" }
  );

  assert.ok(leftChildren.includes(branches[3]));
  assert.ok(leftChildren.some((branch) => branch !== branches[3]));
  assert.ok(rightChildren.length > 0);
  const rightHeight = rightChildren.reduce(
    (sum, child) => sum + engine.measureSubtreeHeight(child),
    0
  );
  const leftHeight = leftChildren.reduce(
    (sum, child) => sum + engine.measureSubtreeHeight(child),
    0
  );
  assert.ok(Math.abs(rightHeight - leftHeight) <= 100);
});

test("keeps collapsed subtree colors synchronized through the structural forest", () => {
  const makeNode = (id, unknownData = {}) => ({
    id,
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    unknownData,
    color: "stale",
    setColor(color) {
      this.color = color;
    }
  });
  const root = makeNode("root", { collapsed: true });
  const child = makeNode("child");
  const branchEdge = {
    from: { node: root },
    to: { node: child },
    color: "stale",
    setColor(color) {
      this.color = color;
    }
  };
  const canvas = {
    nodes: new Map([
      [root.id, root],
      [child.id, child]
    ]),
    edges: new Map([["branch", branchEdge]]),
    getData: () => ({
      nodes: [root, child].map((node) => ({ id: node.id, type: "text" }))
    }),
    requestSave() {},
    requestFrame() {}
  };
  const canvasApi = {
    getConnectedEdges(activeCanvas, node) {
      return Array.from(activeCanvas.edges.values()).filter(
        (edge) => edge.from.node === node || edge.to.node === node
      );
    }
  };

  new BranchColors(canvasApi).applyColors(canvas);

  assert.equal(child.color, "1");
  assert.equal(branchEdge.color, "1");
});

test("lays out a 12,000-topic chain without overflowing the stack", () => {
  const depth = 12000;
  const nodes = Array.from({ length: depth + 1 }, (_, id) => ({
    id: String(id),
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    moveTo({ x, y }) {
      this.x = x;
      this.y = y;
    }
  }));
  const edges = nodes.slice(0, -1).map((node, id) => ({
    id,
    from: { node, side: "right" },
    to: { node: nodes[id + 1], side: "left" }
  }));
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    edges: new Map(edges.map((edge) => [edge.id, edge])),
    getData: () => ({
      nodes: nodes.map((node) => ({ id: node.id, type: "text" }))
    }),
    requestSave() {},
    requestFrame() {}
  };

  assert.doesNotThrow(() => {
    new LayoutEngine({ animate: false }).layout(canvas, { persist: false });
  });
  assert.ok(nodes[depth].x > 0);
});

test("builds and indexes the group forest once for multiple topic roots", () => {
  const makeNode = (id, type = "text") => ({
    id,
    x: type === "group" ? 0 : id === "first" ? 50 : 250,
    y: type === "group" ? 0 : 50,
    width: type === "group" ? 400 : 100,
    height: type === "group" ? 200 : 60,
    moveTo({ x, y }) {
      this.x = x;
      this.y = y;
    },
    moveAndResize({ x, y, width, height }) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    },
    nodeEl: { addClass() {}, removeClass() {} }
  });
  const group = makeNode("group", "group");
  const first = makeNode("first");
  const second = makeNode("second");
  const nodes = [group, first, second];
  let reads = 0;
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    edges: new Map(),
    getData() {
      reads++;
      return {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.id === "group" ? "group" : "text"
        }))
      };
    },
    requestSave() {},
    requestFrame() {}
  };

  new LayoutEngine({ animate: false }).layoutForest(canvas, group.id);

  assert.equal(reads, 1);
});

test("forwards persistent and animated layout options through one transaction", () => {
  const makeNode = (id, x) => ({
    id,
    x,
    y: 0,
    width: 200,
    height: 60,
    moveTo({ x: nextX, y }) {
      this.x = nextX;
      this.y = y;
    },
    nodeEl: {
      addedAnimating: 0,
      removedAnimating: 0,
      addClass(className) {
        if (className === "mindmap-animating") this.addedAnimating++;
      },
      removeClass(className) {
        if (className === "mindmap-animating") this.removedAnimating++;
      }
    }
  });
  const root = makeNode("root", 500);
  const child = makeNode("child", 800);
  const floating = makeNode("floating", 1200);
  const nodes = [root, child, floating];
  let saves = 0;
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    edges: new Map([
      ["branch", { from: { node: root, side: "right" }, to: { node: child, side: "left" } }]
    ]),
    getData: () => ({
      nodes: nodes.map((node) => ({ id: node.id, type: "text" }))
    }),
    requestSave() { saves++; },
    requestFrame() {}
  };

  new LayoutEngine().layout(canvas, { persist: false, animate: false });

  assert.equal(saves, 0);
  for (const node of nodes) {
    assert.equal(node.nodeEl.addedAnimating, 0);
    assert.ok(node.nodeEl.removedAnimating > 0);
  }
});

test("cascades each root branch outward after one branch crosses the root", () => {
  const makeNode = (id, x, y = 0) => ({
    id,
    x,
    y,
    width: 180,
    height: 60,
    moveTo(position) {
      this.x = position.x;
      this.y = position.y;
    }
  });
  const root = makeNode("root", 0);
  const moved = makeNode("moved", -260);
  const movedLeaf = makeNode("moved-leaf", 0);
  const other = makeNode("other", 260);
  const otherLeaf = makeNode("other-leaf", 0);
  const nodes = [root, moved, movedLeaf, other, otherLeaf];
  const connect = (id, parent, child) => ({
    id,
    from: { node: parent, side: "right" },
    to: { node: child, side: "left" }
  });
  const edges = [
    connect("root-moved", root, moved),
    connect("moved-leaf", moved, movedLeaf),
    connect("root-other", root, other),
    connect("other-leaf", other, otherLeaf)
  ];
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    edges: new Map(edges.map((edge) => [edge.id, edge])),
    getData: () => ({
      nodes: nodes.map((node) => ({ id: node.id, type: "text" })),
      edges: edges.map((edge) => ({
        id: edge.id,
        fromNode: edge.from.node.id,
        toNode: edge.to.node.id
      }))
    }),
    requestFrame() {},
    requestSave() {}
  };
  const engine = new LayoutEngine({ horizontalGap: 80, verticalGap: 20, animate: false });

  engine.layout(canvas, {
    branchDirectionOverride: { nodeId: moved.id, direction: "left" }
  });

  assert.ok(moved.x < root.x);
  assert.ok(movedLeaf.x < moved.x);
  assert.ok(other.x > root.x);
  assert.ok(otherLeaf.x > other.x);
});

test("preserves existing root sides while moving an overridden branch", () => {
  const engine = new LayoutEngine({ verticalGap: 20 });
  const root = tree("root", []);
  root.canvasNode.x = 100;
  root.canvasNode.width = 100;

  const leftA = tree("left-a", []);
  leftA.canvasNode.x = -200;
  const leftB = tree("left-b", []);
  leftB.canvasNode.x = -200;

  const rightA = tree("right-a", []);
  rightA.canvasNode.x = 400;
  const rightB = tree("right-b", []);
  rightB.canvasNode.x = 400;

  root.children = [leftA, leftB, rightA, rightB];

  const { rightChildren, leftChildren } = engine.balanceRootChildren(
    root,
    true,
    { nodeId: "right-b", direction: "left" }
  );

  assert.equal(leftChildren.map((c) => c.canvasNode.id).sort().join(","), "left-a,left-b,right-b");
  assert.equal(rightChildren.map((c) => c.canvasNode.id).join(","), "right-a");
});

test("invokes edge.render when updating edge sides and applying positions", () => {
  let renderedCount = 0;
  const root = { id: "root", x: 0, y: 0, width: 100, height: 40, moveTo() {} };
  const child = { id: "child", x: 200, y: 0, width: 100, height: 40, moveTo() {} };
  const edge = {
    id: "edge-1",
    from: { node: root, side: "left" },
    to: { node: child, side: "right" },
    render() { renderedCount++; }
  };
  const canvas = {
    nodes: new Map([[root.id, root], [child.id, child]]),
    edges: new Map([[edge.id, edge]]),
    getData: () => ({ nodes: [root, child], edges: [edge] }),
    requestFrame() {},
    requestSave() {}
  };
  const engine = new LayoutEngine({ animate: false });
  engine.updateEdgeSides(canvas);
  assert.ok(renderedCount > 0, "edge.render should be called on updateEdgeSides");
  const beforeCount = renderedCount;
  engine.applyPositions(canvas, new Map([[child.id, { x: 300, y: 0 }]]), { animate: false });
  assert.ok(renderedCount > beforeCount, "edge.render should be called on applyPositions");
});

