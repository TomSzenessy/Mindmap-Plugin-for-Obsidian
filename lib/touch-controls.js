'use strict';

/**
 * Touch-first controls for mindmap canvases (XMind-style): tap selects (canvas
 * native), double-tap edits, long-press opens the full node menu, drag moves
 * and re-parents (existing pointer drag handler), and a floating bottom
 * toolbar covers every keyboard action with big thumb targets.
 *
 * The gesture tracker is a pure state machine (no DOM) so tests can feed it
 * synthetic points and clocks.
 */

function createGestureTracker(options = {}) {
	const longPressMs = typeof options.longPressMs === 'number' ? options.longPressMs : 450;
	const doubleTapMs = typeof options.doubleTapMs === 'number' ? options.doubleTapMs : 300;
	const moveTolerance = typeof options.moveTolerance === 'number' ? options.moveTolerance : 10;
	const onTap = options.onTap || (() => {});
	const onDoubleTap = options.onDoubleTap || (() => {});
	const onLongPress = options.onLongPress || (() => {});
	const onDragStart = options.onDragStart || (() => {});

	let active = false;
	let target = null;
	let startX = 0;
	let startY = 0;
	let moved = false;
	let longFired = false;
	let timer = null;
	let lastTapTime = 0;
	let lastTapTarget = null;

	const clearTimer = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		pointerDown(targetId, x, y) {
			active = true;
			target = targetId;
			startX = x;
			startY = y;
			moved = false;
			longFired = false;
			clearTimer();
			timer = setTimeout(() => {
				timer = null;
				if (!active || moved) return;
				longFired = true;
				onLongPress({ target, x: startX, y: startY });
			}, longPressMs);
		},
		pointerMove(x, y) {
			if (!active || moved) return;
			if (Math.hypot(x - startX, y - startY) > moveTolerance) {
				moved = true;
				clearTimer();
				// A drag breaks the double-tap window: whatever comes next is
				// a fresh gesture.
				lastTapTime = 0;
				lastTapTarget = null;
				onDragStart({ target });
			}
		},
		pointerUp(now = Date.now()) {
			if (!active) return null;
			active = false;
			clearTimer();
			if (moved) return 'drag';
			if (longFired) return 'longpress';
			const isDouble =
				lastTapTarget === target && now - lastTapTime <= doubleTapMs;
			if (isDouble) {
				lastTapTime = 0;
				lastTapTarget = null;
				onDoubleTap({ target });
				return 'doubletap';
			}
			lastTapTime = now;
			lastTapTarget = target;
			onTap({ target });
			return 'tap';
		},
		cancel() {
			active = false;
			clearTimer();
		}
	};
}

/**
 * Map a named touch action onto the shared action surface (the same methods
 * the keyboard layer calls), so both input modes stay behaviorally identical.
 */
function dispatchTouchAction(name, actions, canvas, node) {
	if (!actions || !canvas || !node) return false;
	switch (name) {
		case 'edit':
			actions.startEditing(canvas, node);
			return true;
		case 'child':
			actions.addChild(canvas, node);
			return true;
		case 'sibling':
			actions.addSibling(canvas, node);
			return true;
		case 'sibling-above':
			actions.addSibling(canvas, node, true);
			return true;
		case 'parent':
			actions.addParent(canvas, node);
			return true;
		case 'move-up':
			actions.reorderTopic(canvas, node, -1);
			return true;
		case 'move-down':
			actions.reorderTopic(canvas, node, 1);
			return true;
		case 'delete-branch':
			actions.deleteBranch(canvas, node);
			return true;
		case 'delete-topic':
			actions.deleteSingleTopic(canvas, node);
			return true;
		default:
			return false;
	}
}

const TOOLBAR_ACTIONS = ['edit', 'child', 'sibling', 'more'];
const MENU_ACTIONS = [
	'edit',
	'child',
	'sibling',
	'sibling-above',
	'parent',
	'move-up',
	'move-down',
	'delete-branch',
	'delete-topic'
];

