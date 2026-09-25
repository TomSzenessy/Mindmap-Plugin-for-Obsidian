'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildForest } = require('../lib/tree-model.js');
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
	getTopicBranch,
	remapLinkedCanvasData,
	updateLinkedParentCardData,
	syncCollapsedVisibility
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

test('remaps nested linked content at the linked card anchor', () => {
	let next = 0;
	const result = remapLinkedCanvasData(
		{
			nodes: [
				{ id: 'root', type: 'text', text: 'Root', x: 100, y: 50, width: 200, height: 60 },
				{ id: 'child', type: 'text', text: 'Child', x: 400, y: 50, width: 180, height: 60 }
			],
			edges: [{ id: 'edge', fromNode: 'root', toNode: 'child' }]
		},
		{ x: 1000, y: 200, width: 200, height: 60 },
		new Set(['root']),
		() => `new-${++next}`
	);
	assert.equal(result.rootId, 'new-1');
	assert.deepEqual(
		result.nodes.map((node) => [node.id, node.x, node.y]),
		[
			['new-1', 1000, 200],
			['new-2', 1300, 200]
		]
	);
	assert.deepEqual(result.edges, [
		{ id: 'new-3', fromNode: 'new-1', toNode: 'new-2' }
	]);
});

test('updates a parent linked card when a nested title changes', () => {
	const data = {
		nodes: [
			{ id: 'parent-card', type: 'file', file: 'Nested.canvas' },
			{ id: 'other', type: 'text', text: 'Other' }
		]
	};
	const result = updateLinkedParentCardData(
		data,
		'parent-card',
		'New title',
		'Renamed.canvas'
	);
	assert.equal(result, data);
	assert.deepEqual(result.nodes[0].unknownData, {
		tomindmapTitleOnly: true,
		tomindmapCardKind: 'nested-map',
		tomindmapCardTitle: 'New title'
	});
	assert.equal(result.nodes[0].file, 'Renamed.canvas');
	assert.equal(result.nodes[1].text, 'Other');
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

test('syncs persisted collapse state to nodes and edge groups', () => {
	const makeNode = (id, data = {}) => {
		const shell = {
			classes: new Set(),
			toggleClass(className, enabled) {
				if (enabled) this.classes.add(className);
				else this.classes.delete(className);
			},
			hasClass(className) {
				return this.classes.has(className);
			}
		};
		const node = {
			id,
			data,
			shell,
			nodeEl: {
				closest: () => shell,
				toggleClass(className, enabled) {
					shell.toggleClass(className, enabled);
				}
			},
			getData() {
				return this.data;
			}
		};
		return node;
	};
	const root = makeNode('root', { collapsed: true });
	const child = makeNode('child');
	const edge = {
		from: { node: root },
		to: { node: child },
		lineGroupEl: { style: {} },
		lineEndGroupEl: { style: {} }
	};
	const canvas = {
		nodes: new Map([[root.id, root], [child.id, child]]),
		edges: new Map([['edge', edge]]),
		getData: () => ({ nodes: [{ id: 'root', type: 'text' }, { id: 'child', type: 'text' }] })
	};
	assert.equal(syncCollapsedVisibility(canvas), 1);
	assert.equal(root.shell.classes.has('tomindmap-collapsed-node'), true);
	assert.equal(child.shell.classes.has('tomindmap-collapsed-hidden'), true);
	assert.equal(buildForest(canvas, { includeHidden: false })[0].children.length, 0);
	assert.equal(edge.lineGroupEl.style.display, 'none');
	root.data.collapsed = false;
	assert.equal(syncCollapsedVisibility(canvas), 0);
	assert.equal(root.shell.classes.has('tomindmap-collapsed-node'), false);
	assert.equal(child.shell.classes.has('tomindmap-collapsed-hidden'), false);
	assert.equal(edge.lineGroupEl.style.display, '');
});
