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
  assert.ok(CARD_LAYOUT_VERSION >= 18);
});
