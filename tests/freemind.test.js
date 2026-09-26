"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return { ItemView: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { decodeFreeMind, exportToFreeMind, freemindToCanvas } = require("../lib/freemind.js");
Module._load = originalLoad;

class FakeElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.children = [];
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakeDocument {
  constructor(root, parserError = null) {
    this.root = root;
    this.parserError = parserError;
  }

  querySelector(selector) {
    if (selector === "parsererror") return this.parserError;
    if (selector !== "map") return null;
    const stack = [this.root];
    while (stack.length > 0) {
      const element = stack.pop();
      if (element.tagName === "map") return element;
      for (let index = element.children.length - 1; index >= 0; index--) {
        stack.push(element.children[index]);
      }
    }
    return null;
  }
}

class FakeDOMParser {
  parseFromString(xml) {
    if (xml.includes("<broken")) return new FakeDocument(null, new FakeElement("parsererror"));
    const document = new FakeElement("document");
    const stack = [document];
    const tokens = xml.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
    for (const token of tokens) {
      if (!token.startsWith("<") || token.startsWith("<!--") || token.startsWith("<?")) {
        continue;
      }
      if (token.startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const nameMatch = token.match(/^<\s*([\w:-]+)/);
      if (!nameMatch) continue;
      const element = new FakeElement(nameMatch[1].toLowerCase());
      const attributes = token.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g);
      for (const match of attributes) element.attributes[match[1]] = match[3];
      stack[stack.length - 1].appendChild(element);
      if (!token.endsWith("/>")) stack.push(element);
    }
    return new FakeDocument(document);
  }
}

test("enforces the FreeMind byte budget before invoking the XML parser", () => {
  let parserCalled = false;
  class FailIfParsedDOMParser {
    parseFromString() {
      parserCalled = true;
      throw new Error("parser should not run");
    }
  }

  const decoded = decodeFreeMind("<map/>", {
    DOMParser: FailIfParsedDOMParser,
    maxFileBytes: 1
  });

  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, "file-byte-budget");
  assert.equal(parserCalled, false);
});

test("returns typed node and depth budget failures for oversized maps", () => {
  const tree = "<map><node><node><node></node></node><node></node></node></map>";

  const nodeFailure = decodeFreeMind(tree, {
    DOMParser: FakeDOMParser,
    maxNodes: 2,
    maxDepth: 10
  });
  const depthFailure = decodeFreeMind(tree, {
    DOMParser: FakeDOMParser,
    maxNodes: 10,
    maxDepth: 2
  });

  assert.equal(nodeFailure.ok, false);
  assert.equal(nodeFailure.reason, "node-budget");
  assert.equal(nodeFailure.nodes, 3);
  assert.equal(nodeFailure.maxNodes, 2);
  assert.equal(depthFailure.ok, false);
  assert.equal(depthFailure.reason, "depth-budget");
  assert.equal(depthFailure.depth, 3);
  assert.equal(depthFailure.maxDepth, 2);
});

test("accepts a harmless XML doctype without enabling entity resolution", () => {
  const decoded = decodeFreeMind("<!DOCTYPE map><map><node TEXT='safe'></node></map>", {
    DOMParser: FakeDOMParser
  });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.nodeCount, 1);
});

test("rejects external XML entity declarations without a resolver", () => {
  const decoded = decodeFreeMind(
    "<!DOCTYPE map [<!ENTITY secret SYSTEM 'file:///secret'>]><map/>",
    { DOMParser: FakeDOMParser }
  );

  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, "external-entity");
});

test("turns malformed element data into a typed decoder failure", () => {
  class MalformedDOMParser {
    parseFromString() {
      return {
        querySelector(selector) {
          return selector === "map" ? { children: [{ tagName: "node" }] } : null;
        }
      };
    }
  }

  const decoded = decodeFreeMind("<map><node></node></map>", {
    DOMParser: MalformedDOMParser
  });

  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, "malformed");
});

test("rejects invalid FreeMind layout bounds as a typed failure", () => {
  for (const options of [
    { nodeWidth: 0 },
    { nodeWidth: Number.NaN },
    { horizontalGap: -1 },
    { maxNodeHeight: Number.POSITIVE_INFINITY }
  ]) {
    const decoded = decodeFreeMind("<map><node TEXT='root'/></map>", {
      DOMParser: FakeDOMParser,
      ...options
    });
    assert.equal(decoded.ok, false);
    assert.equal(decoded.reason, "layout");
  }
});

