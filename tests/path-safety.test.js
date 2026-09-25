"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_FILENAME_BYTES,
  allocateFilePath,
  portableFilenameStem
} = require("../lib/path-safety.js");

test("allocates collision-free paths within the complete UTF-8 filename budget", () => {
  const existing = new Set();
  const pathExists = (candidate) => existing.has(candidate.toLowerCase());
  const title = `${"漢🙂".repeat(100)}...  `;
  const first = allocateFilePath("Notes", title, "canvas", pathExists);
  const firstName = first.slice("Notes/".length);
  assert.ok(Buffer.byteLength(firstName, "utf8") <= MAX_FILENAME_BYTES);
  assert.equal(firstName.includes("\ufffd"), false);

  existing.add(first.toLowerCase());
  const second = allocateFilePath("Notes", title, "canvas", pathExists);
  const secondName = second.slice("Notes/".length);
  assert.notEqual(second, first);
  assert.match(secondName, / 1\.canvas$/);
  assert.ok(Buffer.byteLength(secondName, "utf8") <= MAX_FILENAME_BYTES);
});

test("keeps impossible filename budgets within the requested byte limit", () => {
  for (let budget = 1; budget <= 7; budget++) {
    const stem = portableFilenameStem("界", budget);
    assert.ok(Buffer.byteLength(stem, "utf8") <= budget, `budget ${budget}`);
  }
});

test("rejects non-canonical vault folders before composing a path", () => {
  for (const folder of ["../secret", "Notes/../secret", "/absolute", "Notes/\u0000bad"]) {
    assert.throws(() => allocateFilePath(folder, "Map", "md"), /folder|vault|canonical/i);
  }
});

test("creates portable stems at grapheme and code-point boundaries", () => {
  const cases = [
    ["CON", "_CON"],
    ["com1.txt", "_com1.txt"],
    ["Nul", "_Nul"],
    ["LPT9", "_LPT9"],
    ["COM¹", "_COM¹"],
    ["CON .txt", "_CON .txt"],
    ["Report...  ", "Report"],
    ["🙂".repeat(100), "🙂".repeat(63)],
    ["👨‍👩‍👧‍👦".repeat(20), "👨‍👩‍👧‍👦".repeat(10)],
    ["e\u0301".repeat(100), "e\u0301".repeat(85)],
    ["漢".repeat(100), "漢".repeat(85)]
  ];

  for (const [title, expected] of cases) {
    const stem = portableFilenameStem(title, MAX_FILENAME_BYTES);
    assert.equal(stem, expected);
    assert.equal(Buffer.from(stem, "utf8").toString("utf8"), stem);
  }
});
