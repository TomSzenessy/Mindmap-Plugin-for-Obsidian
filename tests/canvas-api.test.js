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
const { CanvasAPI } = require("../lib/canvas-api.js");
const { reparentSubtree } = require("../lib/tree-drag.js");
Module._load = originalLoad;

function topic(id, x = 0) {
  return { id, x, y: 0, width: 100, height: 40 };
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
    importData(data) {
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
    getData() {
      return {
        nodes: [...this.nodes.values()].map((item) => ({
          id: item.id,
          type: item.type || "text"
        })),
        edges: [...this.edges.values()].map((edge) => ({
          id: edge.id,
          fromNode: edge.from?.node?.id,
          fromSide: edge.from?.side,
          fromEnd: edge.from?.end,
          toNode: edge.to?.node?.id,
          toSide: edge.to?.side,
          toEnd: edge.to?.end,
          color: edge.color,
          label: edge.label,
          lineType: edge.lineType,
          curve: edge.curve,
          curvature: edge.curvature
        }))
      };
    }
  };
}

test("text-node creation returns null when the Canvas host rejects creation", () => {
  const api = new CanvasAPI({});
  const canvas = { createTextNode: () => null, nodes: new Map() };
  assert.equal(api.createTextNode(canvas, 0, 0, "Topic"), null);
});

test("selection queries tolerate ID-only Canvas selection entries", () => {
  const api = new CanvasAPI({});
  const canvas = { selection: new Set(["topic"]) };
  assert.equal(api.getSelectedNode(canvas), null);
});

test("queries canonical topic parents and children when surplus edges close a cycle", () => {
  const a = topic("a");
  const b = topic("b", 200);
  const c = topic("c", 400);
  const canvas = canvasWithTopics(
    [a, b, c],
    [["a", "b"], ["b", "c"], ["c", "a"], ["a", "c"]]
  );
  const api = new CanvasAPI({});

  assert.equal(api.getParentNode(canvas, c)?.id, "b");
  assert.deepEqual(api.getChildNodes(canvas, a).map((node) => node.id), ["b"]);
  assert.deepEqual(api.getChildNodes(canvas, b).map((node) => node.id), ["c"]);
  assert.deepEqual(api.getChildNodes(canvas, c), []);
});

test("treats duplicate topic edges as one canonical child relationship", () => {
  const a = topic("a");
  const b = topic("b", 200);
  const canvas = canvasWithTopics(
    [a, b],
    [["a", "b"], ["a", "b"]]
  );
  const api = new CanvasAPI({});

  assert.deepEqual(api.getChildNodes(canvas, a).map((node) => node.id), ["b"]);
  assert.equal(api.getParentEdge(canvas, b)?.id, "edge-0");
});

test("iteratively traverses twelve thousand canonical descendant topics", () => {
  const size = 12000;
  const topics = Array.from({ length: size }, (_, index) =>
    topic(`topic-${index}`, index * 120)
  );
  const edges = topics.slice(1).map((item, index) => [
    topics[index].id,
    item.id
  ]);
  const canvas = canvasWithTopics(topics, edges);
  const api = new CanvasAPI({});

  const descendants = api.getDescendantNodes(canvas, topics[0]);

  assert.equal(descendants.length, size - 1);
  assert.equal(descendants[descendants.length - 1].id, topics[size - 1].id);
  assert.equal(api.getAffectedRootNode(canvas, topics[size - 1]), topics[0]);
});

test("finds each affected root independently through canonical parents", () => {
  const topics = ["a", "b", "c", "d", "e"].map((id) => topic(id));
  const canvas = canvasWithTopics(
    topics,
    [["a", "b"], ["b", "c"], ["c", "a"], ["d", "e"]]
  );
  const api = new CanvasAPI({});

  assert.equal(api.getAffectedRootNode(canvas, topics[1])?.id, "a");
  assert.equal(api.getAffectedRootNode(canvas, topics[2])?.id, "a");
  assert.equal(api.getAffectedRootNode(canvas, topics[4])?.id, "d");
});

