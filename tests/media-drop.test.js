"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  droppedUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize
} = require("../lib/media-drop.js");
const { DEFAULT_SETTINGS } = require("../lib/settings.js");

function transfer(values = {}, files = []) {
  return {
    files,
    getData: (type) => values[type] || ""
  };
}

test("classifies dropped media and assigns readable native card sizes", () => {
  assert.equal(mediaKind("slides.PDF"), "document");
  assert.equal(mediaKind("photo", "image/png"), "image");
  assert.equal(mediaKind("demo.webm"), "video");
  assert.equal(mediaKind("voice.m4a"), "audio");
  assert.equal(mediaKind("archive.zip"), "file");
  assert.deepEqual(mediaNodeSize("slides.pdf", "", DEFAULT_SETTINGS), {
    kind: "document",
    width: 640,
    height: 480
  });
});

test("extracts web and Obsidian URLs from standard drop payloads", () => {
  const web = transfer({ "text/uri-list": "# source\nhttps://example.com/page\n" });
  const obsidian = transfer({ "text/plain": "obsidian://open?vault=Notes&file=Map" });
  assert.equal(droppedUrl(web), "https://example.com/page");
  assert.match(droppedUrl(obsidian), /^obsidian:\/\/open/);
  assert.equal(linkLabel(droppedUrl(web)), "example.com");
  assert.equal(hasSupportedDrop(web), true);
  assert.equal(hasSupportedDrop(transfer({}, [{ name: "photo.png" }])), true);
});

test("leaves ordinary dragged text to native Canvas behavior", () => {
  const plainText = transfer({ "text/plain": "A sentence with spaces" });
  assert.equal(droppedUrl(plainText), "");
  assert.equal(hasSupportedDrop(plainText), false);
});
