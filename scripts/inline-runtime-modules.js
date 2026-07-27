"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "main.js");
const mainPath = path.join(root, "main.js");
const { markerPattern, modules } = require("./runtime-modules");

function moduleBlock(definition) {
  const source = fs.readFileSync(path.join(root, definition.source), "utf8")
    .replace(/^["']use strict["'];\s*/, "")
    .trimEnd();
  return [
    `// <tomindmap:module ${definition.name}>`,
    `${definition.declaration} = (() => {`,
    "  const module = { exports: {} };",
    "  const exports = module.exports;",
    source.split("\n").map((line) => line ? `  ${line}` : "").join("\n"),
    "  return module.exports;",
    "})();",
    `// </tomindmap:module ${definition.name}>`
  ].join("\n");
}

const original = fs.readFileSync(mainPath, "utf8");
let main = fs.readFileSync(sourcePath, "utf8");
for (const definition of modules) {
  const block = moduleBlock(definition);
  if (!main.includes(definition.requireLine))
    throw new Error(`Could not find runtime import for ${definition.name}`);
  main = main.replace(definition.requireLine, block);
}

// Earlier releases kept pre-extraction implementations behind unreachable
// `if (false)` blocks. Compact them whenever an older bundle is rebuilt.
const legacyRegions = [
  {
    pattern: /function canvasTopicPreorder\(canvas\) \{[\s\S]*?\n\}\nfunction markdownLineRecords/,
    replacement: `function canvasTopicPreorder(canvas) {
  return MarkdownOrder.canvasTopicPreorder(canvas, getGroupIds);
}
function markdownLineRecords`
  },
  {
    pattern: /function reorderMarkdownTopicsPreservingSource\(markdown, canvas\) \{[\s\S]*?\n\}\nfunction patchMarkdownFromCanvasPreservingSource/,
    replacement: `function reorderMarkdownTopicsPreservingSource(markdown, canvas) {
  return MarkdownOrder.reorderPreservingSource(markdown, canvas, {
    getGroupIds,
    parseDocument: parseMarkdownMindMapDocument,
    lineRecords: markdownLineRecords,
    withMetadata: markdownWithTopicMetadata,
    withoutLegacyComments: withoutLegacyPluginComments,
    identityKey: topicIdentityKey,
    identityLabel: topicIdentityLabel
  });
}
function patchMarkdownFromCanvasPreservingSource`
  },
  {
    pattern: /^  getAutoNodeSize\(node\) \{[\s\S]*?^  \}\n^  \/\*\*\n^   \* Resize text cards/m,
    replacement: `  getAutoNodeSize(node) {
    return this.liveSizing.measure(node);
  }
  /**
   * Resize text cards`
  },
  {
    pattern: /^  resizeNodes\(canvas, nodes\) \{[\s\S]*?^  \}\n^  \/\*\*\n^   \* Render Markdown off-screen/m,
    replacement: `  resizeNodes(canvas, nodes) {
    return this.liveSizing.resizeNodes(canvas, nodes);
  }
  /**
   * Render Markdown off-screen`
  },
  {
    pattern: /^  resizeNodesWhenRendered\(canvas, nodes\) \{[\s\S]*?^  \}\n^  \/\*\*\n^   \* After a width change/m,
    replacement: `  resizeNodesWhenRendered(canvas, nodes) {
    return this.liveSizing.resizeNodesWhenRendered(canvas, nodes);
  }
  /**
   * After a width change`
  },
  {
    pattern: /^  resizeNodesRetry\(canvas, nodes, attempt = 0\) \{[\s\S]*?^  \}\n^  finishInsertNode/m,
    replacement: `  resizeNodesRetry(canvas, nodes) {
    return this.liveSizing.resizeNodesRetry(canvas, nodes);
  }
  finishInsertNode`
  }
];
for (const region of legacyRegions) {
  if (region.pattern.test(main))
    main = main.replace(region.pattern, region.replacement);
}

if (process.argv.includes("--check")) {
  if (main !== original) {
    console.error("main.js is out of date. Run: npm run build");
    process.exitCode = 1;
  } else {
    console.log("main.js runtime modules are up to date");
  }
} else {
  fs.writeFileSync(mainPath, main);
  console.log("Inlined runtime modules into main.js");
}