const ACTION_TITLES = {
	edit: 'Edit topic',
	child: 'Add child topic',
	sibling: 'Add sibling topic',
	more: 'More actions',
	'sibling-above': 'Add sibling topic above',
	parent: 'Add parent topic',
	'move-up': 'Move up',
	'move-down': 'Move down',
	'delete-branch': 'Delete branch',
	'delete-topic': 'Delete only this topic'
};

const ACTION_ICONS = {
	edit: 'pencil',
	child: 'plus',
	sibling: 'corner-down-right',
	more: 'more-horizontal',
	'sibling-above': 'corner-left-up',
	parent: 'corner-up-left',
	'move-up': 'arrow-up',
	'move-down': 'arrow-down',
	'delete-branch': 'trash-2',
	'delete-topic': 'x'
};

class TouchControlsController {
	/**
	 * options:
	 *  - canvas: Obsidian canvas view model
	 *  - actions: shared action surface (KeyboardHandler methods)
	 *  - isEnabled: () => boolean
	 *  - getNodeAtEvent: (event) => node | null
	 *  - Menu, setIcon: optional Obsidian UI constructors
	 *  - buildMenuItems: (menu, node) => void — extra items (node context menu)
	 *  - isTopicNode: (node) => boolean
	 */
	constructor(options) {
		this.canvas = options.canvas;
		this.actions = options.actions;
		this.isEnabled = options.isEnabled || (() => true);
		this.getNodeAtEvent = options.getNodeAtEvent || (() => null);
		this.Menu = options.Menu || null;
		this.setIcon = options.setIcon || null;
		this.buildMenuItems = options.buildMenuItems || (() => {});
		this.onDoubleTap = options.onDoubleTap || null;
		this.isTopicNode =
			options.isTopicNode ||
			((node) => !!node && !!node.nodeEl && typeof node.setText === 'function');
		this.selectedNode = null;
		this.toolbarEl = null;
		this.lastPointerType = null;
		this.longPressOpenedAt = 0;
		this.tracker = createGestureTracker({
			onDoubleTap: ({ target }) => {
				const node = this.resolveNode(target);
				if (node && !node.isEditing) {
					if (!this.onDoubleTap || !this.onDoubleTap(node)) {
						dispatchTouchAction('edit', this.actions, this.canvas, node);
					}
					this.refresh();
				}
			},
			onLongPress: ({ target, x, y }) => {
				const node = this.resolveNode(target);
				if (!node) return;
				this.longPressOpenedAt = Date.now();
				this.openMenu(node, x, y);
			}
		});
	}

	resolveNode(targetId) {
		const node = this.canvas?.nodes?.get?.(targetId);
		return node || null;
	}

