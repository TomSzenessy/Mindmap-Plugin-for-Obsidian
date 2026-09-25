"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");

const codec = require("../lib/markdown-codec.js");

const {
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
} = codec;

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function makeNode(spec) {
  const node = {
    id: spec.id,
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    width: spec.width ?? 200,
    height: spec.height ?? 60,
    type: spec.type ?? "text"
  };
  if (spec.text !== undefined) node.text = spec.text;
  if (spec.file !== undefined) node.file = spec.file;
  if (spec.url !== undefined) node.url = spec.url;
  return node;
}

function makeCanvas(spec) {
  const nodes = new Map();
  const edges = new Map();
  for (const item of spec.nodes || []) nodes.set(item.id, makeNode(item));
  let edgeIndex = 0;
  for (const [fromId, toId] of spec.edges || []) {
    const id = spec.edgePrefix ? `${spec.edgePrefix}-${edgeIndex}` : `edge-${edgeIndex}`;
    edges.set(id, {
      id,
      from: { node: nodes.get(fromId), side: "right" },
      to: { node: nodes.get(toId), side: "left" },
      fromSide: "right",
      toSide: "left"
    });
    edgeIndex++;
  }
  return {
    nodes,
    edges,
    selection: new Set(spec.selection || []),
    view: { file: spec.file ?? { path: "Map.canvas", basename: "Map" } },
    getData: () => ({
      nodes: Array.from(nodes.values()).map((node) => ({ ...node })),
      edges: Array.from(edges.values()).map((edge) => ({
        id: edge.id,
        fromNode: edge.from.node.id,
        toNode: edge.to.node.id,
        fromSide: edge.fromSide,
        toSide: edge.toSide
      }))
    })
  };
}

function decode(markdown, options) {
  const result = decodeMarkdownMindMap(markdown, options);
  if (!result.ok) {
    const detail = Object.entries(result)
      .filter(([key]) => key !== "ok")
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    assert.fail(`expected decode success, got ${detail}`);
  }
  return result.value;
}

function decodeFailure(markdown, options) {
  const result = decodeMarkdownMindMap(markdown, options);
  assert.equal(result.ok, false, "expected decode failure");
  return result;
}

function lines(text) {
  return String(text).split("\n");
}

function titles(roots) {
  const out = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    out.push(node.text);
    for (let index = node.children.length - 1; index >= 0; index--)
      stack.push(node.children[index]);
  }
  return out;
}

function findNode(roots, text) {
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.text === text) return node;
    stack.push(...node.children);
  }
  return null;
}

const LAYOUT = {
  nodeWidth: 240,
  nodeHeight: 60,
  maxNodeHeight: 300,
  horizontalGap: 80,
  verticalGap: 20
};

/** A live Canvas that shows exactly a decoded document, parent for parent. */
function canvasFromDocument(document) {
  const nodes = document.topics.map((topic, index) => ({
    id: topic.id,
    text: topic.text,
    x: index * 30,
    y: index * 90
  }));
  const edges = document.topicSources
    .filter((record) => record.parentId)
    .map((record) => [record.parentId, record.id]);
  return makeCanvas({ nodes, edges });
}

/* ------------------------------------------------------------------ */
/* typed decode                                                       */
/* ------------------------------------------------------------------ */

test("an empty document is a typed success, not a parse failure", () => {
  for (const source of ["", "   \n\n\t\n", "---\ntitle: Nothing\n---\n", "<!-- only a comment -->"]) {
    const result = decodeMarkdownMindMap(source);
    assert.equal(result.ok, true);
    assert.equal(result.value.empty, true);
    assert.deepEqual(result.value.roots, []);
    assert.equal(result.value.topics.length, 0);
  }
});

