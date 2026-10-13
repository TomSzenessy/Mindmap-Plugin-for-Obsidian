"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LINK_PREVIEW_KEY,
  asLinkTopicData,
  linkCardSize,
  linkPreviewData,
  linkTopicText,
  normalizeTypedUrl,
  parseLinkPreview,
  safeHttpUrl,
  standaloneLink
} = require("../lib/link-preview.js");

test("recognizes a topic that is exactly one web link", () => {
  assert.deepEqual(standaloneLink("https://example.com/a"), {
    url: "https://example.com/a",
    label: ""
  });
  assert.deepEqual(standaloneLink("  <https://example.com>  "), {
    url: "https://example.com/",
    label: ""
  });
  assert.deepEqual(standaloneLink("[Docs \\[v2\\]](<https://example.com/docs>)"), {
    url: "https://example.com/docs",
    label: "Docs [v2]"
  });
  assert.deepEqual(standaloneLink("[x](https://en.wikipedia.org/wiki/Set_(mathematics))"), {
    url: "https://en.wikipedia.org/wiki/Set_(mathematics)",
    label: "x"
  });
});

test("leaves mixed text and unsafe schemes as normal topics", () => {
  assert.equal(standaloneLink("see https://example.com for details"), null);
  assert.equal(standaloneLink("https://example.com\nsecond line"), null);
  assert.equal(standaloneLink("javascript:alert(1)"), null);
  assert.equal(standaloneLink("[x](javascript:alert(1))"), null);
  assert.equal(standaloneLink("file:///etc/passwd"), null);
  assert.equal(standaloneLink("https://user:secret@example.com"), null);
});

test("upgrades a typed bare domain to https and rejects non-addresses", () => {
  assert.equal(normalizeTypedUrl("example.com/page"), "https://example.com/page");
  assert.equal(normalizeTypedUrl("http://example.com"), "http://example.com/");
  assert.equal(normalizeTypedUrl("just words"), "");
  assert.equal(normalizeTypedUrl("data:text/html,hi"), "");
  assert.equal(safeHttpUrl("https://exa mple.com"), "");
});

test("writes topic Markdown that round-trips through link detection", () => {
  const text = linkTopicText("A [tricky] title", "https://example.com/x_(y)");
  assert.deepEqual(standaloneLink(text), {
    url: "https://example.com/x_(y)",
    label: "A [tricky] title"
  });
  assert.equal(linkTopicText("", "https://www.example.com"), "[example.com](<https://www.example.com/>)");
});

test("extracts Open Graph metadata without trusting page markup", () => {
  const html = `<!doctype html><html><head>
    <title>Fallback &amp; title</title>
    <meta property="og:title" content="Real &quot;Title&quot;">
    <meta name="description" content="  A   short
      description ">
    <meta property="og:image" content="/img/cover.png">
    <meta property="og:site_name" content='Example Site'>
    <script>document.write('<meta property="og:title" content="evil">')</script>
  </head><body></body></html>`;
  assert.deepEqual(parseLinkPreview(html, "https://example.com/post"), {
    title: "Real \"Title\"",
    description: "A short description",
    image: "https://example.com/img/cover.png",
    site: "Example Site"
  });
});

test("drops preview images that are not plain web addresses", () => {
  const html = '<meta property="og:image" content="javascript:alert(1)"><title>T</title>';
  const preview = parseLinkPreview(html, "https://example.com");
  assert.equal(preview.image, "");
  assert.equal(preview.title, "T");
  assert.equal(preview.site, "example.com");
});

test("reads only validated preview records and sizes the card", () => {
  const node = {
    getData: () => ({
      [LINK_PREVIEW_KEY]: {
        url: "https://example.com",
        title: "",
        image: "javascript:bad()"
      }
    })
  };
  const preview = linkPreviewData(node);
  assert.equal(preview.title, "example.com");
  assert.equal(preview.image, "");
  assert.deepEqual(linkCardSize(preview), { width: 340, height: 64 });
  assert.deepEqual(linkCardSize({ image: "https://example.com/a.png" }), { width: 340, height: 96 });
  assert.equal(
    linkPreviewData({ unknownData: { [LINK_PREVIEW_KEY]: { url: "file:///x" } } }),
    null
  );
});

test("new topic data whose text is one link is created as a finished link card", () => {
  const card = asLinkTopicData({
    id: "n",
    type: "text",
    text: "https://www.moodle.tum.de/course/view.php?id=124123",
    x: 4,
    y: 8,
    width: 300,
    height: 60
  });
  assert.equal(card.text, "[moodle.tum.de](<https://www.moodle.tum.de/course/view.php?id=124123>)");
  assert.equal(card[LINK_PREVIEW_KEY].url, "https://www.moodle.tum.de/course/view.php?id=124123");
  assert.equal(card[LINK_PREVIEW_KEY].fetched, false);
  assert.deepEqual([card.x, card.y, card.width, card.height], [4, 8, 340, 64]);

  const plain = { type: "text", text: "Just words" };
  assert.equal(asLinkTopicData(plain), plain);
  const file = { type: "file", file: "a.md", text: "https://example.com" };
  assert.equal(asLinkTopicData(file), file);
  const kept = { type: "text", text: "https://example.com", tomindmapLinkPlain: true };
  assert.equal(asLinkTopicData(kept), kept);
});

test("placeholder titles from script-driven pages are ignored", () => {
  for (const title of ["Loading...", "Loading\u2026", "Just a moment...", "Redirecting"]) {
    assert.equal(parseLinkPreview(`<title>${title}</title>`, "https://campus.tum.de").title, "", title);
  }
  assert.equal(parseLinkPreview("<title>Loading data in R</title>", "https://example.com").title, "Loading data in R");
});
