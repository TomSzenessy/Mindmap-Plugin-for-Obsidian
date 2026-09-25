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

test("preserves tables, blockquotes, raw HTML, and frontmatter", () => {
  const markdownBlocks = [
    "Name | Value\n--- | ---\nAlpha | 1",
    "> quoted topic\n> second line",
    "<div class=\"topic\">raw HTML</div>",
    "Before\n\nTopic <mark>highlight</mark>",
    "Before\n\n<https://example.com>",
    "Before\n\n*emphasis* and _also emphasis_",
    "---\ntitle: Imported map\n---\n\nTopic"
  ];

  for (const markdown of markdownBlocks) {
    assert.equal(normalizeClipboardMarkdown(markdown), markdown);
    assert.equal(normalizeClipboardMarkdown(normalizeClipboardMarkdown(markdown)), markdown);
  }
});

test("preserves an unclosed fenced block through end of input", () => {
  const markdown = "```js\nconst answer = 42;";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});

test("preserves indented code blocks", () => {
  const markdown = "Topic\n\n    const answer = 42;\n    console.log(answer);";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});

test("preserves a fenced code block as Markdown", () => {
  const markdown = "```js\nconst answer = 42;\n```";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});

test("preserves an existing Markdown hierarchy", () => {
  const markdown = "- Parent\n  - Child";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});
