"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CARD_LAYOUT_VERSION,
  LiveSizingController,
  embeddedContentFloor,
  isResizableCanvasNode
} = require("../lib/live-sizing.js");
const { DEFAULT_SETTINGS } = require("../lib/settings.js");

test("gives PDF viewers a readable document-sized viewport", () => {
  for (const markdown of [
    "![[All Slides.pdf]]",
    "![](documents/slides.pdf#page=3)",
    '<object data="documents/slides.pdf"></object>'
  ]) {
    const floor = embeddedContentFloor(markdown, DEFAULT_SETTINGS);
    assert.equal(floor.kind, "document");
    assert.ok(floor.width >= 640);
    assert.ok(floor.height >= 480);
  }
});

test("uses smaller, content-appropriate floors for other media", () => {
  assert.deepEqual(
    embeddedContentFloor("A compact text topic", DEFAULT_SETTINGS),
    { kind: "text", width: DEFAULT_SETTINGS.minNodeWidth, height: 0 }
  );
  assert.equal(embeddedContentFloor("![[photo.png]]", DEFAULT_SETTINGS).kind, "image");
  assert.equal(embeddedContentFloor("![[clip.mp4]]", DEFAULT_SETTINGS).kind, "video");
  assert.equal(embeddedContentFloor("![[interview.mp3]]", DEFAULT_SETTINGS).kind, "audio");
});

test("only plain text cards have manual resizing blocked", () => {
  assert.equal(isResizableCanvasNode({ id: "text", text: "Plain topic" }), false);
  assert.equal(isResizableCanvasNode({ id: "embed", text: "![[Documents/Guide.pdf]]" }), true);
  assert.equal(
    isResizableCanvasNode({ id: "file", type: "file", file: "Documents/Guide.pdf" }),
    true
  );
  assert.equal(
    isResizableCanvasNode({ id: "link", type: "link", url: "https://example.com/image.png" }),
    true
  );
});

test("respects configured maximum dimensions", () => {
  const floor = embeddedContentFloor("![[slides.pdf]]", {
    ...DEFAULT_SETTINGS,
    maxNodeWidth: 500,
    maxNodeHeight: 300
  });
  assert.deepEqual(floor, { kind: "document", width: 500, height: 300 });
});

test("live estimates carry the PDF height floor through both sizing passes", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const estimate = controller.estimate("![[All Slides.pdf]]");

  assert.ok(estimate.width >= 640);
  assert.ok(estimate.height >= 480);
  assert.equal(estimate.floorHeight, 480);
  assert.ok(CARD_LAYOUT_VERSION >= 38);
});

test("cleans a preview observer when its Canvas node is replaced", () => {
  const OriginalMutationObserver = global.MutationObserver;
  const observers = [];
  class TestMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    observe() {}
    disconnect() {
      this.disconnected = true;
    }
    trigger() {
      this.callback([], this);
    }
  }
  const contentEl = { querySelector: () => null };
  const node = { id: "topic-a", isEditing: false, contentEl };
  const replacement = { id: "topic-a", isEditing: false, contentEl: { querySelector: () => null } };
  const canvas = { nodes: new Map([[node.id, node]]) };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    interceptedCanvas: canvas,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {}
  };
  try {
    global.MutationObserver = TestMutationObserver;
    const controller = new LiveSizingController(plugin, () => new Set());
    controller.waitForPreview(node, () => assert.fail('replaced node must not settle'));
    assert.equal(observers.length, 1);
    canvas.nodes.set(node.id, replacement);
    observers[0].trigger();
    assert.equal(observers[0].disconnected, true);
    assert.equal(plugin.pendingObservers.has(observers[0]), false);
  } finally {
    global.MutationObserver = OriginalMutationObserver;
  }
});

test("reports settled only after the final layout pass", async () => {
  const calls = [];
  const plugin = {
    settings: DEFAULT_SETTINGS,
    layoutEngine: { layout: () => calls.push("layout") },
    updateGroupBounds: () => calls.push("groups")
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const data = {};
  const canvas = {
    getData: () => data,
    setData: () => {},
    requestSave: () => calls.push("save")
  };

  const result = controller.resizeNodesWhenRendered(canvas, [], () => calls.push("settled"));

  assert.deepEqual(calls, ["save", "layout", "groups", "settled"]);
  assert.equal((await result).status, "measured");
});

test("horizontal growth comes from rendered overflow", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const table = { clientWidth: 240, scrollWidth: 413 };
  const root = {
    clientWidth: 260,
    scrollWidth: 260,
    querySelectorAll: () => [table]
  };

  assert.equal(controller.measureHorizontalOverflow(root), 173);
});

