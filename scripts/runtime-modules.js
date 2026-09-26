"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const modules = [
  {
    name: "tree-model",
    source: "lib/tree-model.js",
    bindings: {
      named: [
        "buildForest",
        "getGroupIds",
        "findTreeForNode",
        "countReachable",
        "setDepths",
        "findTreeNode",
        "getDescendants",
        "assignDirections",
        "propagateDirection",
        "countChildrenPerSide"
      ]
    },
    dependencies: []
  },
  {
    name: "path-safety",
    source: "lib/path-safety.js",
    bindings: { named: ["MAX_FILENAME_BYTES", "allocateFilePath", "portableFilenameStem"] },
    dependencies: []
  },
  {
    name: "settings",
    source: "lib/settings.js",
    bindings: { named: ["DEFAULT_SETTINGS", "SETTINGS_FIELDS", "normalizeSettings"] },
    dependencies: []
  },
  {
    name: "media-drop",
    source: "lib/media-drop.js",
    bindings: {
      named: [
        "createFileNodeSpec",
        "createLinkNodeSpec",
        "decodeMediaResource",
        "droppedUrl",
        "hasSupportedDrop",
        "linkLabel",
        "mediaKind",
        "mediaNodeSize"
      ]
    },
    dependencies: []
  },
  {
    name: "live-sizing",
    source: "lib/live-sizing.js",
    bindings: {
      named: [
        "CARD_LAYOUT_VERSION",
        "SIZING_STATUS",
        "LiveSizingController",
        "hasAsyncRenderableContent",
        "isResizableCanvasNode",
        "isTextTopicCard"
      ]
    },
    dependencies: []
  },
  {
    name: "markdown-order",
    source: "lib/markdown-order.js",
    bindings: { default: "MarkdownOrder" },
    dependencies: []
  },
  {
    name: "clipboard-markdown",
    source: "lib/clipboard-markdown.js",
    bindings: { named: ["normalizeClipboardMarkdown"] },
    dependencies: []
  },
  {
    name: "vector-pdf",
    source: "lib/vector-pdf-bundle.js",
    bindings: { named: ["renderSvgToPdf"] },
    dependencies: []
  },
  {
    name: "export",
    source: "lib/export.js",
    bindings: {
      named: [
        "colorDistance",
        "createApprovedPublicHttpsAssetResolver",
        "createExportAssetResolver",
        "createExportDelivery",
        "createExportMindMapModal",
        "createExportPlan",
        "createRasterExportSession",
        "embedDocumentAssets",
        "paginatedPdfDocument",
        "parseCssColor",
        "rasterizeSvg",
        "renderHtmlAsVectorPdf",
        "sanitizeExportElement",
        "serializeXmlSafe",
        "saveToDownloads",
        "visibleCardPaint"
      ]
    },
    dependencies: ["path-safety", "vector-pdf"]
  },
  {
    name: "tree-drag",
    source: "lib/tree-drag.js",
    bindings: { default: "TreeDrag" },
    dependencies: ["tree-model"]
  },
  {
    name: "mindmap-actions",
    source: "lib/mindmap-actions.js",
    bindings: { default: "MindmapActions" },
    dependencies: ["path-safety", "tree-model"]
  },
  {
    name: "drag-preview-controller",
    source: "lib/drag-preview-controller.js",
    bindings: { named: ["createDragAttachmentController", "isPrimaryCardGesture"] },
    dependencies: ["tree-drag"]
  },
  {
    name: "canvas-session",
    source: "lib/canvas-session.js",
    bindings: {
      named: [
        "finalizeNewTextNode",
        "removeEmptyNodeOnEditExit",
        "pruneEmptyLeafTopics",
        "isBlankMindmapCanvas",
        "isRootTopicNode",
        "deriveCanvasTitle",
        "flushCanvasView",
        "reflowCanvasAfterMove"
      ]
    },
    dependencies: []
  },
  {
    name: "canvas-api",
    source: "lib/canvas-api.js",
    bindings: { named: ["CanvasAPI", "findNodeFromEvent", "genId"] },
    dependencies: ["tree-model"]
  },
  {
    name: "node-operations",
    source: "lib/node-operations.js",
    bindings: { named: ["NodeOperations"] },
    dependencies: ["tree-model"]
  },
  {
    name: "layout",
    source: "lib/layout.js",
    bindings: {
      named: ["LayoutEngine", "BranchColors"]
    },
    dependencies: ["tree-model"]
  },
  {
    name: "keyboard-navigation",
    source: "lib/keyboard-navigation.js",
    bindings: { named: ["KeyboardHandler", "Navigation"] },
    dependencies: ["tree-model"]
  },
  {
    name: "freemind",
    source: "lib/freemind.js",
    bindings: {
      named: [
        "DEFAULT_FREEMIND_BUDGETS",
        "FREEMIND_REASON",
        "decodeFreeMind",
        "exportToFreeMind",
        "freemindToCanvas",
        "layoutTree",
        "parseFreeMindXml"
      ]
    },
    dependencies: ["canvas-api"]
  },
  {
    name: "markdown-codec",
    source: "lib/markdown-codec.js",
    bindings: { default: "MarkdownMindMapCodec" },
    dependencies: ["media-drop", "markdown-order", "tree-model"]
  },
  {
    name: "markdown-sync",
    source: "lib/markdown-sync.js",
    bindings: {
      named: [
        "LINK_REASON",
        "DEFAULT_INDEX_LIMIT",
        "DEFAULT_DEBOUNCE_MS",
        "MARKDOWN_EXTENSION",
        "CANVAS_EXTENSION",
        "OWNERSHIP_SCHEMA",
        "OWNERSHIP_VERSION",
        "OWNERSHIP_KIND",
        "OWNERSHIP_BLOCK_KEY",
        "OWNERSHIP_FIELD_KEY",
        "CARD_SYNC_KEY",
        "createSyncId",
        "createMarkdownSyncOwnership",
        "loadMarkdownSyncOwnership",
        "MarkdownSyncOwnership",
        "OwnershipRegistry",
        "isCanonicalVaultPath",
        "parseFrontmatterOwnership",
        "decodeSyncIdScalar",
        "encodeSyncIdScalar",
        "syncIdFrontmatterLines",
        "patchSyncIdOwnership",
        "resolveMarkdownSyncLink",
        "resolveParentLink",
        "adoptMarkdownSyncLink",
        "adoptParentLink",
        "MarkdownSyncIndex",
        "MarkdownSyncCoordinator"
      ]
    },
    dependencies: []
  },
  {
    name: "touch-controls",
    source: "lib/touch-controls.js",
    bindings: { named: ["TouchControlsController"] },
    dependencies: []
  },
  {
    name: "outline-view",
    source: "lib/outline-view.js",
    bindings: {
      named: [
        "OUTLINE_VIEW_TYPE",
        "OutlineView",
        "buildOutlineModel",
        "outlineTreeDescendants",
        "writeClipboardText"
      ]
    },
    dependencies: ["tree-model", "markdown-codec"]
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerPattern(name) {
  return new RegExp(
    `// <tomindmap:module ${escapeRegExp(name)}>\\n[\\s\\S]*?// </tomindmap:module ${escapeRegExp(name)}>`
  );
}

function normalizedBindings(bindings) {
  if (Array.isArray(bindings))
    return { named: bindings };
  if (typeof bindings === "string")
    return { default: bindings };
  return bindings;
}

function bindingText(bindings) {
  const normalized = normalizedBindings(bindings);
  if (normalized.default)
    return normalized.default;
  return `{\n${normalized.named.map((name) => `  ${name}`).join(",\n")}\n}`;
}

function declaration(definition) {
  return `var ${bindingText(definition.bindings)}`;
}

function requireLine(definition) {
  return `${declaration(definition)} = require(${JSON.stringify(`./${definition.source}`)});`;
}

function runtimeImportPattern(definition, modulePath = `./${definition.source}`) {
  return new RegExp(
    `^(?:var|const|let)\\s+(?:\\{[^;]*?\\}|[A-Za-z_$][\\w$]*)\\s*=\\s*require\\(\\s*(['"])${escapeRegExp(modulePath)}\\1\\s*\\);[\\t ]*(?:\\r?\\n|$)`,
    "m"
  );
}

function dependencyPath(definition, dependency) {
  const relative = path.posix.relative(
    path.posix.dirname(definition.source),
    dependency.source
  );
  return `./${relative}`;
}

function removeStrictDirective(source) {
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < source.length) {
    while (index < source.length && /[\t \r\n]/.test(source[index]))
      index++;
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1)
        return source;
      index = end + 2;
      continue;
    }
    break;
  }
  const match = source.slice(index).match(/^(["'])use strict\1;[\t ]*(?:\r?\n|$)/);
  if (!match)
    return source;
  return source.slice(0, index) + source.slice(index + match[0].length);
}

function dependencyExpression(definition) {
  const bindings = normalizedBindings(definition.bindings);
  if (bindings.default)
    return bindings.default;
  return bindingText(bindings);
}

function validateDefinitions(definitions) {
  const byName = new Map();
  for (const definition of definitions) {
    if (byName.has(definition.name))
      throw new Error(`Duplicate runtime module: ${definition.name}`);
    byName.set(definition.name, definition);
  }
  for (const definition of definitions) {
    for (const dependency of definition.dependencies || []) {
      if (!byName.has(dependency))
        throw new Error(`Unknown runtime dependency ${dependency} for ${definition.name}`);
    }
  }
  return byName;
}

function createArtifactCompiler(definitions = modules, options = {}) {
  const readModule = options.readModule || ((source) =>
    fs.readFileSync(path.join(root, source), "utf8"));
  const byName = validateDefinitions(definitions);

  function moduleBlock(definition) {
    let source = removeStrictDirective(readModule(definition.source)).trimEnd();
    for (const dependencyName of definition.dependencies || []) {
      const dependency = byName.get(dependencyName);
      const importPath = dependencyPath(definition, dependency);
      source = source.replace(
        runtimeImportPattern(dependency, importPath),
        ""
      );
      source = source.replace(
        new RegExp(
          `require\\(\\s*(['"])${escapeRegExp(importPath)}\\1\\s*\\)`,
          "g"
        ),
        () => dependencyExpression(dependency)
      );
    }
    return [
      `// <tomindmap:module ${definition.name}>`,
      `${declaration(definition)} = (() => {`,
      '  "use strict";',
      "  const module = { exports: {} };",
      "  const exports = module.exports;",
      source.split("\n").map((line) => line ? `  ${line}` : "").join("\n"),
      "  return module.exports;",
      "})();",
      `// </tomindmap:module ${definition.name}>`
    ].join("\n");
  }

  function compile(source) {
    const entryImports = new Map();
    for (const definition of definitions) {
      const importPattern = runtimeImportPattern(definition);
      if (importPattern.test(source))
        entryImports.set(definition, importPattern);
    }

    let generated = source;
    for (const definition of definitions) {
      const importPattern = entryImports.get(definition);
      if (importPattern)
        generated = generated.replace(importPattern, () => `${moduleBlock(definition)}\n`);
    }

    const embeddedOnly = definitions.filter((definition) =>
      !entryImports.has(definition) &&
      definitions.some((candidate) => (candidate.dependencies || []).includes(definition.name)));
    if (embeddedOnly.length)
      generated = `${embeddedOnly.map((definition) => moduleBlock(definition)).join("\n\n")}\n\n${generated}`;

    for (const definition of definitions) {
      if (!entryImports.has(definition) && !embeddedOnly.includes(definition))
        throw new Error(`Could not find runtime import for ${definition.name}`);
    }
    return generated;
  }

  function extract(bundle) {
    let extracted = bundle;
    for (const definition of definitions) {
      const pattern = markerPattern(definition.name);
      if (!pattern.test(extracted))
        throw new Error(`Could not find bundled runtime module: ${definition.name}`);
      extracted = extracted.replace(pattern, () => requireLine(definition));
    }
    return extracted;
  }

  return { compile, extract };
}

const artifactCompiler = createArtifactCompiler();

module.exports = {
  artifactCompiler,
  createArtifactCompiler,
  markerPattern,
  modules,
  requireLine
};
