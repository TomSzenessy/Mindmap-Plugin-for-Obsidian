"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { safeBaseName } = require("../lib/export.js");

test("creates portable, non-empty export filenames", () => {
  assert.equal(safeBaseName('  Roadmap: Q3/Q4?  '), "Roadmap- Q3-Q4-");
  assert.equal(safeBaseName('  <>:"/\\|?*  '), "---------");
  assert.equal(safeBaseName("   "), "Mind map");
});
