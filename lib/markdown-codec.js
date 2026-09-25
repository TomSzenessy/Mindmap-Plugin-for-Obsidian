"use strict";

/**
 * `lib/media-drop.js` owns the only interpretation of a resource reference,
 * `lib/markdown-order.js` the only sibling chronology, and `lib/tree-model.js`
 * the only Canvas forest, so all three are consumed rather than restated.
 * Each line is the plain require the runtime-module compiler strips, leaving
 * the registry-injected binding in the bundle.
 */
const MediaDrop = require("./media-drop.js");
const MarkdownOrder = require("./markdown-order.js");
const { buildForest, getGroupIds } = require("./tree-model.js");

/**
 * Layout stays with `lib/freemind.js` and id minting with `lib/canvas-api.js`;
 * neither can be required here because both load `obsidian`. A decoded
 * document must name its topics before any Canvas exists, so the codec mints
 * its own 16 hex characters, and a caller that wants positions passes the
 * layout function it already holds.
 */
function mintTopicId() {
  const bytes = new Uint8Array(8);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* budgets and typed reasons                                          */
/* ------------------------------------------------------------------ */

/**
 * A mind map is a hierarchy a person reads, so the ceilings below are far above
 * any hand-built map and far below anything that can stall a phone: a chain of
 * 20,000 topics still walks iteratively, but a pathological paste is rejected
 * with a typed reason instead of overflowing the stack.
 *
 * `maxReorderDepth` is lower on purpose. Moving existing source slices is the
 * one remaining step whose walk lives in `lib/markdown-order.js` and is still
 * recursive, so a map deeper than this is refused before that walk starts
 * rather than being allowed to ask for more stack than the engine has.
 */
const DEFAULT_MARKDOWN_BUDGETS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxTopics: 20000,
  maxDepth: 20000,
  maxReorderDepth: 2000
});

/**
 * The absolute ceiling for the recursive slice-moving walk, which no option
 * can raise. `maxReorderDepth` may only make the guard stricter; asking for a
 * deeper reorder is still refused, because the walk it would enable is not
 * iterative and a 5,000 level chain would exhaust the stack.
 */
const MARKDOWN_REORDER_DEPTH_CEILING = 2000;

const MARKDOWN_CODEC_REASON = Object.freeze({
  INVALID_INPUT: "invalid-input",
  INVALID_BUDGET: "invalid-budget",
  FILE_BYTE_BUDGET: "file-byte-budget",
  TOPIC_BUDGET: "topic-budget",
  DEPTH_BUDGET: "depth-budget",
  UNSUPPORTED_RESTRUCTURE: "unsupported-restructure",
  MISSING_SOURCE: "missing-source",
  LAYOUT_UNAVAILABLE: "layout-unavailable"
});

let utf8Encoder;

function byteLength(value) {
  if (typeof TextEncoder === "function") {
    if (!utf8Encoder) utf8Encoder = new TextEncoder();
    return utf8Encoder.encode(value).length;
  }
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.codePointAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else {
      bytes += 4;
      index++;
    }
  }
  return bytes;
}

function failure(reason, details) {
  return details ? { ok: false, reason, ...details } : { ok: false, reason };
}

function success(value) {
  return { ok: true, value };
}

function numberBudget(value) {
  if (value === undefined) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return undefined;
  return number;
}

function resolveBudgets(options) {
  const source = options && typeof options === "object" ? options : {};
  const nested =
    source.budgets && typeof source.budgets === "object"
      ? source.budgets
      : source.limits && typeof source.limits === "object"
        ? source.limits
        : {};
  const values = {
    maxFileBytes: source.maxFileBytes ?? source.maxBytes ?? nested.maxFileBytes ?? nested.maxBytes,
    maxTopics: source.maxTopics ?? source.maxNodes ?? nested.maxTopics ?? nested.maxNodes,
    maxDepth: source.maxDepth ?? nested.maxDepth,
    maxReorderDepth: source.maxReorderDepth ?? nested.maxReorderDepth
  };
  const resolved = {};
  for (const [name, fallback] of Object.entries(DEFAULT_MARKDOWN_BUDGETS)) {
    const candidate = values[name];
    if (candidate === undefined) {
      resolved[name] = fallback;
      continue;
    }
    const number = numberBudget(candidate);
    if (number === undefined) return failure(MARKDOWN_CODEC_REASON.INVALID_BUDGET, { budget: name });
    resolved[name] = number;
  }
  return success(resolved);
}

/* ------------------------------------------------------------------ */
/* one syntax classifier                                              */
/* ------------------------------------------------------------------ */

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*(.*)$/;
const ATX_RE = /^([ \t]{0,3})(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const LIST_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)(.*)$/;
const BLOCKQUOTE_RE = /^([ \t]{0,3})>[ \t]?(.*)$/;
const KATEX_RE = /^([ \t]{0,3})\$\$[ \t]*$/;
const TABLE_ROW_RE = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_DELIMITER_RE = /^[ \t]*\|?[\s:|-]+\|[\s:|-]*\|?[ \t]*$/;
const THEMATIC_BREAK_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const HTML_BLOCK_OPEN_RE =
  /^ {0,3}<(?:(?:table|pre|img|picture|audio|video|iframe|object|embed|script|style|details|summary|div|section|article|blockquote)\b|\/?[A-Za-z][A-Za-z0-9-]*[\s/>])/i;
const HTML_COMMENT_OPEN_RE = /^ {0,3}<!--/;
const HTML_COMMENT_CLOSE_RE = /-->[ \t]*$/;
const MINDMAP_KEYWORD_RE = /^[ \t]*mindmap[ \t]*$/i;
const MERMAID_DIRECTIVE_RE = /^[ \t]*(?:::|%%)/;
const MEDIA_IMAGE_RE = /^!\[[^\]]*\]\([ \s\S]*\)$/;
const MEDIA_WIKI_RE = /^!?\[\[[^\]]+\]\]$/;

/** A closing fence must use the opening character and be at least as long. */
function isFenceClose(trimmed, marker) {
  if (trimmed.length < marker.length) return false;
  for (const character of trimmed) {
    if (character !== marker[0]) return false;
  }
  return true;
}

function lineRecords(body, offset) {
  const records = [];
  const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  let match;
  while ((match = pattern.exec(body))) {
    if (!match[0]) break;
    const eolMatch = match[0].match(/(?:\r\n|\n|\r)$/);
    const contentEnd = match.index + match[0].length - (eolMatch ? eolMatch[0].length : 0);
    records.push({
      start: match.index + offset,
      contentEnd: contentEnd + offset,
      end: match.index + match[0].length + offset,
      text: body.slice(match.index, contentEnd)
    });
  }
  return records;
}

function markGroup(lines, start, end, kind) {
  for (let index = start; index <= end; index++) {
    lines[index].groupStart = start;
    lines[index].groupEnd = end;
    if (kind) lines[index].groupKind = kind;
  }
}

/**
 * A Mermaid body line is only a topic when it names one: the `mindmap`
 * keyword, a `::` class or icon directive, and a `%%` comment are syntax.
 */
