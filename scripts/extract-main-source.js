"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "main.js");
const sourceDirectory = path.join(root, "src");
const sourcePath = path.join(sourceDirectory, "main.js");
const build = require("./runtime-modules");

let source = fs.readFileSync(bundlePath, "utf8");
for (const definition of build.modules) {
  const markerPattern = build.markerPattern(definition.name);
  if (!markerPattern.test(source))
    throw new Error(`Could not find bundled runtime module: ${definition.name}`);
  source = source.replace(markerPattern, definition.requireLine);
}

fs.mkdirSync(sourceDirectory, { recursive: true });
fs.writeFileSync(sourcePath, source);
console.log(`Extracted maintainable entry source to ${path.relative(root, sourcePath)}`);