test("honors nested FreeMind POSITION values during layout", () => {
  const xml = [
    "<map>",
    "<node TEXT='root'>",
    "<node TEXT='right' POSITION='right'>",
    "<node TEXT='opposite' POSITION='left'></node>",
    "</node>",
    "</node>",
    "</map>"
  ].join("");
  const decoded = decodeFreeMind(xml, { DOMParser: FakeDOMParser });
  assert.equal(decoded.ok, true);
  const nodes = new Map(decoded.value.nodes.map((node) => [node.text, node]));
  assert.ok(nodes.get("opposite").x < nodes.get("right").x);
  assert.ok(nodes.get("opposite").x <= nodes.get("root").x);
});

test("decodes twelve-thousand-topic chains without recursive overflow", () => {
  const size = 12000;
  const parts = ["<map>"];
  for (let index = 0; index < size; index++) {
    parts.push(`<node TEXT='topic-${index}'>`);
  }
  for (let index = 0; index < size; index++) parts.push("</node>");
  parts.push("</map>");
  const xml = parts.join("");

  const decoded = decodeFreeMind(xml, {
    DOMParser: FakeDOMParser,
    maxNodes: size,
    maxDepth: size,
    maxFileBytes: xml.length * 2
  });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.nodeCount, size);
  assert.equal(decoded.value.nodes.length, size);
  assert.equal(decoded.value.edges.length, size - 1);
});

test("lays out a twelve-thousand-topic wide map without recursive overflow", () => {
  const size = 12000;
  const children = Array.from(
    { length: size },
    (_, index) => `<node TEXT='branch-${index}'></node>`
  ).join("");
  const xml = `<map><node TEXT='root'>${children}</node></map>`;

  const decoded = decodeFreeMind(xml, {
    DOMParser: FakeDOMParser,
    maxNodes: size + 1,
    maxDepth: 2,
    maxFileBytes: xml.length * 2
  });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.nodes.length, size + 1);
  assert.equal(decoded.value.edges.length, size);
});

test("returns a typed malformed FreeMind result without throwing", () => {
  const malformed = "<map><broken";

  const decoded = decodeFreeMind(malformed, { DOMParser: FakeDOMParser });

  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, "malformed");
  assert.equal(freemindToCanvas(malformed, { DOMParser: FakeDOMParser }), null);
});

test("exportToFreeMind serializes tree forest with positions and escaping", () => {
  const forest = [
    {
      canvasNode: { id: "root_1", text: "# My Project & Mindmap", x: 0, y: 0, width: 200, height: 60 },
      children: [
        {
          canvasNode: { id: "node_r", text: "Right branch <special>", x: 300, y: -50, width: 150, height: 50 },
          direction: "right",
          children: [
            {
              canvasNode: { id: "node_r_child", text: "Child 1", x: 500, y: -50, width: 100, height: 40 },
              children: []
            }
          ]
        },
        {
          canvasNode: { id: "node_l", text: "Left branch \"quoted\"", x: -300, y: 50, width: 150, height: 50 },
          direction: "left",
          children: []
        }
      ]
    }
  ];

  const xml = exportToFreeMind(forest);
  assert.ok(xml.startsWith('<map version="1.0.1">'));
  assert.ok(xml.includes('TEXT="My Project &amp; Mindmap"'));
  assert.ok(xml.includes('ID="root_1"'));
  assert.ok(xml.includes('ID="node_r"'));
  assert.ok(xml.includes('POSITION="right"'));
  assert.ok(xml.includes('TEXT="Right branch &lt;special&gt;"'));
  assert.ok(xml.includes('ID="node_r_child"'));
  assert.ok(xml.includes('TEXT="Child 1"'));
  assert.ok(xml.includes('ID="node_l"'));
  assert.ok(xml.includes('POSITION="left"'));
  assert.ok(xml.includes('TEXT="Left branch &quot;quoted&quot;"'));
  assert.ok(xml.endsWith('</map>'));
});

