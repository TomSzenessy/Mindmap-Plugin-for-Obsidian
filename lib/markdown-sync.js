"use strict";

/**
 * Private ownership, indexing, and scheduling for Markdown/nested-map links.
 *
 * A `.canvas` link is untrusted input. Its syncId (and any opaque proof) is
 * public metadata, so equality with a target's frontmatter/card token is only
 * defense-in-depth. Authorization comes from `MarkdownSyncOwnership`, a
 * JSON-serializable registry kept in plugin loadData. The registry owns a
 * private CSPRNG secret and records bind the exact Canvas path, link kind,
 * target path, syncId, and optional parent card/node. A proof copied from a
 * different record therefore cannot pass the registry binding check.
 *
 * Nothing in this module writes vault or plugin data. Adoption returns the
 * exact target patch, public Canvas link, and private registry record/upsert;
 * the caller persists those together. Missing, stale, or ambiguous ownership
 * fails closed before target I/O. Frontmatter/card tokens remain optional
 * compatibility defenses, never the authorization proof.
 */

const MARKDOWN_EXTENSION = "md";
const CANVAS_EXTENSION = "canvas";
const SYNC_ID_PATTERN = /^[0-9a-z]{32}$/;
const SYNC_ID_LENGTH = 32;
const SYNC_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const PROOF_PATTERN = /^[0-9a-f]{32}\.[0-9a-f]{32}$/;
const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CARD_ID_LENGTH = 128;
const MAX_LINK_TARGET_BYTES = 5 * 1024 * 1024;
const MAX_LINK_NODES = 20000;
const MAX_LINK_EDGES = 40000;
const MAX_PATH_LENGTH = 4096;
const MAX_RECORDS = 10000;
const NESTED_MAP_CARD_KIND = "nested-map";
const CARD_KIND_KEY = "tomindmapCardKind";
/** The plugin-owned card field that remains defense-in-depth only. */
const CARD_SYNC_KEY = "tomindmapSyncId";
const PRIVATE_OWNERSHIP_KEYS = new Set(["secret", "secretCheck", "records", "ownership"]);
const OWNERSHIP_BLOCK_KEY = "tomindmap";
const OWNERSHIP_FIELD_KEY = "syncId";
const OWNERSHIP_FIELD_INDENT = "  ";
const OWNERSHIP_SCHEMA = "tomindmap.markdown-sync-ownership";
const OWNERSHIP_VERSION = 1;
const OWNERSHIP_KIND = Object.freeze({
  MARKDOWN: "markdown",
  PARENT: "parent"
});
// A startup scan of a very large vault must not build an unbounded index.
const DEFAULT_INDEX_LIMIT = 5000;
const DEFAULT_DEBOUNCE_MS = 350;
const MAX_SYNC_ATTEMPTS = 3;
const MAX_DRAIN_PASSES = 8;

/** Typed outcomes shared by every link decision and sync result. */
const LINK_REASON = {
  NO_LINK: "no-link",
  UNCANONICAL_PATH: "uncanonical-path",
  NOT_MARKDOWN: "not-markdown",
  UNOWNED_LINK: "unowned-link",
  MISSING_REGISTRY: "missing-registry",
  STALE_REGISTRY: "stale-registry",
  RECORD_MISSING: "record-missing",
  RECORD_INVALID: "record-invalid",
  WRONG_CANVAS: "wrong-canvas",
  WRONG_TARGET: "wrong-target",
  WRONG_KIND: "wrong-kind",
  WRONG_CARD: "wrong-card",
  UNOWNED_TARGET: "unowned-target",
  MALFORMED_TARGET: "malformed-target",
  ALREADY_OWNED: "already-owned",
  NEEDS_CONFIRMATION: "needs-confirmation",
  MISSING_TARGET: "missing-target",
  NOT_CANVAS: "not-canvas",
  NO_PARENT_CARD: "no-parent-card",
  DETACHED: "detached",
  CONFLICT: "conflict",
  EDITING: "editing",
  DECODE: "decode",
  FAILED: "failed",
  NO_PENDING: "no-pending",
  DISPOSING: "disposing",
  DRAIN_LIMIT: "drain-limit",
  UNSAVED: "unsaved"
};


function reject(reason) {
  return { ok: false, reason };
}

/**
 * Control characters never occur in a filename this plugin writes, cannot name
 * a real vault entry, and can hide a segment from a reader.
 *
 * A literal `%` is deliberately allowed: the plugin's own path generator emits
 * names like `100% done.md` from the topic title, and a vault lookup is exact —
 * nothing decodes a path before the segments have been checked, so `%2e%2e` is
 * just a folder whose name happens to look like an escape.
 */
function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * A vault path is canonical when it is relative, uses Obsidian's `/`
 * separator, and names a real location without traversal, empty, or dot
 * segments. Anything else is rejected before the vault is ever consulted.
 */
