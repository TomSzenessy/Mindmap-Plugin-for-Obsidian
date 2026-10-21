"use strict";

const HTML_TAGS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
  "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
  "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details",
  "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins",
  "kbd", "label", "legend", "li", "link", "main", "map", "mark", "menu", "meta",
  "meter", "nav", "noscript", "object", "ol", "optgroup", "option", "output",
  "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s",
  "samp", "script", "search", "section", "select", "slot", "small", "source",
  "span", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody",
  "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
  "track", "u", "ul", "var", "video", "wbr"
]);

const HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const LIST_ITEM = /^ {0,6}(?:[-+*]|\d+[.)])(?:[ \t]+|$)/;
const BLOCKQUOTE = /^ {0,3}>/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const TABLE_DELIMITER_CELL = /^:?-{3,}:?$/;
const HTML_COMMENT = /<!--[\s\S]*?-->/;
const HTML_TAG = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*?)?\/?\s*>/;
const HTML_SELF_CLOSING = /<([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*?)?\/\s*>/;
const HTML_DOCTYPE = /<![A-Za-z][^>]*>/;
const INLINE_MARKDOWN = /!?\[[^\]\n]+\]\([^)\n]*\)|`[^`\n]+`|~~[^~\n]+~~|\*\*[^*\n]+\*\*|__[^_\n]+__|(^|[^\w*])\*[^*\n]+\*(?![\w*])|(^|[^\w_])_[^_\n]+_(?![\w_])|\[\^[^\]\n]+\]|<(?:https?|mailto):[^>\s]+>/;

// Bullet glyphs that documents, slides, PDFs, and web pages put in copied
// plain text where Markdown would use `-`. Dashes are bullets only when more
// than one line starts with them, so a single quoted attribution stays prose.
const GLYPH_BULLET = /^([ \t\u00A0]*)([\u2022\u25E6\u25AA\u25AB\u25CF\u25CB\u25A0\u25A1\u2023\u2043\u2219\u00B7\u25C6\u25C7\u25BA\u25B8\u25B9\u27A2\u27A4\u2794\u2192\u2713\u2714\u2610\u2611\u2612\uF0B7\uF0A7\uF0D8\uF076\u2013\u2014])[ \t\u00A0]*(\S.*)$/;
const DASH_BULLETS = new Set(["\u2013", "\u2014"]);

function indentWidth(whitespace) {
  return whitespace.replace(/\t/g, "    ").replace(/\u00A0/g, " ").length;
}

/**
 * Rewrite glyph-bulleted lines (`• Item`) as Markdown list items so the
 * paste becomes a topic hierarchy instead of one text block.
 *
 * Nesting follows indentation. When the copy lost all indentation but uses
 * several glyphs - Word, PowerPoint, and PDFs mark levels with •, ◦, ▪ - the
 * order in which each glyph first appears is the level.
 */
function convertGlyphBullets(text) {
  const lines = text.split("\n");
  if (hasFence(lines)) return text;
  const matches = lines.map((line) => line.match(GLYPH_BULLET));
  const dashCount = matches.filter((match) => match && DASH_BULLETS.has(match[2])).length;
  const bullets = matches.map((match) =>
    match && (!DASH_BULLETS.has(match[2]) || dashCount > 1) ? match : null
  );
  if (!bullets.some(Boolean)) return text;

  const widths = [...new Set(
    bullets.filter(Boolean).map((match) => indentWidth(match[1]))
  )].sort((left, right) => left - right);
  const glyphs = [];
  for (const match of bullets) {
    if (match && !glyphs.includes(match[2])) glyphs.push(match[2]);
  }
  const byGlyph = widths.length === 1 && glyphs.length > 1;

  return lines.map((line, index) => {
    const match = bullets[index];
    if (!match) return line;
    const depth = byGlyph
      ? glyphs.indexOf(match[2])
      : widths.indexOf(indentWidth(match[1]));
    return `${"  ".repeat(depth)}- ${match[3].trimEnd()}`;
  }).join("\n");
}

function withoutBom(line) {
  return String(line || "").replace(/^\uFEFF/, "");
}

function isFenceClose(line, marker) {
  const trimmed = String(line || "").trim();
  return trimmed.length >= marker.length && [...trimmed].every((character) => character === marker[0]);
}

function hasFence(lines) {
  let openMarker = null;
  for (const line of lines) {
    if (openMarker) {
      if (isFenceClose(line, openMarker)) return true;
      continue;
    }
    const match = line.match(FENCE);
    if (!match) continue;
    const marker = match[1];
    const info = match[2];
    if (marker[0] === "`" && info.includes("`")) continue;
    openMarker = marker;
  }
  return openMarker !== null;
}

function tableCells(line) {
  const value = String(line || "").trim();
  if (!value.includes("|")) return null;
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells.length > 0 ? cells : null;
}

function hasTable(lines) {
  for (let index = 1; index < lines.length; index++) {
    const delimiter = tableCells(lines[index]);
    if (!delimiter || !lines[index - 1].trim().includes("|")) continue;
    if (delimiter.every((cell) => TABLE_DELIMITER_CELL.test(cell))) return true;
  }
  return false;
}

function hasHtml(lines) {
  const source = lines.join("\n");
  if (HTML_COMMENT.test(source) || HTML_DOCTYPE.test(source)) return true;
  const match = source.match(HTML_TAG) || source.match(HTML_SELF_CLOSING);
  if (!match) return false;
  const name = match[1].toLowerCase();
  return HTML_TAGS.has(name) || name.includes("-");
}

function hasFrontmatter(lines) {
  if (lines.length < 2 || !/^---[ \t]*$/.test(withoutBom(lines[0]))) return false;
  for (let index = 1; index < lines.length; index++) {
    if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[index])) return true;
  }
  return false;
}

function hasIndentedCode(lines) {
  return lines.some((line) => /^(?: {4}|\t)\S/.test(line));
}

function hasBlockStructure(lines) {
  if (hasFrontmatter(lines) || hasFence(lines) || hasIndentedCode(lines) || hasTable(lines) || hasHtml(lines)) return true;
  if (lines.some((line) => HEADING.test(line) || LIST_ITEM.test(line) || BLOCKQUOTE.test(line))) return true;
  if (lines.some((line) => THEMATIC_BREAK.test(line) || SETEXT.test(line))) return true;
  return lines.some((line) => INLINE_MARKDOWN.test(line));
}

function hasMarkdownStructure(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const trimmed = normalized.trim();
  return Boolean(trimmed) && hasBlockStructure(trimmed.split("\n"));
}

/**
 * Convert unstructured clipboard text into the smallest useful Markdown tree.
 * One prose block remains one card; blank-line-separated blocks become sibling
 * cards. Glyph bullets become Markdown list items. Valid Markdown blocks are
 * returned unchanged for the full parser.
 */
function normalizeClipboardMarkdown(value) {
  const text = convertGlyphBullets(
    String(value || "").replace(/\r\n?/g, "\n").trim()
  );
  if (!text || hasMarkdownStructure(text)) return text;
  const blocks = text.split(/\n[ \t]*\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length <= 1) return (blocks[0] || "").replace(/\n+/g, " ");
  return blocks.map((block) => `- ${block.replace(/\n+/g, " ")}`).join("\n");
}

module.exports = {
  hasMarkdownStructure,
  normalizeClipboardMarkdown
};
