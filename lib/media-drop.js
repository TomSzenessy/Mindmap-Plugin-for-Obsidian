"use strict";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["flac", "m4a", "mp3", "oga", "ogg", "wav"]);

function extensionOf(name) {
  const clean = String(name || "").split(/[?#]/)[0];
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index + 1).toLowerCase() : "";
}

function mediaKind(name, mimeType = "") {
  const extension = extensionOf(name);
  const mime = String(mimeType || "").toLowerCase();
  if (extension === "pdf" || mime === "application/pdf")
    return "document";
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/"))
    return "image";
  if (VIDEO_EXTENSIONS.has(extension) || mime.startsWith("video/"))
    return "video";
  if (AUDIO_EXTENSIONS.has(extension) || mime.startsWith("audio/"))
    return "audio";
  return "file";
}

function mediaNodeSize(name, mimeType, settings = {}) {
  const kind = mediaKind(name, mimeType);
  const minWidth = Math.max(80, Number(settings.minNodeWidth) || 180);
  const maxWidth = Math.max(minWidth, Number(settings.maxNodeWidth) || 1200);
  const maxHeight = Math.max(20, Number(settings.maxNodeHeight) || 2400);
  const defaultHeight = Math.max(20, Number(settings.defaultNodeHeight) || 60);
  const sizes = {
    document: [640, 480],
    image: [480, 320],
    video: [480, 300],
    audio: [420, 110],
    file: [400, 240]
  };
  const [width, height] = sizes[kind];
  return {
    kind,
    width: Math.min(maxWidth, Math.max(minWidth, width)),
    height: Math.min(maxHeight, Math.max(defaultHeight, height))
  };
}

function droppedUrl(dataTransfer) {
  if (!dataTransfer || typeof dataTransfer.getData !== "function")
    return "";
  let uriList = "";
  let plainText = "";
  try {
    uriList = dataTransfer.getData("text/uri-list");
    plainText = dataTransfer.getData("text/plain");
  } catch (_) {
    return "";
  }
  const candidate = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
    || plainText.trim();
  if (!candidate || /\s/.test(candidate))
    return "";
  try {
    const url = new URL(candidate);
    return ["http:", "https:", "obsidian:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}

function hasSupportedDrop(dataTransfer) {
  if (!dataTransfer)
    return false;
  if (dataTransfer.files?.length > 0 || droppedUrl(dataTransfer))
    return true;
  return Array.from(dataTransfer.types || []).includes("text/uri-list");
}

function linkLabel(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "obsidian:")
      return "Obsidian link";
    return parsed.hostname.replace(/^www\./, "") || "Web link";
  } catch (_) {
    return "Link";
  }
}

module.exports = {
  droppedUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize
};
