"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "main.js");
const sourceDirectory = path.join(root, "src");
const sourcePath = path.join(sourceDirectory, "main.js");
const { artifactCompiler } = require("./runtime-modules");

const source = artifactCompiler.extract(fs.readFileSync(bundlePath, "utf8"));

fs.mkdirSync(sourceDirectory, { recursive: true });
fs.writeFileSync(sourcePath, source);
console.log(`Extracted maintainable entry source to ${path.relative(root, sourcePath)}`);
