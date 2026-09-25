"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

// `obsidian` is provided by the Obsidian runtime, not npm.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return { ItemView: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { CanvasAPI, genId } = require("../lib/canvas-api.js");
const { NodeOperations } = require("../lib/node-operations.js");
Module._load = originalLoad;

function topic(id, x = 0) {
  return {
    id,
    type: "text",
    text: id,
    x,
    y: 0,
    width: 100,
    height: 40,
    moveTo(position) {
      this.x = position.x;
      this.y = position.y;
    }
  };
}

function canvasWithTopics(topics, edgePairs) {
  const nodes = new Map(topics.map((item) => [item.id, item]));
  const edges = new Map(edgePairs.map(([fromId, toId], index) => {
    const edge = {
      id: `edge-${index}`,
      from: { node: nodes.get(fromId) },
      to: { node: nodes.get(toId) }
    };
    return [edge.id, edge];
  }));
  return {
    nodes,
    edges,
    saves: 0,
    getData: () => ({
      nodes: topics.map((item) => ({ id: item.id, type: "text" })),
      edges: edgePairs.map(([fromId, toId], index) => ({
        id: `edge-${index}`,
        fromNode: fromId,
        toNode: toId
      }))
    }),
    createTextNode({ pos, size, text }) {
      const node = topic(genId(), pos.x);
      node.y = pos.y;
      node.width = size.width;
      node.height = size.height;
      node.text = text;
      this.nodes.set(node.id, node);
      return node;
    },
    importData(data) {
      for (const record of data.nodes || []) {
        if (!this.nodes.has(record.id)) {
          const node = topic(record.id, record.x || 0);
          this.nodes.set(record.id, node);
        }
      }
      for (const record of data.edges || []) {
        const edge = {
          ...record,
          from: {
            node: this.nodes.get(record.fromNode),
            side: record.fromSide,
            end: record.fromEnd
          },
          to: {
            node: this.nodes.get(record.toNode),
            side: record.toSide,
            end: record.toEnd
          }
        };
        this.edges.set(record.id, edge);
      }
    },
    removeEdge(edge) {
      this.edges.delete(edge.id);
    },
    removeNode(node) {
      this.nodes.delete(node.id);
    },
    requestSave() {
      this.saves++;
    }
  };
}

function operationsForCanvas(isAutoAdjust = false) {
  return new NodeOperations(new CanvasAPI({}), {
    horizontalGap: 60,
    verticalGap: 20,
    nodeWidth: 100,
    nodeHeight: 40,
    isAutoAdjust: () => isAutoAdjust
  });
}

test("deletes only the canonical branch when a surplus edge points to an ancestor", () => {
  const a = topic("a");
  const b = topic("b", 200);
  const c = topic("c", 400);
  const canvas = canvasWithTopics(
    [a, b, c],
    [["a", "b"], ["b", "c"], ["c", "a"], ["a", "c"]]
  );
  const operations = operationsForCanvas();

  const parent = operations.deleteSubtree(canvas, b);

  assert.equal(parent?.id, "a");
  assert.deepEqual([...canvas.nodes.keys()], ["a"]);
  assert.equal(canvas.saves, 1);
});

test("flips only canonical descendants when surplus edges form a cycle", () => {
  const a = topic("a");
  const x = topic("x", 200);
  const b = topic("b", 400);
  const c = topic("c", 600);
  const d = topic("d", -200);
  const canvas = canvasWithTopics(
    [a, x, b, c, d],
    [
      ["a", "x"],
      ["x", "b"],
      ["a", "d"],
      ["b", "c"],
      ["c", "d"],
      ["d", "b"]
    ]
  );
  const operations = operationsForCanvas();

  const parent = operations.flipBranch(canvas, b);

  assert.equal(parent?.id, "x");
  assert.deepEqual([a.x, x.x, b.x, c.x, d.x], [0, 200, 0, -200, -200]);
});

test("focuses the canonical parent when an orphan also has a surplus parent", () => {
  const b = topic("b");
  const c = topic("c", 200);
  const d = topic("d", 400);
  const e = topic("e", -400);
  const canvas = canvasWithTopics(
    [b, c, d, e],
    [["b", "c"], ["c", "d"], ["e", "d"]]
  );
  const operations = operationsForCanvas();
  const api = operations.canvasApi;

  const focus = operations.deleteAndFocusParent(canvas, c);

  assert.equal(focus?.id, "b");
  assert.equal(api.getParentNode(canvas, d)?.id, "b");
  assert.equal(canvas.saves, 1);
});

test("reports placement exhaustion instead of returning an occupied slot", () => {
  const occupied = Array.from({ length: 201 }, (_, index) => topic(`occupied-${index}`, 0));
  for (const node of occupied) node.y = indexY(node);
  function indexY(node) {
    return Number(node.id.slice("occupied-".length)) * 60;
  }
  const canvas = canvasWithTopics(occupied, []);
  const operations = operationsForCanvas();

  const position = operations.findAvailablePosition(canvas, 0, 0, 100, 40, "down");

  assert.equal(position, null);
});

