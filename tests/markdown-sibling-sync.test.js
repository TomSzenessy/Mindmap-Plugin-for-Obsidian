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
  CanvasMindMapPlugin,
  LayoutEngine,
  canvasMatchesImportedMarkdown,
  canvasDataToMindMapMarkdown,
  markdownMindMapToCanvas,
  patchMarkdownFromCanvasPreservingSource,
  reconcileCanvasData
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
  CanvasMindMapPlugin,
  LayoutEngine,
  canvasMatchesImportedMarkdown,
  canvasDataToMindMapMarkdown,
  markdownMindMapToCanvas,
  patchMarkdownFromCanvasPreservingSource,
  reconcileCanvasData
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

test("packs neighboring subtree cards with visual horizontal clearance", () => {
  const engine = new LayoutEngine({ horizontalGap: 80, verticalGap: 20, animate: false });
  const packed = engine.packSubtrees([
    {
      contour: new Map([[1, { top: 0, bottom: 60 }]]),
      rectangles: [{ left: 0, right: 150, top: 0, bottom: 60 }]
    },
    {
      contour: new Map([[1, { top: 0, bottom: 60 }]]),
      rectangles: [{ left: 151, right: 301, top: 0, bottom: 60 }]
    }
  ]);
  assert.deepEqual(Array.from(packed.yOffsets), [0, 80]);
});

test("preview direction puts every child opposite the incoming arrow", () => {
  const makeNode = (id, x, y) => ({
    id, x, y, width: 160, height: 60,
    moveTo(pos) {
      this.x = pos.x;
      this.y = pos.y;
    }
  });
  const dragged = makeNode("dragged", 500, 0);
  const leftChild = makeNode("left-child", 260, -40);
  const rightChild = makeNode("right-child", 740, 40);
  const edge = (id, from, to) => ({
    id,
    from: { node: from, side: "right" },
    to: { node: to, side: "left" }
  });
  const canvas = {
    nodes: new Map([[dragged.id, dragged], [leftChild.id, leftChild], [rightChild.id, rightChild]]),
    edges: new Map([
      ["left-edge", edge("left-edge", dragged, leftChild)],
      ["right-edge", edge("right-edge", dragged, rightChild)]
    ]),
    getData: () => ({ nodes: [], edges: [] }),
    requestFrame() {},
    requestSave() {}
  };
  const engine = new LayoutEngine({ horizontalGap: 80, verticalGap: 20, animate: false });

  engine.layoutChildren(canvas, dragged.id, "left");

  assert.equal(leftChild.x, 260);
  assert.equal(rightChild.x, 260);
  assert.ok(leftChild.y < rightChild.y);
  for (const output of canvas.edges.values()) {
    assert.equal(output.from.side, "left");
    assert.equal(output.to.side, "right");
  }
});

test("preserves the dropped side of root branches during drag reflow", () => {
  const engine = new LayoutEngine({ nodeHeight: 60, verticalGap: 20 });
  const leftLeaf = {
    canvasNode: { id: "left-leaf", x: 0, y: 0, width: 120, height: 60 },
    children: [],
    direction: "right"
  };
  const leftBranch = {
    canvasNode: { id: "left", x: 100, y: 0, width: 160, height: 60 },
    children: [leftLeaf],
    direction: "right"
  };
  const root = {
    canvasNode: { id: "root", x: 500, y: 0, width: 200, height: 60 },
    children: [leftBranch]
  };

  const { leftChildren, rightChildren } = engine.balanceRootChildren(root, true);

  assert.deepEqual(leftChildren, [leftBranch]);
  assert.deepEqual(rightChildren, []);
  assert.equal(leftBranch.direction, "left");
  assert.equal(leftLeaf.direction, "left");
});

test("flips a nested branch and all of its leaves across its parent", () => {
  const engine = new LayoutEngine({
    horizontalGap: 80,
    nodeHeight: 60,
    nodeWidth: 160
  });
  const leaf = {
    canvasNode: { id: "leaf", width: 120, height: 60 },
    children: []
  };
  const movedBranch = {
    canvasNode: { id: "moved", width: 160, height: 60 },
    children: [leaf]
  };
  const positions = new Map();

  engine.layoutSubtree(
    {
      canvasNode: { id: "parent", width: 160, height: 60 },
      children: [movedBranch]
    },
    500,
    0,
    0,
    "right",
    positions,
    { branchDirectionOverride: { nodeId: "moved", direction: "left" } }
  );

  assert.equal(positions.get("moved").x, 260);
  assert.equal(positions.get("leaf").x, 60);
});

