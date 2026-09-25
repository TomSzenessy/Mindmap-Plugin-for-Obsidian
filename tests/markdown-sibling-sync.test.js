"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadPluginCode } = require("../test-load.js");

// Maintained Markdown ordering, reconciliation, and source-planning behavior is
// covered by markdown-codec, markdown-order, and plugin-integration tests. This
// file is intentionally only an artifact smoke test: it proves the generated
// single-file runtime can be evaluated without accidentally restoring relative
// requires or exposing a second implementation of those private helpers.
test("generated Markdown-sync runtime loads as a self-contained artifact", () => {
  const code = fs.readFileSync(path.resolve(__dirname, "..", "main.js"), "utf8");
  const runtime = loadPluginCode(code);
  assert.equal(typeof runtime.default, "function");
  assert.equal(runtime.default.name, "CanvasMindMapPlugin");
  assert.doesNotMatch(code, /require\("\.\/lib\//);
  assert.match(code, /MarkdownMindMapCodec/);
  assert.match(code, /MarkdownSyncCoordinator/);
});
