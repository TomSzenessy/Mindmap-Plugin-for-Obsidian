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

test("turns glyph-bulleted lines into sibling list topics", () => {
  const pasted = [
    "• How profitable is this company?",
    "• How risky is this investment?",
    "• Is the company efficiently using its resources?",
    "• Can the company meet its financial obligations?",
    "• Is this company worth investing in?"
  ].join("\n");
  assert.equal(
    normalizeClipboardMarkdown(pasted),
    pasted.replace(/• /g, "- ")
  );
});

test("nests glyph bullets by indentation", () => {
  assert.equal(
    normalizeClipboardMarkdown("• Parent\n\t◦ Child\n\t\t▪ Grandchild\n• Second"),
    "- Parent\n  - Child\n    - Grandchild\n- Second"
  );
  assert.equal(
    normalizeClipboardMarkdown("●Parent\r\n    ○ Child\r\n● Second"),
    "- Parent\n  - Child\n- Second"
  );
});

test("nests unindented glyph bullets by the order their glyphs first appear", () => {
  assert.equal(
    normalizeClipboardMarkdown("• Parent\n◦ Child\n▪ Grandchild\n◦ Sibling\n• Second"),
    "- Parent\n  - Child\n    - Grandchild\n  - Sibling\n- Second"
  );
});

test("keeps a heading line before glyph bullets and prose with glyphs mid-line", () => {
  assert.equal(
    normalizeClipboardMarkdown("Key questions:\n• Profit?\n• Risk?"),
    "Key questions:\n- Profit?\n- Risk?"
  );
  assert.equal(normalizeClipboardMarkdown("Price: 3·4 units"), "Price: 3·4 units");
});

test("treats dashes as bullets only when several lines use them", () => {
  assert.equal(normalizeClipboardMarkdown("— Mark Twain"), "— Mark Twain");
  assert.equal(
    normalizeClipboardMarkdown("– First\n– Second"),
    "- First\n- Second"
  );
});

test("leaves glyphs inside fenced code alone", () => {
  const markdown = "```\n• not a topic\n```";
  assert.equal(normalizeClipboardMarkdown(markdown), markdown);
});
