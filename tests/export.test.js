"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  colorDistance,
  createApprovedPublicHttpsAssetResolver,
  embedDocumentAssets,
  paginatedPdfDocument,
  parseCssColor,
  renderHtmlAsVectorPdf,
  safeBaseName,
  vectorPdfPageSize,
  visibleCardPaint
} = require("../lib/export.js");

function streamedBytes(bytes) {
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: new Uint8Array(bytes) };
        }
      })
    }
  };
}

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

test("makes dark-theme card boxes visible when sampled paint matches the canvas", () => {
  assert.deepEqual(
    visibleCardPaint("rgb(41, 41, 41)", "rgb(0, 0, 0)", "rgb(41, 41, 41)", "#f97316"),
    { fill: "rgb(62, 62, 62)", stroke: "rgb(249, 115, 22)" }
  );
});

test("fits a tall map onto one aspect-matched vector PDF page", () => {
  const html = "<html><head><title>Tall</title></head><body></body></html>";
  const svgInfo = { width: 3000, height: 4000, svg: '<svg viewBox="-100 -200 3000 4000"><defs><marker id="arrow-red"/></defs><rect x="-100" y="-200" width="3000" height="4000" fill="#fff"/><path marker-end="url(#arrow-red)"/></svg>' };
  const document = paginatedPdfDocument(html, svgInfo, "fit-width");
  assert.equal(document.columns, 1);
  assert.equal(document.rows, 1);
  assert.equal(document.pages, 1);
  assert.deepEqual(document.pageSize, vectorPdfPageSize(svgInfo));
  assert.equal(document.html, html);
});

test("legacy actual-size requests still fit on one page", () => {
  const svgInfo = { width: 3000, height: 4000, svg: '<svg viewBox="0 0 3000 4000"><defs></defs><rect width="3000" height="4000" fill="#fff"/></svg>' };
  const document = paginatedPdfDocument("<html></html>", svgInfo, 100);
  assert.equal(document.columns, 1);
  assert.equal(document.rows, 1);
  assert.equal(document.pages, 1);
  assert.deepEqual(document.pageSize, vectorPdfPageSize(svgInfo));
});

test("legacy percent scale strings still fit on one page", () => {
  const svgInfo = { width: 3000, height: 4000, svg: '<svg viewBox="0 0 3000 4000"></svg>' };
  const document = paginatedPdfDocument("<html></html>", svgInfo, "100");
  assert.equal(document.pages, 1);
  assert.deepEqual(document.pageSize, vectorPdfPageSize(svgInfo));
});

test("keeps small maps on a single aspect-matched page", () => {
  const html = "<html><head><title>Small</title></head><body></body></html>";
  const svgInfo = { width: 1600, height: 800, svg: '<svg viewBox="0 0 1600 800"></svg>' };
  const document = paginatedPdfDocument(html, svgInfo, "fit-width");
  assert.equal(document.pages, 1);
  assert.equal(document.html, html);
  assert.deepEqual(document.pageSize, { width: 304800, height: 152400 });
});

test("fit mode always lands on one aspect-matched page", () => {
  const svgInfo = { width: 3000, height: 8000, svg: '<svg viewBox="0 0 3000 8000"></svg>' };
  const document = paginatedPdfDocument("<html></html>", svgInfo, "fit");
  assert.equal(document.pages, 1);
  assert.deepEqual(document.pageSize, vectorPdfPageSize(svgInfo));
});

test("keeps extreme maps on one page", () => {
  const svgInfo = { width: 40000, height: 40000, svg: '<svg viewBox="0 0 40000 40000"></svg>' };
  const document = paginatedPdfDocument("<html></html>", svgInfo, 100);
  assert.equal(document.pages, 1);
});

test("renders through the in-process SVG converter without Electron BrowserWindow", async () => {
  const calls = [];
  const pdf = await renderHtmlAsVectorPdf(
    "<html><svg></svg></html>",
    { width: 3000, height: 4000, svg: '<svg viewBox="0 0 3000 4000"></svg>' },
    null,
    {
      svgToPdf: async (svgInfo, pageSize) => {
        calls.push({ svgInfo, pageSize });
        return Uint8Array.from([37, 80, 68, 70]);
      }
    }
  );
  assert.deepEqual([...pdf], [37, 80, 68, 70]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].pageSize, vectorPdfPageSize({ width: 3000, height: 4000 }));
});

