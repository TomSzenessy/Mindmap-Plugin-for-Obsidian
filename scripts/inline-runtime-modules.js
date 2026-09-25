"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "main.js");
const mainPath = path.join(root, "main.js");
const { artifactCompiler } = require("./runtime-modules");

function compileMainSource(source) {
  return artifactCompiler.compile(source);
}

if (require.main === module) {
  const original = fs.readFileSync(mainPath, "utf8");
  const main = compileMainSource(fs.readFileSync(sourcePath, "utf8"));

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
}

module.exports = { compileMainSource };