test("live iframe previews receive the clone geometry", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const declarations = new Map();
  const previewDeclarations = new Map();
  const sizer = {
    style: { setProperty: (name, value) => declarations.set(name, value) },
    firstElementChild: null,
    lastElementChild: null,
    closest: () => ({
      style: { setProperty: (name, value) => previewDeclarations.set(name, value) }
    }),
    querySelectorAll: () => []
  };

  controller.applyPreviewGeometry(sizer);

  assert.equal(declarations.get("padding"), "var(--size-4-1)");
  assert.equal(declarations.get("box-sizing"), "border-box");
  assert.equal(previewDeclarations.get("overflow"), "clip");
});

test("intrinsic height uses the complete rendered border box", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );

  assert.equal(
    controller.measureIntrinsicHeight({
      getBoundingClientRect: () => ({ height: 681.25 })
    }),
    682
  );
});

test("intrinsic width uses the unwrapped rendered border box", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );

  assert.equal(
    controller.measureIntrinsicWidth({
      getBoundingClientRect: () => ({ width: 117.2 })
    }),
    118
  );
});

test("prefers horizontal cards over narrow multi-line columns", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );

  const shortPhrase = controller.estimate("Neon Farben (Haut)");
  const longerPhrase = controller.estimate(
    "2€ für getränke, 1.50 für Softdrinks"
  );

  assert.ok(shortPhrase.width > shortPhrase.height);
  assert.ok(shortPhrase.height <= 72);
  assert.ok(longerPhrase.width > longerPhrase.height);
  assert.ok(longerPhrase.height <= 72);
});

test("keeps ordinary short labels on one compact horizontal line", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );

  assert.ok(controller.estimate("(Mahsa)").width >= 110);
  assert.ok(controller.estimate("1 Schicht").width >= 120);
  assert.ok(controller.estimate("EWH Meeting").width >= 140);
  assert.ok(controller.estimate("5").width < 100);
});

test("wraps long labels when that materially reduces total card area", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const result = controller.estimate("EWH Party T1 am 9ten Oktobeer");

  assert.ok(result.width < 300);
  assert.ok(result.height <= 72);
});

test("bounds fallback measurement for adversarially many short words", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const text = "a ".repeat(150000).trim();

  const width = controller.measurePlainTextWidth(text);

  assert.ok(Number.isFinite(width));
  assert.ok(width <= DEFAULT_SETTINGS.maxNodeWidth);
});

test("empty text cards retain one rendered line plus their live insets", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const sizer = {
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          fontSize: "18px",
          lineHeight: "27px",
          paddingTop: "4px",
          paddingBottom: "6px"
        })
      }
    }
  };

  assert.equal(controller.minimumTextHeight(sizer), 37);
});

test("live vertical growth equals the actual clipped overflow", () => {
  const controller = new LiveSizingController(
    { settings: DEFAULT_SETTINGS },
    () => new Set()
  );
  const preview = { clientHeight: 180, scrollHeight: 287 };
  const sizer = { closest: () => preview };

  assert.equal(controller.measureLiveVerticalOverflow({}, sizer), 107);
});