test("ships the vector PDF renderer inside the single-file Obsidian bundle", () => {
  const bundle = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.doesNotMatch(bundle, /require\(["']\.\/lib\/vector-pdf-bundle\.js["']\)/);
  assert.match(bundle, /function renderSvgToPdf\(/);
});

test("PDF export uses the same canonical SVG as SVG export", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  const start = source.indexOf("async exportMindMapPdf");
  const pdfMethod = source.slice(start, source.indexOf("\n\texportAssetResolvers() {", start));
  assert.match(pdfMethod, /pdfSvgFromDocument\(embedded, false\)/);
  assert.doesNotMatch(pdfMethod, /pdfSvgFromDocument\(embedded, true\)/);
});

test("inlines vault images and styles so exports match the canvas", async () => {
  const html =
    '<img src="/notes/Cat.png"><img src="app://local/notes%20x/Dog.webp">' +
    '<div style="background:url(\'file:///tmp/bg.jpg\')"></div>' +
    '<img src="https://example.com/logo.svg"><img src="data:image/png;base64,AAAA">';
  const embedded = await embedDocumentAssets(html, {
    readVaultFile: async (path) => {
      if (path === "notes/Cat.png")
        return new Uint8Array([1, 2, 3]);
      if (path === "notes x/Dog.webp")
        return new Uint8Array([4, 5]);
      return null;
    },
    readExternalFile: async () => new Uint8Array([6, 7, 8]),
    resolveRemoteAsset: createApprovedPublicHttpsAssetResolver({
      isApproved: () => true,
      fetch: async () => streamedBytes([9])
    })
  });
  assert.match(embedded, /src="data:image\/png;base64,AQID"/);
  assert.match(embedded, /src="data:image\/webp;base64,BAU="/);
  assert.match(embedded, /background:url\('data:image\/jpeg;base64,BgcI'\)/);
  assert.doesNotMatch(embedded, /data:image\/svg\+xml/);
  assert.match(embedded, /src="data:image\/png;base64,AAAA"/);
});

test("skips oversized and unresolvable assets without failing", async () => {
  const html = '<img src="/big.bin"><img src="/notes/Missing.png"><img src="https://example.com/x.png">';
  const embedded = await embedDocumentAssets(html, {
    maxBytes: 4,
    readVaultFile: async () => new Uint8Array(64),
    fetchUrl: async () => null
  });
  assert.equal(embedded, html);
});

test("parses hex and rgb CSS colors reliably and rejects unresolved variables", () => {
  assert.deepEqual(parseCssColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseCssColor("#1e293b"), [30, 41, 59]);
  assert.deepEqual(parseCssColor("rgb(38, 38, 38)"), [38, 38, 38]);
  assert.deepEqual(parseCssColor("rgba(36, 36, 36, 1)"), [36, 36, 36]);
  assert.equal(parseCssColor("var(--text-normal, #1e293b)"), null);
  assert.equal(parseCssColor(""), null);
});

test("calculates color distance correctly for contrast checking", () => {
  assert.equal(colorDistance([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(Math.round(colorDistance([0, 0, 0], [255, 255, 255])), 442);
  assert.ok(colorDistance([38, 38, 38], [248, 250, 252]) > 200);
});

test("exports SVG with clean vector text and reveals fallback vector text", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  assert.match(source, /if \(request\.format === 'svg'\) \{\s*const svg = pdfSvgFromDocument\(embedded, true\);/);
});

test("expands selection in exports to include entire topic branches", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  // canvasPrintDocument expands selectedIds via buildForest descendants and directed edges:
  assert.match(source, /const forest = buildForest\(canvas, \{ includeHidden: true \}\);/);
  assert.match(source, /for \(const desc of getDescendants\(treeNode\)\)/);
  assert.match(source, /for \(const edge of data\.edges \|\| \[\]\)/);
  // prepareCanvasForExport expands exportSelection via buildForest and directed edges:
  assert.match(source, /for \(const edge of exportData\.edges \|\| \[\]\)/);
});

test("ensures text contrast against card fill in exported documents", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  assert.match(source, /if \(!textRgb \|\| colorDistance\(textRgb, fillRgb\) < 110\)/);
  assert.match(source, /effectiveTextColor = fillLum < 145 \? '#f8fafc' : '#0f172a'/);
});

test("supports exporting mind map as FreeMind (.mm)", () => {
  const exportSource = fs.readFileSync(path.join(__dirname, "..", "lib", "export.js"), "utf8");
  assert.match(exportSource, /\['freemind', 'FreeMind mind map \(\.mm\)'\]/);

  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  assert.match(mainSource, /if \(request\.format === 'freemind'\)/);
  assert.match(mainSource, /const xml = exportToFreeMind\(forest, \{ title: base \}\);/);
});


