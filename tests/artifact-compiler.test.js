"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { artifactCompiler, createArtifactCompiler, modules } = require("../scripts/runtime-modules.js");
const { loadPluginCode } = require("../test-load.js");

test("generated runtime modules execute without relative dependencies", () => {
  const definitions = [
    {
      name: "answer-module",
      source: "fixture/answer.js",
      bindings: { named: ["answer"] },
      dependencies: []
    },
    {
      name: "consumer-module",
      source: "fixture/consumer.js",
      bindings: { default: "ConsumerRuntime" },
      dependencies: ["answer-module"]
    }
  ];
  const moduleSources = {
    "fixture/answer.js": "module.exports = { answer: 42 };",
    "fixture/consumer.js": [
      'const { answer } = require("./answer.js");',
      "module.exports = function ConsumerRuntime() { return answer; };"
    ].join("\n")
  };
  const compiler = createArtifactCompiler(definitions, {
    readModule: (source) => moduleSources[source]
  });
  const generated = compiler.compile([
    'var { answer } = require("./fixture/answer.js");',
    'var ConsumerRuntime = require("./fixture/consumer.js");',
    "module.exports = { answer, ConsumerRuntime };"
  ].join("\n"));

  assert.doesNotMatch(generated, /require\(["']\.\//);
  const runtime = loadPluginCode(generated);
  assert.equal(runtime.answer, 42);
  assert.equal(runtime.ConsumerRuntime(), 42);
});

test("generated module IIFEs begin with strict mode", () => {
  const definitions = [{
    name: "strict-module",
    source: "fixture/strict.js",
    bindings: { named: ["strictValue"] },
    dependencies: []
  }];
  const compiler = createArtifactCompiler(definitions, {
    readModule: () => [
      '"use strict";',
      "function strictValue() { return this === undefined; }",
      "module.exports = { strictValue };"
    ].join("\n")
  });
  const generated = compiler.compile([
    'var { strictValue } = require("./fixture/strict.js");',
    "module.exports = { strictValue };"
  ].join("\n"));
  const runtime = loadPluginCode(generated);

  const strictValue = runtime.strictValue;
  assert.equal(strictValue(), true);
});

test("normalizes a strict directive after a module header comment", () => {
  const definitions = [{
    name: "commented-strict-module",
    source: "fixture/commented-strict.js",
    bindings: { named: ["strictValue"] },
    dependencies: []
  }];
  const compiler = createArtifactCompiler(definitions, {
    readModule: () => [
      "/* maintainer header */",
      "'use strict';",
      "function strictValue() { return this === undefined; }",
      "module.exports = { strictValue };"
    ].join("\n")
  });
  const generated = compiler.compile([
    'var { strictValue } = require("./fixture/commented-strict.js");',
    "module.exports = { strictValue };"
  ].join("\n"));

  assert.equal((generated.match(/(["'])use strict\1;/g) || []).length, 1);
  const strictValue = loadPluginCode(generated).strictValue;
  assert.equal(strictValue(), true);
});

test("extraction uses the registry bindings for the generated require", () => {
  const definitions = [{
    name: "binding-module",
    source: "fixture/bindings.js",
    bindings: { named: ["first", "second"] },
    dependencies: []
  }];
  const compiler = createArtifactCompiler(definitions, {
    readModule: () => "module.exports = { first: 1, second: 2 };"
  });
  const generated = compiler.compile([
    'var { first } = require("./fixture/bindings.js");',
    "module.exports = first;"
  ].join("\n"));

  const extracted = compiler.extract(generated);

  assert.match(
    extracted,
    /var \{\n  first,\n  second\n\} = require\("\.\/fixture\/bindings\.js"\);/
  );
  assert.doesNotMatch(extracted, /<tomindmap:module binding-module>/);
});

test("compiles a registered dependency that has no entry-point import", () => {
  const definitions = [
    {
      name: "shared-module",
      source: "fixture/shared.js",
      bindings: { named: ["sharedValue"] },
      dependencies: []
    },
    {
      name: "consumer-module",
      source: "fixture/consumer-with-shared.js",
      bindings: { named: ["readShared"] },
      dependencies: ["shared-module"]
    }
  ];
  const compiler = createArtifactCompiler(definitions, {
    readModule: (source) => source === "fixture/shared.js"
      ? "module.exports = { sharedValue: 7 };"
      : "module.exports = { readShared: () => sharedValue };"
  });
  const generated = compiler.compile([
    'var { readShared } = require("./fixture/consumer-with-shared.js");',
    "module.exports = { readShared };"
  ].join("\n"));

  const runtime = loadPluginCode(generated);
  assert.equal(runtime.readShared(), 7);
});

test("resolves dependency imports relative to the consuming source", () => {
  const definitions = [
    {
      name: "nested-shared",
      source: "fixture/support/shared.js",
      bindings: { named: ["nestedValue"] },
      dependencies: []
    },
    {
      name: "nested-consumer",
      source: "fixture/consumer.js",
      bindings: { named: ["readNested"] },
      dependencies: ["nested-shared"]
    }
  ];
  const compiler = createArtifactCompiler(definitions, {
    readModule: (source) => source.endsWith("shared.js")
      ? "module.exports = { nestedValue: 11 };"
      : 'const { nestedValue } = require("./support/shared.js");\nmodule.exports = { readNested: () => nestedValue };'
  });
  const generated = compiler.compile([
    'var { readNested } = require("./fixture/consumer.js");',
    "module.exports = { readNested };"
  ].join("\n"));

  const runtime = loadPluginCode(generated);
  assert.equal(runtime.readNested(), 11);
});

test("does not rewrite source regions that resemble old legacy shims", () => {
  const source = [
    "function canvasTopicPreorder(canvas) {",
    '  return "source-owned implementation";',
    "}",
    "function markdownLineRecords() {}",
    "module.exports = { canvasTopicPreorder, markdownLineRecords };"
  ].join("\n");
  const definitions = [{
    name: "legacy-shaped-module",
    source: "fixture/legacy-shaped.js",
    bindings: { named: ["canvasTopicPreorder", "markdownLineRecords"] },
    dependencies: []
  }];
  const compiler = createArtifactCompiler(definitions, {
    readModule: () => source
  });
  const generated = compiler.compile([
    'var { canvasTopicPreorder, markdownLineRecords } = require("./fixture/legacy-shaped.js");',
    "module.exports = { canvasTopicPreorder, markdownLineRecords };"
  ].join("\n"));

  assert.match(generated, /return "source-owned implementation";/);
  assert.doesNotMatch(generated, /return MarkdownOrder\.canvasTopicPreorder/);
});

test("maintained source imports only exports declared by the runtime registry", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "main.js"),
    "utf8"
  );
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const definition of modules) {
    const importPattern = new RegExp(
      `var\\s+(\\{[^}]*\\}|[A-Za-z_$][\\w$]*)\\s*=\\s*require\\(\\s*(['"])\\./${escapeRegExp(definition.source)}\\2\\s*\\);`,
      "m"
    );
    const match = source.match(importPattern);
    if (!match) continue;
    const imported = match[1].startsWith("{")
      ? match[1].slice(1, -1).split(",").map((name) => name.trim()).filter(Boolean)
      : [match[1].trim()];
    const bindings = Array.isArray(definition.bindings)
      ? definition.bindings
      : typeof definition.bindings === "string"
        ? [definition.bindings]
        : definition.bindings.default
          ? [definition.bindings.default, ...(definition.bindings.named || [])]
          : definition.bindings.named || [];
    for (const name of imported) {
      assert.ok(bindings.includes(name), `${definition.name} does not bind ${name}`);
    }
  }
});

test("compiles every current registry module for the restricted loader", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "main.js"),
    "utf8"
  );
  const generated = artifactCompiler.compile(source);

  assert.doesNotMatch(generated, /require\(["']\.\//);
  assert.equal(typeof loadPluginCode(generated).default, "function");
});
