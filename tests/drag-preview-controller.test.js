"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDragAttachmentController,
  isPrimaryCardGesture
} = require("../lib/drag-preview-controller.js");
const {
  ATTACHMENT_DISTANCE,
  findNearestNodeOnBranch,
  isDescendant,
  nodeToNodeDistance
} = require("../lib/tree-drag.js");

function permanentEdges(fixture) {
  return fixture.activeEdges.filter((edge) => !edge.__mindMapPreview);
}

function previewEdges(fixture) {
  return fixture.activeEdges.filter((edge) => edge.__mindMapPreview);
}

/**
 * The attachment rule without a per-drag index: the whole forest is searched
 * for every candidate card. It is deliberately slow so it can serve as an
 * independent answer for "which card does the arrow point at".
 */
function referenceAttachmentTarget(draggedNode, forest) {
  const cards = [];
  for (const tree of forest) {
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop();
      cards.push(node.canvasNode);
      stack.push(...node.children);
    }
  }
  const attachable = cards.filter(
    (card) =>
      card.id !== draggedNode.id &&
      !isDescendant(forest, draggedNode.id, card.id)
  );
  if (attachable.length === 0) return null;
  const closest = Math.min(
    ...attachable.map((card) => nodeToNodeDistance(draggedNode, card))
  );
  if (closest > ATTACHMENT_DISTANCE) return null;
  if (attachable.length === 1) return attachable[0];
  return findNearestNodeOnBranch(
    draggedNode,
    attachable,
    forest[0].canvasNode,
    (rootId, targetId) => isDescendant(forest, rootId, targetId)
  );
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomMindMap(random, topicCount) {
  const card = (id, depth, slot) => ({
    id,
    x: (depth + 1) * 200 + Math.round(random() * 40),
    y: slot * 120 + Math.round(random() * 40),
    width: 120,
    height: 60
  });
  const rootTree = {
    canvasNode: card("root", -1, 0),
    children: [],
    parent: null,
    depth: -1
  };
  const forest = [rootTree];
  let level = [rootTree];
  let made = 0;
  while (made < topicCount) {
    const next = [];
    for (const tree of level) {
      const width = 1 + Math.floor(random() * 3);
      for (let index = 0; index < width && made < topicCount; index++) {
        const child = {
          canvasNode: card(`topic-${made}`, tree.depth + 1, made % 4),
          children: [],
          parent: tree,
          depth: tree.depth + 1
        };
        tree.children.push(child);
        next.push(child);
        made += 1;
      }
    }
    if (next.length === 0) break;
    level = next;
  }
  return forest;
}

function allTreeNodes(forest) {
  const nodes = [];
  for (const tree of forest) {
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop();
      nodes.push(node);
      stack.push(...node.children);
    }
  }
  return nodes;
}

/**
 * A dragged topic that already owns a subtree, dropped either close to a
 * foreign card or far away from every card.
 */
function randomDragFixture(seed) {
  const random = seededRandom(seed);
  const forest = randomMindMap(random, 3 + Math.floor(random() * 20));
  const treeNodes = allTreeNodes(forest);
  const movable = treeNodes.filter((node) => node.parent && node.canvasNode.id !== "root");
  const host = movable[Math.floor(random() * movable.length)] || forest[0];
  const dragged = {
    id: "dragged",
    x: 0,
    y: 0,
    width: 120,
    height: 60
  };
  const draggedTree = { canvasNode: dragged, children: [], parent: host, depth: 0 };
  if (host.parent) {
    const index = host.parent.children.indexOf(host);
    host.parent.children.splice(index, 1, draggedTree);
  } else {
    forest.push(draggedTree);
  }
  draggedTree.children.push(host);
  host.parent = draggedTree;

  const foreign = treeNodes.filter(
    (node) => !isDescendant(forest, dragged.id, node.canvasNode.id)
  );
  const nearby = foreign[Math.floor(random() * foreign.length)].canvasNode;
  if (random() < 0.5) {
    dragged.x = nearby.x + nearby.width + 40 + Math.round(random() * 110);
    dragged.y = nearby.y + Math.round(random() * 20) - 10;
  } else {
    dragged.x = 5000;
    dragged.y = 0;
  }

  const cards = new Map();
  for (const node of treeNodes) cards.set(node.canvasNode.id, node.canvasNode);
  cards.set(dragged.id, dragged);
  const activeEdges = [];
  let edgeCounter = 0;
  const canvas = {
    nodes: cards,
    requestFrame() {}
  };
  const canvasApi = {
    createEdge(_canvas, from, to, fromSide = "right", toSide = "left", color, options = {}) {
      const edge = {
        id: options.id || `edge-${++edgeCounter}`,
        from: { node: from, side: fromSide, end: options.fromEnd || "none" },
        to: { node: to, side: toSide, end: options.toEnd || "arrow" },
        color,
        lineType: "curved",
        curvature: 0.35
      };
      activeEdges.push(edge);
      return edge;
    },
    getIncomingEdges(_canvas, node) {
      return activeEdges.filter((edge) => edge.to.node.id === node.id);
    },
    removeEdge(_canvas, edge) {
      const index = activeEdges.indexOf(edge);
      if (index >= 0) activeEdges.splice(index, 1);
    }
  };
  const controller = createDragAttachmentController(
    canvas,
    canvasApi,
    () => forest,
    (node) => forest[0].canvasNode
  );
  return { controller, dragged, forest };
}

/**
 * A large mind map whose per-card geometry reads and forest scans are counted,
 * so a drag frame is measured instead of timed. Every topic below the map root
 * belongs to the subtree the dragged card must never attach to.
 */
function largeMapFixture({ topicCount, branchWidth = 4 }) {
  const cards = [];
  const counts = { geometryReads: 0, forestScans: 0, renders: 0 };
  const countGeometry = (card) => {
    for (const key of ["x", "y", "width", "height"]) {
      let value = card[key];
      Object.defineProperty(card, key, {
        get() {
          counts.geometryReads += 1;
          return value;
        },
        set(next) {
          value = next;
        },
        enumerable: true,
        configurable: true
      });
    }
    return card;
  };

  const root = countGeometry({ id: "root", x: 0, y: 0, width: 200, height: 80 });
  const mainTopic = countGeometry({ id: "main", x: 320, y: 0, width: 160, height: 60 });
  cards.push(root, mainTopic);
  const mainChildren = [{ canvasNode: mainTopic, children: [], parent: null }];

  let level = [mainChildren[0]];
  let placed = 0;
  while (placed < topicCount && level.length > 0) {
    const next = [];
    const yCursor = new Map();
    for (const tree of level) {
      if (placed >= topicCount) break;
      const depth = level.indexOf(tree) + 1;
      for (let slot = 0; slot < branchWidth && placed < topicCount; slot++) {
        const column = yCursor.get(tree) || 0;
        yCursor.set(tree, column + 1);
        const card = countGeometry({
          id: `${tree.canvasNode.id}-${placed}`,
          x: 320 + depth * 240,
          y: column * 80 - (branchWidth * 40),
          width: 160,
          height: 60
        });
        cards.push(card);
        const child = { canvasNode: card, children: [], parent: tree };
        tree.children.push(child);
        next.push(child);
        placed += 1;
      }
    }
    level = next;
  }

  const dragged = countGeometry({ id: "dragged", x: 520, y: 0, width: 160, height: 60 });
  cards.push(dragged);
  const forest = [
    { canvasNode: root, children: mainChildren, parent: null }
  ];
  const canvas = {
    nodes: new Map(cards.map((card) => [card.id, card])),
    requestFrame() {}
  };
  const activeEdges = [];
  let edgeCounter = 0;
  const canvasApi = {
    createEdge(_canvas, from, to, fromSide = "right", toSide = "left", color, options = {}) {
      const edge = {
        id: options.id || `edge-${++edgeCounter}`,
        from: { node: from, side: fromSide, end: options.fromEnd || "none" },
        to: { node: to, side: toSide, end: options.toEnd || "arrow" },
        color,
        label: options.label,
        lineType: "curved",
        curvature: 0.35,
        render() { counts.renders += 1; }
      };
      activeEdges.push(edge);
      return edge;
    },
    getIncomingEdges(_canvas, node) {
      return activeEdges.filter((edge) => edge.to.node.id === node.id);
    },
    removeEdge(_canvas, edge) {
      const index = activeEdges.indexOf(edge);
      if (index >= 0) activeEdges.splice(index, 1);
    }
  };
  const controller = createDragAttachmentController(
    canvas,
    canvasApi,
    () => {
      counts.forestScans += 1;
      return forest;
    },
    (node) => (node.id === "dragged" ? root : node)
  );

  return { activeEdges, canvas, canvasApi, controller, counts, dragged, forest, root, topicCount };
}

test("one drag frame over 5,000 topics reads a linear amount of geometry", () => {
  const fixture = largeMapFixture({ topicCount: 5000 });
  fixture.controller.begin(fixture.dragged);
  fixture.counts.geometryReads = 0;
  fixture.counts.forestScans = 0;

  const preview = fixture.controller.updatePreview(fixture.dragged);

  assert.equal(preview.state, "preview");
  assert.equal(fixture.counts.forestScans, 0);
  assert.ok(
    fixture.counts.geometryReads <= fixture.topicCount * 40,
    `one frame read ${fixture.counts.geometryReads} geometry values for ${fixture.topicCount} topics`
  );
});

test("renders the preview arrow during the drag frame", () => {
  const fixture = largeMapFixture({ topicCount: 8 });
  fixture.controller.begin(fixture.dragged);
  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.ok(fixture.counts.renders > 0, "preview edge was not rendered");
});

test("a whole 5,000-topic drag acquires the forest only once", () => {
  const fixture = largeMapFixture({ topicCount: 5000 });

  fixture.controller.begin(fixture.dragged);
  for (let frame = 0; frame < 10; frame++) {
    fixture.dragged.x += 4;
    fixture.controller.updatePreview(fixture.dragged);
  }

  assert.equal(
    fixture.counts.forestScans,
    1,
    `a 10-frame drag acquired the forest ${fixture.counts.forestScans} times`
  );
});

test("the indexed drag picks the same attachment target as a full search", () => {
  let attached = 0;
  let detached = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { controller, dragged, forest } = randomDragFixture(seed);
    const expected = referenceAttachmentTarget(dragged, forest);
    controller.begin(dragged);
    const preview = controller.updatePreview(dragged);
    if (expected) attached += 1;
    else detached += 1;
    assert.equal(
      preview.state,
      expected ? "preview" : "detached",
      `seed ${seed}: ${preview.state} instead of ${expected ? "preview" : "detached"}`
    );
    assert.equal(
      preview.target?.id ?? null,
      expected?.id ?? null,
      `seed ${seed}: arrow pointed at ${preview.target?.id ?? null}`
    );
  }
  assert.ok(attached > 20, `only ${attached} of 200 random drags attached`);
  assert.ok(detached > 20, `only ${detached} of 200 random drags detached`);
});

function pointerEvent({ button = 0, on = [], node = null } = {}) {
  return {
    button,
    node,
    target: {
      closest(selector) {
        const named = selector
          .split(",")
          .map((part) => part.trim().replace(/^\./, ""));
        return on.some((name) => named.includes(name)) ? { on } : null;
      }
    }
  };
}

