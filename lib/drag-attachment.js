const {
  createDragAttachmentController
} = require("./drag-preview-controller.js");

const dragAttachment = createDragAttachmentController(
  canvas,
  canvasApi,
  () => buildForest(canvas),
  () => getMainRootNode()
);

function onNodeDragMove(draggedNode) {
  dragAttachment.updatePreview(draggedNode);
}

function onNodeDragEnd(draggedNode) {
  dragAttachment.commit(draggedNode);
}

function onNodeDragCancel() {
  dragAttachment.cancel();
}