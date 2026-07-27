"use strict";

function createExportMindMapModal(Modal) {
return class ExportMindMapModal extends Modal {
  constructor(app, selectionAvailable, onExport) {
    super(app);
    this.selectionAvailable = selectionAvailable;
    this.onExport = onExport;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Export mind map" });
    contentEl.createEl("p", {
      text: "Choose a format and the part of the canvas to export."
    });
    const form = contentEl.createDiv({ cls: "mindvas-export-form" });
    const formatLabel = form.createEl("label", { text: "Format" });
    const format = formatLabel.createEl("select");
    for (const [value, label] of [
      ["pdf", "PDF"],
      ["png", "Image (PNG)"],
      ["svg", "SVG"],
      ["markdown", "Markdown file"]
    ])
      format.createEl("option", { value, text: label });
    const scopeLabel = form.createEl("label", { text: "Area" });
    const scope = scopeLabel.createEl("select");
    for (const [value, label] of [
      ["whole", "Whole mind map"],
      ["viewport", "Current viewport"],
      ["selection", "Selection"]
    ]) {
      const option = scope.createEl("option", { value, text: label });
      if (value === "selection" && !this.selectionAvailable)
        option.disabled = true;
    }
    const hint = form.createDiv({ cls: "setting-item-description" });
    const refresh = () => {
      const markdown = format.value === "markdown";
      scope.disabled = markdown;
      if (markdown)
        scope.value = "whole";
      hint.setText(markdown
        ? "Markdown exports the complete hierarchy without Canvas coordinates."
        : "The exported file is saved to your Downloads folder.");
    };
    format.addEventListener("change", refresh);
    refresh();
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    const submit = actions.createEl("button", { text: "Export", cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
    submit.addEventListener("click", () => {
      const request = { format: format.value, scope: scope.value };
      this.close();
      void this.onExport(request);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
};
}

async function rasterizeSvg(svgInfo, ownerDocument, type = "image/png") {
  const ownerWindow = ownerDocument.defaultView || window;
  const maxDimension = 8192;
  const scale = Math.min(2, maxDimension / Math.max(svgInfo.width, svgInfo.height));
  const width = Math.max(1, Math.round(svgInfo.width * scale));
  const height = Math.max(1, Math.round(svgInfo.height * scale));
  const blob = new Blob([svgInfo.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = ownerWindow.URL.createObjectURL(blob);
  try {
    const image = new ownerWindow.Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not render the SVG"));
      image.src = url;
    });
    const bitmap = ownerDocument.createElement("canvas");
    bitmap.width = width;
    bitmap.height = height;
    const context = bitmap.getContext("2d");
    if (!context)
      throw new Error("Canvas rendering is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const encoded = await new Promise((resolve, reject) => bitmap.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Could not encode the image")),
      type,
      type === "image/jpeg" ? 0.94 : void 0
    ));
    return new Uint8Array(await encoded.arrayBuffer());
  } finally {
    ownerWindow.URL.revokeObjectURL(url);
  }
}

function safeBaseName(value) {
  return String(value || "Mind map")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .trim() || "Mind map";
}

async function saveToDownloads(baseName, suffix, extension, content) {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const downloads = path.join(os.homedir(), "Downloads");
  await fs.promises.mkdir(downloads, { recursive: true });
  const stem = `${safeBaseName(baseName)}${suffix ? ` - ${suffix}` : ""}`;
  for (let counter = 1; ; counter++) {
    const numberedStem = counter === 1 ? stem : `${stem} ${counter}`;
    const output = path.join(downloads, `${numberedStem}.${extension}`);
    try {
      await fs.promises.writeFile(output, content, { flag: "wx" });
      return path.basename(output);
    } catch (error) {
      if (error?.code !== "EEXIST")
        throw error;
    }
  }
}

module.exports = {
  createExportMindMapModal,
  rasterizeSvg,
  safeBaseName,
  saveToDownloads
};