function markFenceBody(line, mermaid) {
  line.kind = mermaid ? "mermaid-body" : "fence-body";
  if (!mermaid) return;
  line.indent = (line.text.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
  if (MINDMAP_KEYWORD_RE.test(line.text) || MERMAID_DIRECTIVE_RE.test(line.text))
    line.kind = "mermaid-keyword";
}

/**
 * The single place that decides what a line of Markdown is.
 *
 * Every other operation - decoding, encoding safety checks, checkbox
 * mapping, cleanup, and byte-range planning - reads these descriptors instead
 * of running its own regular expressions, so a code fence or an HTML comment
 * can never be rewritten by one pass and treated as prose by the next.
 *
 * `start`/`contentEnd`/`end` are offsets into the original source, including
 * any BOM, so a caller can splice a classified line without re-scanning.
 */
function classifyMarkdownSource(markdown) {
  const source = String(markdown ?? "");
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? source.slice(1) : source;
  const eol = body.includes("\r\n") ? "\r\n" : body.includes("\r") ? "\r" : "\n";
  const records = lineRecords(body, bom.length);
  const lines = records.map((record, index) => ({
    index,
    start: record.start,
    contentEnd: record.contentEnd,
    end: record.end,
    text: record.text,
    groupStart: index,
    groupEnd: index
  }));

  let frontmatterEnd = -1;
  let frontmatter = "";
  const state = { fence: null, katex: false, mermaid: false, quote: false, html: false };
  let quoteStart = -1;
  let htmlStart = -1;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.text.trim();

    if (index === 0 && /^(---|\+\+\+)[ \t]*$/.test(trimmed)) {
      const closer = new RegExp(`^${trimmed[0] === "-" ? "---" : "\\+\\+\\+"}[ \t]*$`);
      for (let scan = 1; scan < lines.length; scan++) {
        if (closer.test(lines[scan].text.trim())) {
          for (let k = 0; k <= scan; k++) lines[k].kind = "frontmatter";
          markGroup(lines, 0, scan, "frontmatter");
          frontmatterEnd = scan;
          frontmatter = lines
            .slice(0, scan + 1)
            .map((item) => item.text)
            .join("\n");
          index = scan;
          break;
        }
      }
      if (frontmatterEnd >= 0) continue;
    }

    if (state.fence) {
      if (isFenceClose(trimmed, state.fence.marker)) {
        const start = state.fence.start;
        const mermaid = state.fence.mermaid;
        line.kind = "fence-close";
        lines[start].kind = "fence-open";
        lines[start].info = state.fence.info;
        for (let k = start + 1; k < index; k++) markFenceBody(lines[k], mermaid);
        markGroup(lines, start, index, mermaid ? "mermaid" : "fence");
        state.fence = null;
      } else {
        markFenceBody(line, state.fence.mermaid);
      }
      continue;
    }

    if (state.katex) {
      line.kind = KATEX_RE.test(line.text) ? "katex-close" : "katex-body";
      if (line.kind === "katex-close") {
        markGroup(lines, state.katex, index, "katex");
        state.katex = false;
      }
      continue;
    }

    if (state.quote) {
      if (BLOCKQUOTE_RE.test(line.text)) {
        line.kind = "blockquote-body";
        continue;
      }
      if (!trimmed) {
        // A blank line only continues the quote when another quoted line follows.
        if (BLOCKQUOTE_RE.test(lines[index + 1]?.text ?? "")) {
          line.kind = "blockquote-body";
          continue;
        }
      }
      for (let k = quoteStart; k < index; k++) lines[k].kind = "blockquote-body";
      lines[quoteStart].kind = "blockquote-open";
      markGroup(lines, quoteStart, index - 1, "blockquote");
      state.quote = false;
      quoteStart = -1;
    }

    if (state.html) {
      line.kind = "html-body";
      if (/<\/[A-Za-z][A-Za-z0-9-]*\s*>/.test(line.text) || !trimmed) {
        for (let k = htmlStart; k <= index; k++) lines[k].kind = "html-body";
        lines[htmlStart].kind = "html-open";
        markGroup(lines, htmlStart, index, "html");
        state.html = false;
        htmlStart = -1;
      } else if (index - htmlStart > 400) {
        for (let k = htmlStart; k < index; k++) lines[k].kind = "html-body";
        lines[htmlStart].kind = "html-open";
        markGroup(lines, htmlStart, index - 1, "html");
        state.html = false;
        htmlStart = -1;
      }
      continue;
    }

    if (!trimmed) {
      line.kind = "blank";
      continue;
    }
    if (THEMATIC_BREAK_RE.test(line.text)) {
      line.kind = "thematic-break";
      continue;
    }
    const fence = line.text.match(FENCE_RE);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      const info = fence[3].trim();
      line.kind = "fence-open";
      state.fence = {
        start: index,
        marker: fence[2],
        info,
        mermaid: /^mermaid\b/i.test(info) || MINDMAP_KEYWORD_RE.test(lines[index + 1]?.text ?? "")
      };
      continue;
    }
    if (KATEX_RE.test(line.text)) {
      line.kind = "katex-open";
      state.katex = index;
      continue;
    }
    if (state.mermaid) {
      // A bare Mermaid mindmap block ends where ordinary Markdown resumes.
      if (ATX_RE.test(line.text) || fence) {
        state.mermaid = false;
      } else if (
        !line.text.startsWith(" ") &&
        !line.text.startsWith("\t") &&
        index + 1 < lines.length &&
        !lines[index + 1].text.trim()
      ) {
        state.mermaid = false;
      }
      if (state.mermaid) {
        line.kind = "mermaid-body";
        line.indent = (line.text.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
        if (MINDMAP_KEYWORD_RE.test(line.text) || MERMAID_DIRECTIVE_RE.test(line.text))
          line.kind = "mermaid-keyword";
        continue;
      }
    } else if (MINDMAP_KEYWORD_RE.test(line.text) && /^[ \t]{2,}\S/.test(lines[index + 1]?.text ?? "")) {
      line.kind = "mermaid-keyword";
      state.mermaid = true;
      continue;
    }
    if (BLOCKQUOTE_RE.test(line.text)) {
      line.kind = "blockquote-open";
      state.quote = true;
      quoteStart = index;
      continue;
    }
    if (HTML_COMMENT_OPEN_RE.test(line.text)) {
      line.kind = "comment-open";
      let end = index;
      while (end < lines.length && !HTML_COMMENT_CLOSE_RE.test(lines[end].text)) end++;
      for (let k = index + 1; k <= end; k++) lines[k].kind = "comment-body";
      markGroup(lines, index, Math.min(end, lines.length - 1), "comment");
      index = end;
      continue;
    }
    if (HTML_BLOCK_OPEN_RE.test(line.text)) {
      line.kind = "html-open";
      state.html = true;
      htmlStart = index;
      continue;
    }
    if (TABLE_ROW_RE.test(line.text) && TABLE_DELIMITER_RE.test(lines[index + 1]?.text ?? "")) {
      line.kind = "table-head";
      let end = index + 1;
      while (end + 1 < lines.length && TABLE_ROW_RE.test(lines[end + 1].text)) end++;
      for (let k = index + 2; k <= end; k++) lines[k].kind = "table-body";
      markGroup(lines, index, end, "table");
      index = end;
      continue;
    }
    const heading = line.text.match(ATX_RE);
    if (heading) {
      const title = (heading[3] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
      line.kind = "heading";
      line.level = heading[2].length;
      line.title = title;
      line.marker = heading[2];
      line.indent = heading[1].replace(/\t/g, "    ").length;
      continue;
    }
    const list = line.text.match(LIST_RE);
    if (list) {
      const indent = list[1].replace(/\t/g, "    ").length;
      line.kind = "list";
      line.indent = indent;
      line.marker = list[2];
      line.ordered = /\d/.test(list[2][0]);
      line.task = /^\[[ xX]\](?:[ \t]|$)/.test(list[4]);
      // `indent` is the nesting whitespace alone and `prefix` is the whole
      // marker run. A caller that indents a new child of this item must use
      // the former; the latter would write a second `- ` into the document.
      line.indentPrefix = list[1];
      line.prefix = `${list[1]}${list[2]}${list[3]}`;
      line.content = list[4];
      continue;
    }
    line.kind = "plain";
    line.indent = (line.text.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
    line.content = trimmed;
  }

  if (state.fence) {
    const start = state.fence.start;
    for (let k = start + 1; k < lines.length; k++) markFenceBody(lines[k], state.fence.mermaid);
    markGroup(lines, start, lines.length - 1, state.fence.mermaid ? "mermaid" : "fence");
    state.fence = null;
  }
  if (state.katex) {
    for (let k = state.katex; k < lines.length; k++) lines[k].kind = "katex-body";
    markGroup(lines, state.katex, lines.length - 1, "katex");
    state.katex = false;
  }
  if (state.quote) {
    for (let k = quoteStart; k < lines.length; k++) lines[k].kind = "blockquote-body";
    lines[quoteStart].kind = "blockquote-open";
    markGroup(lines, quoteStart, lines.length - 1, "blockquote");
    state.quote = false;
  }
  if (state.html) {
    for (let k = htmlStart; k < lines.length; k++) lines[k].kind = "html-body";
    lines[htmlStart].kind = "html-open";
    markGroup(lines, htmlStart, lines.length - 1, "html");
    state.html = false;
  }
  for (const line of lines) {
    if (!line.kind) line.kind = "plain";
    if (line.indent === undefined) {
      line.indent = (line.text.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
    }
    if (line.content === undefined) line.content = line.text.trim();
  }

  return {
    source,
    bom,
    eol,
    lines,
    frontmatter,
    hasFrontmatter: frontmatterEnd >= 0,
    frontmatterEnd,
    contentStart: frontmatterEnd >= 0 ? lines[frontmatterEnd].end : bom.length
  };
}

/* ------------------------------------------------------------------ */
/* literal protection                                                 */
/* ------------------------------------------------------------------ */

const LITERAL_OPEN = "\u0000mdc";
const LITERAL_CLOSE = "\u0001";

/**
 * Hide every span a transform must not touch: fenced code and inline code,
 * plus HTML comments unless the caller is the cleanup that removes them.
 * A rewrite then works on the remaining prose, and restoring is exact, so a
 * code sample or a comment survives byte for byte.
 */
function protectMarkdownLiterals(text, options = {}) {
  const keepCommentsVisible = options.comments === false;
  const source = String(text ?? "");
  const literals = [];
  let literalOpen = LITERAL_OPEN;
  let literalClose = LITERAL_CLOSE;
  while (source.includes(literalOpen) || source.includes(literalClose)) {
    literalOpen += "x";
    literalClose += "x";
  }
  const store = (value) => {
    literals.push(value);
    return `${literalOpen}${literals.length - 1}${literalClose}`;
  };
  const classified = classifyMarkdownSource(source);
  const inlinePattern = keepCommentsVisible
    ? /(`+[^`\n]*`+)/g
    : /(<!--[\s\S]*?-->)|(`+[^`\n]*`+)/g;
  const masked = [];
  let cursor = 0;
  for (const line of classified.lines) {
    const fenced =
      line.kind === "fence-open" ||
      line.kind === "fence-body" ||
      line.kind === "fence-close" ||
      line.kind === "mermaid-body" ||
      line.kind === "frontmatter";
    if (line.start > cursor) masked.push(source.slice(cursor, line.start));
    if (fenced) {
      masked.push(store(source.slice(line.start, line.end)));
      cursor = line.end;
      continue;
    }
    const body = source.slice(line.start, line.contentEnd);
    let rebuilt = "";
    let last = 0;
    let match;
    inlinePattern.lastIndex = 0;
    while ((match = inlinePattern.exec(body))) {
      rebuilt += body.slice(last, match.index) + store(match[0]);
      last = match.index + match[0].length;
    }
    masked.push(`${rebuilt}${body.slice(last)}${source.slice(line.contentEnd, line.end)}`);
    cursor = line.end;
  }
  masked.push(source.slice(cursor));
  const maskedText = masked.join("");
  const token = new RegExp(
    `${literalOpen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)${literalClose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "g"
  );
  return {
    text: maskedText,
    restore(value) {
      return String(value ?? "").replace(token, (whole, index) => literals[Number(index)] ?? whole);
    }
  };
}

/* ------------------------------------------------------------------ */
/* topic text                                                         */
/* ------------------------------------------------------------------ */

function resourceTarget(target) {
  return String(target || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

function resourceLabel(target, alias) {
  const explicit = String(alias || "").trim();
  if (explicit) return explicit.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  const clean = String(target || "").split(/[?#]/)[0].replace(/\\/g, "/");
  const basename = clean.split("/").filter(Boolean).pop() || clean;
  try {
    return decodeURIComponent(basename) || "Attachment";
  } catch (_error) {
    return basename || "Attachment";
  }
}

function isImageTarget(target) {
  return MediaDrop.mediaKind(target) === "image";
}

function resourceLink(target, alias, preferEmbed) {
  const normalized = resourceTarget(target);
  if (!normalized) return "Untitled";
  const label = resourceLabel(normalized, alias);
  return preferEmbed && isImageTarget(normalized)
    ? `![${label}](<${normalized}>)`
    : `[${label}](<${normalized}>)`;
}

/**
 * Classify one topic body as a resource reference or ordinary prose.
 *
 * The verdict comes from `MediaDrop.decodeMediaResource`, so the accepted
 * protocols, the vault-path rules, and the extension tables have exactly one
 * source of truth. `target` stays as written for a stable round trip while
 * `path` and `url` carry the validated value a Canvas card must hold.
 */
function parseTopicResource(text) {
  const value = String(text ?? "").trim();
  const plain = { kind: "text", file: null, url: null, target: "", fragment: null };
  if (!value) return plain;
  let target = null;
  let embed = false;
  let alias = "";
  const wiki = value.match(/^(!?)\[\[([^|\]]+)(?:\|([^\]]*))?\]\]$/);
  const markdown = value.match(/^(!?)\[([^\]]*)\]\([ \s\S]*\)$/);
  if (wiki) {
    target = wiki[2].trim();
    embed = wiki[1] === "!";
    alias = wiki[3] || "";
  } else if (markdown) {
    embed = markdown[1] === "!";
    alias = markdown[2];
    let inner = value.slice(value.indexOf("](") + 2, -1).trim();
    if (inner.startsWith("<") && inner.endsWith(">")) inner = inner.slice(1, -1).trim();
    const title = /\s+["'][^"']*["']$/.exec(inner);
    if (title) inner = inner.slice(0, title.index).trim();
    target = inner;
  } else {
    return plain;
  }
  if (!target) return plain;
  // The reference is interpreted exactly as written, so a wiki embed and a
  // Markdown embed of the same path are never confused with one another.
  const resource = MediaDrop.decodeMediaResource(target);
  if (!resource.ok) return plain;
  if (resource.type === "link") {
    return {
      kind: "link",
      file: null,
      url: resource.value,
      target,
      label: alias || null,
      fragment: resource.fragment ?? null,
      embed
    };
  }
  return {
    kind: "file",
    file: resource.path,
    url: null,
    target,
    label: alias || null,
    fragment: resource.fragment ?? null,
    embed
  };
}

/** A Canvas card or a decoded topic, reduced to one comparable record. */
function topicContentKind(source) {
  if (!source) return "text";
  if (source.type === "file" || typeof source.file === "string" && source.file) return "file";
  if (source.type === "link" || typeof source.url === "string" && source.url) return "link";
  return "text";
}

function topicTarget(source) {
  const kind = topicContentKind(source);
  if (kind === "file") return String(source.file);
  if (kind === "link") return String(source.url);
  return "";
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function topicsMatch(left, right) {
  const leftKind = topicContentKind(left);
  if (leftKind !== topicContentKind(right)) return false;
  if (leftKind !== "text") return topicTarget(left) === topicTarget(right);
  const leftText = left?.text ?? left?.unknownData?.text;
  const rightText = right?.text ?? right?.unknownData?.text;
  return normalizedText(leftText) === normalizedText(rightText);
}

function stripLeadingHeading(text) {
  const value = String(text ?? "").trim();
  const stripped = value.replace(/^[ \t]{0,3}#{1,6}[ \t]+/, "").replace(/^[ \t]{0,3}#{1,6}[ \t]*$/, "");
  return stripped || "Untitled";
}

/**
 * The Markdown a topic card contributes to a document.
 *
 * A file card becomes an embed and a link card becomes a labelled link, so the
 * resource survives a round trip; any other card becomes portable prose.
 */
function serializeTopicText(node) {
  if (!node) return "Untitled";
  const kind = topicContentKind(node);
  if (kind === "file") return `![](<${resourceTarget(node.file)}>)`;
  if (kind === "link") {
    const url = resourceTarget(node.url);
    return resourceLink(url, MediaDrop.linkLabel(url).replace(/[[\]]/g, ""), false);
  }
  return stripLeadingHeading(node.text ?? node.unknownData?.text);
}

const CODE_FENCE_TITLE_RE = /^(?:```|~~~)\s*([A-Za-z0-9_+-]*)/;
const IMAGE_TITLE_RE = /^!\[([^\]]*)\]\(([^)]+)\)/;
const WIKI_TITLE_RE = /^!?\[\[([^|\]#]+)(?:[|#][^\]]*)?\]\]/;

/**
 * A topic's display title: the first meaningful line, with the decorations a
 * renderer would hide. `array[0]` and `C#` survive because the shapes removed
 * here are whole-token Markdown links and block shapes, not any bracketed run,
 * and a closing hash sequence only counts when a space precedes it.
 */
function topicTitle(text) {
  let firstLine = String(text ?? "").trim().split("\n")[0].trim();
  if (!firstLine) return "Untitled";
  const fence = firstLine.match(CODE_FENCE_TITLE_RE);
  if (fence) return fence[1] ? `Code · ${fence[1]}` : "Code block";
  const image = firstLine.match(IMAGE_TITLE_RE);
  if (image) return image[1] || image[2].split("/").pop() || "Image";
  const wiki = firstLine.match(WIKI_TITLE_RE);
  if (wiki) return wiki[1].split("/").pop() || "Embed";
  if (/^\|.*\|$/.test(firstLine)) {
    const cells = firstLine
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    return cells.join(" · ") || "Table";
  }
  firstLine = firstLine
    .replace(/^#{1,6}[ \t]+/, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .replace(/^[-+*][ \t]+/, "");
  const shaped =
    firstLine.match(/^[A-Za-z0-9_-]*\{\{(.*)\}\}$/) ||
    firstLine.match(/^[A-Za-z0-9_-]*\(\((.*)\)\)$/) ||
    firstLine.match(/^[A-Za-z0-9_-]*\[\[(.*)\]\]$/);
  if (shaped) firstLine = shaped[1];
  return firstLine.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") || "Untitled";
}

function identityKey(text) {
  const value = topicTitle(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function identityLabel(text) {
  return topicTitle(text).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function topicIdentity(text) {
  return { key: identityKey(text), label: identityLabel(text) };
}

function labelSimilarity(left, right) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  let common = 0;
  for (const token of aTokens) if (bTokens.has(token)) common++;
  const tokenScore = common / Math.max(aTokens.size, bTokens.size, 1);
  const bigrams = (value) => {
    const compact = value.replace(/\s+/g, " ");
    const result = [];
    for (let index = 0; index < compact.length - 1; index++) result.push(compact.slice(index, index + 2));
    return result;
  };
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  const remaining = new Map();
  for (const pair of aBigrams) remaining.set(pair, (remaining.get(pair) || 0) + 1);
  let shared = 0;
  for (const pair of bBigrams) {
    const count = remaining.get(pair) || 0;
    if (count > 0) {
      shared++;
      remaining.set(pair, count - 1);
    }
  }
  const bigramScore = (2 * shared) / Math.max(1, aBigrams.length + bBigrams.length);
  const containmentScore =
    a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
  return Math.max(tokenScore, bigramScore, containmentScore);
}

/* ------------------------------------------------------------------ */
/* canonical anchors                                                  */
/* ------------------------------------------------------------------ */

function canonicalAnchor(text) {
  return (
    topicTitle(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "topic"
  );
}

/**
 * GitHub-style heading anchors: the first occurrence keeps the bare slug and
 * later duplicates take `-2`, `-3`. Both the encoder and the decoder derive
 * the map here, so a link to a repeated title always resolves to the same card.
 */
function canonicalAnchorMap(topics) {
  const counts = new Map();
  const anchors = new Map();
  for (const topic of topics) {
    const base = canonicalAnchor(topic.text);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    anchors.set(count === 1 ? base : `${base}-${count}`, topic.id);
  }
  return anchors;
}

/**
 * Rewrite `](#anchor)` links into the portable card scheme.
 *
 * Inline code and HTML comments are masked first, so a sample that shows the
 * link syntax is never rewritten, and a percent-encoded anchor is decoded and
 * canonicalised the same way the encoder canonicalises a heading.
 */
function convertMarkdownAnchorsToCardLinks(topics, canvasPath) {
  const anchors = canonicalAnchorMap(topics);
  return topics.map((topic) => {
    const { text, restore } = protectMarkdownLiterals(String(topic?.text ?? ""));
    const replaced = text.replace(/\]\(#([^)\s]+)\)/g, (whole, rawAnchor) => {
      let anchor = rawAnchor;
      try {
        anchor = decodeURIComponent(rawAnchor);
      } catch (_error) {
        /* An anchor that is not valid percent-encoding is used verbatim. */
      }
      const targetId = anchors.get(canonicalAnchor(anchor));
      if (!targetId) return whole;
      return `](obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${targetId})`;
    });
    return { ...topic, text: restore(replaced) };
  });
}

/* ------------------------------------------------------------------ */
/* frontmatter metadata                                               */
/* ------------------------------------------------------------------ */

const LEGACY_ID_COMMENT_RE = /<!--\s*tomindmap:id=([A-Za-z0-9_-]+)\s*-->/gi;
const LEGACY_BLOCK_COMMENT_RE = /^[ \t]*<!--\s*\/?tomindmap:(?:node|content)(?:\s+id=[A-Za-z0-9_-]+)?\s*-->[ \t]*(?:\r\n|\n|\r|$)/gim;

function frontmatterStringArray(frontmatter, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(frontmatter || "").match(new RegExp(`^\\s{2}${escaped}:\\s*(\\[[^\\n]*\\])\\s*$`, "m"));
  if (!match) return [];
  try {
    const values = JSON.parse(match[1]);
    return Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
  } catch (_error) {
    return [];
  }
}

function metadataBlock(ids, keys, labels) {
  return [
    "tomindmap:",
    "  version: 1",
    `  topicIds: ${JSON.stringify(ids)}`,
    `  topicKeys: ${JSON.stringify(keys)}`,
    `  topicLabels: ${JSON.stringify(labels)}`
  ].join("\n");
}

function mergeTopicMetadataBlock(existing, ids, keys, labels, eol) {
  const generated = [
    "  version: 1",
    `  topicIds: ${JSON.stringify(ids)}`,
    `  topicKeys: ${JSON.stringify(keys)}`,
    `  topicLabels: ${JSON.stringify(labels)}`
  ];
  const lines = String(existing || "").split(/\r\n|\n|\r/);
  const kept = lines.filter(
    (line) => !/^\s+(?:version|topicIds|topicKeys|topicLabels):/.test(line)
  );
  while (kept.length > 1 && kept[kept.length - 1] === "") kept.pop();
  if (kept.length === 0) kept.push("tomindmap:");
  return [...kept, ...generated].join(eol);
}

/**
 * Replace only the `tomindmap` block of an existing frontmatter, leaving every
 * other key, the BOM, and the document's own line endings untouched.
 */
function markdownWithTopicMetadata(markdown, metadata) {
  const source = String(markdown ?? "");
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? source.slice(1) : source;
  const eol = body.includes("\r\n") ? "\r\n" : body.includes("\r") ? "\r" : "\n";
  const ids = Array.isArray(metadata?.topicIds) ? metadata.topicIds : [];
  const keys = Array.isArray(metadata?.topicKeys) ? metadata.topicKeys : [];
  const labels = Array.isArray(metadata?.topicLabels) ? metadata.topicLabels : [];
  const generatedBlock = metadataBlock(ids, keys, labels).replace(/\n/g, eol);
  const opening = body.match(/^---[ \t]*(?:\r\n|\n|\r)/);
  if (!opening) return `${bom}---${eol}${generatedBlock}${eol}---${eol}${eol}${body}`;
  const contentStart = opening[0].length;
  const closer = /^---[ \t]*(?:\r\n|\n|\r|$)/gm;
  closer.lastIndex = contentStart;
  const closing = closer.exec(body);
  if (!closing) return `${bom}---${eol}${generatedBlock}${eol}---${eol}${eol}${body}`;
  const inner = body.slice(contentStart, closing.index);
  const records = lineRecords(inner, 0);
  const start = records.findIndex((record) => /^tomindmap:[ \t]*$/.test(record.text));
  let updated;
  if (start >= 0) {
    let end = start + 1;
    while (end < records.length && /^[ \t]+/.test(records[end].text)) end++;
    const from = records[start].start;
    const to = end < records.length ? records[end].start : inner.length;
    const existingBlock = inner.slice(from, to);
    const mergedBlock = mergeTopicMetadataBlock(existingBlock, ids, keys, labels, eol);
    const trailing = end < records.length || /(?:\r\n|\n|\r)$/.test(existingBlock) ? eol : "";
    updated = inner.slice(0, from) + mergedBlock + trailing + inner.slice(to);
  } else {
    const separator = inner.length === 0 || /(?:\r\n|\n|\r)$/.test(inner) ? "" : eol;
    updated = `${inner}${separator}${generatedBlock}${eol}`;
  }
  return bom + body.slice(0, contentStart) + updated + body.slice(closing.index);
}

/** Drop the retired per-topic comments without touching look-alikes in code. */
function withoutLegacyPluginComments(markdown) {
  const { text, restore } = protectMarkdownLiterals(markdown, { comments: false });
  const stripped = text
    .replace(new RegExp(LEGACY_ID_COMMENT_RE.source, "gi"), (whole) => (whole.includes("\n") ? "\n" : ""))
    .replace(LEGACY_BLOCK_COMMENT_RE, "");
  return restore(stripped).replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

/* ------------------------------------------------------------------ */
/* local media targets                                                */
/* ------------------------------------------------------------------ */

const WIKI_REFERENCE_RE = /(!?)\[\[([^|\]#]+)(?:[|#][^|\]]*)?(?:\|[^\]]*)?\]\]/g;
const MARKDOWN_REFERENCE_RE = /(!?)\[([^\]]*)\]\([ \s\S]*?\)/g;
const HTML_MEDIA_RE = /<(?:img|audio|video|source|iframe|object|embed)\b[^>]*(?:src|data)=["']([^"']+)["'][^>]*>/gi;

/**
 * Vault-relative targets referenced by a document, in first-seen order.
 *
 * Whether a reference is allowed, and whether it names a real file extension,
 * is decided by `MediaDrop.decodeMediaResource`; this only decides where a
 * reference may appear.
 */
function extractLocalMediaTargets(markdown) {
  const { text } = protectMarkdownLiterals(markdown);
  const found = new Set();
  const consider = (raw) => {
    const value = String(raw || "").trim().replace(/^<|>$/g, "");
    if (!value) return;
    const resource = MediaDrop.decodeMediaResource(value);
    if (resource.ok && resource.type === "vault-file" && !resource.protocol) found.add(resource.path);
  };
  let match;
  WIKI_REFERENCE_RE.lastIndex = 0;
  while ((match = WIKI_REFERENCE_RE.exec(text))) consider(match[2]);
  MARKDOWN_REFERENCE_RE.lastIndex = 0;
  while ((match = MARKDOWN_REFERENCE_RE.exec(text))) {
    let inner = match[0].slice(match[0].indexOf("](") + 2, -1).trim();
    if (inner.startsWith("<") && inner.endsWith(">")) inner = inner.slice(1, -1).trim();
    const title = /\s+["'][^"']*["']$/.exec(inner);
    if (title) inner = inner.slice(0, title.index).trim();
    consider(inner);
  }
  HTML_MEDIA_RE.lastIndex = 0;
  while ((match = HTML_MEDIA_RE.exec(text))) consider(match[1]);
  return Array.from(found);
}

/* ------------------------------------------------------------------ */
/* decoding                                                           */
/* ------------------------------------------------------------------ */

/**
 * Retired canvas shapes, removed only when they wrap the whole single line.
 * A bare `[...]` run is deliberately not one of them: `array[0]` and `C#` are
 * ordinary text that a reader must still see, and a Mermaid node keeps its
 * own `((...))`, `[...]`, and `{...}` shapes because that is its identity.
 */
function cleanImportedTopic(text, kind) {
  const value = String(text ?? "").trim();
  if (kind === "mermaid") return value || "Untitled";
  if (!value.includes("\n")) {
    const shaped =
      value.match(/^[A-Za-z0-9_-]*\(\((.*)\)\)$/) ||
      value.match(/^[A-Za-z0-9_-]*\{\{(.*)\}\}$/) ||
      value.match(/^[A-Za-z0-9_-]*\[\[(.*)\]\]$/);
    if (shaped) return shaped[1] || "Untitled";
  }
  if (/^\[[ xX]\][ \t]+/.test(value)) return `- ${value}`;
  return value.replace(/<br\s*\/?>/gi, "\n").trim() || "Untitled";
}

function preorder(roots) {
  const ordered = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    ordered.push(node);
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]);
  }
  return ordered;
}

function maxDepthOf(roots) {
  const stack = roots.map((node) => ({ node, depth: 1 }));
  let deepest = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current.node) continue;
    if (current.depth > deepest) deepest = current.depth;
    for (const child of current.node.children) stack.push({ node: child, depth: current.depth + 1 });
  }
  return deepest;
}

/** Subtree sizes for every node, produced by one iterative post-order pass. */
function subtreeSizes(roots) {
  const sizes = new Map();
  for (const root of roots) {
    const order = [];
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      order.push(node);
      for (const child of node.children) stack.push(child);
    }
    for (let index = order.length - 1; index >= 0; index--) {
      const node = order[index];
      let total = 1;
      for (const child of node.children) total += sizes.get(child) || 1;
      sizes.set(node, total);
    }
  }
  return sizes;
}

/** Split a central topic's children into a balanced right and left side. */
function assignSides(roots) {
  const sizes = subtreeSizes(roots);
  for (const root of roots) {
    const children = root.children;
    if (children.length === 0) continue;
    let total = 0;
    for (const child of children) total += sizes.get(child) || 1;
    let prefix = 0;
    let split = 1;
    let best = Infinity;
    for (let index = 0; index <= children.length; index++) {
      const difference = Math.abs(prefix - (total - prefix));
      if (difference < best || (difference === best && index > split)) {
        best = difference;
        split = index;
      }
      prefix += sizes.get(children[index]) || 0;
    }
    const pending = [];
    for (let index = 0; index < children.length; index++) {
      const side = index < split ? "right" : "left";
      children[index].position = side;
      pending.push(children[index]);
    }
    while (pending.length > 0) {
      const node = pending.pop();
      for (const child of node.children) {
        child.position = node.position;
        pending.push(child);
      }
    }
  }
}

/**
 * Match decoded topics to the ids a previous export recorded.
 *
 * Exact title keys claim their index first, then each remaining topic is
 * scored against a small inverted-index candidate set rather than every
 * stored label, and anything still unclaimed is taken in document order. The
 * pass is linear in the number of topics and never pairs every topic with
 * every label.
 */
function assignStableIds(ordered, metadataIds, metadataKeys, metadataLabels) {
  const buckets = new Map();
  const limit = Math.min(metadataIds.length, metadataKeys.length);
  for (let index = 0; index < limit; index++) {
    const key = metadataKeys[index];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }
  const claimed = new Set();
  const byIndex = new Map();
  for (const node of ordered) {
    const indexes = buckets.get(identityKey(node.text));
    if (!indexes) continue;
    const match = indexes.find((index) => !claimed.has(index));
    if (match === undefined) continue;
    byIndex.set(node, match);
    claimed.add(match);
  }

  const unmatchedMetadata = [];
  const unclaimed = new Set();
  for (let index = 0; index < Math.min(metadataIds.length, metadataLabels.length); index++) {
    if (claimed.has(index)) continue;
    unclaimed.add(index);
    unmatchedMetadata.push(index);
  }
  if (unclaimed.size > 0) {
    const SIMILARITY_CANDIDATES = 8;
    const terms = new Map();
    for (const index of unclaimed) {
      for (const term of new Set(metadataLabels[index].toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))) {
        if (!terms.has(term)) terms.set(term, []);
        terms.get(term).push(index);
      }
    }
    for (const node of ordered) {
      if (byIndex.has(node)) continue;
      const label = identityLabel(node.text);
      const candidates = new Set();
      for (const term of label.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        for (const index of terms.get(term) || []) {
          if (candidates.size >= SIMILARITY_CANDIDATES) break;
          candidates.add(index);
        }
        if (candidates.size >= SIMILARITY_CANDIDATES) break;
      }
      let bestIndex = -1;
      let bestScore = 0;
      for (const index of candidates) {
        if (claimed.has(index)) continue;
        const score = labelSimilarity(metadataLabels[index], label);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      if (bestIndex >= 0 && bestScore >= 0.34) {
        byIndex.set(node, bestIndex);
        claimed.add(bestIndex);
        unclaimed.delete(bestIndex);
      }
    }
  }

  const spare = [];
  for (let index = 0; index < metadataIds.length; index++) {
    if (!claimed.has(index)) spare.push(index);
  }
  const assigned = new Set();
  for (const node of ordered) {
    const matched = byIndex.get(node);
    let candidate = node.legacyId || (matched === undefined ? null : metadataIds[matched]);
    if (!candidate) candidate = spare.length > 0 ? metadataIds[spare.shift()] : null;
    if (!candidate || assigned.has(candidate)) candidate = mintTopicId();
    while (assigned.has(candidate)) candidate = mintTopicId();
    node.id = candidate;
    assigned.add(candidate);
  }
}

function frontmatterTitle(frontmatter) {
  const match = String(frontmatter || "").match(/^title:[ \t]*(.+?)[ \t]*$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * Decode a Markdown mind map into topics, ids, and the source ranges that a
 * later source-preserving update needs.
 *
 * The result is typed. A document that legitimately contains no topic is
 * `{ok: true, value: {empty: true}}`; only invalid input, a bad budget, or a
 * budget that was exceeded is `{ok: false, reason}`. Every walk is iterative,
 * so a 12,000 level chain decodes exactly like a shallow one.
 */
function decodeMarkdownMindMap(markdown, options = {}) {
  if (typeof markdown !== "string") return failure(MARKDOWN_CODEC_REASON.INVALID_INPUT);
  const budgeted = resolveBudgets(options);
  if (!budgeted.ok) return budgeted;
  const budgets = budgeted.value;
  const bytes = byteLength(markdown);
  if (bytes > budgets.maxFileBytes)
    return failure(MARKDOWN_CODEC_REASON.FILE_BYTE_BUDGET, { bytes, maxFileBytes: budgets.maxFileBytes });

  const classified = classifyMarkdownSource(markdown);
  const roots = [];
  const topics = [];
  const usedIds = new Set();
  const headingStack = [];
  const listStack = [];
  let listAnchor = null;
  let lastItem = null;
  let pendingBlank = false;
  let sawH1 = false;
  let budgetError = null;

  const uniqueId = (preferred) => {
    let id = preferred;
    while (!id || usedIds.has(id)) id = mintTopicId();
    usedIds.add(id);
    return id;
  };

  const addTopic = (rawText, parent, explicitId, source) => {
    let explicit = explicitId || null;
    const blockKind = source?.kind === "block";
    // A legacy id comment is metadata, so it is read from prose and from list
    // items only: inside a code fence the same characters are sample text.
    let value = blockKind
      ? String(rawText ?? "")
      : String(rawText ?? "").replace(LEGACY_ID_COMMENT_RE, (whole, found) => {
          if (!explicit) explicit = found;
          return "";
        });
    value = value.replace(/[ \t]+\n/g, "\n").trim();
    const resource = blockKind ? { kind: "text", file: null, url: null } : parseTopicResource(value);
    const text = blockKind
      ? value.replace(/[ \t]+$/gm, "").trim() || "Untitled"
      : cleanImportedTopic(value, source?.kind);
    const node = {
      id: uniqueId(explicit),
      legacyId: explicit,
      type: resource.kind,
      file: resource.file ?? null,
      url: resource.url ?? null,
      text,
      position: "right",
      children: [],
      source
    };
    if (parent) parent.children.push(node);
    else roots.push(node);
    topics.push(node);
    if (topics.length > budgets.maxTopics) {
      budgetError = failure(MARKDOWN_CODEC_REASON.TOPIC_BUDGET, {
        topics: topics.length,
        maxTopics: budgets.maxTopics
      });
    }
    return node;
  };

  const addIndented = (rawText, indent, anchor, source) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) listStack.pop();
    const parent = listStack.length > 0 ? listStack[listStack.length - 1].node : anchor;
    const node = addTopic(rawText, parent, null, source);
    listStack.push({ indent, node });
    return node;
  };

  const continueLast = (node, line, extraBlank, endLine) => {
    node.text = `${node.text}${extraBlank ? "\n\n" : "\n"}${line}`;
    // The body belongs to the topic's own source range, so a rename rewrites
    // it and a reorder carries it along with its heading.
    if (node.source && Number.isInteger(endLine) && endLine > node.source.endLine)
      node.source.endLine = endLine;
  };

  const groupText = (start, end) => {
    const parts = [];
    for (let index = start; index <= end; index++) parts.push(classified.lines[index].text);
    return parts;
  };

  for (let index = 0; index < classified.lines.length; index++) {
    const line = classified.lines[index];
    if (budgetError) break;
    if (line.kind === "blank" || line.kind === "thematic-break") {
      pendingBlank = true;
      continue;
    }
    if (line.kind === "frontmatter") continue;
    if (line.kind === "comment-open" || line.kind === "comment-body") {
      index = line.groupEnd;
      continue;
    }
    const sawBlank = pendingBlank;
    pendingBlank = false;

    if (line.kind === "mermaid-keyword") continue;

    if (line.kind === "mermaid-body") {
      listAnchor = null;
      lastItem = null;
      const node = addIndented(line.content, line.indent, null, {
        startLine: index,
        endLine: index + 1,
        kind: "mermaid",
        indent: line.text.slice(0, line.text.length - line.content.length),
        prefix: line.text.slice(0, line.text.length - line.content.length)
      });
      continue;
    }

    if (line.kind === "fence-close") {
      index = line.groupEnd;
      continue;
    }

    if (line.kind === "fence-open") {
      // A Mermaid mindmap is a hierarchy, not one code card: its body lines
      // carry the indentation that becomes the topic tree.
      if (line.groupKind !== "mermaid") {
        const indent = classified.lines[line.groupStart].text.match(/^[ \t]*/)[0].replace(/\t/g, "    ");
        const body = groupText(line.groupStart, line.groupEnd)
          .map((part) => (part.startsWith(indent) ? part.slice(indent.length) : part))
          .join("\n")
          .trim();
        const parent = listStack.length > 0 ? listStack[listStack.length - 1].node : listAnchor;
        const node = addTopic(body, parent, null, {
          startLine: line.groupStart,
          endLine: line.groupEnd + 1,
          kind: "block",
          indent
        });
        listStack.push({ indent: line.indent + 1, node });
        lastItem = null;
        index = line.groupEnd;
        continue;
      }
      lastItem = null;
      index = line.groupStart;
      continue;
    }

    if (line.kind === "katex-open" || line.kind === "blockquote-open" || line.kind === "html-open" || line.kind === "table-head") {
      const parts = groupText(line.groupStart, line.groupEnd);
      const indent = classified.lines[line.groupStart].text.match(/^[ \t]*/)[0].replace(/\t/g, "    ");
      const body = parts
        .map((part) => (part.startsWith(indent) ? part.slice(indent.length) : part))
        .join("\n")
        .trim();
      const parent = listStack.length > 0 ? listStack[listStack.length - 1].node : listAnchor;
      const node = addTopic(body, parent, null, {
        startLine: line.groupStart,
        endLine: line.groupEnd + 1,
        kind: "block",
        indent
      });
      listStack.push({ indent: line.indent + 1, node });
      lastItem = null;
      index = line.groupEnd;
      continue;
    }

    if (line.kind === "heading") {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= line.level)
        headingStack.pop();
      const parent = headingStack.length > 0 ? headingStack[headingStack.length - 1].node : null;
      if (line.level === 1) sawH1 = true;
      const node = addTopic(line.title, parent, null, {
        startLine: index,
        endLine: index + 1,
        kind: "heading",
        level: line.level,
        indent: "",
        prefix: `${line.marker} `
      });
      headingStack.push({ level: line.level, node });
      listAnchor = node;
      listStack.length = 0;
      lastItem = { node, heading: true, markerIndent: line.indent };
      continue;
    }

    if (line.kind === "list") {
      const content = line.ordered ? `${line.marker} ${line.content}` : line.content;
      const node = addIndented(content, line.indent, listAnchor, {
        startLine: index,
        endLine: index + 1,
        kind: "list",
        indent: line.indentPrefix,
        marker: line.marker,
        prefix: line.prefix
      });
      lastItem = { node, heading: false, markerIndent: line.indent };
      continue;
    }

    if (line.kind !== "plain") continue;
    if (line.content === "") continue;
    const owned =
      lastItem &&
      (lastItem.heading
        ? line.indent <= 3
        : line.indent > lastItem.markerIndent ||
          (listStack.length > 0 && line.indent >= listStack[listStack.length - 1].indent));
    if (owned) {
      // A lazy continuation - and a second paragraph that stayed inside the
      // same item - belongs to the topic above it, never to a new child.
      continueLast(lastItem.node, line.content, sawBlank, index + 1);
      continue;
    }
    const node = addIndented(line.content, line.indent, listAnchor, {
      startLine: index,
      endLine: index + 1,
      kind: "plain",
      indent: line.text.slice(0, line.text.length - line.content.length),
      prefix: line.text.slice(0, line.text.length - line.content.length)
    });
    listStack.push({ indent: line.indent, node });
    lastItem = { node, heading: false, markerIndent: line.indent };
  }
  if (budgetError) return budgetError;

  const depth = maxDepthOf(roots);
  if (depth > budgets.maxDepth)
    return failure(MARKDOWN_CODEC_REASON.DEPTH_BUDGET, { depth, maxDepth: budgets.maxDepth });

  const title = frontmatterTitle(classified.frontmatter);
  if (title && !sawH1 && roots.length > 0) {
    roots.unshift({
      id: uniqueId(null),
      type: "text",
      file: null,
      url: null,
      text: title,
      position: "right",
      children: roots.splice(0),
      source: null
    });
  }

  const ordered = preorder(roots);
  const metadataIds = frontmatterStringArray(classified.frontmatter, "topicIds").filter((id) =>
    /^[A-Za-z0-9_-]+$/.test(id)
  );
  const metadataKeys = frontmatterStringArray(classified.frontmatter, "topicKeys");
  const metadataLabels = frontmatterStringArray(classified.frontmatter, "topicLabels");
  assignStableIds(ordered, metadataIds, metadataKeys, metadataLabels);
  for (const node of ordered) delete node.legacyId;
  assignSides(roots);

  const parentOf = new Map();
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop();
    for (const child of node.children) {
      parentOf.set(child, node);
      pending.push(child);
    }
  }
  const topicSources = ordered.map((node) => ({
    id: node.id,
    parentId: parentOf.get(node)?.id ?? null,
    ...(node.source || {})
  }));
  const topicIds = ordered.map((node) => node.id);
  const topicKeys = ordered.map((node) => identityKey(node.text));
  const topicLabels = ordered.map((node) => identityLabel(node.text));

  return success({
    empty: ordered.length === 0,
    roots,
    topics: ordered,
    frontmatter: classified.frontmatter,
    topicIds,
    topicKeys,
    topicLabels,
    topicSources
  });
}

/* ------------------------------------------------------------------ */
/* encoding                                                           */
/* ------------------------------------------------------------------ */

function isStandaloneBlock(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  const classified = classifyMarkdownSource(value);
  for (const line of classified.lines) {
    if (line.kind === "fence-open" || line.kind === "katex-open" || line.kind === "blockquote-open" || line.kind === "html-open" || line.kind === "table-head")
      return true;
  }
  return false;
}

function isMediaOnly(text) {
  const value = String(text ?? "").trim();
  return MEDIA_IMAGE_RE.test(value) || MEDIA_WIKI_RE.test(value);
}

/**
 * A topic that must be emitted as its own block. A media card is not one: it
 * is a list item whose body is an embed, so its children stay indented under
 * it instead of escaping into a sibling paragraph.
 */
function isStructuralBlock(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  if (isMediaOnly(value)) return false;
  return isStandaloneBlock(value);
}

function headingSafe(text) {
  const firstLine = String(text ?? "").trim().split("\n")[0];
  if (!firstLine) return false;
  if (isStandaloneBlock(text)) return false;
  return !/^(?:[-+*][ \t]+|\d{1,9}[.)][ \t]+|\[[ xX]\][ \t]+)/.test(firstLine);
}

function defaultFrontmatter(file, options) {
  if (options.exportMarkmapFrontmatter === false) return "";
  const title = file?.basename || "Mind map";
  const configured = Number(options.markmapColorFreezeLevel);
  const freeze = Math.max(0, Math.min(10, Number.isFinite(configured) ? configured : 2));
  return `---\ntitle: ${JSON.stringify(title)}\nmarkmap:\n  colorFreezeLevel: ${freeze}\n---`;
}

function normalizeFrontmatterBlock(value) {
  const stored = String(value || "").trim();
  if (!stored) return "";
  if (!stored.startsWith("---"))
    return `---\n${stored}\n---`;
  const lines = stored.split(/\r?\n/);
  if (lines.length < 2 || !/^---[ \t]*$/.test(lines[0]) ||
      !lines.slice(1).some((line) => /^---[ \t]*$/.test(line)))
    throw new Error("Markdown frontmatter is unterminated");
  return stored;
}

function canvasFrontmatter(canvas, options) {
  const data = typeof canvas?.getData === "function" ? canvas.getData() : {};
  const stored = typeof data?.mindmapMarkdownFrontmatter === "string" ? data.mindmapMarkdownFrontmatter.trim() : "";
  if (stored) return normalizeFrontmatterBlock(stored);
  return defaultFrontmatter(canvas?.view?.file, options);
}

function orderForest(roots) {
  const stack = roots.map((node) => ({ node, isRoot: true }));
  while (stack.length > 0) {
    const current = stack.pop();
    current.node.children = MarkdownOrder.orderChildren(
      current.node.canvasNode,
      current.node.children,
      current.isRoot
    );
    for (let index = current.node.children.length - 1; index >= 0; index--)
      stack.push({ node: current.node.children[index], isRoot: false });
  }
  return roots;
}

function portableTopicText(text, idToSlug) {
  const { text: masked, restore } = protectMarkdownLiterals(stripLeadingHeading(text));
  const replaced = masked
    .replace(
      /obsidian:\/\/tomindmap-navigate\?canvas=[^)\s]+&id=([A-Za-z0-9_-]+)/g,
      (whole, id) => (idToSlug.has(id) ? `#${idToSlug.get(id)}` : whole)
    )
    .replace(/!\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g, (whole, target, alias) => resourceLink(target, alias, true))
    .replace(
      /(^|[^!])\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g,
      (whole, prefix, target, alias) => `${prefix}${resourceLink(target, alias, false)}`
    );
  return restore(replaced);
}

function uniqueSlugs(entries) {
  const counts = new Map();
  const slugs = new Map();
  for (const [id, text] of entries) {
    const base = canonicalAnchor(text);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    slugs.set(id, count === 1 ? base : `${base}-${count}`);
  }
  return slugs;
}

/**
 * Serialize a Canvas forest back to Markdown.
 *
 * Heading levels are used while every sibling is safe on a heading, then the
 * level that would exceed six falls back to an indented list, so a deep map
 * keeps its hierarchy instead of flattening. The whole walk is an explicit
 * work stack, and the byte, topic, and depth budgets are enforced here too.
 */
function encodeMindMapMarkdown(canvas, options = {}) {
  const budgeted = resolveBudgets(options);
  if (!budgeted.ok) return budgeted;
  const budgets = budgeted.value;
  const forest = Array.isArray(options.rootTrees) ? options.rootTrees.slice() : buildForest(canvas);
  forest.sort(
    (left, right) =>
      (Number(left.canvasNode.y) || 0) - (Number(right.canvasNode.y) || 0) ||
      (Number(left.canvasNode.x) || 0) - (Number(right.canvasNode.x) || 0)
  );
  if (forest.length === 0) return success({ markdown: "", empty: true, topicIds: [], topicKeys: [], topicLabels: [] });

  orderForest(forest);
  const entries = [];
  const work = [...forest];
  while (work.length > 0) {
    const node = work.pop();
    entries.push([node.canvasNode.id, serializeTopicText(node.canvasNode)]);
    for (const child of node.children) work.push(child);
  }
  if (entries.length > budgets.maxTopics)
    return failure(MARKDOWN_CODEC_REASON.TOPIC_BUDGET, { topics: entries.length, maxTopics: budgets.maxTopics });
  const depths = new Map();
  const depthStack = forest.map((node) => ({ node, depth: 1 }));
  let deepest = 0;
  while (depthStack.length > 0) {
    const current = depthStack.pop();
    depths.set(current.node.canvasNode.id, current.depth);
    if (current.depth > deepest) deepest = current.depth;
    for (const child of current.node.children) depthStack.push({ node: child, depth: current.depth + 1 });
  }
  if (deepest > budgets.maxDepth)
    return failure(MARKDOWN_CODEC_REASON.DEPTH_BUDGET, { depth: deepest, maxDepth: budgets.maxDepth });

  const textById = new Map(entries);
  const idToSlug = uniqueSlugs(entries);
  const rawText = (node) => portableTopicText(textById.get(node.canvasNode.id), idToSlug);
  const topicIds = [];
  const topicKeys = [];
  const topicLabels = [];
  const orderedIds = [];
  for (const root of forest) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const text = textById.get(node.canvasNode.id);
      orderedIds.push(node.canvasNode.id);
      topicIds.push(node.canvasNode.id);
      topicKeys.push(identityKey(text));
      topicLabels.push(identityLabel(text));
      for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]);
    }
  }

  const lines = [];
  if (options.includeFrontmatter !== false) {
    let frontmatter;
    try {
      frontmatter =
        typeof options.frontmatter === "string" && options.frontmatter
          ? normalizeFrontmatterBlock(options.frontmatter)
          : canvasFrontmatter(canvas, options);
    } catch (error) {
      return failure(MARKDOWN_CODEC_REASON.INVALID_INPUT, { error });
    }
    if (frontmatter) lines.push(frontmatterWithMetadata(frontmatter, topicIds, topicKeys, topicLabels), "");
  }
  const pushBlock = (text, indent) => {
    const prefix = "  ".repeat(indent);
    for (const line of String(text).split("\n")) lines.push(`${prefix}${line}`);
  };
  const stack = [];
  for (let index = forest.length - 1; index >= 0; index--) {
    const root = forest[index];
    const parts = rawText(root).split("\n");
    stack.push({ kind: "headings", children: root.children, level: 2 });
    stack.push({ kind: "root", title: parts.shift() || "Untitled", body: parts, separator: index > 0 });
  }
  while (stack.length > 0) {
    const item = stack.pop();
    if (item.kind === "root") {
      if (item.separator) lines.push("");
      lines.push(`# ${item.title}`);
      lines.push(...item.body);
      continue;
    }
    if (item.kind === "headings") {
      const children = item.children;
      if (children.length === 0) continue;
      const useHeadings =
        item.level <= 6 &&
        children.every(
          (child) =>
            (isStructuralBlock(rawText(child)) && child.children.length === 0) || headingSafe(rawText(child))
        );
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index];
        if (!useHeadings) {
          stack.push({ kind: "list", node: child, indent: 0 });
          continue;
        }
        if (isStructuralBlock(rawText(child))) stack.push({ kind: "block-children", node: child, level: item.level });
        else stack.push({ kind: "heading", node: child, level: item.level });
      }
      continue;
    }
    if (item.kind === "heading") {
      const parts = rawText(item.node).split("\n");
      lines.push("", `${"#".repeat(item.level)} ${parts.shift() || "Untitled"}`);
      lines.push(...parts);
      stack.push({ kind: "headings", children: item.node.children, level: item.level + 1 });
      continue;
    }
    if (item.kind === "block-children") {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      pushBlock(rawText(item.node), 0);
      if (lines[lines.length - 1] !== "") lines.push("");
      stack.push({ kind: "headings", children: item.node.children, level: item.level + 1 });
      continue;
    }
    if (item.kind === "list") {
      const raw = rawText(item.node);
      if (isStructuralBlock(raw)) {
        if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
        pushBlock(raw, item.indent);
        if (lines[lines.length - 1] !== "") lines.push("");
        for (let index = item.node.children.length - 1; index >= 0; index--)
          stack.push({ kind: "list", node: item.node.children[index], indent: item.indent + 1 });
        continue;
      }
      const parts = raw.split("\n");
      const first = parts.shift() || "Untitled";
      const prefix = "  ".repeat(item.indent);
      const keepsMarker = /^(?:[-+*][ \t]+\[[ xX]\]|\d{1,9}[.)][ \t]+)/.test(first);
      lines.push(`${prefix}${keepsMarker ? first : `- ${first}`}`);
      for (const part of parts) lines.push(`${prefix}  ${part}`);
      for (let index = item.node.children.length - 1; index >= 0; index--)
        stack.push({ kind: "list", node: item.node.children[index], indent: item.indent + 1 });
    }
  }

  const markdown = `${lines.join("\n").trim()}\n`;
  if (byteLength(markdown) > budgets.maxFileBytes)
    return failure(MARKDOWN_CODEC_REASON.FILE_BYTE_BUDGET, {
      bytes: byteLength(markdown),
      maxFileBytes: budgets.maxFileBytes
    });
  return success({ markdown, empty: false, topicIds, topicKeys, topicLabels, order: orderedIds });
}

