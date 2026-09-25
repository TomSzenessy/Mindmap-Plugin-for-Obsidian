'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const css = fs.readFileSync(
	path.join(__dirname, '..', 'styles.css'),
	'utf8'
);

test('generated linked cards align their visual container with Canvas anchors', () => {
	assert.match(
		css,
		/tomindmap-title-only-card\s*\.canvas-node-container[\s\S]*?position:\s*absolute\s*!important/
	);
	assert.match(css, /\.canvas-node\.tomindmap-collapsed-hidden[\s\S]*?display:\s*none\s*!important/);
	assert.match(css, /\.canvas-node-label[\s\S]*?display:\s*none\s*!important/);
	assert.match(css, /content:\s*'↗'/);
	assert.match(css, /tomindmap-collapsed-node[\s\S]*?outline:/);
	assert.match(css, /tomindmap-file-card[\s\S]*?position:\s*absolute\s*!important/);
	assert.match(css, /tomindmap-file-card[\s\S]*?inline-title[\s\S]*?display:\s*none\s*!important/);
	assert.match(css, /data-tomindmap-card-kind='nested-map'[\s\S]*?content:\s*'◈'/);
});

test('removes only selectors proven to have no live producer', () => {
	assert.doesNotMatch(css, /\.tomindmap-media-btn/);
	assert.doesNotMatch(css, /\.tomindmap-print-frame/);
	assert.doesNotMatch(css, /\.tomindmap-drop-active/);
	assert.match(css, /\.tomindmap-node-drop-hover/);
});

test('removes motion while retaining visual state feedback for reduced motion', () => {
	assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
	assert.match(css, /\.canvas-node\.mindmap-animating[\s\S]*?transition:\s*none\s*!important/);
	assert.match(css, /\.canvas-node\.mindmap-group-animating[\s\S]*?transition:\s*none\s*!important/);
	assert.match(css, /\.tomindmap-touch-btn:active[\s\S]*?transform:\s*none\s*!important/);
	assert.match(css, /\.tomindmap-reparent-target[\s\S]*?outline:/);
});