test("only the primary button on a plain topic card is a drag the plugin owns", () => {
  const topic = { id: "topic" };
  const group = { id: "group" };
  const context = {
    isEnabled: () => true,
    findNode: (event) => event.node,
    isGroupNode: (node) => node.id === "group"
  };

  assert.equal(isPrimaryCardGesture(pointerEvent({ node: topic }), context), topic);
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ button: 2, node: topic }), context),
    null,
    "the right button belongs to Canvas"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ button: 1, node: topic }), context),
    null,
    "the middle button belongs to Canvas"
  );
  assert.equal(
    isPrimaryCardGesture(
      pointerEvent({ on: ["canvas-node-connection-point"], node: topic }),
      context
    ),
    null,
    "a connection point starts a Canvas edge, not a card drag"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ on: ["canvas-node-resizer"], node: topic }), context),
    null,
    "a resizer starts a resize, not a card drag"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ on: ["canvas-node-resize-handle"], node: topic }), context),
    null,
    "a resize handle starts a resize, not a card drag"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ node: { ...topic, isEditing: true } }), context),
    null,
    "an active topic editor owns the pointer"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ node: group }), context),
    null,
    "group dragging has its own owner"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ node: null }), context),
    null,
    "empty Canvas space is not a card"
  );
  assert.equal(
    isPrimaryCardGesture(pointerEvent({ node: topic }), { ...context, isEnabled: () => false }),
    null,
    "an ordinary Canvas file owns nothing"
  );
  assert.equal(isPrimaryCardGesture(null, context), null);
});

test("nested connection control targets are not claimed as topic drags", () => {
  const topic = { id: "topic" };
  const target = {
    closest: () => null,
    parentElement: {
      classList: {
        contains: (name) => name === "canvas-node-connection-point"
      }
    }
  };
  assert.equal(
    isPrimaryCardGesture(
      { button: 0, target },
      {
        isEnabled: () => true,
        findNode: () => topic,
        isGroupNode: () => false
      }
    ),
    null
  );
});

test("one terminal finish commits once and ignores every later call", () => {
  const fixture = dragFixture();
  fixture.newParent.x = 260;
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 260;
  fixture.controller.updatePreview(fixture.dragged);

  const committed = fixture.controller.finish("commit", fixture.dragged);
  const repeated = fixture.controller.finish("commit", fixture.dragged);
  fixture.controller.cancel();
  fixture.controller.finish("cancel");

  assert.equal(committed.state, "attached");
  assert.equal(committed.changed, true);
  assert.deepEqual(repeated, committed);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "new");
  assert.equal(fixture.activeEdges[0].id, "link-1");
  assert.equal(
    fixture.newParent.classes.size,
    0,
    "a committed drag leaves the attachment highlight behind"
  );
});

test("every non-commit terminal reason leaves the permanent map untouched", () => {
  for (const reason of [
    "cancel",
    "lost-capture",
    "blur",
    "release-outside",
    "mode-disabled",
    "teardown"
  ]) {
    const fixture = dragFixture();
    fixture.newParent.x = 260;
    fixture.controller.begin(fixture.dragged);
    fixture.dragged.x = 260;
    fixture.controller.updatePreview(fixture.dragged);

    const result = fixture.controller.finish(reason, fixture.dragged);

    assert.equal(result.changed, false, reason);
    assert.equal(result.state, "cancelled", reason);
    assert.equal(result.reason, reason, reason);
    assert.equal(fixture.activeEdges.length, 1, reason);
    assert.equal(fixture.activeEdges[0].id, "link-1", reason);
    assert.equal(fixture.activeEdges[0].from.node.id, "old", reason);
    assert.equal(fixture.activeEdges[0].to.node.id, "dragged", reason);
    assert.equal(
      fixture.activeEdges[0].__mindMapPreview,
      undefined,
      `${reason} left a preview link behind`
    );
    assert.equal(
      fixture.newParent.classes.size,
      0,
      `${reason} left the attachment highlight on the card`
    );
  }
});

test("a drag that ends before its first frame still finishes once", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;

  const result = fixture.controller.finish("commit", fixture.dragged);

  assert.equal(result.state, "original");
  assert.equal(result.changed, false);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
  assert.equal(fixture.activeEdges[0].id, "link-1");
});

test("a surplus parent link is repaired without losing the kept link", () => {
  const fixture = dragFixture();
  fixture.canvasApi.createEdge(
    fixture.canvas,
    fixture.otherParent,
    fixture.dragged,
    "left",
    "right",
    "#999999",
    { id: "link-2", label: "also" }
  );
  fixture.controller.begin(fixture.dragged);

  const result = fixture.controller.commit(fixture.dragged);

  assert.equal(result.state, "original");
  assert.equal(result.changed, true);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].id, "link-1");
  assert.equal(fixture.activeEdges[0].label, "depends on");
  assert.equal(fixture.activeEdges[0].color, "#4c8bf5");
  assert.equal(fixture.activeEdges[0].curvature, 0.8);
});

