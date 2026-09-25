"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canvasTopicPreorder,
  compareTopToBottom,
  orderChildren,
  orderMatches,
  reorderPreservingSource
} = require("../lib/markdown-order.js");
const { buildForest, getGroupIds } = require("../lib/tree-model.js");

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCanvas(nodeSpecs, edgePairs) {
  const nodes = new Map();
  for (const spec of nodeSpecs) {
    nodes.set(spec.id, {
      id: spec.id,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      width: spec.width ?? 200,
      height: spec.height ?? 60,
      type: spec.type ?? "text",
      text: spec.text ?? spec.id
    });
  }
  const edges = new Map();
  let index = 0;
  for (const [fromId, toId] of edgePairs) {
    const id = `edge-${index++}`;
    edges.set(id, {
      id,
      from: { node: nodes.get(fromId) },
      to: { node: nodes.get(toId) },
      fromSide: "right",
      toSide: "left"
    });
  }
  return {
    nodes,
    edges,
    getData: () => ({
      nodes: Array.from(nodes.values()).map((node) => ({ ...node })),
      edges: Array.from(edges.values()).map((edge) => ({
        id: edge.id,
        fromNode: edge.from.node?.id ?? edge.fromNode,
        toNode: edge.to.node?.id ?? edge.toNode,
        fromSide: "right",
        toSide: "left"
      }))
    })
  };
}

function chainIds(count, prefix = "n") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function chainCanvas(count) {
  const ids = chainIds(count);
  const nodes = ids.map((id, index) => ({ id, x: index * 200, y: 0 }));
  const edges = ids.slice(1).map((id, index) => [ids[index], id]);
  return { ids, canvas: makeCanvas(nodes, edges) };
}

/* ------------------------------------------------------------------ */
/* sibling chronology (unchanged contract)                            */
/* ------------------------------------------------------------------ */

test("siblings keep the reading order a radial map implies", () => {
  const left = { id: "l", x: 0, y: 10, width: 100, height: 40, text: "l" };
  const right = { id: "r", x: 300, y: 0, width: 100, height: 40, text: "r" };
  const centre = { id: "c", x: 150, y: 0, width: 100, height: 40, text: "c" };
  const deepLeft = { id: "d", x: -400, y: 0, width: 100, height: 40, text: "d" };
  assert.deepEqual(orderChildren(centre, [left, right], true).map((n) => n.id), ["r", "l"]);
  // `deepLeft` sits on the left side and above `left`, so it leads that side.
  assert.deepEqual(orderChildren(centre, [left, right, deepLeft], true).map((n) => n.id), [
    "r",
    "d",
    "l"
  ]);
  assert.deepEqual(orderChildren(centre, [left, right], false).map((n) => n.id), ["r", "l"]);
  assert.ok(compareTopToBottom(right, left) < 0);
});

test("a standalone block sibling precedes a heading sibling", () => {
  const heading = { id: "h", x: 0, y: 0, width: 100, height: 40, text: "Heading" };
  const block = { id: "b", x: 0, y: 0, width: 100, height: 40, text: "```\ncode\n```" };
  assert.deepEqual(orderChildren(null, [heading, block]).map((n) => n.id), ["b", "h"]);
});

/* ------------------------------------------------------------------ */
/* canonical parent graph                                             */
/* ------------------------------------------------------------------ */

test("a surplus parent edge is ignored the way the canonical forest ignores it", () => {
  const canvas = makeCanvas(
    [
      { id: "root", x: 0, y: 0 },
      { id: "a", x: 300, y: 0 },
      { id: "b", x: 300, y: 100 },
      { id: "child", x: 600, y: 0 }
    ],
    [
      ["root", "a"],
      ["root", "b"],
      ["a", "child"],
      ["b", "child"]
    ]
  );
  // `b -> child` is a surplus edge: `child` already has a parent, so the
  // canonical forest keeps `a -> child` and the preorder stays depth-first.
  assert.deepEqual(canvasTopicPreorder(canvas, getGroupIds), ["root", "a", "child", "b"]);
  const forest = buildForest(canvas);
  const parents = new Map();
  const stack = forest.map((treeNode) => treeNode);
  while (stack.length > 0) {
    const treeNode = stack.pop();
    for (const child of treeNode.children) {
      parents.set(child.canvasNode.id, treeNode.canvasNode.id);
      stack.push(child);
    }
  }
  assert.equal(parents.get("child"), "a");
});

test("a directed cycle, a self loop, and a dangling edge are ignored", () => {
  const canvas = makeCanvas(
    [
      { id: "c", x: 0, y: 100 },
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 200 }
    ],
    [
      ["a", "b"],
      ["b", "a"],
      ["b", "b"],
      ["a", "c"],
      ["a", "ghost"]
    ]
  );
  const order = canvasTopicPreorder(canvas, getGroupIds);
  // `a` is the only root; the cycle edge, the self loop, and the dangling
  // endpoint are dropped, so the walk is a depth-first order of the forest
  // rather than a walk that runs out of stack.
  assert.deepEqual(order, ["a", "c", "b"]);
  assert.equal(new Set(order).size, 3);
});

