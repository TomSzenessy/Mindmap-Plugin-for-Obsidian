'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
	separateBranch,
	colorBranch,
	toggleSubtreeCollapse,
	topicTitleFromText,
	topicTitleFromNode,
	safeTopicFilename,
	nextTopicFilePath,
	nextTopicNotePath,
	isTextTopicNode,
	getTopicBranch
} = require('../lib/mindmap-actions.js');

test('separates branch by removing parent edges', () => {
	const canvas = {};
	const node = { id: 'child' };
	const removed = [];

	const canvasApi = {
		getIncomingEdges: () => [{ id: 'parent-edge' }],
		removeEdge: (c, edge) => removed.push(edge)
	};

	const result = separateBranch(canvas, canvasApi, node);
	assert.equal(result, true);
	assert.equal(removed.length, 1);
});

test('colors node and descendants recursively', () => {
	const rootNode = {
		id: 'root',
		setColor: (c) => {
			rootNode.color = c;
		}
	};
	const childNode = {
		id: 'child',
		setColor: (c) => {
			childNode.color = c;
		}
	};

	const forest = [
		{
			canvasNode: rootNode,
			children: [{ canvasNode: childNode, children: [] }]
		}
	];

	const count = colorBranch({}, forest, rootNode, '5');
	assert.equal(count, 2);
	assert.equal(rootNode.color, '5');
	assert.equal(childNode.color, '5');
});

test('derives a clean title from a topic card', () => {
	assert.equal(topicTitleFromText('# Product roadmap\n\nDetails'), 'Product roadmap');
	assert.equal(topicTitleFromText('- **Launch**'), 'Launch');
	assert.equal(topicTitleFromText('[[Roadmap|Plan]]'), 'Plan');
	assert.equal(topicTitleFromText('   '), 'Untitled');
	assert.equal(topicTitleFromNode({ text: 'Nested topic' }), 'Nested topic');
});

test('creates portable and unique note paths', () => {
	assert.equal(safeTopicFilename('  Q3/Q4: roadmap?  '), 'Q3-Q4- roadmap-');
	assert.equal(safeTopicFilename('   '), 'Untitled');
	const existing = new Set(['Notes/Topic.md', 'Notes/Topic 1.md']);
	assert.equal(
		nextTopicNotePath('Notes', 'Topic', (path) => existing.has(path)),
		'Notes/Topic 2.md'
	);
	assert.equal(
		nextTopicFilePath('Notes', 'Topic', 'canvas'),
		'Notes/Topic.canvas'
	);
});

test('identifies text topics and returns a complete branch', () => {
	const root = { id: 'root', text: 'Root' };
	const child = { id: 'child', text: 'Child' };
	const forest = [
		{
			canvasNode: root,
			children: [
				{
					canvasNode: child,
					children: []
				}
			]
		}
	];
	assert.equal(isTextTopicNode(root), true);
	assert.equal(isTextTopicNode({ id: 'file', file: 'Topic.md' }), false);
	assert.equal(isTextTopicNode({ id: 'file-path', filePath: 'Topic.md' }), false);
	assert.equal(isTextTopicNode({ id: 'link', type: 'link' }), false);
	assert.deepEqual(
		getTopicBranch(forest, root).map((item) => item.canvasNode.id),
		['root', 'child']
	);
	assert.deepEqual(
		getTopicBranch(forest, root, false).map((item) => item.canvasNode.id),
		['root']
	);
});

test('toggles subtree collapse state', () => {
	const rootNode = {
		id: 'root',
		getData: () => ({ collapsed: false }),
		setData: (data) => {
			rootNode.data = data;
		}
	};
	const childNode = {
		id: 'child',
		nodeEl: {
			addClass: (cls) => {
				childNode.class = cls;
			},
			removeClass: (cls) => {
				childNode.class = '';
			}
		}
	};

	const forest = [
		{
			canvasNode: rootNode,
			children: [{ canvasNode: childNode, children: [] }]
		}
	];

	const newState = toggleSubtreeCollapse({}, forest, rootNode);
	assert.equal(newState, true);
	assert.equal(rootNode.data.collapsed, true);
	assert.equal(childNode.class, 'tomindmap-collapsed-hidden');
});