test("duplicate links from the same parent are repaired and reported as changed", () => {
  const fixture = dragFixture();
  fixture.canvasApi.createEdge(
    fixture.canvas,
    fixture.oldParent,
    fixture.dragged,
    "right",
    "left",
    "#999999",
    { id: "link-2", label: "duplicate" }
  );
  fixture.controller.begin(fixture.dragged);

  const result = fixture.controller.commit(fixture.dragged);

  assert.equal(result.changed, true);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].id, "link-1");
});

/**
 * A card whose plugin-owned CSS classes can be observed, so a test can prove
 * that no terminal path leaves presentation behind.
 */
function cardWithClasses(node) {
  const classes = new Set();
  node.classes = classes;
  node.nodeEl = {
    addClass: (name) => classes.add(name),
    removeClass: (name) => classes.delete(name)
  };
  return node;
}

function dragFixture({ withOriginalParent = true } = {}) {
  const oldParent = cardWithClasses({ id: "old", x: 0, y: 0, width: 100, height: 60 });
  const newParent = cardWithClasses({ id: "new", x: 500, y: 0, width: 100, height: 60 });
  const otherParent = cardWithClasses({ id: "other", x: 900, y: 0, width: 100, height: 60 });
  const dragged = cardWithClasses({ id: "dragged", x: 150, y: 0, width: 100, height: 60 });
  const nodes = [oldParent, newParent, otherParent, dragged];
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    requestFrame() {}
  };
  const activeEdges = [];
  let edgeCounter = 0;
  const canvasApi = {
    createEdge(
      _canvas,
      from,
      to,
      fromSide = "right",
      toSide = "left",
      color,
      options = {}
    ) {
      const edge = {
        id: options.id || `edge-${++edgeCounter}`,
        from: { node: from, side: fromSide, end: options.fromEnd || "none" },
        to: { node: to, side: toSide, end: options.toEnd || "arrow" },
        color,
        label: options.label,
        lineType: "curved",
        curvature: 0.35,
        render() {},
        lineGroupEl: { style: {} },
        lineEndGroupEl: { style: {} },
        el: { style: {} },
        edgeEl: { style: {} }
      };
      activeEdges.push(edge);
      return edge;
    },
    getIncomingEdges(_canvas, node) {
      return activeEdges.filter((edge) => edge.to.node.id === node.id);
    },
    removeEdge(_canvas, edge) {
      const index = activeEdges.indexOf(edge);
      if (index >= 0) activeEdges.splice(index, 1);
    }
  };
  if (withOriginalParent) {
    const original = canvasApi.createEdge(
      canvas,
      oldParent,
      dragged,
      "right",
      "left",
      "#4c8bf5",
      { id: "link-1", label: "depends on" }
    );
    original.curvature = 0.8;
  }
  const forest = [
    {
      canvasNode: oldParent,
      children: withOriginalParent
        ? [{ canvasNode: dragged, children: [], parent: null }]
        : []
    },
    { canvasNode: newParent, children: [] },
    { canvasNode: otherParent, children: [] }
  ];
  if (withOriginalParent)
    forest[0].children[0].parent = forest[0];
  else
    forest.push({ canvasNode: dragged, children: [] });
  const controller = createDragAttachmentController(
    canvas,
    canvasApi,
    () => forest,
    (node) => node.id === "dragged" && withOriginalParent ? oldParent : node
  );
  return {
    activeEdges,
    canvas,
    canvasApi,
    controller,
    dragged,
    newParent,
    oldParent,
    otherParent
  };
}

test("rebuilds even the old-parent arrow from current drag geometry", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x += 12;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "old");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture)[0].from.node.id, "old");

  fixture.controller.cancel();
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
});

test("switches immediately when a different node is the closest candidate", () => {
  const fixture = dragFixture();
  fixture.newParent.x = 260;
  fixture.controller.begin(fixture.dragged);

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(preview.incomingSide, "right");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);
  assert.ok(fixture.activeEdges.some((edge) => edge.from.node.id === "new" && edge.__mindMapPreview));
});

