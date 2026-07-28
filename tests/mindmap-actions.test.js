'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
	separateBranch,
	colorBranch,
	toggleSubtreeCollapse
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