test("removes a new child when Canvas cannot create its parent edge", () => {
  const root = topic("root");
  const canvas = canvasWithTopics([root], []);
  const operations = operationsForCanvas();
  operations.canvasApi.createEdge = () => null;

  const created = operations.addChild(canvas, root);

  assert.equal(created, null);
  assert.deepEqual([...canvas.nodes.keys()], ["root"]);
  assert.equal(canvas.edges.size, 0);
});

test("removes a new sibling when Canvas cannot create its parent edge", () => {
  const parent = topic("parent");
  const sibling = topic("sibling", 200);
  const canvas = canvasWithTopics([parent, sibling], [["parent", "sibling"]]);
  const operations = operationsForCanvas();
  operations.canvasApi.createEdge = () => null;

  const created = operations.addSibling(canvas, sibling);

  assert.equal(created, null);
  assert.deepEqual([...canvas.nodes.keys()], ["parent", "sibling"]);
  assert.equal(canvas.edges.size, 1);
});

test("balances automatic root children across both sides", () => {
  const root = topic("root");
  const canvas = canvasWithTopics([root], []);
  const operations = operationsForCanvas(true);

  operations.addChild(canvas, root);
  operations.addChild(canvas, root);
  operations.addChild(canvas, root);

  const sides = [...canvas.edges.values()]
    .filter((edge) => edge.from.node.id === "root")
    .map((edge) => edge.from.side)
    .sort();
  assert.deepEqual(sides, ["left", "right", "right"]);
});

test("add-parent rolls back when the second replacement edge fails", () => {
  const parent = topic("parent");
  const child = topic("child", 200);
  const canvas = canvasWithTopics([parent, child], [["parent", "child"]]);
  const operations = operationsForCanvas();
  const api = operations.canvasApi;
  api.replaceEdge = undefined;
  const originalCreate = api.createEdge.bind(api);
  let calls = 0;
  api.createEdge = (...args) => {
    calls += 1;
    return calls === 2 ? null : originalCreate(...args);
  };

  const inserted = operations.addParent(canvas, child);

  assert.equal(inserted, null);
  assert.deepEqual([...canvas.nodes.keys()], ["parent", "child"]);
  assert.equal(canvas.edges.size, 1);
  assert.equal([...canvas.edges.values()][0].from.node.id, "parent");
});

test("delete-topic keeps the canonical branch when replacement creation fails", () => {
  const parent = topic("parent");
  const child = topic("child", 200);
  const orphan = topic("orphan", 400);
  const canvas = canvasWithTopics(
    [parent, child, orphan],
    [["parent", "child"], ["child", "orphan"]]
  );
  const operations = operationsForCanvas();
  operations.canvasApi.createEdge = () => null;

  operations.deleteAndFocusParent(canvas, child);

  assert.deepEqual([...canvas.nodes.keys()], ["parent", "child", "orphan"]);
  assert.equal(canvas.edges.size, 2);
  assert.equal([...canvas.edges.values()][0].to.node.id, "child");
  assert.equal([...canvas.edges.values()][1].to.node.id, "orphan");
});

test("add-parent carries authored edge metadata into the split branch", () => {
  const parent = topic("parent");
  const child = topic("child", 200);
  const canvas = canvasWithTopics([parent, child], [["parent", "child"]]);
  const original = canvas.edges.get("edge-0");
  original.label = "depends on";
  original.color = "#abcdef";
  original.lineType = "straight";
  original.curvature = 0.9;
  const operations = operationsForCanvas();

  const inserted = operations.addParent(canvas, child);

  assert.ok(inserted);
  const edges = [...canvas.edges.values()];
  assert.equal(edges.length, 2);
  assert.ok(edges.some((edge) => edge.id === "edge-0"));
  assert.ok(edges.some((edge) => edge.label === "depends on" && edge.color === "#abcdef"));
  assert.ok(edges.some((edge) => edge.lineType === "straight" && edge.curvature === 0.9));
});

test("inserts a topic by replacing the canonical parent edge while preserving its ID", () => {
  const parent = topic("parent");
  const child = topic("child", 200);
  const canvas = canvasWithTopics(
    [parent, child],
    [["parent", "child"], ["parent", "child"]]
  );
  const preview = canvas.edges.get("edge-0");
  preview.__mindMapPreview = true;
  preview.from.side = "top";
  preview.to.side = "bottom";
  const canonical = canvas.edges.get("edge-1");
  canonical.from.side = "right";
  canonical.to.side = "left";
  const operations = operationsForCanvas();

  const inserted = operations.addParent(canvas, child);

  assert.ok(inserted);
  assert.equal(operations.canvasApi.getParentNode(canvas, inserted)?.id, "parent");
  assert.equal(operations.canvasApi.getParentNode(canvas, child)?.id, inserted.id);
  assert.equal(canvas.edges.has("edge-1"), true);
  assert.equal(canvas.edges.get("edge-1")?.to.node.id, "child");
  assert.equal(canvas.edges.get("edge-0")?.__mindMapPreview, true);
});
