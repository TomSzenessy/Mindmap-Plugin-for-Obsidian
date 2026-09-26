"use strict";

const SETTINGS_FIELDS = Object.freeze([
  Object.freeze({ key: "autoColor", type: "boolean", default: true }),
  Object.freeze({ key: "horizontalGap", type: "number", default: 80, minimum: 1, maximum: 2000 }),
  Object.freeze({ key: "verticalGap", type: "number", default: 20, minimum: 1, maximum: 2000 }),
  Object.freeze({ key: "minNodeWidth", type: "number", default: 80, minimum: 80, maximum: 12000 }),
  Object.freeze({
    key: "maxNodeWidth",
    type: "number",
    default: 1200,
    minimum: 80,
    maximum: 12000,
    legacy: Object.freeze({ value: 420 })
  }),
  Object.freeze({ key: "defaultNodeWidth", type: "number", default: 300, minimum: 80, maximum: 12000 }),
  Object.freeze({ key: "defaultNodeHeight", type: "number", default: 60, minimum: 20, maximum: 24000 }),
  Object.freeze({
    key: "maxNodeHeight",
    type: "number",
    default: 2400,
    minimum: 20,
    maximum: 24000,
    legacy: Object.freeze({ value: 300 })
  }),
  Object.freeze({ key: "defaultMindmapMode", type: "boolean", default: true }),
  Object.freeze({ key: "autoCreateRootTopic", type: "boolean", default: true }),
  Object.freeze({ key: "renameCanvasFromRootTopic", type: "boolean", default: true }),
  Object.freeze({ key: "wrapArrowNavigation", type: "boolean", default: true }),
  Object.freeze({ key: "navigationCrossAxisBuffer", type: "number", default: 40, minimum: 0, maximum: 2000 }),
  Object.freeze({ key: "navigationZoomPadding", type: "number", default: 200, minimum: 0, maximum: 10000 }),
  Object.freeze({ key: "mouseNavigation", type: "boolean", default: false }),
  Object.freeze({ key: "exportMarkmapFrontmatter", type: "boolean", default: true }),
  Object.freeze({ key: "markmapColorFreezeLevel", type: "number", default: 2, minimum: 0, maximum: 10 }),
  Object.freeze({
    key: "touchControls",
    type: "enum",
    default: "auto",
    values: Object.freeze(["auto", "on", "off"])
  }),
  Object.freeze({ key: "createNewMindMapRibbon", type: "boolean", default: true }),
  Object.freeze({ key: "renameCreateCanvas", type: "boolean", default: true })
]);

const DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.key, field.default]))
);

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function finiteInteger(value, fallback, minimum, maximum) {
  let number = value;
  if (typeof value === "string") {
    const candidate = value.trim();
    number = NUMBER_PATTERN.test(candidate) ? Number(candidate) : Number.NaN;
  } else if (typeof value !== "number") {
    number = Number.NaN;
  }
  if (!Number.isFinite(number))
    return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function normalizeSettings(stored = {}) {
  const source = stored && typeof stored === "object" ? stored : {};
  const result = { ...DEFAULT_SETTINGS };

  for (const field of SETTINGS_FIELDS) {
    const value = source[field.key];
    if (field.type === "boolean") {
      if (typeof value === "boolean") result[field.key] = value;
    } else if (field.type === "number") {
      result[field.key] = finiteInteger(
        value,
        field.default,
        field.minimum,
        field.maximum
      );
    } else if (field.type === "enum" && field.values.includes(value)) {
      result[field.key] = value;
    }
  }

  // Legacy releases persisted these former safety ceilings. Apply migration
  // only after every stored representation has gone through the descriptor.
  for (const field of SETTINGS_FIELDS) {
    if (field.legacy && result[field.key] === field.legacy.value) {
      result[field.key] = field.default;
    }
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

module.exports = { DEFAULT_SETTINGS, SETTINGS_FIELDS, normalizeSettings };
