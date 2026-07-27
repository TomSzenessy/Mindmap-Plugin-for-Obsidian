"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mainPath = path.join(root, "main.js");

const modules = [
  {
    name: "live-sizing",
    source: "lib/live-sizing.js",
    requireLine: 'var { LiveSizingController } = require("./lib/live-sizing.js");',
    declaration: "var { LiveSizingController }"
  },
  {
    name: "markdown-order",
    source: "lib/markdown-order.js",
    requireLine: 'var MarkdownOrder = require("./lib/markdown-order.js");',
    declaration: "var MarkdownOrder"
  },
  {
    name: "export",
    source: "lib/export.js",
    requireLine: 'var { createExportMindMapModal, rasterizeSvg, saveToDownloads } = require("./lib/export.js");',
    declaration: "var { createExportMindMapModal, rasterizeSvg, saveToDownloads }"
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

let main = fs.readFileSync(mainPath, "utf8");
for (const definition of modules) {
  const block = moduleBlock(definition);
  const markerPattern = new RegExp(
    `// <tomindmap:module ${escapeRegExp(definition.name)}>\\n[\\s\\S]*?// </tomindmap:module ${escapeRegExp(definition.name)}>`
  );
  if (markerPattern.test(main)) {
    main = main.replace(markerPattern, block);
    continue;
  }
  if (!main.includes(definition.requireLine))
    throw new Error(`Could not find runtime import for ${definition.name}`);
  main = main.replace(definition.requireLine, block);
}

fs.writeFileSync(mainPath, main);
console.log("Inlined runtime modules into main.js");
