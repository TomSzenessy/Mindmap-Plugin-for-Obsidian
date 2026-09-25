'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	createGestureTracker,
	dispatchTouchAction,
	TouchControlsController,
	TOOLBAR_ACTIONS,
	MENU_ACTIONS,
	ACTION_TITLES
} = require('../lib/touch-controls.js');

function harness(options = {}) {
	const events = [];
	const tracker = createGestureTracker({
		...options,
		onTap: (e) => events.push(['tap', e.target]),
		onDoubleTap: (e) => events.push(['doubletap', e.target]),
		onLongPress: (e) => events.push(['longpress', e.target, e.x, e.y]),
		onDragStart: (e) => events.push(['dragstart', e.target])
	});
	return { tracker, events };
}

test('quick release registers a tap', () => {
	const { tracker, events } = harness();
	tracker.pointerDown('n1', 10, 10);
	assert.equal(tracker.pointerUp(1000), 'tap');
	assert.deepEqual(events, [['tap', 'n1']]);
});

test('two quick taps on the same node fire tap then double tap', () => {
	const { tracker, events } = harness();
	tracker.pointerDown('n1', 10, 10);
	tracker.pointerUp(1000);
	tracker.pointerDown('n1', 12, 11);
	assert.equal(tracker.pointerUp(1100), 'doubletap');
	assert.deepEqual(events, [
		['tap', 'n1'],
		['doubletap', 'n1']
	]);
});

test('touch double tap can open a generated file card', () => {
	let opened = 0;
	let edited = 0;
	const node = { id: 'card', isEditing: false };
	const controller = new TouchControlsController({
		canvas: { nodes: new Map([[node.id, node]]), selection: new Set() },
		actions: { startEditing: () => edited++ },
		isTopicNode: () => true,
		onDoubleTap: () => {
			opened++;
			return true;
		}
	});
	controller.refresh = () => {};
	controller.tracker.pointerDown(node.id, 0, 0);
	controller.tracker.pointerUp(1000);
	controller.tracker.pointerDown(node.id, 0, 0);
	controller.tracker.pointerUp(1100);
	assert.equal(opened, 1);
	assert.equal(edited, 0);
});

test('double tap requires the same target within the window', () => {
	const a = harness();
	a.tracker.pointerDown('n1', 0, 0);
	a.tracker.pointerUp(1000);
	a.tracker.pointerDown('n2', 0, 0);
	assert.equal(a.tracker.pointerUp(1100), 'tap');
	assert.deepEqual(a.events, [
		['tap', 'n1'],
		['tap', 'n2']
	]);

	const b = harness();
	b.tracker.pointerDown('n1', 0, 0);
	b.tracker.pointerUp(1000);
	b.tracker.pointerDown('n1', 0, 0);
	assert.equal(b.tracker.pointerUp(2000), 'tap');
	assert.deepEqual(b.events, [
		['tap', 'n1'],
		['tap', 'n1']
	]);
});

test('holding still fires long press and suppresses the tap', async () => {
	const { tracker, events } = harness({ longPressMs: 20 });
	tracker.pointerDown('n1', 5, 5);
	await new Promise((resolve) => setTimeout(resolve, 40));
	assert.deepEqual(events, [['longpress', 'n1', 5, 5]]);
	assert.equal(tracker.pointerUp(1000), 'longpress');
	assert.deepEqual(events, [['longpress', 'n1', 5, 5]]);
});

test('movement past tolerance turns the gesture into a drag', async () => {
	const { tracker, events } = harness({ longPressMs: 20, moveTolerance: 10 });
	tracker.pointerDown('n1', 0, 0);
	tracker.pointerMove(50, 0);
	assert.deepEqual(events, [['dragstart', 'n1']]);
	await new Promise((resolve) => setTimeout(resolve, 40));
	// No long press after the drag started.
	assert.deepEqual(events, [['dragstart', 'n1']]);
	assert.equal(tracker.pointerUp(1000), 'drag');
	assert.deepEqual(events, [['dragstart', 'n1']]);
});

test('sub-tolerance jitter does not cancel the long press', async () => {
	const { tracker, events } = harness({ longPressMs: 20, moveTolerance: 10 });
	tracker.pointerDown('n1', 0, 0);
	tracker.pointerMove(4, 4);
	await new Promise((resolve) => setTimeout(resolve, 40));
	assert.deepEqual(events, [['longpress', 'n1', 0, 0]]);
});

test('a drag cancels a pending tap target for the next double tap', () => {
	const { tracker, events } = harness();
	tracker.pointerDown('n1', 0, 0);
	tracker.pointerUp(1000);
	tracker.pointerDown('n1', 0, 0);
	tracker.pointerMove(80, 0);
	tracker.pointerUp(1100);
	tracker.pointerDown('n1', 0, 0);
	assert.equal(tracker.pointerUp(1200), 'tap');
	assert.deepEqual(events, [
		['tap', 'n1'],
		['dragstart', 'n1'],
		['tap', 'n1']
	]);
});

