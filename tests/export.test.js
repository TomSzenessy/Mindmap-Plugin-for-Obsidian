"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  renderHtmlAsVectorPdf,
  safeBaseName,
  vectorPdfPageSize
} = require("../lib/export.js");

test("creates portable, non-empty export filenames", () => {
  assert.equal(safeBaseName('  Roadmap: Q3/Q4?  '), "Roadmap- Q3-Q4-");
  assert.equal(safeBaseName('  <>:"/\\|?*  '), "---------");
  assert.equal(safeBaseName("   "), "Mind map");
});

test("sizes vector PDF pages to the SVG aspect ratio", () => {
  assert.deepEqual(vectorPdfPageSize({ width: 1600, height: 800 }), {
    width: 304800,
    height: 152400
  });
  assert.deepEqual(vectorPdfPageSize({ width: 400, height: 800 }), {
    width: 152400,
    height: 304800
  });
});

test("prints inline SVG through Chromium and always destroys the hidden window", async () => {
  const calls = [];
  class FakeBrowserWindow {
    constructor(options) {
      calls.push(["construct", options]);
      this.destroyed = false;
      this.webContents = {
        printToPDF: async (options) => {
          calls.push(["print", options]);
          return Uint8Array.from([37, 80, 68, 70]);
        }
      };
    }
    async loadURL(url) {
      calls.push(["load", url]);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      calls.push(["destroy"]);
    }
  }

  const pdf = await renderHtmlAsVectorPdf(
    "<html><svg></svg></html>",
    { width: 1600, height: 800 },
    { BrowserWindow: FakeBrowserWindow }
  );
  assert.deepEqual([...pdf], [37, 80, 68, 70]);
  assert.match(calls[1][1], /^data:text\/html/);
  assert.equal(calls[2][1].printBackground, true);
  assert.deepEqual(calls[2][1].pageSize, {
    width: 304800,
    height: 152400
  });
  assert.deepEqual(calls.at(-1), ["destroy"]);
});
