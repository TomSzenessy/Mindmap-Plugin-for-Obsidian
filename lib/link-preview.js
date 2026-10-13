"use strict";

/**
 * Link topics: a topic whose whole text is one web address renders as a
 * compact preview card (title, site, optional thumbnail) instead of raw
 * Markdown. Everything here is pure so it can be tested without Obsidian;
 * page HTML is untrusted and is only scanned for metadata, never rendered.
 */

const LINK_PREVIEW_KEY = "tomindmapLink";
const LINK_PLAIN_KEY = "tomindmapLinkPlain";
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_SCANNED_HTML = 512 * 1024;
const LINK_CARD_WIDTH = 340;
const PLACEHOLDER_TITLE = /^(?:loading|please wait|just a moment|redirecting|one moment)\b[\s.\u2026!]*$/i;
const LINK_CARD_HEIGHT = 64;
const LINK_CARD_IMAGE_HEIGHT = 96;

function safeHttpUrl(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate || candidate.length > MAX_URL_LENGTH || /[\s<>"]/.test(candidate))
    return "";
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_) {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return "";
  if (!parsed.hostname || parsed.username || parsed.password)
    return "";
  return parsed.href;
}

/**
 * Accept what people actually type into a link field: a full address, or a
 * bare domain such as "example.com/page", which is upgraded to https.
 */
function normalizeTypedUrl(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate))
    return safeHttpUrl(candidate);
  if (!/^[^\s/]+\.[^\s/]{2,}(?:[/?#]|$)/.test(candidate))
    return "";
  return safeHttpUrl(`https://${candidate}`);
}

/**
 * Return { url, label } when the topic text is exactly one link: a bare URL,
 * an autolink <url>, or a Markdown link [label](url). Mixed text is left as a
 * normal topic so sentences that mention a link keep their wording.
 */
function standaloneLink(text) {
  const value = String(text ?? "").trim();
  if (!value || value.length > MAX_URL_LENGTH + MAX_TITLE_LENGTH + 8 || value.includes("\n"))
    return null;
  const autolink = value.match(/^<([^<>\s]+)>$/);
  if (autolink) {
    const url = safeHttpUrl(autolink[1]);
    return url ? { url, label: "" } : null;
  }
  const markdown = value.match(/^\[((?:\\.|[^\]\\])*)\]\(\s*<?([^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?\s*\)$/);
  if (markdown) {
    const url = safeHttpUrl(markdown[2]);
    if (!url) return null;
    const label = markdown[1].replace(/\\(.)/g, "$1").trim();
    return { url, label: label === markdown[2] ? "" : label };
  }
  const url = safeHttpUrl(value);
  return url ? { url, label: "" } : null;
}

function linkDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function clampText(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** Markdown kept in the topic so export, outline, and sync stay readable. */
function linkTopicText(title, url) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return String(title ?? "");
  const label = clampText(title, MAX_TITLE_LENGTH) || linkDomain(safeUrl) || safeUrl;
  return `[${label.replace(/([\\[\]])/g, "\\$1")}](<${safeUrl}>)`;
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»"
};

function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch (_) {
        return "";
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function tagAttributes(tag) {
  const attributes = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attributes;
}

/**
 * Extract preview metadata from untrusted page HTML. Only <head>-style meta
 * and title tags are scanned; scripts never run and markup is never kept.
 */
function parseLinkPreview(html, pageUrl) {
  const baseUrl = safeHttpUrl(pageUrl);
  const source = String(html ?? "").slice(0, MAX_SCANNED_HTML);
  const meta = {};
  const metaPattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(source)) !== null) {
    const attributes = tagAttributes(match[0]);
    const key = String(attributes.property || attributes.name || "").toLowerCase();
    if (!key || attributes.content === undefined || meta[key] !== undefined) continue;
    meta[key] = attributes.content;
  }
  const titleTag = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const resolve = (value) => {
    if (!value || !baseUrl) return "";
    try {
      return safeHttpUrl(new URL(value, baseUrl).href);
    } catch (_) {
      return "";
    }
  };
  const title = clampText(
    meta["og:title"] || meta["twitter:title"] || decodeEntities(titleTag?.[1] || ""),
    MAX_TITLE_LENGTH
  );
  return {
    // Script-driven pages ship a placeholder until their code runs; scripts
    // never run here, so such a title says nothing about the page.
    title: PLACEHOLDER_TITLE.test(title) ? "" : title,
    description: clampText(
      meta["og:description"] || meta["twitter:description"] || meta.description || "",
      MAX_DESCRIPTION_LENGTH
    ),
    image: resolve(meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || meta["twitter:image:src"]),
    site: clampText(meta["og:site_name"] || linkDomain(baseUrl), MAX_TITLE_LENGTH)
  };
}

/** Validate the preview record stored in node data; unsafe links read as none. */
function readLinkPreview(data) {
  const record = data?.[LINK_PREVIEW_KEY];
  if (!record || typeof record !== "object") return null;
  const url = safeHttpUrl(record.url);
  if (!url) return null;
  return {
    url,
    title: clampText(record.title, MAX_TITLE_LENGTH) || linkDomain(url),
    description: clampText(record.description, MAX_DESCRIPTION_LENGTH),
    image: safeHttpUrl(record.image),
    site: clampText(record.site, MAX_TITLE_LENGTH) || linkDomain(url),
    customTitle: record.customTitle === true,
    fetched: record.fetched === true
  };
}

function linkPreviewData(node) {
  let data = null;
  try {
    data = typeof node?.getData === "function" ? node.getData() : null;
  } catch (_) {
    data = null;
  }
  // Live Canvas nodes expose saved fields via getData()/unknownData; plain
  // node data (as passed to importData) carries them at the top level.
  return readLinkPreview(data || (node?.unknownData?.[LINK_PREVIEW_KEY] ? node.unknownData : node));
}

/**
 * The stored record for a link topic. When the address is unchanged, data
 * already fetched for it is kept unless the user replaced an automatic title.
 */
function linkRecord(link, current = null) {
  const sameUrl = current?.url === link.url;
  const label = String(link.label || "").trim();
  // A label equal to the page title fetched earlier is still automatic.
  const customTitle = !!label && !(current && !current.customTitle && label === current.title);
  const keepsPreview = sameUrl && (customTitle || !current.customTitle);
  return {
    url: link.url,
    title: label || (keepsPreview ? current.title : "") || linkDomain(link.url),
    description: keepsPreview ? current.description : "",
    image: keepsPreview ? current.image : "",
    site: keepsPreview ? current.site : linkDomain(link.url),
    customTitle,
    fetched: keepsPreview ? current.fetched : false
  };
}

/**
 * Canvas node data for a new topic, upgraded to a link card when its text is
 * exactly one web link. Building the card into the data lets Canvas create it
 * finished, instead of patching a card that has not rendered yet.
 */
function asLinkTopicData(data) {
  if (!data || (data.type && data.type !== "text") || data[LINK_PLAIN_KEY]) return data;
  const link = standaloneLink(data.text);
  if (!link) return data;
  const record = linkRecord(link);
  return {
    ...data,
    ...linkCardSize(record),
    text: linkTopicText(record.title, record.url),
    [LINK_PREVIEW_KEY]: record
  };
}

function linkCardSize(preview) {
  return {
    width: LINK_CARD_WIDTH,
    height: preview?.image ? LINK_CARD_IMAGE_HEIGHT : LINK_CARD_HEIGHT
  };
}

module.exports = {
  LINK_PREVIEW_KEY,
  LINK_PLAIN_KEY,
  asLinkTopicData,
  linkCardSize,
  linkDomain,
  linkPreviewData,
  linkRecord,
  linkTopicText,
  normalizeTypedUrl,
  parseLinkPreview,
  readLinkPreview,
  safeHttpUrl,
  standaloneLink
};