function frontmatterWithMetadata(frontmatter, ids, keys, labels) {
  const value = String(frontmatter || "").trim();
  const wrapped = !value.startsWith("---") ? (value ? `---\n${value}\n---` : "---\n---") : value;
  const lines = wrapped.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^tomindmap:[ \t]*$/.test(line));
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && (/^[ \t]+/.test(lines[end]) || !lines[end].trim())) end++;
    const merged = mergeTopicMetadataBlock(lines.slice(start, end).join("\n"), ids, keys, labels, "\n").split("\n");
    return [...lines.slice(0, start), ...merged, ...lines.slice(end)].join("\n");
  }
  let closing = lines.length - 1;
  while (closing > 0 && lines[closing].trim() !== "---") closing--;
  return [...lines.slice(0, closing), ...metadataBlock(ids, keys, labels).split("\n"), ...lines.slice(closing)].join("\n");
}

/* ------------------------------------------------------------------ */
/* Canvas extraction                                                  */
/* ------------------------------------------------------------------ */

/**
 * The one parent/child view of a live Canvas.
 *
 * It is `buildForest`, so a surplus parent edge, a directed cycle, a self
 * loop, and a dangling endpoint are ignored in exactly the way layout,
 * collapse, and navigation already ignore them. A raw last-write-wins parent
 * map read straight off the edge list would instead let a surplus edge move a
 * topic under a different parent, reorder the map, and make a source update
 * report a reparent for a hierarchy the user never changed.
 */
