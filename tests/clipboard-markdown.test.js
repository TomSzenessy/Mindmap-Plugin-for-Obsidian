"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeClipboardMarkdown } = require("../lib/clipboard-markdown.js");

test("keeps a plain sentence as one topic", () => {
  const text = "Requiring businesses to merely disclose the categories of third parties.";
  assert.equal(normalizeClipboardMarkdown(text), text);
});

test("keeps wrapped plain prose inside one topic", () => {
  assert.equal(
    normalizeClipboardMarkdown("A sentence copied from\nits wrapped source."),
    "A sentence copied from its wrapped source."
  );
});

test("turns blank-line-separated prose into sibling topics", () => {
  assert.equal(
    normalizeClipboardMarkdown("First point\n\nSecond point\nwraps here"),
    "- First point\n- Second point wraps here"
  );
});

test("preserves an existing Markdown hierarchy", () => {
  const markdown = "- Parent\n  - Child";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});
