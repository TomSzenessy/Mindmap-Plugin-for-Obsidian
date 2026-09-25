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
  const resource = decodeMediaResource(filePath);
  if (!resource.ok || resource.type !== "vault-file" || resource.protocol)
    return null;
  const size = mediaNodeSize(resource.path, mimeType, settings);
  return {
    id,
    type: "file",
    file: resource.path,
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0,
    width: size.width,
    height: size.height
  };
}

const SUPPORTED_MEDIA_PROTOCOLS = Object.freeze([
  "app:",
  "file:",
  "http:",
  "https:",
  "obsidian:"
]);
const SUPPORTED_MEDIA_PROTOCOL_SET = new Set(SUPPORTED_MEDIA_PROTOCOLS);

function resourceSourceDirectory(sourcePath) {
  const normalized = String(sourcePath || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "");
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(0, separator) : "";
}

function decodedResourcePart(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return null;
  }
}

function normalizedVaultPath(value, { allowAbsolute = false } = {}) {
  const decoded = decodedResourcePart(value);
  if (decoded === null) return null;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  const normalized = decoded.replace(/\\/g, "/");
  const absolute = allowAbsolute && normalized.startsWith("/");
  const path = absolute || !allowAbsolute
    ? normalized.replace(/^\/+/, "")
    : normalized;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  if (!path || (!absolute && path.startsWith("/"))) return null;
  return absolute ? `/${path.replace(/^\/+/, "")}` : path;
}

function splitResourceReference(value) {
  const source = String(value || "");
  const hash = source.indexOf("#");
  const fragmentSource = hash >= 0 ? source.slice(hash + 1) : "";
  const withoutFragment = hash >= 0 ? source.slice(0, hash) : source;
  const query = withoutFragment.indexOf("?");
  return {
    pathSource: query >= 0 ? withoutFragment.slice(0, query) : withoutFragment,
    fragmentSource
  };
}

function decodedMediaResult(type, value, sourceDirectory, options = {}) {
  return {
    ok: true,
    type,
    value,
    path: type === "vault-file" ? value : null,
    fragment: options.fragment ?? null,
    protocol: options.protocol ?? null,
    sourceDirectory,
    input: String(options.input || "")
  };
}

function failedMediaResult(reason, sourceDirectory, input, protocol = null) {
  return {
    ok: false,
    reason,
    protocol,
    sourceDirectory,
    input: String(input || "")
  };
}

function invalidVaultPathResult(pathSource, sourceDirectory, input, protocol = null) {
  const reason =
    pathSource.includes("%") && decodedResourcePart(pathSource) === null
      ? "invalid-encoding"
      : "invalid-resource";
  return failedMediaResult(reason, sourceDirectory, input, protocol);
}

function hasFileExtension(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1;
}