test("a group is never a topic", () => {
  const canvas = makeCanvas(
    [
      { id: "root", x: 0, y: 0 },
      { id: "g", x: 0, y: 0, type: "group", label: "Group" },
      { id: "child", x: 300, y: 0 }
    ],
    [
      ["root", "g"],
      ["g", "child"]
    ]
  );
  assert.deepEqual(canvasTopicPreorder(canvas, getGroupIds), ["root", "child"]);
});

test("an injected canonical graph is preferred over the raw edge list", () => {
  const canvas = makeCanvas(
    [
      { id: "root", x: 0, y: 0 },
      { id: "a", x: 300, y: 0 },
      { id: "b", x: 300, y: 100 }
    ],
    [
      ["root", "a"],
      ["root", "b"]
    ]
  );
  // The caller already knows the canonical shape; the raw edges would say
  // something different and must not win.
  const graph = {
    nodes: new Map([
      ["root", { id: "root", x: 0, y: 0 }],
      ["a", { id: "a", x: 300, y: 0 }],
      ["b", { id: "b", x: 300, y: 100 }]
    ]),
    parents: new Map([
      ["a", "root"],
      ["b", "a"]
    ]),
    children: new Map([
      ["root", ["a"]],
      ["a", ["b"]],
      ["b", []]
    ]),
    roots: ["root"]
  };
  assert.deepEqual(canvasTopicPreorder(canvas, getGroupIds, { graph }), ["root", "a", "b"]);
  assert.deepEqual(canvasTopicPreorder(canvas, getGroupIds), ["root", "a", "b"]);
});

/* ------------------------------------------------------------------ */
/* deep and wide                                                      */
/* ------------------------------------------------------------------ */

test("a 12,000 level chain walks without recursion", () => {
  const { ids, canvas } = chainCanvas(12_000);
  const order = canvasTopicPreorder(canvas, getGroupIds);
  assert.equal(order.length, 12_000);
  assert.equal(order[0], ids[0]);
  assert.equal(order.at(-1), ids.at(-1));
  assert.equal(new Set(order).size, 12_000);
});

