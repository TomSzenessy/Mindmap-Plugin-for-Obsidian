"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ATTACHMENT_DISTANCE,
  classifyDropZone,
  closestCornerToNode,
  closestPointOnNode,
  findClosestNodeOnRay,
  findFirstNodeOnCornerRay,
  findNearestAttachableNode,
  findNearestNodeOnBranch,
  getConnectionSides,
  isDescendant,
  isWithinAttachmentRadius,
  nodeToNodeDistance,
  reparentSubtree
} = require("../lib/tree-drag.js");

test("classifies drop zone correctly", () => {
  const target = { x: 100, y: 100, width: 200, height: 100 };

  assert.equal(classifyDropZone(target, { x: 200, y: 150 }), "child");
  assert.equal(classifyDropZone(target, { x: 200, y: 105 }), "sibling-above");
  assert.equal(classifyDropZone(target, { x: 200, y: 195 }), "sibling-below");
  assert.equal(classifyDropZone(target, { x: 110, y: 150 }), "sibling-left");
  assert.equal(classifyDropZone(target, { x: 290, y: 150 }), "sibling-right");
});

test("detects descendants to prevent loops", () => {
  const forest = [
    {
      canvasNode: { id: "root" },
      children: [
        {
          canvasNode: { id: "child1" },
          children: [{ canvasNode: { id: "grandchild1" }, children: [] }]
        }
      ]
    }
  ];

  assert.equal(isDescendant(forest, "root", "grandchild1"), true);
  assert.equal(isDescendant(forest, "child1", "root"), false);
});

test("reparents node as child correctly", () => {
  const dragged = { id: "dragged", x: 300, y: 100, width: 100, height: 50 };
  const target = { id: "target", x: 100, y: 100, width: 100, height: 50 };

  const canvas = {};
  const removedEdges = [];
  const createdEdges = [];

  const canvasApi = {
    getIncomingEdges: () => [{ id: "edge1" }],
    removeEdge: (c, edge) => removedEdges.push(edge),
    createEdge: (c, from, to, dir1, dir2, color) => {
      const edge = { from, to };
      createdEdges.push(edge);
      return edge;
    }
  };

  const success = reparentSubtree(canvas, canvasApi, dragged, target, "child", []);
  assert.equal(success, true);
  assert.equal(removedEdges.length, 1);
  assert.equal(createdEdges.length, 1);
  assert.equal(createdEdges[0].from.id, "target");
  assert.equal(createdEdges[0].to.id, "dragged");
});

test("evaluates attachment radius and raycast target selection", () => {
  const root = { id: "root", x: 0, y: 0, width: 200, height: 100 };
  const child1 = { id: "child1", x: 300, y: -100, width: 100, height: 50 };
  const child2 = { id: "child2", x: 300, y: 100, width: 100, height: 50 };

  const insideNode = { id: "dragged", x: 500, y: 120, width: 100, height: 50 };
  const farNode = { id: "dragged", x: 1200, y: 1200, width: 100, height: 50 };

  assert.equal(isWithinAttachmentRadius(insideNode, root, 750), true);
  assert.equal(isWithinAttachmentRadius(farNode, root, 750), false);

  const closest = findClosestNodeOnRay(insideNode, [root, child1, child2], root);
  assert.equal(closest.id, "child2");
});

test("uses a fixed rectangle-to-rectangle distance for local attachment", () => {
  const dragged = { id: "dragged", x: 0, y: 0, width: 100, height: 60 };
  const near = { id: "near", x: 100 + ATTACHMENT_DISTANCE, y: 0, width: 100, height: 60 };
  const far = { id: "far", x: 101 + ATTACHMENT_DISTANCE, y: 0, width: 100, height: 60 };

  assert.equal(nodeToNodeDistance(dragged, near), ATTACHMENT_DISTANCE);
  assert.equal(findNearestAttachableNode(dragged, [near, far])?.id, "near");
  assert.equal(findNearestAttachableNode(dragged, [far]), null);
});

