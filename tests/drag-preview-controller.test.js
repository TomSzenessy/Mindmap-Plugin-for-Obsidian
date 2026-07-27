"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDragAttachmentController
} = require("../lib/drag-preview-controller.js");

function dragFixture({ withOriginalParent = true } = {}) {
  const oldParent = { id: "old", x: 0, y: 0, width: 100, height: 60 };
  const newParent = { id: "new", x: 500, y: 0, width: 100, height: 60 };
  const otherParent = { id: "other", x: 900, y: 0, width: 100, height: 60 };
  const dragged = { id: "dragged", x: 150, y: 0, width: 100, height: 60 };
  const nodes = [oldParent, newParent, otherParent, dragged];
  const canvas = {
    nodes: new Map(nodes.map((node) => [node.id, node])),
    requestFrame() {}
  };
  const activeEdges = [];
  let edgeCounter = 0;
  const canvasApi = {
    createEdge(_canvas, from, to, fromSide = "right", toSide = "left", color) {
      const edge = {
        id: `edge-${++edgeCounter}`,
        from: { node: from, side: fromSide },
        to: { node: to, side: toSide },
        color
      };
      activeEdges.push(edge);
      return edge;
    },
    getIncomingEdges(_canvas, node) {
      return activeEdges.filter((edge) => edge.to.node.id === node.id);
    },
    removeEdge(_canvas, edge) {
      const index = activeEdges.indexOf(edge);
      if (index >= 0) activeEdges.splice(index, 1);
    }
  };
  if (withOriginalParent)
    canvasApi.createEdge(canvas, oldParent, dragged);
  const controller = createDragAttachmentController(
    canvas,
    canvasApi,
    () => [],
    (node) => node
  );
  return {
    activeEdges,
    canvas,
    canvasApi,
    controller,
    dragged,
    newParent,
    oldParent,
    otherParent
  };
}

test("keeps the original arrow for a small drag near its current parent", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x += 12;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "original");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");

  fixture.controller.cancel();
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "old");
});

test("switches immediately when a different node is the closest candidate", () => {
  const fixture = dragFixture();
  fixture.newParent.x = 260;
  fixture.controller.begin(fixture.dragged);

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "new");
});

test("switches the visible arrow between prospective parents and commits only one", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);

  fixture.dragged.x = 390;
  let preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "new");
  assert.equal(fixture.activeEdges[0].__mindMapPreview, true);

  fixture.dragged.x = 790;
  preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.target.id, "other");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "other");

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(result.state, "attached");
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "other");
  assert.equal(fixture.activeEdges[0].__mindMapPreview, undefined);
});

test("detaches beyond the fixed nearest-node distance", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 1400;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "detached");
  assert.equal(fixture.activeEdges.length, 0);

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(result.state, "detached");
  assert.equal(fixture.activeEdges.length, 0);
});

test("previews and attaches a standalone node moved inside the fixed distance", () => {
  const fixture = dragFixture({ withOriginalParent: false });
  fixture.dragged.x = 390;
  fixture.controller.begin(fixture.dragged);

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "preview");
  assert.equal(preview.target.id, "new");
  assert.equal(fixture.activeEdges.length, 1);

  const result = fixture.controller.commit(fixture.dragged);
  assert.equal(result.changed, true);
  assert.equal(fixture.activeEdges.length, 1);
  assert.equal(fixture.activeEdges[0].from.node.id, "new");
});

test("restores the original arrow if preview edge creation fails", () => {
  const fixture = dragFixture();
  fixture.controller.begin(fixture.dragged);
  fixture.dragged.x = 390;
  fixture.canvasApi.createEdge = () => undefined;

  const preview = fixture.controller.updatePreview(fixture.dragged);
  assert.equal(preview.state, "original");
  // Restoration also uses createEdge, so the controller remains safely
  // detached instead of claiming that a non-existent preview can be committed.
  assert.equal(fixture.activeEdges.length, 0);
  assert.equal(fixture.controller.commit(fixture.dragged).changed, false);
});