test("keeps a nested branch flipped on later layout passes", () => {
  const engine = new LayoutEngine({ horizontalGap: 80, nodeHeight: 60 });
  const positions = new Map();
  const leaf = {
    canvasNode: { id: "leaf", width: 120, height: 60 },
    children: []
  };
  const movedBranch = {
    canvasNode: { id: "moved", width: 160, height: 60 },
    children: [leaf]
  };

  engine.layoutSubtree(
    {
      canvasNode: { id: "parent", width: 160, height: 60 },
      children: [movedBranch]
    },
    500,
    0,
    0,
    "right",
    positions,
    {
      nestedDirections: new Map([
        ["moved", "left"],
        ["leaf", "left"]
      ])
    }
  );

  assert.equal(positions.get("moved").x, 260);
  assert.equal(positions.get("leaf").x, 60);
});

test("exports Canvas file and media nodes as useful Markmap Markdown", () => {
  const data = {
    nodes: [
      { id: "root", type: "text", text: "Resources", x: 0, y: 0, width: 240, height: 60 },
      { id: "image", type: "file", file: "Assets/photo one.png", x: 320, y: 0, width: 480, height: 320 },
      { id: "pdf", type: "file", file: "Documents/Guide.pdf", x: 320, y: 400, width: 640, height: 480 },
      { id: "note", type: "file", file: "Notes/Details.md", x: 320, y: 960, width: 480, height: 280 },
      { id: "web-image", type: "link", url: "https://example.com/diagram.svg", x: 320, y: 1300, width: 480, height: 280 },
      {
        id: "embeds",
        type: "text",
        text: "Embedded resources\n![[Assets/inline image.webp]]\n![[Documents/Inline.pdf|Read the PDF]]\n[[Notes/Related.md|Related note]]",
        x: 320,
        y: 1640,
        width: 480,
        height: 280
      }
    ],
    edges: [
      { id: "e1", fromNode: "root", toNode: "image", fromSide: "right", toSide: "left" },
      { id: "e2", fromNode: "root", toNode: "pdf", fromSide: "right", toSide: "left" },
      { id: "e3", fromNode: "root", toNode: "note", fromSide: "right", toSide: "left" },
      { id: "e4", fromNode: "root", toNode: "web-image", fromSide: "right", toSide: "left" },
      { id: "e5", fromNode: "root", toNode: "embeds", fromSide: "right", toSide: "left" }
    ]
  };
  const markdown = canvasDataToMindMapMarkdown(
    data,
    { basename: "Media map", path: "Media map.canvas" },
    { exportMarkmapFrontmatter: true, markmapColorFreezeLevel: 2 }
  );

  assert.match(markdown, /title: "Media map"/);
  assert.match(markdown, /markmap:\n  colorFreezeLevel: 2/);
  assert.match(markdown, /!\[photo one\.png\]\(<Assets\/photo one\.png>\)/);
  assert.match(markdown, /^- !\[photo one\.png\]\(<Assets\/photo one\.png>\)$/m);
  assert.match(markdown, /\[Guide\.pdf\]\(<Documents\/Guide\.pdf>\)/);
  assert.match(markdown, /\[Details\.md\]\(<Notes\/Details\.md>\)/);
  assert.match(markdown, /!\[example\.com\]\(<https:\/\/example\.com\/diagram\.svg>\)/);
  assert.match(markdown, /!\[inline image\.webp\]\(<Assets\/inline image\.webp>\)/);
  assert.match(markdown, /\[Read the PDF\]\(<Documents\/Inline\.pdf>\)/);
  assert.match(markdown, /\[Related note\]\(<Notes\/Related\.md>\)/);
  assert.doesNotMatch(markdown, /# Untitled|^- Untitled/m);

  const roundTrip = markdownMindMapToCanvas(markdown, layoutOptions);
  assert.ok(
    roundTrip.nodes.some((node) => node.type === "file" && node.file === "Assets/photo one.png"),
    JSON.stringify(roundTrip.nodes, null, 2)
  );
  assert.ok(roundTrip.nodes.some((node) => node.type === "file" && node.file === "Documents/Guide.pdf"));
  assert.ok(roundTrip.nodes.some((node) => node.type === "file" && node.file === "Notes/Details.md"));
  assert.ok(roundTrip.nodes.some((node) => node.type === "link" && node.url === "https://example.com/diagram.svg"));
  for (const childId of ["image", "pdf", "note", "web-image", "embeds"]) {
    assert.ok(
      roundTrip.edges.some((edge) => edge.fromNode === "root" && edge.toNode === childId),
      `${childId} should remain a direct child of the root after Markdown round-trip`
    );
  }
});

test("portable Markdown omits all Properties metadata while sync output keeps it", () => {
  const data = {
    nodes: [
      { id: "root", type: "text", text: "Root", x: 0, y: 0, width: 220, height: 60 },
      { id: "child", type: "text", text: "Child", x: 300, y: 0, width: 220, height: 60 }
    ],
    edges: [
      { id: "edge", fromNode: "root", fromSide: "right", toNode: "child", toSide: "left" }
    ],
    mindmap: true
  };
  const file = { basename: "Portable", path: "Portable.canvas" };
  const portable = canvasDataToMindMapMarkdown(data, file, { includeFrontmatter: false });
  assert.equal(portable, "# Root\n\n## Child\n");
  assert.doesNotMatch(portable, /^---/);
  assert.doesNotMatch(portable, /tomindmap:/);

  const synchronized = canvasDataToMindMapMarkdown(data, file);
  assert.match(synchronized, /^---/);
  assert.match(synchronized, /tomindmap:\n  version: 1/);
});

test("localized Markdown sync preserves newly added native media cards", () => {
  const source = "# Project\n";
  const imported = markdownMindMapToCanvas(source, layoutOptions);
  const root = { ...imported.nodes[0] };
  const image = {
    id: "new-image",
    file: { path: "Assets/new diagram.png" },
    unknownData: { type: "file", file: "Assets/new diagram.png" },
    x: 300,
    y: 0,
    width: 480,
    height: 320
  };
  const pdf = {
    id: "new-pdf",
    file: { path: "Documents/Specification.pdf" },
    unknownData: { type: "file", file: "Documents/Specification.pdf" },
    x: 300,
    y: 400,
    width: 640,
    height: 480
  };
  const nodes = [root, image, pdf];
  const edges = [
    { id: "image-edge", fromNode: root.id, toNode: image.id },
    { id: "pdf-edge", fromNode: root.id, toNode: pdf.id }
  ];
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    getData: () => ({
      nodes: [
        { ...root, type: "text" },
        { id: image.id, type: "file", file: image.unknownData.file, x: image.x, y: image.y, width: image.width, height: image.height },
        { id: pdf.id, type: "file", file: pdf.unknownData.file, x: pdf.x, y: pdf.y, width: pdf.width, height: pdf.height }
      ],
      edges
    })
  };

  const patched = patchMarkdownFromCanvasPreservingSource(
    source,
    canvas,
    imported,
    "Project.canvas"
  );
  assert.ok(patched);
  assert.match(patched, /!\[new diagram\.png\]\(<Assets\/new diagram\.png>\)/);
  assert.match(patched, /^- !\[new diagram\.png\]\(<Assets\/new diagram\.png>\)$/m);
  assert.match(patched, /\[Specification\.pdf\]\(<Documents\/Specification\.pdf>\)/);
  assert.doesNotMatch(patched, /Untitled/);

  const reparsed = markdownMindMapToCanvas(patched, layoutOptions);
  assert.ok(canvasMatchesImportedMarkdown(canvas, reparsed, "Project.canvas"));
});