function canvasTopicGraph(canvas) {
  const groupIds = getGroupIds(canvas);
  const forest = buildForest(canvas);
  const nodes = new Map();
  const parents = new Map();
  const children = new Map();
  const depths = new Map();
  let maxDepth = 0;
  for (const treeNode of forest) {
    nodes.set(treeNode.id, treeNode.canvasNode);
  }
  const stack = forest.map((treeNode) => ({ treeNode, depth: 1 }));
  while (stack.length > 0) {
    const current = stack.pop();
    const id = current.treeNode.id;
    if (!children.has(id)) children.set(id, []);
    depths.set(id, current.depth);
    if (current.depth > maxDepth) maxDepth = current.depth;
    for (const child of current.treeNode.children) {
      nodes.set(child.id, child.canvasNode);
      parents.set(child.id, id);
      children.get(id).push(child.id);
      stack.push({ treeNode: child, depth: current.depth + 1 });
    }
  }
  return {
    groupIds,
    forest,
    // `roots`, `nodes`, `parents`, and `children` are the contract
    // `MarkdownOrder.canvasTopicGraph` consumes, so one canonical graph is
    // shared instead of being rebuilt with the same rules in two places.
    roots: forest.map((treeNode) => treeNode.id),
    nodes,
    parents,
    children,
    depths,
    maxDepth
  };
}

/** Live Canvas topics in the chronological reading order of the forest. */
function extractCanvasTopicPreorder(canvas) {
  const graph = canvasTopicGraph(canvas);
  const position = (id) => graph.nodes.get(id);
  const roots = graph.forest
    .map((treeNode) => treeNode.id)
    .sort(
      (left, right) =>
        (Number(position(left)?.y) || 0) - (Number(position(right)?.y) || 0) ||
        (Number(position(left)?.x) || 0) - (Number(position(right)?.x) || 0) ||
        String(left).localeCompare(String(right))
    );
  const rootIds = new Set(roots);
  // Membership is tracked in a Set beside the list. Scanning the growing list
  // instead would make a 20,000 sibling map quadratic, which is the whole cost
  // the canonical forest was adopted to avoid.
  const order = [];
  const visited = new Set();
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    const next = MarkdownOrder.orderChildren(
      position(id),
      (graph.children.get(id) || []).map(position).filter(Boolean),
      rootIds.has(id)
    ).map((node) => node.id);
    for (let index = next.length - 1; index >= 0; index--) stack.push(next[index]);
  }
  return order;
}

/** The outermost selected topics, so a drag never exports a subtree twice. */
function extractSelectedTopicForest(canvas) {
  const groupIds = getGroupIds(canvas);
  const selected = new Set();
  for (const item of canvas?.selection || []) {
    const id = typeof item === "string" ? item : item && typeof item === "object" ? item.id : null;
    if (id && !groupIds.has(id)) selected.add(id);
  }
  if (selected.size === 0) return [];
  const byId = new Map();
  const stack = buildForest(canvas);
  while (stack.length > 0) {
    const tree = stack.pop();
    byId.set(tree.canvasNode.id, tree);
    for (const child of tree.children) stack.push(child);
  }
  return Array.from(selected, (id) => byId.get(id)).filter((tree) => {
    if (!tree) return false;
    for (let parent = tree.parent; parent; parent = parent.parent) {
      if (selected.has(parent.canvasNode.id)) return false;
    }
    return true;
  });
}