test("prospective connections follow the dragged card side of the map root", () => {
  const root = { id: "root", x: 500, y: 0, width: 200, height: 80 };
  const leftParent = { id: "left", x: 200, y: 0, width: 160, height: 60 };
  const rightParent = { id: "right", x: 840, y: 0, width: 160, height: 60 };
  const draggedRight = { id: "dragged-right", x: 760, y: 200, width: 160, height: 60 };
  const draggedLeft = { id: "dragged-left", x: 260, y: 200, width: 160, height: 60 };

  assert.deepEqual(getConnectionSides(draggedRight, root, leftParent), {
    branchSide: "right",
    fromSide: "right",
    toSide: "left"
  });
  assert.deepEqual(getConnectionSides(draggedLeft, root, rightParent), {
    branchSide: "left",
    fromSide: "left",
    toSide: "right"
  });
  assert.equal(getConnectionSides(draggedRight, root, root).branchSide, "right");
});

test("casts from the closest dragged-card corner to the root edge", () => {
  const root = { id: "root", x: 500, y: 100, width: 200, height: 100 };
  const dragged = { id: "dragged", x: 200, y: 500, width: 120, height: 80 };

  assert.deepEqual(closestCornerToNode(dragged, root), { x: 320, y: 500 });
  assert.deepEqual(
    closestPointOnNode({ x: 320, y: 500 }, root),
    { x: 500, y: 200 }
  );
});

test("selects the first card intersected by the corner-to-root segment", () => {
  const root = { id: "root", x: 500, y: 100, width: 200, height: 100 };
  const dragged = { id: "dragged", x: 200, y: 500, width: 120, height: 80 };
  const offRayButNear = { id: "near", x: 330, y: 500, width: 100, height: 60 };
  const onRay = { id: "on-ray", x: 370, y: 350, width: 120, height: 100 };

  assert.equal(
    findFirstNodeOnCornerRay(dragged, [root, offRayButNear], root)?.id,
    "root"
  );
  assert.equal(
    findFirstNodeOnCornerRay(dragged, [root, offRayButNear, onRay], root)?.id,
    "on-ray"
  );
});

test("targets the nearest strictly inward card on the same branch only", () => {
  const root = { id: "root", x: 500, y: 100, width: 200, height: 100 };
  const draggedLeft = { id: "drag-left", x: 100, y: 300, width: 100, height: 60 };
  const leftNear = { id: "left-near", x: 240, y: 310, width: 120, height: 60 };
  const leftFar = { id: "left-far", x: 400, y: 300, width: 80, height: 60 };
  const overlaps = { id: "overlaps", x: 190, y: 300, width: 120, height: 60 };
  const outward = { id: "outward", x: -80, y: 300, width: 120, height: 60 };
  const opposite = { id: "opposite", x: 760, y: 300, width: 120, height: 60 };
  assert.equal(
    findNearestNodeOnBranch(
      draggedLeft,
      [root, leftFar, overlaps, outward, opposite, leftNear],
      root
    )?.id,
    "left-near"
  );

  assert.equal(
    findNearestNodeOnBranch(
      draggedLeft,
      [root, overlaps, outward, opposite],
      root
    )?.id,
    "root",
    "the central root remains eligible on the branch axis"
  );

  const draggedRight = { id: "drag-right", x: 1100, y: 300, width: 100, height: 60 };
  const rightNear = { id: "right-near", x: 940, y: 310, width: 120, height: 60 };
  const rightFar = { id: "right-far", x: 720, y: 300, width: 120, height: 60 };
  const rightOverlap = { id: "right-overlap", x: 1040, y: 300, width: 120, height: 60 };
  assert.equal(
    findNearestNodeOnBranch(
      draggedRight,
      [root, leftNear, rightFar, rightOverlap, rightNear],
      root
    )?.id,
    "right-near"
  );
});
