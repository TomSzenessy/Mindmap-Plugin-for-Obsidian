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
  assert.ok(CARD_LAYOUT_VERSION >= 31);
});

test("reports settled only after the final layout pass", () => {
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

  controller.resizeNodesWhenRendered(canvas, [], () => calls.push("settled"));

  assert.deepEqual(calls, ["save", "layout", "groups", "settled"]);
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