test("a 20,000 sibling map never scans the order it is building", () => {
  const nodes = [{ id: "root", x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 20_000; index++) {
    nodes.push({ id: `n${index}`, x: 400, y: index });
    edges.push(["root", `n${index}`]);
  }
  const canvas = makeCanvas(nodes, edges);
  const original = Array.prototype.includes;
  let scans = 0;
  Array.prototype.includes = function counted(...args) {
    scans++;
    return original.apply(this, args);
  };
  let order;
  try {
    order = canvasTopicPreorder(canvas, getGroupIds);
  } finally {
    Array.prototype.includes = original;
  }
  assert.equal(order.length, 20_001);
  assert.equal(scans, 0, `membership scanned the order array ${scans} times`);
});

/* ------------------------------------------------------------------ */
/* reorderPreservingSource                                            */
/* ------------------------------------------------------------------ */

function reorderDependencies(overrides = {}) {
  return {
    getGroupIds,
    parseDocument: () => ({ topicSources: [] }),
    lineRecords: () => [],
    withMetadata: (text) => text,
    withoutLegacyComments: (text) => text,
    identityKey: (text) => String(text),
    identityLabel: (text) => String(text),
    nodeText: (node) => node?.text || "Untitled",
    ...overrides
  };
}

test("a deep subtree is measured iteratively instead of recursing", () => {
  // 20,000 levels of source records with no real document bytes: the slice
  // moving walk must not recurse once per level to collect a subtree.
  const depth = 20_000;
  const ids = chainIds(depth);
  const topicSources = ids.map((id, index) => ({
    id,
    parentId: index === 0 ? null : index === 1 ? "root" : ids[index - 1],
    startLine: index + 1,
    endLine: index + 2,
    kind: "list",
    indent: "  ".repeat(Math.min(index, 100)),
    marker: "-",
    prefix: `${"  ".repeat(Math.min(index, 100))}- `
  }));
  const nodes = [
    { id: "root", x: 0, y: 0 },
    { id: "n0", x: 300, y: 0 },
    ...ids.map((id, index) => ({ id, x: 300 + index, y: 0 }))
  ];
  // `n0` and `n1` are siblings under `root`, and `n0` owns the whole chain.
  const canvas = makeCanvas(
    nodes,
    Array.from({ length: depth }, (_, index) => [index === 0 ? "root" : index === 1 ? "root" : ids[index - 1], index === 0 ? "n0" : index === 1 ? "n1" : ids[index]]).slice(2)
  );
  const records = ids.map((id, index) => ({
    start: index * 10,
    contentEnd: index * 10 + 5,
    end: index * 10 + 10
  }));
  const result = reorderPreservingSource("body", canvas, reorderDependencies({
    parseDocument: () => ({ topicSources }),
    lineRecords: () => records
  }));
  assert.equal(typeof result, "string");
  assert.equal(result.length, 4);
});

test("a large subtree range is measured without spreading into Math.min", () => {
  // `Math.min(...array)` throws above roughly 65,000 arguments, so one sibling
  // with more descendants than that used to fail the whole reorder.
  const descendants = 140_000;
  const lines = ["- Parent", "  - Left"];
  for (let index = 0; index < descendants; index++) lines.push(`    - Child ${index}`);
  lines.push("  - Right");
  const source = `${lines.join("\n")}\n`;

  // The Canvas reads `right` first, so the two siblings must swap and `left`'s
  // whole subtree - more records than `Math.min(...)` accepts as arguments -
  // has to be measured.
  const nodes = [
    { id: "parent", x: 0, y: 0 },
    { id: "left", x: 300, y: 100 },
    { id: "right", x: 300, y: 0 }
  ];
  const edges = [
    ["parent", "left"],
    ["parent", "right"]
  ];
  for (let index = 0; index < descendants; index++) {
    nodes.push({ id: `c${index}`, x: 600, y: index });
    edges.push(["left", `c${index}`]);
  }
  const canvas = makeCanvas(nodes, edges);

  let offset = 0;
  const records = source.split("\n").map((line) => {
    const start = offset;
    offset += line.length + 1;
    return { start, contentEnd: start + line.length, end: offset };
  });
  const topicSources = [
    { id: "parent", parentId: null, line: 0, indent: "" },
    { id: "left", parentId: "parent", line: 1, indent: "  " }
  ];
  for (let index = 0; index < descendants; index++)
    topicSources.push({ id: `c${index}`, parentId: "left", line: 2 + index, indent: "    " });
  topicSources.push({ id: "right", parentId: "parent", line: 2 + descendants, indent: "  " });

  const result = reorderPreservingSource(source, canvas, reorderDependencies({
    // A stateful stub: the first pass reorders the siblings, and the parse that
    // follows must report the new order or the plan would never converge.
    parseDocument: (() => {
      let swapped = false;
      return () => {
        const order = swapped
          ? [topicSources[0], topicSources[topicSources.length - 1], ...topicSources.slice(1, -1)]
          : topicSources;
        swapped = !swapped;
        return {
          topicSources: order.map((record) => ({
            id: record.id,
            parentId: record.parentId,
            startLine: record.line,
            endLine: record.line + 1,
            kind: "list",
            indent: record.indent,
            marker: "-",
            prefix: `${record.indent}- `
          }))
        };
      };
    })(),
    lineRecords: () => records
  }));
  // The swap happened: `right` now precedes the whole `left` subtree.
  assert.equal(result.indexOf("- Right") < result.indexOf("- Left"), true);
  assert.equal(result.includes("- Child 139999"), true);
  assert.equal(result.length, source.length);
});

test("orderMatches compares sibling order and ignores unmatched topics", () => {
  const canvas = makeCanvas(
    [
      { id: "root", x: 0, y: 0 },
      { id: "a", x: 300, y: 0 },
      { id: "b", x: 300, y: 100 }
    ],
    [
      ["root", "a"],
      ["root", "b"]
    ]
  );
  const matching = {
    topicSources: [
      { id: "root", parentId: null },
      { id: "a", parentId: "root", kind: "heading", level: 2 },
      { id: "b", parentId: "root", kind: "heading", level: 2 }
    ]
  };
  assert.equal(orderMatches(canvas, matching, getGroupIds), true);
  const swapped = {
    topicSources: [
      { id: "root", parentId: null },
      { id: "b", parentId: "root", kind: "heading", level: 2 },
      { id: "a", parentId: "root", kind: "heading", level: 2 }
    ]
  };
  assert.equal(orderMatches(canvas, swapped, getGroupIds), false);
  assert.equal(orderMatches(canvas, null, getGroupIds), false);
  assert.equal(
    orderMatches(canvas, { topicSources: [{ id: "root", parentId: null }] }, getGroupIds),
    false
  );
});

test("an injected graph also drives orderMatches and the reorder", () => {
  const canvas = makeCanvas(
    [
      { id: "root", x: 0, y: 0 },
      { id: "a", x: 300, y: 0 },
      { id: "b", x: 300, y: 100 }
    ],
    [
      ["root", "a"],
      ["root", "b"]
    ]
  );
  const graph = {
    nodes: new Map([
      ["root", { id: "root", x: 0, y: 0 }],
      ["a", { id: "a", x: 300, y: 0 }],
      ["b", { id: "b", x: 300, y: 100 }]
    ]),
    parents: new Map([
      ["a", "root"],
      ["b", "a"]
    ]),
    children: new Map([
      ["root", ["a"]],
      ["a", ["b"]],
      ["b", []]
    ]),
    roots: ["root"]
  };
  const sources = [
    { id: "root", parentId: null },
    { id: "a", parentId: "root", kind: "heading", level: 2 },
    { id: "b", parentId: "a", kind: "heading", level: 2 }
  ];
  assert.equal(orderMatches(canvas, { topicSources: sources }, getGroupIds, { graph }), true);
  const markdown = reorderPreservingSource("doc", canvas, reorderDependencies({ graph }));
  assert.equal(markdown, "doc");
});