function documentTopics(document) {
  const roots = Array.isArray(document?.roots) ? document.roots : [];
  const topics = Array.isArray(document?.topics) && document.topics.length > 0 ? document.topics : preorder(roots);
  return topics.map((node) => ({
    id: node.id,
    text: node.text,
    type: node.type ?? "text",
    file: node.file ?? undefined,
    url: node.url ?? undefined
  }));
}

function edgeKey(edge) {
  return `${edge.fromNode}\\u0000${edge.toNode}`;
}

/** True when the live Canvas already shows exactly the decoded document. */
function canvasMatchesDocument(canvas, document, canvasPath) {
  if (!document) return false;
  const topics = documentTopics(document);
  const graph = canvasTopicGraph(canvas);
  if (graph.nodes.size !== topics.length) return false;
  const incoming = canvasPath ? convertMarkdownAnchorsToCardLinks(topics, canvasPath) : topics;
  for (const topic of incoming) {
    const live = graph.nodes.get(topic.id);
    if (!live || !topicsMatch(live, topic)) return false;
  }
  const ids = new Set(incoming.map((topic) => topic.id));
  const wanted = new Set();
  for (const record of document.topicSources || []) {
    if (!record.parentId || !ids.has(record.id) || !ids.has(record.parentId)) continue;
    wanted.add(`${record.parentId}\\u0000${record.id}`);
  }
  // The same canonical forest decides the edges, so a surplus or cycle edge the
  // map already ignores cannot make an unchanged hierarchy look changed.
  const live = new Set();
  for (const [parentId, children] of graph.children) {
    if (!ids.has(parentId)) continue;
    for (const childId of children) {
      if (ids.has(childId)) live.add(`${parentId}\\u0000${childId}`);
    }
  }
  if (live.size !== wanted.size) return false;
  for (const key of wanted) if (!live.has(key)) return false;
  return true;
}

/**
 * The canonical graph is computed once here and injected, so the order check
 * and the Canvas itself can never disagree about which edges the map accepts.
 */
function canvasOrderMatchesDocument(canvas, document) {
  if (!document) return false;
  return MarkdownOrder.orderMatches(canvas, document, getGroupIds, {
    graph: canvasTopicGraph(canvas)
  });
}

/* ------------------------------------------------------------------ */
/* Canvas data adapters and reconciliation                            */
/* ------------------------------------------------------------------ */