test('cancel drops the gesture without callbacks', async () => {
	const { tracker, events } = harness({ longPressMs: 20 });
	tracker.pointerDown('n1', 0, 0);
	tracker.cancel();
	await new Promise((resolve) => setTimeout(resolve, 40));
	tracker.pointerUp(1000);
	assert.deepEqual(events, []);
});

test('a canceled first tap does not combine with the second tap', () => {
	const { tracker, events } = harness();
	tracker.pointerDown(1, 'n1', 0, 0);
	assert.equal(tracker.cancel(1), 'cancelled');
	tracker.pointerDown(1, 'n1', 0, 0);
	assert.equal(tracker.pointerUp(1, 1000), 'tap');
	assert.deepEqual(events, [['tap', 'n1']]);
});

test('routes pointercancel through the tracker instead of committing a tap', () => {
	const listeners = new Map();
	const makeElement = (name = 'toolbar') => ({
		elementName: name,
		style: {},
		children: [],
		className: '',
		setAttribute: () => {},
		appendChild(child) {
			this.children.push(child);
		},
		addEventListener(type, listener) {
			listeners.set(`${this.elementName}:${type}`, listener);
		},
		removeEventListener() {},
		remove() {}
	});
	const wrapper = makeElement('wrapper');
	wrapper.ownerDocument = { createElement: () => makeElement() };
	const node = { id: 'n1', isEditing: false };
	const controller = new TouchControlsController({
		canvas: { wrapperEl: wrapper, nodes: new Map([[node.id, node]]), selection: new Set() },
		actions: { startEditing: () => assert.fail('cancel must not edit') },
		isEnabled: () => true,
		getNodeAtEvent: () => node,
		isTopicNode: () => true
	});
	const detach = controller.attach();
	const event = (type, pointerId) => ({
		type,
		pointerId,
		pointerType: 'touch',
		target: { closest: () => null },
		clientX: 0,
		clientY: 0
	});

	listeners.get('wrapper:pointerdown')(event('pointerdown', 1));
	listeners.get('wrapper:pointercancel')(event('pointercancel', 1));
	listeners.get('wrapper:pointerdown')(event('pointerdown', 1));
	listeners.get('wrapper:pointerup')(event('pointerup', 1));
	detach();
});

test('ignores a secondary pointer and finishes the primary pointer', () => {
	const { tracker, events } = harness();
	assert.equal(tracker.pointerDown(1, 'n1', 0, 0), true);
	assert.equal(tracker.pointerDown(2, 'n2', 40, 40), false);
	assert.equal(tracker.pointerMove(2, 100, 100), false);
	assert.equal(tracker.pointerUp(2, 1000), null);
	assert.equal(tracker.pointerUp(1, 1100), 'tap');
	assert.deepEqual(events, [['tap', 'n1']]);
});

test('dispatchTouchAction routes every menu action onto the shared actions', () => {
	const calls = [];
	const actions = {
		startEditing: (c, n, t) => calls.push(['startEditing', n.id, t]),
		addChild: (c, n) => calls.push(['addChild', n.id]),
		addSibling: (c, n, before) => calls.push(['addSibling', n.id, before]),
		addParent: (c, n) => calls.push(['addParent', n.id]),
		reorderTopic: (c, n, delta) => calls.push(['reorderTopic', n.id, delta]),
		deleteBranch: (c, n) => calls.push(['deleteBranch', n.id]),
		deleteSingleTopic: (c, n) => calls.push(['deleteSingleTopic', n.id])
	};
	const canvas = { id: 'canvas' };
	const node = { id: 'n1' };

	assert.equal(dispatchTouchAction('edit', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('child', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('sibling', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('sibling-above', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('parent', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('move-up', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('move-down', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('delete-branch', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('delete-topic', actions, canvas, node), true);
	assert.equal(dispatchTouchAction('nope', actions, canvas, node), false);
	assert.equal(dispatchTouchAction('edit', null, canvas, node), false);

	assert.deepEqual(calls, [
		['startEditing', 'n1', undefined],
		['addChild', 'n1'],
		['addSibling', 'n1', undefined],
		['addSibling', 'n1', true],
		['addParent', 'n1'],
		['reorderTopic', 'n1', -1],
		['reorderTopic', 'n1', 1],
		['deleteBranch', 'n1'],
		['deleteSingleTopic', 'n1']
	]);
});

test('every action exposes a title and the toolbar is a menu subset', () => {
	for (const name of TOOLBAR_ACTIONS.concat(MENU_ACTIONS)) {
		assert.equal(typeof ACTION_TITLES[name], 'string', name);
	}
	for (const name of TOOLBAR_ACTIONS) {
		if (name !== 'more') {
			assert.ok(MENU_ACTIONS.includes(name), name);
		}
	}
});