test("switches the visible arrow between prospective parents and commits only one", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);

  fixture.dragged.x = 390;
  let preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);
  assert.ok(fixture.activeEdges.some((edge) => edge.from.node.id === "new" && edge.__mindMapPreview));

  fixture.dragged.x = 790;
  preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.target.id, "other");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);
  assert.ok(fixture.activeEdges.some((edge) => edge.from.node.id === "other" && edge.__mindMapPreview));

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(result.state, "attached");
  assert.equal(result.incomingSide, "right");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "other");
  assert.equal(fixture.activeEdges[0].__mindMapPreview, undefined);
});

test("detaches beyond the fixed nearest-node distance", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 1400;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "detached");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(result.state, "detached");
  assert.equal(fixture.activeEdges.length, 0);
});

test("keeps its parent when dragged across it to flip branch sides", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = -180;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "old");
  assert.equal(preview.incomingSide, "right");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.state, "attached");
  assert.equal(result.changed, true);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
  assert.equal(fixture.activeEdges[0].to.side, "right");
});

test("previews and attaches a standalone node moved inside the fixed distance", () => {
  const fixture = dragFixture({ withOriginalParent: false });
  fixture.dragged.x = 390;
  fixture.controller.begin(fixture.dragged);

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(fixture.activeEdges.length, 1);

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "new");
});

test("cancels a stale preview when topology changes before commit", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.target.id, "new");
  fixture.canvas.nodes.delete("new");

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, false);
  assert.equal(result.state, "original");
  assert.equal(fixture.activeEdges.some((edge) => edge.from.node.id === "old"), true);
});

test("restores the original arrow if preview edge creation fails", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  fixture.canvasApi.createEdge = () => undefined;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "original");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
  assert.equal(fixture.controller.commit(fixture.dragged).changed, false);
});

test("keeps the original link when preview edge creation throws", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  fixture.canvasApi.createEdge = () => {
    throw new Error("preview unavailable");
  };

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "original");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
  assert.equal(fixture.controller.commit(fixture.dragged).changed, false);
});

test("a floating card the drag sits on wins over a large map's buffer", () => {
  const fixture = dragFixture({ withOriginalParent: false });
  const mainRoot = { id: "main-root", x: 500, y: 0, width: 100, height: 60 };
  const mainLeaf = { id: "main-leaf", x: 760, y: 0, width: 100, height: 60 };
  const mainLeaf2 = { id: "main-leaf-2", x: 760, y: 100, width: 100, height: 60 };
  const floatingRoot = { id: "floating", x: 405, y: 0, width: 100, height: 60 };
  fixture.dragged.x = 350;
  fixture.canvas.nodes = new Map(
    [mainRoot, mainLeaf, mainLeaf2, floatingRoot, fixture.dragged]
      .map((node) => [node.id, node])
  );
  const forest = [
    {
      canvasNode: mainRoot,
      children: [
        { canvasNode: mainLeaf, children: [] },
        { canvasNode: mainLeaf2, children: [] }
      ]
    },
    { canvasNode: floatingRoot, children: [] },
    { canvasNode: fixture.dragged, children: [] }
  ];
  const controller = createDragAttachmentController(
    fixture.canvas,
    fixture.canvasApi,
    () => forest,
    (node) => node.id === mainRoot.id || node.id.startsWith("main-")
      ? mainRoot
      : node
  );
  controller.begin(fixture.dragged);
  const preview = controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "floating");
});

test("cancelling leaves the authored branch link exactly as it was", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  fixture.controller.updatePreview(fixture.dragged);

  fixture.controller.cancel();

  assert.equal(fixture.activeEdges.length, 1);
  const link = fixture.activeEdges[0];
  assert.equal(link.id, "link-1");
  assert.equal(link.label, "depends on");
  assert.equal(link.from.node.id, "old");
  assert.equal(link.from.side, "right");
  assert.equal(link.from.end, "none");
  assert.equal(link.to.node.id, "dragged");
  assert.equal(link.to.side, "left");
  assert.equal(link.to.end, "arrow");
  assert.equal(link.color, "#4c8bf5");
  assert.equal(link.curvature, 0.8);
  assert.equal(link.__mindMapPreview, undefined);
});