/** Adapt raw `.canvas` JSON to the shape every codec entry point accepts. */
function canvasDataAdapter(data, file) {
  const nodes = new Map();
  for (const item of data?.nodes || []) {
    const text = item.type === "group" ? item.label || "Group" : serializeTopicText(item);
    nodes.set(item.id, { ...item, text });
  }
  const edges = new Map();
  for (const item of data?.edges || []) {
    const from = nodes.get(item.fromNode);
    const to = nodes.get(item.toNode);
    if (!from || !to) continue;
    edges.set(item.id, {
      ...item,
      from: { node: from, side: item.fromSide },
      to: { node: to, side: item.toSide }
    });
  }
  return { nodes, edges, getData: () => data, view: { file } };
}

function canvasDataToMindMapMarkdown(data, file, options = {}) {
  return encodeMindMapMarkdown(canvasDataAdapter(data, file), options);
}

/**
 * Merge a freshly decoded document into stored Canvas data.
 *
 * Geometry follows the content kind, not the node id: a card only keeps its
 * current size when both sides are the same kind of content, so a text topic
 * that became a file card (or the reverse) is measured again instead of
 * inheriting a dimension that no longer fits.
 */
function reconcileCanvasData(existingData, imported) {
  const current = existingData && typeof existingData === "object" ? existingData : {};
  const existingNodes = new Map((current.nodes || []).map((node) => [node.id, node]));
  const pendingResize = new Set(Array.isArray(current.mindmapPendingResize) ? current.mindmapPendingResize : []);
  const nodes = [];
  for (const incoming of imported.nodes) {
    const existing = existingNodes.get(incoming.id);
    if (!existing) {
      if (topicContentKind(incoming) === "text") pendingResize.add(incoming.id);
      nodes.push({ ...incoming });
      continue;
    }
    const before = topicContentKind(existing);
    const after = topicContentKind(incoming);
    const sameKind = before === after;
    const sameContent = topicsMatch(existing, incoming);
    const keepGeometry = sameKind && (after === "file" || after === "link" || sameContent);
    if (after === "file" || after === "link") pendingResize.delete(incoming.id);
    else if (!sameContent) pendingResize.add(incoming.id);
    else pendingResize.delete(incoming.id);
    nodes.push({
      ...existing,
      ...incoming,
      width: keepGeometry ? existing.width : incoming.width,
      height: keepGeometry ? existing.height : incoming.height
    });
  }
  const groupIds = new Set();
  for (const node of current.nodes || []) {
    if (node.type === "group") {
      groupIds.add(node.id);
      nodes.push(node);
    }
  }
  const existingEdges = new Map((current.edges || []).map((edge) => [edgeKey(edge), edge]));
  const edges = imported.edges.map((incoming) => {
    const existing = existingEdges.get(edgeKey(incoming));
    return existing
      ? { ...incoming, ...existing, fromNode: incoming.fromNode, toNode: incoming.toNode }
      : incoming;
  });
  const retained = new Set(nodes.map((node) => node.id));
  for (const edge of current.edges || []) {
    if (!groupIds.has(edge.fromNode) && !groupIds.has(edge.toNode)) continue;
    if (retained.has(edge.fromNode) && retained.has(edge.toNode)) edges.push(edge);
  }
  const reconciled = {
    ...current,
    nodes,
    edges,
    mindmap: true,
    mindmapMarkdownFrontmatter: imported.frontmatter || current.mindmapMarkdownFrontmatter || ""
  };
  delete reconciled.mindmapAutoAdjust;
  const topicIds = new Set(imported.nodes.map((node) => node.id));
  const pending = Array.from(pendingResize).filter((id) => topicIds.has(id));
  if (pending.length > 0) reconciled.mindmapPendingResize = pending;
  else delete reconciled.mindmapPendingResize;
  return reconciled;
}

/* ------------------------------------------------------------------ */
/* checkbox mapping                                                   */
/* ------------------------------------------------------------------ */

function taskMarkerOffset(line) {
  const candidate =
    line.kind === "list"
      ? line.text
      : line.kind === "blockquote-open" || line.kind === "blockquote-body"
        ? line.text.replace(BLOCKQUOTE_RE, (whole, _indent, rest) => " ".repeat(whole.length - rest.length) + rest)
        : null;
  if (candidate === null) return -1;
  const match = candidate.match(/^([ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/);
  return match ? match[1].length : -1;
}

/**
 * Toggle the checkbox a reader just clicked.
 *
 * Task items are counted in document order from the same classifier the
 * decoder uses, so fenced samples, inline code, and blockquoted prose are
 * never mistaken for a source task and ordered tasks are reached correctly.
 */
function toggleTopicCheckbox(text, index) {
  const source = String(text ?? "");
  const classified = classifyMarkdownSource(source);
  const tasks = [];
  for (const line of classified.lines) {
    const offset = taskMarkerOffset(line);
    if (offset >= 0) tasks.push({ line, offset });
  }
  const target = tasks[index];
  if (!target) return { text: source, changed: false };
  const { line, offset } = target;
  const body = line.text;
  const state = body[offset];
  const next = state === " " ? "x" : " ";
  const replacement = `${body.slice(0, offset)}${next}${body.slice(offset + 1)}`;
  const patched =
    source.slice(0, line.start) + replacement + source.slice(line.contentEnd, line.end) + source.slice(line.end);
  return { text: patched, changed: true };
}

/* ------------------------------------------------------------------ */
/* source-preserving update                                           */
/* ------------------------------------------------------------------ */

function rangeFor(records, record) {
  if (!record || !Number.isInteger(record.startLine) || !Number.isInteger(record.endLine)) return null;
  const first = records[record.startLine];
  const last = records[record.endLine - 1];
  if (!first || !last) return null;
  return { start: first.start, contentEnd: last.contentEnd, end: last.end };
}

function renderIntoSource(record, text, eol) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const indent = record.indent || "";
  if (record.kind === "block") return lines.map((line) => `${indent}${line}`).join("\n");
  if (record.kind === "heading" || record.kind === "mermaid") {
    const first = lines.shift() || "Untitled";
    return `${record.prefix || ""}${first}${lines.length ? `\n${lines.join("\n")}` : ""}`;
  }
  let first = lines.shift() || "Untitled";
  if (record.kind === "list") {
    const marker = String(record.marker || "");
    if (marker && first.startsWith(marker)) first = first.slice(marker.length).replace(/^[ \t]+/, "");
    else first = first.replace(/^[-+*][ \t]+/, "");
  }
  const continuation = record.kind === "list" ? `${indent}  ` : indent;
  return `${record.prefix || ""}${first}${lines.length ? `\n${lines.map((line) => `${continuation}${line}`).join("\n")}` : ""}`;
}

/**
 * Preorder index of every subtree's last topic, in one pass.
 *
 * Source ranges are contiguous in preorder, so a subtree's byte range is the
 * union of a contiguous slice; the reverse pass then walks each node's direct
 * children exactly once, which keeps a wide map linear.
 */
function subtreeByteRanges(order, records) {
  const count = order.length;
  const byteStart = new Array(count);
  const byteEnd = new Array(count);
  const ranges = new Map();
  for (let index = 0; index < count; index++) {
    const range = rangeFor(records, order[index]);
    if (!range) return null;
    byteStart[index] = range.start;
    byteEnd[index] = range.end;
  }
  const open = [];
  const endAt = new Array(count).fill(count);
  for (let index = 0; index < count; index++) {
    const parentId = order[index].parentId || null;
    while (open.length > 0 && open[open.length - 1].id !== parentId) {
      endAt[open.pop().index] = index;
    }
    open.push({ index, id: order[index].id });
  }
  while (open.length > 0) endAt[open.pop().index] = count;
  const subtreeEnd = new Array(count);
  for (let index = count - 1; index >= 0; index--) {
    let end = byteEnd[index];
    let child = index + 1;
    while (child < endAt[index]) {
      end = Math.max(end, subtreeEnd[child]);
      child = endAt[child];
    }
    subtreeEnd[index] = end;
    ranges.set(order[index].id, { start: byteStart[index], end });
  }
  return ranges;
}

function markdownEol(source) {
  return source.includes("\r\n") ? "\r\n" : source.includes("\r") ? "\r" : "\n";
}

/**
 * Plan the Markdown rewrite that makes a document match the live Canvas.
 *
 * Topics keep the exact bytes they were parsed from: a rename rewrites only
 * its own line range, a delete removes only its own range, and an addition
 * inserts a rendered block next to its new siblings. Anything the plan cannot
 * express - a reparent, a missing range, overlapping ranges - is refused with
 * a typed reason so the caller keeps the file it already had.
 */
function planMarkdownSourceUpdate(markdown, canvas, document, canvasPath, options = {}) {
  if (typeof markdown !== "string") return failure(MARKDOWN_CODEC_REASON.INVALID_INPUT);
  if (!document || !Array.isArray(document.topicSources))
    return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE);
  const source = markdown;
  const eol = markdownEol(source);
  const records = lineRecords(source, 0);
  const previous = documentTopics(document);
  if (previous.length === 0) return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE);
  const previousById = new Map(previous.map((topic) => [topic.id, topic]));
  const sourceById = new Map(document.topicSources.map((record) => [record.id, record]));
  const order = document.topicSources.slice();
  const subtreeRanges = subtreeByteRanges(order, records);
  if (!subtreeRanges) return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE);

  // The live hierarchy is read through the canonical forest, so a surplus
  // parent, a cycle, or a dangling endpoint is treated exactly as layout
  // treats it instead of moving a topic and reporting a phantom reparent.
  const graph = canvasTopicGraph(canvas);
  const liveNodes = graph.nodes;
  const liveOrder = extractCanvasTopicPreorder(canvas);
  const incoming = canvasPath
    ? convertMarkdownAnchorsToCardLinks(previous, canvasPath)
    : previous;
  const incomingById = new Map(incoming.map((topic) => [topic.id, topic]));

  const liveIds = new Set(liveNodes.keys());
  const previousIds = new Set(previousById.keys());
  const liveParents = graph.parents;
  const previousParents = new Map(order.map((record) => [record.id, record.parentId || null]));

  for (const id of liveIds) {
    if (!previousIds.has(id)) continue;
    if ((previousParents.get(id) || null) !== (liveParents.get(id) || null))
      return failure(MARKDOWN_CODEC_REASON.UNSUPPORTED_RESTRUCTURE, { topicId: id });
  }

  const idToSlug = uniqueSlugs(
    liveOrder.map((id) => [id, serializeTopicText(liveNodes.get(id))])
  );
  const portableText = (id) => portableTopicText(serializeTopicText(liveNodes.get(id)), idToSlug);

  const patches = [];
  for (const id of liveOrder) {
    const topic = incomingById.get(id);
    if (!topic) continue;
    const live = liveNodes.get(id);
    if (topicsMatch(live, topic)) continue;
    const range = rangeFor(records, sourceById.get(id));
    if (!range) return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE, { topicId: id });
    patches.push({
      start: range.start,
      end: range.end,
      replacement:
        renderIntoSource(sourceById.get(id), portableText(id), eol) + source.slice(range.contentEnd, range.end)
    });
  }
  const removedIds = [...previousById.keys()].filter((id) => !liveIds.has(id));
  for (const id of removedIds) {
    const range = rangeFor(records, sourceById.get(id));
    if (!range) return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE, { topicId: id });
    patches.push({ start: range.start, end: range.end, replacement: "" });
  }
  const addedIds = liveOrder.filter((id) => !previousIds.has(id));

  const childList = new Map();
  for (const id of liveIds) childList.set(id, [...(graph.children.get(id) || [])]);
  const liveRoots = graph.forest.map((treeNode) => treeNode.id);
  const spatialSort = (left, right) =>
    liveNodes.get(left).y - liveNodes.get(right).y ||
    liveNodes.get(left).x - liveNodes.get(right).x ||
    String(left).localeCompare(String(right));
  liveRoots.sort(spatialSort);
  const liveRootIds = new Set(liveRoots);
  for (const [parentId, children] of childList) {
    childList.set(
      parentId,
      MarkdownOrder.orderChildren(
        liveNodes.get(parentId),
        children.map((id) => liveNodes.get(id)),
        liveRootIds.has(parentId)
      ).map((node) => node.id)
    );
  }

  const addedSet = new Set(addedIds);
  const addedPreorder = (rootId) => {
    const result = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop();
      result.push(id);
      const children = childList.get(id) || [];
      for (let index = children.length - 1; index >= 0; index--) {
        if (addedSet.has(children[index])) stack.push(children[index]);
      }
    }
    return result;
  };
  const renderAddedTree = (rootId, style) => {
    const out = [];
    const stack = [{ id: rootId, style, tail: true }];
    while (stack.length > 0) {
      const item = stack.pop();
      const text = portableText(item.id);
      // A block under a list item is written at that item's own indentation,
      // exactly as the encoder writes one, so the new topic cannot escape the
      // list level it was added into.
      const indent = item.style.kind === "list" ? item.style.indent || "" : "";
      let childStyle;
      if (item.tail) out.push("");
      if (isMediaOnly(text)) {
        out.push(`${indent}- ${text}`);
        childStyle = { kind: "list", indent: `${indent}  ` };
      } else if (isStructuralBlock(text)) {
        for (const line of text.split("\n")) out.push(`${indent}${line}`);
        childStyle = { kind: "list", indent: `${indent}  ` };
      } else if (item.style.kind === "heading" && item.style.level <= 6) {
        out.push(`${"#".repeat(item.style.level)} ${text}`);
        childStyle =
          item.style.level < 6 ? { kind: "heading", level: item.style.level + 1 } : { kind: "list", indent: "" };
      } else {
        out.push(`${indent}- ${text}`);
        childStyle = { kind: "list", indent: `${indent}  ` };
      }
      const children = (childList.get(item.id) || []).filter((id) => addedSet.has(id));
      for (let index = children.length - 1; index >= 0; index--)
        stack.push({ id: children[index], style: childStyle, tail: false });
    }
    return out.join("\n").replace(/^\n/, "");
  };

  const addedGroups = new Map();
  for (const id of addedIds) {
    const parentId = liveParents.get(id) || null;
    if (parentId && addedSet.has(parentId)) continue;
    if (parentId && !previousIds.has(parentId))
      return failure(MARKDOWN_CODEC_REASON.UNSUPPORTED_RESTRUCTURE, { topicId: id });
    const key = parentId || "";
    if (!addedGroups.has(key)) addedGroups.set(key, []);
    addedGroups.get(key).push(id);
  }

  const visualIndex = new Map(liveOrder.map((id, index) => [id, index]));
  const insertionPlans = [];
  for (const [parentKey, roots] of addedGroups) {
    const parentId = parentKey || null;
    let style = { kind: "heading", level: 1 };
    if (parentId) {
      const parentRecord = sourceById.get(parentId);
      if (!parentRecord) return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE, { topicId: parentId });
      style =
        parentRecord.kind === "heading" && Number(parentRecord.level) < 6
          ? { kind: "heading", level: Number(parentRecord.level) + 1 }
          : { kind: "list", indent: `${parentRecord.indent || ""}  ` };
    }
    const addedRoots = new Set(roots);
    const siblings = parentId ? childList.get(parentId) || [] : liveRoots;
    for (let index = 0; index < siblings.length; ) {
      if (!addedRoots.has(siblings[index])) {
        index++;
        continue;
      }
      const run = [];
      while (index < siblings.length && addedRoots.has(siblings[index])) run.push(siblings[index++]);
      const nextExisting = siblings.slice(index).find((id) => !addedSet.has(id)) || null;
      const previousExisting =
        siblings
          .slice(0, index - run.length)
          .reverse()
          .find((id) => !addedSet.has(id)) || null;
      let offset;
      if (nextExisting) offset = subtreeRanges.get(nextExisting)?.start;
      else if (previousExisting) offset = subtreeRanges.get(previousExisting)?.end;
      else if (parentId) offset = rangeFor(records, sourceById.get(parentId))?.end;
      else offset = source.length;
      if (offset === undefined || offset === null)
        return failure(MARKDOWN_CODEC_REASON.MISSING_SOURCE, { topicId: run[0] });
      insertionPlans.push({
        offset,
        desiredIndex: Math.min(...run.map((id) => visualIndex.get(id) ?? Number.MAX_SAFE_INTEGER)),
        rendered: run.map((id) => renderAddedTree(id, style)).join("\n\n"),
        newIds: run.flatMap(addedPreorder)
      });
    }
  }
  insertionPlans.sort((left, right) => left.offset - right.offset || left.desiredIndex - right.desiredIndex);
  const merged = [];
  for (const plan of insertionPlans) {
    const previousPlan = merged[merged.length - 1];
    if (previousPlan && previousPlan.offset === plan.offset) {
      previousPlan.rendered += `\n${plan.rendered}`;
      previousPlan.newIds.push(...plan.newIds);
    } else {
      merged.push({ ...plan, newIds: [...plan.newIds] });
    }
  }
  for (const plan of merged) {
    const prefix = plan.offset > 0 && !/[\r\n]$/.test(source.slice(0, plan.offset)) ? eol : "";
    patches.push({
      start: plan.offset,
      end: plan.offset,
      replacement: `${prefix}${plan.rendered.replace(/\n/g, eol)}${eol}`
    });
  }

  const orderEntries = (document.topicIds || [])
    .filter((id) => liveIds.has(id))
    .map((id) => ({ offset: rangeFor(records, sourceById.get(id))?.start ?? source.length, inserted: false, ids: [id] }));
  for (const plan of merged)
    orderEntries.push({ offset: plan.offset, inserted: true, desiredIndex: plan.desiredIndex, ids: plan.newIds });
  orderEntries.sort(
    (left, right) =>
      left.offset - right.offset ||
      Number(right.inserted) - Number(left.inserted) ||
      (left.desiredIndex ?? Number.MAX_SAFE_INTEGER) - (right.desiredIndex ?? Number.MAX_SAFE_INTEGER)
  );
  const sourceOrder = orderEntries.flatMap((entry) => entry.ids);

  patches.sort((left, right) => right.start - left.start || right.end - left.end);
  for (let index = 1; index < patches.length; index++) {
    if (patches[index - 1].start < patches[index].end)
      return failure(MARKDOWN_CODEC_REASON.UNSUPPORTED_RESTRUCTURE);
  }
  let patched = source;
  for (const patch of patches) patched = patched.slice(0, patch.start) + patch.replacement + patched.slice(patch.end);

  const withMetadata = markdownWithTopicMetadata(withoutLegacyPluginComments(patched), {
    topicIds: sourceOrder,
    topicKeys: sourceOrder.map((id) => identityKey(serializeTopicText(liveNodes.get(id)))),
    topicLabels: sourceOrder.map((id) => identityLabel(serializeTopicText(liveNodes.get(id))))
  });
  if (addedIds.length === 0 && removedIds.length === 0) {
    const reordered = planMarkdownTopicReorder(withMetadata, canvas, options);
    return reordered.ok
      ? success({ markdown: reordered.value.markdown, addedIds, removedIds })
      : success({ markdown: withMetadata, addedIds, removedIds });
  }
  return success({ markdown: withMetadata, addedIds, removedIds });
}

