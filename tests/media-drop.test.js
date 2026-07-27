"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createFileNodeSpec,
  createLinkNodeSpec,
  droppedUrl,
  extractFilePathFromUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize,
  obsidianDragPath
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

test("generates file and link node specifications cleanly", () => {
  const fileSpec = createFileNodeSpec("attachments/doc.pdf", "application/pdf", { x: 100, y: 200 }, DEFAULT_SETTINGS, "file1");
  assert.equal(fileSpec.type, "file");
  assert.equal(fileSpec.file, "attachments/doc.pdf");
  assert.equal(fileSpec.width, 640);
  assert.equal(fileSpec.height, 480);

  const linkSpec = createLinkNodeSpec("https://example.com", { x: 300, y: 400 }, DEFAULT_SETTINGS, "link1");
  assert.equal(linkSpec.type, "link");
  assert.equal(linkSpec.url, "https://example.com");

  const remotePdf = createLinkNodeSpec("https://example.com/guide.pdf", { x: 0, y: 0 }, DEFAULT_SETTINGS, "pdf-link");
  assert.equal(remotePdf.type, "link");
  assert.equal(extractFilePathFromUrl(remotePdf.url), null);

  const externalFile = createLinkNodeSpec("file:///Users/example/Guide.pdf", { x: 0, y: 0 }, DEFAULT_SETTINGS, "external-file");
  assert.equal(externalFile.type, "link");
});

test("extracts every common Obsidian file explorer drag payload shape", () => {
  assert.equal(obsidianDragPath('"Projects/Map.md"'), "Projects/Map.md");
  assert.equal(obsidianDragPath('{"path":"Assets/photo one.png"}'), "Assets/photo one.png");
  assert.equal(obsidianDragPath('[{"path":"Documents/Guide.pdf"}]'), "Documents/Guide.pdf");
  assert.equal(obsidianDragPath('["Notes/Linked note.md"]'), "Notes/Linked note.md");

  const transfer = {
    files: [],
    types: ["application/x-obsidian-app-file"],
    getData(type) {
      return type === "application/x-obsidian-app-file"
        ? '"Notes/Linked note.md"'
        : "";
    }
  };
  assert.equal(droppedUrl(transfer), "Notes/Linked note.md");
  assert.equal(hasSupportedDrop(transfer), true);
  assert.equal(extractFilePathFromUrl("![[Audio/interview.mp3]]"), "Audio/interview.mp3");
  assert.equal(extractFilePathFromUrl("[Report](<Documents/Quarterly report.docx>)"), "Documents/Quarterly report.docx");
  assert.equal(extractFilePathFromUrl("app://vault-id/Assets/photo%20one.png"), "Assets/photo one.png");
});