test("keeps exact sizing sessions independent for simultaneous Canvases", async () => {
  const deferred = new Map();
  const layouts = [];
  const data = new Map();
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: (canvas) => new Promise((resolve) => {
      deferred.set(canvas.id, resolve);
    }),
    layoutEngine: { layout: (canvas) => layouts.push(canvas.id) },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const makeCanvas = (id, nodeId) => {
    const node = {
      id: nodeId,
      text: `![[${nodeId}.png]]`,
      width: 360,
      height: 220
    };
    const canvas = {
      id,
      nodes: new Map([[node.id, node]]),
      getData: () => data.get(id) || {},
      setData: (value) => data.set(id, value),
      requestSave: () => {}
    };
    node.moveAndResize = ({ width, height }) => {
      node.width = width;
      node.height = height;
    };
    return { canvas, node };
  };
  const first = makeCanvas("canvas-a", "topic-a");
  const second = makeCanvas("canvas-b", "topic-b");

  const firstSizing = controller.resizeNodesWhenRendered(first.canvas, [first.node]);
  const secondSizing = controller.resizeNodesWhenRendered(second.canvas, [second.node]);

  assert.equal(typeof firstSizing.then, "function");
  assert.equal(typeof secondSizing.then, "function");
  deferred.get("canvas-b")(new Map([["topic-b", { width: 400, height: 240 }]]));
  deferred.get("canvas-a")(new Map([["topic-a", { width: 380, height: 230 }]]));

  const results = await Promise.all([firstSizing, secondSizing]);
  assert.deepEqual(results.map((result) => result.status), ["measured", "measured"]);
  assert.deepEqual(layouts.sort(), ["canvas-a", "canvas-b"]);
});