/**
 * Reorder sibling subtrees by moving their original source slices.
 *
 * The live depth is measured from the canonical forest first, iteratively, so a
 * deep map is refused with a typed reason before the recursive slice-moving
 * walk in `lib/markdown-order.js` can ask for more stack than the engine has.
 * No option raises that ceiling; a caller that needs a deeper reorder should
 * regenerate the document with `encodeMindMapMarkdown`, which is iterative end
 * to end.
 */
function planMarkdownTopicReorder(markdown, canvas, options = {}) {
  if (typeof markdown !== "string") return failure(MARKDOWN_CODEC_REASON.INVALID_INPUT);
  const budgeted = resolveBudgets(options);
  if (!budgeted.ok) return budgeted;
  const limit = Math.min(
    MARKDOWN_REORDER_DEPTH_CEILING,
    budgeted.value.maxDepth,
    budgeted.value.maxReorderDepth
  );
  const graph = canvasTopicGraph(canvas);
  const depth = graph.maxDepth;
  if (depth > limit)
    return failure(MARKDOWN_CODEC_REASON.DEPTH_BUDGET, { depth, maxDepth: limit });
  const reordered = MarkdownOrder.reorderPreservingSource(String(markdown), canvas, {
    getGroupIds,
    graph,
    parseDocument: (text) => {
      const parsed = decodeMarkdownMindMap(text);
      return parsed.ok ? parsed.value : { topicSources: [] };
    },
    lineRecords: (text) => lineRecords(String(text), 0),
    withMetadata: (text, ids, keys, labels) =>
      markdownWithTopicMetadata(text, { topicIds: ids, topicKeys: keys, topicLabels: labels }),
    withoutLegacyComments: withoutLegacyPluginComments,
    identityKey,
    identityLabel,
    nodeText: (node) => serializeTopicText(node)
  });
  return success({ markdown: reordered });
}

/**
 * Turn a decoded document into flat Canvas nodes and edges.
 *
 * Positions are not this module's concern, so the caller passes the layout
 * function it already uses for every other import. Root ids come from the
 * decoded roots directly instead of being rediscovered by scanning the edge
 * list, which keeps a wide map linear.
 */
function layoutMarkdownMindMap(document, options = {}) {
  const decoded = document && Array.isArray(document.roots) ? success(document) : decodeMarkdownMindMap(document, options);
  if (!decoded.ok) return decoded;
  const value = decoded.value;
  const shared = {
    frontmatter: value.frontmatter,
    topicIds: value.topicIds,
    topicKeys: value.topicKeys,
    topicLabels: value.topicLabels,
    topicSources: value.topicSources
  };
  if (value.empty) return success({ ...shared, nodes: [], edges: [], rootIds: [] });
  const layout = typeof options.layout === "function" ? options.layout : null;
  if (!layout) return failure(MARKDOWN_CODEC_REASON.LAYOUT_UNAVAILABLE);
  const nodes = [];
  const edges = [];
  const treeGap = Math.max(120, (Number(options.verticalGap) || 0) * 6);
  let currentY = 0;
  for (const root of value.roots) {
    currentY += layout(root, 0, currentY, options, nodes, edges) + treeGap;
  }
  return success({ ...shared, nodes, edges, rootIds: value.roots.map((root) => root.id) });
}

module.exports = {
  DEFAULT_MARKDOWN_BUDGETS,
  MARKDOWN_CODEC_REASON,
  canvasDataAdapter,
  canvasDataToMindMapMarkdown,
  canvasMatchesDocument,
  canvasOrderMatchesDocument,
  canonicalAnchor,
  canonicalAnchorMap,
  classifyMarkdownSource,
  convertMarkdownAnchorsToCardLinks,
  decodeMarkdownMindMap,
  encodeMindMapMarkdown,
  extractCanvasTopicPreorder,
  extractLocalMediaTargets,
  extractSelectedTopicForest,
  layoutMarkdownMindMap,
  markdownWithTopicMetadata,
  parseTopicResource,
  planMarkdownSourceUpdate,
  planMarkdownTopicReorder,
  protectMarkdownLiterals,
  reconcileCanvasData,
  serializeTopicText,
  topicIdentity,
  topicTitle,
  toggleTopicCheckbox,
  withoutLegacyPluginComments
};