test("a non-string input is a typed failure", () => {
  const result = decodeMarkdownMindMap({ nope: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, MARKDOWN_CODEC_REASON.INVALID_INPUT);
});

test("headings and nested lists decode into one forest with stable ids", () => {
  const value = decode("# Root\n\n## Alpha\n\n### Alpha One\n\n## Beta\n");
  assert.equal(value.empty, false);
  assert.equal(value.roots.length, 1);
  assert.equal(value.roots[0].text, "Root");
  assert.deepEqual(
    value.roots[0].children.map((child) => child.text),
    ["Alpha", "Beta"]
  );
  assert.equal(value.roots[0].children[0].children[0].text, "Alpha One");
  assert.equal(new Set(value.topics.map((topic) => topic.id)).size, value.topics.length);
  assert.ok(value.topicIds.every((id) => /^[A-Za-z0-9_-]+$/.test(id)));
});

test("the same document decodes to the same ids when metadata survives the round trip", () => {
  const source = "# Root\n\n- Alpha\n- Beta\n";
  const first = decode(source);
  const encoded = encodeMindMapMarkdown(canvasFromDocument(first), {
    includeFrontmatter: true,
    frontmatter: ""
  });
  assert.equal(encoded.ok, true);
  const second = decode(encoded.value.markdown);
  assert.deepEqual(second.topicIds, first.topicIds);
  assert.deepEqual(
    titles(second.roots),
    titles(first.roots)
  );
});

/* ------------------------------------------------------------------ */
/* heading trailing hashes and shape cleanup                          */
/* ------------------------------------------------------------------ */

test("a closing hash sequence is stripped but an inline hash is part of the title", () => {
  assert.equal(titles(decode("## C# scripting\n").roots)[0], "C# scripting");
  assert.equal(titles(decode("## Real title ##\n").roots)[0], "Real title");
  assert.equal(titles(decode("## Real title###\n").roots)[0], "Real title###");
  assert.equal(topicTitle("## array[0] ##"), "array[0]");
  assert.equal(topicTitle("array[0]"), "array[0]");
  assert.equal(topicTitle("`code[1]`"), "`code[1]`");
  assert.equal(topicTitle("[[Some note]]"), "Some note");
  assert.equal(topicTitle("| a | b |\n| - | - |\n| 1 | 2 |"), "a · b");
  assert.equal(topicTitle("```js\nlet a = 1;\n```"), "Code · js");
  assert.equal(topicTitle("![shot](shots/a.png)"), "shot");
});

test("bracket shape cleanup never truncates indexed code", () => {
  assert.equal(topicTitle("array[0]"), "array[0]");
  assert.equal(topicTitle("matrix[i][j]"), "matrix[i][j]");
  assert.equal(topicTitle("[[Linked note]]"), "Linked note");
  assert.equal(topicTitle("[[Linked note|alias]]"), "Linked note");
  assert.equal(topicTitle("{{Embedded}}"), "Embedded");
  assert.equal(topicTitle("((Shaped))"), "Shaped");
  assert.equal(topicTitle("C#"), "C#");
});

/* ------------------------------------------------------------------ */
/* multiline topics                                                   */
/* ------------------------------------------------------------------ */

test("a multiline topic body stays on its parent topic instead of becoming a child", () => {
  const value = decode("# Root\n\n- Title\n  Body line\n- Second\n");
  assert.deepEqual(titles(value.roots), ["Root", "Title\nBody line", "Second"]);

  const heading = decode("# Root\nBody paragraph\n## Child\n");
  assert.equal(heading.roots[0].text, "Root\nBody paragraph");
  assert.deepEqual(titles(heading.roots), ["Root\nBody paragraph", "Child"]);
});

test("a blank line inside one item keeps the paragraphs on that topic", () => {
  const value = decode("- Title\n  Body\n\n  Second paragraph\n- Second\n");
  assert.equal(value.roots.length, 2);
  assert.equal(value.roots[0].text, "Title\nBody\n\nSecond paragraph");
  assert.equal(value.roots[1].text, "Second");
});

test("multiline topics round-trip through encode and decode with identical text", () => {
  const source = [
    "---",
    "title: Notes",
    "---",
    "",
    "# Central topic",
    "",
    "## First branch",
    "Body of the first branch",
    "",
    "- Second branch",
    "  Body of the second branch",
    "- [ ] Third branch",
    ""
  ].join("\n");
  const first = decode(source);
  const encoded = encodeMindMapMarkdown(canvasFromDocument(first), { includeFrontmatter: false });
  assert.equal(encoded.ok, true);
  const second = decode(encoded.value.markdown);
  assert.deepEqual(titles(second.roots), titles(first.roots));
});

/* ------------------------------------------------------------------ */
/* fences, inline code, comments                                      */
/* ------------------------------------------------------------------ */

test("fenced code is one topic and survives the round trip byte for byte", () => {
  const fence = ["```js", "const a = array[0];", "```", ""].join("\n");
  const value = decode(`# Root\n\n${fence}`);
  assert.equal(value.roots[0].children.length, 1);
  assert.equal(value.roots[0].children[0].text, fence.trimEnd());

  const canvas = makeCanvas({
    nodes: [
      { id: "root", text: "Root", x: 0, y: 0 },
      { id: "code", text: fence.trimEnd(), x: 320, y: 0 }
    ],
    edges: [["root", "code"]]
  });
  const encoded = encodeMindMapMarkdown(canvas, { includeFrontmatter: false });
  const again = decode(encoded.value.markdown);
  assert.equal(again.roots[0].children[0].text, fence.trimEnd());
});

test("a heading hash inside a code fence is not a topic", () => {
  const value = decode(["```md", "# not a heading", "- not a list", "```", ""].join("\n"));
  assert.equal(value.roots.length, 1);
  assert.equal(value.roots[0].text, "```md\n# not a heading\n- not a list\n```");
});

test("literal protection tolerates sentinel-like user content", () => {
  const source = "before \u0000mdc0\u0001 after `code`";
  const protectedText = protectMarkdownLiterals(source);
  assert.equal(protectedText.restore(protectedText.text), source);
});

test("inline code and HTML comments are protected from every transform", () => {
  const text = [
    "Intro",
    "",
    "Inline `# [ ] not a checkbox` and `](#anchor)` stay put.",
    "",
    "<!-- tomindmap:id=stale -->",
    "",
    "```",
    "<!-- tomindmap:id=inside -->",
    "```",
    "",
    "- [ ] Real task"
  ].join("\n");
  const { text: masked, restore } = protectMarkdownLiterals(text);
  assert.ok(!masked.includes("<!-- tomindmap:id=stale -->"));
  assert.ok(!masked.includes("<!-- tomindmap:id=inside -->"));
  assert.equal(restore(masked), text);

  const cleaned = withoutLegacyPluginComments(text);
  assert.ok(!cleaned.includes("tomindmap:id=stale"));
  assert.ok(cleaned.includes("<!-- tomindmap:id=inside -->"));
  assert.ok(cleaned.includes("`](#anchor)`"));

  const toggled = toggleTopicCheckbox(text, 0);
  assert.equal(toggled.changed, true);
  assert.ok(toggled.text.includes("- [x] Real task"));
  assert.ok(toggled.text.includes("`# [ ] not a checkbox`"));
});

test("a fenced block that looks like a legacy marker is preserved", () => {
  const source = ["```", "<!-- tomindmap:id=inside -->", "```", ""].join("\n");
  assert.equal(withoutLegacyPluginComments(source), source);
  const value = decode(source);
  assert.equal(value.roots[0].text, "```\n<!-- tomindmap:id=inside -->\n```");
});

/* ------------------------------------------------------------------ */
/* syntax classification                                              */
/* ------------------------------------------------------------------ */

test("one classifier describes every block form in a document", () => {
  const source = [
    "---",
    "title: x",
    "---",
    "",
    "# Heading ##",
    "",
    "- item",
    "  - nested",
    "",
    "> quote",
    "",
    "| a | b |",
    "| - | - |",
    "",
    "```",
    "plain sample",
    "```",
    "",
    "```mermaid",
    "mindmap",
    "  root((Root))",
    "    child",
    "```",
    ""
  ].join("\n");
  const classified = classifyMarkdownSource(source);
  assert.equal(classified.frontmatter, "---\ntitle: x\n---");
  assert.equal(classified.bom, "");
  const kinds = new Set(
    classified.lines
      .filter((line) => line.text.trim())
      .map((line) => line.groupKind || line.kind)
  );
  for (const kind of ["heading", "list", "blockquote", "table", "fence", "mermaid"])
    assert.ok(kinds.has(kind), `missing classified kind: ${kind}`);
  const heading = classified.lines.find((line) => line.kind === "heading");
  assert.equal(heading.level, 1);
  assert.equal(heading.title, "Heading");
  const nested = classified.lines.find((line) => line.kind === "list" && line.indent === 2);
  assert.equal(nested.ordered, false);
});

/* ------------------------------------------------------------------ */
/* Mermaid                                                            */
/* ------------------------------------------------------------------ */

test("Mermaid mindmap indentation is retained and the block ends at the next heading", () => {
  const source = [
    "```mermaid",
    "mindmap",
    "  root((Central))",
    "    branchA[Alpha]",
    "      leafA",
    "    branchB[Beta]",
    "```",
    "",
    "# After mermaid",
    ""
  ].join("\n");
  const value = decode(source);
  const mermaidRoot = value.roots[0];
  assert.equal(mermaidRoot.text, "root((Central))");
  assert.deepEqual(mermaidRoot.children.map((child) => child.text), ["branchA[Alpha]", "branchB[Beta]"]);
  assert.deepEqual(mermaidRoot.children[0].children.map((child) => child.text), ["leafA"]);
  const after = value.roots.find((root) => root.text === "After mermaid");
  assert.ok(after, "a heading after the Mermaid block must still be a topic");
});

test("a bare Mermaid block without a fence keeps its hierarchy and ends at a heading", () => {
  const source = [
    "mindmap",
    "  root((Central))",
    "    left[Alpha]",
    "    right[Beta]",
    "",
    "# Real heading",
    ""
  ].join("\n");
  const value = decode(source);
  assert.equal(value.roots.length, 2);
  assert.equal(value.roots[0].text, "root((Central))");
  assert.deepEqual(
    value.roots[0].children.map((child) => child.text),
    ["left[Alpha]", "right[Beta]"]
  );
  assert.equal(value.roots[1].text, "Real heading");
});

/* ------------------------------------------------------------------ */
/* resources, fragments, encoded paths                                 */
/* ------------------------------------------------------------------ */

test("resources resolve through the shared media allowlist", () => {
  const file = parseTopicResource("![shot](Attachments/My%20Photo.png)");
  assert.equal(file.kind, "file");
  assert.equal(file.target, "Attachments/My%20Photo.png");

  const link = parseTopicResource("[Example](https://example.com/page)");
  assert.equal(link.kind, "link");
  assert.equal(link.target, "https://example.com/page");

  const wiki = parseTopicResource("![[Attachments/Clip.mp3#t=4]]");
  assert.equal(wiki.kind, "file");
  assert.equal(wiki.fragment, "t=4");

  const titled = parseTopicResource('[Photo](Attachments/Photo.png "A title")');
  assert.equal(titled.kind, "file");
  assert.equal(titled.file, "Attachments/Photo.png");
  assert.equal(titled.label, "Photo");

  assert.equal(parseTopicResource("just text").kind, "text");
  assert.equal(parseTopicResource("javascript:alert(1)").kind, "text");
  assert.equal(parseTopicResource("![x](not-a-file)").kind, "text");
});

test("encoding refuses unterminated persisted frontmatter", () => {
  const canvas = makeCanvas({
    nodes: [{ id: "root", text: "Root", x: 0, y: 0 }],
    edges: []
  });
  const baseData = canvas.getData();
  canvas.getData = () => ({ ...baseData, mindmapMarkdownFrontmatter: "---\ntitle: broken" });
  const encoded = encodeMindMapMarkdown(canvas);
  assert.equal(encoded.ok, false);
  assert.equal(encoded.reason, MARKDOWN_CODEC_REASON.INVALID_INPUT);
});

test("a resource topic keeps its target through encode and decode", () => {
  const canvas = makeCanvas({
    nodes: [
      { id: "root", text: "Root", x: 0, y: 0 },
      { id: "pdf", type: "file", file: "Documents/Report (final).pdf", x: 320, y: 0 },
      { id: "web", type: "link", url: "https://example.com/a", x: 320, y: 120 }
    ],
    edges: [
      ["root", "pdf"],
      ["root", "web"]
    ]
  });
  const encoded = encodeMindMapMarkdown(canvas, { includeFrontmatter: false });
  assert.equal(encoded.ok, true);
  const value = decode(encoded.value.markdown);
  const pdf = findNode(value.roots, "![](<Documents/Report (final).pdf>)");
  assert.ok(pdf, `expected a file card topic, got ${JSON.stringify(titles(value.roots))}`);
  assert.equal(pdf.type, "file");
  assert.equal(pdf.file, "Documents/Report (final).pdf");
  const web = findNode(value.roots, "[example.com](<https://example.com/a>)");
  assert.ok(web);
  assert.equal(web.type, "link");
  assert.equal(web.url, "https://example.com/a");
});

test("local media targets ignore remote and scheme resources", () => {
  const markdown = [
    "![[Attachments/Clip.mp3]]",
    "![shot](Attachments/Photo.png)",
    "![remote](https://example.com/a.png)",
    "![anchor](#section)",
    "[doc](Attachments/Manual.pdf)",
    "<audio src=\"Attachments/Tone.oga\"></audio>"
  ].join("\n\n");
  assert.deepEqual(extractLocalMediaTargets(markdown).sort(), [
    "Attachments/Clip.mp3",
    "Attachments/Manual.pdf",
    "Attachments/Photo.png",
    "Attachments/Tone.oga"
  ]);
});

/* ------------------------------------------------------------------ */
/* anchors                                                            */
/* ------------------------------------------------------------------ */

test("anchors resolve to canonical and duplicate heading slugs", () => {
  const nodes = [
    { id: "a", text: "Shared title" },
    { id: "b", text: "Shared title" },
    {
      id: "c",
      text: "See [one](#shared-title) and [two](#shared-title-2) and [uni](#%C3%BCn%C3%AFcode-h%C3%ABading)"
    },
    { id: "d", text: "Ünïcode Hëading" }
  ];
  const converted = convertMarkdownAnchorsToCardLinks(nodes, "Folder/Map.canvas");
  assert.equal(converted[0].text, "Shared title");
  assert.equal(converted[1].text, "Shared title");
  assert.ok(
    converted[2].text.includes("[one](obsidian://tomindmap-navigate?canvas=Folder%2FMap.canvas&id=a)"),
    converted[2].text
  );
  assert.ok(
    converted[2].text.includes("[two](obsidian://tomindmap-navigate?canvas=Folder%2FMap.canvas&id=b)"),
    converted[2].text
  );
  assert.ok(
    converted[2].text.includes("[uni](obsidian://tomindmap-navigate?canvas=Folder%2FMap.canvas&id=d)"),
    converted[2].text
  );
});

test("a percent-encoded anchor resolves and inline code is untouched", () => {
  const nodes = [
    { id: "a", text: "Café notes" },
    { id: "b", text: "See [here](#caf%C3%A9-notes) but not `](#nope)`" }
  ];
  const converted = convertMarkdownAnchorsToCardLinks(nodes, "Map.canvas");
  assert.ok(converted[1].text.includes("id=a"));
  assert.ok(converted[1].text.includes("`](#nope)`"));
});

test("canonical anchors strip decoration, accents, and case the same way everywhere", () => {
  assert.equal(canonicalAnchor("**Café Notes!**"), "cafe-notes");
  assert.equal(canonicalAnchor("Array[0]"), "array0");
  assert.equal(canonicalAnchor("   "), "untitled");
  const anchors = canonicalAnchorMap([
    { id: "a", text: "Shared" },
    { id: "b", text: "Shared" },
    { id: "c", text: "Shared" }
  ]);
  assert.deepEqual([...anchors.keys()], ["shared", "shared-2", "shared-3"]);
  assert.equal(anchors.get("shared-2"), "b");
});

/* ------------------------------------------------------------------ */
/* limits                                                             */
/* ------------------------------------------------------------------ */

test("byte, topic, and depth budgets are typed errors", () => {
  const big = "x".repeat(4096);
  assert.equal(
    decodeFailure(big, { maxFileBytes: 16 }).reason,
    MARKDOWN_CODEC_REASON.FILE_BYTE_BUDGET
  );
  const many = Array.from({ length: 40 }, (_, index) => `- item ${index}`).join("\n");
  assert.equal(
    decodeFailure(many, { maxTopics: 8 }).reason,
    MARKDOWN_CODEC_REASON.TOPIC_BUDGET
  );
  let deep = "";
  for (let level = 0; level < 12; level++) deep += `${"  ".repeat(level)}- level ${level}\n`;
  assert.equal(
    decodeFailure(deep, { maxDepth: 4 }).reason,
    MARKDOWN_CODEC_REASON.DEPTH_BUDGET
  );
  assert.equal(
    decodeFailure("x", { maxTopics: -1 }).reason,
    MARKDOWN_CODEC_REASON.INVALID_BUDGET
  );
});

test("a plan without decoded source ranges is refused instead of guessed", () => {
  const canvas = makeCanvas({ nodes: [{ id: "a", text: "A" }] });
  assert.equal(planMarkdownSourceUpdate("# A\n", canvas, null).reason, MARKDOWN_CODEC_REASON.MISSING_SOURCE);
  assert.equal(
    planMarkdownSourceUpdate("# A\n", canvas, { roots: [] }).reason,
    MARKDOWN_CODEC_REASON.MISSING_SOURCE
  );
  assert.equal(
    planMarkdownSourceUpdate(null, canvas, { topicSources: [] }).reason,
    MARKDOWN_CODEC_REASON.INVALID_INPUT
  );
});

test("a 2,000 level chain decodes iteratively within the default budgets", () => {
  const parts = [];
  for (let level = 0; level < 2_000; level++) parts.push(`${"  ".repeat(level)}- level ${level}`);
  const value = decode(parts.join("\n"));
  assert.equal(value.topics.length, 2_000);
  let node = value.roots[0];
  let depth = 1;
  while (node.children.length > 0) {
    node = node.children[0];
    depth++;
  }
  assert.equal(depth, 2_000);
  assert.ok(DEFAULT_MARKDOWN_BUDGETS.maxDepth >= 12_000);
});

test("a deep Canvas encodes into a typed result instead of overflowing the stack", () => {
  const nodes = [{ id: "n0", text: "Root", x: 0, y: 0 }];
  const edges = [];
  for (let level = 1; level < 4_000; level++) {
    nodes.push({ id: `n${level}`, text: `Level ${level}`, x: level * 10, y: 0 });
    edges.push([`n${level - 1}`, `n${level}`]);
  }
  const result = encodeMindMapMarkdown(makeCanvas({ nodes, edges }), { includeFrontmatter: false });
  if (result.ok) assert.ok(result.value.markdown.length > 0);
  else assert.equal(result.reason, MARKDOWN_CODEC_REASON.FILE_BYTE_BUDGET);
});

test("a 12,000 topic wide forest encodes and decodes without recursion", () => {
  const nodes = [{ id: "root", text: "Root", x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 12_000; index++) {
    nodes.push({ id: `n${index}`, text: `Topic ${index}`, x: 320, y: index });
    edges.push(["root", `n${index}`]);
  }
  const canvas = makeCanvas({ nodes, edges });
  const encoded = encodeMindMapMarkdown(canvas, { includeFrontmatter: false, maxTopics: 20_000 });
  assert.equal(encoded.ok, true);
  const value = decode(encoded.value.markdown);
  assert.equal(value.topics.length, 12_001);
});

/* ------------------------------------------------------------------ */
/* identity                                                           */
/* ------------------------------------------------------------------ */

test("identity is stable across equivalent titles and independent of depth", () => {
  assert.equal(topicIdentity("A  Title").key, topicIdentity("A Title").key);
  assert.equal(topicIdentity("A Title").label, "A Title");
  assert.notEqual(topicIdentity("A Title").key, topicIdentity("B Title").key);
  const value = decode("# A Title\n\n## A  Title\n");
  assert.notEqual(value.topicIds[0], value.topicIds[1]);
});

/* ------------------------------------------------------------------ */
/* source-preserving update                                           */
/* ------------------------------------------------------------------ */

function syncFixture(markdown) {
  const first = decode(markdown);
  return { first, canvas: canvasFromDocument(first) };
}

test("a renamed topic is patched in place and the rest of the file is byte identical", () => {
  const source = [
    "---",
    "title: Notes",
    "---",
    "",
    "# Central",
    "",
    "- Alpha",
    "- Beta",
    ""
  ].join("\n");
  const { first, canvas } = syncFixture(source);
  canvas.nodes.get(first.topicIds[1]).text = "Alpha renamed";

  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true);
  assert.ok(plan.value.markdown.includes("- Alpha renamed"));
  assert.ok(plan.value.markdown.includes("- Beta"));
  // Only the renamed line and the metadata block change; the headings, the
  // blank line, and the untouched list item keep their exact bytes.
  const body = plan.value.markdown.slice(plan.value.markdown.indexOf("\n---\n") + 5);
  assert.equal(body, "\n# Central\n\n- Alpha renamed\n- Beta\n");
  const again = decode(plan.value.markdown);
  assert.deepEqual(again.topicIds, first.topicIds);
  assert.deepEqual(titles(again.roots), ["Central", "Alpha renamed", "Beta"]);
});

test("a reorder moves original source slices without touching their bytes", () => {
  const source = ["# Central", "", "## Alpha", "", "body of alpha", "", "## Beta", "", "body of beta", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  canvas.nodes.get(first.topicIds[1]).y = 900;
  canvas.nodes.get(first.topicIds[2]).y = -900;

  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true);
  const alphaIndex = plan.value.markdown.indexOf("## Alpha");
  const betaIndex = plan.value.markdown.indexOf("## Beta");
  assert.ok(alphaIndex > betaIndex, "Beta should precede Alpha after the swap");
  assert.ok(plan.value.markdown.includes("body of alpha"));
  assert.ok(plan.value.markdown.includes("body of beta"));
  // Each topic keeps the identity it had, including the blank line that used
  // to separate it from the one that now precedes it.
  assert.ok(
    plan.value.markdown.includes("## Beta\n\nbody of beta\n\n## Alpha\n\nbody of alpha"),
    JSON.stringify(plan.value.markdown)
  );

  const again = decode(plan.value.markdown);
  assert.deepEqual([...again.topicIds].sort(), [...first.topicIds].sort());
  assert.deepEqual(titles(again.roots), [
    "Central",
    "Beta\n\nbody of beta",
    "Alpha\n\nbody of alpha"
  ]);
});

test("a code topic added under a list item keeps the list indentation", () => {
  const source = ["# Central", "", "- Alpha", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  const fence = "```py\nprint(1)\n```";
  const alphaId = first.topicIds[1];
  canvas.nodes.set("code-id", { id: "code-id", text: fence, x: 320, y: 180, width: 200, height: 60 });
  canvas.edges.set("code-edge", {
    id: "code-edge",
    from: { node: canvas.nodes.get(alphaId) },
    to: { node: canvas.nodes.get("code-id") },
    fromSide: "right",
    toSide: "left"
  });

  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true, `unexpected plan failure: ${plan.reason}`);
  assert.deepEqual(plan.value.addedIds, ["code-id"]);
  // The block is written under the list marker, not flush against column zero.
  assert.ok(
    plan.value.markdown.includes(`- Alpha\n  ${fence.split("\n").join("\n  ")}`),
    JSON.stringify(plan.value.markdown)
  );

  const again = decode(plan.value.markdown);
  const alpha = findNode(again.roots, "Alpha");
  assert.equal(alpha.children.length, 1);
  assert.equal(alpha.children[0].text, fence);
  assert.equal(alpha.children[0].type, "text");
});

test("a table and an HTML topic added under a list item keep the list indentation", () => {
  const source = ["# Central", "", "- Alpha", ""].join("\n");
  for (const block of [
    "| a | b |\n| - | - |\n| 1 | 2 |",
    '<div class="callout">\nhi\n</div>',
    "> quoted line\n> second line"
  ]) {
    const { first, canvas } = syncFixture(source);
    const alphaId = first.topicIds[1];
    canvas.nodes.set("block-id", { id: "block-id", text: block, x: 320, y: 180, width: 200, height: 60 });
    canvas.edges.set("block-edge", {
      id: "block-edge",
      from: { node: canvas.nodes.get(alphaId) },
      to: { node: canvas.nodes.get("block-id") },
      fromSide: "right",
      toSide: "left"
    });
    const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
    assert.equal(plan.ok, true, `unexpected plan failure for ${block}: ${plan.reason}`);
    const again = decode(plan.value.markdown);
    const alpha = findNode(again.roots, "Alpha");
    assert.equal(alpha.children.length, 1, `block escaped its parent: ${JSON.stringify(titles(again.roots))}`);
    assert.equal(alpha.children[0].text, block);
  }
});

test("a topic added under a structural block stays inside that block's list level", () => {
  const source = ["# Central", "", "```py", "print(1)", "```", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  const blockId = first.topicIds[1];
  canvas.nodes.set("leaf-id", { id: "leaf-id", text: "Leaf", x: 320, y: 180, width: 200, height: 60 });
  canvas.edges.set("leaf-edge", {
    id: "leaf-edge",
    from: { node: canvas.nodes.get(blockId) },
    to: { node: canvas.nodes.get("leaf-id") },
    fromSide: "right",
    toSide: "left"
  });
  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true, `unexpected plan failure: ${plan.reason}`);
  const again = decode(plan.value.markdown);
  const block = findNode(again.roots, "```py\nprint(1)\n```");
  assert.ok(block, `block topic lost: ${JSON.stringify(titles(again.roots))}`);
  assert.equal(block.children.length, 1);
  assert.equal(block.children[0].text, "Leaf");
});

test("an added topic is inserted and a removed topic is deleted", () => {
  const source = ["# Central", "", "- Alpha", "- Beta", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  canvas.nodes.set("new-id", { id: "new-id", text: "Gamma", x: 320, y: 240, width: 200, height: 60 });
  canvas.edges.set("new-edge", {
    id: "new-edge",
    from: { node: canvas.nodes.get(first.topicIds[0]) },
    to: { node: canvas.nodes.get("new-id") },
    fromSide: "right",
    toSide: "left"
  });
  canvas.nodes.delete(first.topicIds[2]);

  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.value.addedIds, ["new-id"]);
  assert.deepEqual(plan.value.removedIds, [first.topicIds[2]]);
  const again = decode(plan.value.markdown);
  assert.deepEqual(titles(again.roots), ["Central", "Alpha", "Gamma"]);
  assert.deepEqual(again.topicIds, [first.topicIds[0], first.topicIds[1], "new-id"]);
});

test("a reparent is refused with a typed reason instead of corrupting the file", () => {
  const source = ["# Central", "", "- Alpha", "  - Alpha child", "- Beta", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  canvas.edges.get("edge-0").to.node = canvas.nodes.get(first.topicIds[1]);
  canvas.edges.set("edge-1", {
    id: "edge-1",
    from: { node: canvas.nodes.get(first.topicIds[1]) },
    to: { node: canvas.nodes.get(first.topicIds[0]) },
    fromSide: "right",
    toSide: "left"
  });
  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, MARKDOWN_CODEC_REASON.UNSUPPORTED_RESTRUCTURE);
});

test("topic metadata is rewritten in place without disturbing other frontmatter", () => {
  const source = ["---", "title: Notes", "tags:", "  - a", "---", "", "# Central", ""].join("\n");
  const updated = markdownWithTopicMetadata(source, {
    topicIds: ["one", "two"],
    topicKeys: ["k1", "k2"],
    topicLabels: ["One", "Two"]
  });
  assert.ok(updated.includes("title: Notes"));
  assert.ok(updated.includes("  - a"));
  assert.ok(updated.includes('topicIds: ["one","two"]'));
  assert.ok(!updated.includes("k1") || updated.includes("topicKeys"));

  const value = decode(updated);
  assert.equal(value.roots.length, 1);
});

test("topic metadata preserves ownership and unrelated tomindmap fields", () => {
  const source = [
    "---",
    "title: Notes",
    "tomindmap:",
    '  syncId: "owner-token"',
    "  colorFreezeLevel: 2",
    '  topicIds: ["old"]',
    '  topicKeys: ["old-key"]',
    '  topicLabels: ["Old"]',
    "---",
    "",
    "# Central",
    ""
  ].join("\n");
  const updated = markdownWithTopicMetadata(source, {
    topicIds: ["new"],
    topicKeys: ["new-key"],
    topicLabels: ["New"]
  });
  assert.match(updated, /syncId: "owner-token"/);
  assert.match(updated, /colorFreezeLevel: 2/);
  assert.match(updated, /topicIds: \["new"\]/);
  assert.equal(occurrences(updated, "tomindmap:"), 1);
});


test("encode preserves an ownership claim carried in Canvas frontmatter", () => {
  const canvas = makeCanvas({ nodes: [{ id: "root", text: "Root", x: 0, y: 0 }] });
  const result = encodeMindMapMarkdown(canvas, {
    frontmatter: '---\ntomindmap:\n  syncId: "owner-token"\n---'
  });
  assert.equal(result.ok, true);
  assert.match(result.value.markdown, /syncId: "owner-token"/);
  assert.match(result.value.markdown, /topicIds: \["root"\]/);
});


test("a source with no frontmatter gains a metadata block once", () => {
  const once = markdownWithTopicMetadata("# Central\n", {
    topicIds: ["one"],
    topicKeys: ["k"],
    topicLabels: ["Central"]
  });
  const twice = markdownWithTopicMetadata(once, {
    topicIds: ["one"],
    topicKeys: ["k"],
    topicLabels: ["Central"]
  });
  assert.equal(twice, once);
  assert.equal(occurrences(twice, "topicIds:"), 1);
});

test("CRLF documents keep their line endings", () => {
  const source = "---\r\ntitle: Notes\r\n---\r\n\r\n# Central\r\n";
  const updated = markdownWithTopicMetadata(source, {
    topicIds: ["one"],
    topicKeys: ["k"],
    topicLabels: ["Central"]
  });
  assert.ok(updated.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(updated));
  const value = decode(updated);
  assert.equal(value.roots[0].text, "Central");
});

test("reorder planning alone keeps every topic slice intact", () => {
  const source = ["# Central", "", "- Alpha", "  - Alpha child", "- Beta", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  canvas.nodes.get(first.topicIds[1]).y = 500;
  const result = planMarkdownTopicReorder(source, canvas);
  assert.equal(result.ok, true);
  assert.ok(result.value.markdown.includes("  - Alpha child"));
  assert.deepEqual(decode(result.value.markdown).topicIds, first.topicIds);
});

test("a deep reorder is refused with a typed reason instead of a RangeError", () => {
  const nodes = [{ id: "n0", text: "Level 0", x: 0, y: 0 }];
  const edges = [];
  for (let level = 1; level < 5_000; level++) {
    nodes.push({ id: `n${level}`, text: `Level ${level}`, x: level, y: 0 });
    edges.push([`n${level - 1}`, `n${level}`]);
  }
  const canvas = makeCanvas({ nodes, edges });
  // The guard runs before the document is parsed, so a small document is
  // enough to prove a deep map never reaches the recursive walk.
  const result = planMarkdownTopicReorder("# Level 0\n", canvas);
  assert.equal(result.ok, false);
  assert.equal(result.reason, MARKDOWN_CODEC_REASON.DEPTH_BUDGET);
  assert.equal(result.depth, 5_000);
  assert.equal(result.maxDepth, DEFAULT_MARKDOWN_BUDGETS.maxReorderDepth);
  // No option raises the ceiling: the walk it would enable is not iterative.
  for (const options of [{ maxReorderDepth: 10_000 }, { maxDepth: 10_000 }]) {
    const raised = planMarkdownTopicReorder("# Level 0\n", canvas, options);
    assert.equal(raised.ok, false);
    assert.equal(raised.reason, MARKDOWN_CODEC_REASON.DEPTH_BUDGET);
  }
  assert.equal(
    planMarkdownTopicReorder("# Level 0\n", canvas, { maxReorderDepth: 10 }).maxDepth,
    10
  );
  assert.equal(planMarkdownTopicReorder(42, canvas).reason, MARKDOWN_CODEC_REASON.INVALID_INPUT);
  assert.equal(
    planMarkdownTopicReorder("# Level 0\n", canvas, { maxReorderDepth: -1 }).reason,
    MARKDOWN_CODEC_REASON.INVALID_BUDGET
  );
});

test("a deep map still reorders inside the reorder budget", () => {
  const parts = [];
  for (let level = 0; level < 300; level++) parts.push(`${"  ".repeat(level)}- Level ${level}`);
  const source = parts.join("\n");
  const value = decode(source);
  const canvas = canvasFromDocument(value);
  // Move the deepest two topics to the top of their parent's children.
  const last = value.topicIds[value.topicIds.length - 1];
  const parent = value.topicSources.find((record) => record.id === last).parentId;
  canvas.nodes.get(last).y = -1000;
  canvas.nodes.get(parent).y = 1000;
  const result = planMarkdownTopicReorder(source, canvas);
  assert.equal(result.ok, true, `unexpected reorder failure: ${result.reason}`);
  assert.equal(result.value.markdown.length > 0, true);
  assert.equal(decode(result.value.markdown).topics.length, 300);
});

test("a source plan for a deep map degrades to a metadata-only write", () => {
  const parts = [];
  for (let level = 0; level < 120; level++) parts.push(`${"  ".repeat(level)}- Level ${level}`);
  const source = parts.join("\n");
  const value = decode(source);
  const canvas = canvasFromDocument(value);
  canvas.nodes.get(value.topicIds[0]).text = "Renamed root";
  // A rename never adds or removes, so the plan delegates to the reorder step.
  const plan = planMarkdownSourceUpdate(source, canvas, value, "Map.canvas", {
    maxReorderDepth: 10
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.value.markdown.includes("Renamed root"));
  assert.equal(plan.value.addedIds.length, 0);
});

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/* ------------------------------------------------------------------ */
/* canvas adapters and reconciliation                                 */
/* ------------------------------------------------------------------ */

test("raw canvas data adapts to the same Markdown as a live Canvas", () => {
  const data = {
    nodes: [
      { id: "root", type: "text", text: "Central", x: 0, y: 0, width: 200, height: 60 },
      { id: "child", type: "text", text: "Alpha", x: 300, y: 0, width: 200, height: 60 }
    ],
    edges: [{ id: "e0", fromNode: "root", toNode: "child", fromSide: "right", toSide: "left" }]
  };
  const adapter = canvasDataAdapter(data, { path: "Map.canvas", basename: "Map" });
  const fromData = canvasDataToMindMapMarkdown(data, { path: "Map.canvas", basename: "Map" }, {
    includeFrontmatter: false
  });
  const fromCanvas = encodeMindMapMarkdown(adapter, { includeFrontmatter: false });
  assert.equal(fromData.ok, true);
  assert.equal(fromCanvas.ok, true);
  assert.equal(fromData.value.markdown, fromCanvas.value.markdown);
});

test("an unchanged Canvas matches its imported Markdown and its order", () => {
  const source = "# Central\n\n- Alpha\n- Beta\n";
  const value = decode(source);
  const canvas = canvasFromDocument(value);
  assert.equal(canvasMatchesDocument(canvas, value, "Map.canvas"), true);
  assert.equal(canvasOrderMatchesDocument(canvas, value), true);
  canvas.nodes.get(value.topicIds[2]).text = "Changed";
  assert.equal(canvasMatchesDocument(canvas, value, "Map.canvas"), false);
});

test("the canonical preorder never scans the order it is building", () => {
  const nodes = [{ id: "root", text: "Root", x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 20_000; index++) {
    nodes.push({ id: `n${index}`, text: `Topic ${index}`, x: 400, y: index });
    edges.push(["root", `n${index}`]);
  }
  const canvas = makeCanvas({ nodes, edges });
  const original = Array.prototype.includes;
  let scans = 0;
  Array.prototype.includes = function counted(...args) {
    scans++;
    return original.apply(this, args);
  };
  let order;
  try {
    order = extractCanvasTopicPreorder(canvas);
  } finally {
    Array.prototype.includes = original;
  }
  assert.equal(order.length, 20_001);
  assert.equal(order[0], "root");
  // A quadratic guard would call `includes` once per visited topic; a linear
  // membership Set never calls it at all.
  assert.equal(scans, 0, `membership scanned the order array ${scans} times`);
});

test("canvas topic preorder and selected forests stay iterative", () => {
  const nodes = [{ id: "root", text: "Root", x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 5_000; index++) {
    nodes.push({ id: `n${index}`, text: `Topic ${index}`, x: 300, y: index });
    edges.push(["root", `n${index}`]);
  }
  const canvas = makeCanvas({ nodes, edges, selection: ["n4999"] });
  assert.equal(extractCanvasTopicPreorder(canvas).length, 5_001);
  const selected = extractSelectedTopicForest(canvas);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].canvasNode.id, "n4999");
  assert.equal(extractSelectedTopicForest(makeCanvas({ nodes, edges })).length, 0);
});

test("a surplus parent edge is ignored the way the canonical forest ignores it", () => {
  // `child` claims two parents. The first accepted edge wins in
  // `buildForest`, so `child` belongs to `a` and the extra `b -> child` edge
  // must not reorder the map or make the plan report a reparent.
  const source = ["# Root", "", "- B", "- A", "  - Child", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  const [rootId, bId, aId, childId] = first.topicIds;
  canvas.edges.set("surplus", {
    id: "surplus",
    from: { node: canvas.nodes.get(bId) },
    to: { node: canvas.nodes.get(childId) },
    fromSide: "right",
    toSide: "left"
  });
  assert.ok(rootId && aId);

  const order = extractCanvasTopicPreorder(canvas);
  assert.deepEqual(order, [rootId, bId, aId, childId]);
  assert.equal(order.length, 4, "a surplus edge must not duplicate or drop a topic");

  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true, `surplus edge reported as a restructure: ${plan.reason}`);
  assert.deepEqual(plan.value.addedIds, []);
  assert.deepEqual(plan.value.removedIds, []);
  assert.equal(canvasMatchesDocument(canvas, first, "Map.canvas"), true);
});

test("a directed cycle is rejected rather than walked", () => {
  const canvas = makeCanvas({
    nodes: [
      { id: "c", text: "C", x: 0, y: 100 },
      { id: "a", text: "A", x: 0, y: 0 },
      { id: "b", text: "B", x: 0, y: 200 }
    ],
    edges: [
      ["a", "b"],
      ["b", "a"],
      ["a", "c"]
    ]
  });
  const order = extractCanvasTopicPreorder(canvas);
  // `a` is the only root; the cycle edge is dropped, so the walk still yields
  // a depth-first order of the canonical forest rather than an arbitrary one.
  assert.deepEqual(order, ["a", "c", "b"]);
  assert.equal(new Set(order).size, 3);
});

test("a self loop and a dangling edge are ignored", () => {
  const canvas = makeCanvas({
    nodes: [
      { id: "root", text: "Root", x: 0, y: 0 },
      { id: "child", text: "Child", x: 300, y: 0 }
    ],
    edges: [
      ["root", "child"],
      ["child", "child"],
      ["root", "ghost"]
    ]
  });
  assert.deepEqual(extractCanvasTopicPreorder(canvas), ["root", "child"]);
});

test("a canonical parent map keeps a surplus edge out of the source plan", () => {
  const source = ["# Root", "", "- A", "  - Child", ""].join("\n");
  const { first, canvas } = syncFixture(source);
  const [, aId, childId] = first.topicIds;
  // A raw last-write-wins parent map would move `Child` under `A`'s sibling
  // and report a reparent for a map that never changed.
  canvas.edges.set("surplus", {
    id: "surplus",
    from: { node: canvas.nodes.get(first.topicIds[0]) },
    to: { node: canvas.nodes.get(childId) },
    fromSide: "right",
    toSide: "left"
  });
  assert.equal(aId !== childId, true);
  const plan = planMarkdownSourceUpdate(source, canvas, first, "Map.canvas");
  assert.equal(plan.ok, true, `surplus edge reported as a restructure: ${plan.reason}`);
  const again = decode(plan.value.markdown);
  const alpha = findNode(again.roots, "A");
  assert.deepEqual(alpha.children.map((child) => child.text), ["Child"]);
  assert.deepEqual([...again.topicIds].sort(), [...first.topicIds].sort());
});

test("text to media and media to text transitions adopt the incoming dimensions", () => {
  const imported = (id, spec) => ({ id, x: 0, y: 0, ...spec });
  const reconcile = (existing, incoming) =>
    reconcileCanvasData({ mindmap: true, nodes: existing, edges: [] }, {
      nodes: incoming,
      edges: [],
      frontmatter: ""
    });

  // text -> file
  const toFile = reconcile(
    [{ id: "a", type: "text", text: "Topic", x: 0, y: 0, width: 200, height: 60 }],
    [imported("a", { type: "file", file: "Documents/a.pdf", width: 640, height: 480 })]
  );
  assert.equal(toFile.nodes[0].width, 640);
  assert.equal(toFile.nodes[0].height, 480);
  assert.ok(!toFile.mindmapPendingResize?.includes("a"));

  // text -> link
  const toLink = reconcile(
    [{ id: "a", type: "text", text: "Topic", x: 0, y: 0, width: 200, height: 60 }],
    [imported("a", { type: "link", url: "https://example.com", width: 480, height: 280 })]
  );
  assert.equal(toLink.nodes[0].width, 480);
  assert.ok(!toLink.mindmapPendingResize?.includes("a"));

  // file -> text
  const toText = reconcile(
    [{ id: "a", type: "file", file: "Documents/a.pdf", x: 0, y: 0, width: 913, height: 677 }],
    [imported("a", { type: "text", text: "Topic", width: 240, height: 60 })]
  );
  assert.equal(toText.nodes[0].width, 240);
  assert.ok(toText.mindmapPendingResize.includes("a"));

  // file -> file keeps the user's resize
  const mediaToMedia = reconcile(
    [{ id: "a", type: "file", file: "Documents/Old.pdf", x: 0, y: 0, width: 913, height: 677 }],
    [imported("a", { type: "file", file: "Documents/New.pdf", width: 640, height: 480 })]
  );
  assert.equal(mediaToMedia.nodes[0].width, 913);
  assert.equal(mediaToMedia.nodes[0].height, 677);
  assert.ok(!mediaToMedia.mindmapPendingResize?.includes("a"));

  // text -> text, changed content
  const textChanged = reconcile(
    [{ id: "a", type: "text", text: "Old", x: 0, y: 0, width: 200, height: 60 }],
    [imported("a", { type: "text", text: "New", width: 240, height: 60 })]
  );
  assert.equal(textChanged.nodes[0].width, 240);
  assert.ok(textChanged.mindmapPendingResize.includes("a"));

  // text -> text, unchanged content
  const textSame = reconcile(
    [{ id: "a", type: "text", text: "Same", x: 0, y: 0, width: 300, height: 90 }],
    [imported("a", { type: "text", text: "Same", width: 240, height: 60 })]
  );
  assert.equal(textSame.nodes[0].width, 300);
  assert.ok(!textSame.mindmapPendingResize?.includes("a"));
});

test("groups and their edges survive reconciliation", () => {
  const reconciled = reconcileCanvasData(
    {
      mindmap: true,
      mindmapAutoAdjust: true,
      nodes: [
        { id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 60 },
        { id: "g1", type: "group", x: 0, y: 0, width: 10, height: 10 }
      ],
      edges: [{ id: "ge", fromNode: "g1", toNode: "a" }]
    },
    { nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 60 }], edges: [], frontmatter: "" }
  );
  assert.equal(reconciled.mindmapAutoAdjust, undefined);
  assert.ok(reconciled.nodes.some((node) => node.id === "g1"));
  assert.ok(reconciled.edges.some((edge) => edge.id === "ge"));
});

test("topic text serialization escapes nothing and keeps the first meaningful line", () => {
  assert.equal(serializeTopicText({ text: "  # Heading body\nSecond line  " }), "Heading body\nSecond line");
  assert.equal(serializeTopicText({ file: "Attachments/a.png" }), "![](<Attachments/a.png>)");
  assert.equal(serializeTopicText({ type: "link", url: "https://example.com" }), "[example.com](<https://example.com>)");
  assert.equal(serializeTopicText({}), "Untitled");
  assert.equal(serializeTopicText({ text: "C# and array[0]" }), "C# and array[0]");
});

/* ------------------------------------------------------------------ */
/* checkbox mapping                                                   */
/* ------------------------------------------------------------------ */

test("checkbox mapping targets the rendered checkbox in a mixed list", () => {
  const text = [
    "- [ ] first",
    "- plain item",
    "1. [x] ordered task",
    "",
    "```",
    "- [ ] fenced, not a task",
    "```",
    "",
    "- [ ] second"
  ].join("\n");
  const second = toggleTopicCheckbox(text, 2);
  assert.equal(second.changed, true);
  assert.ok(second.text.includes("- [ ] first"));
  assert.ok(second.text.includes("1. [x] ordered task"));
  assert.ok(second.text.includes("- [ ] fenced, not a task"));
  assert.ok(second.text.includes("- [x] second"));

  const first = toggleTopicCheckbox(text, 0);
  assert.ok(first.text.includes("- [x] first"));
  assert.ok(first.text.includes("1. [x] ordered task"));

  const missing = toggleTopicCheckbox(text, 99);
  assert.equal(missing.changed, false);
  assert.equal(missing.text, text);
});

test("checkbox mapping is a no-op for a topic without tasks", () => {
  const text = "Just prose\nwith `no` tasks";
  const result = toggleTopicCheckbox(text, 0);
  assert.equal(result.changed, false);
  assert.equal(result.text, text);
});

/* ------------------------------------------------------------------ */
/* encode                                                             */
/* ------------------------------------------------------------------ */

test("encode writes headings, then lists, and keeps a stable ending newline", () => {
  const canvas = makeCanvas({
    nodes: [
      { id: "root", text: "Central", x: 0, y: 0, width: 200, height: 60 },
      { id: "a", text: "Alpha", x: 300, y: 0, width: 200, height: 60 },
      { id: "b", text: "Beta", x: 300, y: 120, width: 200, height: 60 }
    ],
    edges: [
      ["root", "a"],
      ["root", "b"]
    ]
  });
  const encoded = encodeMindMapMarkdown(canvas, { includeFrontmatter: false });
  assert.equal(encoded.ok, true);
  assert.equal(encoded.value.markdown, "# Central\n\n## Alpha\n\n## Beta\n");
  assert.equal(lines(encoded.value.markdown).at(-1), "");
});

test("encode reports an empty Canvas as an empty document", () => {
  const encoded = encodeMindMapMarkdown(makeCanvas({}), { includeFrontmatter: false });
  assert.equal(encoded.ok, true);
  assert.equal(encoded.value.empty, true);
  assert.equal(encoded.value.markdown, "");
});

test("encode enforces the same budgets as decode", () => {
  const nodes = [{ id: "root", text: "Root", x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 20; index++) {
    nodes.push({ id: `n${index}`, text: `Topic ${index}`, x: 300, y: index });
    edges.push(["root", `n${index}`]);
  }
  const result = encodeMindMapMarkdown(makeCanvas({ nodes, edges }), { maxTopics: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, MARKDOWN_CODEC_REASON.TOPIC_BUDGET);
});

test("encode keeps a fenced topic as a block instead of a list item", () => {
  const fence = "```py\nprint(1)\n```";
  const canvas = makeCanvas({
    nodes: [
      { id: "root", text: "Central", x: 0, y: 0 },
      { id: "code", text: fence, x: 320, y: 0 },
      { id: "note", text: "Note", x: 320, y: 200 }
    ],
    edges: [
      ["root", "code"],
      ["root", "note"]
    ]
  });
  const encoded = encodeMindMapMarkdown(canvas, { includeFrontmatter: false });
  assert.equal(encoded.ok, true);
  assert.ok(encoded.value.markdown.includes(fence));
  const again = decode(encoded.value.markdown);
  assert.equal(again.roots[0].children.length, 2);
  assert.equal(again.roots[0].children[0].text, fence);
});

/* ------------------------------------------------------------------ */
/* Canvas import layout                                               */
/* ------------------------------------------------------------------ */

test("layout produces flat nodes, edges, and root ids from a decoded document", () => {
  const value = decode("# Central\n\n- Alpha\n- Beta\n");
  const missing = layoutMarkdownMindMap(value, LAYOUT);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, MARKDOWN_CODEC_REASON.LAYOUT_UNAVAILABLE);

  const layout = (root, x, y, options, nodes, edges) => {
    const place = (node, atX, atY) => {
      nodes.push({
        id: node.id,
        type: node.type === "text" ? "text" : node.type,
        text: node.text,
        file: node.file ?? undefined,
        url: node.url ?? undefined,
        x: atX,
        y: atY,
        width: options.nodeWidth,
        height: options.nodeHeight
      });
      for (const child of node.children) {
        edges.push({ id: `e-${node.id}-${child.id}`, fromNode: node.id, toNode: child.id });
        place(child, atX + options.horizontalGap, atY + options.verticalGap);
      }
    };
    place(root, x, y);
    return options.nodeHeight;
  };
  const result = layoutMarkdownMindMap(value, { ...LAYOUT, layout });
  assert.equal(result.ok, true);
  assert.equal(result.value.nodes.length, 3);
  assert.equal(result.value.edges.length, 2);
  assert.deepEqual(result.value.rootIds, [value.roots[0].id]);
  assert.deepEqual(result.value.topicIds, value.topicIds);

  const empty = layoutMarkdownMindMap("   ", { ...LAYOUT, layout });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value.nodes, []);
  assert.deepEqual(empty.value.rootIds, []);
});

/* ------------------------------------------------------------------ */
/* registry compatibility                                             */
/* ------------------------------------------------------------------ */

test("the codec embeds cleanly through the runtime module compiler", () => {
  const { createArtifactCompiler } = require("../scripts/runtime-modules.js");
  const compiler = createArtifactCompiler([
    { name: "media-drop", source: "lib/media-drop.js", bindings: { default: "MediaDrop" }, dependencies: [] },
    { name: "markdown-order", source: "lib/markdown-order.js", bindings: { default: "MarkdownOrder" }, dependencies: [] },
    {
      name: "tree-model",
      source: "lib/tree-model.js",
      bindings: { named: ["buildForest", "getGroupIds"] },
      dependencies: []
    },
    {
      name: "markdown-codec",
      source: "lib/markdown-codec.js",
      bindings: { default: "MarkdownMindMapCodec" },
      dependencies: ["media-drop", "markdown-order", "tree-model"]
    }
  ]);
  const entry = "var MarkdownMindMapCodec = require('./lib/markdown-codec.js');\n";
  const compiled = compiler.compile(entry);
  assert.ok(!compiled.includes('require("./media-drop.js")'));
  assert.ok(!compiled.includes('require("./markdown-order.js")'));
  assert.ok(!compiled.includes('require("./tree-model.js")'));
  const sandbox = {
    URL,
    TextEncoder,
    TextDecoder,
    console,
    module: { exports: {} },
    require(id) {
      throw new Error(`Unexpected module request: ${id}`);
    }
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "markdown-codec-bundle.js" });
  const embedded = sandbox.MarkdownMindMapCodec;
  assert.equal(typeof embedded.decodeMarkdownMindMap, "function");
  assert.equal(embedded.decodeMarkdownMindMap("# Central\n").value.roots[0].text, "Central");
});
