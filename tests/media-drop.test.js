"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createFileNodeSpec,
  createLinkNodeSpec,
  decodeMediaResource,
  droppedUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize,
  obsidianDragPath,
  SUPPORTED_MEDIA_PROTOCOLS
} = require("../lib/media-drop.js");
const { DEFAULT_SETTINGS } = require("../lib/settings.js");

function transfer(values = {}, files = []) {
  return {
    files,
    getData: (type) => values[type] || ""
  };
}

test("decodes fragments, encoded paths, case, and long extensions into one typed result", () => {
  const cases = [
    {
      input: "Attachments/photo%20one.PNG#preview",
      sourcePath: "Projects/Map.canvas",
      path: "Attachments/photo one.PNG",
      sourceDirectory: "Projects",
      fragment: "preview",
      kind: "image"
    },
    {
      input: "![[音聲/訪談.M4A#12.5]]",
      sourcePath: "Inbox/Notes.canvas",
      path: "音聲/訪談.M4A",
      sourceDirectory: "Inbox",
      fragment: "12.5",
      kind: "audio"
    },
    {
      input: "[Report](<Documents/a-very-long-document-extension-name.pdf?download=1#page=2>)",
      sourcePath: "Root.canvas",
      path: "Documents/a-very-long-document-extension-name.pdf",
      sourceDirectory: "",
      fragment: "page=2",
      kind: "document"
    },
    {
      input: "app://vault-id/Assets/report%20final.PDF#page=3",
      sourcePath: "Maps/Map.canvas",
      path: "Assets/report final.PDF",
      sourceDirectory: "Maps",
      fragment: "page=3",
      kind: "document"
    }
  ];

  for (const expected of cases) {
    const decoded = decodeMediaResource(expected.input, expected.sourcePath);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.type, "vault-file");
    assert.equal(decoded.path, expected.path);
    assert.equal(decoded.sourceDirectory, expected.sourceDirectory);
    assert.equal(decoded.fragment, expected.fragment);
    assert.equal(mediaKind(decoded.path), expected.kind);
  }
});

test("rejects unsafe protocols outside the explicit media resource allowlist", () => {
  assert.deepEqual(SUPPORTED_MEDIA_PROTOCOLS, [
    "app:",
    "file:",
    "http:",
    "https:",
    "obsidian:"
  ]);
  assert.equal(Object.isFrozen(SUPPORTED_MEDIA_PROTOCOLS), true);

  for (const value of [
    "javascript:alert(1).png",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "blob:https://example.com/id",
    "filesystem:https://example.com/temporary/file.png"
  ]) {
    const decoded = decodeMediaResource(value);
    assert.equal(decoded.ok, false);
    assert.equal(decoded.reason, "unsupported-protocol");
    assert.equal(createLinkNodeSpec(value, { x: 0, y: 0 }, DEFAULT_SETTINGS), null);
    const payload = transfer({ "text/uri-list": value });
    assert.equal(droppedUrl(payload), "");
    assert.equal(hasSupportedDrop(payload), false);
  }

  const forgedExplorerPayload = {
    files: [],
    types: ["application/x-obsidian-app-file"],
    getData: (type) =>
      type === "application/x-obsidian-app-file"
        ? "javascript:alert(1).png"
        : ""
  };
  assert.equal(droppedUrl(forgedExplorerPayload), "");
  assert.equal(hasSupportedDrop(forgedExplorerPayload), false);
});

test("rejects malformed, traversing, and control-bearing media references", () => {
  const cases = [
    ["Assets/%E0%A4%A.png", "invalid-encoding"],
    ["Assets/%2e%2e/Secrets.png", "invalid-resource"],
    ["../Secrets.png", "invalid-resource"],
    ["![[Assets/photo.png", "invalid-resource"],
    ["[broken](Assets/photo.png", "invalid-resource"],
    ["Assets/photo\u0000.png", "invalid-resource"]
  ];

  for (const [value, reason] of cases) {
    const decoded = decodeMediaResource(value, "Notes/Map.canvas");
    assert.equal(decoded.ok, false, value);
    assert.equal(createFileNodeSpec(value, "", { x: 0, y: 0 }, DEFAULT_SETTINGS), null, value);
    assert.equal(decoded.reason, reason, value);
    assert.equal(decoded.sourceDirectory, "Notes");
  }
});

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
  assert.equal(decodeMediaResource(remotePdf.url).type, "link");

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
  assert.equal(decodeMediaResource("![[Audio/interview.mp3]]").path, "Audio/interview.mp3");
  assert.equal(
    decodeMediaResource("[Report](<Documents/Quarterly report.docx>)").path,
    "Documents/Quarterly report.docx"
  );
  assert.equal(
    decodeMediaResource("app://vault-id/Assets/photo%20one.png").path,
    "Assets/photo one.png"
  );
});