test("cancelling after a full-map teardown leaves the authored link record untouched", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  fixture.controller.updatePreview(fixture.dragged);
  // The Canvas wrapper is gone, so the drag has no live target any more.
  fixture.canvas.nodes = new Map();

  fixture.controller.cancel();

  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 0);
  assert.equal(fixture.activeEdges[0].id, "link-1");
});

test("flips the preview arrow when the drag crosses its parent", () => {
  const fixture = dragFixture();
  fixture.oldParent.x = 500;
  fixture.dragged.x = 700;
  fixture.newParent.x = 5000;
  fixture.otherParent.x = 9000;
  fixture.controller.begin(fixture.dragged);

  let preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.target.id, "old");
  assert.equal(preview.incomingSide, "left");

  fixture.dragged.x = 300;
  preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "old");
  assert.equal(preview.incomingSide, "right");
  assert.equal(permanentEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture).length, 1);
  assert.equal(previewEdges(fixture)[0].from.side, "left");
  assert.equal(previewEdges(fixture)[0].to.side, "right");
});

test("excludes candidate cards specified via options.excludedIds during multi-card drag preview", () => {
  const fixture = dragFixture();
  fixture.newParent.x = 260;
  fixture.controller.begin(fixture.dragged, {
    excludedIds: new Set([fixture.newParent.id])
  });
  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.notEqual(preview.target?.id, fixture.newParent.id);
  assert.equal(preview.target?.id, fixture.oldParent.id);
});

test("hides original incoming edge lineGroupEl and lineEndGroupEl during preview and restores on cancel", () => {
  const fixture = dragFixture({ withOriginalParent: true });
  const originalEdge = fixture.canvasApi.getIncomingEdges(null, fixture.dragged)[0];
  fixture.newParent.x = 260;
  fixture.newParent.y = 80;
  fixture.controller.begin(fixture.dragged);
  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target?.id, fixture.newParent.id);
  assert.equal(originalEdge.lineGroupEl.style.display, "none");
  assert.equal(originalEdge.lineEndGroupEl.style.display, "none");

  fixture.controller.finish("cancel", fixture.dragged);
  assert.equal(originalEdge.lineGroupEl.style.display, "");
  assert.equal(originalEdge.lineEndGroupEl.style.display, "");
});

test("dragging beyond ATTACHMENT_DISTANCE automatically disconnects and keeps original edges hidden", () => {
  const fixture = dragFixture({ withOriginalParent: true });
  const originalEdge = fixture.canvasApi.getIncomingEdges(null, fixture.dragged)[0];
  fixture.controller.begin(fixture.dragged);

  // Position within attachment distance
  fixture.dragged.x = fixture.oldParent.x + fixture.oldParent.width + 50;
  let preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(originalEdge.lineGroupEl.style.display, "none");

  // Move beyond ATTACHMENT_DISTANCE (180px) from all cards
  fixture.dragged.x = 2000;
  preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "detached");
  assert.equal(preview.target, null);
  // Original edge MUST remain hidden during detached drag
  assert.equal(originalEdge.lineGroupEl.style.display, "none");

  // Committing while detached permanently removes incoming edges
  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.state, "detached");
  assert.equal(fixture.activeEdges.length, 0);
});

test("cancelling a detached drag restores the original edge", () => {
  const fixture = dragFixture({ withOriginalParent: true });
  const originalEdge = fixture.canvasApi.getIncomingEdges(null, fixture.dragged)[0];
  fixture.controller.begin(fixture.dragged);

  fixture.dragged.x = 2000;
  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "detached");
  assert.equal(originalEdge.lineGroupEl.style.display, "none");

  fixture.controller.finish("cancel", fixture.dragged);
  assert.equal(originalEdge.lineGroupEl.style.display, "");
  assert.equal(fixture.activeEdges.length, 1);
});

