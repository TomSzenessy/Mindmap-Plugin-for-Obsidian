"use strict";

const MAX_FILENAME_BYTES = 255;
const UTF8_ENCODER = new TextEncoder();
const WINDOWS_RESERVED_STEM =
  /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/i;

function textGraphemes(value) {
  if (
    typeof Intl !== "undefined" &&
    typeof Intl.Segmenter === "function"
  ) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function trimTrailingFilenameCharacters(value) {
  return value.replace(/[. ]+$/g, "");
}

function fitGraphemeBudget(value, maximumBytes) {
  const budget = Math.max(0, Math.floor(maximumBytes));
  let result = "";
  let usedBytes = 0;
  for (const grapheme of textGraphemes(value)) {
    const bytes = UTF8_ENCODER.encode(grapheme).length;
    if (usedBytes + bytes > budget) break;
    result += grapheme;
    usedBytes += bytes;
  }
  return trimTrailingFilenameCharacters(result);
}

function portableFilenameStem(title, maximumBytes = MAX_FILENAME_BYTES) {
  const sanitized = trimTrailingFilenameCharacters(
    String(title || "Untitled")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
  );
  let stem = fitGraphemeBudget(sanitized || "Untitled", maximumBytes);
  if (!stem) {
    const budget = Math.floor(Number(maximumBytes));
    if (!Number.isFinite(budget) || budget < 1)
      throw new RangeError("Filename byte budget must be at least one");
    stem = fitGraphemeBudget("x".repeat(budget), budget);
  }
  const reservedStem = trimTrailingFilenameCharacters(stem.split(".", 1)[0]);
  if (WINDOWS_RESERVED_STEM.test(reservedStem)) {
    stem = fitGraphemeBudget(`_${stem}`, maximumBytes) || "_";
  }
  return stem || "Untitled";
}

function portableExtension(value) {
  const extension = fitGraphemeBudget(
    String(value || "bin")
      .replace(/^\.+/, "")
      .replace(/[^A-Za-z0-9+.-]/g, "")
      .slice(0, 32),
    32
  );
  return extension || "bin";
}

function allocateFilePath(
  folderPath,
  title,
  extension = "md",
  pathExists = () => false
) {
  const folderSource = String(folderPath || "").replace(/\\/g, "/");
  if (
    /[\u0000-\u001f\u007f]/.test(folderSource) ||
    folderSource.startsWith("/") ||
    folderSource.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new TypeError("Filename folder must be a canonical relative vault path");
  }
  const folder = folderSource.replace(/^\/+|\/+$/g, "");
  const suffixExtension = portableExtension(extension);
  const extensionBudget = UTF8_ENCODER.encode(`.${suffixExtension}`).length;
  const exists = typeof pathExists === "function" ? pathExists : () => false;
  let index = 0;

  while (true) {
    const suffix = index === 0 ? "" : ` ${index}`;
    const stemBudget = MAX_FILENAME_BYTES - extensionBudget - byteLength(suffix);
    const stem = portableFilenameStem(title, stemBudget);
    const basename = `${stem}${suffix}.${suffixExtension}`;
    const candidate = folder ? `${folder}/${basename}` : basename;
    if (!exists(candidate)) return candidate;
    index++;
  }
}

function byteLength(value) {
  return UTF8_ENCODER.encode(value).length;
}

module.exports = {
  MAX_FILENAME_BYTES,
  allocateFilePath,
  portableFilenameStem
};
