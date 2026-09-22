"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { DEFAULT_SETTINGS, normalizeSettings } = require("../lib/settings.js");

test("uses a compact automatic width floor for short labels", () => {
  assert.equal(DEFAULT_SETTINGS.minNodeWidth, 80);
  assert.equal(normalizeSettings({}).minNodeWidth, 80);
});

test("normalizes malformed and legacy settings into coherent bounds", () => {
  const settings = normalizeSettings({
    autoColor: "yes",
    horizontalGap: "-20",
    verticalGap: "not-a-number",
    minNodeWidth: 900,
    defaultNodeWidth: 200,
    maxNodeWidth: 400,
    defaultNodeHeight: 700,
    maxNodeHeight: 100,
    navigationZoomPadding: Infinity,
    markmapColorFreezeLevel: 99
  });

  assert.equal(settings.autoColor, DEFAULT_SETTINGS.autoColor);
  assert.equal(settings.horizontalGap, 1);
  assert.equal(settings.verticalGap, DEFAULT_SETTINGS.verticalGap);
  assert.equal(settings.minNodeWidth, 900);
  assert.equal(settings.defaultNodeWidth, 900);
  assert.equal(settings.maxNodeWidth, 900);
  assert.equal(settings.defaultNodeHeight, 700);
  assert.equal(settings.maxNodeHeight, 700);
  assert.equal(settings.navigationZoomPadding, DEFAULT_SETTINGS.navigationZoomPadding);
  assert.equal(settings.markmapColorFreezeLevel, 10);
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

test("returns a fresh settings object and leaves defaults immutable", () => {
  const first = normalizeSettings();
  const second = normalizeSettings();
  first.horizontalGap = 999;

  assert.notEqual(first, second);
  assert.equal(second.horizontalGap, DEFAULT_SETTINGS.horizontalGap);
  assert.equal(DEFAULT_SETTINGS.horizontalGap, 80);
});

test("touch controls default to auto and clamp to known modes", () => {
  assert.equal(DEFAULT_SETTINGS.touchControls, "auto");
  assert.equal(normalizeSettings({}).touchControls, "auto");
  assert.equal(normalizeSettings({ touchControls: "on" }).touchControls, "on");
  assert.equal(normalizeSettings({ touchControls: "off" }).touchControls, "off");
  assert.equal(
    normalizeSettings({ touchControls: "sometimes" }).touchControls,
    "auto"
  );
  assert.equal(normalizeSettings({ touchControls: 7 }).touchControls, "auto");
});
