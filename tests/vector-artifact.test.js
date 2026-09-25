"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  checkVectorBundle,
  resolveBrowserExecutable
} = require("../scripts/verify-vector-pdf.js");

const vectorBundlePath = path.join(__dirname, "..", "lib", "vector-pdf-bundle.js");

test("checks vector freshness without rewriting the generated bundle", async () => {
  const before = fs.readFileSync(vectorBundlePath);
  const result = await checkVectorBundle();

  assert.equal(result.fresh, true);
  assert.deepEqual(fs.readFileSync(vectorBundlePath), before);
});

test("uses an explicit browser path before the portable Chrome channel", () => {
  assert.equal(
    resolveBrowserExecutable({
      env: { PUPPETEER_EXECUTABLE_PATH: "/opt/custom/chrome" },
      platform: "linux",
      exists: () => false
    }),
    "/opt/custom/chrome"
  );
  assert.equal(
    resolveBrowserExecutable({ env: {} }),
    null
  );
});
