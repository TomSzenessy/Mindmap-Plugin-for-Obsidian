"use strict";

function hasMarkdownStructure(text) {
  return /^(?:\uFEFF?---[\s\S]*?---\s*)?(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+)/m.test(text);
}

/**
 * Convert unstructured clipboard text into the smallest useful Markdown tree.
 * One prose block remains one card; blank-line-separated blocks become sibling
 * cards. Existing headings/lists are left untouched for the full parser.
 */
function normalizeClipboardMarkdown(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text || hasMarkdownStructure(text))
    return text;
  const blocks = text.split(/\n[ \t]*\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length <= 1)
    return (blocks[0] || "").replace(/\n+/g, " ");
  return blocks.map((block) => `- ${block.replace(/\n+/g, " ")}`).join("\n");
}

module.exports = {
  hasMarkdownStructure,
  normalizeClipboardMarkdown
};
