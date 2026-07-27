"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  autoColor: true,
  horizontalGap: 80,
  verticalGap: 20,
  minNodeWidth: 180,
  maxNodeWidth: 1200,
  defaultNodeWidth: 300,
  defaultNodeHeight: 60,
  maxNodeHeight: 2400,
  defaultMindmapMode: true,
  wrapArrowNavigation: true,
  navigationCrossAxisBuffer: 40,
  navigationZoomPadding: 200,
  mouseNavigation: false,
  exportMarkmapFrontmatter: true,
  markmapColorFreezeLevel: 2
});

const NUMBER_RULES = {
  horizontalGap: [1, 2000],
  verticalGap: [1, 2000],
  minNodeWidth: [80, 12000],
  maxNodeWidth: [80, 12000],
  defaultNodeWidth: [80, 12000],
  defaultNodeHeight: [20, 24000],
  maxNodeHeight: [20, 24000],
  navigationCrossAxisBuffer: [0, 2000],
  navigationZoomPadding: [0, 10000],
  markmapColorFreezeLevel: [0, 10]
};

function finiteInteger(value, fallback, minimum, maximum) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(number))
    return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function normalizeSettings(stored = {}) {
  const source = stored && typeof stored === "object" ? stored : {};
  const result = { ...DEFAULT_SETTINGS };

  for (const key of [
    "autoColor",
    "defaultMindmapMode",
    "wrapArrowNavigation",
    "mouseNavigation",
    "exportMarkmapFrontmatter"
  ]) {
    if (typeof source[key] === "boolean")
      result[key] = source[key];
  }

  for (const [key, [minimum, maximum]] of Object.entries(NUMBER_RULES)) {
    result[key] = finiteInteger(source[key], DEFAULT_SETTINGS[key], minimum, maximum);
  }

  // Keep the three width settings internally coherent even when data.json was
  // hand-edited or came from an older version.
  result.maxNodeWidth = Math.max(result.minNodeWidth, result.maxNodeWidth);
  result.defaultNodeWidth = Math.min(
    result.maxNodeWidth,
    Math.max(result.minNodeWidth, result.defaultNodeWidth)
  );
  result.maxNodeHeight = Math.max(result.defaultNodeHeight, result.maxNodeHeight);
  return result;
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings };
