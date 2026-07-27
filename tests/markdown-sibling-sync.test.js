"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadMarkdownSyncFunctions() {
  const mainPath = path.resolve(__dirname, "..", "main.js");
  const source = `${fs.readFileSync(mainPath, "utf8")}
module.exports.__test = {
  LayoutEngine,
  markdownMindMapToCanvas,
  patchMarkdownFromCanvasPreservingSource
};`;
  class ObsidianStub {
  }
  const obsidian = new Proxy({}, {
    get: () => ObsidianStub
  });
  const sandbox = {
    Blob,
    URL,
    clearInterval,
    clearTimeout,
    console,
    module: { exports: {} },
    require: (id) => {
      if (id === "obsidian")
        return obsidian;
      throw new Error(`Unexpected module request: ${id}`);
    },
    setInterval,
    setTimeout
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, { filename: mainPath });
  return sandbox.module.exports.__test;
}

const {
  LayoutEngine,
  markdownMindMapToCanvas,
  patchMarkdownFromCanvasPreservingSource
} = loadMarkdownSyncFunctions();

const layoutOptions = {
  horizontalGap: 80,
  verticalGap: 30,
  nodeWidth: 220,
  nodeHeight: 60,
  maxNodeHeight: 1e3
};

function canvasWithSibling(markdown, siblingText) {
  const imported = markdownMindMapToCanvas(markdown, layoutOptions);
  assert.ok(imported);
  const nodes = imported.nodes.map((node) => ({ ...node }));
  const byText = new Map(nodes.map((node) => [node.text, node]));
  const parent = byText.get("Parent");
  const before = byText.get("Alpha");
  const after = byText.get("Charlie");
  assert.ok(parent && before && after);
  const sibling = {
    id: "new-sibling",
    text: siblingText,
    x: before.x,
    y: (before.y + after.y) / 2,
    width: before.width,
    height: before.height
  };
  assert.ok(
    before.y < sibling.y && sibling.y < after.y,
    `Expected source siblings to be top-to-bottom, got Alpha=${before.y}, new=${sibling.y}, Charlie=${after.y}`
  );
  nodes.push(sibling);
  const edges = [
    ...imported.edges.map((edge) => ({ ...edge })),
    {
      id: "new-sibling-edge",
      fromNode: parent.id,
      toNode: sibling.id
    }
  ];
  return {
    imported,
    canvas: {
      nodes: new Map(nodes.map((node) => [node.id, node])),
      getData: () => ({
        nodes: nodes.map((node) => ({ ...node, type: "text" })),
        edges
      })
    }
  };
}

function assertSiblingOrder(markdown, labels) {
  let previous = -1;
  for (const label of labels) {
    const index = markdown.indexOf(label);
    assert.ok(index > previous, `${label} should follow the preceding sibling subtree:\n${markdown}`);
    previous = index;
  }
}

function assertSiblingStillBelongsToParent(markdown, siblingText) {
  const reparsed = markdownMindMapToCanvas(markdown, layoutOptions);
  assert.ok(reparsed);
  const parent = reparsed.nodes.find((node) => node.text === "Parent");
  const sibling = reparsed.nodes.find((node) => node.text === siblingText);
  assert.ok(parent && sibling);
  assert.ok(
    reparsed.edges.some((edge) => edge.fromNode === parent.id && edge.toNode === sibling.id),
    `${siblingText} should remain a child of Parent after Markdown is reparsed`
  );
}

test("inserts a heading sibling between its adjacent sibling subtrees", () => {
  const markdown = [
    "# Root",
    "",
    "## Parent",
    "",
    "### Alpha",
    "",
    "#### Detail",
    "",
    "### Charlie",
    ""
  ].join("\n");
  const { imported, canvas } = canvasWithSibling(markdown, "Bravo");
  const patched = patchMarkdownFromCanvasPreservingSource(markdown, canvas, imported, "Map.canvas");

  assert.ok(patched);
  assertSiblingOrder(patched, ["### Alpha", "#### Detail", "### Bravo", "### Charlie"]);
  assertSiblingStillBelongsToParent(patched, "Bravo");
});

test("inserts a list sibling between its adjacent sibling subtrees", () => {
  const markdown = [
    "# Root",
    "",
    "- Parent",
    "  - Alpha",
    "    - Detail",
    "  - Charlie",
    ""
  ].join("\n");
  const { imported, canvas } = canvasWithSibling(markdown, "Bravo");
  const patched = patchMarkdownFromCanvasPreservingSource(markdown, canvas, imported, "Map.canvas");

  assert.ok(patched);
  assertSiblingOrder(patched, ["  - Alpha", "    - Detail", "  - Bravo", "  - Charlie"]);
  assertSiblingStillBelongsToParent(patched, "Bravo");
});

test("measures very deep subtree heights iteratively", () => {
  const engine = new LayoutEngine({ nodeHeight: 60, verticalGap: 20 });
  const root = {
    canvasNode: { height: 60 },
    children: []
  };
  let cursor = root;
  for (let index = 0; index < 12000; index++) {
    const child = { canvasNode: { height: 60 }, children: [] };
    cursor.children.push(child);
    cursor = child;
  }

  assert.equal(engine.measureSubtreeHeight(root), 60);
});

test("balances wide roots in linear prefix-sum passes", () => {
  const engine = new LayoutEngine({ nodeHeight: 60, verticalGap: 20 });
  const root = {
    canvasNode: { id: "root", x: 0, y: 0, width: 200, height: 60 },
    children: Array.from({ length: 4000 }, (_, index) => ({
      canvasNode: { id: `child-${index}`, x: 300, y: index * 80, width: 200, height: 60 },
      children: [],
      direction: "right"
    }))
  };
  const { leftChildren, rightChildren } = engine.balanceRootChildren(root);

  assert.equal(leftChildren.length + rightChildren.length, 4000);
  assert.equal(Math.abs(leftChildren.length - rightChildren.length), 0);
});