test("keeps a topic pending when it starts editing before measurement applies", async () => {
  let resolveMeasurement;
  const data = {
    mindmapLayoutVersion: 37,
    mindmapPendingResize: ["topic-a"]
  };
  const node = {
    id: "topic-a",
    text: "![[photo.png]]",
    width: 360,
    height: 220,
    isEditing: false,
    moveAndResize() {}
  };
  const canvas = {
    id: "canvas-a",
    nodes: new Map([[node.id, node]]),
    getData: () => data,
    setData(value) {
      Object.assign(data, value);
      if (!("mindmapPendingResize" in value)) delete data.mindmapPendingResize;
    },
    requestSave() {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: () => new Promise((resolve) => {
      resolveMeasurement = resolve;
    }),
    layoutEngine: { layout() {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const sizing = controller.resizeNodesWhenRendered(canvas, [node]);
  node.isEditing = true;
  resolveMeasurement(new Map([["topic-a", { width: 400, height: 240 }]]));

  const result = await sizing;
  assert.equal(result.status, "unavailable");
  assert.deepEqual(data.mindmapPendingResize, ["topic-a"]);
  assert.notEqual(data.mindmapLayoutVersion, CARD_LAYOUT_VERSION);
});

test("does not apply stale measurements when sync replaces a same-ID card", async () => {
  let resolveMeasurement;
  const data = {
    mindmapLayoutVersion: 37,
    mindmapPendingResize: ["topic-a"]
  };
  const original = {
    id: "topic-a",
    text: "Original",
    width: 360,
    height: 220,
    moveAndResize() {}
  };
  const canvas = {
    id: "canvas-a",
    nodes: new Map([[original.id, original]]),
    getData: () => data,
    setData(value) {
      Object.assign(data, value);
      if (!("mindmapPendingResize" in value)) delete data.mindmapPendingResize;
    },
    requestSave() {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: () => new Promise((resolve) => {
      resolveMeasurement = resolve;
    }),
    layoutEngine: { layout() {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const sizing = controller.resizeNodesWhenRendered(canvas, [original]);
  const replacement = {
    id: original.id,
    text: "Replacement",
    width: 111,
    height: 222,
    moveAndResize() {
      throw new Error("stale measurement applied");
    }
  };
  canvas.nodes.set(original.id, replacement);
  resolveMeasurement(new Map([[original.id, { width: 400, height: 240 }]]));

  const result = await sizing;
  assert.equal(result.status, "unavailable");
  assert.deepEqual(data.mindmapPendingResize, ["topic-a"]);
  assert.equal(replacement.width, 111);
  assert.equal(replacement.height, 222);
});

test("keeps exact sizing pending when measurement is unavailable", async () => {
  const data = {
    mindmapLayoutVersion: 37,
    mindmapPendingResize: ["topic-a"]
  };
  const layouts = [];
  let settled = 0;
  let saves = 0;
  const node = {
    id: "topic-a",
    text: "![[photo.png]]",
    width: 360,
    height: 220
  };
  const canvas = {
    id: "canvas-a",
    nodes: new Map([[node.id, node]]),
    getData: () => data,
    setData: () => {},
    requestSave: () => saves++
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: async () => new Map(),
    layoutEngine: { layout: (target) => layouts.push(target.id) },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());

  const result = await controller.resizeNodesWhenRendered(
    canvas,
    [node],
    () => settled++
  );

  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.measurements, new Map());
  assert.deepEqual(data.mindmapPendingResize, ["topic-a"]);
  assert.equal(data.mindmapLayoutVersion, 37);
  assert.deepEqual(layouts, []);
  assert.equal(settled, 0);
  assert.equal(saves, 0);
});

test("rejects a non-numeric exact sizing result as unavailable", async () => {
  const data = {
    mindmapLayoutVersion: 37,
    mindmapPendingResize: ["topic-a"]
  };
  const node = {
    id: "topic-a",
    text: "Plain topic",
    width: 240,
    height: 60
  };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    getData: () => data,
    setData: () => {},
    requestSave: () => {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: async () => new Map([
      ["topic-a", { width: "400", height: null }]
    ]),
    layoutEngine: { layout: () => {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());

  const result = await controller.resizeNodesWhenRendered(canvas, [node]);

  assert.equal(result.status, "unavailable");
  assert.deepEqual(data.mindmapPendingResize, ["topic-a"]);
  assert.equal(data.mindmapLayoutVersion, 37);
  assert.deepEqual({ width: node.width, height: node.height }, { width: 240, height: 60 });
});

test("keeps unmeasured topics pending in a partial exact sizing batch", async () => {
  const data = {
    mindmapLayoutVersion: 37,
    mindmapPendingResize: ["topic-a", "topic-b"]
  };
  const makeNode = (id) => ({
    id,
    text: `![[${id}.png]]`,
    width: 360,
    height: 220,
    moveAndResize({ width, height }) {
      this.width = width;
      this.height = height;
    }
  });
  const first = makeNode("topic-a");
  const second = makeNode("topic-b");
  const canvas = {
    nodes: new Map([[first.id, first], [second.id, second]]),
    getData: () => data,
    setData: () => {},
    requestSave: () => {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: async () => new Map([
      ["topic-a", { width: 400, height: 240 }]
    ]),
    layoutEngine: { layout: () => {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());

  const result = await controller.resizeNodesWhenRendered(canvas, [first, second]);

  assert.equal(result.status, "measured");
  assert.deepEqual(Array.from(result.measurements.keys()), ["topic-a"]);
  assert.deepEqual(data.mindmapPendingResize, ["topic-b"]);
  assert.equal(data.mindmapLayoutVersion, 37);
});

test("reports a synchronous measurement failure as unavailable", async () => {
  const node = { id: "topic-a", text: "Plain topic", width: 240, height: 60 };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    getData: () => ({}),
    setData: () => {},
    requestSave: () => {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: () => {
      throw new Error("renderer failed");
    },
    layoutEngine: { layout: () => {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const originalError = console.error;
  let sizing = null;
  try {
    console.error = () => {};
    assert.doesNotThrow(() => {
      sizing = controller.resizeNodesWhenRendered(canvas, [node]);
    });
    assert.equal((await sizing).status, "unavailable");
  } finally {
    console.error = originalError;
  }
});

test("cancels an exact sizing result when its Canvas context becomes inactive", async () => {
  let resolveMeasurement = null;
  let active = true;
  const node = { id: "topic-a", text: "Plain topic", width: 240, height: 60 };
  const canvas = {
    nodes: new Map([[node.id, node]]),
    getData: () => ({}),
    setData: () => {},
    requestSave: () => {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => active,
    measureMarkdownNodesOffscreen: () => new Promise((resolve) => {
      resolveMeasurement = resolve;
    }),
    layoutEngine: { layout: () => assert.fail("inactive Canvas must not lay out") },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());
  const sizing = controller.resizeNodesWhenRendered(canvas, [node]);
  active = false;
  resolveMeasurement(new Map([["topic-a", { width: 300, height: 70 }]]));

  assert.equal((await sizing).status, "cancelled");
});

test("measures a background Canvas topic with that Canvas group context", () => {
  const text = "A deliberately long background Canvas topic label that must be measured";
  const topic = { id: "shared-id", text, width: 180, height: 40, x: 0, y: 0 };
  topic.moveAndResize = ({ x, y, width, height }) => {
    Object.assign(topic, { x, y, width, height });
  };
  const background = {
    id: "background",
    nodes: new Map([[topic.id, topic]]),
    requestSave: () => {}
  };
  const active = {
    id: "active",
    nodes: new Map([[topic.id, { id: topic.id, type: "group" }]])
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    interceptedCanvas: active,
    trackedTimeout: () => {}
  };
  const groupIds = new Map([
    [active, new Set([topic.id])],
    [background, new Set()]
  ]);
  const controller = new LiveSizingController(
    plugin,
    (canvas) => groupIds.get(canvas) || new Set()
  );

  controller.resizeNodes(background, [topic]);

  assert.ok(topic.width > 180);
});

test("keeps explicit Canvas context inside an exact measurement batch", async () => {
  const topic = {
    id: "shared-id",
    text: "A long topic in a background Canvas that needs an exact measurement pass",
    width: 180,
    height: 40,
    x: 0,
    y: 0,
    moveAndResize({ x, y, width, height }) {
      Object.assign(this, { x, y, width, height });
    }
  };
  const background = {
    id: "background",
    nodes: new Map([[topic.id, topic]]),
    getData: () => ({}),
    setData: () => {},
    requestSave: () => {}
  };
  const active = {
    id: "active",
    nodes: new Map([[topic.id, { id: topic.id, type: "group" }]])
  };
  let controller = null;
  const groupIds = new Map([
    [active, new Set([topic.id])],
    [background, new Set()]
  ]);
  const plugin = {
    settings: DEFAULT_SETTINGS,
    interceptedCanvas: active,
    pendingObservers: new Set(),
    pendingRafs: new Set(),
    pendingTimers: new Set(),
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: async (canvas, nodes) => {
      const target = controller.measure(nodes[0]);
      return new Map([[nodes[0].id, target]]);
    },
    layoutEngine: { layout: () => {} },
    trackedRaf: (callback) => callback(),
    trackedTimeout: () => {},
    updateGroupBounds: () => {}
  };
  controller = new LiveSizingController(
    plugin,
    (canvas) => groupIds.get(canvas) || new Set()
  );

  const result = await controller.resizeNodesWhenRendered(background, [topic]);

  assert.equal(result.status, "measured");
  assert.ok(topic.width > 180);
});

test("releases observer records when Canvas iframe and sizer DOM is replaced", () => {
  const OriginalMutationObserver = global.MutationObserver;
  const OriginalResizeObserver = global.ResizeObserver;
  const mutationObservers = [];
  const resizeObservers = [];

  class TestMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.disconnected = false;
      mutationObservers.push(this);
    }

    observe(target) {
      this.target = target;
    }

    disconnect() {
      this.disconnected = true;
      this.target = null;
    }

    trigger() {
      this.callback([], this);
    }
  }

  class TestResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.disconnected = false;
      resizeObservers.push(this);
    }

    observe(target) {
      this.targets.add(target);
    }

    unobserve(target) {
      this.targets.delete(target);
    }

    disconnect() {
      this.disconnected = true;
      this.targets.clear();
    }
  }

  const makeSizer = () => ({
    style: { setProperty: () => {} },
    firstElementChild: null,
    lastElementChild: null,
    children: [],
    closest: () => ({ style: { setProperty: () => {} } }),
    querySelectorAll: () => []
  });
  const makeIframe = (sizer) => {
    const documentListeners = new Map();
    const frameListeners = new Map();
    return {
      contentDocument: {
        documentElement: {},
        body: {},
        querySelector: (selector) => selector === ".markdown-preview-sizer" ? sizer : null,
        addEventListener: (type, listener) => documentListeners.set(type, listener),
        removeEventListener: (type, listener) => {
          if (documentListeners.get(type) === listener)
            documentListeners.delete(type);
        }
      },
      addEventListener: (type, listener) => frameListeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (frameListeners.get(type) === listener)
          frameListeners.delete(type);
      },
      documentListeners,
      frameListeners
    };
  };

  try {
    global.MutationObserver = TestMutationObserver;
    global.ResizeObserver = TestResizeObserver;
    const firstSizer = makeSizer();
    let currentIframe = null;
    const contentEl = {
      querySelector: (selector) => {
        if (selector === "iframe") return currentIframe;
        return currentIframe ? null : firstSizer;
      },
      querySelectorAll: () => []
    };
    const node = {
      id: "topic-a",
      text: "![[first.png]]",
      width: 360,
      height: 220,
      x: 0,
      y: 0,
      contentEl
    };
    const wrapper = { name: "canvas-wrapper" };
    const canvas = {
      nodes: new Map([[node.id, node]]),
      wrapperEl: wrapper,
      requestSave: () => {}
    };
    const plugin = {
      settings: DEFAULT_SETTINGS,
      pendingObservers: new Set(),
      pendingRafs: new Set(),
      pendingTimers: new Set(),
      isMindmapCanvas: () => true,
      trackedRaf: (callback) => callback(),
      trackedTimeout: () => {}
    };
    const controller = new LiveSizingController(plugin, () => new Set());

    controller.watchCanvas(canvas, [node]);

    const outerMutation = mutationObservers.find((observer) => observer.target === wrapper);
    const outerResize = resizeObservers[0];
    assert.ok(outerMutation);
    assert.equal(outerResize.targets.has(firstSizer), true);

    const secondSizer = makeSizer();
    const secondIframe = makeIframe(secondSizer);
    currentIframe = secondIframe;
    outerMutation.trigger();

    const secondRecord = mutationObservers.find(
      (observer) => observer.target === secondIframe.contentDocument.documentElement
    );
    assert.ok(secondRecord);
    assert.equal(outerResize.targets.has(firstSizer), false);

    const thirdSizer = makeSizer();
    const thirdIframe = makeIframe(thirdSizer);
    currentIframe = thirdIframe;
    outerMutation.trigger();

    const thirdRecord = mutationObservers.find(
      (observer) => observer.target === thirdIframe.contentDocument.documentElement
    );
    assert.ok(thirdRecord);
    assert.equal(secondRecord.disconnected, true);
    assert.equal(secondIframe.documentListeners.size, 0);
    assert.equal(secondIframe.frameListeners.size, 0);
    assert.equal(outerResize.targets.has(secondSizer), false);

    canvas.nodes.delete(node.id);
    outerMutation.trigger();

    assert.equal(thirdRecord.disconnected, true);
    assert.equal(thirdIframe.documentListeners.size, 0);
    assert.equal(thirdIframe.frameListeners.size, 0);
    controller.stopWatchingCanvas(canvas);
  } finally {
    global.MutationObserver = OriginalMutationObserver;
    global.ResizeObserver = OriginalResizeObserver;
  }
});

test("coalesces Canvas sizing retries and invalidates replaced work", () => {
  const timers = [];
  let retryChecks = 0;
  const makeTopic = (id) => ({
    id,
    text: `A long topic label ${id} that needs a live measurement pass`,
    width: 180,
    height: 40,
    x: 0,
    y: 0,
    moveAndResize({ x, y, width, height }) {
      Object.assign(this, { x, y, width, height });
    }
  });
  const first = makeTopic("first");
  const second = makeTopic("second");
  const canvas = {
    nodes: new Map([[first.id, first], [second.id, second]]),
    requestSave: () => {}
  };
  const plugin = {
    settings: DEFAULT_SETTINGS,
    pendingTimers: new Set(),
    isAutoAdjustCanvas: () => {
      retryChecks++;
      return true;
    },
    isMindmapCanvas: () => true,
    measureMarkdownNodesOffscreen: () => new Promise(() => {}),
    trackedTimeout: (callback) => {
      const timer = { callback };
      timers.push(timer);
      return timer;
    },
    relayoutAffectedBranches: () => {},
    layoutEngine: { layout: () => {} },
    updateGroupBounds: () => {}
  };
  const controller = new LiveSizingController(plugin, () => new Set());

  controller.resizeNodes(canvas, [first]);
  controller.resizeNodes(canvas, [second]);

  assert.equal(timers.length, 3);
  assert.equal(retryChecks, 0);

  controller.resizeNodesWhenRendered(canvas, [first]);
  for (const timer of timers)
    timer.callback();
  assert.equal(retryChecks, 0);
});