	attach() {
		const wrapper = this.canvas?.wrapperEl;
		if (!wrapper) return () => {};
		const doc = wrapper.ownerDocument || document;

		const toolbar = doc.createElement('div');
		toolbar.className = 'tomindmap-touch-toolbar';
		toolbar.style.display = 'none';
		for (const name of TOOLBAR_ACTIONS) {
			const button = doc.createElement('button');
			button.className = 'tomindmap-touch-btn';
			button.setAttribute('data-action', name);
			button.setAttribute('aria-label', ACTION_TITLES[name] || name);
			if (this.setIcon) this.setIcon(button, ACTION_ICONS[name] || 'circle');
			else button.textContent = ACTION_TITLES[name] || name;
			button.addEventListener('pointerdown', (event) => {
				// Keep the canvas from stealing selection on touch.
				event.stopPropagation();
			});
			button.addEventListener('click', (event) => {
				event.stopPropagation();
				event.preventDefault();
				this.onToolbarAction(name);
			});
			toolbar.appendChild(button);
		}
		toolbar.addEventListener('pointerdown', (event) => event.stopPropagation());
		toolbar.addEventListener('click', (event) => event.stopPropagation());
		wrapper.appendChild(toolbar);
		this.toolbarEl = toolbar;

		const onPointerDown = (event) => {
			if (!this.isEnabled()) return;
			if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
			this.lastPointerType = event.pointerType;
			const target = event.target;
			if (
				target?.closest?.(
					'.canvas-node-connection-point, .canvas-node-resizer, .canvas-node-resizers, .tomindmap-touch-toolbar'
				)
			)
				return;
			const node = this.getNodeAtEvent(event);
			if (!node || !this.isTopicNode(node)) return;
			this.tracker.pointerDown(node.id, event.clientX, event.clientY);
		};
		const onPointerMove = (event) => {
			this.tracker.pointerMove(event.clientX, event.clientY);
		};
		const onPointerUp = () => {
			this.tracker.pointerUp();
			// Let the canvas settle its own selection first.
			setTimeout(() => this.refresh(), 0);
		};
		const onContextMenu = (event) => {
			// Android/iOS may synthesize a context menu from a long press; our
			// tracker already opened the full menu — do not stack a second one.
			if (Date.now() - this.longPressOpenedAt < 900) {
				event.preventDefault();
				event.stopPropagation();
			}
		};

		wrapper.addEventListener('pointerdown', onPointerDown, true);
		wrapper.addEventListener('pointermove', onPointerMove, true);
		wrapper.addEventListener('pointerup', onPointerUp, true);
		wrapper.addEventListener('pointercancel', onPointerUp, true);
		wrapper.addEventListener('contextmenu', onContextMenu, true);
		this.refresh();

		return () => {
			wrapper.removeEventListener('pointerdown', onPointerDown, true);
			wrapper.removeEventListener('pointermove', onPointerMove, true);
			wrapper.removeEventListener('pointerup', onPointerUp, true);
			wrapper.removeEventListener('pointercancel', onPointerUp, true);
			wrapper.removeEventListener('contextmenu', onContextMenu, true);
			this.tracker.cancel();
			toolbar.remove();
			this.toolbarEl = null;
			this.selectedNode = null;
		};
	}

	refresh() {
		if (!this.toolbarEl) return;
		const selection = this.canvas?.selection;
		const single =
			selection && selection.size === 1 ? selection.values().next().value : null;
		const node =
			single && this.isTopicNode(single) && !single.isEditing ? single : null;
		this.selectedNode = node;
		this.toolbarEl.style.display = node ? 'flex' : 'none';
	}

	onToolbarAction(name) {
		const node = this.selectedNode;
		if (!node) return;
		if (name === 'more') {
			const rect = this.toolbarEl?.getBoundingClientRect?.();
			this.openMenu(
				node,
				rect ? rect.left + rect.width / 2 : 0,
				rect ? rect.top : 0
			);
			return;
		}
		if (dispatchTouchAction(name, this.actions, this.canvas, node)) {
			this.refresh();
		}
	}

	openMenu(node, x, y) {
		if (!this.Menu) return;
		const menu = new this.Menu();
		for (const name of MENU_ACTIONS) {
			const title = ACTION_TITLES[name];
			const icon = ACTION_ICONS[name];
			menu.addItem((item) => {
				item.setTitle(title);
				if (icon && item.setIcon) item.setIcon(icon);
				item.onClick(() => {
					if (dispatchTouchAction(name, this.actions, this.canvas, node)) {
						this.refresh();
					}
				});
			});
		}
		menu.addSeparator();
		// Fold in everything the plugin contributes to the canvas node menu
		// (copy link, separate branch, collapse, colors, ...).
		this.buildMenuItems(menu, node);
		menu.showAtPosition({ x, y });
	}
}

module.exports = {
	createGestureTracker,
	dispatchTouchAction,
	TouchControlsController,
	TOOLBAR_ACTIONS,
	MENU_ACTIONS,
	ACTION_TITLES
};