/** Decode one dropped/persisted resource into a validated discriminated result. */
function decodeMediaResource(value, sourcePath = "") {
  const sourceDirectory = resourceSourceDirectory(sourcePath);
  const input = String(value || "").trim();
  const malformedWikiLink =
    (input.startsWith("[[") || input.startsWith("![[")) &&
    !input.endsWith("]]");
  const malformedMarkdownLink =
    ((input.startsWith("![") && input.includes("](")) ||
      /^\[[^\]]*\]\(/.test(input)) &&
    !/^!?\[[^\]]*\]\(.*\)$/.test(input);
  if (!input || input.startsWith("//") || malformedWikiLink || malformedMarkdownLink) {
    return failedMediaResult("invalid-resource", sourceDirectory, input);
  }

  let target = input;
  if ((input.startsWith("[[") || input.startsWith("![[")) && input.endsWith("]]")) {
    const offset = input.startsWith("![[") ? 3 : 2;
    target = input.slice(offset, -2).split("|", 1)[0].trim();
    const { pathSource } = splitResourceReference(target);
    const decoded = normalizedVaultPath(pathSource);
    if (decoded === null) {
      return invalidVaultPathResult(pathSource, sourceDirectory, input);
    }
    const path = hasFileExtension(decoded) ? decoded : `${decoded}.md`;
    const { fragmentSource } = splitResourceReference(target);
    const fragment = fragmentSource ? decodedResourcePart(fragmentSource) : "";
    if (fragment === null) {
      return failedMediaResult("invalid-encoding", sourceDirectory, input);
    }
    return decodedMediaResult("vault-file", path, sourceDirectory, {
      fragment: fragment || null,
      input
    });
  }

  const markdown = input.match(/^!?\[[^\]]*\]\((.*)\)$/);
  if (markdown) {
    target = markdown[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    }
  }

  const scheme = target.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1]?.toLowerCase() || null;
  if (scheme) {
    if (!SUPPORTED_MEDIA_PROTOCOL_SET.has(scheme)) {
      return failedMediaResult("unsupported-protocol", sourceDirectory, input, scheme);
    }
    let parsed;
    try {
      parsed = new URL(target);
    } catch (_) {
      return failedMediaResult("invalid-resource", sourceDirectory, input, scheme);
    }
    const fragment = parsed.hash ? decodedResourcePart(parsed.hash.slice(1)) : "";
    if (fragment === null) {
      return failedMediaResult("invalid-encoding", sourceDirectory, input, scheme);
    }
    if (scheme === "http:" || scheme === "https:") {
      return decodedMediaResult("link", parsed.href, sourceDirectory, {
        fragment: fragment || null,
        protocol: scheme,
        input
      });
    }
    if (scheme === "obsidian:") {
      const file = parsed.searchParams.get("file");
      if (!file) {
        return decodedMediaResult("link", parsed.href, sourceDirectory, {
          fragment: fragment || null,
          protocol: scheme,
          input
        });
      }
      const path = normalizedVaultPath(file, { allowAbsolute: true });
      if (path === null) {
        return invalidVaultPathResult(file, sourceDirectory, input, scheme);
      }
      return decodedMediaResult("vault-file", path, sourceDirectory, {
        fragment: fragment || null,
        protocol: scheme,
        input
      });
    }
    const path = normalizedVaultPath(parsed.pathname, {
      allowAbsolute: scheme === "file:"
    });
    if (path === null) {
      return invalidVaultPathResult(parsed.pathname, sourceDirectory, input, scheme);
    }
    return decodedMediaResult("vault-file", path, sourceDirectory, {
      fragment: fragment || null,
      protocol: scheme,
      input
    });
  }

  const { pathSource, fragmentSource } = splitResourceReference(target);
  const path = normalizedVaultPath(pathSource);
  const fragment = fragmentSource ? decodedResourcePart(fragmentSource) : "";
  if (path === null) {
    return invalidVaultPathResult(pathSource, sourceDirectory, input);
  }
  if (fragment === null) {
    return failedMediaResult("invalid-encoding", sourceDirectory, input);
  }
  if (!hasFileExtension(path)) {
    return failedMediaResult("invalid-resource", sourceDirectory, input);
  }
  return decodedMediaResult("vault-file", path, sourceDirectory, {
    fragment: fragment || null,
    input
  });
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
  const resource = decodeMediaResource(url);
  if (!resource.ok) return null;

  if (resource.type === "vault-file" && !resource.protocol) {
    const size = mediaNodeSize(resource.path, "", settings);
    return {
      id,
      type: "file",
      file: resource.path,
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      width: size.width,
      height: size.height
    };
  }

  if (resource.protocol === "obsidian:") {
    return {
      id,
      type: "text",
      text: `[Obsidian link](<${resource.input}>)`,
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      width: 420,
      height: 110
    };
  }

  return {
    id,
    type: "link",
    url: resource.input,
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
    const resource = decodeMediaResource(path);
    if (!resource.ok) return "";
    return resource.protocol ? path : resource.value;
  }

  const candidate = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
    || plainText.trim();

  const resource = decodeMediaResource(candidate);
  if (!resource.ok) return "";
  return resource.protocol ? candidate : resource.value;
}

function hasSupportedDrop(dataTransfer) {
  if (!dataTransfer)
    return false;
  if (dataTransfer.files?.length > 0)
    return true;
  return !!droppedUrl(dataTransfer);
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
  decodeMediaResource,
  droppedUrl,
  hasSupportedDrop,
  linkLabel,
  mediaKind,
  mediaNodeSize,
  obsidianDragPath,
  SUPPORTED_MEDIA_PROTOCOLS
};