test("projects persisted collapsed subtrees from the same canonical graph", () => {
  const topics = ["root", "child", "leaf", "sibling"].map((id) => topic(id));
  const canvas = canvasWithTopics(topics, [
    ["root", "child"],
    ["child", "leaf"],
    ["root", "sibling"]
  ]);
  topics[0].unknownData = { collapsed: true };
  const api = new CanvasAPI({});

  const visible = api.getVisibleForest(canvas);

  assert.deepEqual(
    visible[0].children.map((treeNode) => treeNode.canvasNode.id),
    []
  );
  assert.deepEqual(
    api.getDescendantNodes(canvas, topics[0]).map((node) => node.id),
    ["child", "leaf", "sibling"]
  );
});

test("Canvas edge creation serializes the complete authored line style", () => {
  const parent = topic("parent");
  const child = topic("child", 200);
  const canvas = canvasWithTopics([parent, child], []);
  const api = new CanvasAPI({});

  api.createEdge(canvas, parent, child, "right", "left", "#abcdef", {
    label: "depends on",
    lineType: "straight",
    curve: false,
    curvature: 0.9
  });

  const [data] = canvas.getData().edges;
  assert.equal(data.label, "depends on");
  assert.equal(data.lineType, "straight");
  assert.equal(data.curve, false);
  assert.equal(data.curvature, 0.9);
});

test("reparent preserves the authored edge ID through the real Canvas seam", () => {
  const oldParent = topic("old");
  const dragged = topic("dragged", 200);
  const target = topic("target", 400);
  const canvas = canvasWithTopics(
    [oldParent, dragged, target],
    [["old", "dragged"]]
  );
  const api = new CanvasAPI({});
  const forest = api.getGraphQuery(canvas).forest;

  const attached = reparentSubtree(canvas, api, dragged, target, "child", forest, target);

  assert.equal(attached, true);
  assert.equal(canvas.edges.size, 1);
  const [edge] = canvas.edges.values();
  assert.equal(edge.id, "edge-0");
  assert.equal(edge.from.node.id, "target");
  assert.equal(edge.to.node.id, "dragged");
});

test("real Canvas reparent repairs surplus incoming parents", () => {
  const oldParent = topic("old");
  const other = topic("other", 200);
  const dragged = topic("dragged", 400);
  const target = topic("target", 600);
  const canvas = canvasWithTopics(
    [oldParent, other, dragged, target],
    [["old", "dragged"], ["other", "dragged"]]
  );
  const api = new CanvasAPI({});
  const forest = api.getGraphQuery(canvas).forest;

  const attached = reparentSubtree(canvas, api, dragged, target, "child", forest, target);

  assert.equal(attached, true);
  assert.deepEqual(
    [...canvas.edges.values()].map((edge) => [edge.from.node.id, edge.to.node.id]),
    [["target", "dragged"]]
  );
});

test("failed edge replacement restores the authored record", () => {
  const a = topic("a");
  const b = topic("b", 200);
  const c = topic("c", 400);
  const canvas = canvasWithTopics([a, b, c], [["a", "b"]]);
  const api = new CanvasAPI({});
  const originalImport = canvas.importData;
  let calls = 0;
  canvas.importData = (data) => {
    if (calls++ === 0) throw new Error("replacement rejected");
    return originalImport.call(canvas, data);
  };

  const replacement = api.replaceEdge(canvas, canvas.edges.get("edge-0"), c, b, "left", "right");

  assert.equal(replacement, null);
  assert.equal(canvas.edges.size, 1);
  assert.equal(canvas.edges.get("edge-0")?.from.node.id, "a");
});

test("advances the graph revision across same-size Canvas edge replacements", () => {
  const a = topic("a");
  const b = topic("b", 200);
  const canvas = canvasWithTopics([a, b], [["a", "b"]]);
  const api = new CanvasAPI({});
  assert.equal(api.getParentNode(canvas, b)?.id, "a");
  const firstRevision = api.getGraphQuery(canvas).revision;

  api.removeEdge(canvas, canvas.edges.get("edge-0"));
  api.createEdge(canvas, b, a);
  const replacement = api.getParentNode(canvas, a);

  assert.equal(replacement?.id, "b");
  assert.ok(api.getGraphQuery(canvas).revision > firstRevision);
  assert.equal(canvas.edges.size, 1);
});
