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

function createFileNodeSpec(filePath, mimeType, position, settings = {}, id = "") {
  const size = mediaNodeSize(filePath, mimeType, settings);
  return {
    id,
    type: "file",
    file: filePath,
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0,
    width: size.width,
    height: size.height
  };
}

function extractFilePathFromUrl(url) {
  if (!url) return null;
  let str = String(url).trim();

  // 1. Wikilink [[Path/To/Note]] or embed ![[Path/To/Note|Alias]]
  if ((str.startsWith("[[") || str.startsWith("![[")) && str.endsWith("]]")) {
    const offset = str.startsWith("![[") ? 3 : 2;
    let inner = str.slice(offset, -2).split("|")[0].trim();
    if (!inner.includes(".")) inner += ".md";
    return inner;
  }

  // 2. Markdown link [Text](path)
  const mdMatch = str.match(/^!?\[.*?\]\((.*?)\)$/);
  if (mdMatch) {
    str = mdMatch[1].trim();
    if (str.startsWith("<") && str.endsWith(">"))
      str = str.slice(1, -1).trim();
  }

  // 3. obsidian:// URIs (e.g. obsidian://open?vault=...&file=...)
  if (str.startsWith("obsidian:")) {
    try {
      const u = new URL(str);
      if (u.searchParams.has("file")) {
        return u.searchParams.get("file");
      }
    } catch (_) {}
  }

  // 4. app://... (Obsidian internal resource URLs)
  if (str.startsWith("app://")) {
    try {
      const parsed = new URL(str);
      return decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    } catch (_) {}
  }

  // 5. file:// URIs
  if (str.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(str).pathname);
    } catch (_) {}
  }

  // 6. Direct vault paths. Keep this extension-agnostic so audio, video,
  // office documents, and plugin-defined file types are supported too.
  // Remote resources must remain link nodes. A URL ending in ".pdf" is not a
  // vault path and Canvas cannot render it as a native file card.
  if (/^[a-z][a-z0-9+.-]*:/i.test(str)) {
    return null;
  }
  const cleanStr = str.replace(/[?#].*$/, "");
  if (/(?:^|\/)[^/]+\.[a-z0-9][a-z0-9._-]{0,20}$/i.test(cleanStr)) {
    try {
      return decodeURIComponent(cleanStr);
    } catch (_) {
      return cleanStr;
    }
  }

  return null;
}

function obsidianDragPath(payload) {
  const value = String(payload || "").trim();
  if (!value) return "";

  const pathFromEntry = (entry) => {
    if (typeof entry === "string") return entry.trim();
    if (!entry || typeof entry !== "object") return "";
    return String(entry.path || entry.file || entry.filePath || "").trim();
  };

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const path = pathFromEntry(entry);
        if (path) return path;
      }
      return "";
    }
    return pathFromEntry(parsed);
  } catch (_) {
    return value;
  }
}

function createLinkNodeSpec(url, position, settings = {}, id = "") {
  const filePath = extractFilePathFromUrl(url);
  const hasUriScheme = /^[a-z][a-z0-9+.-]*:/i.test(String(url || "").trim());
  if (filePath && !hasUriScheme) {
    const size = mediaNodeSize(filePath, "", settings);
    return {
      id,
      type: "file",
      file: filePath,
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      width: size.width,
      height: size.height
    };
  }

  const isObsidianUrl = String(url || "").startsWith("obsidian:");
  if (isObsidianUrl) {
    return {
      id,
      type: "text",
      text: `[Obsidian link](<${url}>)`,
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      width: 420,
      height: 110
    };
  }

  return {
    id,
    type: "link",
    url,
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0,
    width: 480,
    height: 280
  };
}

function droppedUrl(dataTransfer) {
  if (!dataTransfer || typeof dataTransfer.getData !== "function")
    return "";
  let uriList = "";
  let plainText = "";
  let obsidianAppFile = "";
  try {
    uriList = dataTransfer.getData("text/uri-list") || "";
    plainText = dataTransfer.getData("text/plain") || "";
    obsidianAppFile = dataTransfer.getData("application/x-obsidian-app-file") || "";
  } catch (_) {
    return "";
  }

  // Check application/x-obsidian-app-file first (Obsidian file explorer drag)
  if (obsidianAppFile) {
    const path = obsidianDragPath(obsidianAppFile);
    if (path) return path;
  }

  const candidate = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
    || plainText.trim();

  if (!candidate) return "";

  if (candidate.startsWith("obsidian:") || candidate.startsWith("http:") || candidate.startsWith("https:") || candidate.startsWith("app://") || candidate.startsWith("file://")) {
    return candidate;
  }

  if (candidate.startsWith("[[") && candidate.includes("]]")) {
    return candidate;
  }

  const extracted = extractFilePathFromUrl(candidate);
  if (extracted) {
    return extracted;
  }

  try {
    const url = new URL(candidate);
    return ["http:", "https:", "obsidian:", "app:", "file:"].includes(url.protocol) ? url.href : candidate;
  } catch (_) {
    if (candidate.includes("/") || candidate.endsWith(".md") || candidate.endsWith(".canvas")) {
      return candidate;
    }
  }

  return "";
}

function hasSupportedDrop(dataTransfer) {
  if (!dataTransfer)
    return false;
  if (dataTransfer.files?.length > 0)
    return true;
  if (dataTransfer.types && Array.from(dataTransfer.types).includes("application/x-obsidian-app-file"))
    return true;
  if (droppedUrl(dataTransfer))
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
  createFileNodeSpec,
  createLinkNodeSpec,
  droppedUrl,
  extractFilePathFromUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize,
  obsidianDragPath
};