function isCanonicalVaultPath(path) {
  if (typeof path !== "string") return false;
  const value = path;
  if (!value || value.length > MAX_PATH_LENGTH || value.startsWith("/") || value.includes("\\"))
    return false;
  if (/^[A-Za-z]:/.test(value) || hasControlCharacter(value)) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

function extensionOf(path) {
  const name = String(path ?? "").split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Obsidian models a vault entry as a `TFile` carrying a string extension. */
function isFileEntry(entry) {
  return Boolean(entry) && typeof entry.extension === "string";
}

function resolveVaultFile(vault, path, extension) {
  if (typeof vault?.getAbstractFileByPath !== "function") return null;
  let entry;
  try {
    entry = vault.getAbstractFileByPath(path);
  } catch (_) {
    return null;
  }
  if (!isFileEntry(entry)) return null;
  if (typeof entry.path !== "string" || entry.path !== path) return null;
  if (String(entry.extension).toLowerCase() !== extension) return null;
  return entry;
}

/**
 * Mint an unpredictable ownership token. Links recorded before tokens existed
 * are migrated by issuing a fresh one, so a shared Canvas can only carry a
 * token this installation made up itself.
 */
function createSyncId() {
  const hex = randomHex(SYNC_ID_LENGTH);
  if (!hex) return "";
  let id = "";
  for (let index = 0; index < SYNC_ID_LENGTH * 2; index += 2)
    id += SYNC_ID_ALPHABET[Number.parseInt(hex.slice(index, index + 2), 16) % SYNC_ID_ALPHABET.length];
  return id;
}

/**
 * The ownership frontmatter codec.
 *
 * Obsidian reads YAML, but this module must stay dependency-free and must not
 * guess: a value is only a claim when it is a single, well-formed, non-empty
 * scalar under the plugin's own key. Anything ambiguous — two blocks, two
 * keys, an unterminated document, a value that is not a plain string — is
 * refused instead of resolved, because resolving it would let the writer pick
 * which claim counts.
 */
const BOM = "\uFEFF";
const FRONTMATTER_OPEN = /^---[ \t]*(?:\r\n|\n|\r)/;
const FRONTMATTER_CLOSE = /^---[ \t]*$/;
const FRONTMATTER_END = /^\.\.\.[ \t]*$/;
const MAPPING_ENTRY = /^([ \t]*)("?)([A-Za-z0-9_.-]+)\2[ \t]*:(?:[ \t]+(.*?))?[ \t]*$/;
// A double-quoted scalar may carry only the escapes a single token needs.
const DOUBLE_QUOTED = /^"((?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)"[ \t]*(?:#.*)?$/;
const SINGLE_QUOTED = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/;
const PLAIN_SCALAR = /^[A-Za-z0-9_-]{1,64}$/;
// Unquoted words YAML would read as something other than a string.
const RESERVED_PLAIN = /^(?:true|false|yes|no|on|off|null|~)$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function stripBom(text) {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/** One physical line, with the offsets a byte-preserving edit needs. */
function readLine(source, start) {
  let end = start;
  while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end++;
  let next = end;
  if (source[end] === "\r" && source[end + 1] === "\n") next = end + 2;
  else if (end < source.length) next = end + 1;
  return { start, end, next, text: source.slice(start, end) };
}

/**
 * Locate the frontmatter block. It is only frontmatter when it opens on the
 * very first line of the document, so a `---` inside the body can never be
 * mistaken for a claim.
 */
function frontmatterRegion(source) {
  const opening = FRONTMATTER_OPEN.exec(source);
  if (!opening) return { state: "absent" };
  const bodyStart = opening[0].length;
  let cursor = bodyStart;
  while (cursor <= source.length) {
    const line = readLine(source, cursor);
    if (FRONTMATTER_CLOSE.test(line.text) || FRONTMATTER_END.test(line.text))
      return {
        state: "present",
        bodyStart,
        bodyEnd: cursor,
        contentStart: line.next
      };
    if (line.next <= cursor) break;
    cursor = line.next;
  }
  return { state: "unterminated", bodyStart };
}

function frontmatterLines(source, region) {
  const lines = [];
  for (let cursor = region.bodyStart; cursor < region.bodyEnd; ) {
    const line = readLine(source, cursor);
    lines.push(line);
    if (line.next <= cursor) break;
    cursor = line.next;
  }
  return lines;
}

/** `key: value`, `key:`, or nothing at all. A trailing comment is not a value. */
function splitMappingEntry(text) {
  const match = MAPPING_ENTRY.exec(text);
  if (!match) return null;
  const value = String(match[4] ?? "").trim();
  return {
    indent: match[1],
    key: match[3],
    value: value.startsWith("#") ? "" : value
  };
}

/** The line ending the document already uses, so a patch never mixes styles. */
function documentEol(source) {
  if (source.includes("\r\n")) return "\r\n";
  if (source.includes("\r")) return "\r";
  return "\n";
}

/**
 * The single plugin-owned block, or `null` when the document has none. A
 * second block, or a top-level line that is not a mapping entry at all, is
 * ambiguous: both are reported as malformed rather than resolved.
 */
function findOwnershipBlock(lines) {
  let index = -1;
  let mapping = true;
  let ended = false;
  for (let position = 0; position < lines.length; position++) {
    const text = lines[position].text;
    if (text.trim() === "" || text.trim().startsWith("#")) continue;
    const topLevel = !/^[ \t]/.test(text);
    if (!topLevel) {
      // Unrelated frontmatter before the plugin block is untrusted input, not
      // a reason to reject the document. Once the block starts, however, an
      // indented non-mapping line is ambiguous plugin data.
      if (index >= 0 && !ended && !splitMappingEntry(text)) return null;
      continue;
    }
    const entry = splitMappingEntry(text);
    if (!entry) {
      // Before the plugin block, lists, block-scalar continuations, and other
      // unrelated YAML are ignored. Once it starts, ambiguity is malformed.
      if (index >= 0) return null;
      continue;
    }
    if (entry.key !== OWNERSHIP_BLOCK_KEY) {
      if (index >= 0) ended = true;
      continue;
    }
    // Two top-level plugin blocks are ambiguous even if unrelated YAML sits
    // between them.
    if (index >= 0) return null;
    mapping = entry.value === "";
    index = position;
  }
  if (index < 0) return { index: -1, mapping: true };
  if (!mapping) return { index: -1, mapping: false };
  return { index, mapping: true };
}

/**
 * Every ownership key inside the plugin block, at any depth, so a claim that
 * was buried under another key still counts. More than one is ambiguous.
 */
function ownershipFields(lines, blockIndex) {
  const fields = [];
  for (let position = blockIndex + 1; position < lines.length; position++) {
    const text = lines[position].text;
    if (text.trim() === "") continue;
    if (!/^[ \t]/.test(text)) break;
    if (text.trim().startsWith("#")) continue;
    const entry = splitMappingEntry(text);
    if (!entry) return null;
    if (entry.key === OWNERSHIP_FIELD_KEY)
      fields.push({ value: entry.value, line: lines[position], indent: entry.indent });
  }
  return fields;
}

function hasPrivateOwnershipFields(lines, blockIndex) {
  for (let position = blockIndex + 1; position < lines.length; position++) {
    const text = lines[position].text;
    if (text.trim() === "") continue;
    if (!/^[ \t]/.test(text)) break;
    if (text.trim().startsWith("#")) continue;
    const entry = splitMappingEntry(text);
    if (!entry) return true;
    if (PRIVATE_OWNERSHIP_KEYS.has(entry.key)) return true;
  }
  return false;
}

function unescapeDoubleQuoted(body) {
  const simple = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t"
  };
  let result = "";
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escape = body[++index];
    if (escape === "u") {
      const code = body.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(code)) return null;
      result += String.fromCharCode(Number.parseInt(code, 16));
      index += 4;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(simple, escape)) return null;
    result += simple[escape];
  }
  return result;
}

/**
 * Decode one ownership scalar, or `null` for anything that is not exactly one
 * non-empty string: a non-string YAML value, a broken escape, an alias, a tag,
 * or a block scalar.
 */
function decodeSyncIdScalar(raw) {
  const value = String(raw ?? "").trim();
  let decoded = null;
  const double = DOUBLE_QUOTED.exec(value);
  if (double) decoded = unescapeDoubleQuoted(double[1]);
  else {
    const single = SINGLE_QUOTED.exec(value);
    if (single) decoded = single[1].replace(/''/g, "'");
    else if (PLAIN_SCALAR.test(value) && !RESERVED_PLAIN.test(value))
      decoded = value;
  }
  if (decoded === null || decoded === "") return null;
  if (CONTROL_CHARACTERS.test(decoded)) return null;
  return decoded;
}

/**
 * Encode a value as the double-quoted scalar this module writes, escaping
 * everything a YAML reader could otherwise reinterpret. The result is exactly
 * what `decodeSyncIdScalar` accepts.
 */
function encodeSyncIdScalar(value) {
  const text = String(value ?? "");
  let encoded = '"';
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    const code = text.charCodeAt(index);
    if (character === '"' || character === "\\") encoded += `\\${character}`;
    else if (character === "\n") encoded += "\\n";
    else if (character === "\r") encoded += "\\r";
    else if (character === "\t") encoded += "\\t";
    else if (code < 0x20 || code === 0x7f)
      encoded += `\\u${code.toString(16).padStart(4, "0")}`;
    else encoded += character;
  }
  return `${encoded}"`;
}

/**
 * Read the ownership token a Markdown document claims for itself.
 *
 * @returns {{ok:true, syncId:string|null}|{ok:false, reason:string}}
 *   `syncId: null` means the document claims nothing; a `reason` means it
 *   claims something this module refuses to interpret exactly.
 */
function parseFrontmatterOwnership(text) {
  const source = stripBom(String(text ?? ""));
  const region = frontmatterRegion(source);
  if (region.state === "absent") return { ok: true, syncId: null };
  if (region.state !== "present") return reject(LINK_REASON.MALFORMED_TARGET);
  const lines = frontmatterLines(source, region);
  const block = findOwnershipBlock(lines);
  if (!block) return reject(LINK_REASON.MALFORMED_TARGET);
  if (block.index < 0) return { ok: true, syncId: null };
  if (hasPrivateOwnershipFields(lines, block.index))
    return reject(LINK_REASON.MALFORMED_TARGET);
  const fields = ownershipFields(lines, block.index);
  if (fields === null || fields.length > 1)
    return reject(LINK_REASON.MALFORMED_TARGET);
  if (fields.length === 0) return { ok: true, syncId: null };
  const decoded = decodeSyncIdScalar(fields[0].value);
  if (decoded === null) return reject(LINK_REASON.MALFORMED_TARGET);
  return { ok: true, syncId: decoded };
}

/**
 * The frontmatter lines that record a token, for a caller that writes the
 * plugin's whole metadata block itself. `null` for a value that is not a token.
 */
function syncIdFrontmatterLines(syncId) {
  if (typeof syncId !== "string" || !SYNC_ID_PATTERN.test(syncId)) return null;
  return [
    `${OWNERSHIP_BLOCK_KEY}:`,
    `${OWNERSHIP_FIELD_INDENT}${OWNERSHIP_FIELD_KEY}: ${encodeSyncIdScalar(syncId)}`
  ];
}

/**
 * Return the document that claims `syncId`, without touching the input. Only
 * the ownership key is added or replaced: the body, the byte order mark, the
 * line endings, and every other frontmatter key survive unchanged.
 *
 * @returns {{ok:true, markdown:string}|{ok:false, reason:string}}
 */
function patchSyncIdOwnership(text, syncId) {
  if (typeof syncId !== "string" || !SYNC_ID_PATTERN.test(syncId))
    return reject(LINK_REASON.UNOWNED_LINK);
  const original = String(text ?? "");
  const bom = original.startsWith(BOM) ? BOM : "";
  const source = bom ? original.slice(1) : original;
  const eol = documentEol(source);
  const blockLine = `${OWNERSHIP_BLOCK_KEY}:`;
  const field = `${OWNERSHIP_FIELD_INDENT}${OWNERSHIP_FIELD_KEY}: ${encodeSyncIdScalar(syncId)}`;
  const region = frontmatterRegion(source);
  if (region.state === "unterminated")
    return reject(LINK_REASON.MALFORMED_TARGET);
  if (region.state === "absent") {
    const separator = source === "" ? "" : eol;
    return {
      ok: true,
      markdown: `${bom}---${eol}${blockLine}${eol}${field}${eol}---${eol}${separator}${source}`
    };
  }
  const lines = frontmatterLines(source, region);
  const block = findOwnershipBlock(lines);
  // A plugin key that is not a mapping can neither be read nor extended, so it
  // is never patched: a second `tomindmap:` key would be a duplicate claim.
  if (!block || !block.mapping) return reject(LINK_REASON.MALFORMED_TARGET);
  if (block.index >= 0 && hasPrivateOwnershipFields(lines, block.index))
    return reject(LINK_REASON.MALFORMED_TARGET);
  if (block.index < 0) {
    // No plugin block yet: add one at the end of the frontmatter, which keeps
    // every existing key exactly where its author put it.
    const body = source.slice(region.bodyStart, region.bodyEnd);
    const lead = body === "" || /(?:\r\n|\n|\r)$/.test(body) ? "" : eol;
    const addition = `${lead}${blockLine}${eol}${field}${eol}`;
    return {
      ok: true,
      markdown: `${bom}${source.slice(0, region.bodyEnd)}${addition}${source.slice(region.bodyEnd)}`
    };
  }
  const fields = ownershipFields(lines, block.index);
  if (fields === null || fields.length > 1)
    return reject(LINK_REASON.MALFORMED_TARGET);
  if (fields.length === 0) {
    const anchor = lines[block.index];
    // Insert with the ending the block itself uses, not a guessed one.
    const lineEol = source.startsWith("\r\n", anchor.end)
      ? "\r\n"
      : source[anchor.end] === "\r"
        ? "\r"
        : "\n";
    return {
      ok: true,
      markdown: `${bom}${source.slice(0, anchor.next)}${field}${lineEol}${source.slice(anchor.next)}`
    };
  }
  const existing = fields[0];
  const replacement = `${existing.indent}${OWNERSHIP_FIELD_KEY}: ${encodeSyncIdScalar(syncId)}`;
  return {
    ok: true,
    markdown: `${bom}${source.slice(0, existing.line.start)}${replacement}${source.slice(existing.line.end)}`
  };
}

/* ------------------------------------------------------------------------- *
 * Private ownership registry
 * ------------------------------------------------------------------------- */

/**
 * The registry is deliberately separate from every public link.  The secret
 * and the complete record set are kept in a WeakMap closure, so neither is
 * accidentally copied by a spread, a Canvas patch, or a Markdown frontmatter
 * codec.  `toJSON()` is the one explicit persistence boundary for loadData.
 */
const OWNERSHIP_STATES = new WeakMap();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(record) {
  return {
    canvasPath: record.canvasPath,
    kind: record.kind,
    targetPath: record.targetPath,
    syncId: record.syncId,
    nodeId: record.nodeId,
    proof: record.proof,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function isTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function timestamp(now) {
  if (now === null || now === undefined) return Date.now();
  const value = typeof now === "function" ? now() : now;
  const number = Number(value);
  return isTimestamp(number) ? number : Date.now();
}

/** Generate lowercase hex without requiring Node's crypto module. */
function randomHex(byteLength, random = null) {
  const bytes = new Uint8Array(byteLength);
  try {
    const source = globalThis.crypto;
    if (typeof random === "function") {
      const supplied = random(byteLength);
      if (supplied instanceof Uint8Array) bytes.set(supplied.subarray(0, byteLength));
      else if (Array.isArray(supplied)) {
        for (let index = 0; index < byteLength; index++)
          bytes[index] = Number(supplied[index]) & 0xff;
      } else return "";
    } else if (source && typeof source.getRandomValues === "function") {
      source.getRandomValues(bytes);
    } else return "";
  } catch (_) {
    return "";
  }
  let result = "";
  for (let index = 0; index < bytes.length; index++)
    result += bytes[index].toString(16).padStart(2, "0");
  return result;
}

function unsignedHex(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * Dependency-free digest used as a local corruption guard.  The secret never
 * leaves private plugin data; this is intentionally not a security boundary
 * against arbitrary JavaScript running in the same Obsidian process.
 */
function opaqueDigest(input) {
  const text = String(input);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  let c = 0x85ebca6b;
  let d = 0xc2b2ae35;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ (code + index), 0x85ebca6b);
    c = Math.imul(c ^ (code + 0x9e37), 0xc2b2ae35);
    d = Math.imul(d ^ (code ^ 0x27d4eb2f), 0x165667b1);
  }
  return `${unsignedHex(a)}${unsignedHex(b)}${unsignedHex(c)}${unsignedHex(d)}`;
}

function recordMaterial(record) {
  return JSON.stringify([
    record.canvasPath,
    record.kind,
    record.targetPath,
    record.syncId,
    record.nodeId ?? null,
    record.createdAt,
    record.updatedAt
  ]);
}

function proofFor(secret, record, random) {
  const nonce = randomHex(16, random);
  const digest = opaqueDigest(`${secret}\u0000${nonce}\u0000${recordMaterial(record)}`);
  return `${nonce}.${digest}`;
}

function validSecret(secret, check) {
  return typeof secret === "string" && SECRET_PATTERN.test(secret) &&
    typeof check === "string" && /^[0-9a-f]{32}$/.test(check) &&
    check === opaqueDigest(`tomindmap-secret\\u0000${secret}`);
}

function normalizeNodeId(nodeId, kind) {
  if (kind === OWNERSHIP_KIND.MARKDOWN) return null;
  return typeof nodeId === "string" && nodeId.length > 0 &&
    nodeId.length <= MAX_CARD_ID_LENGTH && !hasControlCharacter(nodeId)
    ? nodeId
    : null;
}

function normalizeBinding(binding) {
  if (!isObject(binding)) return null;
  const kind = binding.kind;
  if (kind !== OWNERSHIP_KIND.MARKDOWN && kind !== OWNERSHIP_KIND.PARENT)
    return null;
  if (typeof binding.canvasPath !== "string" ||
      !isCanonicalVaultPath(binding.canvasPath) ||
      extensionOf(binding.canvasPath) !== CANVAS_EXTENSION)
    return null;
  const expectedExtension = kind === OWNERSHIP_KIND.MARKDOWN
    ? MARKDOWN_EXTENSION
    : CANVAS_EXTENSION;
  if (typeof binding.targetPath !== "string" ||
      !isCanonicalVaultPath(binding.targetPath) ||
      extensionOf(binding.targetPath) !== expectedExtension)
    return null;
  if (typeof binding.syncId !== "string" || !SYNC_ID_PATTERN.test(binding.syncId))
    return null;
  const nodeId = binding.nodeId === undefined ? null : binding.nodeId;
  if (kind === OWNERSHIP_KIND.MARKDOWN && nodeId !== null) return null;
  if (kind === OWNERSHIP_KIND.PARENT && binding.targetPath === binding.canvasPath) return null;
  if (kind === OWNERSHIP_KIND.PARENT && !normalizeNodeId(nodeId, kind)) return null;
  return {
    canvasPath: binding.canvasPath,
    kind,
    targetPath: binding.targetPath,
    syncId: binding.syncId,
    nodeId
  };
}

function normalizeRecord(raw, secret) {
  if (!isObject(raw)) return null;
  const binding = normalizeBinding(raw);
  if (!binding) return null;
  if (typeof raw.proof !== "string" || !PROOF_PATTERN.test(raw.proof)) return null;
  if (!isTimestamp(raw.createdAt) || !isTimestamp(raw.updatedAt)) return null;
  const record = { ...binding, proof: raw.proof, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  if (proofForDigest(secret, record) !== record.proof) return null;
  return record;
}

function proofForDigest(secret, record) {
  const [nonce, digest] = String(record.proof).split(".");
  return `${nonce}.${opaqueDigest(`${secret}\u0000${nonce}\u0000${recordMaterial(record)}`)}`;
}

function sameNode(left, right) {
  return (left.nodeId ?? null) === (right.nodeId ?? null);
}

function sameRecord(left, right) {
  return left.canvasPath === right.canvasPath && left.kind === right.kind &&
    left.targetPath === right.targetPath && left.syncId === right.syncId &&
    sameNode(left, right) && left.proof === right.proof &&
    left.createdAt === right.createdAt && left.updatedAt === right.updatedAt;
}

/** A target has one private owner unless replacement is explicit. */
function recordsConflict(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === OWNERSHIP_KIND.MARKDOWN) {
    // One Canvas has one Markdown link, and one Markdown target has one
    // authorizing Canvas. The second rule is what revokes a copied link.
    return left.targetPath === right.targetPath || left.canvasPath === right.canvasPath;
  }
  return left.targetPath === right.targetPath && sameNode(left, right);
}

function createOwnershipState(options = {}) {
  const testOnlyRandom = options.testOnly === true &&
    typeof options.testOnlyRandom === "function"
    ? options.testOnlyRandom
    : null;
  const secret = randomHex(32, testOnlyRandom);
  return {
    schema: OWNERSHIP_SCHEMA,
    version: OWNERSHIP_VERSION,
    secret,
    secretCheck: opaqueDigest(`tomindmap-secret\\u0000${secret}`),
    createdAt: timestamp(options.now),
    updatedAt: timestamp(options.now),
    stale: false,
    now: options.now ?? null,
    testOnlyRandom,
    records: []
  };
}

function parseOwnershipState(data) {
  if (!isObject(data) || data.schema !== OWNERSHIP_SCHEMA ||
      data.version !== OWNERSHIP_VERSION ||
      (data.stale !== undefined && data.stale !== false) ||
      !validSecret(data.secret, data.secretCheck) ||
      !isTimestamp(data.createdAt) || !isTimestamp(data.updatedAt) ||
      data.updatedAt < data.createdAt ||
      !Array.isArray(data.records) || data.records.length > MAX_RECORDS)
    return null;
  const records = [];
  const seenTargets = new Set();
  const seenCanvases = new Set();
  const seenParents = new Set();
  for (const raw of data.records) {
    let record;
    try {
      record = normalizeRecord(raw, data.secret);
    } catch (_) {
      return null;
    }
    if (!record) return null;
    const parentKey = JSON.stringify([record.targetPath, record.nodeId ?? null]);
    if (record.kind === OWNERSHIP_KIND.MARKDOWN) {
      if (seenTargets.has(record.targetPath) || seenCanvases.has(record.canvasPath)) return null;
      seenTargets.add(record.targetPath);
      seenCanvases.add(record.canvasPath);
    } else {
      if (seenParents.has(parentKey)) return null;
      seenParents.add(parentKey);
    }
    records.push(record);
  }
  return {
    schema: OWNERSHIP_SCHEMA,
    version: OWNERSHIP_VERSION,
    secret: data.secret,
    secretCheck: data.secretCheck,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    stale: false,
    now: null,
    testOnlyRandom: null,
    records
  };
}

function ownershipPublicLink(record, includeCanvasPath = false) {
  const link = {
    syncId: record.syncId,
    proof: record.proof,
    ownership: { source: "plugin-data" }
  };
  if (includeCanvasPath) link.canvasPath = record.canvasPath;
  if (record.kind === OWNERSHIP_KIND.MARKDOWN) link.path = record.targetPath;
  else {
    link.canvas = record.targetPath;
    link.nodeId = record.nodeId;
  }
  return link;
}

function ownershipLookup(state, binding, proof) {
  if (!state) return reject(LINK_REASON.MISSING_REGISTRY);
  if (state.stale) return reject(LINK_REASON.STALE_REGISTRY);
  const records = state.records;
  if (records.length === 0) return reject(LINK_REASON.RECORD_MISSING);
  const canvasRecords = records.filter((record) => record.canvasPath === binding.canvasPath);
  if (canvasRecords.length === 0) return reject(LINK_REASON.WRONG_CANVAS);
  const kindRecords = canvasRecords.filter((record) => record.kind === binding.kind);
  if (kindRecords.length === 0) return reject(LINK_REASON.WRONG_KIND);
  const targetRecords = kindRecords.filter((record) => record.targetPath === binding.targetPath);
  if (targetRecords.length === 0) return reject(LINK_REASON.WRONG_TARGET);
  const syncRecords = targetRecords.filter((record) => record.syncId === binding.syncId);
  if (syncRecords.length === 0) return reject(LINK_REASON.RECORD_MISSING);
  const cardRecords = binding.kind === OWNERSHIP_KIND.PARENT
    ? syncRecords.filter((record) => sameNode(record, binding))
    : syncRecords;
  if (cardRecords.length === 0) return reject(LINK_REASON.WRONG_CARD);
  const record = cardRecords.find((candidate) => candidate.proof === proof);
  if (!record) return reject(LINK_REASON.RECORD_INVALID);
  return { ok: true, record };
}

function ownershipConflicts(state, binding) {
  const conflicts = [];
  for (const record of state.records) {
    if (record.canvasPath === binding.canvasPath && record.kind === binding.kind &&
        record.targetPath === binding.targetPath && sameNode(record, binding)) {
      conflicts.push(record);
      continue;
    }
    const candidate = { ...binding, nodeId: binding.nodeId ?? null };
    if (recordsConflict(record, candidate)) conflicts.push(record);
  }
  return conflicts.map(cloneRecord);
}

/**
 * JSON-safe private ownership registry.
 *
 * Integration boundary:
 *   const registry = MarkdownSyncOwnership.fromJSON(loadData()?.markdownSyncOwnership)
 *     ?? createMarkdownSyncOwnership();
 *   await saveData({ ...data, markdownSyncOwnership: registry.toJSON() });
 *
 * `toJSON()` is the only representation that contains the private secret;
 * resolver/adoption results never do.
 */
class MarkdownSyncOwnership {
  constructor(data = null, options = {}) {
    const state = data === null || data === undefined
      ? createOwnershipState(options)
      : parseOwnershipState(data);
    OWNERSHIP_STATES.set(this, state);
  }

  static create(options = {}) {
    return new MarkdownSyncOwnership(null, options);
  }

  static fromJSON(data) {
    if (parseOwnershipState(data) === null) return null;
    return new MarkdownSyncOwnership(data);
  }

  static deserialize(data) {
    return MarkdownSyncOwnership.fromJSON(data);
  }

  static load(data) {
    return MarkdownSyncOwnership.fromJSON(data);
  }

  isValid() {
    const state = OWNERSHIP_STATES.get(this);
    return state !== null && parseOwnershipState(this.toJSON()) !== null;
  }

  isStale(now = Date.now(), maxAgeMs = null) {
    if (!this.isValid()) return true;
    const state = OWNERSHIP_STATES.get(this);
    return Number.isFinite(maxAgeMs) && maxAgeMs >= 0 &&
      Number(now) - state.updatedAt > maxAgeMs;
  }

  markStale() {
    const state = OWNERSHIP_STATES.get(this);
    if (!state) return false;
    state.stale = true;
    return true;
  }

  toJSON() {
    const state = OWNERSHIP_STATES.get(this);
    if (!state) return null;
    return {
      schema: state.schema,
      version: state.version,
      secret: state.secret,
      secretCheck: state.secretCheck,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      stale: state.stale,
      records: state.records.map(cloneRecord)
    };
  }

  serialize() {
    return this.toJSON();
  }

  get records() {
    const state = OWNERSHIP_STATES.get(this);
    return state ? state.records.map(cloneRecord) : [];
  }

  recordsForCanvas(canvasPath) {
    return this.records.filter((record) => record.canvasPath === canvasPath);
  }

  find(binding, proof = null) {
    const state = OWNERSHIP_STATES.get(this);
    const normalized = normalizeBinding(binding);
    if (!normalized || !state) return null;
    const found = ownershipLookup(state, normalized, proof);
    return found.record ? cloneRecord(found.record) : null;
  }

  issueRecord(binding, { now = null } = {}) {
    const state = OWNERSHIP_STATES.get(this);
    if (!state) return reject(LINK_REASON.STALE_REGISTRY);
    const normalized = normalizeBinding(binding);
    if (!normalized) return reject(LINK_REASON.RECORD_INVALID);
    const at = timestamp(state.now ?? now);
    const record = {
      ...normalized,
      proof: "",
      createdAt: at,
      updatedAt: at
    };
    record.proof = proofFor(state.secret, record, state.testOnlyRandom);
    if (normalizeRecord(record, state.secret) === null)
      return reject(LINK_REASON.RECORD_INVALID);
    return { ok: true, record: cloneRecord(record) };
  }

  upsert(input, { replaceExisting = false } = {}) {
    const state = OWNERSHIP_STATES.get(this);
    if (!state || !this.isValid()) return reject(LINK_REASON.STALE_REGISTRY);
    const envelope = isObject(input) && isObject(input.record) ? input : null;
    const record = envelope ? input.record : input;
    const shouldReplace = envelope && envelope.replaceExisting === true
      ? true
      : replaceExisting;
    const normalized = normalizeRecord(record, state.secret);
    if (!normalized) return reject(LINK_REASON.RECORD_INVALID);
    const exact = state.records.find((candidate) =>
      candidate.proof === normalized.proof &&
      candidate.canvasPath === normalized.canvasPath &&
      candidate.kind === normalized.kind &&
      candidate.targetPath === normalized.targetPath
    );
    if (exact) return { ok: true, record: cloneRecord(exact), replaces: [] };
    const conflicts = ownershipConflicts(state, normalized);
    if (conflicts.length > 0 && !shouldReplace)
      return { ok: false, reason: LINK_REASON.ALREADY_OWNED, replaces: conflicts };
    if (conflicts.length === 0) {
      const exact = state.records.find((candidate) => candidate.proof === normalized.proof);
      if (exact) return { ok: true, record: cloneRecord(exact), replaces: [] };
    }
    const removed = conflicts.map(cloneRecord);
    state.records = state.records.filter((candidate) =>
      !conflicts.some((conflict) => sameRecord(candidate, conflict))
    );
    state.records.push(normalized);
    state.updatedAt = timestamp(state.now);
    return { ok: true, record: cloneRecord(normalized), replaces: removed };
  }

  removeCanvas(canvasPath) {
    const state = OWNERSHIP_STATES.get(this);
    if (!state || !this.isValid())
      return reject(LINK_REASON.STALE_REGISTRY);
    if (!isCanonicalVaultPath(canvasPath) || extensionOf(canvasPath) !== CANVAS_EXTENSION)
      return reject(LINK_REASON.UNCANONICAL_PATH);
    const removed = state.records.filter((record) => record.canvasPath === canvasPath).map(cloneRecord);
    state.records = state.records.filter((record) => record.canvasPath !== canvasPath);
    if (removed.length > 0) state.updatedAt = timestamp(state.now);
    return { ok: true, records: removed };
  }

  renameCanvas(oldPath, newPath, { replaceExisting = false } = {}) {
    const state = OWNERSHIP_STATES.get(this);
    if (!state || !this.isValid()) return reject(LINK_REASON.STALE_REGISTRY);
    if (!isCanonicalVaultPath(oldPath) || !isCanonicalVaultPath(newPath) ||
        extensionOf(oldPath) !== CANVAS_EXTENSION || extensionOf(newPath) !== CANVAS_EXTENSION)
      return reject(LINK_REASON.UNCANONICAL_PATH);
    if (oldPath === newPath)
      return { ok: true, records: [], links: [], parentLinks: [] };
    const moving = state.records.filter((record) => record.canvasPath === oldPath);
    if (moving.length === 0) return reject(LINK_REASON.RECORD_MISSING);
    const atNewPath = state.records.filter((record) => record.canvasPath === newPath);
    const conflicts = atNewPath.filter((existing) =>
      moving.some((record) => recordsConflict(existing, record))
    );
    if (conflicts.length > 0 && !replaceExisting)
      return { ok: false, reason: LINK_REASON.ALREADY_OWNED, replaces: conflicts.map(cloneRecord) };
    const removed = conflicts.map(cloneRecord);
    state.records = state.records.filter((record) =>
      !conflicts.some((conflict) => sameRecord(record, conflict))
    );
    const moved = moving.map((record) => {
      const next = { ...record, canvasPath: newPath, updatedAt: timestamp(state.now), proof: "" };
      next.proof = proofFor(state.secret, next, state.testOnlyRandom);
      return next;
    });
    state.records = state.records.filter((record) => record.canvasPath !== oldPath).concat(moved);
    state.updatedAt = timestamp(state.now);
    return {
      ok: true,
      records: moved.map(cloneRecord),
      links: moved
        .filter((record) => record.kind === OWNERSHIP_KIND.MARKDOWN)
        .map((record) => ownershipPublicLink(record, true)),
      parentLinks: moved
        .filter((record) => record.kind === OWNERSHIP_KIND.PARENT)
        .map((record) => ownershipPublicLink(record, true)),
      replaces: removed
    };
  }

  migrateCanvas(oldPath, newPath, options = {}) {
    return this.renameCanvas(oldPath, newPath, options);
  }
}

const OwnershipRegistry = MarkdownSyncOwnership;

function createMarkdownSyncOwnership(options = {}) {
  return new MarkdownSyncOwnership(null, options);
}

function loadMarkdownSyncOwnership(data) {
  return MarkdownSyncOwnership.fromJSON(data);
}

function isVault(value) {
  return isObject(value) && typeof value.getAbstractFileByPath === "function" &&
    typeof value.cachedRead === "function";
}

function isOwnership(value) {
  return value instanceof MarkdownSyncOwnership;
}

function coerceOwnership(value) {
  if (isOwnership(value)) return value;
  if (isObject(value) && value.schema === OWNERSHIP_SCHEMA)
    return new MarkdownSyncOwnership(value);
  return null;
}

function resolveArguments(second, third, fourth, fifth) {
  // Canonical form: (currentCanvasPath, registry, vault).
  const directOwnership = coerceOwnership(third);
  if (typeof second === "string" && directOwnership && isVault(fourth))
    return { canvasPath: second, ownership: directOwnership, vault: fourth, options: fifth };
  // A named-options form is convenient for callers that already keep a
  // context object, while still requiring all three values.
  if (isObject(second) && !isVault(second) && !isOwnership(second)) {
    const contextPath = second.canvasPath ?? second.currentCanvasPath;
    const contextOwnership = coerceOwnership(second.ownership ?? second.registry);
    if (typeof contextPath === "string" && contextOwnership && isVault(second.vault))
      return { canvasPath: contextPath, ownership: contextOwnership, vault: second.vault, options: third };
  }
  // Also accept the old vault-first positional order when the new Canvas path
  // and registry are explicitly supplied: (vault, currentCanvasPath, registry).
  const lastOwnership = coerceOwnership(fourth);
  if (isVault(second) && typeof third === "string" && lastOwnership)
    return { canvasPath: third, ownership: lastOwnership, vault: second, options: fifth };
  if (isVault(second) && isObject(third) && !isOwnership(third)) {
    const contextPath = third.canvasPath ?? third.currentCanvasPath;
    const contextOwnership = coerceOwnership(third.ownership ?? third.registry);
    if (typeof contextPath === "string" && contextOwnership)
      return { canvasPath: contextPath, ownership: contextOwnership, vault: second, options: fourth ?? fifth };
  }
  return null;
}

function validateRegistry(ownership) {
  if (!isOwnership(ownership)) return reject(LINK_REASON.MISSING_REGISTRY);
  if (!ownership.isValid()) return reject(LINK_REASON.STALE_REGISTRY);
  return null;
}

function publicBinding(rawLink, kind, currentCanvasPath) {
  if (!isObject(rawLink)) return reject(LINK_REASON.NO_LINK);
  if (typeof currentCanvasPath !== "string" ||
      !isCanonicalVaultPath(currentCanvasPath) || extensionOf(currentCanvasPath) !== CANVAS_EXTENSION)
    return reject(LINK_REASON.WRONG_CANVAS);
  const targetPath = kind === OWNERSHIP_KIND.MARKDOWN ? rawLink.path : rawLink.canvas;
  if (typeof targetPath !== "string" || !isCanonicalVaultPath(targetPath))
    return reject(LINK_REASON.UNCANONICAL_PATH);
  if (extensionOf(targetPath) !== (kind === OWNERSHIP_KIND.MARKDOWN ? MARKDOWN_EXTENSION : CANVAS_EXTENSION))
    return reject(kind === OWNERSHIP_KIND.MARKDOWN ? LINK_REASON.NOT_MARKDOWN : LINK_REASON.NOT_CANVAS);
  if (kind === OWNERSHIP_KIND.PARENT &&
      (typeof rawLink.nodeId !== "string" || !rawLink.nodeId ||
        rawLink.nodeId.length > MAX_CARD_ID_LENGTH || hasControlCharacter(rawLink.nodeId)))
    return reject(LINK_REASON.NO_PARENT_CARD);
  if (rawLink.syncId === undefined || rawLink.syncId === null || rawLink.proof === undefined || rawLink.proof === null)
    return reject(LINK_REASON.NEEDS_CONFIRMATION);
  if (typeof rawLink.syncId !== "string" || !SYNC_ID_PATTERN.test(rawLink.syncId) ||
      typeof rawLink.proof !== "string" || !PROOF_PATTERN.test(rawLink.proof))
    return reject(LINK_REASON.UNOWNED_LINK);
  return {
    ok: true,
    binding: {
      canvasPath: currentCanvasPath,
      kind,
      targetPath,
      syncId: rawLink.syncId,
      nodeId: kind === OWNERSHIP_KIND.MARKDOWN ? null : rawLink.nodeId
    }
  };
}

function conflictForAdoption(state, binding) {
  const conflicts = ownershipConflicts(state, binding);
  if (conflicts.length > 0) return conflicts;
  return [];
}

function replacementSummary(records) {
  return records.length === 0 ? null : records[0];
}

/** Shape-check a persisted path and a linked card id without any I/O. */
function validateLinkShape(path, extension, wrongExtensionReason, nodeId = null) {
  if (!path) return reject(LINK_REASON.NO_LINK);
  if (!isCanonicalVaultPath(path)) return reject(LINK_REASON.UNCANONICAL_PATH);
  if (extensionOf(path) !== extension)
    return reject(wrongExtensionReason);
  if (nodeId !== null &&
    (typeof nodeId !== "string" || !nodeId || nodeId.length > MAX_CARD_ID_LENGTH ||
      hasControlCharacter(nodeId)))
    return reject(LINK_REASON.NO_PARENT_CARD);
  return null;
}

/**
 * Resolve a Markdown link only after the private registry proves the exact
 * Canvas/target relationship.  A matching public syncId is checked later as
 * defense-in-depth only; it is never the authorization decision.
 */
async function resolveMarkdownSyncLink(rawLink, second, third, fourth, fifth) {
  const args = resolveArguments(second, third, fourth, fifth);
  if (!args) return reject(LINK_REASON.MISSING_REGISTRY);
  const registry = validateRegistry(args.ownership);
  if (registry) return registry;
  const parsed = publicBinding(rawLink, OWNERSHIP_KIND.MARKDOWN, args.canvasPath);
  if (parsed.reason) return parsed;
  const state = OWNERSHIP_STATES.get(args.ownership);
  const found = ownershipLookup(state, parsed.binding, rawLink.proof);
  if (!found.record) return found;
  const file = resolveVaultFile(args.vault, parsed.binding.targetPath, MARKDOWN_EXTENSION);
  if (!file) return reject(LINK_REASON.MISSING_TARGET);
  const text = await readVaultText(args.vault, file);
  if (text === null) return reject(LINK_REASON.UNOWNED_TARGET);
  const claimed = parseFrontmatterOwnership(text);
  if (!claimed.ok) return claimed;
  if (claimed.syncId !== null && claimed.syncId !== parsed.binding.syncId)
    return reject(LINK_REASON.UNOWNED_TARGET);
  return {
    ok: true,
    link: {
      file,
      path: parsed.binding.targetPath,
      syncId: parsed.binding.syncId,
      proof: rawLink.proof,
      ownership: { source: "plugin-data" }
    }
  };
}

/**
 * Adopt a legacy Markdown link without mutating either file or the registry.
 * The caller must persist the target patch, the private registry upsert, and
 * the returned public Canvas link as one explicit transaction.
 */
async function adoptMarkdownSyncLink(rawLink, second, third, fourth, fifth) {
  const args = resolveArguments(second, third, fourth, fifth);
  if (!args) return reject(LINK_REASON.MISSING_REGISTRY);
  const options = isObject(args.options) ? args.options : {};
  if (options.confirmed !== true) return reject(LINK_REASON.NEEDS_CONFIRMATION);
  const registry = validateRegistry(args.ownership);
  if (registry) return registry;
  const path = typeof rawLink?.path === "string" ? rawLink.path : "";
  const shape = validateLinkShape(path, MARKDOWN_EXTENSION, LINK_REASON.NOT_MARKDOWN);
  if (shape) return shape;
  if (!isCanonicalVaultPath(args.canvasPath) || extensionOf(args.canvasPath) !== CANVAS_EXTENSION)
    return reject(LINK_REASON.WRONG_CANVAS);
  const binding = {
    canvasPath: args.canvasPath,
    kind: OWNERSHIP_KIND.MARKDOWN,
    targetPath: path,
    syncId: "0".repeat(SYNC_ID_LENGTH),
    nodeId: null
  };
  const conflicts = conflictForAdoption(OWNERSHIP_STATES.get(args.ownership), binding);
  if (conflicts.length > 0 && options.replaceExisting !== true)
    return reject(LINK_REASON.ALREADY_OWNED);
  const file = resolveVaultFile(args.vault, path, MARKDOWN_EXTENSION);
  if (!file) return reject(LINK_REASON.MISSING_TARGET);
  const text = await readVaultText(args.vault, file);
  if (text === null) return reject(LINK_REASON.UNOWNED_TARGET);
  const claimed = parseFrontmatterOwnership(text);
  if (!claimed.ok) return claimed;
  if (claimed.syncId !== null && options.replaceExisting !== true)
    return reject(LINK_REASON.ALREADY_OWNED);
  binding.syncId = createSyncId();
  if (binding.syncId === "") return reject(LINK_REASON.UNOWNED_LINK);
  const issued = args.ownership.issueRecord(binding);
  if (!issued.ok) return issued;
  const patch = patchSyncIdOwnership(text, issued.record.syncId);
  if (!patch.ok) return patch;
  const targetPatch = {
    path,
    file,
    syncId: issued.record.syncId,
    previousSyncId: claimed.syncId,
    block: OWNERSHIP_BLOCK_KEY,
    key: OWNERSHIP_FIELD_KEY,
    scalar: encodeSyncIdScalar(issued.record.syncId),
    lines: syncIdFrontmatterLines(issued.record.syncId),
    markdown: patch.markdown
  };
  const link = {
    path,
    syncId: issued.record.syncId,
    proof: issued.record.proof,
    ownership: { source: "plugin-data" }
  };
  return {
    ok: true,
    link,
    targetPatch,
    // `adoption` is retained as a descriptive alias for callers migrating
    // from the old mutation-free result shape.
    adoption: targetPatch,
    registryRecord: issued.record,
    registryUpsert: {
      record: issued.record,
      replaceExisting: options.replaceExisting === true
    },
    replaces: replacementSummary(conflicts)
  };
}

/** Read one vault file, or null when it cannot be read at all. */
function readVaultText(vault, file) {
  if (typeof vault?.cachedRead !== "function") return Promise.resolve(null);
  const advertisedSize = Number(file?.size ?? file?.stat?.size);
  if (Number.isFinite(advertisedSize) && advertisedSize > MAX_LINK_TARGET_BYTES)
    return Promise.resolve(null);
  let raw = null;
  try {
    raw = vault.cachedRead(file);
  } catch (_) {
    return Promise.resolve(null);
  }
  return Promise.resolve(raw).then(
    (text) =>
      typeof text === "string" && new TextEncoder().encode(text).byteLength <= MAX_LINK_TARGET_BYTES
        ? text
        : null,
    () => null
  );
}

/** Read a Canvas record, or null when it is missing or not readable JSON. */
function readCanvasRecord(vault, file) {
  return readVaultText(vault, file).then((text) =>
    text === null ? null : parseCanvasRecord(text)
  );
}

function parseCanvasRecord(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch (_) {
    return null;
  }
  // The Canvas schema is an object carrying a node and edge array.
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
  if (data.nodes.length > MAX_LINK_NODES || data.edges.length > MAX_LINK_EDGES) return null;
  return data;
}

/**
 * The parent link may only address a card the plugin marked as a nested map
 * and stamped with this link's relationship token, so neither a coincidental
 * card id nor a copied token in the untrusted child Canvas is enough.
 */
function findNestedMapCard(record, nodeId) {
  let found = null;
  let idSeen = false;
  for (const node of record.nodes) {
    if (!node || typeof node !== "object" || node.id !== nodeId) continue;
    if (idSeen) return null;
    idSeen = true;
    if (typeof node.file !== "string" || !node.file) continue;
    if (extensionOf(node.file) !== CANVAS_EXTENSION) continue;
    if (node.unknownData?.[CARD_KIND_KEY] !== NESTED_MAP_CARD_KIND)
      continue;
    found = node;
  }
  return found;
}

function cardSyncState(card) {
  const data = card?.unknownData;
  if (!isObject(data) || !Object.prototype.hasOwnProperty.call(data, CARD_SYNC_KEY))
    return { present: false, invalid: false, syncId: null };
  const stored = data[CARD_SYNC_KEY];
  if (typeof stored !== "string" || !SYNC_ID_PATTERN.test(stored))
    return { present: true, invalid: true, syncId: null };
  return { present: true, invalid: false, syncId: stored };
}

function cardUnknownDataPatch(card, syncId) {
  const patch = {};
  for (const [key, value] of Object.entries(card.unknownData)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (!PRIVATE_OWNERSHIP_KEYS.has(key)) patch[key] = value;
  }
  patch[CARD_SYNC_KEY] = syncId;
  return patch;
}

/**
 * Validate a persisted parent link. A nested mind map may only patch the
 * Canvas that actually holds its marked nested-map card carrying the very same
 * relationship token, so the target has to satisfy the Canvas schema, own that
 * card, and prove the relationship before any record is touched.
 *
 * @returns {Promise<{ok:true, link:{file:object, canvas:string, nodeId:string,
 *   syncId:string, proof:string, ownership:{source:"plugin-data"}}} |
 *   {ok:false, reason:string}>}
 */
function resolveParentLink(rawLink, second, third, fourth, fifth) {
  const args = resolveArguments(second, third, fourth, fifth);
  if (!args) return Promise.resolve(reject(LINK_REASON.MISSING_REGISTRY));
  const registry = validateRegistry(args.ownership);
  if (registry) return Promise.resolve(registry);
  const parsed = publicBinding(rawLink, OWNERSHIP_KIND.PARENT, args.canvasPath);
  if (parsed.reason) return Promise.resolve(parsed);
  const state = OWNERSHIP_STATES.get(args.ownership);
  const found = ownershipLookup(state, parsed.binding, rawLink.proof);
  if (!found.record) return Promise.resolve(found);
  const file = resolveVaultFile(args.vault, parsed.binding.targetPath, CANVAS_EXTENSION);
  if (!file) return Promise.resolve(reject(LINK_REASON.NOT_CANVAS));
  return readCanvasRecord(args.vault, file).then((record) => {
    if (!record) return reject(LINK_REASON.NOT_CANVAS);
    const card = findNestedMapCard(record, rawLink.nodeId);
    if (!card) return reject(LINK_REASON.NO_PARENT_CARD);
    const cardClaim = cardSyncState(card);
    if (cardClaim.invalid) return reject(LINK_REASON.MALFORMED_TARGET);
    if (cardClaim.present && cardClaim.syncId !== parsed.binding.syncId)
      return reject(LINK_REASON.UNOWNED_TARGET);
    return {
      ok: true,
      link: {
        file,
        canvas: parsed.binding.targetPath,
        nodeId: rawLink.nodeId,
        syncId: parsed.binding.syncId,
        proof: rawLink.proof,
        ownership: { source: "plugin-data" }
      }
    };
  });
}

/**
 * Adopt a parent link recorded before ownership tokens existed, under the same
 * explicit-confirmation policy as a Markdown sync link.
 *
 * Nothing is written here: the record read from the parent Canvas is never
 * modified, and the result carries the exact `unknownData` the caller assigns
 * to that card to record the relationship. A card another live child already
 * owns is reported rather than taken over unless `replaceExisting` says the
 * user agreed to that.
 *
 * @returns {Promise<{ok:true, link:object, adoption:{canvas:string, file:object,
 *   nodeId:string, syncId:string, previousSyncId:string|null, key:string,
 *   unknownDataPatch:object}} | {ok:false, reason:string}>}
 */
async function adoptParentLink(rawLink, second, third, fourth, fifth) {
  const args = resolveArguments(second, third, fourth, fifth);
  if (!args) return reject(LINK_REASON.MISSING_REGISTRY);
  const options = isObject(args.options) ? args.options : {};
  if (options.confirmed !== true) return reject(LINK_REASON.NEEDS_CONFIRMATION);
  const registry = validateRegistry(args.ownership);
  if (registry) return registry;
  const path = typeof rawLink?.canvas === "string" ? rawLink.canvas : "";
  const shape = validateLinkShape(
    path,
    CANVAS_EXTENSION,
    LINK_REASON.NOT_CANVAS,
    rawLink?.nodeId
  );
  if (shape) return shape;
  if (!isCanonicalVaultPath(args.canvasPath) || extensionOf(args.canvasPath) !== CANVAS_EXTENSION)
    return reject(LINK_REASON.WRONG_CANVAS);
  const binding = {
    canvasPath: args.canvasPath,
    kind: OWNERSHIP_KIND.PARENT,
    targetPath: path,
    syncId: "0".repeat(SYNC_ID_LENGTH),
    nodeId: rawLink.nodeId
  };
  const conflicts = conflictForAdoption(OWNERSHIP_STATES.get(args.ownership), binding);
  if (conflicts.length > 0 && options.replaceExisting !== true)
    return reject(LINK_REASON.ALREADY_OWNED);
  const file = resolveVaultFile(args.vault, path, CANVAS_EXTENSION);
  if (!file) return reject(LINK_REASON.NOT_CANVAS);
  const record = await readCanvasRecord(args.vault, file);
  if (!record) return reject(LINK_REASON.NOT_CANVAS);
  const card = findNestedMapCard(record, rawLink.nodeId);
  if (!card || !isObject(card.unknownData)) return reject(LINK_REASON.NO_PARENT_CARD);
  const cardClaim = cardSyncState(card);
  if (cardClaim.invalid) return reject(LINK_REASON.MALFORMED_TARGET);
  const previousSyncId = cardClaim.syncId;
  if (previousSyncId !== null && options.replaceExisting !== true)
    return reject(LINK_REASON.ALREADY_OWNED);
  binding.syncId = createSyncId();
  if (binding.syncId === "") return reject(LINK_REASON.UNOWNED_LINK);
  const issued = args.ownership.issueRecord(binding);
  if (!issued.ok) return issued;
  const targetPatch = {
    canvas: path,
    file,
    nodeId: rawLink.nodeId,
    syncId: issued.record.syncId,
    previousSyncId,
    key: CARD_SYNC_KEY,
    unknownDataPatch: cardUnknownDataPatch(card, issued.record.syncId)
  };
  const link = {
    canvas: path,
    nodeId: rawLink.nodeId,
    syncId: issued.record.syncId,
    proof: issued.record.proof,
    ownership: { source: "plugin-data" }
  };
  return {
    ok: true,
    link,
    targetPatch,
    adoption: targetPatch,
    registryRecord: issued.record,
    registryUpsert: {
      record: issued.record,
      replaceExisting: options.replaceExisting === true
    },
    replaces: replacementSummary(conflicts)
  };
}

/**
 * The bidirectional lookup that answers "which Markdown feeds this Canvas"
 * and "which Canvases does this Markdown feed".
 *
 * Startup walks every Canvas in the vault, so the index is bounded: a target
 * that is already known always accepts more Canvases, and only a genuinely
 * new target is refused once the limit is reached. Refusals are counted
 * rather than thrown, so one oversized vault cannot stop the scan.
 */
class MarkdownSyncIndex {
  constructor({ limit = DEFAULT_INDEX_LIMIT } = {}) {
    this.limit = Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : DEFAULT_INDEX_LIMIT;
    this.dropped = 0;
    this.markdownByCanvas = new Map();
    this.canvasesByMarkdown = new Map();
  }

  get size() {
    return this.canvasesByMarkdown.size;
  }

  /** Record a Canvas-to-Markdown link, replacing any previous target. */
  link(canvasPath, markdownPath) {
    if (!canvasPath || !markdownPath) return false;
    const current = this.markdownByCanvas.get(canvasPath);
    if (current === markdownPath) return true;
    let canvases = this.canvasesByMarkdown.get(markdownPath);
    if (!canvases && this.canvasesByMarkdown.size >= this.limit) {
      this.dropped++;
      return false;
    }
    this.unlink(canvasPath);
    if (!canvases) {
      canvases = new Set();
      this.canvasesByMarkdown.set(markdownPath, canvases);
    }
    canvases.add(canvasPath);
    this.markdownByCanvas.set(canvasPath, markdownPath);
    return true;
  }

  /** Remove one Canvas from both directions, retiring a target with no peers. */
  unlink(canvasPath) {
    const markdownPath = this.detach(canvasPath);
    if (markdownPath === "") return false;
    const canvases = this.canvasesByMarkdown.get(markdownPath);
    if (!canvases) return true;
    canvases.delete(canvasPath);
    if (canvases.size === 0) this.canvasesByMarkdown.delete(markdownPath);
    return true;
  }

  detach(canvasPath) {
    const markdownPath = this.markdownByCanvas.get(canvasPath) || "";
    this.markdownByCanvas.delete(canvasPath);
    return markdownPath;
  }

  markdownFor(canvasPath) {
    return this.markdownByCanvas.get(canvasPath) || "";
  }

  canvasesFor(markdownPath) {
    return Array.from(this.canvasesByMarkdown.get(markdownPath) || []);
  }

  /** A renamed Markdown target keeps every Canvas that synced with it. */
  renameMarkdown(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return false;
    const sourceCanvases = this.canvasesByMarkdown.get(oldPath);
    if (!sourceCanvases) return false;
    const destinationCanvases = this.canvasesByMarkdown.get(newPath) || new Set();
    this.canvasesByMarkdown.delete(oldPath);
    for (const canvasPath of sourceCanvases) {
      destinationCanvases.add(canvasPath);
      this.markdownByCanvas.set(canvasPath, newPath);
    }
    this.canvasesByMarkdown.set(newPath, destinationCanvases);
    return true;
  }

  /** A renamed Canvas keeps its Markdown target under the new name. */
  renameCanvas(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return false;
    const markdownPath = this.markdownByCanvas.get(oldPath);
    if (!markdownPath) return false;
    const existingTarget = this.markdownByCanvas.get(newPath);
    if (existingTarget && existingTarget !== markdownPath) return false;
    this.markdownByCanvas.delete(oldPath);
    this.markdownByCanvas.set(newPath, markdownPath);
    const canvases = this.canvasesByMarkdown.get(markdownPath);
    if (canvases) {
      canvases.delete(oldPath);
      canvases.add(newPath);
    }
    return true;
  }

  clear() {
    this.markdownByCanvas.clear();
    this.canvasesByMarkdown.clear();
  }
}

/**
 * One scheduler per Markdown target.
 *
 * A mind map writes in both directions, from several Canvases, on timers that
 * a user outpaces. This module owns the resulting state machine so callers
 * only hand over the newest state: each path has exactly one promise chain,
 * so writes cannot finish out of order, and one generation, so a detach,
 * rename, or dispose cannot be undone by work that is already in flight.
 *
 * A scheduled entry is a thunk rather than a value, which is what makes
 * newest-state coalescing exact: a superseded state is never even computed.
 */
class MarkdownSyncCoordinator {
  constructor({ delay = DEFAULT_DEBOUNCE_MS, maxAttempts = MAX_SYNC_ATTEMPTS } = {}) {
    this.delay = Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_DEBOUNCE_MS;
    this.maxAttempts = Number.isFinite(maxAttempts) && maxAttempts > 0
      ? Math.floor(maxAttempts)
      : MAX_SYNC_ATTEMPTS;
    this.entries = new Map();
    this.disposing = false;
    this.disposed = false;
    this.drainPromise = null;
    this.disposePromise = null;
  }

  entryFor(path) {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = {
        path,
        generation: 0,
        chain: Promise.resolve(),
        activeTask: null,
        activeGeneration: -1,
        timer: null,
        pending: null,
        last: null,
        unsaved: false,
        rejected: false
      };
      this.entries.set(path, entry);
    }
    return entry;
  }

  /**
   * Queue the newest state for a path. Calling it again before the debounce
   * elapses replaces the pending state rather than adding a second write.
   */
  rejectWhileDisposing(path) {
    const entry = this.entries.get(path);
    if (entry) {
      entry.unsaved = true;
      entry.rejected = true;
      entry.last = reject(LINK_REASON.DISPOSING);
    }
    return Promise.resolve(reject(LINK_REASON.DISPOSING));
  }

  schedule(path, work) {
    if (this.disposing || this.disposed)
      return this.rejectWhileDisposing(path);
    if (!path || typeof work !== "function") return this.flush(path, work);
    const entry = this.entryFor(path);
    entry.pending = work;
    entry.unsaved = true;
    entry.rejected = false;
    this.clearTimer(entry);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.run(entry);
    }, this.delay);
    return entry.chain;
  }

  /** Queue work that must not wait for the debounce window. */
  apply(path, work) {
    if (this.disposing || this.disposed)
      return this.rejectWhileDisposing(path);
    if (!path || typeof work !== "function")
      return Promise.resolve(reject(LINK_REASON.NO_PENDING));
    const entry = this.entryFor(path);
    entry.unsaved = true;
    entry.rejected = false;
    this.clearTimer(entry);
    return this.run(entry, work);
  }

  /**
   * Run a path's pending state now. Returns the typed result of the write so
   * a caller can present a conflict instead of assuming success.
   */
  flush(path, work) {
    if (this.disposing || this.disposed)
      return this.rejectWhileDisposing(path);
    if (!path) return Promise.resolve(reject(LINK_REASON.NO_PENDING));
    const entry = this.entryFor(path);
    return this.flushEntry(entry, work);
  }

  flushEntry(entry, work = null) {
    this.clearTimer(entry);
    if (typeof work === "function") {
      entry.pending = work;
      entry.unsaved = true;
      entry.rejected = false;
    }
    if (!entry.pending) {
      entry.last = reject(LINK_REASON.NO_PENDING);
      return Promise.resolve(entry.last);
    }
    return this.run(entry);
  }

  /**
   * Run one unit of work on the path's chain, honouring the coalescing,
   * retry, and generation rules. Never rejects: every outcome is typed, so one
   * failing link cannot break the fan-out that follows it.
   */
  run(entry, work = null) {
    const task = work || entry.pending;
    if (task) entry.pending = null;
    const generation = entry.generation;
    if (task) {
      entry.activeTask = task;
      entry.activeGeneration = generation;
    }
    const started = entry.chain.then(() =>
      this.attempt(entry, task, generation)
    ).finally(() => {
      if (task && entry.activeGeneration === generation && entry.activeTask === task) {
        entry.activeTask = null;
        entry.activeGeneration = -1;
      }
    });
    // A rejection anywhere must not poison the chain for later writes.
    entry.chain = started.then(noop, noop);
    return started;
  }

  /**
   * Compare-and-set: a conflict means someone else wrote first, so the same
   * newest state is recomputed against a fresh read instead of being dropped.
   */
  async attempt(entry, task, generation) {
    if (entry.generation !== generation) return reject(LINK_REASON.DETACHED);
    if (!task) return reject(LINK_REASON.NO_PENDING);
    let result = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      result = await runWork(task, {
        attempt,
        generation,
        path: entry.path,
        isCurrent: () =>
          entry.generation === generation &&
          this.entries.get(entry.path) === entry
      });
      if (entry.generation !== generation) return reject(LINK_REASON.DETACHED);
      // Only a compare-and-set loss is retried. An active edit, an undecodable
      // document, and a real failure are all decisions the caller must see.
      if (!result || result.ok || result.reason !== LINK_REASON.CONFLICT) break;
      if (attempt === this.maxAttempts) break;
    }
    // A topic being edited keeps the newest Markdown generation pending, so
    // leaving the editor applies it instead of losing it.
    if (result && !result.ok && result.reason === LINK_REASON.EDITING)
      entry.pending = entry.pending || task;
    entry.last = result && typeof result === "object"
      ? result
      : reject(LINK_REASON.FAILED);
    if (entry.last.ok) entry.unsaved = false;
    else if (entry.last.reason !== LINK_REASON.DETACHED &&
             entry.last.reason !== LINK_REASON.NO_PENDING)
      entry.unsaved = true;
    return entry.last;
  }

  clearTimer(entry) {
    if (entry.timer === null) return;
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  /** Stop synchronizing a target and drop its queued work. */
  detach(path) {
    const entry = this.entries.get(path);
    if (!entry) return false;
    this.clearTimer(entry);
    entry.pending = null;
    entry.generation++;
    this.entries.delete(path);
    return true;
  }

  /**
   * Move a target's queued and in-flight work to its new name. The old name is
   * detached first, so a write still running under the previous generation is
   * abandoned rather than committed to a path the user just renamed away from.
   */
  rename(oldPath, newPath) {
    if (this.disposing || this.disposed) return false;
    if (!oldPath || !newPath || oldPath === newPath) return false;
    const entry = this.entries.get(oldPath);
    if (!entry) return false;
    const pending = entry.pending || entry.activeTask;
    const oldChain = entry.chain;
    this.detach(oldPath);
    if (!pending) return true;
    const moved = this.entryFor(newPath);
    moved.generation += 1;
    this.clearTimer(moved);
    moved.pending = pending;
    moved.unsaved = true;
    moved.rejected = false;
    moved.chain = Promise.all([
      oldChain.then(noop, noop),
      moved.chain.then(noop, noop)
    ]).then(noop);
    return true;
  }

  /**
   * Drain a stable snapshot. A write may enqueue a newer generation while an
   * older promise is settling, so one pass is not enough. The bound makes a
   * pathological producer fail visibly instead of spinning forever.
   */
  flushAll() {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  async drain() {
    const failures = [];
    for (let pass = 1; pass <= MAX_DRAIN_PASSES; pass++) {
      const entries = Array.from(this.entries.values());
      const runs = [];
      for (const entry of entries) {
        if (entry.pending) runs.push(this.flushEntry(entry));
        else runs.push(entry.chain);
      }
      const results = await Promise.all(runs);
      results.forEach((result, index) => {
        if (result && result.ok === false &&
            result.reason !== LINK_REASON.NO_PENDING &&
            result.reason !== LINK_REASON.DETACHED)
          failures.push({ path: entries[index].path, result });
      });
      for (const entry of this.entries.values()) {
        if (entry.rejected)
          failures.push({ path: entry.path, result: entry.last || reject(LINK_REASON.DISPOSING) });
      }
      // A task can replace entry.chain while it is running. Await the latest
      // chains as well as the snapshot promises before deciding it is drained.
      await Promise.all(Array.from(this.entries.values()).map((entry) => entry.chain));
      const remaining = Array.from(this.entries.values()).filter((entry) =>
        entry.pending !== null || entry.timer !== null
      );
      if (remaining.length === 0) {
        if (failures.length > 0) {
          return {
            ok: false,
            reason: LINK_REASON.UNSAVED,
            failures,
            passes: pass
          };
        }
        return { ok: true, passes: pass };
      }
    }
    const pending = Array.from(this.entries.values())
      .filter((entry) => entry.pending !== null || entry.timer !== null)
      .map((entry) => entry.path);
    return {
      ok: false,
      reason: LINK_REASON.DRAIN_LIMIT,
      pending,
      failures,
      passes: MAX_DRAIN_PASSES
    };
  }

  /** Dispose is idempotent; a failed drain keeps the unsaved entry visible. */
  dispose() {
    if (this.disposed) return Promise.resolve({ ok: true, alreadyDisposed: true });
    if (this.disposePromise) return this.disposePromise;
    this.disposing = true;
    this.disposePromise = this.disposeInternal().finally(() => {
      this.disposePromise = null;
    });
    return this.disposePromise;
  }

  async disposeInternal() {
    const result = await this.flushAll();
    if (!result.ok) {
      // Permit an explicit recovery attempt after the caller has dealt with
      // the surfaced generation; the failed entry is deliberately retained.
      this.disposing = false;
      return result;
    }
    for (const entry of Array.from(this.entries.values())) {
      this.clearTimer(entry);
      entry.pending = null;
      entry.generation++;
    }
    this.entries.clear();
    this.disposed = true;
    this.disposing = false;
    return result;
  }
}

/** Run one attempt of a scheduled unit of work as a typed result. */
async function runWork(task, context) {
  try {
    const result = await task(context);
    return result && typeof result === "object"
      ? result
      : reject(LINK_REASON.FAILED);
  } catch (error) {
    return { ok: false, reason: LINK_REASON.FAILED, error };
  }
}

function noop() {}

module.exports = {
  LINK_REASON,
  DEFAULT_INDEX_LIMIT,
  DEFAULT_DEBOUNCE_MS,
  MARKDOWN_EXTENSION,
  CANVAS_EXTENSION,
  OWNERSHIP_SCHEMA,
  OWNERSHIP_VERSION,
  OWNERSHIP_KIND,
  OWNERSHIP_BLOCK_KEY,
  OWNERSHIP_FIELD_KEY,
  CARD_SYNC_KEY,
  createSyncId,
  createMarkdownSyncOwnership,
  loadMarkdownSyncOwnership,
  MarkdownSyncOwnership,
  OwnershipRegistry,
  isCanonicalVaultPath,
  parseFrontmatterOwnership,
  decodeSyncIdScalar,
  encodeSyncIdScalar,
  syncIdFrontmatterLines,
  patchSyncIdOwnership,
  resolveMarkdownSyncLink,
  resolveParentLink,
  adoptMarkdownSyncLink,
  adoptParentLink,
  MarkdownSyncIndex,
  MarkdownSyncCoordinator
};