test("a native Markdown file card remains nested under its Canvas parent", () => {
  const data = {
    nodes: [
      { id: "root", type: "text", text: "Root", x: 0, y: 0, width: 180, height: 60 },
      { id: "parent", type: "text", text: "Organizational Security", x: -260, y: 0, width: 180, height: 80 },
      {
        id: "note",
        type: "file",
        file: "Notes/Obsidian Courses.md",
        x: -740,
        y: 0,
        width: 400,
        height: 240
      }
    ],
    edges: [
      { id: "root-parent", fromNode: "root", toNode: "parent", fromSide: "left", toSide: "right" },
      { id: "parent-note", fromNode: "parent", toNode: "note", fromSide: "left", toSide: "right" }
    ]
  };
  const markdown = canvasDataToMindMapMarkdown(
    data,
    { basename: "Map", path: "Map.canvas" }
  );
  assert.match(markdown, /### \[Obsidian Courses\.md\]\(<Notes\/Obsidian Courses\.md>\)/);

  const imported = markdownMindMapToCanvas(markdown, layoutOptions);
  assert.ok(imported.edges.some((edge) => edge.fromNode === "parent" && edge.toNode === "note"));
});

test("deleting an external file card removes it from synchronized Markdown", () => {
  const source = [
    "# IT & Society",
    "",
    "## 04 AI Ethics and Moral Machines",
    "",
    "### [All Slides.pdf](<study_artifacts/All Slides.pdf>)",
    ""
  ].join("\n");
  const imported = markdownMindMapToCanvas(source, layoutOptions);
  const root = imported.nodes.find((node) => node.type === "text" && node.text === "IT & Society");
  assert.ok(root);
  const canvas = {
    nodes: new Map([[root.id, { ...root }]]),
    getData: () => ({
      nodes: [{ ...root, type: "text" }],
      edges: []
    })
  };

  const patched = patchMarkdownFromCanvasPreservingSource(
    source,
    canvas,
    imported,
    "Map.canvas"
  );

  assert.doesNotMatch(patched, /All Slides/);
  assert.doesNotMatch(patched, /04 AI Ethics/);
  const reparsed = markdownMindMapToCanvas(patched, layoutOptions);
  assert.equal(reparsed.nodes.map((node) => node.text).join("|"), "IT & Society");
});

test("Markdown reconciliation always preserves native media dimensions from Canvas", () => {
  const existing = {
    mindmap: true,
    nodes: [
      { id: "root", type: "text", text: "Root", x: 0, y: 0, width: 180, height: 60 },
      {
        id: "pdf",
        type: "file",
        file: "Documents/Old.pdf",
        x: 300,
        y: 0,
        width: 913,
        height: 677
      }
    ],
    edges: [{ id: "old-edge", fromNode: "root", toNode: "pdf" }]
  };
  const imported = {
    nodes: [
      { id: "root", type: "text", text: "Root", x: 0, y: 0, width: 220, height: 60 },
      {
        id: "pdf",
        type: "file",
        file: "Documents/New.pdf",
        x: 300,
        y: 0,
        width: 640,
        height: 480
      }
    ],
    edges: [{ id: "new-edge", fromNode: "root", toNode: "pdf" }],
    frontmatter: ""
  };

  const reconciled = reconcileCanvasData(existing, imported);
  const pdf = reconciled.nodes.find((node) => node.id === "pdf");
  assert.equal(pdf.file, "Documents/New.pdf");
  assert.equal(pdf.width, 913);
  assert.equal(pdf.height, 677);
  assert.ok(!reconciled.mindmapPendingResize?.includes("pdf"));
});

test("a local Canvas drop cancels a queued stale Markdown reapply", () => {
  const staleTimer = setTimeout(() => {}, 10_000);
  const canvas = {
    view: { file: { path: "Project.canvas" } },
    getData: () => ({ mindmapMarkdownSync: { path: "Project Mindmap.md" } })
  };
  const plugin = {
    syncApplyingCanvas: new WeakSet(),
    markdownModifyTimers: new Map([["Project Mindmap.md", staleTimer]]),
    markdownSyncTimers: new Map(),
    getMarkdownSyncPath: CanvasMindMapPlugin.prototype.getMarkdownSyncPath,
    writeCanvasToLinkedMarkdown() {}
  };

  CanvasMindMapPlugin.prototype.scheduleCanvasToMarkdown.call(plugin, canvas);
  assert.equal(plugin.markdownModifyTimers.has("Project Mindmap.md"), false);
  const writeTimer = plugin.markdownSyncTimers.get("Project.canvas");
  assert.ok(writeTimer);
  clearTimeout(writeTimer);
});

test("Markdown reconciliation yields to a pending local Canvas media write", async () => {
  let setDataCalls = 0;
  const canvas = {
    view: { file: { path: "Project.canvas" } },
    getData: () => ({ mindmapMarkdownSync: { path: "Project Mindmap.md" } }),
    nodes: new Map(),
    setData: () => setDataCalls++
  };
  const pendingWrite = setTimeout(() => {}, 10_000);
  const plugin = {
    localCanvasMutations: new WeakSet(),
    markdownSyncTimers: new Map([["Project.canvas", pendingWrite]])
  };

  await CanvasMindMapPlugin.prototype.applyMarkdownToLiveCanvas.call(
    plugin,
    canvas,
    "# Old Markdown",
    { nodes: [], edges: [], rootIds: [] }
  );
  assert.equal(setDataCalls, 0);
  clearTimeout(pendingWrite);
});
