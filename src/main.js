/*
ToMindMap distributable bundle.
Focused runtime source modules live in lib/ and are embedded here by
scripts/inline-runtime-modules.js for Obsidian's three-file plugin format.
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
	for (var name in all)
		__defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
	if ((from && typeof from === 'object') || typeof from === 'function') {
		for (let key of __getOwnPropNames(from))
			if (!__hasOwnProp.call(to, key) && key !== except)
				__defProp(to, key, {
					get: () => from[key],
					enumerable:
						!(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
	}
	return to;
};
var __toCommonJS = (mod) =>
	__copyProps(__defProp({}, '__esModule', { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
	default: () => CanvasMindMapPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require('obsidian');
var {
	flushCanvasView,
	reflowCanvasAfterMove
} = require('./lib/canvas-session.js');
var {
	CARD_LAYOUT_VERSION,
	LiveSizingController,
	hasAsyncRenderableContent,
	isResizableCanvasNode,
	isTextTopicCard
} = require('./lib/live-sizing.js');
var MarkdownOrder = require('./lib/markdown-order.js');
var { normalizeClipboardMarkdown } = require('./lib/clipboard-markdown.js');
var {
	createExportMindMapModal,
	rasterizeSvg,
	saveToDownloads
} = require('./lib/export.js');
var ExportMindMapModal = createExportMindMapModal(import_obsidian5.Modal);

var { CanvasAPI, findNodeFromEvent, genId } = require('./lib/canvas-api.js');

// src/mindmap/tree-model.ts
var {
	buildForest,
	getGroupIds,
	findTreeForNode,
	countReachable,
	setDepths,
	findTreeNode,
	getDescendants,
	assignDirections,
	propagateDirection,
	countChildrenPerSide
} = require('./lib/tree-model.js');

var { NodeOperations } = require('./lib/node-operations.js');

var {
	LayoutEngine,
	BranchColors,
	computeEdgeSides,
	registerDragEndHandler,
	updateAllEdgeSides
} = require('./lib/layout.js');

var { KeyboardHandler, Navigation } = require('./lib/keyboard-navigation.js');

// src/settings.ts
var import_obsidian3 = require('obsidian');
var { DEFAULT_SETTINGS, normalizeSettings } = require('./lib/settings.js');
var MediaDrop = require('./lib/media-drop.js');
var TreeDrag = require('./lib/tree-drag.js');
var {
	createDragAttachmentController
} = require('./lib/drag-preview-controller.js');
var MindmapActions = require('./lib/mindmap-actions.js');
var MindMapSettingTab = class extends import_obsidian3.PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
		const debouncedSave = (0, import_obsidian3.debounce)(async () => {
			await this.plugin.saveSettings();
		}, 500);
		new import_obsidian3.Setting(containerEl)
			.setName('Default mindmap mode')
			.setDesc(
				'Whether canvases default to mindmap mode (can be toggled per canvas)'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.defaultMindmapMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultMindmapMode = value;
						await this.plugin.saveSettings();
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Keyboard workflow')
			.setDesc(
				'Type to edit · Enter creates a sibling (or saves while editing) · Shift+Enter creates a sibling above (or a line break while editing) · Tab creates a child · Arrows navigate · Delete removes a branch · Mod+Delete removes only the topic · Mod+Enter inserts a parent · Alt+Up/Down reorders · Mod+F searches the outline · F2 edits · Mod+R selects the root.'
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Auto-color branches')
			.setDesc('Assign distinct colors to top-level branches')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoColor)
					.onChange(async (value) => {
						this.plugin.settings.autoColor = value;
						await this.plugin.saveSettings();
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Horizontal gap')
			.setDesc('Space between parent and child nodes (px)')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.horizontalGap))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.horizontalGap = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Vertical gap')
			.setDesc('Space between sibling nodes (px)')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.verticalGap))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.verticalGap = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Default node width')
			.setDesc('Width of newly created nodes (px)')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultNodeWidth))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultNodeWidth = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Minimum automatic width')
			.setDesc('Smallest card width used by automatic layout (px)')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.minNodeWidth))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.minNodeWidth = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Maximum auto width')
			.setDesc(
				'Generous safety limit for exceptionally wide content (px)'
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxNodeWidth))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxNodeWidth = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Default node height')
			.setDesc('Height of newly created nodes (px)')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultNodeHeight))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultNodeHeight = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Maximum auto height')
			.setDesc(
				'Generous safety limit for exceptionally tall content (px)'
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxNodeHeight))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxNodeHeight = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Mouse back/forward navigation')
			.setDesc(
				"Use mouse back/forward buttons for in-canvas navigation instead of Obsidian's default note navigation"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.mouseNavigation)
					.onChange(async (value) => {
						this.plugin.settings.mouseNavigation = value;
						await this.plugin.saveSettings();
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Wrap arrow navigation')
			.setDesc(
				'At the edge of the map, continue from the opposite edge instead of stopping.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.wrapArrowNavigation)
					.onChange(async (value) => {
						this.plugin.settings.wrapArrowNavigation = value;
						await this.plugin.saveSettings();
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Arrow corridor buffer')
			.setDesc(
				'Extra tolerance around the straight navigation line. Outside it, the directional wedge uses the corners of the complete map bounds.'
			)
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.navigationCrossAxisBuffer)
					)
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.navigationCrossAxisBuffer =
								num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Navigation zoom padding')
			.setDesc(
				'Extra space around the target node when zooming after navigation (px). 0 = tight zoom.'
			)
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.navigationZoomPadding)
					)
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.navigationZoomPadding = num;
							debouncedSave();
						}
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Markmap export frontmatter')
			.setDesc(
				'Include portable Markmap YAML options in new Markdown exports. Frontmatter imported from a file is always preserved.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.exportMarkmapFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.exportMarkmapFrontmatter = value;
						await this.plugin.saveSettings();
					})
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Markmap color freeze level')
			.setDesc(
				'Default colorFreezeLevel written to new Markmap Markdown exports (0–10).'
			)
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.markmapColorFreezeLevel)
					)
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0 && num <= 10) {
							this.plugin.settings.markmapColorFreezeLevel = num;
							debouncedSave();
						}
					})
			);
	}
};

// src/canvas/subtree-drag.ts
function collectDescendants(canvas, canvasApi, nodeId) {
	const result = [];
	const visited = /* @__PURE__ */ new Set([nodeId]);
	const queue = [nodeId];
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const id = queue[cursor];
		for (const edge of canvasApi.getOutgoingEdges(canvas, id)) {
			const childId = edge.to.node.id;
			if (!visited.has(childId)) {
				visited.add(childId);
				result.push(edge.to.node);
				queue.push(childId);
			}
		}
	}
	return result;
}
function registerSubtreeDragHandler(
	canvas,
	canvasApi,
	onDragEnd,
	enabled = () => true
) {
	var _a, _b, _c;
	let draggedNode = null;
	let cachedDescendants = null;
	let originalMoveTo = null;
	let dragStartX = 0;
	let dragStartY = 0;
	function installWrapper(node) {
		const descendants = collectDescendants(canvas, canvasApi, node.id);
		draggedNode = node;
		cachedDescendants = descendants;
		dragStartX = node.x;
		dragStartY = node.y;
		if (descendants.length === 0) return;
		const proto = Object.getPrototypeOf(node);
		originalMoveTo = proto.moveTo.bind(node);
		node.moveTo = (pos) => {
			const dx = pos.x - node.x;
			const dy = pos.y - node.y;
			originalMoveTo(pos);
			for (const desc of cachedDescendants) {
				const descProto = Object.getPrototypeOf(desc);
				descProto.moveTo.call(desc, { x: desc.x + dx, y: desc.y + dy });
			}
		};
	}
	function clearDragSession() {
		if (draggedNode && originalMoveTo) {
			delete draggedNode.moveTo;
		}
		draggedNode = null;
		cachedDescendants = null;
		originalMoveTo = null;
		dragStartX = 0;
		dragStartY = 0;
	}
	const downHandler = (e) => {
		if (!enabled()) return;
		if (draggedNode) clearDragSession();
		const node = findNodeFromEvent(canvas, e);
		if (node) {
			installWrapper(node);
		}
	};
	const moveHandler = (e) => {
		if (!enabled()) {
			clearDragSession();
			return;
		}
		if (e.buttons === 0) return;
		if (!draggedNode) {
			const node = canvasApi.getSelectedNode(canvas);
			if (node) installWrapper(node);
			if (!draggedNode) return;
		}
		const currentSelected = canvasApi.getSelectedNode(canvas);
		if (!currentSelected || currentSelected.id !== draggedNode.id) {
			clearDragSession();
		}
	};
	const upHandler = () => {
		if (!draggedNode) return;
		if (!enabled()) {
			clearDragSession();
			return;
		}
		const completedNode = draggedNode;
		const moved =
			Math.abs(completedNode.x - dragStartX) > 0.5 ||
			Math.abs(completedNode.y - dragStartY) > 0.5;
		canvas.requestSave();
		clearDragSession();
		if (moved && onDragEnd) onDragEnd(completedNode);
	};
	(_a = canvas.wrapperEl) == null
		? void 0
		: _a.addEventListener('pointerdown', downHandler, true);
	(_b = canvas.wrapperEl) == null
		? void 0
		: _b.addEventListener('pointermove', moveHandler);
	(_c = canvas.wrapperEl) == null
		? void 0
		: _c.addEventListener('pointerup', upHandler);
	return () => {
		var _a2, _b2, _c2;
		clearDragSession();
		(_a2 = canvas.wrapperEl) == null
			? void 0
			: _a2.removeEventListener('pointerdown', downHandler, true);
		(_b2 = canvas.wrapperEl) == null
			? void 0
			: _b2.removeEventListener('pointermove', moveHandler);
		(_c2 = canvas.wrapperEl) == null
			? void 0
			: _c2.removeEventListener('pointerup', upHandler);
	};
}

// src/canvas/group-drag.ts
function identifyStrangers(canvas, canvasApi, group, groupIds) {
	const gx = group.x;
	const gy = group.y;
	const gw = group.width;
	const gh = group.height;
	const insideIds = /* @__PURE__ */ new Set();
	const insideNodes = /* @__PURE__ */ new Map();
	for (const node of canvas.nodes.values()) {
		if (groupIds.has(node.id)) continue;
		const cx = node.x + node.width / 2;
		const cy = node.y + node.height / 2;
		if (cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh) {
			insideIds.add(node.id);
			insideNodes.set(node.id, node);
		}
	}
	const strangerIds = /* @__PURE__ */ new Set();
	for (const nodeId of insideIds) {
		const node = insideNodes.get(nodeId);
		const parent = canvasApi.getParentNode(canvas, node);
		if (parent && !insideIds.has(parent.id)) {
			const queue = [nodeId];
			strangerIds.add(nodeId);
			for (let cursor = 0; cursor < queue.length; cursor++) {
				const id = queue[cursor];
				for (const edge of canvasApi.getOutgoingEdges(canvas, id)) {
					const childId = edge.to.node.id;
					if (!strangerIds.has(childId) && insideIds.has(childId)) {
						strangerIds.add(childId);
						queue.push(childId);
					}
				}
			}
		}
	}
	return Array.from(strangerIds).map((id) => insideNodes.get(id));
}
function registerGroupDragHandler(canvas, canvasApi, enabled = () => true) {
	var _a, _b;
	const frozenNodes = [];
	const downHandler = (e) => {
		if (!enabled()) return;
		if (!e.altKey) return;
		const node = findNodeFromEvent(canvas, e);
		if (!node) return;
		const groupIds = getGroupIds(canvas);
		if (!groupIds.has(node.id)) return;
		const strangers = identifyStrangers(canvas, canvasApi, node, groupIds);
		for (const stranger of strangers) {
			frozenNodes.push(stranger);
			stranger.moveTo = () => {};
		}
	};
	const upHandler = () => {
		if (frozenNodes.length === 0) return;
		for (const node of frozenNodes) {
			delete node.moveTo;
		}
		frozenNodes.length = 0;
		canvas.requestSave();
	};
	(_a = canvas.wrapperEl) == null
		? void 0
		: _a.addEventListener('pointerdown', downHandler, true);
	(_b = canvas.wrapperEl) == null
		? void 0
		: _b.addEventListener('pointerup', upHandler);
	return () => {
		var _a2, _b2;
		if (frozenNodes.length > 0) {
			for (const node of frozenNodes) {
				delete node.moveTo;
			}
			frozenNodes.length = 0;
		}
		(_a2 = canvas.wrapperEl) == null
			? void 0
			: _a2.removeEventListener('pointerdown', downHandler, true);
		(_b2 = canvas.wrapperEl) == null
			? void 0
			: _b2.removeEventListener('pointerup', upHandler);
	};
}

// src/ui/auto-resize.ts
function getEditorElements(node) {
	var _a;
	const iframe =
		(_a = node.contentEl) == null ? void 0 : _a.querySelector('iframe');
	if (!(iframe == null ? void 0 : iframe.contentDocument))
		return { iframe: null, scroller: null, cmContent: null };
	const scroller = iframe.contentDocument.querySelector('.cm-scroller');
	const cmContent = iframe.contentDocument.querySelector('.cm-content');
	return { iframe, scroller, cmContent };
}
function registerAutoResize(canvas, config, onEditExit) {
	var _a, _b, _c;
	let activeNode = null;
	function startWatching(node) {
		if (typeof config.enabled === 'function' && !config.enabled()) return;
		if (node.nodeEl)
			node.nodeEl.removeClass('tomindmap-navigation-selected');
		activeNode = node;
	}
	function stopWatching(triggerRelayout = true) {
		if (!activeNode) return;
		const node = activeNode;
		activeNode = null;
		if (triggerRelayout && onEditExit) {
			onEditExit(canvas, node);
		}
	}
	const focusInHandler = (e) => {
		var _a2;
		const target = e.target;
		const nodeEl =
			(_a2 = target == null ? void 0 : target.closest) == null
				? void 0
				: _a2.call(target, '.canvas-node');
		if (!nodeEl) return;
		for (const node of canvas.nodes.values()) {
			if (
				node.nodeEl === nodeEl &&
				node.isEditing &&
				node !== activeNode
			) {
				if (activeNode) stopWatching();
				startWatching(node);
				return;
			}
		}
	};
	const focusOutHandler = () => {
		if (!activeNode) return;
		setTimeout(() => {
			if (activeNode && !activeNode.isEditing) {
				stopWatching();
			}
		}, 50);
	};
	const pointerHandler = (e) => {
		var _a2;
		if (!activeNode) return;
		if ((_a2 = activeNode.nodeEl) == null ? void 0 : _a2.contains(e.target))
			return;
		setTimeout(() => {
			if (activeNode && !activeNode.isEditing) {
				stopWatching();
			}
		}, 50);
	};
	(_a = canvas.wrapperEl) == null
		? void 0
		: _a.addEventListener('focusin', focusInHandler);
	(_b = canvas.wrapperEl) == null
		? void 0
		: _b.addEventListener('focusout', focusOutHandler);
	(_c = canvas.wrapperEl) == null
		? void 0
		: _c.addEventListener('pointerdown', pointerHandler);
	return {
		cleanup: () => {
			var _a2, _b2, _c2;
			if (activeNode) stopWatching(false);
			(_a2 = canvas.wrapperEl) == null
				? void 0
				: _a2.removeEventListener('focusin', focusInHandler);
			(_b2 = canvas.wrapperEl) == null
				? void 0
				: _b2.removeEventListener('focusout', focusOutHandler);
			(_c2 = canvas.wrapperEl) == null
				? void 0
				: _c2.removeEventListener('pointerdown', pointerHandler);
		},
		finalizeNode: () => {
			if (activeNode) stopWatching(false);
		}
	};
}

// src/ui/outline-view.ts
var import_obsidian4 = require('obsidian');
var OUTLINE_VIEW_TYPE = 'tomindmap-outline';
var OutlineView = class extends import_obsidian4.ItemView {
	constructor(leaf) {
		super(leaf);
		this.canvasLeaf = null;
		this.collapsedGroups = /* @__PURE__ */ new Set();
		this.collapsedNodes = /* @__PURE__ */ new Set();
		this.selectedRoots = /* @__PURE__ */ new Set();
		this.lastCanvas = null;
		this.groupIds = [];
		this.collapsibleNodeIds = [];
		this.draggedRoot = null;
		this.dragSourceGroupId = null;
		this.activeNodeId = null;
		this.allItemEls = /* @__PURE__ */ new Map();
		this.groupElMap = /* @__PURE__ */ new Map();
		this.searchQuery = '';
		this.navHeaderEl = null;
		this.collapseBtnEl = null;
		this.searchContainerEl = null;
		this.searchComponent = null;
		this.zoomPadding = 0;
		this.onForestLayout = null;
	}
	getViewType() {
		return OUTLINE_VIEW_TYPE;
	}
	getDisplayText() {
		return 'Map outline';
	}
	getIcon() {
		return 'list-tree';
	}
	onOpen() {
		this.contentEl.addClass('tomindmap-outline');
		const navHeader = this.containerEl.createDiv({ cls: 'nav-header' });
		this.containerEl.insertBefore(navHeader, this.contentEl);
		this.navHeaderEl = navHeader;
		const navButtons = navHeader.createDiv({
			cls: 'nav-buttons-container'
		});
		const searchBtn = navButtons.createDiv({
			cls: 'clickable-icon nav-action-button',
			attr: { 'aria-label': 'Search' }
		});
		(0, import_obsidian4.setIcon)(searchBtn, 'search');
		this.collapseBtnEl = navButtons.createDiv({
			cls: 'clickable-icon nav-action-button',
			attr: { 'aria-label': 'Collapse all' }
		});
		(0, import_obsidian4.setIcon)(this.collapseBtnEl, 'chevrons-down-up');
		this.collapseBtnEl.addEventListener('click', () => {
			if (!this.lastCanvas) return;
			const hasCollapsibleItems =
				this.groupIds.length > 0 || this.collapsibleNodeIds.length > 0;
			const allCollapsed =
				hasCollapsibleItems &&
				this.groupIds.every((id) => this.collapsedGroups.has(id)) &&
				this.collapsibleNodeIds.every((id) =>
					this.collapsedNodes.has(id)
				);
			if (allCollapsed) {
				this.collapsedGroups.clear();
				this.collapsedNodes.clear();
			} else {
				for (const id of this.groupIds) this.collapsedGroups.add(id);
				for (const id of this.collapsibleNodeIds)
					this.collapsedNodes.add(id);
			}
			this.refresh(this.lastCanvas);
		});
		this.searchContainerEl = navHeader.createDiv({
			cls: 'tomindmap-outline-search-container'
		});
		this.searchContainerEl.hide();
		this.searchComponent = new import_obsidian4.SearchComponent(
			this.searchContainerEl
		);
		this.searchComponent.setPlaceholder('Filter...');
		this.searchComponent.onChange((value) => {
			this.searchQuery = value;
			this.applyFilter();
		});
		searchBtn.addEventListener('click', () => {
			if (!this.searchContainerEl || !this.searchComponent) return;
			if (this.searchContainerEl.isShown()) {
				this.searchContainerEl.hide();
				this.searchQuery = '';
				this.searchComponent.setValue('');
				this.applyFilter();
			} else {
				this.searchContainerEl.show();
				this.searchComponent.inputEl.focus();
			}
		});
		return Promise.resolve();
	}
	onClose() {
		this.clear();
		if (this.navHeaderEl) {
			this.navHeaderEl.remove();
			this.navHeaderEl = null;
		}
		this.collapseBtnEl = null;
		this.searchContainerEl = null;
		this.searchComponent = null;
		return Promise.resolve();
	}
	openSearch() {
		if (!this.searchContainerEl || !this.searchComponent) return;
		this.searchContainerEl.show();
		this.searchComponent.inputEl.focus();
		this.searchComponent.inputEl.select();
	}
	/**
	 * Rebuild the outline from the current canvas state.
	 */
	refresh(canvas) {
		var _a;
		this.contentEl.empty();
		this.selectedRoots.clear();
		this.groupElMap.clear();
		this.allItemEls.clear();
		this.lastCanvas = canvas;
		this.canvasLeaf =
			(_a = this.app.workspace.getLeavesOfType('canvas').find((l) => {
				var _a2;
				return (
					((_a2 = l.view) == null ? void 0 : _a2.canvas) === canvas
				);
			})) != null
				? _a
				: null;
		if (this.searchComponent) {
			this.searchComponent.setValue(this.searchQuery);
		}
		const forest = buildForest(canvas);
		this.collapsibleNodeIds = [];
		const collectCollapsibleNodes = (topic) => {
			if (topic.children.length > 0)
				this.collapsibleNodeIds.push(topic.canvasNode.id);
			for (const child of topic.children) collectCollapsibleNodes(child);
		};
		for (const root of forest) collectCollapsibleNodes(root);
		if (forest.length === 0) {
			this.contentEl.createDiv({
				cls: 'tomindmap-outline-empty',
				text: 'No root nodes'
			});
			return;
		}
		const groups = [];
		for (const nd of canvas.getData().nodes) {
			if (nd.type !== 'group') continue;
			const node = canvas.nodes.get(nd.id);
			if (!node) continue;
			groups.push({
				node,
				label: (nd.label || '').trim() || 'Untitled Group',
				area: node.width * node.height,
				roots: []
			});
		}
		groups.sort((a, b) => {
			const dy = a.node.y - b.node.y;
			if (Math.abs(dy) > 50) return dy;
			return a.node.x - b.node.x;
		});
		const ungrouped = [];
		for (const root of forest) {
			const cx = root.canvasNode.x + root.canvasNode.width / 2;
			const cy = root.canvasNode.y + root.canvasNode.height / 2;
			let bestGroup = null;
			for (const g of groups) {
				if (
					cx >= g.node.x &&
					cx <= g.node.x + g.node.width &&
					cy >= g.node.y &&
					cy <= g.node.y + g.node.height
				) {
					if (!bestGroup || g.area < bestGroup.area) {
						bestGroup = g;
					}
				}
			}
			if (bestGroup) {
				bestGroup.roots.push(root);
			} else {
				ungrouped.push(root);
			}
		}
		const ungroupedZone = this.contentEl.createDiv({
			cls: 'tomindmap-outline-ungrouped-zone'
		});
		ungroupedZone.addEventListener('dragover', (e) => {
			if (!this.draggedRoot || !this.dragSourceGroupId) return;
			e.preventDefault();
			ungroupedZone.addClass('is-drag-over');
		});
		ungroupedZone.addEventListener('dragleave', () => {
			ungroupedZone.removeClass('is-drag-over');
		});
		ungroupedZone.addEventListener('drop', (e) => {
			e.preventDefault();
			ungroupedZone.removeClass('is-drag-over');
			if (
				!this.draggedRoot ||
				!this.dragSourceGroupId ||
				!this.lastCanvas
			)
				return;
			this.ungroupTree(this.draggedRoot, this.dragSourceGroupId);
			this.draggedRoot = null;
			this.dragSourceGroupId = null;
		});
		for (const root of ungrouped) {
			this.renderRootItem(ungroupedZone, root, canvas, true);
		}
		for (const group of groups) {
			if (group.roots.length === 0) continue;
			this.renderGroup(group, canvas);
		}
		this.groupIds = groups
			.filter((g) => g.roots.length > 0)
			.map((g) => g.node.id);
		const hasCollapsibleItems =
			this.groupIds.length > 0 || this.collapsibleNodeIds.length > 0;
		const allCollapsed =
			hasCollapsibleItems &&
			this.groupIds.every((id) => this.collapsedGroups.has(id)) &&
			this.collapsibleNodeIds.every((id) => this.collapsedNodes.has(id));
		if (this.collapseBtnEl) {
			(0, import_obsidian4.setIcon)(
				this.collapseBtnEl,
				allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up'
			);
			this.collapseBtnEl.setAttribute(
				'aria-label',
				allCollapsed ? 'Expand all' : 'Collapse all'
			);
		}
		if (this.searchQuery) this.applyFilter();
		if (this.activeNodeId) {
			const el = this.allItemEls.get(this.activeNodeId);
			if (el) el.addClass('is-active');
		}
	}
	applyFilter() {
		const q = this.searchQuery.toLowerCase().trim();
		const items = Array.from(
			this.contentEl.querySelectorAll('.tree-item')
		).reverse();
		for (const item of items) {
			const label = item.querySelector(
				':scope > .tree-item-self .tree-item-inner'
			);
			const itemSelf = item.querySelector(':scope > .tree-item-self');
			const searchableText = (
				itemSelf?.getAttribute('data-tomindmap-search-text') ||
				label?.textContent ||
				''
			).toLowerCase();
			const ownMatch = q === '' || searchableText.includes(q);
			const children = Array.from(
				item.querySelectorAll(
					':scope > .tree-item-children > .tree-item'
				)
			);
			const descendantMatch = children.some(
				(child) => !child.hasClass('is-hidden')
			);
			const visible = ownMatch || descendantMatch;
			item.toggleClass('is-hidden', !visible);
			if (q && descendantMatch) item.removeClass('is-collapsed');
			if (!q) {
				const collapseId = item.getAttribute(
					'data-tomindmap-collapse-id'
				);
				const collapseKind = item.getAttribute(
					'data-tomindmap-collapse-kind'
				);
				const collapsed =
					collapseKind === 'group'
						? this.collapsedGroups.has(collapseId)
						: this.collapsedNodes.has(collapseId);
				item.toggleClass('is-collapsed', !!collapseId && collapsed);
			}
		}
	}
	/**
	 * Render a single root node as a tree-item.
	 */
	renderRootItem(container, root, canvas, isUngrouped, groupId) {
		const rootMarkdown = canvasNodeMarkdownText(root.canvasNode);
		const rootLabel = getRootTitle(rootMarkdown);
		const isCollapsed = this.collapsedNodes.has(root.canvasNode.id);
		const treeItem = container.createDiv({
			cls: `tree-item${isCollapsed ? ' is-collapsed' : ''}`
		});
		treeItem.setAttribute('data-tomindmap-collapse-id', root.canvasNode.id);
		treeItem.setAttribute('data-tomindmap-collapse-kind', 'node');
		const self = treeItem.createDiv({
			cls: 'tree-item-self is-clickable tomindmap-outline-item',
			attr: { 'data-tomindmap-search-text': rootLabel }
		});
		const branchIcon = self.createDiv({
			cls: 'tree-item-icon tomindmap-outline-branch-icon'
		});
		(0, import_obsidian4.setIcon)(
			branchIcon,
			root.children.length > 0 ? 'right-triangle' : 'minus'
		);
		if (root.children.length > 0) {
			branchIcon.addClass('collapse-icon');
			branchIcon.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				const collapse = !treeItem.hasClass('is-collapsed');
				treeItem.toggleClass('is-collapsed', collapse);
				if (collapse) this.collapsedNodes.add(root.canvasNode.id);
				else this.collapsedNodes.delete(root.canvasNode.id);
			});
		}
		const dragHandle = self.createDiv({
			cls: 'tree-item-icon tomindmap-outline-drag-handle'
		});
		(0, import_obsidian4.setIcon)(dragHandle, 'grip-vertical');
		self.createDiv({
			cls: 'tree-item-inner',
			text: rootLabel
		});
		let dragAllowed = false;
		dragHandle.addEventListener('pointerdown', () => {
			dragAllowed = true;
		});
		self.addEventListener('pointerup', () => {
			dragAllowed = false;
		});
		self.setAttribute('draggable', 'true');
		self.addEventListener('dragstart', (e) => {
			var _a;
			if (!dragAllowed) {
				e.preventDefault();
				return;
			}
			dragAllowed = false;
			this.draggedRoot = root;
			this.dragSourceGroupId = groupId != null ? groupId : null;
			self.addClass('is-dragging');
			(_a = e.dataTransfer) == null
				? void 0
				: _a.setData('text/plain', root.canvasNode.id);
		});
		self.addEventListener('dragend', () => {
			self.removeClass('is-dragging');
			this.draggedRoot = null;
			this.dragSourceGroupId = null;
			for (const [, el] of this.groupElMap) {
				el.removeClass('is-drag-over');
			}
		});
		this.allItemEls.set(root.canvasNode.id, self);
		self.addEventListener('click', (e) => {
			if (isUngrouped && e.ctrlKey) {
				if (this.selectedRoots.has(root)) {
					this.selectedRoots.delete(root);
					self.removeClass('is-selected');
				} else {
					this.selectedRoots.add(root);
					self.addClass('is-selected');
				}
				return;
			}
			this.clearSelection();
			this.setActiveItem(root.canvasNode.id);
			if (this.canvasLeaf) {
				this.app.workspace.setActiveLeaf(this.canvasLeaf, {
					focus: true
				});
			}
			const node = root.canvasNode;
			canvas.selectOnly(node);
			const pad = this.zoomPadding;
			const cx = node.x + node.width / 2;
			const cy = node.y + node.height / 2;
			canvas.zoomToBbox({
				minX: cx - pad,
				minY: cy - pad,
				maxX: cx + pad,
				maxY: cy + pad
			});
		});
		self.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new import_obsidian4.Menu();
			menu.addItem((item) => {
				item.setTitle('Copy node link')
					.setIcon('link')
					.onClick(() => {
						const canvasPath = canvas.view.file.path;
						const node = root.canvasNode;
						if (node.file) {
							const vaultName = this.app.vault.getName();
							void navigator.clipboard.writeText(
								`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(node.file)}`
							);
						} else if (node.url) {
							void navigator.clipboard.writeText(node.url);
						} else {
							void navigator.clipboard.writeText(
								`obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${node.id}`
							);
						}
						new import_obsidian4.Notice('Node link copied');
					});
			});
			if (isUngrouped) {
				if (!this.selectedRoots.has(root)) {
					this.clearSelection();
					this.selectedRoots.add(root);
					self.addClass('is-selected');
				}
				const count = this.selectedRoots.size;
				menu.addItem((item) => {
					item.setTitle(
						`Create group (${count} root${count > 1 ? 's' : ''})`
					)
						.setIcon('group')
						.onClick(() => this.createGroupFromSelection());
				});
			}
			menu.showAtMouseEvent(e);
		});
		if (root.children.length > 0) {
			const childrenContainer = treeItem.createDiv({
				cls: 'tree-item-children'
			});
			for (const child of root.children) {
				this.renderTopicItem(childrenContainer, child, canvas);
			}
		}
	}
	/**
	 * Render every nested topic recursively, not just the central topic.
	 */
	renderTopicItem(container, topic, canvas) {
		const topicMarkdown = canvasNodeMarkdownText(topic.canvasNode);
		const topicLabel = getRootTitle(topicMarkdown);
		const isCollapsed = this.collapsedNodes.has(topic.canvasNode.id);
		const treeItem = container.createDiv({
			cls: `tree-item${isCollapsed ? ' is-collapsed' : ''}`
		});
		treeItem.setAttribute(
			'data-tomindmap-collapse-id',
			topic.canvasNode.id
		);
		treeItem.setAttribute('data-tomindmap-collapse-kind', 'node');
		const self = treeItem.createDiv({
			cls: 'tree-item-self is-clickable tomindmap-outline-item',
			attr: { 'data-tomindmap-search-text': topicLabel }
		});
		const branchIcon = self.createDiv({
			cls: 'tree-item-icon tomindmap-outline-branch-icon'
		});
		(0, import_obsidian4.setIcon)(
			branchIcon,
			topic.children.length > 0 ? 'right-triangle' : 'minus'
		);
		if (topic.children.length > 0) {
			branchIcon.addClass('collapse-icon');
			branchIcon.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				const collapse = !treeItem.hasClass('is-collapsed');
				treeItem.toggleClass('is-collapsed', collapse);
				if (collapse) this.collapsedNodes.add(topic.canvasNode.id);
				else this.collapsedNodes.delete(topic.canvasNode.id);
			});
		}
		self.createDiv({
			cls: 'tree-item-inner',
			text: topicLabel
		});
		this.allItemEls.set(topic.canvasNode.id, self);
		self.addEventListener('click', (event) => {
			event.stopPropagation();
			this.clearSelection();
			this.setActiveItem(topic.canvasNode.id);
			if (this.canvasLeaf) {
				this.app.workspace.setActiveLeaf(this.canvasLeaf, {
					focus: true
				});
			}
			this.canvasApiSelectAndReveal(canvas, topic.canvasNode);
		});
		self.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			event.stopPropagation();
			const menu = new import_obsidian4.Menu();
			menu.addItem((item) => {
				item.setTitle('Copy node link')
					.setIcon('link')
					.onClick(() => {
						const canvasPath = canvas.view.file.path;
						const node = topic.canvasNode;
						if (node.file) {
							const vaultName = this.app.vault.getName();
							void navigator.clipboard.writeText(
								`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(node.file)}`
							);
						} else if (node.url) {
							void navigator.clipboard.writeText(node.url);
						} else {
							void navigator.clipboard.writeText(
								`obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${node.id}`
							);
						}
						new import_obsidian4.Notice('Node link copied');
					});
			});
			menu.showAtMouseEvent(event);
		});
		if (topic.children.length > 0) {
			const childrenContainer = treeItem.createDiv({
				cls: 'tree-item-children'
			});
			for (const child of topic.children) {
				this.renderTopicItem(childrenContainer, child, canvas);
			}
		}
	}
	canvasApiSelectAndReveal(canvas, node) {
		canvas.selectOnly(node);
		const pad = Math.max(40, this.zoomPadding);
		const cx = node.x + node.width / 2;
		const cy = node.y + node.height / 2;
		canvas.zoomToBbox({
			minX: cx - pad,
			minY: cy - pad,
			maxX: cx + pad,
			maxY: cy + pad
		});
	}
	clearSelection() {
		var _a;
		for (const root of this.selectedRoots) {
			(_a = this.allItemEls.get(root.canvasNode.id)) == null
				? void 0
				: _a.removeClass('is-selected');
		}
		this.selectedRoots.clear();
	}
	setActiveItem(nodeId) {
		var _a;
		if (this.activeNodeId) {
			(_a = this.allItemEls.get(this.activeNodeId)) == null
				? void 0
				: _a.removeClass('is-active');
		}
		this.activeNodeId = nodeId;
		const el = this.allItemEls.get(nodeId);
		el == null ? void 0 : el.addClass('is-active');
		el == null ? void 0 : el.scrollIntoView({ block: 'nearest' });
	}
	clearActiveItem() {
		var _a;
		if (this.activeNodeId) {
			(_a = this.allItemEls.get(this.activeNodeId)) == null
				? void 0
				: _a.removeClass('is-active');
		}
		this.activeNodeId = null;
	}
	/**
	 * Sync outline highlight from the current canvas selection.
	 */
	syncHighlightFromCanvas(canvas) {
		if (canvas.selection.size !== 1) {
			this.clearActiveItem();
			return;
		}
		const item = canvas.selection.values().next().value;
		if (!item || !('nodeEl' in item)) {
			this.clearActiveItem();
			return;
		}
		const nodeId = item.id;
		if (this.allItemEls.has(nodeId)) {
			this.setActiveItem(nodeId);
		} else {
			this.clearActiveItem();
		}
	}
	createGroupFromSelection() {
		const canvas = this.lastCanvas;
		if (!canvas || this.selectedRoots.size === 0) return;
		const allNodes = [];
		for (const root of this.selectedRoots) {
			allNodes.push(root.canvasNode);
			for (const desc of getDescendants(root)) {
				allNodes.push(desc.canvasNode);
			}
		}
		const PADDING = 20;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const node of allNodes) {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		}
		minX -= PADDING;
		minY -= PADDING;
		maxX += PADDING;
		maxY += PADDING;
		const group = canvas.createGroupNode({
			pos: { x: minX, y: minY },
			size: { width: maxX - minX, height: maxY - minY },
			label: ''
		});
		canvas.requestSave();
		if (this.canvasLeaf) {
			this.app.workspace.setActiveLeaf(this.canvasLeaf, { focus: true });
		}
		canvas.selectOnly(group);
		setTimeout(() => group.startEditing(), 50);
		this.clearSelection();
	}
	/**
	 * Render a group as a collapsible tree-item section.
	 */
	renderGroup(group, canvas) {
		const isCollapsed = this.collapsedGroups.has(group.node.id);
		const treeItem = this.contentEl.createDiv({
			cls: 'tree-item' + (isCollapsed ? ' is-collapsed' : '')
		});
		treeItem.setAttribute('data-tomindmap-collapse-id', group.node.id);
		treeItem.setAttribute('data-tomindmap-collapse-kind', 'group');
		const self = treeItem.createDiv({
			cls: 'tree-item-self is-clickable tomindmap-outline-group'
		});
		const collapseIcon = self.createDiv({
			cls: 'tree-item-icon collapse-icon'
		});
		(0, import_obsidian4.setIcon)(collapseIcon, 'right-triangle');
		const labelContainer = self.createDiv({ cls: 'tree-item-inner' });
		const labelSpan = labelContainer.createSpan({ text: group.label });
		labelContainer.createSpan({
			cls: 'tomindmap-outline-group-count',
			text: `${group.roots.length}`
		});
		this.groupElMap.set(group.node.id, self);
		self.addEventListener('dragover', (e) => {
			if (!this.draggedRoot) return;
			e.preventDefault();
			self.addClass('is-drag-over');
		});
		self.addEventListener('dragleave', () => {
			self.removeClass('is-drag-over');
		});
		self.addEventListener('drop', (e) => {
			e.preventDefault();
			self.removeClass('is-drag-over');
			if (!this.draggedRoot || !this.lastCanvas) return;
			if (this.dragSourceGroupId === group.node.id) return;
			this.moveTreeToGroup(
				this.draggedRoot,
				group.node.id,
				this.dragSourceGroupId
			);
			this.draggedRoot = null;
			this.dragSourceGroupId = null;
		});
		let clickTimer = null;
		self.addEventListener('click', () => {
			if (clickTimer !== null) {
				clearTimeout(clickTimer);
				clickTimer = null;
				return;
			}
			clickTimer = setTimeout(() => {
				clickTimer = null;
				if (this.collapsedGroups.has(group.node.id)) {
					this.collapsedGroups.delete(group.node.id);
					treeItem.removeClass('is-collapsed');
				} else {
					this.collapsedGroups.add(group.node.id);
					treeItem.addClass('is-collapsed');
				}
			}, 250);
		});
		self.addEventListener('dblclick', () => {
			if (clickTimer !== null) {
				clearTimeout(clickTimer);
				clickTimer = null;
			}
			this.startGroupRename(labelSpan, group, canvas);
		});
		self.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new import_obsidian4.Menu();
			menu.addItem((item) => {
				item.setTitle('Rename group')
					.setIcon('pencil')
					.onClick(() =>
						this.startGroupRename(labelSpan, group, canvas)
					);
			});
			menu.addItem((item) => {
				item.setTitle('Layout forest')
					.setIcon('layout-grid')
					.onClick(() => {
						if (this.lastCanvas && this.onForestLayout) {
							this.onForestLayout(this.lastCanvas, group.node.id);
						}
					});
			});
			menu.showAtMouseEvent(e);
		});
		const childrenContainer = treeItem.createDiv({
			cls: 'tree-item-children'
		});
		for (const root of group.roots) {
			this.renderRootItem(
				childrenContainer,
				root,
				canvas,
				false,
				group.node.id
			);
		}
	}
	moveTreeToGroup(root, targetGroupId, sourceGroupId) {
		const canvas = this.lastCanvas;
		if (!canvas) return;
		const group = canvas.nodes.get(targetGroupId);
		if (!group) return;
		const targetX = group.x + group.width / 2 - root.canvasNode.width / 2;
		const targetY = group.y + group.height / 2 - root.canvasNode.height / 2;
		const dx = targetX - root.canvasNode.x;
		const dy = targetY - root.canvasNode.y;
		root.canvasNode.moveTo({ x: targetX, y: targetY });
		for (const desc of getDescendants(root)) {
			desc.canvasNode.moveTo({
				x: desc.canvasNode.x + dx,
				y: desc.canvasNode.y + dy
			});
		}
		if (this.onForestLayout) {
			this.onForestLayout(canvas, targetGroupId);
			if (sourceGroupId) {
				this.onForestLayout(canvas, sourceGroupId);
			}
		}
	}
	ungroupTree(root, sourceGroupId) {
		const canvas = this.lastCanvas;
		if (!canvas) return;
		const groupNodeIds = getGroupIds(canvas);
		let maxY = -Infinity;
		for (const gid of groupNodeIds) {
			const g = canvas.nodes.get(gid);
			if (g) maxY = Math.max(maxY, g.y + g.height);
		}
		const MARGIN = 80;
		const dx = 0;
		const dy = maxY + MARGIN - root.canvasNode.y;
		root.canvasNode.moveTo({ x: root.canvasNode.x, y: maxY + MARGIN });
		for (const desc of getDescendants(root)) {
			desc.canvasNode.moveTo({
				x: desc.canvasNode.x + dx,
				y: desc.canvasNode.y + dy
			});
		}
		if (this.onForestLayout) {
			this.onForestLayout(canvas, sourceGroupId);
		}
	}
	startGroupRename(labelSpan, group, canvas) {
		var _a;
		const originalText = (_a = labelSpan.textContent) != null ? _a : '';
		labelSpan.contentEditable = 'true';
		labelSpan.focus();
		const range = document.createRange();
		range.selectNodeContents(labelSpan);
		const sel = window.getSelection();
		sel == null ? void 0 : sel.removeAllRanges();
		sel == null ? void 0 : sel.addRange(range);
		let done = false;
		const commit = () => {
			var _a2;
			if (done) return;
			done = true;
			const newLabel =
				((_a2 = labelSpan.textContent) != null ? _a2 : '').trim() ||
				'Untitled Group';
			labelSpan.contentEditable = 'false';
			labelSpan.textContent = newLabel;
			cleanup();
			if (newLabel === originalText) return;
			const data = canvas.getData();
			const nodeData = data.nodes.find((n) => n.id === group.node.id);
			if (nodeData) {
				nodeData.label = newLabel;
				canvas.setData(data);
			}
		};
		const cancel = () => {
			done = true;
			labelSpan.contentEditable = 'false';
			labelSpan.textContent = originalText;
			cleanup();
		};
		const onKeydown = (e) => {
			e.stopPropagation();
			if (e.key === 'Enter') {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancel();
			}
		};
		const onBlur = () => commit();
		const onClick = (e) => e.stopPropagation();
		const cleanup = () => {
			labelSpan.removeEventListener('keydown', onKeydown);
			labelSpan.removeEventListener('blur', onBlur);
			labelSpan.removeEventListener('click', onClick);
		};
		labelSpan.addEventListener('keydown', onKeydown);
		labelSpan.addEventListener('blur', onBlur);
		labelSpan.addEventListener('click', onClick);
	}
	/**
	 * Clear the outline (no canvas active).
	 */
	clear() {
		this.canvasLeaf = null;
		this.lastCanvas = null;
		this.selectedRoots.clear();
		this.groupElMap.clear();
		this.allItemEls.clear();
		this.collapsedGroups.clear();
		this.collapsedNodes.clear();
		this.collapsibleNodeIds = [];
		this.activeNodeId = null;
		this.draggedRoot = null;
		this.dragSourceGroupId = null;
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: 'tomindmap-outline-empty',
			text: 'Open a canvas to see root nodes'
		});
	}
};
const MARKDOWN_IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
	'avif',
	'bmp',
	'gif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp'
]);
function markdownResourceTarget(target) {
	return String(target || '')
		.trim()
		.replace(/\\/g, '/')
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E');
}
function markdownResourceLabel(target, alias = '') {
	let label = String(alias || '').trim();
	if (!label) {
		const clean = String(target || '')
			.split(/[?#]/)[0]
			.replace(/\\/g, '/');
		const basename = clean.split('/').filter(Boolean).pop() || clean;
		try {
			label = decodeURIComponent(basename);
		} catch (_) {
			label = basename;
		}
	}
	return (label || 'Attachment')
		.replace(/\\/g, '\\\\')
		.replace(/\[/g, '\\[')
		.replace(/\]/g, '\\]');
}
function isMarkdownImageTarget(target) {
	const clean = String(target || '').split(/[?#]/)[0];
	const extension = clean.includes('.')
		? clean.slice(clean.lastIndexOf('.') + 1).toLowerCase()
		: '';
	return MARKDOWN_IMAGE_EXTENSIONS.has(extension);
}
function markdownResourceLink(target, alias = '', preferEmbed = false) {
	const normalizedTarget = markdownResourceTarget(target);
	if (!normalizedTarget) return 'Untitled';
	const label = markdownResourceLabel(normalizedTarget, alias);
	return preferEmbed && isMarkdownImageTarget(normalizedTarget)
		? `![${label}](<${normalizedTarget}>)`
		: `[${label}](<${normalizedTarget}>)`;
}
function canvasNodeFilePath(node) {
	const values = [
		node?.unknownData?.file,
		node?.file,
		node?.getData?.()?.file
	];
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value?.path === 'string' && value.path.trim())
			return value.path.trim();
	}
	return '';
}
function canvasNodeUrl(node) {
	const values = [node?.unknownData?.url, node?.url, node?.getData?.()?.url];
	const value = values.find(
		(candidate) => typeof candidate === 'string' && candidate.trim()
	);
	return typeof value === 'string' ? value.trim() : '';
}
function canvasNodeMarkdownText(node) {
	if (!node) return 'Untitled';
	const filePath = canvasNodeFilePath(node);
	if (filePath) return markdownResourceLink(filePath, '', true);
	const url = canvasNodeUrl(node);
	if (url)
		return markdownResourceLink(
			url,
			MediaDrop.linkLabel(url).replace(/[\[\]]/g, ''),
			true
		);
	return (
		String(node.text || node.unknownData?.text || '').trim() || 'Untitled'
	);
}
function canvasNodeContentKind(node) {
	if (canvasNodeFilePath(node)) return 'file';
	if (canvasNodeUrl(node)) return 'link';
	return 'text';
}
function canvasNodeContentMatches(left, right) {
	const leftKind = canvasNodeContentKind(left);
	const rightKind = canvasNodeContentKind(right);
	if (leftKind !== rightKind) return false;
	if (leftKind === 'file')
		return canvasNodeFilePath(left) === canvasNodeFilePath(right);
	if (leftKind === 'link')
		return canvasNodeUrl(left) === canvasNodeUrl(right);
	const normalize = (text) =>
		String(text || '')
			.replace(/\r\n?/g, '\n')
			.trim();
	return (
		normalize(left?.text ?? left?.unknownData?.text) ===
		normalize(right?.text ?? right?.unknownData?.text)
	);
}
function getRootTitle(text) {
	const raw = String(text || '').trim();
	const firstLine = raw.split('\n')[0].trim();
	const fence = firstLine.match(/^(```|~~~)\s*([A-Za-z0-9_-]*)/);
	if (fence) return fence[2] ? `Code · ${fence[2]}` : 'Code block';
	const image = firstLine.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
	if (image) return image[1] || image[2].split('/').pop() || 'Image';
	const wikiEmbed = firstLine.match(/^!\[\[([^|\]]+)/);
	if (wikiEmbed) return wikiEmbed[1].split('/').pop() || 'Embed';
	if (/^\|.*\|$/.test(firstLine))
		return (
			firstLine
				.replace(/^\||\|$/g, '')
				.split('|')
				.map((part) => part.trim())
				.filter(Boolean)
				.join(' · ') || 'Table'
		);
	return (
		firstLine
			.replace(/^#+\s*/, '')
			.replace(/^[-+*]\s+/, '')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') || 'Untitled'
	);
}

// src/import/markdown-mindmap.ts
function portableTopicText(text) {
	const value = String(text || '')
		.trim()
		.replace(/^\s{0,3}#{1,6}\s+/, '');
	return value || 'Untitled';
}
function extractTopicIdentity(text, explicitId) {
	let id = explicitId || null;
	const cleaned = String(text || '')
		.replace(
			/<!--\s*tomindmap:id=([A-Za-z0-9_-]+)\s*-->/gi,
			(match, foundId) => {
				if (!id) id = foundId;
				return '';
			}
		)
		.replace(/[ \t]+\n/g, '\n')
		.trim();
	return { id, text: cleaned || 'Untitled' };
}
function frontmatterStringArray(frontmatter, property) {
	const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = String(frontmatter || '').match(
		new RegExp(`^\\s{2}${escaped}:\\s*(\\[[^\\n]*\\])\\s*$`, 'm')
	);
	if (!match) return [];
	try {
		const ids = JSON.parse(match[1]);
		return Array.isArray(ids)
			? ids.filter((value) => typeof value === 'string')
			: [];
	} catch (error) {
		return [];
	}
}
function topicIdentityKey(text) {
	const value = getRootTitle(text)
		.normalize('NFKC')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
function topicIdentityLabel(text) {
	return getRootTitle(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
}
function topicLabelSimilarity(left, right) {
	const normalize = (value) =>
		String(value || '')
			.normalize('NFKC')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim();
	const a = normalize(left);
	const b = normalize(right);
	if (!a || !b) return 0;
	if (a === b) return 1;
	const tokenSet = (value) => new Set(value.split(/\s+/).filter(Boolean));
	const aTokens = tokenSet(a);
	const bTokens = tokenSet(b);
	let commonTokens = 0;
	for (const token of aTokens) {
		if (bTokens.has(token)) commonTokens++;
	}
	const tokenScore = commonTokens / Math.max(aTokens.size, bTokens.size, 1);
	const bigrams = (value) => {
		const result = [];
		const compact = value.replace(/\s+/g, ' ');
		for (let index = 0; index < compact.length - 1; index++)
			result.push(compact.slice(index, index + 2));
		return result;
	};
	const aBigrams = bigrams(a);
	const bBigrams = bigrams(b);
	const remaining = new Map();
	for (const pair of aBigrams)
		remaining.set(pair, (remaining.get(pair) || 0) + 1);
	let commonBigrams = 0;
	for (const pair of bBigrams) {
		const count = remaining.get(pair) || 0;
		if (count > 0) {
			commonBigrams++;
			remaining.set(pair, count - 1);
		}
	}
	const bigramScore =
		(2 * commonBigrams) / Math.max(1, aBigrams.length + bBigrams.length);
	const containmentScore =
		a.includes(b) || b.includes(a)
			? Math.min(a.length, b.length) / Math.max(a.length, b.length)
			: 0;
	return Math.max(tokenScore, bigramScore, containmentScore);
}
function frontmatterWithTopicIds(
	frontmatter,
	topicIds,
	topicKeys,
	topicLabels
) {
	let value = String(frontmatter || '').trim();
	if (!value.startsWith('---'))
		value = value ? `---\n${value}\n---` : '---\n---';
	const lines = value.replace(/\r\n?/g, '\n').split('\n');
	const cleaned = [];
	for (let index = 0; index < lines.length; index++) {
		if (/^tomindmap:\s*$/.test(lines[index])) {
			while (
				index + 1 < lines.length &&
				(/^\s+/.test(lines[index + 1]) || !lines[index + 1].trim())
			)
				index++;
			continue;
		}
		cleaned.push(lines[index]);
	}
	let closing = cleaned.length - 1;
	while (closing > 0 && cleaned[closing].trim() !== '---') closing--;
	const metadata = [
		'tomindmap:',
		'  version: 1',
		`  topicIds: ${JSON.stringify(topicIds)}`,
		`  topicKeys: ${JSON.stringify(topicKeys)}`,
		`  topicLabels: ${JSON.stringify(topicLabels)}`
	];
	cleaned.splice(closing, 0, ...metadata);
	return cleaned.join('\n');
}
function markdownWithTopicMetadata(markdown, topicIds, topicKeys, topicLabels) {
	const original = String(markdown || '');
	const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
	const source = bom ? original.slice(1) : original;
	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const metadata = [
		'tomindmap:',
		'  version: 1',
		`  topicIds: ${JSON.stringify(topicIds)}`,
		`  topicKeys: ${JSON.stringify(topicKeys)}`,
		`  topicLabels: ${JSON.stringify(topicLabels)}`
	].join(eol);
	const opening = source.match(/^---[ \t]*(\r\n|\n|\r)/);
	if (!opening)
		return `${bom}---${eol}${metadata}${eol}---${eol}${eol}${source}`;
	const contentStart = opening[0].length;
	const closingPattern = /^---[ \t]*(?:\r\n|\n|\r|$)/gm;
	closingPattern.lastIndex = contentStart;
	const closing = closingPattern.exec(source);
	if (!closing)
		return `${bom}---${eol}${metadata}${eol}---${eol}${eol}${source}`;
	const frontmatterBody = source.slice(contentStart, closing.index);
	const linePattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
	const lineRecords = [];
	let match;
	while ((match = linePattern.exec(frontmatterBody))) {
		if (!match[0]) break;
		lineRecords.push({
			start: match.index,
			end: match.index + match[0].length,
			text: match[0].replace(/(?:\r\n|\n|\r)$/, '')
		});
	}
	const blockStartIndex = lineRecords.findIndex((line) =>
		/^tomindmap:[ \t]*$/.test(line.text)
	);
	let updatedBody;
	if (blockStartIndex >= 0) {
		let blockEndIndex = blockStartIndex + 1;
		while (
			blockEndIndex < lineRecords.length &&
			/^[ \t]+/.test(lineRecords[blockEndIndex].text)
		)
			blockEndIndex++;
		const start = lineRecords[blockStartIndex].start;
		const end =
			blockEndIndex < lineRecords.length
				? lineRecords[blockEndIndex].start
				: frontmatterBody.length;
		const replacement =
			metadata +
			(end > start &&
			/(?:\r\n|\n|\r)$/.test(frontmatterBody.slice(start, end))
				? eol
				: '');
		updatedBody =
			frontmatterBody.slice(0, start) +
			replacement +
			frontmatterBody.slice(end);
	} else {
		const separator =
			frontmatterBody.length === 0 ||
			/(?:\r\n|\n|\r)$/.test(frontmatterBody)
				? ''
				: eol;
		updatedBody = frontmatterBody + separator + metadata + eol;
	}
	return (
		bom +
		source.slice(0, contentStart) +
		updatedBody +
		source.slice(closing.index)
	);
}
function withoutLegacyPluginComments(markdown) {
	return String(markdown || '')
		.replace(/[ \t]*<!--\s*tomindmap:id=[A-Za-z0-9_-]+\s*-->/gi, '')
		.replace(
			/^[ \t]*<!--\s*\/?tomindmap:(?:node|content)(?:\s+id=[A-Za-z0-9_-]+)?\s*-->[ \t]*(?:\r\n|\n|\r|$)/gim,
			''
		);
}
function markdownFrontmatterForCanvas(canvas, options = {}) {
	const data = canvas.getData();
	const stored =
		typeof data.mindmapMarkdownFrontmatter === 'string'
			? data.mindmapMarkdownFrontmatter.trim()
			: '';
	if (stored)
		return stored.startsWith('---') ? stored : `---\n${stored}\n---`;
	if (options.exportMarkmapFrontmatter === false) return '';
	const title =
		canvas.view && canvas.view.file
			? canvas.view.file.basename
			: 'Mind map';
	const configuredLevel = Number(options.markmapColorFreezeLevel);
	const freezeLevel = Math.max(
		0,
		Math.min(10, Number.isFinite(configuredLevel) ? configuredLevel : 2)
	);
	return `---\ntitle: ${JSON.stringify(title)}\nmarkmap:\n  colorFreezeLevel: ${freezeLevel}\n---`;
}
function isStandaloneMarkdownBlock(text) {
	const trimmed = String(text || '').trim();
	const lines = trimmed.split('\n');
	return (
		/^(```|~~~|\$\$)/.test(trimmed) ||
		/^>\s?/.test(trimmed) ||
		/^!\[[^\]]*\]\([^)]+\)\s*$/.test(trimmed) ||
		/^!\[\[[^\]]+\]\]\s*$/.test(trimmed) ||
		/^<(?:(?:table|pre|img|picture|audio|video|iframe|object|embed)\b)/i.test(
			trimmed
		) ||
		(lines.length >= 2 &&
			/^\s*\|.*\|\s*$/.test(lines[0]) &&
			/^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[1]))
	);
}
function isStructuralListBlock(text) {
	const trimmed = String(text || '').trim();
	if (isMediaResourceMarkdown(trimmed)) return false;
	return isStandaloneMarkdownBlock(trimmed);
}
function isMediaResourceMarkdown(text) {
	const trimmed = String(text || '').trim();
	return (
		/^!\[[^\]]*\]\([^)]+\)\s*$/.test(trimmed) ||
		/^!\[\[[^\]]+\]\]\s*$/.test(trimmed)
	);
}
function markmapHeadingSafe(text) {
	const firstLine = String(text || '')
		.trim()
		.split('\n')[0];
	return (
		firstLine.length > 0 &&
		!isStandaloneMarkdownBlock(text) &&
		!/^(?:[-+*]\s+|\d+[.)]\s+|\[[ xX]\]\s+)/.test(firstLine)
	);
}
function markdownWithPortableCardLinks(text, idToSlug) {
	return String(text || '')
		.replace(
			/obsidian:\/\/tomindmap-navigate\?canvas=[^)\s]+&id=([A-Za-z0-9_-]+)/g,
			(match, id) => (idToSlug.has(id) ? `#${idToSlug.get(id)}` : match)
		)
		.replace(/!\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g, (match, target, alias) =>
			markdownResourceLink(target, alias, true)
		)
		.replace(
			/(^|[^!])\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g,
			(match, prefix, target, alias) =>
				`${prefix}${markdownResourceLink(target, alias, false)}`
		);
}
function headingSlug(text) {
	return (
		getRootTitle(text)
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/<[^>]*>/g, '')
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.trim()
			.replace(/\s+/g, '-') || 'topic'
	);
}
function canvasToMindMapMarkdown(canvas, options = {}) {
	const forest = (
		Array.isArray(options.rootTrees)
			? options.rootTrees
			: buildForest(canvas)
	)
		.slice()
		.sort(
			(a, b) =>
				a.canvasNode.y - b.canvasNode.y ||
				a.canvasNode.x - b.canvasNode.x
		);
	if (forest.length === 0) return '';
	const sortBranchChronology = (tree, isRoot = false) => {
		tree.children = MarkdownOrder.orderChildren(
			tree.canvasNode,
			tree.children,
			isRoot
		);
		for (const child of tree.children) sortBranchChronology(child, false);
	};
	for (const root of forest) sortBranchChronology(root, true);
	const allTrees = [];
	for (const root of forest) allTrees.push(root, ...getDescendants(root));
	const textById = new Map(
		allTrees.map((tree) => [
			tree.canvasNode.id,
			canvasNodeMarkdownText(tree.canvasNode)
		])
	);
	const slugCounts = /* @__PURE__ */ new Map();
	const idToSlug = /* @__PURE__ */ new Map();
	for (const tree of allTrees) {
		const base = headingSlug(textById.get(tree.canvasNode.id));
		const count = (slugCounts.get(base) || 0) + 1;
		slugCounts.set(base, count);
		idToSlug.set(
			tree.canvasNode.id,
			count === 1 ? base : `${base}-${count}`
		);
	}
	const topicIds = [];
	const topicKeys = [];
	const topicLabels = [];
	const collectTopicIds = (tree) => {
		topicIds.push(tree.canvasNode.id);
		const text = textById.get(tree.canvasNode.id);
		topicKeys.push(topicIdentityKey(text));
		topicLabels.push(topicIdentityLabel(text));
		for (const child of tree.children) collectTopicIds(child);
	};
	for (const root of forest) collectTopicIds(root);
	const frontmatter =
		options.includeFrontmatter === false
			? ''
			: frontmatterWithTopicIds(
					markdownFrontmatterForCanvas(canvas, options),
					topicIds,
					topicKeys,
					topicLabels
				);
	const lines = frontmatter ? [frontmatter, ''] : [];
	const rawText = (tree) =>
		markdownWithPortableCardLinks(
			portableTopicText(textById.get(tree.canvasNode.id)),
			idToSlug
		);
	const emitIndentedBlock = (text, indent) => {
		const prefix = '  '.repeat(indent);
		for (const line of String(text).split('\n'))
			lines.push(`${prefix}${line}`);
	};
	const emitListNode = (tree, indent) => {
		const raw = rawText(tree);
		if (isStructuralListBlock(raw)) {
			if (lines.length > 0 && lines[lines.length - 1] !== '')
				lines.push('');
			emitIndentedBlock(raw, indent);
			if (lines[lines.length - 1] !== '') lines.push('');
			for (const child of tree.children) emitListNode(child, indent + 1);
			return;
		}
		const parts = raw.split('\n');
		const first = parts.shift() || 'Untitled';
		const prefix = '  '.repeat(indent);
		const keepsOwnMarker = /^(?:[-+*]\s+\[[ xX]\]|\d+[.)]\s+)/.test(first);
		lines.push(`${prefix}${keepsOwnMarker ? first : `- ${first}`}`);
		if (parts.length > 0) {
			for (const line of parts) lines.push(`${prefix}  ${line}`);
		}
		for (const child of tree.children) emitListNode(child, indent + 1);
	};
	const emitHeadingNode = (tree, level) => {
		const raw = rawText(tree);
		const parts = raw.split('\n');
		const title = parts.shift() || 'Untitled';
		lines.push('', `${'#'.repeat(level)} ${title}`);
		if (parts.length > 0) lines.push(...parts);
		emitHeadingChildren(tree.children, level + 1);
	};
	const emitHeadingChildren = (children, level) => {
		if (children.length === 0) return;
		const useHeadingLevel =
			level <= 6 &&
			children.every((child) => {
				const raw = rawText(child);
				return (
					(isStructuralListBlock(raw) &&
						child.children.length === 0) ||
					markmapHeadingSafe(raw)
				);
			});
		if (!useHeadingLevel) {
			for (const child of children) emitListNode(child, 0);
			return;
		}
		for (const child of children) {
			const raw = rawText(child);
			if (isStructuralListBlock(raw)) {
				lines.push('');
				emitIndentedBlock(raw, 0);
				emitHeadingChildren(child.children, level + 1);
			} else {
				emitHeadingNode(child, level);
			}
		}
	};
	for (let i = 0; i < forest.length; i++) {
		const root = forest[i];
		if (i > 0) lines.push('');
		const rootRaw = rawText(root);
		const rootParts = rootRaw.split('\n');
		lines.push(`# ${rootParts.shift() || 'Untitled'}`);
		if (rootParts.length > 0) lines.push(...rootParts);
		emitHeadingChildren(root.children, 2);
	}
	return lines.join('\n').trim() + '\n';
}
function selectedMindMapTrees(canvas) {
	const forest = buildForest(canvas);
	const groupIds = getGroupIds(canvas);
	const selectedIds = new Set(
		Array.from(canvas.selection || [])
			.filter(
				(item) => item && 'nodeEl' in item && !groupIds.has(item.id)
			)
			.map((item) => item.id)
	);
	if (selectedIds.size === 0) return [];
	const treesById = new Map();
	const stack = forest.slice();
	while (stack.length > 0) {
		const tree = stack.pop();
		treesById.set(tree.canvasNode.id, tree);
		stack.push(...tree.children);
	}
	return Array.from(selectedIds, (id) => treesById.get(id)).filter((tree) => {
		if (!tree) return false;
		for (let parent = tree.parent; parent; parent = parent.parent) {
			if (selectedIds.has(parent.canvasNode.id)) return false;
		}
		return true;
	});
}
function portableMindMapMarkdown(canvas, rootTrees = null) {
	return canvasToMindMapMarkdown(canvas, {
		includeFrontmatter: false,
		...(rootTrees ? { rootTrees } : {})
	});
}
function cleanImportedTopic(text) {
	let value = String(text || '').trim();
	const shaped =
		value.match(/^[A-Za-z0-9_-]*\(\((.*)\)\)$/) ||
		value.match(/^[A-Za-z0-9_-]*\{\{(.*)\}\}$/) ||
		value.match(/^[A-Za-z0-9_-]*\[(.*)\]$/) ||
		value.match(/^[A-Za-z0-9_-]*\((.*)\)$/);
	if (shaped) value = shaped[1];
	if (/^\[[ xX]\]\s+/.test(value)) value = `- ${value}`;
	return value.replace(/<br\s*\/?>/gi, '\n').trim() || 'Untitled';
}
function parseMarkdownMindMapDocument(markdown) {
	const roots = [];
	const usedIds = /* @__PURE__ */ new Set();
	const headingStack = [];
	const listStack = [];
	let listAnchor = null;
	let lastNode = null;
	let inFrontmatter = false;
	let inFence = false;
	let mindmapFence = false;
	let mermaidMode = false;
	let sawH1 = false;
	const frontmatterLines = [];
	const addNode = (text, parent, explicitId, source = null) => {
		const identity = extractTopicIdentity(text, explicitId);
		let id = identity.id || genId();
		while (usedIds.has(id)) id = genId();
		usedIds.add(id);
		const cleanText = cleanImportedTopic(identity.text);
		let type = 'text';
		let file = null;
		let url = null;
		const wikiMatch = /^!\[\[([^|\]#]+)(?:[|#][^\]]*)?\]\]\s*$/.exec(
			cleanText
		);
		const imageMatch =
			/^!\[([^\]]*)\]\(\s*<([^>]+)>\s*\)\s*$/.exec(cleanText) ||
			/^!\[([^\]]*)\]\(\s*([^\s)]+)\s*\)\s*$/.exec(cleanText);
		const linkMatch =
			/^\[([^\]]+)\]\(\s*<([^>]+)>\s*\)\s*$/.exec(cleanText) ||
			/^\[([^\]]+)\]\(\s*([^\s)]+)\s*\)\s*$/.exec(cleanText);
		const resourceMatch = imageMatch || linkMatch;
		const resourceTarget = resourceMatch?.[2] || '';
		if (wikiMatch) {
			type = 'file';
			file = wikiMatch[1];
		} else if (
			resourceMatch &&
			['http:', 'https:', 'obsidian:', 'file:', 'app:'].some((proto) =>
				resourceTarget.startsWith(proto)
			)
		) {
			type = 'link';
			url = resourceTarget;
		} else if (
			resourceMatch &&
			MediaDrop.extractFilePathFromUrl(cleanText)
		) {
			type = 'file';
			file = resourceTarget;
		}
		const node = {
			id,
			legacyId: identity.id ? id : null,
			type,
			file,
			url,
			text: cleanText,
			position: 'right',
			children: [],
			source
		};
		if (parent) parent.children.push(node);
		else roots.push(node);
		lastNode = node;
		return node;
	};
	const addIndented = (text, indent, anchor, source = null) => {
		while (
			listStack.length > 0 &&
			listStack[listStack.length - 1].indent >= indent
		)
			listStack.pop();
		const parent =
			listStack.length > 0
				? listStack[listStack.length - 1].node
				: anchor;
		const node = addNode(text, parent, null, source);
		listStack.push({ indent, node });
		return node;
	};
	const lines = String(markdown || '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	const currentParent = () =>
		listStack.length > 0
			? listStack[listStack.length - 1].node
			: listAnchor;
	const stripCommonIndent = (blockLines) => {
		const nonEmpty = blockLines.filter((line) => line.trim());
		const common =
			nonEmpty.length > 0
				? Math.min(
						...nonEmpty.map(
							(line) =>
								(line.match(/^[ \t]*/) || [''])[0].replace(
									/\t/g,
									'    '
								).length
						)
					)
				: 0;
		return blockLines
			.map((line) => line.slice(Math.min(common, line.length)))
			.join('\n')
			.trim();
	};
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (index === 0 && line.trim() === '---') {
			inFrontmatter = true;
			frontmatterLines.push('---');
			continue;
		}
		if (inFrontmatter) {
			frontmatterLines.push(line);
			if (line.trim() === '---') {
				inFrontmatter = false;
			}
			continue;
		}
		if (/^\s*<!--\s*tomindmap:content\s*-->\s*$/.test(line)) {
			const content = [];
			while (
				++index < lines.length &&
				!/^\s*<!--\s*\/tomindmap:content\s*-->\s*$/.test(lines[index])
			)
				content.push(lines[index]);
			if (lastNode && content.length > 0)
				lastNode.text =
					`${lastNode.text}\n${stripCommonIndent(content)}`.trim();
			continue;
		}
		const portableNodeMarker = line.match(
			/^\s*<!--\s*tomindmap:node(?:\s+id=([A-Za-z0-9_-]+))?\s*-->\s*$/
		);
		if (portableNodeMarker) {
			const startLine = index;
			const content = [];
			while (
				++index < lines.length &&
				!/^\s*<!--\s*\/tomindmap:node\s*-->\s*$/.test(lines[index])
			)
				content.push(lines[index]);
			const block = stripCommonIndent(content);
			if (block)
				addNode(block, currentParent(), portableNodeMarker[1], {
					startLine,
					endLine: index + 1,
					kind: 'block',
					indent: ''
				});
			continue;
		}
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)/);
		if (fenceMatch) {
			if (!inFence) {
				const language = fenceMatch[2].toLowerCase();
				if (language === 'mermaid') {
					inFence = true;
					mindmapFence = true;
				} else {
					const startLine = index;
					const wrapperIndent = (line.match(/^[ \t]*/) || [''])[0];
					const removeWrapperIndent = (value) =>
						value.startsWith(wrapperIndent)
							? value.slice(wrapperIndent.length)
							: value;
					const block = [removeWrapperIndent(line)];
					const closingFence =
						fenceMatch[1][0] === '`'
							? /^\s*`{3,}\s*$/
							: /^\s*~{3,}\s*$/;
					while (++index < lines.length) {
						block.push(removeWrapperIndent(lines[index]));
						if (closingFence.test(lines[index])) break;
					}
					addNode(block.join('\n'), currentParent(), null, {
						startLine,
						endLine: index + 1,
						kind: 'block',
						indent: wrapperIndent
					});
				}
			} else {
				inFence = false;
				mindmapFence = false;
				mermaidMode = false;
				listStack.length = 0;
			}
			continue;
		}
		if (inFence && !mindmapFence) continue;
		if (!line.trim()) continue;
		if (line.trim().toLowerCase() === 'mindmap') {
			mermaidMode = true;
			listStack.length = 0;
			listAnchor = null;
			continue;
		}
		if (/^\s*\$\$\s*$/.test(line)) {
			const startLine = index;
			const block = [line.trim()];
			while (++index < lines.length) {
				block.push(lines[index]);
				if (/^\s*\$\$\s*$/.test(lines[index])) break;
			}
			addNode(block.join('\n'), currentParent(), null, {
				startLine,
				endLine: index + 1,
				kind: 'block',
				indent: (line.match(/^[ \t]*/) || [''])[0]
			});
			continue;
		}
		if (
			/^\s*\|.*\|\s*$/.test(line) &&
			index + 1 < lines.length &&
			/^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[index + 1])
		) {
			const startLine = index;
			const wrapperIndent = (line.match(/^[ \t]*/) || [''])[0];
			const block = [line.trimStart()];
			while (
				index + 1 < lines.length &&
				/^\s*\|.*\|\s*$/.test(lines[index + 1])
			)
				block.push(lines[++index].trimStart());
			addNode(block.join('\n'), currentParent(), null, {
				startLine,
				endLine: index + 1,
				kind: 'block',
				indent: wrapperIndent
			});
			continue;
		}
		if (/^\s*>\s?/.test(line)) {
			const startLine = index;
			const wrapperIndent = (line.match(/^[ \t]*/) || [''])[0];
			const block = [line.trimStart()];
			while (index + 1 < lines.length) {
				if (/^\s*>\s?/.test(lines[index + 1])) {
					block.push(lines[++index].trimStart());
					continue;
				}
				if (
					!lines[index + 1].trim() &&
					index + 2 < lines.length &&
					/^\s*>\s?/.test(lines[index + 2])
				) {
					block.push(lines[++index]);
					continue;
				}
				break;
			}
			addNode(block.join('\n'), currentParent(), null, {
				startLine,
				endLine: index + 1,
				kind: 'block',
				indent: wrapperIndent
			});
			continue;
		}
		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (heading && !mermaidMode) {
			const level = heading[1].length;
			if (level === 1) sawH1 = true;
			while (
				headingStack.length > 0 &&
				headingStack[headingStack.length - 1].level >= level
			)
				headingStack.pop();
			const parent =
				headingStack.length > 0
					? headingStack[headingStack.length - 1].node
					: null;
			const node = addNode(heading[2], parent, null, {
				startLine: index,
				endLine: index + 1,
				kind: 'heading',
				level,
				prefix: `${heading[1]} `
			});
			headingStack.push({ level, node });
			listAnchor = node;
			listStack.length = 0;
			continue;
		}
		const list = line.match(/^([ \t]*)([-+*]|\d+[.)])\s+(.+)$/);
		if (list && !mermaidMode) {
			const indent = list[1].replace(/\t/g, '    ').length;
			const marker = list[2];
			const content = list[3];
			const preserved = /^\d/.test(marker)
				? `${marker} ${content}`
				: /^\[[ xX]\]\s+/.test(content)
					? `- ${content}`
					: content;
			addIndented(preserved, indent, listAnchor, {
				startLine: index,
				endLine: index + 1,
				kind: 'list',
				indent: list[1],
				marker,
				prefix: `${list[1]}${marker} `
			});
			continue;
		}
		const leading = line.match(/^([ \t]*)(.*)$/);
		const indent = leading[1].replace(/\t/g, '    ').length;
		const content = leading[2].trim();
		if (!content) continue;
		if (mermaidMode || indent > 0) {
			addIndented(content, indent, listAnchor, {
				startLine: index,
				endLine: index + 1,
				kind: 'plain',
				indent: leading[1],
				prefix: leading[1]
			});
			if (!listAnchor && listStack.length === 1) listAnchor = null;
			continue;
		}
		listStack.length = 0;
		const parent = listAnchor;
		const node = addNode(content, parent, null, {
			startLine: index,
			endLine: index + 1,
			kind: 'plain',
			indent: leading[1],
			prefix: leading[1]
		});
		if (!parent) listAnchor = node;
	}
	const frontmatter = frontmatterLines.join('\n').trim();
	const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
	const frontmatterTitle = titleMatch
		? titleMatch[1].trim().replace(/^["']|["']$/g, '')
		: '';
	if (frontmatterTitle && !sawH1 && roots.length > 0) {
		let id = genId();
		while (usedIds.has(id)) id = genId();
		usedIds.add(id);
		const syntheticRoot = {
			id,
			legacyId: null,
			text: frontmatterTitle,
			position: 'right',
			children: roots.splice(0)
		};
		roots.push(syntheticRoot);
	}
	const metadataIds = frontmatterStringArray(frontmatter, 'topicIds').filter(
		(id) => /^[A-Za-z0-9_-]+$/.test(id)
	);
	const metadataKeys = frontmatterStringArray(frontmatter, 'topicKeys');
	const metadataLabels = frontmatterStringArray(frontmatter, 'topicLabels');
	const orderedNodes = [];
	const collectOrderedNodes = (node) => {
		orderedNodes.push(node);
		for (const child of node.children) collectOrderedNodes(child);
	};
	for (const root of roots) collectOrderedNodes(root);
	const assignedIds = /* @__PURE__ */ new Set();
	const metadataIndexByNode = /* @__PURE__ */ new Map();
	const metadataIndexesByKey = /* @__PURE__ */ new Map();
	for (
		let index = 0;
		index < Math.min(metadataIds.length, metadataKeys.length);
		index++
	) {
		let indexes = metadataIndexesByKey.get(metadataKeys[index]);
		if (!indexes) {
			indexes = [];
			metadataIndexesByKey.set(metadataKeys[index], indexes);
		}
		indexes.push(index);
	}
	const claimedMetadataIndexes = /* @__PURE__ */ new Set();
	for (const node of orderedNodes) {
		const indexes = metadataIndexesByKey.get(topicIdentityKey(node.text));
		if (!indexes) continue;
		const match = indexes.find(
			(index) => !claimedMetadataIndexes.has(index)
		);
		if (match === void 0) continue;
		metadataIndexByNode.set(node, match);
		claimedMetadataIndexes.add(match);
	}
	const unmatchedNodes = orderedNodes.filter(
		(node) => !metadataIndexByNode.has(node)
	);
	const similarityPairs = [];
	for (const node of unmatchedNodes) {
		for (
			let index = 0;
			index < Math.min(metadataIds.length, metadataLabels.length);
			index++
		) {
			if (claimedMetadataIndexes.has(index)) continue;
			const score = topicLabelSimilarity(
				metadataLabels[index],
				topicIdentityLabel(node.text)
			);
			if (score >= 0.34) similarityPairs.push({ node, index, score });
		}
	}
	similarityPairs.sort(
		(a, b) =>
			b.score - a.score ||
			Math.abs(orderedNodes.indexOf(a.node) - a.index) -
				Math.abs(orderedNodes.indexOf(b.node) - b.index)
	);
	const similarityMatchedNodes = /* @__PURE__ */ new Set();
	for (const pair of similarityPairs) {
		if (
			similarityMatchedNodes.has(pair.node) ||
			claimedMetadataIndexes.has(pair.index)
		)
			continue;
		metadataIndexByNode.set(pair.node, pair.index);
		similarityMatchedNodes.add(pair.node);
		claimedMetadataIndexes.add(pair.index);
	}
	const unmatchedMetadataIndexes = metadataIds
		.map((_, index) => index)
		.filter((index) => !claimedMetadataIndexes.has(index));
	let stableIdCount = 0;
	for (let index = 0; index < orderedNodes.length; index++) {
		const node = orderedNodes[index];
		let metadataIndex = metadataIndexByNode.get(node);
		if (metadataIndex === void 0 && unmatchedMetadataIndexes.length > 0)
			metadataIndex = unmatchedMetadataIndexes.shift();
		let candidate =
			node.legacyId ||
			(metadataIndex !== void 0 ? metadataIds[metadataIndex] : null) ||
			node.id;
		if (
			(node.legacyId || metadataIndex !== void 0) &&
			!assignedIds.has(candidate)
		)
			stableIdCount++;
		while (!candidate || assignedIds.has(candidate)) candidate = genId();
		node.id = candidate;
		delete node.legacyId;
		assignedIds.add(candidate);
	}
	const metadataCurrent =
		metadataIds.length === orderedNodes.length &&
		metadataKeys.length === orderedNodes.length &&
		metadataLabels.length === orderedNodes.length &&
		orderedNodes.every(
			(node, index) =>
				metadataIds[index] === node.id &&
				metadataKeys[index] === topicIdentityKey(node.text) &&
				metadataLabels[index] === topicIdentityLabel(node.text)
		);
	const topicIds = orderedNodes.map((node) => node.id);
	const topicKeys = orderedNodes.map((node) => topicIdentityKey(node.text));
	const topicLabels = orderedNodes.map((node) =>
		topicIdentityLabel(node.text)
	);
	const topicSources = orderedNodes.map((node) => ({
		id: node.id,
		parentId:
			orderedNodes.find((candidate) => candidate.children.includes(node))
				?.id || null,
		...node.source
	}));
	const setPosition = (node, position) => {
		node.position = position;
		for (const child of node.children) setPosition(child, position);
	};
	for (const root of roots) {
		const weight = (node) =>
			1 + node.children.reduce((sum, child) => sum + weight(child), 0);
		const weights = root.children.map(weight);
		const total = weights.reduce((sum, value) => sum + value, 0);
		let prefix = 0;
		let split = root.children.length > 0 ? 1 : 0;
		let bestDifference = Infinity;
		for (let index = 0; index <= root.children.length; index++) {
			const difference = Math.abs(prefix - (total - prefix));
			if (
				difference < bestDifference ||
				(difference === bestDifference && index > split)
			) {
				bestDifference = difference;
				split = index;
			}
			prefix += weights[index] || 0;
		}
		root.children.forEach((child, index) =>
			setPosition(child, index < split ? 'right' : 'left')
		);
	}
	return {
		roots,
		frontmatter,
		stableIdCount,
		metadataCurrent,
		topicIds,
		topicKeys,
		topicLabels,
		topicSources
	};
}
function parseMarkdownMindMap(markdown) {
	return parseMarkdownMindMapDocument(markdown).roots;
}
function markdownMindMapToCanvas(markdown, opts) {
	const parsed = parseMarkdownMindMapDocument(markdown);
	const roots = parsed.roots;
	if (roots.length === 0) return null;
	const nodes = [];
	const edges = [];
	let currentY = 0;
	const treeGap = Math.max(120, opts.verticalGap * 6);
	for (const root of roots) {
		const height = layoutTree(root, 0, currentY, opts, nodes, edges);
		currentY += height + treeGap;
	}
	return {
		nodes,
		edges,
		frontmatter: parsed.frontmatter,
		stableIdCount: parsed.stableIdCount,
		metadataCurrent: parsed.metadataCurrent,
		topicIds: parsed.topicIds,
		topicKeys: parsed.topicKeys,
		topicLabels: parsed.topicLabels,
		topicSources: parsed.topicSources,
		rootIds: roots
			.map((_, index) => {
				let seen = -1;
				for (const node of nodes) {
					if (!edges.some((edge) => edge.toNode === node.id)) {
						seen++;
						if (seen === index) return node.id;
					}
				}
				return null;
			})
			.filter(Boolean)
	};
}
function canvasDataAdapter(data, file) {
	const nodeMap = /* @__PURE__ */ new Map();
	for (const item of data.nodes || []) {
		let text = 'Untitled';
		if (item.type === 'group') {
			text = item.label || 'Group';
		} else {
			text = canvasNodeMarkdownText(item);
		}
		nodeMap.set(item.id, {
			...item,
			text
		});
	}
	const edgeMap = /* @__PURE__ */ new Map();
	for (const item of data.edges || []) {
		const fromNode = nodeMap.get(item.fromNode);
		const toNode = nodeMap.get(item.toNode);
		if (!fromNode || !toNode) continue;
		edgeMap.set(item.id, {
			...item,
			from: { node: fromNode, side: item.fromSide },
			to: { node: toNode, side: item.toSide }
		});
	}
	return {
		nodes: nodeMap,
		edges: edgeMap,
		getData: () => data,
		view: { file }
	};
}
function canvasDataToMindMapMarkdown(data, file, options = {}) {
	return canvasToMindMapMarkdown(canvasDataAdapter(data, file), options);
}
function reconcileCanvasData(existingData, imported) {
	const current =
		existingData && typeof existingData === 'object' ? existingData : {};
	const existingNodes = new Map(
		(current.nodes || []).map((node) => [node.id, node])
	);
	const pendingResizeIds = new Set(
		Array.isArray(current.mindmapPendingResize)
			? current.mindmapPendingResize
			: []
	);
	const normalizeText = (text) =>
		String(text || '')
			.replace(/\r\n?/g, '\n')
			.trim();
	const nodes = [];
	for (const incoming of imported.nodes) {
		const existing = existingNodes.get(incoming.id);
		if (existing) {
			const isMediaNode =
				existing.type === 'file' ||
				existing.type === 'link' ||
				existing.file ||
				existing.url ||
				incoming.type === 'file' ||
				incoming.type === 'link';
			const contentChanged = isMediaNode
				? !canvasNodeContentMatches(existing, incoming)
				: normalizeText(existing.text) !== normalizeText(incoming.text);
			if (isMediaNode) {
				pendingResizeIds.delete(incoming.id);
			} else if (contentChanged) {
				pendingResizeIds.add(incoming.id);
			} else {
				pendingResizeIds.delete(incoming.id);
			}
			nodes.push({
				...existing,
				...incoming,
				width: isMediaNode
					? existing.width
					: contentChanged
						? incoming.width
						: existing.width,
				height: isMediaNode
					? existing.height
					: contentChanged
						? incoming.height
						: existing.height
			});
		} else {
			if (incoming.type !== 'file' && incoming.type !== 'link')
				pendingResizeIds.add(incoming.id);
			nodes.push({ ...incoming });
		}
	}
	const groupIds = /* @__PURE__ */ new Set();
	for (const node of current.nodes || []) {
		if (node.type === 'group') {
			groupIds.add(node.id);
			nodes.push(node);
		}
	}
	const existingEdges = new Map(
		(current.edges || []).map((edge) => [
			`${edge.fromNode}\0${edge.toNode}`,
			edge
		])
	);
	const edges = imported.edges.map((incoming) => {
		const existing = existingEdges.get(
			`${incoming.fromNode}\0${incoming.toNode}`
		);
		return existing
			? {
					...incoming,
					...existing,
					fromNode: incoming.fromNode,
					toNode: incoming.toNode
				}
			: incoming;
	});
	const retainedIds = new Set(nodes.map((node) => node.id));
	for (const edge of current.edges || []) {
		if (!groupIds.has(edge.fromNode) && !groupIds.has(edge.toNode))
			continue;
		if (retainedIds.has(edge.fromNode) && retainedIds.has(edge.toNode))
			edges.push(edge);
	}
	const reconciled = {
		...current,
		nodes,
		edges,
		mindmap: true,
		mindmapMarkdownFrontmatter:
			imported.frontmatter || current.mindmapMarkdownFrontmatter || ''
	};
	delete reconciled.mindmapAutoAdjust;
	const retainedTopicIds = new Set(imported.nodes.map((node) => node.id));
	const pending = Array.from(pendingResizeIds).filter((id) =>
		retainedTopicIds.has(id)
	);
	if (pending.length > 0) reconciled.mindmapPendingResize = pending;
	else delete reconciled.mindmapPendingResize;
	return reconciled;
}
function convertMarkdownAnchorsToCardLinks(nodes, canvasPath) {
	const slugToId = /* @__PURE__ */ new Map();
	for (const node of nodes) {
		const slug = headingSlug(node.text);
		if (!slugToId.has(slug)) slugToId.set(slug, node.id);
	}
	for (const node of nodes) {
		node.text = String(node.text || '').replace(
			/\]\(#([^)]+)\)/g,
			(match, rawAnchor) => {
				let anchor = rawAnchor;
				try {
					anchor = decodeURIComponent(rawAnchor);
				} catch (error) {}
				const targetId = slugToId.get(anchor.toLowerCase());
				if (!targetId) return match;
				return `](obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${targetId})`;
			}
		);
	}
}
function canvasMatchesImportedMarkdown(canvas, imported, canvasPath) {
	if (!imported) return false;
	const groupIds = getGroupIds(canvas);
	const liveNodes = Array.from(canvas.nodes.values()).filter(
		(node) => !groupIds.has(node.id)
	);
	const incomingNodes = imported.nodes.map((node) => ({ ...node }));
	convertMarkdownAnchorsToCardLinks(incomingNodes, canvasPath);
	if (liveNodes.length !== incomingNodes.length) return false;
	const liveById = new Map(liveNodes.map((node) => [node.id, node]));
	for (const incoming of incomingNodes) {
		const live = liveById.get(incoming.id);
		if (!live || !canvasNodeContentMatches(live, incoming)) return false;
	}
	const topicIds = new Set(incomingNodes.map((node) => node.id));
	const edgeKey = (edge) => `${edge.fromNode}\0${edge.toNode}`;
	const incomingEdges = new Set(
		imported.edges
			.filter(
				(edge) =>
					topicIds.has(edge.fromNode) && topicIds.has(edge.toNode)
			)
			.map(edgeKey)
	);
	const liveEdges = new Set(
		(canvas.getData().edges || [])
			.filter(
				(edge) =>
					topicIds.has(edge.fromNode) && topicIds.has(edge.toNode)
			)
			.map(edgeKey)
	);
	if (incomingEdges.size !== liveEdges.size) return false;
	for (const key of incomingEdges) {
		if (!liveEdges.has(key)) return false;
	}
	return true;
}
function canvasOrderMatchesImportedMarkdown(canvas, imported) {
	return MarkdownOrder.orderMatches(canvas, imported, getGroupIds);
}
function canvasTopicPreorder(canvas) {
	return MarkdownOrder.canvasTopicPreorder(canvas, getGroupIds);
}
function markdownLineRecords(markdown) {
	const source = String(markdown || '');
	const records = [];
	const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
	let match;
	while ((match = pattern.exec(source))) {
		if (!match[0]) break;
		const eolMatch = match[0].match(/(?:\r\n|\n|\r)$/);
		records.push({
			start: match.index,
			contentEnd:
				match.index +
				match[0].length -
				(eolMatch ? eolMatch[0].length : 0),
			end: match.index + match[0].length
		});
	}
	return records;
}
/**
 * Reorder existing sibling subtrees by moving their original source slices.
 * Topic text, tables, code blocks, embeds, whitespace between sibling slots,
 * and every nested source block remain byte-for-byte intact.
 */
function reorderMarkdownTopicsPreservingSource(markdown, canvas) {
	return MarkdownOrder.reorderPreservingSource(markdown, canvas, {
		getGroupIds,
		parseDocument: parseMarkdownMindMapDocument,
		lineRecords: markdownLineRecords,
		withMetadata: markdownWithTopicMetadata,
		withoutLegacyComments: withoutLegacyPluginComments,
		identityKey: topicIdentityKey,
		identityLabel: topicIdentityLabel
	});
}
function patchMarkdownFromCanvasPreservingSource(
	markdown,
	canvas,
	imported,
	canvasPath
) {
	if (!imported || !Array.isArray(imported.topicSources)) return null;
	const source = String(markdown || '');
	const sourceEol = source.includes('\r\n')
		? '\r\n'
		: source.includes('\r')
			? '\r'
			: '\n';
	const lineRecords = markdownLineRecords(source);
	const groupIds = getGroupIds(canvas);
	const liveNodes = Array.from(canvas.nodes.values()).filter(
		(node) => !groupIds.has(node.id)
	);
	const liveById = new Map(liveNodes.map((node) => [node.id, node]));
	const importedNodes = imported.nodes.map((node) => ({ ...node }));
	convertMarkdownAnchorsToCardLinks(importedNodes, canvasPath);
	const importedById = new Map(importedNodes.map((node) => [node.id, node]));
	const sourceById = new Map(
		imported.topicSources.map((record) => [record.id, record])
	);
	const topicIds = new Set([...liveById.keys(), ...importedById.keys()]);
	const parentMap = (edges) => {
		const result = /* @__PURE__ */ new Map();
		for (const edge of edges || []) {
			if (!topicIds.has(edge.fromNode) || !topicIds.has(edge.toNode))
				continue;
			if (
				result.has(edge.toNode) &&
				result.get(edge.toNode) !== edge.fromNode
			)
				return null;
			result.set(edge.toNode, edge.fromNode);
		}
		return result;
	};
	const importedParents = parentMap(imported.edges);
	const liveParents = parentMap(canvas.getData().edges || []);
	if (!importedParents || !liveParents) return null;
	const commonIds = new Set(
		[...liveById.keys()].filter((id) => importedById.has(id))
	);
	for (const id of commonIds) {
		const before = importedParents.get(id) || null;
		const after = liveParents.get(id) || null;
		if (before !== after) return null;
	}
	const removedIds = [...importedById.keys()].filter(
		(id) => !liveById.has(id)
	);
	const addedIds = new Set(
		[...liveById.keys()].filter((id) => !importedById.has(id))
	);
	const idToSlug = /* @__PURE__ */ new Map();
	const slugCounts = /* @__PURE__ */ new Map();
	for (const node of liveNodes) {
		const base = headingSlug(canvasNodeMarkdownText(node));
		const count = (slugCounts.get(base) || 0) + 1;
		slugCounts.set(base, count);
		idToSlug.set(node.id, count === 1 ? base : `${base}-${count}`);
	}
	const portableText = (node) =>
		markdownWithPortableCardLinks(canvasNodeMarkdownText(node), idToSlug);
	const patches = [];
	const rangeFor = (record) => {
		if (
			!record ||
			!Number.isInteger(record.startLine) ||
			!Number.isInteger(record.endLine)
		)
			return null;
		const first = lineRecords[record.startLine];
		const last = lineRecords[record.endLine - 1];
		return first && last
			? {
					start: first.start,
					end: last.end,
					trailingEol: source.slice(last.contentEnd, last.end)
				}
			: null;
	};
	const renderExisting = (record, text) => {
		const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
		if (record.kind === 'block') {
			const indent = record.indent || '';
			return lines.map((line) => `${indent}${line}`).join('\n');
		}
		if (record.kind === 'heading') {
			const first = lines.shift() || 'Untitled';
			return `${record.prefix || '# '}${first}${lines.length ? `\n${lines.join('\n')}` : ''}`;
		}
		let first = lines.shift() || 'Untitled';
		if (record.kind === 'list') {
			if (/^\d/.test(record.marker || ''))
				first = first.replace(
					new RegExp(
						`^${String(record.marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`
					),
					''
				);
			else first = first.replace(/^[-+*]\s+/, '');
		}
		const continuationIndent =
			record.kind === 'list'
				? `${record.indent || ''}  `
				: record.indent || '';
		return `${record.prefix || ''}${first}${lines.length ? `\n${lines.map((line) => `${continuationIndent}${line}`).join('\n')}` : ''}`;
	};
	for (const id of commonIds) {
		const live = liveById.get(id);
		const incoming = importedById.get(id);
		if (canvasNodeContentMatches(live, incoming)) continue;
		const record = sourceById.get(id);
		const range = rangeFor(record);
		if (!range) return null;
		patches.push({
			...range,
			replacement:
				renderExisting(record, portableText(live)).replace(
					/\n/g,
					sourceEol
				) + range.trailingEol
		});
	}
	for (const id of removedIds) {
		const range = rangeFor(sourceById.get(id));
		if (!range) return null;
		patches.push({ ...range, replacement: '' });
	}
	const liveChildren = /* @__PURE__ */ new Map();
	for (const id of liveById.keys()) liveChildren.set(id, []);
	const liveRoots = [];
	for (const node of liveNodes) {
		const parentId = liveParents.get(node.id);
		if (parentId && liveChildren.has(parentId))
			liveChildren.get(parentId).push(node);
		else liveRoots.push(node);
	}
	const spatialSort = (a, b) =>
		a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id));
	liveRoots.sort(spatialSort);
	const liveRootIds = new Set(liveRoots.map((node) => node.id));
	for (const [parentId, children] of liveChildren) {
		const parent = liveById.get(parentId);
		liveChildren.set(
			parentId,
			MarkdownOrder.orderChildren(
				parent,
				children,
				liveRootIds.has(parentId)
			)
		);
	}
	const addedPreorder = (node) => {
		const result = [node.id];
		for (const child of liveChildren.get(node.id) || []) {
			if (addedIds.has(child.id)) result.push(...addedPreorder(child));
		}
		return result;
	};
	const renderAddedTree = (node, style) => {
		const text = portableText(node);
		const richBlock = isStructuralListBlock(text);
		const lines = [];
		let childStyle;
		if (isMediaResourceMarkdown(text)) {
			const indent = style.kind === 'list' ? style.indent || '' : '';
			lines.push(`${indent}- ${text}`);
			childStyle = { kind: 'list', indent: `${indent}  ` };
		} else if (richBlock) {
			lines.push(text);
			childStyle = { kind: 'list', indent: '' };
		} else if (style.kind === 'heading' && style.level <= 6) {
			lines.push(`${'#'.repeat(style.level)} ${text}`);
			childStyle =
				style.level < 6
					? { kind: 'heading', level: style.level + 1 }
					: { kind: 'list', indent: '' };
		} else {
			const indent = style.indent || '';
			lines.push(`${indent}- ${text}`);
			childStyle = { kind: 'list', indent: `${indent}  ` };
		}
		for (const child of liveChildren.get(node.id) || []) {
			if (addedIds.has(child.id))
				lines.push('', renderAddedTree(child, childStyle));
		}
		return lines.join('\n');
	};
	const addedGroups = /* @__PURE__ */ new Map();
	for (const id of addedIds) {
		const parentId = liveParents.get(id) || null;
		if (parentId && addedIds.has(parentId)) continue;
		if (parentId && !importedById.has(parentId)) return null;
		const key = parentId || '';
		if (!addedGroups.has(key)) addedGroups.set(key, []);
		addedGroups.get(key).push(liveById.get(id));
	}
	const originalOrder = (imported.topicIds || []).filter((id) =>
		liveById.has(id)
	);
	const descendantsOf = (parentId) => {
		const result = new Set([parentId]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const [childId, candidateParent] of importedParents) {
				if (result.has(candidateParent) && !result.has(childId)) {
					result.add(childId);
					changed = true;
				}
			}
		}
		return result;
	};
	const subtreeRangeCache = /* @__PURE__ */ new Map();
	const subtreeRangeFor = (id) => {
		if (subtreeRangeCache.has(id)) return subtreeRangeCache.get(id);
		const ranges = Array.from(descendantsOf(id))
			.map((descendantId) => rangeFor(sourceById.get(descendantId)))
			.filter(Boolean);
		const range =
			ranges.length > 0
				? {
						start: Math.min(
							...ranges.map((candidate) => candidate.start)
						),
						end: Math.max(
							...ranges.map((candidate) => candidate.end)
						)
					}
				: null;
		subtreeRangeCache.set(id, range);
		return range;
	};
	const visualOrder = MarkdownOrder.canvasTopicPreorder(canvas, getGroupIds);
	const visualIndex = new Map(visualOrder.map((id, index) => [id, index]));
	const insertionPlans = [];
	for (const [parentKey, roots] of addedGroups) {
		const parentId = parentKey || null;
		let style = { kind: 'heading', level: 1 };
		if (parentId) {
			const parentRecord = sourceById.get(parentId);
			if (!parentRecord) return null;
			if (
				parentRecord.kind === 'heading' &&
				Number(parentRecord.level) < 6
			)
				style = {
					kind: 'heading',
					level: Number(parentRecord.level) + 1
				};
			else
				style = {
					kind: 'list',
					indent: `${parentRecord.indent || ''}  `
				};
		}
		const addedRootIds = new Set(roots.map((root) => root.id));
		const siblings = parentId
			? liveChildren.get(parentId) || []
			: liveRoots;
		for (let index = 0; index < siblings.length; ) {
			if (!addedRootIds.has(siblings[index].id)) {
				index++;
				continue;
			}
			const run = [];
			while (
				index < siblings.length &&
				addedRootIds.has(siblings[index].id)
			)
				run.push(siblings[index++]);
			const nextExisting =
				siblings
					.slice(index)
					.find((sibling) => !addedIds.has(sibling.id)) || null;
			const previousExisting =
				siblings
					.slice(0, index - run.length)
					.reverse()
					.find((sibling) => !addedIds.has(sibling.id)) || null;
			let offset;
			if (nextExisting) {
				const nextRange = subtreeRangeFor(nextExisting.id);
				if (!nextRange) return null;
				offset = nextRange.start;
			} else if (previousExisting) {
				const previousRange = subtreeRangeFor(previousExisting.id);
				if (!previousRange) return null;
				offset = previousRange.end;
			} else if (parentId) {
				const parentRange = rangeFor(sourceById.get(parentId));
				if (!parentRange) return null;
				offset = parentRange.end;
			} else {
				offset = source.length;
			}
			insertionPlans.push({
				offset,
				desiredIndex: Math.min(
					...run.map(
						(root) =>
							visualIndex.get(root.id) ?? Number.MAX_SAFE_INTEGER
					)
				),
				rendered: run
					.map((root) => renderAddedTree(root, style))
					.join('\n\n'),
				newIds: run.flatMap(addedPreorder)
			});
		}
	}
	insertionPlans.sort(
		(a, b) => a.offset - b.offset || a.desiredIndex - b.desiredIndex
	);
	const mergedInsertionPlans = [];
	for (const plan of insertionPlans) {
		const previous = mergedInsertionPlans[mergedInsertionPlans.length - 1];
		if (previous && previous.offset === plan.offset) {
			previous.rendered += `\n${plan.rendered}`;
			previous.newIds.push(...plan.newIds);
		} else {
			mergedInsertionPlans.push({ ...plan, newIds: [...plan.newIds] });
		}
	}
	for (const plan of mergedInsertionPlans) {
		const prefix =
			plan.offset > 0 && !/[\r\n]$/.test(source.slice(0, plan.offset))
				? sourceEol
				: '';
		const replacement = `${prefix}${plan.rendered.replace(/\n/g, sourceEol)}${sourceEol}`;
		patches.push({ start: plan.offset, end: plan.offset, replacement });
	}
	const orderEntries = originalOrder.map((id) => ({
		offset: rangeFor(sourceById.get(id))?.start ?? source.length,
		inserted: false,
		ids: [id]
	}));
	for (const plan of mergedInsertionPlans)
		orderEntries.push({
			offset: plan.offset,
			inserted: true,
			desiredIndex: plan.desiredIndex,
			ids: plan.newIds
		});
	orderEntries.sort(
		(a, b) =>
			a.offset - b.offset ||
			Number(b.inserted) - Number(a.inserted) ||
			(a.desiredIndex ?? Number.MAX_SAFE_INTEGER) -
				(b.desiredIndex ?? Number.MAX_SAFE_INTEGER)
	);
	const sourceOrder = orderEntries.flatMap((entry) => entry.ids);
	patches.sort((a, b) => b.start - a.start || b.end - a.end);
	for (let index = 1; index < patches.length; index++) {
		if (patches[index - 1].start < patches[index].end) return null;
	}
	let patched = source;
	for (const patch of patches)
		patched =
			patched.slice(0, patch.start) +
			patch.replacement +
			patched.slice(patch.end);
	const metadata = {
		topicIds: sourceOrder,
		topicKeys: sourceOrder.map((id) =>
			topicIdentityKey(canvasNodeMarkdownText(liveById.get(id)))
		),
		topicLabels: sourceOrder.map((id) =>
			topicIdentityLabel(canvasNodeMarkdownText(liveById.get(id)))
		)
	};
	const withMetadata = markdownWithTopicMetadata(
		withoutLegacyPluginComments(patched),
		metadata.topicIds,
		metadata.topicKeys,
		metadata.topicLabels
	);
	return addedIds.size === 0 && removedIds.length === 0
		? reorderMarkdownTopicsPreservingSource(withMetadata, canvas)
		: withMetadata;
}
function extractLocalMediaTargets(markdown) {
	const targets = /* @__PURE__ */ new Set();
	const add = (raw) => {
		if (!raw) return;
		let target = String(raw)
			.trim()
			.replace(/^<|>$/g, '')
			.replace(/^["']|["']$/g, '');
		if (
			!target ||
			/^(?:https?:|data:|blob:|obsidian:|mailto:|#)/i.test(target)
		)
			return;
		try {
			target = decodeURIComponent(target);
		} catch (error) {}
		targets.add(target);
	};
	let match;
	const wikiEmbed = /!\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]/g;
	while ((match = wikiEmbed.exec(markdown))) add(match[1]);
	const markdownEmbed =
		/!\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g;
	while ((match = markdownEmbed.exec(markdown))) add(match[1]);
	const htmlMedia =
		/<(?:img|audio|video|source|iframe|object|embed)\b[^>]*(?:src|data)=["']([^"']+)["'][^>]*>/gi;
	while ((match = htmlMedia.exec(markdown))) add(match[1]);
	const mediaLink =
		/(?<!!)\[[^\]]+\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g;
	while ((match = mediaLink.exec(markdown))) {
		const path = match[1].replace(/^<|>$/g, '').split(/[?#]/)[0];
		if (
			/\.(?:avif|bmp|gif|jpe?g|png|svg|webp|pdf|mp3|m4a|ogg|wav|flac|mp4|m4v|mov|webm|ogv)$/i.test(
				path
			)
		)
			add(match[1]);
	}
	return Array.from(targets);
}
var MarkdownMindMapModal = class extends import_obsidian4.Modal {
	constructor(app, onImport) {
		super(app);
		this.onImport = onImport;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Import Markdown mind map' });
		contentEl.createEl('p', {
			text: 'Paste Markmap Markdown, headings, nested lists, or Mermaid mindmap syntax. Formatting, checkboxes, KaTeX, code, tables, embeds, and links are preserved; only positioning is regenerated.'
		});
		const textarea = contentEl.createEl('textarea', {
			cls: 'tomindmap-markdown-import',
			attr: {
				rows: '16',
				placeholder: '# Central topic\n- Main topic\n  - Subtopic'
			}
		});
		const actions = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', { text: 'Cancel' });
		const importButton = actions.createEl('button', {
			text: 'Import',
			cls: 'mod-cta'
		});
		cancel.addEventListener('click', () => this.close());
		const submit = () => {
			const value = textarea.value;
			if (!value.trim()) return;
			this.close();
			this.onImport(value);
		};
		importButton.addEventListener('click', submit);
		textarea.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				submit();
			}
		});
		setTimeout(() => textarea.focus(), 0);
	}
	onClose() {
		this.contentEl.empty();
	}
};
function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
function wrapSvgText(text, width, fontSize) {
	const maxChars = Math.max(5, Math.floor((width - 24) / (fontSize * 0.56)));
	const result = [];
	for (const paragraph of String(text || '')
		.replace(/<br\s*\/?>/gi, '\n')
		.split('\n')) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			result.push('');
			continue;
		}
		let line = '';
		for (const word of words) {
			if (!line) {
				line = word;
			} else if (`${line} ${word}`.length <= maxChars) {
				line += ` ${word}`;
			} else {
				result.push(line);
				line = word;
			}
		}
		if (line) result.push(line);
	}
	return result.slice(0, 12);
}
function safeCssValue(value, fallback = '') {
	return value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent'
		? value
		: fallback;
}
function nearestPaintedBackground(element, fallback = '#ffffff') {
	const ownerWindow = element?.ownerDocument?.defaultView;
	for (
		let current = element;
		current && ownerWindow;
		current = current.parentElement
	) {
		const color = ownerWindow.getComputedStyle(current).backgroundColor;
		if (safeCssValue(color)) return color;
	}
	return fallback;
}
function computedStyleText(element) {
	const ownerWindow = element?.ownerDocument?.defaultView;
	if (!ownerWindow) return '';
	const style = ownerWindow.getComputedStyle(element);
	let result = '';
	for (let index = 0; index < style.length; index++) {
		const property = style[index];
		const value = style.getPropertyValue(property);
		if (value) result += `${property}:${value};`;
	}
	return result;
}
function printableNodeSnapshot(node) {
	if (!node.contentEl) return null;
	let source = null;
	try {
		source =
			node.contentEl
				.querySelector('iframe')
				?.contentDocument?.querySelector('.markdown-preview-sizer') ||
			null;
	} catch (error) {
		source = null;
	}
	source =
		source ||
		node.contentEl.querySelector('.markdown-preview-sizer') ||
		node.contentEl.querySelector('.markdown-preview-view');
	if (!source) return null;
	const clone = source.cloneNode(true);
	const originals = [source, ...source.querySelectorAll('*')];
	const clones = [clone, ...clone.querySelectorAll('*')];
	for (
		let index = 0;
		index < Math.min(originals.length, clones.length);
		index++
	) {
		const styleText = computedStyleText(originals[index]);
		if (styleText) clones[index].setAttribute('style', styleText);
	}
	for (const unsafe of Array.from(
		clone.querySelectorAll(
			'script,style,button,.canvas-node-resizer,.canvas-node-connection-point'
		)
	))
		unsafe.remove();
	for (const element of Array.from(clone.querySelectorAll('*'))) {
		for (const attribute of Array.from(element.attributes)) {
			if (/^on/i.test(attribute.name))
				element.removeAttribute(attribute.name);
		}
	}
	const sourceRect = source.getBoundingClientRect();
	return {
		html: clone.outerHTML,
		rect: sourceRect
	};
}
function edgeAnchor(record, side) {
	switch (side) {
		case 'top':
			return [record.x + record.width / 2, record.y];
		case 'bottom':
			return [record.x + record.width / 2, record.y + record.height];
		case 'left':
			return [record.x, record.y + record.height / 2];
		default:
			return [record.x + record.width, record.y + record.height / 2];
	}
}
function edgeCurve(from, to, fromSide, toSide) {
	const [x1, y1] = edgeAnchor(from, fromSide);
	const [x2, y2] = edgeAnchor(to, toSide);
	if (
		fromSide === 'top' ||
		fromSide === 'bottom' ||
		toSide === 'top' ||
		toSide === 'bottom'
	) {
		const middle = (y1 + y2) / 2;
		return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
	}
	const middle = (x1 + x2) / 2;
	return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
}
function exportMarkerId(color) {
	return `arrow-${String(color || 'default').replace(/[^a-z0-9_-]/gi, '_')}`;
}
function canvasPrintDocument(canvas, scope) {
	const data = canvas.getData();
	const dataById = new Map(data.nodes.map((node) => [node.id, node]));
	const wrapperRect = canvas.wrapperEl.getBoundingClientRect();
	const selectedIds = new Set();
	if (scope === 'selection') {
		for (const item of canvas.selection) {
			if (item && 'nodeEl' in item) selectedIds.add(item.id);
		}
	}
	const records = [];
	for (const node of canvas.nodes.values()) {
		const nodeData = dataById.get(node.id) || {};
		const domRect =
			node.nodeEl && node.nodeEl.getBoundingClientRect
				? node.nodeEl.getBoundingClientRect()
				: null;
		if (scope === 'selection' && !selectedIds.has(node.id)) continue;
		if (
			scope === 'viewport' &&
			(!domRect ||
				domRect.right < wrapperRect.left ||
				domRect.left > wrapperRect.right ||
				domRect.bottom < wrapperRect.top ||
				domRect.top > wrapperRect.bottom)
		)
			continue;
		const viewportMode = scope === 'viewport';
		const rendered =
			nodeData.type === 'group' ? null : printableNodeSnapshot(node);
		const logicalScale = viewportMode
			? 1
			: domRect && node.width
				? domRect.width / node.width
				: 1;
		const visualEl =
			node.nodeEl?.querySelector?.('.canvas-node-container') ||
			node.nodeEl;
		const nodeStyle =
			visualEl &&
			visualEl.ownerDocument?.defaultView?.getComputedStyle(visualEl);
		const contentRect =
			rendered && domRect
				? {
						x:
							(viewportMode
								? domRect.left - wrapperRect.left
								: node.x) +
							(rendered.rect.left - domRect.left) / logicalScale,
						y:
							(viewportMode
								? domRect.top - wrapperRect.top
								: node.y) +
							(rendered.rect.top - domRect.top) / logicalScale,
						width: rendered.rect.width / logicalScale,
						height: rendered.rect.height / logicalScale
					}
				: null;
		records.push({
			id: node.id,
			x: viewportMode ? domRect.left - wrapperRect.left : node.x,
			y: viewportMode ? domRect.top - wrapperRect.top : node.y,
			width: viewportMode ? domRect.width : node.width,
			height: viewportMode ? domRect.height : node.height,
			text:
				nodeData.type === 'group'
					? nodeData.label || 'Group'
					: node.text || '',
			renderedHtml: rendered?.html || '',
			contentRect,
			color: node.color || nodeData.color || '',
			group: nodeData.type === 'group',
			fill: safeCssValue(
				nodeStyle?.backgroundColor,
				nearestPaintedBackground(node.nodeEl)
			),
			stroke: safeCssValue(nodeStyle?.borderColor, ''),
			strokeWidth: parseFloat(nodeStyle?.borderWidth) || 2,
			radius: parseFloat(nodeStyle?.borderRadius) || 0,
			textColor: safeCssValue(
				nodeStyle?.color,
				'var(--text-normal, #1e293b)'
			),
			fontFamily: nodeStyle?.fontFamily || 'system-ui, sans-serif',
			fontSize: parseFloat(nodeStyle?.fontSize) || 14,
			lineHeight: parseFloat(nodeStyle?.lineHeight) || 20
		});
	}
	if (records.length === 0) return null;
	const byId = new Map(records.map((record) => [record.id, record]));
	const edges = [];
	for (const edge of data.edges || []) {
		const from = byId.get(edge.fromNode);
		const to = byId.get(edge.toNode);
		if (from && to)
			edges.push({
				from,
				to,
				color: edge.color || '',
				fromSide: edge.fromSide,
				toSide: edge.toSide
			});
	}
	let minX;
	let minY;
	let maxX;
	let maxY;
	if (scope === 'viewport') {
		minX = 0;
		minY = 0;
		maxX = wrapperRect.width;
		maxY = wrapperRect.height;
	} else {
		minX = Math.min(...records.map((record) => record.x));
		minY = Math.min(...records.map((record) => record.y));
		maxX = Math.max(...records.map((record) => record.x + record.width));
		maxY = Math.max(...records.map((record) => record.y + record.height));
	}
	const padding =
		scope === 'viewport'
			? 0
			: Math.max(
					30,
					Math.min(100, Math.max(maxX - minX, maxY - minY) * 0.04)
				);
	minX -= padding;
	minY -= padding;
	maxX += padding;
	maxY += padding;
	const palette = {
		1: '#ef4444',
		2: '#f97316',
		3: '#eab308',
		4: '#22c55e',
		5: '#06b6d4',
		6: '#3b82f6'
	};
	const colorOf = (value, fallback) =>
		palette[value] || (/^#|^rgb|^hsl/.test(value) ? value : fallback);
	const edgeSvg = edges
		.map(({ from, to, color, fromSide, toSide }) => {
			const stroke = colorOf(color, '#94a3b8');
			return `<path d="${edgeCurve(from, to, fromSide, toSide)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="2" marker-end="url(#${exportMarkerId(color)})"/>`;
		})
		.join('');
	const nodeSvg = records
		.map((record) => {
			const stroke =
				record.stroke ||
				colorOf(record.color, record.group ? '#94a3b8' : '#64748b');
			if (record.group) {
				return `<g><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(record.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${record.strokeWidth}"/><text x="${record.x + 12}" y="${record.y + 22}" font-size="${record.fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(record.textColor)}">${escapeXml(getRootTitle(record.text))}</text></g>`;
			}
			const fontSize = record.fontSize;
			if (record.renderedHtml) {
				const fallbackLines = wrapSvgText(
					record.text,
					record.width,
					fontSize
				);
				const fallbackLineHeight = record.lineHeight;
				const fallbackY =
					record.y +
					Math.max(
						18,
						(record.height -
							fallbackLines.length * fallbackLineHeight) /
							2 +
							fontSize
					);
				const fallbackSpans = fallbackLines
					.map(
						(line, index) =>
							`<tspan x="${record.x + 12}" dy="${index === 0 ? 0 : fallbackLineHeight}">${escapeXml(line)}</tspan>`
					)
					.join('');
				const box = record.contentRect || {
					x: record.x,
					y: record.y,
					width: record.width,
					height: record.height
				};
				return `<g><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(record.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${record.strokeWidth}"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="${record.x + 12}" y="${fallbackY}" font-size="${fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(record.textColor)}">${fallbackSpans}</text><foreignObject x="${box.x}" y="${box.y}" width="${Math.max(1, box.width)}" height="${Math.max(1, box.height)}"><div xmlns="http://www.w3.org/1999/xhtml" class="tomindmap-pdf-card">${record.renderedHtml}</div></foreignObject></g>`;
			}
			const lines = wrapSvgText(record.text, record.width, fontSize);
			const lineHeight = record.lineHeight;
			const textY =
				record.y +
				Math.max(
					18,
					(record.height - lines.length * lineHeight) / 2 + fontSize
				);
			const tspans = lines
				.map(
					(line, index) =>
						`<tspan x="${record.x + 12}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
				)
				.join('');
			return `<g><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(record.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${record.strokeWidth}"/><text x="${record.x + 12}" y="${textY}" font-size="${fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(record.textColor)}">${tspans}</text></g>`;
		})
		.join('');
	const title =
		canvas.view && canvas.view.file
			? canvas.view.file.basename
			: 'Mind map';
	const wrapperStyle =
		canvas.wrapperEl.ownerDocument?.defaultView?.getComputedStyle(
			canvas.wrapperEl
		);
	const background = safeCssValue(
		wrapperStyle?.backgroundColor,
		nearestPaintedBackground(canvas.wrapperEl)
	);
	const markerDefs = [
		...new Set(['', ...edges.map((edge) => edge.color || '')])
	]
		.map((color) => {
			const stroke = colorOf(color, '#94a3b8');
			return `<marker id="${exportMarkerId(color)}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${escapeXml(stroke)}"/></marker>`;
		})
		.join('');
	return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>@page{size:landscape;margin:8mm}html,body{margin:0;width:100%;height:100%;background:${escapeXml(background)}}svg{display:block;width:100vw;height:100vh}.tomindmap-pdf-card{box-sizing:border-box;width:100%;height:100%;overflow:hidden}@media print{svg{width:100%;height:100%}}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}" preserveAspectRatio="xMidYMid meet"><defs>${markerDefs}</defs><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${escapeXml(background)}"/>${edgeSvg}${nodeSvg}</svg></body></html>`;
}
function pdfSvgFromDocument(html, fallbackOnly = false) {
	const match = String(html || '').match(/<svg\b[\s\S]*<\/svg>/i);
	if (!match) return null;
	let svg = match[0];
	const styles = Array.from(
		String(html || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)
	)
		.map((item) => item[1])
		.join('\n');
	if (styles)
		svg = svg.replace(
			/(<svg\b[^>]*>)/i,
			`$1<style>${styles.replace(/<\/style/gi, '<\\/style')}</style>`
		);
	if (fallbackOnly) {
		svg = svg
			.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
			.replace(
				/(<text\b[^>]*data-tomindmap-pdf-fallback="true"[^>]*)\sopacity="0"/gi,
				'$1 opacity="1"'
			);
	}
	const viewBox = svg.match(/\bviewBox="([^"]+)"/i);
	const values = viewBox ? viewBox[1].trim().split(/\s+/).map(Number) : [];
	const width =
		values.length === 4 && Number.isFinite(values[2])
			? Math.max(1, values[2])
			: 1600;
	const height =
		values.length === 4 && Number.isFinite(values[3])
			? Math.max(1, values[3])
			: 900;
	return { svg, width, height };
}
async function renderSvgAsJpeg(svgInfo, ownerDocument) {
	const ownerWindow = ownerDocument.defaultView || window;
	const maxDimension = 4096;
	const scale = Math.min(
		2,
		maxDimension / Math.max(svgInfo.width, svgInfo.height)
	);
	const pixelWidth = Math.max(1, Math.round(svgInfo.width * scale));
	const pixelHeight = Math.max(1, Math.round(svgInfo.height * scale));
	const blob = new Blob([svgInfo.svg], {
		type: 'image/svg+xml;charset=utf-8'
	});
	const url = ownerWindow.URL.createObjectURL(blob);
	try {
		const image = new ownerWindow.Image();
		image.decoding = 'async';
		await new Promise((resolve, reject) => {
			image.onload = resolve;
			image.onerror = () =>
				reject(new Error('Could not render the mind map SVG'));
			image.src = url;
		});
		const bitmap = ownerDocument.createElement('canvas');
		bitmap.width = pixelWidth;
		bitmap.height = pixelHeight;
		const context = bitmap.getContext('2d');
		if (!context) throw new Error('Canvas rendering is unavailable');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, pixelWidth, pixelHeight);
		context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
		const jpeg = await new Promise((resolve, reject) =>
			bitmap.toBlob(
				(value) =>
					value
						? resolve(value)
						: reject(new Error('Could not encode the PDF image')),
				'image/jpeg',
				0.94
			)
		);
		return {
			bytes: new Uint8Array(await jpeg.arrayBuffer()),
			width: pixelWidth,
			height: pixelHeight
		};
	} finally {
		ownerWindow.URL.revokeObjectURL(url);
	}
}
function mindMapPdfBytes(jpeg) {
	const encoder = new TextEncoder();
	const aspect = jpeg.width / jpeg.height;
	const pageWidth = aspect >= 1 ? 1000 : 1000 * aspect;
	const pageHeight = aspect >= 1 ? 1000 / aspect : 1000;
	const content = `q\n${pageWidth.toFixed(3)} 0 0 ${pageHeight.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
	const objects = [
		encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
		encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
		encoder.encode(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
		),
		null,
		encoder.encode(
			`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`
		)
	];
	const header = encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
	const chunks = [header];
	const offsets = [0];
	let byteLength = header.length;
	for (let index = 0; index < objects.length; index++) {
		offsets.push(byteLength);
		const prefix = encoder.encode(`${index + 1} 0 obj\n`);
		let body = objects[index];
		if (index === 3) {
			const imageHeader = encoder.encode(
				`<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`
			);
			const imageFooter = encoder.encode('\nendstream');
			body = new Uint8Array(
				imageHeader.length + jpeg.bytes.length + imageFooter.length
			);
			body.set(imageHeader, 0);
			body.set(jpeg.bytes, imageHeader.length);
			body.set(imageFooter, imageHeader.length + jpeg.bytes.length);
		}
		const suffix = encoder.encode('\nendobj\n');
		chunks.push(prefix, body, suffix);
		byteLength += prefix.length + body.length + suffix.length;
	}
	const xrefOffset = byteLength;
	const xrefLines = [
		`xref`,
		`0 ${objects.length + 1}`,
		'0000000000 65535 f '
	];
	for (let index = 1; index <= objects.length; index++)
		xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
	xrefLines.push(
		`trailer`,
		`<< /Size ${objects.length + 1} /Root 1 0 R >>`,
		`startxref`,
		String(xrefOffset),
		`%%EOF`,
		''
	);
	chunks.push(encoder.encode(xrefLines.join('\n')));
	const result = new Uint8Array(
		chunks.reduce((sum, chunk) => sum + chunk.length, 0)
	);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

var {
	freemindToCanvas,
	layoutTree,
	parseFreeMindXml
} = require('./lib/freemind.js');

// src/main.ts
var CanvasMindMapPlugin = class extends import_obsidian5.Plugin {
	constructor() {
		super(...arguments);
		this.settings = DEFAULT_SETTINGS;
		this.liveSizing = new LiveSizingController(this, getGroupIds);
		this.cleanupClickHandler = null;
		this.cleanupDragHandler = null;
		this.cleanupSubtreeDragHandler = null;
		this.cleanupGroupDragHandler = null;
		this.autoResizeHandle = null;
		this.interceptedCanvas = null;
		this.toggleBtnEl = null;
		this.mediaBtnEl = null;
		this.cleanupToggleHandler = null;
		this.cleanupCardSelectionHandler = null;
		this.cleanupGroupBoundsHandler = null;
		this.cleanupSelectionSyncHandler = null;
		this.cleanupInsertNodeHandler = null;
		this.cleanupRichContentHandler = null;
		this.cleanupMediaDropHandler = null;
		this.cleanupNodeDragReparentHandler = null;
		this.cleanupKeyboardHandler = null;
		this.cleanupPreviewGeometryHandler = null;
		/** Pending timers/observers/RAFs to cancel on unload or canvas switch. */
		this.pendingTimers = /* @__PURE__ */ new Set();
		this.pendingRafs = /* @__PURE__ */ new Set();
		this.pendingObservers = /* @__PURE__ */ new Set();
		/** Cleanup for the current render-aware import sizing pass. */
		this.renderResizeQueueCleanup = null;
		/** Original canvas methods for unwrapping on cleanup. */
		this.origCanvasMethods = {};
		/** Set to true on unload to prevent deferred callbacks from running. */
		this.unloaded = false;
		/** Navigation history for back/forward. */
		this.navHistory = [];
		this.navHistoryIndex = -1;
		this.navSkipTracking = false;
		this.lastNavCanvas = null;
		this.cleanupNavHandler = null;
		this.markdownSyncIndex = /* @__PURE__ */ new Map();
		this.markdownSyncTimers = /* @__PURE__ */ new Map();
		this.markdownModifyTimers = /* @__PURE__ */ new Map();
		this.markdownWriteGuards = /* @__PURE__ */ new Map();
		this.markdownWriteGuardTimers = /* @__PURE__ */ new Map();
		this.markdownOrderDirty = /* @__PURE__ */ new WeakSet();
		this.syncApplyingCanvas = /* @__PURE__ */ new WeakSet();
		this.localCanvasMutations = /* @__PURE__ */ new WeakSet();
		this.immediateMarkdownWrites = /* @__PURE__ */ new WeakMap();
		this.canvasLifecycleTimer = null;
		this.debouncedOutlineRefresh = (0, import_obsidian5.debounce)(() => {
			var _a;
			if (this.unloaded) return;
			const canvas =
				(_a = this.canvasApi.getActiveCanvas()) != null
					? _a
					: this.canvasApi.getAnyCanvas();
			if (canvas) {
				this.refreshOutline(canvas);
			}
		}, 300);
	}
	async onload() {
		await this.loadSettings();
		this.canvasApi = new CanvasAPI(this.app);
		this.nodeOps = new NodeOperations(this.canvasApi, {
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap,
			isAutoAdjust: (canvas) => this.isAutoAdjustCanvas(canvas)
		});
		this.layoutEngine = new LayoutEngine({
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap,
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight
		});
		this.branchColors = new BranchColors(this.canvasApi);
		this.navigation = new Navigation(this.canvasApi);
		this.keyboardHandler = new KeyboardHandler(
			this,
			this.canvasApi,
			this.nodeOps,
			this.layoutEngine,
			this.branchColors,
			() => this.settings.autoColor,
			(canvas) => this.isMindmapCanvas(canvas),
			(canvas) => {
				this.updateGroupBounds(canvas);
				canvas.requestSave();
			}
		);
		this.keyboardHandler.zoomPadding = this.settings.navigationZoomPadding;
		this.keyboardHandler.onFindRequested = (canvas) => {
			void this.showOutline(canvas, true);
		};
		this.keyboardHandler.register();
		this.registerDomEvent(
			document,
			'copy',
			(event) => this.handleMindMapClipboardCopy(event, false),
			true
		);
		this.registerDomEvent(
			document,
			'cut',
			(event) => this.handleMindMapClipboardCopy(event, true),
			true
		);
		this.registerDomEvent(
			document,
			'paste',
			(event) => this.handleMindMapClipboardPaste(event),
			true
		);
		this.addCommand({
			id: 'mindmap-relayout',
			name: 'Re-layout mind map',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (!this.isMindmapCanvas(canvas)) return false;
				if (checking) return true;
				this.layoutEngine.layout(canvas);
				this.updateGroupBounds(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-layout-forest',
			name: 'Layout forest',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (!this.isMindmapCanvas(canvas)) return false;
				const selected = this.canvasApi.getSelectedNode(canvas);
				if (!selected) return false;
				const groupIds = getGroupIds(canvas);
				const cx = selected.x + selected.width / 2;
				const cy = selected.y + selected.height / 2;
				let targetGroupId = null;
				let smallestArea = Infinity;
				for (const gid of groupIds) {
					const g = canvas.nodes.get(gid);
					if (!g) continue;
					if (
						cx >= g.x &&
						cx <= g.x + g.width &&
						cy >= g.y &&
						cy <= g.y + g.height
					) {
						const area = g.width * g.height;
						if (area < smallestArea) {
							smallestArea = area;
							targetGroupId = gid;
						}
					}
				}
				if (!targetGroupId) return false;
				if (checking) return true;
				this.layoutEngine.layoutForest(canvas, targetGroupId);
			}
		});
		this.addCommand({
			id: 'mindmap-open-outline',
			name: 'Open mind map outline',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				if (checking) return true;
				this.showOutline(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-detach-subtree',
			name: 'Detach subtree as independent tree',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (!this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node) return false;
				const parent = this.canvasApi.getParentNode(canvas, node);
				if (!parent) return false;
				if (checking) return true;
				const edges = this.canvasApi.getOutgoingEdges(
					canvas,
					parent.id
				);
				const edge = edges.find((e) => e.to.node.id === node.id);
				if (!edge) return;
				canvas.removeEdge(edge);
				this.canvasApi.invalidateEdgeIndex();
				node.setColor('');
				this.layoutEngine.layoutChildren(canvas, parent.id);
				this.updateGroupBounds(canvas);
				canvas.requestSave();
			}
		});
		this.addCommand({
			id: 'mindmap-resize-subtree',
			name: 'Resize & re-layout selected subtree',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node) return false;
				if (checking) return true;
				const wasEditing = node.isEditing;
				this.resizeNodesWhenRendered(
					canvas,
					this.collectSubtreeNodes(canvas, node)
				);
				if (wasEditing) node.startEditing();
			}
		});
		this.addCommand({
			id: 'mindmap-resize-all',
			name: 'Resize all nodes to fit content',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (!this.isMindmapCanvas(canvas)) return false;
				if (canvas.nodes.size === 0) return false;
				if (checking) return true;
				const groupIds = getGroupIds(canvas);
				this.resizeNodesWhenRendered(
					canvas,
					Array.from(canvas.nodes.values()).filter(
						(node) => !groupIds.has(node.id)
					)
				);
			}
		});
		this.addCommand({
			id: 'mindmap-apply-colors',
			name: 'Apply branch colors',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (!this.isMindmapCanvas(canvas)) return false;
				if (checking) return true;
				this.branchColors.applyColors(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-toggle-mode',
			name: 'Toggle mindmap mode for this canvas',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				this.toggleMindmapMode(canvas);
			}
		});
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				this.onLeafChange(leaf);
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.scheduleCanvasLifecycleRefresh();
			})
		);
		this.registerView(OUTLINE_VIEW_TYPE, (leaf) => new OutlineView(leaf));
		this.app.workspace.onLayoutReady(() => {
			void this.rebuildMarkdownSyncIndex();
			const view = this.app.workspace.getActiveViewOfType(
				import_obsidian5.ItemView
			);
			if (view) this.onLeafChange(view.leaf);
		});
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof import_obsidian5.TFolder) {
					menu.addItem((item) => {
						item.setTitle('Import mind map (.mm) to canvas')
							.setIcon('file-input')
							.onClick(() => this.importFreeMindFile(file.path));
					});
					return;
				}
				if (!(file instanceof import_obsidian5.TFile)) return;
				if (file.extension === 'md') {
					menu.addSeparator();
					menu.addItem((item) => {
						item.setTitle('Convert to mindmap')
							.setIcon('network')
							.onClick(
								() =>
									void this.convertMarkdownFileToMindMap(file)
							);
					});
					return;
				}
				if (file.extension !== 'canvas') return;
				const canvas = this.getOpenCanvasByPath(file.path);
				const linkedPath =
					this.getIndexedMarkdownPath(file.path) ||
					(canvas ? this.getMarkdownSyncPath(canvas.getData()) : '');
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle(
							linkedPath
								? 'Detach from Markdown file'
								: 'Sync to Markdown file'
						)
						.setIcon(linkedPath ? 'unlink' : 'refresh-cw')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas)
								void (linkedPath
									? this.detachMarkdownSync(canvas)
									: this.attachMarkdownSync(canvas));
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Copy whole map as Markdown')
						.setIcon('copy')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas) void this.copyMindMapMarkdown(canvas);
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Export mind map\u2026')
						.setIcon('download')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas) this.openExportModal(canvas);
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Open mind map outline')
						.setIcon('list-tree')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas) this.showOutline(canvas);
						})
				);
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle('Import Markdown from paste\u2026')
						.setIcon('clipboard-paste')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas)
								new MarkdownMindMapModal(this.app, (markdown) =>
									this.importMarkdownIntoCanvas(
										canvas,
										markdown
									)
								).open();
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Import Markdown file\u2026')
						.setIcon('file-input')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas) this.importMarkdownFile(canvas);
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Add images, PDFs, or media\u2026')
						.setIcon('image-plus')
						.setDisabled(!canvas)
						.onClick(() => {
							if (canvas) this.openMediaFilePicker(canvas);
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Validate local media and embeds')
						.setIcon('file-check')
						.setDisabled(!canvas)
						.onClick(() => {
							if (!canvas) return;
							const groupIds = getGroupIds(canvas);
							void this.validateMediaLinks(
								canvas,
								Array.from(canvas.nodes.values()).filter(
									(node) => !groupIds.has(node.id)
								),
								true
							);
						})
				);
			})
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof import_obsidian5.TFile)) return;
				if (
					file.extension === 'md' &&
					this.markdownSyncIndex.has(file.path)
				)
					this.scheduleMarkdownToCanvas(file);
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				void this.handleSyncedFileRename(file, oldPath);
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				void this.handleSyncedFileDelete(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('canvas:node-menu', (menu, node) => {
				const canvas = this.canvasApi.getActiveCanvas();
				menu.addItem((item) => {
					item.setTitle('Copy node link')
						.setIcon('link')
						.onClick(() => {
							const canvasPath = node.canvas.view.file.path;
							if (node.file) {
								const vaultName = this.app.vault.getName();
								void navigator.clipboard.writeText(
									`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(node.file)}`
								);
							} else if (node.url) {
								void navigator.clipboard.writeText(node.url);
							} else {
								void navigator.clipboard.writeText(
									`obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${node.id}`
								);
							}
							new import_obsidian5.Notice('Node link copied');
						});
				});
				if (canvas) {
					const groupIds = getGroupIds(canvas);
					const selectedTopics = Array.from(
						canvas.selection || []
					).filter(
						(item) =>
							item && 'nodeEl' in item && !groupIds.has(item.id)
					);
					const otherTopic =
						selectedTopics.length === 2 &&
						selectedTopics.includes(node)
							? selectedTopics.find((item) => item !== node)
							: null;
					if (
						otherTopic &&
						!this.canvasApi.getParentNode(canvas, otherTopic)
					) {
						menu.addItem((item) => {
							item.setTitle(
								'Connect this topic \u2192 selected topic'
							)
								.setIcon('git-branch-plus')
								.onClick(() => {
									this.connectTopics(
										canvas,
										node,
										otherTopic
									);
								});
						});
					}
					if (this.canvasApi.getParentNode(canvas, node)) {
						menu.addItem((item) => {
							item.setTitle('Separate branch')
								.setIcon('git-fork')
								.onClick(() => {
									if (
										MindmapActions.separateBranch(
											canvas,
											this.canvasApi,
											node
										)
									) {
										if (this.isMindmapCanvas(canvas))
											this.layoutEngine.layout(canvas);
										if (
											this.settings.autoColor &&
											this.isMindmapCanvas(canvas)
										)
											this.branchColors.applyColors(
												canvas
											);
										this.markMarkdownOrderDirty(canvas);
										canvas.requestSave();
										new import_obsidian5.Notice(
											'Separated branch into standalone tree'
										);
									}
								});
						});
					}
					const forest = buildForest(canvas);
					const treeNode = findTreeForNode(forest, node.id);
					if (treeNode && treeNode.children.length > 0) {
						const data =
							typeof node.getData === 'function'
								? node.getData()
								: node.unknownData || {};
						const isCollapsed = !!data.collapsed;
						menu.addItem((item) => {
							item.setTitle(
								isCollapsed
									? 'Expand subtree'
									: 'Collapse subtree'
							)
								.setIcon(
									isCollapsed
										? 'folder-open'
										: 'folder-closed'
								)
								.onClick(() => {
									const nextState =
										MindmapActions.toggleSubtreeCollapse(
											canvas,
											forest,
											node
										);
									if (this.isMindmapCanvas(canvas))
										this.layoutEngine.layout(canvas);
									canvas.requestSave();
									new import_obsidian5.Notice(
										nextState
											? 'Subtree collapsed'
											: 'Subtree expanded'
									);
								});
						});
					}
					menu.addItem((item) => {
						item.setTitle('Color branch')
							.setIcon('palette')
							.onClick(() => {
								const colors = ['1', '2', '3', '4', '5', '6'];
								const currentColor = node.color || '1';
								const nextIndex =
									(colors.indexOf(currentColor) + 1) %
									colors.length;
								const nextColor = colors[nextIndex];
								const currentForest = buildForest(canvas);
								const count = MindmapActions.colorBranch(
									canvas,
									currentForest,
									node,
									nextColor
								);
								canvas.requestSave();
								new import_obsidian5.Notice(
									`Applied color to ${count} topic${count === 1 ? '' : 's'}`
								);
							});
					});
					if (groupIds.has(node.id)) {
						menu.addItem((item) => {
							item.setTitle('Layout forest')
								.setIcon('layout-grid')
								.onClick(() => {
									this.layoutEngine.layoutForest(
										canvas,
										node.id
									);
									this.updateGroupBounds(canvas);
								});
						});
					}
				}
			})
		);
		this.registerObsidianProtocolHandler(
			'tomindmap-navigate',
			async (params) => {
				var _a;
				const nodeId = params.id;
				if (!nodeId) return;
				const canvasPath = params.canvas;
				if (canvasPath) {
					const file =
						this.app.vault.getAbstractFileByPath(canvasPath);
					if (file && file instanceof import_obsidian5.TFile) {
						const leaf = this.app.workspace.getLeaf();
						await leaf.openFile(file);
						await new Promise((resolve) =>
							setTimeout(resolve, 200)
						);
					}
				}
				const canvas =
					(_a = this.canvasApi.getActiveCanvas()) != null
						? _a
						: this.canvasApi.getAnyCanvas();
				if (!canvas) {
					new import_obsidian5.Notice('Canvas not found');
					return;
				}
				const node = canvas.nodes.get(nodeId);
				if (!node) {
					new import_obsidian5.Notice('Target node not found');
					return;
				}
				this.canvasApi.selectAndZoom(
					canvas,
					node,
					this.settings.navigationZoomPadding
				);
			}
		);
		this.addCommand({
			id: 'mindmap-nav-back',
			name: 'Navigate back',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || this.navHistoryIndex <= 0) return false;
				if (checking) return true;
				this.navigateBack(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-nav-forward',
			name: 'Navigate forward',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (
					!canvas ||
					this.navHistoryIndex >= this.navHistory.length - 1
				)
					return false;
				if (checking) return true;
				this.navigateForward(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-import-freemind',
			name: 'Import mind map (.mm) file to canvas',
			callback: () => this.importFreeMindFile()
		});
		this.addCommand({
			id: 'mindmap-copy-markdown',
			name: 'Copy whole mind map as Markdown',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || buildForest(canvas).length === 0) return false;
				if (checking) return true;
				void this.copyMindMapMarkdown(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-save-markdown',
			name: 'Sync / detach Markdown file',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || buildForest(canvas).length === 0) return false;
				if (checking) return true;
				void (this.getMarkdownSyncPath(canvas.getData())
					? this.detachMarkdownSync(canvas)
					: this.attachMarkdownSync(canvas));
			}
		});
		this.addCommand({
			id: 'mindmap-import-markdown-paste',
			name: 'Import Markdown into current canvas (paste)',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				new MarkdownMindMapModal(this.app, (markdown) =>
					this.importMarkdownIntoCanvas(canvas, markdown)
				).open();
			}
		});
		this.addCommand({
			id: 'mindmap-import-markdown-file',
			name: 'Import Markdown file into current canvas',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				this.importMarkdownFile(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-add-media',
			name: 'Add images, PDFs, or media',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				this.openMediaFilePicker(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-validate-media',
			name: 'Validate local media and embeds',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || canvas.nodes.size === 0) return false;
				if (checking) return true;
				const groupIds = getGroupIds(canvas);
				const nodes = Array.from(canvas.nodes.values()).filter(
					(node) => !groupIds.has(node.id)
				);
				void this.validateMediaLinks(canvas, nodes, true);
			}
		});
		this.addCommand({
			id: 'mindmap-export',
			name: 'Export mind map\u2026',
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				this.openExportModal(canvas);
			}
		});
		this.addSettingTab(new MindMapSettingTab(this.app, this));
	}
	pushNavHistory(nodeId) {
		if (this.navHistory[this.navHistoryIndex] === nodeId) return;
		this.navHistory.splice(this.navHistoryIndex + 1);
		this.navHistory.push(nodeId);
		if (this.navHistory.length > 50) this.navHistory.shift();
		this.navHistoryIndex = this.navHistory.length - 1;
	}
	navigateBack(canvas) {
		var _a, _b;
		if (this.navHistoryIndex <= 0) return;
		(_b =
			(_a = this.keyboardHandler) == null
				? void 0
				: _a.onBeforeLeaveNode) == null
			? void 0
			: _b.call(_a);
		this.navSkipTracking = true;
		this.navHistoryIndex--;
		const nodeId = this.navHistory[this.navHistoryIndex];
		const node = canvas.nodes.get(nodeId);
		if (!node) {
			this.navSkipTracking = false;
			return;
		}
		this.canvasApi.selectAndZoom(
			canvas,
			node,
			this.settings.navigationZoomPadding
		);
		this.navSkipTracking = false;
	}
	navigateForward(canvas) {
		var _a, _b;
		if (this.navHistoryIndex >= this.navHistory.length - 1) return;
		(_b =
			(_a = this.keyboardHandler) == null
				? void 0
				: _a.onBeforeLeaveNode) == null
			? void 0
			: _b.call(_a);
		this.navSkipTracking = true;
		this.navHistoryIndex++;
		const nodeId = this.navHistory[this.navHistoryIndex];
		const node = canvas.nodes.get(nodeId);
		if (!node) {
			this.navSkipTracking = false;
			return;
		}
		this.canvasApi.selectAndZoom(
			canvas,
			node,
			this.settings.navigationZoomPadding
		);
		this.navSkipTracking = false;
	}
	onunload() {
		this.unloaded = true;
		if (this.canvasLifecycleTimer !== null) {
			clearTimeout(this.canvasLifecycleTimer);
			this.canvasLifecycleTimer = null;
		}
		void flushCanvasView(this.interceptedCanvas, this.app.vault).catch(
			(error) => {
				console.error(
					'ToMindMap: could not flush the active Canvas during unload',
					error
				);
			}
		);
		this.cancelPendingAsync();
		for (const id of this.markdownSyncTimers.values()) clearTimeout(id);
		this.markdownSyncTimers.clear();
		for (const id of this.markdownModifyTimers.values()) clearTimeout(id);
		this.markdownModifyTimers.clear();
		for (const id of this.markdownWriteGuardTimers.values())
			clearTimeout(id);
		this.markdownWriteGuardTimers.clear();
		this.markdownWriteGuards.clear();
		this.unwrapCanvasMethods();
		if (this.cleanupClickHandler) {
			this.cleanupClickHandler();
			this.cleanupClickHandler = null;
		}
		if (this.cleanupDragHandler) {
			this.cleanupDragHandler();
			this.cleanupDragHandler = null;
		}
		if (this.cleanupSubtreeDragHandler) {
			this.cleanupSubtreeDragHandler();
			this.cleanupSubtreeDragHandler = null;
		}
		if (this.cleanupGroupDragHandler) {
			this.cleanupGroupDragHandler();
			this.cleanupGroupDragHandler = null;
		}
		if (this.cleanupGroupBoundsHandler) {
			this.cleanupGroupBoundsHandler();
			this.cleanupGroupBoundsHandler = null;
		}
		if (this.cleanupSelectionSyncHandler) {
			this.cleanupSelectionSyncHandler();
			this.cleanupSelectionSyncHandler = null;
		}
		if (this.cleanupInsertNodeHandler) {
			this.cleanupInsertNodeHandler();
			this.cleanupInsertNodeHandler = null;
		}
		if (this.cleanupRichContentHandler) {
			this.cleanupRichContentHandler();
			this.cleanupRichContentHandler = null;
		}
		if (this.cleanupMediaDropHandler) {
			this.cleanupMediaDropHandler();
			this.cleanupMediaDropHandler = null;
		}
		if (this.cleanupNodeDragReparentHandler) {
			this.cleanupNodeDragReparentHandler();
			this.cleanupNodeDragReparentHandler = null;
		}
		if (this.cleanupKeyboardHandler) {
			this.cleanupKeyboardHandler();
			this.cleanupKeyboardHandler = null;
		}
		if (this.cleanupPreviewGeometryHandler) {
			this.cleanupPreviewGeometryHandler();
			this.cleanupPreviewGeometryHandler = null;
		}
		if (this.cleanupNavHandler) {
			this.cleanupNavHandler();
			this.cleanupNavHandler = null;
		}
		if (this.cleanupToggleHandler) {
			this.cleanupToggleHandler();
			this.cleanupToggleHandler = null;
		}
		if (this.cleanupCardSelectionHandler) {
			this.cleanupCardSelectionHandler();
			this.cleanupCardSelectionHandler = null;
		}
		if (this.autoResizeHandle) {
			this.autoResizeHandle.cleanup();
			this.autoResizeHandle = null;
		}
		this.lastNavCanvas = null;
		if (this.toggleBtnEl) {
			this.toggleBtnEl.remove();
			this.toggleBtnEl = null;
		}
		if (this.mediaBtnEl) {
			this.mediaBtnEl.remove();
			this.mediaBtnEl = null;
		}
	}
	/**
	 * Called when the active leaf changes — set up canvas-specific UI.
	 */
	scheduleCanvasLifecycleRefresh() {
		if (this.canvasLifecycleTimer !== null)
			clearTimeout(this.canvasLifecycleTimer);
		this.canvasLifecycleTimer = setTimeout(() => {
			this.canvasLifecycleTimer = null;
			if (this.unloaded) return;
			const view = this.app.workspace.getActiveViewOfType(
				import_obsidian5.ItemView
			);
			this.onLeafChange(view?.leaf || null);
		}, 50);
	}
	onLeafChange(leaf) {
		var _a, _b, _c;
		if (
			((_a = leaf == null ? void 0 : leaf.view) == null
				? void 0
				: _a.getViewType()) === OUTLINE_VIEW_TYPE
		)
			return;
		const activeCanvas = this.canvasApi.getActiveCanvas();
		if (activeCanvas && activeCanvas === this.interceptedCanvas) return;
		const previousCanvas = this.interceptedCanvas;
		const previousCanvasPath = previousCanvas?.view?.file?.path;
		const pendingMarkdownWrite = previousCanvasPath
			? this.markdownSyncTimers.get(previousCanvasPath)
			: null;
		if (previousCanvas) {
			void flushCanvasView(previousCanvas, this.app.vault).catch(
				(error) => {
					console.error(
						'ToMindMap: could not flush Canvas changes before switching views',
						error
					);
				}
			);
		}
		if (previousCanvas && pendingMarkdownWrite) {
			clearTimeout(pendingMarkdownWrite);
			this.markdownSyncTimers.delete(previousCanvasPath);
			void this.flushCanvasToMarkdown(previousCanvas);
		}
		this.cancelPendingAsync();
		this.unwrapCanvasMethods();
		if (this.cleanupClickHandler) {
			this.cleanupClickHandler();
			this.cleanupClickHandler = null;
		}
		if (this.cleanupDragHandler) {
			this.cleanupDragHandler();
			this.cleanupDragHandler = null;
		}
		if (this.cleanupSubtreeDragHandler) {
			this.cleanupSubtreeDragHandler();
			this.cleanupSubtreeDragHandler = null;
		}
		if (this.cleanupGroupDragHandler) {
			this.cleanupGroupDragHandler();
			this.cleanupGroupDragHandler = null;
		}
		if (this.cleanupGroupBoundsHandler) {
			this.cleanupGroupBoundsHandler();
			this.cleanupGroupBoundsHandler = null;
		}
		if (this.cleanupSelectionSyncHandler) {
			this.cleanupSelectionSyncHandler();
			this.cleanupSelectionSyncHandler = null;
		}
		if (this.cleanupInsertNodeHandler) {
			this.cleanupInsertNodeHandler();
			this.cleanupInsertNodeHandler = null;
		}
		if (this.cleanupRichContentHandler) {
			this.cleanupRichContentHandler();
			this.cleanupRichContentHandler = null;
		}
		if (this.cleanupMediaDropHandler) {
			this.cleanupMediaDropHandler();
			this.cleanupMediaDropHandler = null;
		}
		if (this.cleanupNodeDragReparentHandler) {
			this.cleanupNodeDragReparentHandler();
			this.cleanupNodeDragReparentHandler = null;
		}
		if (this.cleanupKeyboardHandler) {
			this.cleanupKeyboardHandler();
			this.cleanupKeyboardHandler = null;
		}
		if (this.cleanupPreviewGeometryHandler) {
			this.cleanupPreviewGeometryHandler();
			this.cleanupPreviewGeometryHandler = null;
		}
		if (this.cleanupNavHandler) {
			this.cleanupNavHandler();
			this.cleanupNavHandler = null;
		}
		if (this.cleanupToggleHandler) {
			this.cleanupToggleHandler();
			this.cleanupToggleHandler = null;
		}
		if (this.cleanupCardSelectionHandler) {
			this.cleanupCardSelectionHandler();
			this.cleanupCardSelectionHandler = null;
		}
		if (this.autoResizeHandle) {
			this.autoResizeHandle.cleanup();
			this.autoResizeHandle = null;
		}
		const canvas = this.canvasApi.getActiveCanvas();
		if (canvas && canvas !== this.lastNavCanvas) {
			this.navHistory = [];
			this.navHistoryIndex = -1;
		}
		if (canvas) {
			this.lastNavCanvas = canvas;
		}
		if (!canvas) {
			if (this.toggleBtnEl) {
				this.toggleBtnEl.remove();
				this.toggleBtnEl = null;
			}
			if (this.mediaBtnEl) {
				this.mediaBtnEl.remove();
				this.mediaBtnEl = null;
			}
			this.hideOutline();
			return;
		}
		const canvasData = canvas.getData();
		const pendingResizeIds = new Set(
			Array.isArray(canvasData.mindmapPendingResize)
				? canvasData.mindmapPendingResize
				: []
		);
		const needsSizeMigration =
			canvasData.mindmapLayoutVersion !== CARD_LAYOUT_VERSION;
		if (
			Object.prototype.hasOwnProperty.call(
				canvasData,
				'mindmapAutoAdjust'
			)
		) {
			delete canvasData.mindmapAutoAdjust;
			canvas.setData(canvasData);
			canvas.requestSave();
		}
		this.injectToggleButton(canvas);
		const onCardPointerDown = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			if (event.button !== 0) return;
			const target = event.target;
			if (
				target?.closest?.(
					'.canvas-node-connection-point, .canvas-node-resizer, .canvas-node-resizers'
				)
			)
				return;
			const node = findNodeFromEvent(canvas, event);
			if (!node) return;
			canvas.selectOnly(node);
			canvas.requestFrame();
		};
		canvas.wrapperEl.addEventListener(
			'pointerdown',
			onCardPointerDown,
			true
		);
		this.cleanupCardSelectionHandler = () => {
			canvas.wrapperEl.removeEventListener(
				'pointerdown',
				onCardPointerDown,
				true
			);
		};
		this.cleanupKeyboardHandler =
			this.keyboardHandler.attachToCanvas(canvas);
		this.cleanupClickHandler = this.navigation.registerClickHandler(canvas);
		// Card movement, subtree movement, attachment preview, and commit are
		// deliberately owned by registerNodeDragReparentHandler. Multiple gesture
		// owners used to race each other and could save a transient preview.
		this.cleanupDragHandler = null;
		this.cleanupSubtreeDragHandler = null;
		this.cleanupGroupDragHandler = registerGroupDragHandler(
			canvas,
			this.canvasApi,
			() => this.isMindmapCanvas(canvas)
		);
		const onDragEnd = () => {
			if (this.isMindmapCanvas(canvas))
				this.trackedRaf(() => this.updateGroupBounds(canvas));
		};
		canvas.wrapperEl.addEventListener('pointerup', onDragEnd);
		this.cleanupGroupBoundsHandler = () =>
			canvas.wrapperEl.removeEventListener('pointerup', onDragEnd);
		const syncOutlineSelection = () => {
			this.trackedRaf(() => {
				this.updateNodeTypeAttributes(canvas);
				const selected =
					canvas.selection && canvas.selection.size === 1
						? canvas.selection.values().next().value
						: null;
				for (const node of canvas.nodes.values()) {
					if (!node.nodeEl) continue;
					const isLiveNavigationSelection =
						selected === node &&
						!node.isEditing &&
						this.isMindmapCanvas(canvas) &&
						!getGroupIds(canvas).has(node.id);
					node.nodeEl.toggleClass(
						'tomindmap-navigation-selected',
						isLiveNavigationSelection
					);
				}
				for (const leaf2 of this.app.workspace.getLeavesOfType(
					OUTLINE_VIEW_TYPE
				)) {
					if (leaf2.view instanceof OutlineView) {
						leaf2.view.syncHighlightFromCanvas(canvas);
					}
				}
			});
		};
		const onCanvasClick = () => syncOutlineSelection();
		const onCanvasKeydown = (e) => {
			if (e.key === 'Escape') syncOutlineSelection();
			if (e.key === 's' && (e.ctrlKey || e.metaKey) && !e.shiftKey)
				syncOutlineSelection();
		};
		canvas.wrapperEl.addEventListener('click', onCanvasClick);
		canvas.wrapperEl.addEventListener('keydown', onCanvasKeydown);
		this.cleanupSelectionSyncHandler = () => {
			canvas.wrapperEl.removeEventListener('click', onCanvasClick);
			canvas.wrapperEl.removeEventListener('keydown', onCanvasKeydown);
		};
		const onInsertNodeClick = (e) => {
			if (!this.isMindmapCanvas(canvas)) return;
			if (!e.altKey) return;
			const target = e.target;
			const connectionPoint = target.closest(
				'.canvas-node-connection-point'
			);
			if (!connectionPoint) return;
			const side = connectionPoint.getAttribute('data-side');
			if (!side) return;
			const canvasPos = canvas.posFromEvt(e);
			let clickedNode = null;
			let closestDist = Infinity;
			for (const node of canvas.nodes.values()) {
				const cx = node.x + node.width / 2;
				const cy = node.y + node.height / 2;
				const dist = Math.hypot(canvasPos.x - cx, canvasPos.y - cy);
				if (dist < closestDist) {
					closestDist = dist;
					clickedNode = node;
				}
			}
			if (!clickedNode) return;
			const incomingEdges = [];
			const outgoingEdges = [];
			for (const edge of canvas.edges.values()) {
				if (
					edge.to.node.id === clickedNode.id &&
					edge.to.side === side
				) {
					incomingEdges.push(edge);
				}
				if (
					edge.from.node.id === clickedNode.id &&
					edge.from.side === side
				) {
					outgoingEdges.push(edge);
				}
			}
			const edges =
				outgoingEdges.length > 0 ? outgoingEdges : incomingEdges;
			if (edges.length === 0) return;
			e.preventDefault();
			e.stopPropagation();
			const isOutgoing = outgoingEdges.length > 0;
			const fromSide = edges[0].from.side;
			const toSide = edges[0].to.side;
			if (isOutgoing) {
				const children = edges.map((edge) => edge.to.node);
				const avgY =
					children.reduce((s, c) => s + c.y + c.height / 2, 0) /
					children.length;
				const midX =
					(clickedNode.x + clickedNode.width + children[0].x) / 2 -
					this.settings.defaultNodeWidth / 2;
				const midY = avgY - this.settings.defaultNodeHeight / 2;
				const newNode = this.canvasApi.createTextNode(
					canvas,
					midX,
					midY
				);
				for (const edge of edges) canvas.removeEdge(edge);
				this.canvasApi.invalidateEdgeIndex();
				this.canvasApi.createEdge(
					canvas,
					clickedNode,
					newNode,
					fromSide,
					toSide
				);
				for (const child of children) {
					this.canvasApi.createEdge(
						canvas,
						newNode,
						child,
						fromSide,
						toSide
					);
				}
				this.finishInsertNode(canvas, newNode, clickedNode);
			} else {
				const edge = edges[0];
				const parentNode = edge.from.node;
				const midX =
					(parentNode.x +
						parentNode.width / 2 +
						clickedNode.x +
						clickedNode.width / 2) /
						2 -
					this.settings.defaultNodeWidth / 2;
				const midY =
					(parentNode.y +
						parentNode.height / 2 +
						clickedNode.y +
						clickedNode.height / 2) /
						2 -
					this.settings.defaultNodeHeight / 2;
				const newNode = this.canvasApi.createTextNode(
					canvas,
					midX,
					midY
				);
				canvas.removeEdge(edge);
				this.canvasApi.invalidateEdgeIndex();
				this.canvasApi.createEdge(
					canvas,
					parentNode,
					newNode,
					fromSide,
					toSide
				);
				this.canvasApi.createEdge(
					canvas,
					newNode,
					clickedNode,
					fromSide,
					toSide
				);
				this.finishInsertNode(canvas, newNode, parentNode);
			}
		};
		canvas.wrapperEl.addEventListener('click', onInsertNodeClick, true);
		this.cleanupInsertNodeHandler = () =>
			canvas.wrapperEl.removeEventListener(
				'click',
				onInsertNodeClick,
				true
			);
		const onRichContentClick = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			const target = event.target;
			if (
				!target ||
				target.tagName !== 'INPUT' ||
				target.type !== 'checkbox' ||
				!target.closest('.task-list-item')
			)
				return;
			const node = findNodeFromEvent(canvas, event);
			if (!node || typeof node.text !== 'string') return;
			const nodeCheckboxes = node.nodeEl
				? Array.from(
						node.nodeEl.querySelectorAll(
							".task-list-item-checkbox, .task-list-item input[type='checkbox']"
						)
					)
				: [];
			const checkboxIndex = nodeCheckboxes.indexOf(target);
			if (checkboxIndex < 0) return;
			let seen = -1;
			let changed = false;
			const updated = node.text.replace(
				/^(\s*[-+*]\s+\[)([ xX])(\])/gm,
				(match, prefix, state, suffix) => {
					seen++;
					if (seen !== checkboxIndex) return match;
					changed = true;
					return `${prefix}${state.toLowerCase() === 'x' ? ' ' : 'x'}${suffix}`;
				}
			);
			if (!changed) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			node.setText(updated);
			canvas.requestSave();
			this.waitForPreview(node, () => {
				if (
					this.isAutoAdjustCanvas(canvas) &&
					this.isMindmapCanvas(canvas)
				) {
					this.resizeNodesWhenRendered(canvas, [node]);
				}
			});
		};
		canvas.wrapperEl.addEventListener('click', onRichContentClick, true);
		const onMediaLoadError = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			const target = event.target;
			if (
				!target ||
				![
					'IMG',
					'AUDIO',
					'VIDEO',
					'SOURCE',
					'IFRAME',
					'OBJECT',
					'EMBED'
				].includes(target.tagName)
			)
				return;
			const node = findNodeFromEvent(canvas, event);
			if (!node || !node.nodeEl) return;
			const source =
				target.getAttribute('src') ||
				target.getAttribute('data') ||
				'embedded media';
			node.nodeEl.addClass('tomindmap-missing-media');
			node.nodeEl.setAttribute(
				'data-tomindmap-missing-media',
				`Could not load: ${source}`
			);
			if (typeof node.setColor === 'function') node.setColor('1');
			canvas.requestSave();
		};
		canvas.wrapperEl.addEventListener('error', onMediaLoadError, true);
		this.cleanupRichContentHandler = () => {
			canvas.wrapperEl.removeEventListener(
				'click',
				onRichContentClick,
				true
			);
			canvas.wrapperEl.removeEventListener(
				'error',
				onMediaLoadError,
				true
			);
		};
		this.cleanupMediaDropHandler = this.registerMediaDropHandler(canvas);
		this.cleanupNodeDragReparentHandler =
			this.registerNodeDragReparentHandler(canvas);
		this.autoResizeHandle = registerAutoResize(
			canvas,
			{
				enabled: () => this.isMindmapCanvas(canvas)
			},
			(canvas2, editedNode) => {
				this.waitForPreview(editedNode, () => {
					if (this.canvasApi.getActiveCanvas() !== canvas2) return;
					if (
						!this.isAutoAdjustCanvas(canvas2) ||
						!this.isMindmapCanvas(canvas2)
					) {
						return;
					}
					this.resizeNodesWhenRendered(canvas2, [editedNode]);
				});
			}
		);
		this.keyboardHandler.onBeforeLeaveNode = () => {
			var _a2;
			(_a2 = this.autoResizeHandle) == null ? void 0 : _a2.finalizeNode();
			const node = this.canvasApi.getSelectedNode(canvas);
			if (
				(node == null ? void 0 : node.isEditing) &&
				this.isAutoAdjustCanvas(canvas) &&
				this.isMindmapCanvas(canvas)
			) {
				this.waitForPreview(node, () => {
					if (this.canvasApi.getActiveCanvas() !== canvas) return;
					this.resizeNodesWhenRendered(canvas, [node]);
				});
			}
		};
		if (this.settings.mouseNavigation) {
			const onPointerDown = (e) => {
				if (e.button === 3) {
					e.preventDefault();
					e.stopImmediatePropagation();
					this.navigateBack(canvas);
				}
				if (e.button === 4) {
					e.preventDefault();
					e.stopImmediatePropagation();
					this.navigateForward(canvas);
				}
			};
			canvas.wrapperEl.addEventListener(
				'pointerdown',
				onPointerDown,
				true
			);
			this.cleanupNavHandler = () =>
				canvas.wrapperEl.removeEventListener(
					'pointerdown',
					onPointerDown,
					true
				);
		}
		if (this.settings.autoColor && this.isMindmapCanvas(canvas)) {
			this.branchColors.applyColors(canvas);
		}
		this.trackedRaf(() => this.applyMissingMediaMarkers(canvas));
		const origSave = canvas.requestSave.bind(canvas);
		const origCreateGroup = canvas.createGroupNode.bind(canvas);
		const origUndo = (_b = canvas.undo) == null ? void 0 : _b.bind(canvas);
		const origRedo = (_c = canvas.redo) == null ? void 0 : _c.bind(canvas);
		const origSelectOnly = canvas.selectOnly.bind(canvas);
		const origDeselectAll = canvas.deselectAll.bind(canvas);
		const origImportData = canvas.importData.bind(canvas);
		const origRemoveEdge = canvas.removeEdge.bind(canvas);
		this.origCanvasMethods = {
			requestSave: origSave,
			createGroupNode: origCreateGroup,
			undo: origUndo,
			redo: origRedo,
			selectOnly: origSelectOnly,
			deselectAll: origDeselectAll,
			importData: origImportData,
			removeEdge: origRemoveEdge
		};
		this.interceptedCanvas = canvas;
		canvas.deselectAll = () => {
			origDeselectAll();
			for (const node of canvas.nodes.values()) {
				var _a2;
				(_a2 = node.nodeEl) == null
					? void 0
					: _a2.removeClass('tomindmap-navigation-selected');
			}
		};
		canvas.selectOnly = (item) => {
			origSelectOnly(item);
			for (const node of canvas.nodes.values()) {
				var _a2;
				(_a2 = node.nodeEl) == null
					? void 0
					: _a2.removeClass('tomindmap-navigation-selected');
			}
			if (
				this.isMindmapCanvas(canvas) &&
				'nodeEl' in item &&
				!getGroupIds(canvas).has(item.id) &&
				!item.isEditing &&
				item.nodeEl
			) {
				item.nodeEl.addClass('tomindmap-navigation-selected');
			}
			if (!this.navSkipTracking && 'nodeEl' in item) {
				this.pushNavHistory(item.id);
			}
		};
		canvas.requestSave = (...args) => {
			this.updateNodeTypeAttributes(canvas);
			const result = origSave(...args);
			this.debouncedOutlineRefresh();
			this.scheduleCanvasToMarkdown(canvas);
			return result;
		};
		canvas.importData = (...args) => {
			const result = origImportData(...args);
			this.canvasApi.invalidateEdgeIndex();
			return result;
		};
		canvas.removeEdge = (...args) => {
			const result = origRemoveEdge(...args);
			this.canvasApi.invalidateEdgeIndex();
			return result;
		};
		canvas.createGroupNode = (options) => {
			const group = origCreateGroup(options);
			this.updateGroupBounds(canvas);
			return group;
		};
		if (origUndo) {
			canvas.undo = () => {
				origUndo();
				this.canvasApi.invalidateEdgeIndex();
				this.markMarkdownOrderDirty(canvas);
				this.debouncedOutlineRefresh();
				this.scheduleCanvasToMarkdown(canvas);
			};
		}
		if (origRedo) {
			canvas.redo = () => {
				origRedo();
				this.canvasApi.invalidateEdgeIndex();
				this.markMarkdownOrderDirty(canvas);
				this.debouncedOutlineRefresh();
				this.scheduleCanvasToMarkdown(canvas);
			};
		}
		if (this.isMindmapCanvas(canvas)) {
			this.updateNodeTypeAttributes(canvas);
			const refreshPreviewGeometry = () => {
				const groupIds = getGroupIds(canvas);
				for (const node of canvas.nodes.values()) {
					if (isTextTopicCard(node, groupIds))
						this.liveSizing.getPreviewSizer(node);
				}
			};
			refreshPreviewGeometry();
			if (typeof MutationObserver !== 'undefined' && canvas.wrapperEl) {
				const previewObserver = new MutationObserver(
					refreshPreviewGeometry
				);
				previewObserver.observe(canvas.wrapperEl, {
					childList: true,
					subtree: true
				});
				this.pendingObservers.add(previewObserver);
				this.cleanupPreviewGeometryHandler = () => {
					previewObserver.disconnect();
					this.pendingObservers.delete(previewObserver);
				};
			}
			this.refreshOutline(canvas);
			this.trackedRaf(() => {
				if (
					this.canvasApi.getActiveCanvas() !== canvas ||
					!this.isMindmapCanvas(canvas)
				)
					return;
				this.updateNodeTypeAttributes(canvas);
				refreshPreviewGeometry();
				const groupIds = getGroupIds(canvas);
				const topics = Array.from(canvas.nodes.values()).filter(
					(node) => isTextTopicCard(node, groupIds)
				);
				const topicsToResize = needsSizeMigration
					? topics
					: topics.filter((node) => pendingResizeIds.has(node.id));
				if (topicsToResize.length > 0) {
					this.resizeNodesWhenRendered(canvas, topicsToResize);
				} else {
					// Canvas already persisted x/y/width/height. A clean view attach
					// must not recompute geometry merely because the tab was reopened.
					this.updateGroupBounds(canvas);
				}
			});
			for (const delay of [120, 450]) {
				this.trackedTimeout(() => {
					if (
						this.canvasApi.getActiveCanvas() !== canvas ||
						!this.isMindmapCanvas(canvas)
					)
						return;
					// Virtualized cards can materialize after the first frame, so keep
					// their interaction classes current without touching saved geometry.
					this.updateNodeTypeAttributes(canvas);
					refreshPreviewGeometry();
				}, delay);
			}
		} else {
			this.hideOutline();
		}
		const canvasFile = canvas.view && canvas.view.file;
		const markdownPath = this.getMarkdownSyncPath(canvas.getData());
		if (canvasFile && markdownPath) {
			this.indexMarkdownLink(canvasFile.path, markdownPath);
			const source = this.app.vault.getAbstractFileByPath(markdownPath);
			if (source instanceof import_obsidian5.TFile) {
				const canvasModified = Number(canvasFile.stat?.mtime || 0);
				const markdownModified = Number(source.stat?.mtime || 0);
				if (canvasModified > markdownModified) {
					this.trackedTimeout(
						() => void this.flushCanvasToMarkdown(canvas),
						80
					);
				} else {
					this.trackedTimeout(
						() => void this.syncMarkdownFileToCanvases(source),
						80
					);
				}
			} else {
				void this.detachMarkdownSync(canvas, false);
			}
		}
	}
	refreshOutline(canvas) {
		for (const leaf of this.app.workspace.getLeavesOfType(
			OUTLINE_VIEW_TYPE
		)) {
			const view = leaf.view;
			if (view instanceof OutlineView) {
				view.zoomPadding = this.settings.navigationZoomPadding;
				view.onForestLayout = (c, groupId) => {
					this.layoutEngine.layoutForest(c, groupId);
					this.updateGroupBounds(c);
				};
				view.refresh(canvas);
			}
		}
	}
	/**
	 * Collect a node and all its descendants via BFS.
	 */
	collectSubtreeNodes(canvas, root) {
		const result = [root];
		const visited = /* @__PURE__ */ new Set([root.id]);
		const queue = [root.id];
		for (let cursor = 0; cursor < queue.length; cursor++) {
			const id = queue[cursor];
			for (const edge of this.canvasApi.getOutgoingEdges(canvas, id)) {
				const childId = edge.to.node.id;
				if (!visited.has(childId)) {
					visited.add(childId);
					result.push(edge.to.node);
					queue.push(childId);
				}
			}
		}
		return result;
	}
	/**
	 * Recalculate bounds for all groups to tightly fit their contained subtrees.
	 * A root node belongs to a group if its center is inside the group's current bounds.
	 */
	updateGroupBounds(canvas) {
		var _a;
		const PADDING = 20;
		const groupIds = getGroupIds(canvas);
		if (groupIds.size === 0) return;
		let changed = false;
		for (const groupId of groupIds) {
			const group = canvas.nodes.get(groupId);
			if (!group) continue;
			const gx = group.x;
			const gy = group.y;
			const gw = group.width;
			const gh = group.height;
			const contained = /* @__PURE__ */ new Set();
			for (const node of canvas.nodes.values()) {
				if (groupIds.has(node.id)) continue;
				const cx = node.x + node.width / 2;
				const cy = node.y + node.height / 2;
				if (cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh) {
					for (const n of this.collectSubtreeNodes(canvas, node)) {
						contained.add(n);
					}
				}
			}
			if (contained.size === 0) continue;
			let minX = Infinity,
				minY = Infinity,
				maxX = -Infinity,
				maxY = -Infinity;
			for (const node of contained) {
				minX = Math.min(minX, node.x);
				minY = Math.min(minY, node.y);
				maxX = Math.max(maxX, node.x + node.width);
				maxY = Math.max(maxY, node.y + node.height);
			}
			const newX = minX - PADDING;
			const newY = minY - PADDING;
			const newW = maxX - minX + PADDING * 2;
			const newH = maxY - minY + PADDING * 2;
			if (newX !== gx || newY !== gy || newW !== gw || newH !== gh) {
				(_a = group.nodeEl) == null
					? void 0
					: _a.addClass('mindmap-group-animating');
				group.moveAndResize({
					x: newX,
					y: newY,
					width: newW,
					height: newH
				});
				changed = true;
			}
		}
		if (changed) {
			canvas.requestSave();
			this.trackedTimeout(() => {
				var _a2;
				for (const groupId of groupIds) {
					const group = canvas.nodes.get(groupId);
					(_a2 = group == null ? void 0 : group.nodeEl) == null
						? void 0
						: _a2.removeClass('mindmap-group-animating');
				}
			}, 260);
		}
	}
	getPreviewSizer(node) {
		return this.liveSizing.getPreviewSizer(node);
	}
	waitForPreview(node, callback) {
		this.liveSizing.waitForPreview(node, callback);
	}
	/**
	 * Reflow the complete mind map containing each changed card. A card's new
	 * dimensions alter every ancestor contour, so stopping at a local subtree
	 * can make that subtree overlap its siblings. Other root maps stay untouched.
	 */
	relayoutAffectedBranches(canvas, nodes) {
		const forest = buildForest(canvas);
		const rootIds = /* @__PURE__ */ new Set();
		for (const node of nodes) {
			let tree = findTreeForNode(forest, node.id);
			if (!tree) continue;
			while (tree.parent) tree = tree.parent;
			rootIds.add(tree.canvasNode.id);
		}
		for (const rootId of rootIds)
			this.layoutEngine.layoutChildren(canvas, rootId);
		this.updateGroupBounds(canvas);
	}
	handleAutoAdjustDrag(canvas, node) {
		if (!this.isMindmapCanvas(canvas) || !this.isAutoAdjustCanvas(canvas))
			return;
		this.reflowCompleteCanvas(canvas);
	}
	reflowCompleteCanvas(canvas) {
		reflowCanvasAfterMove(canvas, {
			isMindmap: (candidate) => this.isMindmapCanvas(candidate),
			layout: this.layoutEngine,
			updateGroups: (candidate) => this.updateGroupBounds(candidate),
			autoColor: () => this.settings.autoColor,
			colors: this.branchColors,
			markOrderDirty: (candidate) =>
				this.markMarkdownOrderDirty(candidate)
		});
	}
	getAutoNodeSize(node) {
		return this.liveSizing.measure(node);
	}
	/**
	 * Resize text cards in both dimensions for automatic mindmap layout.
	 */
	resizeNodes(canvas, nodes) {
		return this.liveSizing.resizeNodes(canvas, nodes);
	}
	/**
	 * Render Markdown off-screen so virtualized Canvas cards can be measured
	 * before they have ever appeared in the viewport.
	 */
	async measureMarkdownNodesOffscreen(canvas, nodes, isCurrent) {
		var _a, _b, _c;
		const MarkdownRenderer = import_obsidian5.MarkdownRenderer;
		const Component = import_obsidian5.Component;
		if (
			typeof document === 'undefined' ||
			!document.body ||
			!MarkdownRenderer ||
			typeof MarkdownRenderer.renderMarkdown !== 'function' ||
			!Component
		)
			return /* @__PURE__ */ new Map();
		let host = null;
		let component = null;
		const sourcePath =
			this.getMarkdownSyncPath(canvas.getData()) ||
			((_b = (_a = canvas.view) == null ? void 0 : _a.file) == null
				? void 0
				: _b.path) ||
			'';
		const minWidth = Math.max(
			80,
			Math.min(this.settings.minNodeWidth, this.settings.maxNodeWidth)
		);
		const maxWidth = Math.max(minWidth, this.settings.maxNodeWidth);
		const fallbackHeight = this.settings.defaultNodeHeight;
		const maxHeight = this.settings.maxNodeHeight;
		const entries = [];
		const findCalibrationNode = () =>
			Array.from(canvas.nodes.values()).find((node) => {
				const sizer = this.liveSizing.getPreviewSizer(node);
				const preview =
					sizer == null
						? void 0
						: sizer.closest('.markdown-preview-view');
				return !!(preview && preview.parentElement && node.contentEl);
			}) || null;
		const waitForCalibrationNode = () =>
			new Promise((resolve) => {
				let settled = false;
				let observer = null;
				let interval = null;
				let timeout = null;
				const finish = (node) => {
					if (settled) return;
					settled = true;
					if (observer) observer.disconnect();
					if (interval !== null) clearInterval(interval);
					if (timeout !== null) clearTimeout(timeout);
					resolve(node);
				};
				const check = () => {
					if (!isCurrent()) {
						finish(null);
						return;
					}
					const node = findCalibrationNode();
					if (node) finish(node);
				};
				if (
					canvas.wrapperEl &&
					typeof MutationObserver !== 'undefined'
				) {
					observer = new MutationObserver(check);
					observer.observe(canvas.wrapperEl, {
						childList: true,
						subtree: true
					});
				}
				interval = setInterval(check, 80);
				timeout = setTimeout(() => finish(null), 1200);
				check();
			});
		try {
			// Canvas virtualizes Markdown previews. Wait for one genuine renderer,
			// then use its own document so theme CSS, fonts and wrapping are exact.
			const calibrationNode =
				findCalibrationNode() || (await waitForCalibrationNode());
			if (!calibrationNode) return /* @__PURE__ */ new Map();
			const calibrationSizer =
				this.liveSizing.getPreviewSizer(calibrationNode);
			const measurementDocument =
				(calibrationSizer == null
					? void 0
					: calibrationSizer.ownerDocument) || document;
			if (!measurementDocument.body) return /* @__PURE__ */ new Map();
			const calibrationCard = calibrationSizer.closest(
				'.markdown-preview-view'
			);
			const calibrationEmbedContent = calibrationCard.parentElement;
			const calibrationContent =
				calibrationCard.closest('.canvas-node-content') ||
				calibrationNode.contentEl;
			if (!calibrationEmbedContent || !calibrationContent)
				return /* @__PURE__ */ new Map();
			const calibrationChromeHeight =
				this.liveSizing.getPreviewChromeHeight(calibrationNode) || 0;
			host = measurementDocument.createElement('div');
			host.className = 'tomindmap-measurement-host';
			Object.assign(host.style, {
				position: 'fixed',
				left: '-100000px',
				top: '0',
				visibility: 'hidden',
				pointerEvents: 'none',
				display: 'block'
			});
			measurementDocument.body.appendChild(host);
			component = new Component();
			if (typeof component.load === 'function') component.load();
			const nextFrame = () =>
				new Promise((resolve) => {
					const frameWindow = measurementDocument.defaultView;
					if (
						frameWindow &&
						typeof frameWindow.requestAnimationFrame === 'function'
					)
						frameWindow.requestAnimationFrame(() => resolve());
					else if (typeof requestAnimationFrame === 'function')
						requestAnimationFrame(() => resolve());
					else setTimeout(resolve, 0);
				});
			const batchSize = 32;
			for (let start = 0; start < nodes.length; start += batchSize) {
				if (!isCurrent()) return /* @__PURE__ */ new Map();
				const batch = nodes.slice(start, start + batchSize);
				await Promise.all(
					batch.map(async (node) => {
						const estimated = this.getAutoNodeSize(node);
						const targetWidth = Math.max(
							minWidth,
							Math.min(maxWidth, estimated.width)
						);
						const initialHeight = String(node.text || '').trim()
							? Math.max(1, Number(estimated.floorHeight) || 0)
							: fallbackHeight;
						const shell = measurementDocument.createElement('div');
						shell.className =
							'canvas-node tomindmap-measurement-node';
						Object.assign(shell.style, {
							position: 'relative',
							display: 'block',
							width: `${targetWidth}px`,
							height: 'auto',
							minHeight: '0',
							overflow: 'visible'
						});
						shell.style.setProperty(
							'--canvas-node-width',
							`${targetWidth}px`
						);
						const content = calibrationContent.cloneNode(false);
						content.removeAttribute('id');
						content.removeAttribute('style');
						content.classList.add(
							'canvas-node-content',
							'markdown-embed'
						);
						Object.assign(content.style, {
							width: '100%',
							height: 'auto',
							minHeight: '0',
							overflow: 'visible',
							position: 'relative'
						});
						const embedContent =
							calibrationEmbedContent.cloneNode(false);
						embedContent.removeAttribute('id');
						embedContent.removeAttribute('style');
						embedContent.classList.add('markdown-embed-content');
						embedContent.style.height = 'auto';
						embedContent.style.minHeight = '0';
						embedContent.style.overflow = 'visible';
						const card = calibrationCard
							? calibrationCard.cloneNode(false)
							: measurementDocument.createElement('div');
						card.removeAttribute('id');
						card.removeAttribute('style');
						card.classList.add(
							'markdown-preview-view',
							'markdown-rendered'
						);
						card.style.height = 'auto';
						card.style.minHeight = '0';
						card.style.overflow = 'visible';
						const sizer = calibrationSizer.cloneNode(false);
						sizer.removeAttribute('id');
						sizer.removeAttribute('style');
						sizer.classList.add('markdown-preview-sizer');
						sizer.style.boxSizing = 'border-box';
						sizer.style.height = 'auto';
						sizer.style.minHeight = '0';
						sizer.style.overflow = 'visible';
						sizer.style.padding = 'var(--size-4-1)';
						card.appendChild(sizer);
						embedContent.appendChild(card);
						content.appendChild(embedContent);
						shell.appendChild(content);
						host.appendChild(shell);
						await MarkdownRenderer.renderMarkdown(
							String(node.text || ''),
							sizer,
							sourcePath,
							component
						);
						this.liveSizing.applyPreviewGeometry(sizer);
						entries.push({
							node,
							shell,
							card,
							sizer,
							estimated,
							targetWidth,
							targetHeight: initialHeight
						});
					})
				);
				await nextFrame();
			}
			if ((_c = measurementDocument.fonts) == null ? void 0 : _c.ready) {
				await Promise.race([
					measurementDocument.fonts.ready,
					new Promise((resolve) => setTimeout(resolve, 500))
				]);
			}
			await nextFrame();
			if (!isCurrent()) return /* @__PURE__ */ new Map();
			// Tables deliberately clip/wrap their cells at the current card width,
			// which hides their intrinsic width from ordinary scroll measurements.
			// Probe rigid content at max-content in the hidden clone, then restore
			// normal Canvas wrapping before the final height pass.
			const probedStyles = [];
			const probeStyle = (element, declarations) => {
				probedStyles.push([element, element.getAttribute('style')]);
				for (const [property, value] of declarations)
					element.style.setProperty(property, value, 'important');
			};
			for (const { sizer } of entries) {
				for (const element of Array.from(
					sizer.querySelectorAll('table')
				)) {
					probeStyle(element, [
						['width', 'max-content'],
						['max-width', 'none'],
						['table-layout', 'auto']
					]);
					for (const cell of Array.from(
						element.querySelectorAll('th, td')
					)) {
						probeStyle(cell, [
							['max-width', 'none'],
							['white-space', 'nowrap'],
							['overflow', 'visible'],
							['text-overflow', 'clip']
						]);
					}
				}
			}
			if (probedStyles.length > 0) await nextFrame();
			for (const entry of entries) {
				const { card, sizer, estimated, shell } = entry;
				let intrinsicWidth = 0;
				for (const element of [
					sizer,
					...Array.from(sizer.querySelectorAll('*'))
				]) {
					const tagName = String(element.tagName || '').toLowerCase();
					const clientWidth = Number(element.clientWidth || 0);
					const scrollWidth = Number(element.scrollWidth || 0);
					if (clientWidth > 0 && scrollWidth > clientWidth + 1)
						intrinsicWidth = Math.max(
							intrinsicWidth,
							entry.targetWidth + scrollWidth - clientWidth
						);
					if (
						/^(?:table|img|video|audio|iframe|embed|object)$/.test(
							tagName
						)
					)
						intrinsicWidth = Math.max(
							intrinsicWidth,
							Number(element.scrollWidth || 0) +
								Math.max(
									0,
									entry.targetWidth -
										Number(card.clientWidth || 0)
								),
							Number(element.offsetWidth || 0) +
								Math.max(
									0,
									entry.targetWidth -
										Number(card.clientWidth || 0)
								)
						);
				}
				const width = Math.min(
					maxWidth,
					Math.max(
						minWidth,
						estimated.width,
						Math.ceil(intrinsicWidth / 10) * 10 || 0
					)
				);
				entry.targetWidth = width;
				shell.style.width = `${width}px`;
				shell.style.setProperty('--canvas-node-width', `${width}px`);
			}
			for (const [element, styleText] of probedStyles) {
				if (styleText === null) element.removeAttribute('style');
				else element.setAttribute('style', styleText);
			}
			// Resolve any remaining horizontal overflow after restoring the real
			// wrapping rules. All cards advance together, so this remains batched.
			for (let pass = 0; pass < 4; pass++) {
				await nextFrame();
				let grew = false;
				for (const entry of entries) {
					const overflow = this.liveSizing.measureHorizontalOverflow(
						entry.card
					);
					if (overflow <= 0 || entry.targetWidth >= maxWidth)
						continue;
					const nextWidth = Math.min(
						maxWidth,
						entry.targetWidth + Math.ceil(overflow)
					);
					if (nextWidth <= entry.targetWidth) continue;
					entry.targetWidth = nextWidth;
					entry.shell.style.width = `${nextWidth}px`;
					entry.shell.style.setProperty(
						'--canvas-node-width',
						`${nextWidth}px`
					);
					grew = true;
				}
				if (!grew) break;
			}
			await nextFrame();
			const result = /* @__PURE__ */ new Map();
			for (const { node, estimated, targetWidth, sizer } of entries) {
				const width = Math.min(
					maxWidth,
					Math.max(
						minWidth,
						Math.round(targetWidth || estimated.width)
					)
				);
				const intrinsicHeight =
					this.liveSizing.measureIntrinsicHeight(sizer);
				const oneLineHeight = this.liveSizing.minimumTextHeight(sizer);
				const height = Math.min(
					maxHeight,
					Math.max(
						oneLineHeight,
						intrinsicHeight ||
							this.liveSizing.measureContentHeight(sizer) ||
							fallbackHeight
					) + calibrationChromeHeight
				);
				result.set(node.id, { width, height });
			}
			return result;
		} catch (error) {
			console.error(
				'ToMindMap: off-screen Markdown measurement failed',
				error
			);
			return /* @__PURE__ */ new Map();
		} finally {
			if (component && typeof component.unload === 'function')
				component.unload();
			if (host) host.remove();
		}
	}
	/**
	 * Imported Canvas cards exist before Obsidian has rendered their Markdown.
	 * Give them a useful estimated size immediately, then remeasure ready cards
	 * in one shared observer/timer queue and perform one coalesced final layout.
	 */
	resizeNodesWhenRendered(canvas, nodes, onSettled) {
		return this.liveSizing.resizeNodesWhenRendered(
			canvas,
			nodes,
			onSettled
		);
	}
	/**
	 * After a width change, use the re-rendered preview for a precise height and
	 * reflow only the roots that contained adjusted nodes.
	 */
	resizeNodesRetry(canvas, nodes) {
		return this.liveSizing.resizeNodesRetry(canvas, nodes);
	}
	finishInsertNode(canvas, newNode, nearNode) {
		if (this.isAutoAdjustCanvas(canvas) && this.isMindmapCanvas(canvas)) {
			const forest = buildForest(canvas);
			const treeNode = findTreeForNode(forest, nearNode.id);
			if (treeNode) {
				let root = treeNode;
				while (root.parent) root = root.parent;
				this.layoutEngine.layoutChildren(canvas, root.canvasNode.id);
			}
		}
		if (this.settings.autoColor && this.isMindmapCanvas(canvas)) {
			this.branchColors.applyColors(canvas);
		}
		this.updateGroupBounds(canvas);
		this.canvasApi.selectAndEdit(
			canvas,
			newNode,
			this.settings.navigationZoomPadding
		);
	}
	async showOutline(canvas, focusSearch = false) {
		let leaf =
			this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)[0] || null;
		if (!leaf) {
			leaf =
				this.app.workspace.getRightLeaf(false) ||
				this.app.workspace.getRightLeaf(true);
			if (!leaf) return;
			await leaf.setViewState({ type: OUTLINE_VIEW_TYPE, active: true });
			this.reorderOutlineToTop(leaf);
		} else if (typeof leaf.loadIfDeferred === 'function') {
			await leaf.loadIfDeferred();
		}
		if (!leaf) return;
		await this.app.workspace.revealLeaf(leaf);
		this.refreshOutline(canvas);
		if (focusSearch && leaf.view instanceof OutlineView)
			leaf.view.openSearch();
	}
	hideOutline() {
		for (const leaf of this.app.workspace.getLeavesOfType(
			OUTLINE_VIEW_TYPE
		)) {
			leaf.detach();
		}
	}
	reorderOutlineToTop(leaf) {
		var _a;
		const parent = leaf.parent;
		if (!(parent == null ? void 0 : parent.children)) return;
		const children = parent.children;
		const idx = children.indexOf(leaf);
		if (idx > 0) {
			children.splice(idx, 1);
			children.unshift(leaf);
		}
		(_a = parent.selectTab) == null ? void 0 : _a.call(parent, leaf);
	}
	markdownLayoutOptions() {
		return {
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			maxNodeHeight: this.settings.maxNodeHeight,
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap
		};
	}
	getMarkdownSyncPath(data) {
		const sync = data && data.mindmapMarkdownSync;
		return sync && typeof sync.path === 'string' ? sync.path : '';
	}
	getOpenCanvasByPath(path) {
		for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
			const canvas = leaf.view && leaf.view.canvas;
			if (
				canvas &&
				canvas.view &&
				canvas.view.file &&
				canvas.view.file.path === path
			)
				return canvas;
		}
		return null;
	}
	getIndexedMarkdownPath(canvasPath) {
		for (const [markdownPath, canvasPaths] of this.markdownSyncIndex) {
			if (canvasPaths.has(canvasPath)) return markdownPath;
		}
		return '';
	}
	indexMarkdownLink(canvasPath, markdownPath) {
		this.unindexCanvas(canvasPath);
		if (!markdownPath) return;
		let canvasPaths = this.markdownSyncIndex.get(markdownPath);
		if (!canvasPaths) {
			canvasPaths = /* @__PURE__ */ new Set();
			this.markdownSyncIndex.set(markdownPath, canvasPaths);
		}
		canvasPaths.add(canvasPath);
	}
	unindexCanvas(canvasPath) {
		for (const [markdownPath, canvasPaths] of this.markdownSyncIndex) {
			canvasPaths.delete(canvasPath);
			if (canvasPaths.size === 0)
				this.markdownSyncIndex.delete(markdownPath);
		}
	}
	async rebuildMarkdownSyncIndex() {
		this.markdownSyncIndex.clear();
		const canvasFiles = this.app.vault
			.getFiles()
			.filter((file) => file.extension === 'canvas');
		await Promise.all(
			canvasFiles.map(async (file) => {
				try {
					const data = JSON.parse(
						await this.app.vault.cachedRead(file)
					);
					const markdownPath = this.getMarkdownSyncPath(data);
					if (markdownPath)
						this.indexMarkdownLink(file.path, markdownPath);
				} catch (error) {
					console.warn(
						`ToMindMap: could not inspect sync metadata in ${file.path}`,
						error
					);
				}
			})
		);
	}
	scheduleCanvasToMarkdown(canvas) {
		if (this.syncApplyingCanvas.has(canvas)) return;
		const file = canvas.view && canvas.view.file;
		const markdownPath = this.getMarkdownSyncPath(canvas.getData());
		if (!file || !markdownPath) return;
		// A local Canvas mutation is newer than any queued Markdown reapply.
		// Cancel that stale direction before it can reconcile the just-added node
		// out of the Canvas during the 350ms Canvas-to-Markdown debounce.
		const pendingMarkdownApply =
			this.markdownModifyTimers.get(markdownPath);
		if (pendingMarkdownApply !== undefined) {
			clearTimeout(pendingMarkdownApply);
			this.markdownModifyTimers.delete(markdownPath);
		}
		const previous = this.markdownSyncTimers.get(file.path);
		if (previous) clearTimeout(previous);
		const timer = setTimeout(() => {
			this.markdownSyncTimers.delete(file.path);
			void this.writeCanvasToLinkedMarkdown(canvas);
		}, 350);
		this.markdownSyncTimers.set(file.path, timer);
	}
	flushCanvasToMarkdown(canvas) {
		const file = canvas?.view?.file;
		if (!file || !this.getMarkdownSyncPath(canvas.getData()))
			return Promise.resolve();
		const pending = this.markdownSyncTimers.get(file.path);
		if (pending !== void 0) {
			clearTimeout(pending);
			this.markdownSyncTimers.delete(file.path);
		}
		const previous =
			this.immediateMarkdownWrites.get(canvas) || Promise.resolve();
		const write = previous
			.catch(() => {})
			.then(() => this.writeCanvasToLinkedMarkdown(canvas));
		this.immediateMarkdownWrites.set(canvas, write);
		return write.finally(() => {
			if (this.immediateMarkdownWrites.get(canvas) === write)
				this.immediateMarkdownWrites.delete(canvas);
		});
	}
	markMarkdownOrderDirty(canvas) {
		if (canvas) this.markdownOrderDirty.add(canvas);
	}
	setMarkdownWriteGuard(path, content) {
		this.clearMarkdownWriteGuard(path);
		this.markdownWriteGuards.set(path, content);
		const timer = setTimeout(() => {
			this.markdownWriteGuardTimers.delete(path);
			if (this.markdownWriteGuards.get(path) === content)
				this.markdownWriteGuards.delete(path);
		}, 5e3);
		this.markdownWriteGuardTimers.set(path, timer);
	}
	clearMarkdownWriteGuard(path) {
		const timer = this.markdownWriteGuardTimers.get(path);
		if (timer !== undefined) clearTimeout(timer);
		this.markdownWriteGuardTimers.delete(path);
		this.markdownWriteGuards.delete(path);
	}
	async writeMarkdownFile(file, content, expectedCurrent = null) {
		this.setMarkdownWriteGuard(file.path, content);
		let changed = false;
		let conflicted = false;
		try {
			await this.app.vault.process(file, (current) => {
				if (expectedCurrent !== null && current !== expectedCurrent) {
					conflicted = true;
					return current;
				}
				changed = current !== content;
				return changed ? content : current;
			});
			if (conflicted)
				throw new Error(
					`"${file.path}" changed while ToMindMap was preparing an update`
				);
			if (!changed) this.clearMarkdownWriteGuard(file.path);
		} catch (error) {
			this.clearMarkdownWriteGuard(file.path);
			throw error;
		}
	}
	async writeCanvasToLinkedMarkdown(canvas) {
		const canvasFile = canvas.view && canvas.view.file;
		const markdownPath = this.getMarkdownSyncPath(canvas.getData());
		if (!canvasFile || !markdownPath) return;
		const source = this.app.vault.getAbstractFileByPath(markdownPath);
		if (!(source instanceof import_obsidian5.TFile)) {
			await this.detachMarkdownSync(canvas, false);
			new import_obsidian5.Notice(
				'Markdown sync detached because the linked file no longer exists'
			);
			return;
		}
		const groupIds = getGroupIds(canvas);
		const topicNodes = Array.from(canvas.nodes.values()).filter(
			(node) => !groupIds.has(node.id)
		);
		if (topicNodes.some((node) => node.isEditing)) return;
		let finalizedBlankTopic = false;
		for (const node of topicNodes) {
			if (isTextTopicCard(node, groupIds) && !node.text.trim()) {
				node.setText('Untitled');
				finalizedBlankTopic = true;
			}
		}
		if (finalizedBlankTopic) canvas.requestSave();
		try {
			const current = await this.app.vault.read(source);
			const imported = markdownMindMapToCanvas(
				current,
				this.markdownLayoutOptions()
			);
			const graphMatches = imported
				? canvasMatchesImportedMarkdown(
						canvas,
						imported,
						canvasFile.path
					)
				: false;
			const orderMatches = imported
				? canvasOrderMatchesImportedMarkdown(canvas, imported)
				: false;
			const orderWasChangedInCanvas = this.markdownOrderDirty.has(canvas);
			const requiresOrderUpdate =
				graphMatches && !orderMatches && orderWasChangedInCanvas;
			let markdown;
			if (
				imported &&
				graphMatches &&
				(orderMatches || !orderWasChangedInCanvas)
			) {
				markdown = markdownWithTopicMetadata(
					withoutLegacyPluginComments(current),
					imported.topicIds || [],
					imported.topicKeys || [],
					imported.topicLabels || []
				);
			} else {
				try {
					markdown = patchMarkdownFromCanvasPreservingSource(
						current,
						canvas,
						imported,
						canvasFile.path
					);
					const patchedImport = markdown
						? markdownMindMapToCanvas(
								markdown,
								this.markdownLayoutOptions()
							)
						: null;
					if (
						!patchedImport ||
						!canvasMatchesImportedMarkdown(
							canvas,
							patchedImport,
							canvasFile.path
						) ||
						(requiresOrderUpdate &&
							!canvasOrderMatchesImportedMarkdown(
								canvas,
								patchedImport
							))
					) {
						markdown =
							requiresOrderUpdate && graphMatches
								? markdownWithTopicMetadata(
										withoutLegacyPluginComments(current),
										imported.topicIds || [],
										imported.topicKeys || [],
										imported.topicLabels || []
									)
								: null;
					}
				} catch (error) {
					console.warn(
						'ToMindMap: localized Markdown update failed; using readable structural fallback',
						error
					);
					markdown = null;
				}
				if (!markdown)
					markdown = canvasToMindMapMarkdown(canvas, this.settings);
			}
			if (markdown && orderWasChangedInCanvas) {
				try {
					const ordered = reorderMarkdownTopicsPreservingSource(
						markdown,
						canvas
					);
					const orderedImport = markdownMindMapToCanvas(
						ordered,
						this.markdownLayoutOptions()
					);
					if (
						orderedImport &&
						canvasMatchesImportedMarkdown(
							canvas,
							orderedImport,
							canvasFile.path
						) &&
						canvasOrderMatchesImportedMarkdown(
							canvas,
							orderedImport
						)
					)
						markdown = ordered;
				} catch (error) {
					console.warn(
						'ToMindMap: visual chronology could not be applied losslessly',
						error
					);
				}
			}
			const verified = markdownMindMapToCanvas(
				markdown,
				this.markdownLayoutOptions()
			);
			if (
				!verified ||
				!canvasMatchesImportedMarkdown(
					canvas,
					verified,
					canvasFile.path
				)
			)
				console.warn(
					'ToMindMap: Markdown was written with the readable structural fallback because exact graph verification was unavailable'
				);
			await this.writeMarkdownFile(source, markdown, current);
			this.indexMarkdownLink(canvasFile.path, source.path);
			this.markdownOrderDirty.delete(canvas);
		} catch (error) {
			console.error('ToMindMap: Canvas to Markdown sync failed', error);
			new import_obsidian5.Notice(
				'Markdown sync could not access the linked file'
			);
		}
	}
	async attachMarkdownSync(canvas) {
		const canvasFile = canvas.view && canvas.view.file;
		if (!canvasFile) return;
		const markdown = canvasToMindMapMarkdown(canvas, this.settings);
		if (!markdown.trim()) {
			new import_obsidian5.Notice(
				'Add at least one topic before enabling Markdown sync'
			);
			return;
		}
		const folder =
			canvasFile.parent && canvasFile.parent.path
				? `${canvasFile.parent.path}/`
				: '';
		const stem = `${canvasFile.basename} Mindmap`;
		let markdownPath = `${folder}${stem}.md`;
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(markdownPath)) {
			markdownPath = `${folder}${stem} ${counter}.md`;
			counter++;
		}
		try {
			this.setMarkdownWriteGuard(markdownPath, markdown);
			const created = await this.app.vault.create(markdownPath, markdown);
			const data = canvas.getData();
			data.mindmapMarkdownSync = { path: created.path };
			canvas.setData(data);
			this.indexMarkdownLink(canvasFile.path, created.path);
			canvas.requestSave();
			new import_obsidian5.Notice(`Syncing with "${created.path}"`);
		} catch (error) {
			this.clearMarkdownWriteGuard(markdownPath);
			console.error(
				'ToMindMap: could not create Markdown sync file',
				error
			);
			new import_obsidian5.Notice(
				'Could not create the Markdown sync file'
			);
		}
	}
	async detachMarkdownSync(canvas, showNotice = true) {
		const canvasFile = canvas.view && canvas.view.file;
		const data = canvas.getData();
		const oldPath = this.getMarkdownSyncPath(data);
		if (!oldPath) return;
		delete data.mindmapMarkdownSync;
		canvas.setData(data);
		if (canvasFile) this.unindexCanvas(canvasFile.path);
		canvas.requestSave();
		if (showNotice)
			new import_obsidian5.Notice(
				'Markdown sync detached; neither file was deleted'
			);
	}
	scheduleMarkdownToCanvas(file) {
		const previous = this.markdownModifyTimers.get(file.path);
		if (previous) clearTimeout(previous);
		const timer = setTimeout(() => {
			this.markdownModifyTimers.delete(file.path);
			void this.syncMarkdownFileToCanvases(file);
		}, 300);
		this.markdownModifyTimers.set(file.path, timer);
	}
	async syncMarkdownFileToCanvases(file) {
		let markdown;
		try {
			markdown = await this.app.vault.read(file);
		} catch (error) {
			return;
		}
		if (this.markdownWriteGuards.get(file.path) === markdown) {
			this.clearMarkdownWriteGuard(file.path);
			return;
		}
		const linkedCanvases = Array.from(
			this.markdownSyncIndex.get(file.path) || []
		);
		if (linkedCanvases.length === 0) return;
		let imported = markdownMindMapToCanvas(
			markdown,
			this.markdownLayoutOptions()
		);
		if (!imported)
			imported = {
				nodes: [],
				edges: [],
				frontmatter: '',
				rootIds: [],
				topicIds: [],
				topicKeys: [],
				topicLabels: [],
				stableIdCount: 0,
				metadataCurrent: false
			};
		for (const canvasPath of linkedCanvases) {
			const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
			if (!(canvasFile instanceof import_obsidian5.TFile)) {
				this.unindexCanvas(canvasPath);
				continue;
			}
			const openCanvas = this.getOpenCanvasByPath(canvasPath);
			if (openCanvas) {
				await this.applyMarkdownToLiveCanvas(
					openCanvas,
					markdown,
					imported
				);
			} else {
				await this.app.vault.process(canvasFile, (raw) => {
					try {
						const current = JSON.parse(raw);
						const incoming = {
							...imported,
							nodes: imported.nodes.map((node) => ({ ...node })),
							edges: imported.edges.map((edge) => ({ ...edge }))
						};
						convertMarkdownAnchorsToCardLinks(
							incoming.nodes,
							canvasPath
						);
						const adapter = canvasDataAdapter(current, canvasFile);
						if (
							canvasMatchesImportedMarkdown(
								adapter,
								incoming,
								canvasPath
							) &&
							canvasOrderMatchesImportedMarkdown(
								adapter,
								incoming
							)
						)
							return raw;
						const updated = reconcileCanvasData(current, incoming);
						updated.mindmapMarkdownSync = { path: file.path };
						return JSON.stringify(updated, null, '	');
					} catch (error) {
						console.error(
							`ToMindMap: could not sync ${canvasPath}`,
							error
						);
						return raw;
					}
				});
			}
		}
		const preserved = markdownWithTopicMetadata(
			withoutLegacyPluginComments(markdown),
			imported.topicIds || [],
			imported.topicKeys || [],
			imported.topicLabels || []
		);
		if (preserved !== markdown)
			await this.writeMarkdownFile(file, preserved, markdown);
	}
	async applyMarkdownToLiveCanvas(canvas, markdown, prepared) {
		const canvasFile = canvas.view && canvas.view.file;
		if (!canvasFile) return;
		// A native file drop copies data into the vault before the Canvas card can
		// be imported. Never let an older Markdown snapshot reconcile during that
		// asynchronous window, or while its Canvas-to-Markdown save is queued.
		if (
			this.localCanvasMutations.has(canvas) ||
			this.markdownSyncTimers.has(canvasFile.path)
		) {
			return;
		}
		const imported = prepared
			? {
					...prepared,
					nodes: prepared.nodes.map((node) => ({ ...node })),
					edges: prepared.edges.map((edge) => ({ ...edge }))
				}
			: markdownMindMapToCanvas(
					markdown,
					this.markdownLayoutOptions()
				) || { nodes: [], edges: [], frontmatter: '', rootIds: [] };
		convertMarkdownAnchorsToCardLinks(imported.nodes, canvasFile.path);
		if (
			canvasMatchesImportedMarkdown(canvas, imported, canvasFile.path) &&
			canvasOrderMatchesImportedMarkdown(canvas, imported)
		) {
			if (this.isMindmapCanvas(canvas)) {
				this.layoutEngine.layout(canvas);
				this.updateGroupBounds(canvas);
			}
			this.refreshOutline(canvas);
			return;
		}
		const selected =
			canvas.selection && canvas.selection.size === 1
				? canvas.selection.values().next().value
				: null;
		const linkedPath = this.getMarkdownSyncPath(canvas.getData());
		const reconciled = reconcileCanvasData(canvas.getData(), imported);
		const pendingResizeIds = new Set(
			Array.isArray(reconciled.mindmapPendingResize)
				? reconciled.mindmapPendingResize
				: []
		);
		reconciled.mindmapMarkdownSync = { path: linkedPath };
		this.syncApplyingCanvas.add(canvas);
		try {
			canvas.setData(reconciled);
			this.canvasApi.invalidateEdgeIndex();
			if (
				this.isAutoAdjustCanvas(canvas) &&
				this.isMindmapCanvas(canvas)
			) {
				const groupIds = getGroupIds(canvas);
				const changedNodes = Array.from(canvas.nodes.values()).filter(
					(node) =>
						!groupIds.has(node.id) && pendingResizeIds.has(node.id)
				);
				if (changedNodes.length > 0) {
					this.resizeNodesWhenRendered(canvas, changedNodes);
				} else {
					this.layoutEngine.layout(canvas);
				}
			}
			if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			this.updateGroupBounds(canvas);
			const nodes = Array.from(canvas.nodes.values()).filter(
				(node) => !getGroupIds(canvas).has(node.id)
			);
			await this.validateMediaLinks(canvas, nodes, false);
			canvas.requestSave();
			if (selected && canvas.nodes.has(selected.id))
				this.canvasApi.selectForNavigation(
					canvas,
					canvas.nodes.get(selected.id),
					this.settings.navigationZoomPadding
				);
			this.refreshOutline(canvas);
		} finally {
			this.syncApplyingCanvas.delete(canvas);
		}
	}
	async updateCanvasSyncMetadata(canvasPath, markdownPath) {
		const openCanvas = this.getOpenCanvasByPath(canvasPath);
		if (openCanvas) {
			this.syncApplyingCanvas.add(openCanvas);
			try {
				const data = openCanvas.getData();
				if (markdownPath)
					data.mindmapMarkdownSync = { path: markdownPath };
				else delete data.mindmapMarkdownSync;
				openCanvas.setData(data);
				openCanvas.requestSave();
			} finally {
				this.syncApplyingCanvas.delete(openCanvas);
			}
			return;
		}
		const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
		if (!(canvasFile instanceof import_obsidian5.TFile)) return;
		await this.app.vault.process(canvasFile, (raw) => {
			try {
				const data = JSON.parse(raw);
				if (markdownPath)
					data.mindmapMarkdownSync = { path: markdownPath };
				else delete data.mindmapMarkdownSync;
				return JSON.stringify(data, null, '	');
			} catch (error) {
				return raw;
			}
		});
	}
	async handleSyncedFileRename(file, oldPath) {
		if (this.markdownSyncIndex.has(oldPath)) {
			const canvasPaths = Array.from(this.markdownSyncIndex.get(oldPath));
			this.markdownSyncIndex.delete(oldPath);
			this.markdownSyncIndex.set(file.path, new Set(canvasPaths));
			if (this.markdownWriteGuards.has(oldPath)) {
				const guardedContent = this.markdownWriteGuards.get(oldPath);
				this.clearMarkdownWriteGuard(oldPath);
				this.setMarkdownWriteGuard(file.path, guardedContent);
			}
			await Promise.all(
				canvasPaths.map((canvasPath) =>
					this.updateCanvasSyncMetadata(canvasPath, file.path)
				)
			);
			return;
		}
		if (String(oldPath).toLowerCase().endsWith('.canvas')) {
			for (const canvasPaths of this.markdownSyncIndex.values()) {
				if (canvasPaths.delete(oldPath)) canvasPaths.add(file.path);
			}
		}
	}
	async handleSyncedFileDelete(file) {
		const path = file.path;
		if (this.markdownSyncIndex.has(path)) {
			const canvasPaths = Array.from(this.markdownSyncIndex.get(path));
			this.markdownSyncIndex.delete(path);
			await Promise.all(
				canvasPaths.map((canvasPath) =>
					this.updateCanvasSyncMetadata(canvasPath, '')
				)
			);
			new import_obsidian5.Notice(
				'Markdown sync detached because the linked file was deleted'
			);
			return;
		}
		if (String(path).toLowerCase().endsWith('.canvas'))
			this.unindexCanvas(path);
	}
	async convertMarkdownFileToMindMap(file) {
		try {
			const markdown = await this.app.vault.cachedRead(file);
			const imported = markdownMindMapToCanvas(
				markdown,
				this.markdownLayoutOptions()
			);
			if (!imported) {
				new import_obsidian5.Notice('No Markdown hierarchy was found');
				return;
			}
			const folder =
				file.parent && file.parent.path ? `${file.parent.path}/` : '';
			let canvasPath = `${folder}${file.basename}.canvas`;
			let counter = 2;
			while (this.app.vault.getAbstractFileByPath(canvasPath)) {
				canvasPath = `${folder}${file.basename} ${counter}.canvas`;
				counter++;
			}
			convertMarkdownAnchorsToCardLinks(imported.nodes, canvasPath);
			const canvasData = {
				nodes: imported.nodes,
				edges: imported.edges,
				mindmap: true,
				mindmapPendingResize: imported.nodes.map((node) => node.id),
				mindmapMarkdownFrontmatter: imported.frontmatter || '',
				mindmapMarkdownSync: { path: file.path }
			};
			const created = await this.app.vault.create(
				canvasPath,
				JSON.stringify(canvasData, null, '	')
			);
			this.indexMarkdownLink(created.path, file.path);
			const preserved = markdownWithTopicMetadata(
				withoutLegacyPluginComments(markdown),
				imported.topicIds || [],
				imported.topicKeys || [],
				imported.topicLabels || []
			);
			if (preserved !== markdown)
				await this.writeMarkdownFile(file, preserved, markdown);
			await this.app.workspace.getLeaf(false).openFile(created);
			new import_obsidian5.Notice(
				`Created "${created.path}" and linked it to "${file.path}"`
			);
		} catch (error) {
			console.error('ToMindMap: Markdown conversion failed', error);
			new import_obsidian5.Notice(
				'Could not convert that Markdown file to a mind map'
			);
		}
	}
	async copyMindMapMarkdown(canvas) {
		const markdown = portableMindMapMarkdown(canvas);
		if (!markdown.trim()) {
			new import_obsidian5.Notice('No mind map topics to copy');
			return;
		}
		try {
			await navigator.clipboard.writeText(markdown);
			new import_obsidian5.Notice('Mind map copied as Markdown');
		} catch (error) {
			console.error('ToMindMap: clipboard export failed', error);
			new import_obsidian5.Notice('Could not write to the clipboard');
		}
	}
	clipboardCanvas(event) {
		const canvas = this.canvasApi.getActiveCanvas();
		if (!canvas || !this.isMindmapCanvas(canvas) || event.defaultPrevented)
			return null;
		const target = event.target;
		if (
			target?.closest?.(
				'input, textarea, [contenteditable=true], .canvas-node.is-editing'
			)
		)
			return null;
		if (Array.from(canvas.nodes.values()).some((node) => node.isEditing))
			return null;
		return canvas;
	}
	handleMindMapClipboardCopy(event, cut) {
		const canvas = this.clipboardCanvas(event);
		if (!canvas || !event.clipboardData) return;
		const roots = selectedMindMapTrees(canvas);
		if (roots.length === 0) return;
		const markdown = portableMindMapMarkdown(canvas, roots);
		event.preventDefault();
		event.stopImmediatePropagation();
		event.clipboardData.setData('text/plain', markdown);
		event.clipboardData.setData('text/markdown', markdown);
		if (cut) {
			const parents = new Set(
				roots.map((tree) => tree.parent?.canvasNode).filter(Boolean)
			);
			for (const tree of roots)
				this.nodeOps.deleteSubtree(canvas, tree.canvasNode);
			this.markMarkdownOrderDirty(canvas);
			if (this.isAutoAdjustCanvas(canvas))
				this.layoutEngine.layout(canvas);
			if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			this.updateGroupBounds(canvas);
			canvas.requestSave();
			const fallback = parents.values().next().value || null;
			if (fallback)
				this.canvasApi.selectForNavigation(
					canvas,
					fallback,
					this.settings.navigationZoomPadding
				);
			new import_obsidian5.Notice(
				`Cut ${roots.length === 1 ? 'branch' : `${roots.length} branches`} as Markdown`
			);
		}
	}
	handleMindMapClipboardPaste(event) {
		const canvas = this.clipboardCanvas(event);
		const clipboardText =
			event.clipboardData?.getData('text/markdown') ||
			event.clipboardData?.getData('text/plain') ||
			'';
		if (!canvas || !clipboardText.trim()) return;
		const markdown = normalizeClipboardMarkdown(clipboardText);
		const imported = markdownMindMapToCanvas(
			markdown,
			this.markdownLayoutOptions()
		);
		if (!imported) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const parent = this.canvasApi.getSelectedNode(canvas);
		void this.importMarkdownIntoCanvas(
			canvas,
			markdown,
			'clipboard',
			parent
		);
	}
	async saveMindMapMarkdown(canvas) {
		await this.attachMarkdownSync(canvas);
	}
	importMarkdownFile(canvas) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
		const handler = () => {
			var _a;
			input.removeEventListener('change', handler);
			const file = (_a = input.files) == null ? void 0 : _a[0];
			if (!file) return;
			void file
				.text()
				.then((markdown) =>
					this.importMarkdownIntoCanvas(canvas, markdown, file.name)
				)
				.catch((error) => {
					console.error(
						'ToMindMap: Markdown file import failed',
						error
					);
					new import_obsidian5.Notice(
						'Could not read that Markdown file'
					);
				});
		};
		input.addEventListener('change', handler);
		input.click();
	}
	async importMarkdownIntoCanvas(
		canvas,
		markdown,
		sourceName = 'pasted Markdown',
		parentNode = null
	) {
		const imported = markdownMindMapToCanvas(markdown, {
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			maxNodeHeight: this.settings.maxNodeHeight,
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap
		});
		if (!imported) {
			new import_obsidian5.Notice('No Markdown hierarchy was found');
			return;
		}
		const idMap = new Map();
		const reservedIds = new Set(canvas.nodes.keys());
		for (const node of imported.nodes) {
			let id = node.id;
			while (reservedIds.has(id)) id = genId();
			idMap.set(node.id, id);
			reservedIds.add(id);
			node.id = id;
		}
		for (const edge of imported.edges) {
			edge.fromNode = idMap.get(edge.fromNode) || edge.fromNode;
			edge.toNode = idMap.get(edge.toNode) || edge.toNode;
			while (canvas.edges.has(edge.id)) edge.id = genId();
		}
		imported.rootIds = imported.rootIds.map((id) => idMap.get(id) || id);
		const groupIds = getGroupIds(canvas);
		const existing = Array.from(canvas.nodes.values()).filter(
			(node) => !groupIds.has(node.id)
		);
		const localMinX = Math.min(...imported.nodes.map((node) => node.x));
		const localMinY = Math.min(...imported.nodes.map((node) => node.y));
		const targetX = parentNode
			? parentNode.x + parentNode.width + this.settings.horizontalGap
			: existing.length > 0
				? Math.min(...existing.map((node) => node.x))
				: 0;
		const targetY = parentNode
			? parentNode.y
			: existing.length > 0
				? Math.max(...existing.map((node) => node.y + node.height)) +
					Math.max(160, this.settings.verticalGap * 8)
				: 0;
		const dx = targetX - localMinX;
		const dy = targetY - localMinY;
		for (const node of imported.nodes) {
			node.x += dx;
			node.y += dy;
		}
		const canvasPath =
			canvas.view && canvas.view.file ? canvas.view.file.path : '';
		convertMarkdownAnchorsToCardLinks(imported.nodes, canvasPath);
		const currentData = canvas.getData();
		if (currentData.mindmap !== true) {
			currentData.mindmap = true;
		}
		if (imported.frontmatter && !parentNode)
			currentData.mindmapMarkdownFrontmatter = imported.frontmatter;
		canvas.setData(currentData);
		canvas.importData({ nodes: imported.nodes, edges: imported.edges });
		this.canvasApi.invalidateEdgeIndex();
		const importedNodes = imported.nodes
			.map((data) => canvas.nodes.get(data.id))
			.filter(Boolean);
		const focusPastedRoot = () => {
			if (sourceName !== 'clipboard') return;
			const root =
				imported.rootIds.length > 0
					? canvas.nodes.get(imported.rootIds[0])
					: null;
			if (root)
				this.canvasApi.selectAndZoom(
					canvas,
					root,
					this.settings.navigationZoomPadding
				);
		};
		if (parentNode) {
			for (const rootId of imported.rootIds) {
				const root = canvas.nodes.get(rootId);
				if (root)
					this.canvasApi.createEdge(
						canvas,
						parentNode,
						root,
						'right',
						'left',
						parentNode.color || void 0
					);
			}
			this.markMarkdownOrderDirty(canvas);
		}
		if (this.isAutoAdjustCanvas(canvas)) {
			this.resizeNodesWhenRendered(
				canvas,
				importedNodes,
				focusPastedRoot
			);
			this.layoutEngine.layout(canvas);
		} else {
			for (const rootId of imported.rootIds) {
				if (canvas.nodes.has(rootId))
					this.layoutEngine.layoutChildren(canvas, rootId);
			}
		}
		if (this.settings.autoColor) this.branchColors.applyColors(canvas);
		const missingMediaCount = await this.validateMediaLinks(
			canvas,
			importedNodes,
			false
		);
		this.updateGroupBounds(canvas);
		canvas.requestSave();
		this.refreshOutline(canvas);
		const firstRoot =
			imported.rootIds.length > 0
				? canvas.nodes.get(imported.rootIds[0])
				: null;
		if (firstRoot) {
			if (sourceName === 'clipboard' && !this.isAutoAdjustCanvas(canvas))
				focusPastedRoot();
			else if (sourceName !== 'clipboard')
				this.canvasApi.selectForNavigation(
					canvas,
					firstRoot,
					this.settings.navigationZoomPadding
				);
		}
		new import_obsidian5.Notice(
			`Imported ${imported.nodes.length} topic${imported.nodes.length === 1 ? '' : 's'} from ${sourceName}${missingMediaCount > 0 ? ` · ${missingMediaCount} missing media highlighted` : ''}`
		);
	}
	updateNodeTypeAttributes(canvas) {
		if (!canvas || !canvas.nodes) return;
		for (const node of canvas.nodes.values()) {
			if (!node || !node.nodeEl) continue;
			const type = node.file
				? 'file'
				: node.unknownData?.type === 'group' || node.type === 'group'
					? 'group'
					: node.url
						? 'link'
						: hasAsyncRenderableContent(node.text)
							? 'embedded'
							: 'text';
			const shell = node.nodeEl.matches?.('.canvas-node')
				? node.nodeEl
				: node.nodeEl.closest?.('.canvas-node') ||
					node.nodeEl.querySelector?.('.canvas-node') ||
					node.nodeEl;
			let controlsOwner = shell;
			let ancestor = shell?.parentElement || null;
			const isSelected =
				canvas.selection?.has?.(node) ||
				canvas.selection?.has?.(node.id);
			for (
				let depth = 0;
				isSelected &&
				ancestor &&
				ancestor !== canvas.wrapperEl &&
				depth < 4;
				depth++
			) {
				const ownsResizeControl = Array.from(
					ancestor.children || []
				).some((child) =>
					child.matches?.(
						".canvas-node-resizer, .canvas-node-resizers, .canvas-node-resize-handle, [class*='resizer']"
					)
				);
				if (ownsResizeControl) {
					controlsOwner = ancestor;
					break;
				}
				ancestor = ancestor.parentElement;
			}
			for (const element of new Set([
				node.nodeEl,
				shell,
				controlsOwner
			])) {
				if (!element) continue;
				element.setAttribute('data-node-type', type);
				if (typeof element.toggleClass === 'function') {
					element.toggleClass(
						'tomindmap-plain-card',
						type === 'text'
					);
					element.toggleClass(
						'tomindmap-resizable-content',
						type !== 'text'
					);
				} else {
					element.classList?.toggle(
						'tomindmap-plain-card',
						type === 'text'
					);
					element.classList?.toggle(
						'tomindmap-resizable-content',
						type !== 'text'
					);
				}
			}
		}
	}
	attachNearbyOrphanMedia(canvas, nodeIds = null) {
		if (!canvas?.nodes || !this.isMindmapCanvas(canvas)) return 0;
		const forest = buildForest(canvas);
		if (forest.length === 0) return 0;
		const treeSize = (tree) => 1 + getDescendants(tree).length;
		const mainTree =
			forest
				.filter((tree) => {
					const node = tree.canvasNode;
					return !canvasNodeFilePath(node) && !canvasNodeUrl(node);
				})
				.sort((left, right) => treeSize(right) - treeSize(left))[0] ||
			forest[0];
		const mainRoot = mainTree.canvasNode;
		const treeNodes = [mainTree, ...getDescendants(mainTree)].map(
			(tree) => tree.canvasNode
		);
		const requestedIds = nodeIds ? new Set(nodeIds) : null;
		let attached = 0;
		for (const node of canvas.nodes.values()) {
			if (
				node.id === mainRoot.id ||
				(requestedIds && !requestedIds.has(node.id)) ||
				(!canvasNodeFilePath(node) && !canvasNodeUrl(node)) ||
				(this.canvasApi.getIncomingEdges(canvas, node) || []).length > 0
			) {
				continue;
			}
			const proximity = TreeDrag.findNearestAttachableNode(
				node,
				treeNodes,
				null,
				TreeDrag.ATTACHMENT_DISTANCE
			);
			if (!proximity) continue;
			const target = TreeDrag.findFirstNodeOnCornerRay(
				node,
				treeNodes,
				mainRoot
			);
			if (!target) continue;
			const edge = TreeDrag.createMindMapEdge(
				canvas,
				this.canvasApi,
				target,
				node,
				mainRoot,
				{ color: target.color, curvature: 0.35 }
			);
			if (edge) attached++;
		}
		if (attached > 0) {
			this.canvasApi.invalidateEdgeIndex();
			this.markMarkdownOrderDirty(canvas);
			if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			this.layoutEngine.layout(canvas);
			this.updateGroupBounds(canvas);
			canvas.requestSave();
			void this.flushCanvasToMarkdown(canvas);
		}
		return attached;
	}
	registerMediaDropHandler(canvas) {
		const wrapper = canvas.wrapperEl;
		if (!wrapper) return () => {};
		let hoveredNode = null;
		const supports = (event) =>
			MediaDrop.hasSupportedDrop(event.dataTransfer);

		const clearHover = () => {
			if (hoveredNode && hoveredNode.nodeEl) {
				hoveredNode.nodeEl.removeClass('tomindmap-node-drop-hover');
				hoveredNode = null;
			}
		};

		const updateHover = (event) => {
			if (!this.isMindmapCanvas(canvas)) {
				clearHover();
				return;
			}
			if (!supports(event)) {
				clearHover();
				return;
			}
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
			const target = findNodeFromEvent(canvas, event);
			const groupIds = getGroupIds(canvas);
			const nextHover =
				target && !groupIds.has(target.id) ? target : null;
			if (hoveredNode !== nextHover) {
				clearHover();
				if (nextHover && nextHover.nodeEl) {
					nextHover.nodeEl.addClass('tomindmap-node-drop-hover');
					hoveredNode = nextHover;
				}
			}
		};

		const onDragEnter = (event) => updateHover(event);
		const onDragOver = (event) => updateHover(event);
		const onDragLeave = (event) => {
			if (event.relatedTarget && !wrapper.contains(event.relatedTarget)) {
				clearHover();
			}
		};
		const onDrop = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			if (!supports(event)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			const target = hoveredNode || findNodeFromEvent(canvas, event);
			clearHover();
			const groupIds = getGroupIds(canvas);
			const topic = target && !groupIds.has(target.id) ? target : null;
			const position = canvas.posFromEvt(event);
			const files = Array.from(event.dataTransfer?.files || []);
			if (files.length > 0) {
				void this.addDroppedFiles(canvas, files, position, topic);
				return;
			}
			const url = MediaDrop.droppedUrl(event.dataTransfer);
			if (url) this.addDroppedUrl(canvas, url, position, topic);
		};

		wrapper.addEventListener('dragenter', onDragEnter, true);
		wrapper.addEventListener('dragover', onDragOver, true);
		wrapper.addEventListener('dragleave', onDragLeave, true);
		wrapper.addEventListener('drop', onDrop, true);
		return () => {
			clearHover();
			wrapper.removeEventListener('dragenter', onDragEnter, true);
			wrapper.removeEventListener('dragover', onDragOver, true);
			wrapper.removeEventListener('dragleave', onDragLeave, true);
			wrapper.removeEventListener('drop', onDrop, true);
		};
	}
	registerNodeDragReparentHandler(canvas) {
		const wrapper = canvas.wrapperEl;
		if (!wrapper) return () => {};
		const ownerDocument = wrapper.ownerDocument || document;
		let draggedNode = null;
		let dragStartPos = null;
		let isSingleCardDrag = false;
		let resizingNode = null;
		let previewFrame = null;
		let pointerUpFrame = null;
		let cachedDragForest = [];
		let liveBranchDirection = null;
		let livePreviewTargetId = null;
		let previewResolved = false;
		let draggedDescendants = [];
		let draggedMoveTo = null;
		let dragPointerStart = null;
		let latestPointerPosition = null;
		const stableMediaPositions = new Map(
			Array.from(canvas.nodes.values()).map((node) => [
				node.id,
				{ x: node.x, y: node.y }
			])
		);
		const rememberMediaPosition = (node) => {
			if (node)
				stableMediaPositions.set(node.id, { x: node.x, y: node.y });
		};

		const setMediaDragging = (node, active) => {
			if (
				!node?.nodeEl ||
				(!canvasNodeFilePath(node) &&
					!canvasNodeUrl(node) &&
					!hasAsyncRenderableContent(node.text))
			) {
				return;
			}
			if (typeof node.nodeEl.toggleClass === 'function')
				node.nodeEl.toggleClass('tomindmap-media-dragging', active);
			else
				node.nodeEl.classList?.toggle(
					'tomindmap-media-dragging',
					active
				);
		};
		const isMediaNode = (node) =>
			!!node &&
			(!!canvasNodeFilePath(node) ||
				!!canvasNodeUrl(node) ||
				hasAsyncRenderableContent(node.text));
		const setMindmapDragging = (active) => {
			if (typeof wrapper.toggleClass === 'function')
				wrapper.toggleClass('tomindmap-node-dragging', active);
			else wrapper.classList?.toggle('tomindmap-node-dragging', active);
		};

		const cancelPreviewFrame = () => {
			if (previewFrame === null) return;
			const view = wrapper.ownerDocument?.defaultView;
			if (typeof view?.cancelAnimationFrame === 'function')
				view.cancelAnimationFrame(previewFrame);
			else clearTimeout(previewFrame);
			previewFrame = null;
		};
		const restoreDraggedMove = () => {
			if (!draggedNode || !draggedMoveTo) return;
			if (draggedMoveTo.hadOwn)
				draggedNode.moveTo = draggedMoveTo.original;
			else delete draggedNode.moveTo;
			draggedMoveTo = null;
			draggedDescendants = [];
		};
		const moveSubtreeWithDraggedNode = (node) => {
			restoreDraggedMove();
			draggedDescendants = this.collectSubtreeNodes(canvas, node).filter(
				(candidate) => candidate.id !== node.id
			);
			if (draggedDescendants.length === 0) return;
			const original = node.moveTo;
			draggedMoveTo = {
				original,
				hadOwn: Object.prototype.hasOwnProperty.call(node, 'moveTo')
			};
			node.moveTo = (position) => {
				const dx = position.x - node.x;
				const dy = position.y - node.y;
				original.call(node, position);
				for (const descendant of draggedDescendants) {
					descendant.moveTo({
						x: descendant.x + dx,
						y: descendant.y + dy
					});
				}
			};
		};
		const applyUnsnappedDragPosition = () => {
			if (
				!draggedNode ||
				!dragStartPos ||
				!dragPointerStart ||
				!latestPointerPosition
			)
				return;
			draggedNode.moveTo({
				x:
					dragStartPos.x +
					latestPointerPosition.x -
					dragPointerStart.x,
				y: dragStartPos.y + latestPointerPosition.y - dragPointerStart.y
			});
		};

		const getMainRootNode = (node = draggedNode) => {
			if (node) {
				let tree = findTreeForNode(
					cachedDragForest.length > 0
						? cachedDragForest
						: buildForest(canvas),
					node.id
				);
				if (tree) {
					while (tree.parent) tree = tree.parent;
					return tree.canvasNode;
				}
			}
			const groupIds = getGroupIds(canvas);
			const allNodes = Array.from(canvas.nodes.values()).filter(
				(n) => !groupIds.has(n.id)
			);
			const edges = canvas.getData().edges || [];
			const childIds = new Set(edges.map((e) => e.toNode));
			const roots = allNodes.filter((n) => !childIds.has(n.id));
			return roots[0] || allNodes[0] || null;
		};
		const directionFromParent = (node) => {
			const parent = node
				? this.canvasApi.getParentNode(canvas, node)
				: null;
			if (!node || !parent) return null;
			return node.x + node.width / 2 >= parent.x + parent.width / 2
				? 'right'
				: 'left';
		};
		const directionOppositeIncomingSide = (incomingSide) =>
			incomingSide === 'left'
				? 'right'
				: incomingSide === 'right'
					? 'left'
					: null;

		const dragAttachment = createDragAttachmentController(
			canvas,
			this.canvasApi,
			() => {
				cachedDragForest = buildForest(canvas);
				return cachedDragForest;
			},
			getMainRootNode
		);

		const onPointerMove = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			if (!draggedNode || !dragStartPos) return;
			latestPointerPosition = canvas.posFromEvt(event);
			if (
				Math.hypot(
					draggedNode.x - dragStartPos.x,
					draggedNode.y - dragStartPos.y
				) <= 10
			)
				return;
			if (previewFrame !== null) return;
			const view = wrapper.ownerDocument?.defaultView;
			const run = () => {
				previewFrame = null;
				if (!draggedNode) return;
				applyUnsnappedDragPosition();
				const preview = isSingleCardDrag
					? dragAttachment.updatePreview(draggedNode)
					: null;
				previewResolved = Boolean(preview);
				if (preview?.state === 'preview' && preview.target) {
					const direction = directionOppositeIncomingSide(
						preview.incomingSide
					);
					const targetChanged =
						livePreviewTargetId !== preview.target.id;
					livePreviewTargetId = preview.target.id;
					if (
						direction &&
						(targetChanged || direction !== liveBranchDirection)
					) {
						liveBranchDirection = direction;
						this.layoutEngine.layoutChildren(
							canvas,
							draggedNode.id,
							direction,
							{
								animate: false,
								persist: false
							}
						);
					}
				} else if (preview?.state === 'detached') {
					const wasDirectional =
						livePreviewTargetId !== null ||
						liveBranchDirection !== null;
					livePreviewTargetId = null;
					liveBranchDirection = null;
					if (wasDirectional) {
						this.layoutEngine.layoutChildren(
							canvas,
							draggedNode.id,
							null,
							{
								animate: false,
								persist: false
							}
						);
					}
				} else if (this.canvasApi.getParentNode(canvas, draggedNode)) {
					const direction = directionFromParent(draggedNode);
					const leftTargetPreview = livePreviewTargetId !== null;
					livePreviewTargetId = null;
					if (
						direction &&
						(leftTargetPreview || direction !== liveBranchDirection)
					) {
						liveBranchDirection = direction;
						this.layoutEngine.layoutChildren(
							canvas,
							draggedNode.id,
							direction,
							{
								animate: false,
								persist: false
							}
						);
					}
				}
			};
			previewFrame =
				typeof view?.requestAnimationFrame === 'function'
					? view.requestAnimationFrame(run)
					: setTimeout(run, 16);
		};

		const finishPointerUp = (event) => {
			ownerDocument.removeEventListener(
				'pointermove',
				onPointerMove,
				true
			);
			ownerDocument.removeEventListener('pointerup', onPointerUp, true);
			ownerDocument.removeEventListener('mousemove', onPointerMove, true);
			ownerDocument.removeEventListener('mouseup', onPointerUp, true);
			if (!this.isMindmapCanvas(canvas)) {
				cancelPreviewFrame();
				dragAttachment.cancel();
				restoreDraggedMove();
				setMindmapDragging(false);
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				resizingNode = null;
				return;
			}
			cancelPreviewFrame();
			applyUnsnappedDragPosition();

			if (resizingNode) {
				const resized = resizingNode;
				resizingNode = null;
				dragAttachment.cancel();
				restoreDraggedMove();
				setMindmapDragging(false);
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				const finalizeResize = () => {
					if (this.isMindmapCanvas(canvas)) {
						this.layoutEngine.layout(canvas);
						this.updateGroupBounds(canvas);
					}
					canvas.requestSave();
					this.canvasApi.selectForNavigation(
						canvas,
						resized,
						this.settings.navigationZoomPadding
					);
					rememberMediaPosition(resized);
					void this.flushCanvasToMarkdown(canvas);
				};
				const view = wrapper.ownerDocument?.defaultView;
				if (typeof view?.requestAnimationFrame === 'function')
					view.requestAnimationFrame(finalizeResize);
				else setTimeout(finalizeResize, 0);
				return;
			}

			if (!draggedNode || !dragStartPos) {
				const selected = this.canvasApi.getSelectedNode(canvas);
				if (
					!isMediaNode(selected) ||
					getGroupIds(canvas).has(selected.id)
				)
					return;
				const stable = stableMediaPositions.get(selected.id);
				if (!stable) {
					rememberMediaPosition(selected);
					return;
				}
				if (
					Math.abs(selected.x - stable.x) <= 0.5 &&
					Math.abs(selected.y - stable.y) <= 0.5
				) {
					return;
				}
				// Native note/PDF previews may live in an embedded document whose
				// pointerdown never reaches the Canvas wrapper. Reconcile the selected
				// media card authoritatively from its final geometry on pointerup.
				dragAttachment.begin(selected);
				dragAttachment.updatePreview(selected);
				const result = dragAttachment.commit(selected);
				if (this.isMindmapCanvas(canvas)) {
					const branchDirection = result.target
						? directionFromParent(selected)
						: null;
					this.layoutEngine.layout(canvas, {
						preserveRootSides: true,
						branchDirectionOverride: branchDirection
							? {
									nodeId: selected.id,
									direction: branchDirection
								}
							: null
					});
					this.updateGroupBounds(canvas);
				}
				if (this.settings.autoColor && this.isMindmapCanvas(canvas))
					this.branchColors.applyColors(canvas);
				if (result.changed) this.markMarkdownOrderDirty(canvas);
				canvas.requestSave();
				rememberMediaPosition(selected);
				void this.flushCanvasToMarkdown(canvas);
				return;
			}
			setMediaDragging(draggedNode, false);
			setMindmapDragging(false);
			const movedDistance = Math.hypot(
				draggedNode.x - dragStartPos.x,
				draggedNode.y - dragStartPos.y
			);
			const nodeToMove = draggedNode;
			const wasSingleCardDrag = isSingleCardDrag;
			restoreDraggedMove();

			if (movedDistance <= 10) {
				dragAttachment.cancel();
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				return;
			}

			const forest = buildForest(canvas);
			if (wasSingleCardDrag) {
				// A fast release may precede the first preview frame. Otherwise commit
				// the exact locked target represented by the visible preview arrow.
				if (!previewResolved) dragAttachment.updatePreview(nodeToMove);
				const result = dragAttachment.commit(nodeToMove);
				// Mind-map positions are authoritative. Reflow even if the closest
				// parent stayed the same, so media cannot remain freely positioned.
				if (this.isMindmapCanvas(canvas)) {
					const branchDirection = result.target
						? result.state === 'attached' && result.changed
							? directionOppositeIncomingSide(result.incomingSide)
							: liveBranchDirection ||
								directionFromParent(nodeToMove)
						: null;
					this.layoutEngine.layout(canvas, {
						preserveRootSides: true,
						branchDirectionOverride: branchDirection
							? {
									nodeId: nodeToMove.id,
									direction: branchDirection
								}
							: null
					});
					this.updateGroupBounds(canvas);
				}
				if (this.settings.autoColor && this.isMindmapCanvas(canvas))
					this.branchColors.applyColors(canvas);
				if (result.changed) this.markMarkdownOrderDirty(canvas);
				canvas.requestSave();
				rememberMediaPosition(nodeToMove);
				void this.flushCanvasToMarkdown(canvas);
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				return;
			}

			dragAttachment.cancel();
			draggedNode = null;
			dragStartPos = null;
			isSingleCardDrag = false;

			const targetNode = findNodeFromEvent(canvas, event);
			let hierarchyChanged = false;
			let dropZone = null;
			if (
				targetNode &&
				targetNode.id !== nodeToMove.id &&
				!getGroupIds(canvas).has(targetNode.id)
			) {
				const dropPoint = canvas.posFromEvt(event);
				dropZone = TreeDrag.classifyDropZone(targetNode, dropPoint);
				if (
					TreeDrag.reparentSubtree(
						canvas,
						this.canvasApi,
						nodeToMove,
						targetNode,
						dropZone,
						forest
					)
				) {
					hierarchyChanged = true;
					this.markMarkdownOrderDirty(canvas);
				}
			}

			const parentNode = this.canvasApi.getParentNode(canvas, nodeToMove);
			if (this.isMindmapCanvas(canvas) && parentNode) {
				const branchDirection = hierarchyChanged
					? directionFromParent(nodeToMove)
					: liveBranchDirection || directionFromParent(nodeToMove);
				this.layoutEngine.layout(canvas, {
					preserveRootSides: true,
					branchDirectionOverride: {
						nodeId: nodeToMove.id,
						direction: branchDirection
					}
				});
				this.updateGroupBounds(canvas);
			}
			if (this.settings.autoColor && this.isMindmapCanvas(canvas))
				this.branchColors.applyColors(canvas);
			canvas.requestSave();
			void this.flushCanvasToMarkdown(canvas);
			if (hierarchyChanged)
				new import_obsidian5.Notice(
					dropZone === 'child'
						? 'Re-parented as child topic'
						: 'Re-parented as sibling topic'
				);
		};

		const onPointerUp = (event) => {
			if (pointerUpFrame !== null) return;
			if (draggedNode) latestPointerPosition = canvas.posFromEvt(event);
			if (
				draggedNode &&
				this.canvasApi.getParentNode(canvas, draggedNode)
			) {
				const releasedDirection = directionFromParent(draggedNode);
				if (releasedDirection) liveBranchDirection = releasedDirection;
			}
			const view = wrapper.ownerDocument?.defaultView;
			const finish = () => {
				pointerUpFrame = null;
				finishPointerUp(event);
			};
			pointerUpFrame =
				typeof view?.requestAnimationFrame === 'function'
					? view.requestAnimationFrame(finish)
					: setTimeout(finish, 0);
		};

		const onPointerDown = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			dragAttachment.cancel();
			const node = findNodeFromEvent(canvas, event);
			const groupIds = getGroupIds(canvas);
			if (node && !groupIds.has(node.id)) {
				draggedNode = node;
				dragStartPos = { x: node.x, y: node.y };
				dragPointerStart = canvas.posFromEvt(event);
				latestPointerPosition = dragPointerStart;
				const selectionSize = canvas.selection
					? canvas.selection.size
					: 1;
				isSingleCardDrag = selectionSize <= 1;
				const parentNode = this.canvasApi.getParentNode(canvas, node);
				liveBranchDirection = parentNode
					? directionFromParent(node)
					: null;
				livePreviewTargetId = null;
				previewResolved = false;

				if (isSingleCardDrag) {
					if (!resizingNode) setMediaDragging(node, true);
					dragAttachment.begin(node);
					moveSubtreeWithDraggedNode(node);
					setMindmapDragging(true);
					ownerDocument.addEventListener(
						'pointermove',
						onPointerMove,
						true
					);
					ownerDocument.addEventListener(
						'pointerup',
						onPointerUp,
						true
					);
					ownerDocument.addEventListener(
						'mousemove',
						onPointerMove,
						true
					);
					ownerDocument.addEventListener(
						'mouseup',
						onPointerUp,
						true
					);
				}
			} else {
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				liveBranchDirection = null;
				livePreviewTargetId = null;
				previewResolved = false;
				dragPointerStart = null;
				latestPointerPosition = null;
			}
		};

		const blockNonFileResizing = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			const target = event.target;
			const HTMLElementClass =
				target?.ownerDocument?.defaultView?.HTMLElement;
			if (
				!target ||
				!HTMLElementClass ||
				!(target instanceof HTMLElementClass)
			)
				return;
			const resizer = target.closest(
				".canvas-node-resizer, .canvas-node-resizers, .canvas-node-resize-handle, [class*='resizer']"
			);
			if (resizer) {
				let node = findNodeFromEvent(canvas, event);
				if (!node && canvas.selection?.size === 1)
					node = canvas.selection.values().next().value || null;
				if (!isResizableCanvasNode(node, getGroupIds(canvas))) {
					event.preventDefault();
					event.stopPropagation();
					event.stopImmediatePropagation();
				} else {
					resizingNode = node;
					ownerDocument.addEventListener(
						'pointerup',
						onPointerUp,
						true
					);
					ownerDocument.addEventListener(
						'mouseup',
						onPointerUp,
						true
					);
				}
			}
		};

		wrapper.addEventListener('mousedown', blockNonFileResizing, true);
		wrapper.addEventListener('pointerdown', blockNonFileResizing, true);
		wrapper.addEventListener('touchstart', blockNonFileResizing, true);
		wrapper.addEventListener('pointerdown', onPointerDown, true);
		wrapper.addEventListener('pointermove', onPointerMove, true);
		wrapper.addEventListener('pointerup', onPointerUp, true);
		return () => {
			wrapper.removeEventListener(
				'mousedown',
				blockNonFileResizing,
				true
			);
			wrapper.removeEventListener(
				'pointerdown',
				blockNonFileResizing,
				true
			);
			wrapper.removeEventListener(
				'touchstart',
				blockNonFileResizing,
				true
			);
			wrapper.removeEventListener('pointerdown', onPointerDown, true);
			wrapper.removeEventListener('pointermove', onPointerMove, true);
			wrapper.removeEventListener('pointerup', onPointerUp, true);
			ownerDocument.removeEventListener(
				'pointermove',
				onPointerMove,
				true
			);
			ownerDocument.removeEventListener('pointerup', onPointerUp, true);
			ownerDocument.removeEventListener('mousemove', onPointerMove, true);
			ownerDocument.removeEventListener('mouseup', onPointerUp, true);
			cancelPreviewFrame();
			if (pointerUpFrame !== null) {
				const view = wrapper.ownerDocument?.defaultView;
				if (typeof view?.cancelAnimationFrame === 'function')
					view.cancelAnimationFrame(pointerUpFrame);
				else clearTimeout(pointerUpFrame);
				pointerUpFrame = null;
			}
			setMediaDragging(draggedNode, false);
			setMindmapDragging(false);
			dragAttachment.cancel();
			restoreDraggedMove();
			draggedNode = null;
			dragStartPos = null;
			isSingleCardDrag = false;
			liveBranchDirection = null;
			livePreviewTargetId = null;
			resizingNode = null;
			dragPointerStart = null;
			latestPointerPosition = null;
		};
	}
	canvasViewportCenter(canvas) {
		const rect = canvas.wrapperEl.getBoundingClientRect();
		return canvas.posFromEvt({
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2
		});
	}
	openMediaFilePicker(canvas) {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		const handler = () => {
			input.removeEventListener('change', handler);
			const files = Array.from(input.files || []);
			if (files.length === 0) return;
			const selected = this.canvasApi.getSelectedNode(canvas);
			const topic =
				selected &&
				typeof selected.text === 'string' &&
				!getGroupIds(canvas).has(selected.id)
					? selected
					: null;
			const position = topic
				? {
						x: topic.x + topic.width + this.settings.horizontalGap,
						y: topic.y
					}
				: this.canvasViewportCenter(canvas);
			void this.addDroppedFiles(canvas, files, position, topic);
		};
		input.addEventListener('change', handler);
		input.click();
	}
	async addDroppedFiles(canvas, files, position, topic = null) {
		const sourcePath = canvas.view?.file?.path || '';
		const createdFiles = [];
		let failures = 0;
		const markdownPath = this.getMarkdownSyncPath(canvas.getData());
		const queuedMarkdownApply = markdownPath
			? this.markdownModifyTimers.get(markdownPath)
			: void 0;
		if (queuedMarkdownApply !== void 0) {
			clearTimeout(queuedMarkdownApply);
			this.markdownModifyTimers.delete(markdownPath);
		}
		this.localCanvasMutations.add(canvas);
		try {
			for (const file of files) {
				try {
					const attachmentPath =
						await this.app.fileManager.getAvailablePathForAttachment(
							file.name || 'Attachment',
							sourcePath
						);
					const created = await this.app.vault.createBinary(
						attachmentPath,
						await file.arrayBuffer()
					);
					createdFiles.push({
						file: created,
						mimeType: file.type || ''
					});
				} catch (error) {
					failures++;
					console.error(
						`ToMindMap: could not add dropped file "${file.name || 'Attachment'}"`,
						error
					);
				}
			}
			if (createdFiles.length === 0) {
				new import_obsidian5.Notice('Could not add the dropped files');
				return;
			}
			const nodes = [];
			let cursorY = topic ? topic.y : Number(position?.y) || 0;
			const startX = topic
				? topic.x + topic.width + this.settings.horizontalGap
				: Number(position?.x) || 0;

			for (const { file, mimeType } of createdFiles) {
				let id = genId();
				while (canvas.nodes.has(id)) id = genId();
				const nodeSpec = MediaDrop.createFileNodeSpec(
					file.path,
					mimeType,
					{ x: startX, y: cursorY },
					this.settings,
					id
				);
				nodes.push(nodeSpec);
				cursorY += nodeSpec.height + this.settings.verticalGap;
			}

			canvas.importData({ nodes, edges: [] });
			this.canvasApi.invalidateEdgeIndex();

			if (topic) {
				for (const spec of nodes) {
					const childNode = canvas.nodes.get(spec.id);
					if (childNode) this.connectTopics(canvas, topic, childNode);
				}
			} else {
				this.attachNearbyOrphanMedia(
					canvas,
					nodes.map((node) => node.id)
				);
				const first = canvas.nodes.get(nodes[0].id);
				if (first)
					this.canvasApi.selectForNavigation(
						canvas,
						first,
						this.settings.navigationZoomPadding
					);
			}
			// This queues the newer Canvas state for Markdown before the mutation
			// guard is released.
			canvas.requestSave();
			const added = createdFiles.length;
			void this.flushCanvasToMarkdown(canvas);
			new import_obsidian5.Notice(
				`Added ${added} file${added === 1 ? '' : 's'} to the mind map${failures > 0 ? ` · ${failures} could not be read` : ''}`
			);
		} finally {
			this.localCanvasMutations.delete(canvas);
		}
	}
	resolveDroppedVaultFile(value, sourcePath = '') {
		const extracted = MediaDrop.extractFilePathFromUrl(value);
		if (!extracted) return null;
		const candidates = [];
		const addCandidate = (candidate) => {
			let normalized = String(candidate || '').trim();
			if (!normalized) return;
			try {
				normalized = decodeURIComponent(normalized);
			} catch (_) {}
			normalized = normalized.replace(/\\/g, '/').replace(/^\.\/+/, '');
			if (!candidates.includes(normalized)) candidates.push(normalized);
			const withoutLeadingSlash = normalized.replace(/^\/+/, '');
			if (
				withoutLeadingSlash &&
				!candidates.includes(withoutLeadingSlash)
			)
				candidates.push(withoutLeadingSlash);
		};
		addCandidate(extracted);
		if (String(value || '').startsWith('file:')) {
			const basePath = this.app.vault.adapter?.getBasePath?.();
			if (basePath) {
				const normalizedBase = String(basePath)
					.replace(/\\/g, '/')
					.replace(/\/+$/, '');
				const absolute = candidates[0] || '';
				if (
					absolute === normalizedBase ||
					absolute.startsWith(`${normalizedBase}/`)
				)
					addCandidate(
						absolute
							.slice(normalizedBase.length)
							.replace(/^\/+/, '')
					);
			}
		}
		for (const candidate of candidates) {
			const direct = this.app.vault.getAbstractFileByPath(candidate);
			if (direct instanceof import_obsidian5.TFile) return direct;
			const resolved = this.app.metadataCache.getFirstLinkpathDest(
				candidate,
				sourcePath
			);
			if (resolved instanceof import_obsidian5.TFile) return resolved;
		}
		const files = this.app.vault.getFiles?.() || [];
		for (const candidate of candidates) {
			const suffix = `/${candidate.replace(/^\/+/, '')}`;
			const matches = files.filter((file) =>
				`/${file.path}`.endsWith(suffix)
			);
			if (matches.length === 1) return matches[0];
		}
		return null;
	}
	addDroppedUrl(canvas, url, position, topic = null) {
		let id = genId();
		while (canvas.nodes.has(id)) id = genId();

		const startX = topic
			? topic.x + topic.width + this.settings.horizontalGap
			: Number(position?.x) || 0;
		const startY = topic ? topic.y : Number(position?.y) || 0;

		const sourcePath = canvas.view?.file?.path || '';
		const vaultFile = this.resolveDroppedVaultFile(url, sourcePath);
		const isPlainFilePath =
			MediaDrop.extractFilePathFromUrl(url) &&
			!/^[a-z][a-z0-9+.-]*:/i.test(String(url || '').trim());
		if (isPlainFilePath && !vaultFile) {
			new import_obsidian5.Notice(
				`Could not resolve the dropped vault file: ${url}`
			);
			return;
		}
		const nodeSpec = vaultFile
			? MediaDrop.createFileNodeSpec(
					vaultFile.path,
					vaultFile.extension
						? `application/${vaultFile.extension}`
						: '',
					{ x: startX, y: startY },
					this.settings,
					id
				)
			: MediaDrop.createLinkNodeSpec(
					url,
					{ x: startX, y: startY },
					this.settings,
					id
				);

		canvas.importData({ nodes: [nodeSpec], edges: [] });
		this.canvasApi.invalidateEdgeIndex();

		const node = canvas.nodes.get(id);
		if (topic && node) {
			this.connectTopics(canvas, topic, node);
		} else if (node) {
			this.canvasApi.selectForNavigation(
				canvas,
				node,
				this.settings.navigationZoomPadding
			);
		}
		canvas.requestSave();
		new import_obsidian5.Notice('Added link to the mind map');
	}
	connectTopics(canvas, parent, child) {
		if (!parent || !child || parent === child) return;
		if (this.canvasApi.getParentNode(canvas, child)) {
			new import_obsidian5.Notice('That topic already has a parent');
			return;
		}
		if (
			this.collectSubtreeNodes(canvas, child).some(
				(node) => node.id === parent.id
			)
		) {
			new import_obsidian5.Notice('That connection would create a loop');
			return;
		}
		const direction =
			child.x + child.width / 2 < parent.x + parent.width / 2
				? 'left'
				: 'right';
		this.canvasApi.createEdge(
			canvas,
			parent,
			child,
			direction,
			direction === 'right' ? 'left' : 'right',
			parent.color || void 0
		);
		if (this.isMindmapCanvas(canvas))
			this.layoutEngine.layoutChildren(canvas, parent.id);
		if (this.settings.autoColor && this.isMindmapCanvas(canvas))
			this.branchColors.applyColors(canvas);
		this.markMarkdownOrderDirty(canvas);
		canvas.requestSave();
		this.canvasApi.selectForNavigation(
			canvas,
			child,
			this.settings.navigationZoomPadding
		);
	}
	mediaTargetExists(target, sourcePath) {
		const cleanTarget = String(target || '')
			.split('#')[0]
			.split('?')[0]
			.trim();
		if (!cleanTarget) return true;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(
			cleanTarget,
			sourcePath
		);
		if (resolved) return true;
		const sourceFolder = sourcePath.includes('/')
			? sourcePath.slice(0, sourcePath.lastIndexOf('/'))
			: '';
		const relative = sourceFolder
			? `${sourceFolder}/${cleanTarget}`
			: cleanTarget;
		const normalized =
			typeof import_obsidian5.normalizePath === 'function'
				? (0, import_obsidian5.normalizePath)(relative)
				: relative.replace(/\\/g, '/').replace(/\/+/g, '/');
		return !!this.app.vault.getAbstractFileByPath(normalized);
	}
	async validateMediaLinks(canvas, nodes, showNotice) {
		const sourcePath =
			canvas.view && canvas.view.file ? canvas.view.file.path : '';
		const data = canvas.getData();
		const previous =
			data.mindmapMissingMedia &&
			typeof data.mindmapMissingMedia === 'object'
				? data.mindmapMissingMedia
				: {};
		const markers = { ...previous };
		let missingCount = 0;
		for (const node of nodes) {
			const targets = extractLocalMediaTargets(node.text || '');
			const missing = targets.filter(
				(target) => !this.mediaTargetExists(target, sourcePath)
			);
			if (missing.length > 0) {
				markers[node.id] = missing;
				missingCount += missing.length;
			} else {
				delete markers[node.id];
				if (previous[node.id]) {
					const nodeData = data.nodes.find(
						(item) => item.id === node.id
					);
					if (nodeData) delete nodeData.color;
				}
			}
		}
		data.mindmapMissingMedia = markers;
		canvas.setData(data);
		if (this.settings.autoColor && this.isMindmapCanvas(canvas))
			this.branchColors.applyColors(canvas);
		for (const nodeId of Object.keys(markers)) {
			const node = canvas.nodes.get(nodeId);
			if (node && typeof node.setColor === 'function') node.setColor('1');
		}
		this.applyMissingMediaMarkers(canvas);
		canvas.requestSave();
		if (showNotice) {
			new import_obsidian5.Notice(
				missingCount > 0
					? `${missingCount} missing local media reference${missingCount === 1 ? '' : 's'} highlighted in red`
					: 'All local media references resolve'
			);
		}
		return missingCount;
	}
	applyMissingMediaMarkers(canvas) {
		const data = canvas.getData();
		const markers =
			data.mindmapMissingMedia &&
			typeof data.mindmapMissingMedia === 'object'
				? data.mindmapMissingMedia
				: {};
		for (const node of canvas.nodes.values()) {
			if (!node.nodeEl) continue;
			node.nodeEl.removeClass('tomindmap-missing-media');
			node.nodeEl.removeAttribute('data-tomindmap-missing-media');
			const missing = markers[node.id];
			if (!Array.isArray(missing) || missing.length === 0) continue;
			node.nodeEl.addClass('tomindmap-missing-media');
			node.nodeEl.setAttribute(
				'data-tomindmap-missing-media',
				`Missing: ${missing.join(', ')}`
			);
		}
	}
	openExportModal(canvas) {
		new ExportMindMapModal(this.app, canvas.selection.size > 0, (request) =>
			this.exportMindMap(canvas, request)
		).open();
	}
	async exportMindMap(canvas, request) {
		const scope = request.format === 'markdown' ? 'whole' : request.scope;
		if (scope === 'selection' && canvas.selection.size === 0) {
			new import_obsidian5.Notice('Select at least one card to export');
			return;
		}
		if (request.format === 'pdf') {
			await this.exportMindMapPdf(canvas, scope);
			return;
		}
		const base =
			canvas.view && canvas.view.file
				? canvas.view.file.basename
				: 'Mind map';
		const scopeName =
			scope === 'whole'
				? 'Whole map'
				: scope === 'viewport'
					? 'Viewport'
					: 'Selection';
		try {
			if (request.format === 'markdown') {
				const markdown = portableMindMapMarkdown(canvas);
				const filename = await saveToDownloads(
					base,
					'Mind map',
					'md',
					markdown
				);
				new import_obsidian5.Notice(
					`Saved Markdown to Downloads: ${filename}`
				);
				return;
			}
			const html = canvasPrintDocument(canvas, scope);
			if (!html)
				throw new Error('Nothing is available in that export area');
			if (request.format === 'svg') {
				const svg = pdfSvgFromDocument(html, false);
				if (!svg) throw new Error('Could not build SVG');
				const filename = await saveToDownloads(
					base,
					scopeName,
					'svg',
					svg.svg
				);
				new import_obsidian5.Notice(
					`Saved SVG to Downloads: ${filename}`
				);
				return;
			}
			if (request.format === 'png') {
				const ownerDocument =
					canvas.wrapperEl.ownerDocument || document;
				let svg = pdfSvgFromDocument(html, false);
				if (!svg) throw new Error('Could not build image');
				let bytes;
				try {
					bytes = await rasterizeSvg(svg, ownerDocument, 'image/png');
				} catch (error) {
					console.warn(
						'ToMindMap: rich image rendering failed; using portable text SVG',
						error
					);
					svg = pdfSvgFromDocument(html, true);
					if (!svg) throw error;
					bytes = await rasterizeSvg(svg, ownerDocument, 'image/png');
				}
				const filename = await saveToDownloads(
					base,
					scopeName,
					'png',
					bytes
				);
				new import_obsidian5.Notice(
					`Saved PNG to Downloads: ${filename}`
				);
			}
		} catch (error) {
			console.error('ToMindMap: export failed', error);
			new import_obsidian5.Notice(
				`Could not export ${request.format.toUpperCase()}`
			);
		}
	}
	async exportMindMapPdf(canvas, scope) {
		const html = canvasPrintDocument(canvas, scope);
		if (!html) {
			new import_obsidian5.Notice(
				scope === 'selection'
					? 'Select at least one card to export'
					: 'Nothing is available in that export area'
			);
			return;
		}
		const ownerDocument = canvas.wrapperEl.ownerDocument || document;
		try {
			let svgInfo = pdfSvgFromDocument(html, false);
			if (!svgInfo) throw new Error('Could not build the mind map SVG');
			let jpeg;
			try {
				jpeg = await renderSvgAsJpeg(svgInfo, ownerDocument);
			} catch (richError) {
				console.warn(
					'ToMindMap: rich PDF rendering failed; using text fallback',
					richError
				);
				svgInfo = pdfSvgFromDocument(html, true);
				if (!svgInfo) throw richError;
				jpeg = await renderSvgAsJpeg(svgInfo, ownerDocument);
			}
			const pdf = mindMapPdfBytes(jpeg);
			const base =
				canvas.view && canvas.view.file
					? canvas.view.file.basename
					: 'Mind map';
			const scopeName =
				scope === 'whole'
					? 'Whole map'
					: scope === 'viewport'
						? 'Viewport'
						: 'Selection';
			const filename = await saveToDownloads(base, scopeName, 'pdf', pdf);
			new import_obsidian5.Notice(`Saved PDF to Downloads: ${filename}`);
		} catch (error) {
			console.error('ToMindMap: PDF export failed', error);
			new import_obsidian5.Notice('Could not save the PDF to Downloads');
		}
	}
	/**
	 * Import a FreeMind .mm file and create a .canvas file.
	 * @param folderPath Optional target folder; defaults to vault root.
	 */
	importFreeMindFile(folderPath) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.mm';
		const handler = () => {
			var _a;
			input.removeEventListener('change', handler);
			const file = (_a = input.files) == null ? void 0 : _a[0];
			if (!file) return;
			void (async () => {
				const xml = await file.text();
				const canvasData = freemindToCanvas(xml, {
					nodeWidth: this.settings.defaultNodeWidth,
					nodeHeight: this.settings.defaultNodeHeight,
					maxNodeHeight: this.settings.maxNodeHeight,
					horizontalGap: this.settings.horizontalGap,
					verticalGap: this.settings.verticalGap
				});
				if (!canvasData) {
					new import_obsidian5.Notice(
						'Failed to parse .mm file. Make sure it is a valid mind map file.'
					);
					return;
				}
				const baseName = file.name.replace(/\.mm$/i, '');
				const folder = folderPath ? folderPath + '/' : '';
				let canvasPath = `${folder}${baseName}.canvas`;
				let counter = 1;
				while (this.app.vault.getAbstractFileByPath(canvasPath)) {
					canvasPath = `${folder}${baseName} ${counter}.canvas`;
					counter++;
				}
				await this.app.vault.create(
					canvasPath,
					JSON.stringify(canvasData, null, '	')
				);
				const created =
					this.app.vault.getAbstractFileByPath(canvasPath);
				if (created instanceof import_obsidian5.TFile) {
					await this.app.workspace.getLeaf(false).openFile(created);
				}
				new import_obsidian5.Notice(
					`Imported "${file.name}" as "${canvasPath}"`
				);
			})();
		};
		input.addEventListener('change', handler);
		input.click();
	}
	isMindmapCanvas(canvas) {
		const data = canvas.getData();
		if (typeof data.mindmap === 'boolean') return data.mindmap;
		return this.settings.defaultMindmapMode;
	}
	isAutoAdjustCanvas(canvas) {
		return this.isMindmapCanvas(canvas);
	}
	toggleMindmapMode(canvas) {
		const data = canvas.getData();
		const newValue = !this.isMindmapCanvas(canvas);
		data.mindmap = newValue;
		delete data.mindmapAutoAdjust;
		canvas.setData(data);
		canvas.requestSave();
		if (newValue && this.settings.autoColor) {
			this.branchColors.applyColors(canvas);
		}
		if (newValue) {
			const groupIds = getGroupIds(canvas);
			this.resizeNodesWhenRendered(
				canvas,
				Array.from(canvas.nodes.values()).filter(
					(node) => !groupIds.has(node.id)
				)
			);
		}
		if (newValue) {
			this.refreshOutline(canvas);
		} else {
			this.liveSizing.stopWatchingCanvas();
			for (const node of canvas.nodes.values()) {
				var _a;
				(_a = node.nodeEl) == null
					? void 0
					: _a.removeClass('tomindmap-navigation-selected');
			}
			this.hideOutline();
		}
		this.updateToggleButton(canvas);
	}
	injectToggleButton(canvas) {
		if (this.cleanupToggleHandler) {
			this.cleanupToggleHandler();
			this.cleanupToggleHandler = null;
		}
		if (this.toggleBtnEl) {
			this.toggleBtnEl.remove();
			this.toggleBtnEl = null;
		}
		if (this.mediaBtnEl) {
			this.mediaBtnEl.remove();
			this.mediaBtnEl = null;
		}
		if (canvas.wrapperEl)
			canvas.wrapperEl.toggleClass(
				'tomindmap-mindmap-mode',
				this.isMindmapCanvas(canvas)
			);
		const controls =
			canvas.view.containerEl.querySelector('.canvas-controls');
		if (!controls) return;
		const ownerDocument = controls.ownerDocument || document;
		const btn = ownerDocument.createElement('div');
		btn.addClass('tomindmap-toggle-btn', 'clickable-icon');
		btn.setAttribute('aria-label', 'Toggle mindmap mode');
		const container = canvas.view.containerEl;
		let suppressClick = false;
		const toggleFromEvent = (e) => {
			const target = e.target;
			if (!target?.closest?.('.tomindmap-toggle-btn')) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			this.toggleMindmapMode(canvas);
		};
		const onTogglePointerDown = (event) => {
			if (!event.target?.closest?.('.tomindmap-toggle-btn')) return;
			suppressClick = true;
			toggleFromEvent(event);
		};
		const onToggleClick = (event) => {
			const isToggleClick = !!event.target?.closest?.(
				'.tomindmap-toggle-btn'
			);
			if (suppressClick && isToggleClick) {
				suppressClick = false;
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			if (!isToggleClick) return;
			toggleFromEvent(event);
		};
		container.addEventListener('pointerdown', onTogglePointerDown, true);
		container.addEventListener('click', onToggleClick, true);
		this.cleanupToggleHandler = () => {
			container.removeEventListener(
				'pointerdown',
				onTogglePointerDown,
				true
			);
			container.removeEventListener('click', onToggleClick, true);
		};
		controls.prepend(btn);
		this.toggleBtnEl = btn;
		this.updateToggleButton(canvas);
	}
	updateToggleButton(canvas) {
		if (canvas.wrapperEl)
			canvas.wrapperEl.toggleClass(
				'tomindmap-mindmap-mode',
				this.isMindmapCanvas(canvas)
			);
		if (!this.toggleBtnEl) return;
		const isActive = this.isMindmapCanvas(canvas);
		this.toggleBtnEl.empty();
		(0, import_obsidian5.setIcon)(
			this.toggleBtnEl,
			isActive ? 'network' : 'layout-dashboard'
		);
		this.toggleBtnEl.toggleClass('is-active', isActive);
		this.toggleBtnEl.setAttribute(
			'aria-label',
			isActive
				? 'Mindmap mode: Enter sibling · Tab child · Type to edit'
				: 'Mindmap mode (inactive)'
		);
	}
	/** Schedule a setTimeout that is automatically cancelled on unload/canvas switch. */
	trackedTimeout(callback, ms) {
		const id = setTimeout(() => {
			this.pendingTimers.delete(id);
			callback();
		}, ms);
		this.pendingTimers.add(id);
	}
	/** Schedule a requestAnimationFrame that is automatically cancelled on cleanup. */
	trackedRaf(callback) {
		const id = requestAnimationFrame(() => {
			this.pendingRafs.delete(id);
			callback();
		});
		this.pendingRafs.add(id);
	}
	/** Cancel all pending tracked timers, RAFs, and observers. */
	cancelPendingAsync() {
		if (this.liveSizing) {
			this.liveSizing.cancelQueue();
			this.liveSizing.stopWatchingCanvas();
		}
		if (this.renderResizeQueueCleanup) this.renderResizeQueueCleanup();
		for (const id of this.pendingTimers) clearTimeout(id);
		this.pendingTimers.clear();
		for (const id of this.pendingRafs) cancelAnimationFrame(id);
		this.pendingRafs.clear();
		for (const obs of this.pendingObservers) obs.disconnect();
		this.pendingObservers.clear();
	}
	/** Restore wrapped canvas methods to originals. */
	unwrapCanvasMethods() {
		if (this.interceptedCanvas) {
			if (this.origCanvasMethods.requestSave) {
				this.interceptedCanvas.requestSave =
					this.origCanvasMethods.requestSave;
			}
			if (this.origCanvasMethods.createGroupNode) {
				this.interceptedCanvas.createGroupNode =
					this.origCanvasMethods.createGroupNode;
			}
			if (this.origCanvasMethods.undo) {
				this.interceptedCanvas.undo = this.origCanvasMethods.undo;
			}
			if (this.origCanvasMethods.redo) {
				this.interceptedCanvas.redo = this.origCanvasMethods.redo;
			}
			if (this.origCanvasMethods.selectOnly) {
				this.interceptedCanvas.selectOnly =
					this.origCanvasMethods.selectOnly;
			}
			if (this.origCanvasMethods.deselectAll) {
				this.interceptedCanvas.deselectAll =
					this.origCanvasMethods.deselectAll;
			}
			if (this.origCanvasMethods.importData) {
				this.interceptedCanvas.importData =
					this.origCanvasMethods.importData;
			}
			if (this.origCanvasMethods.removeEdge) {
				this.interceptedCanvas.removeEdge =
					this.origCanvasMethods.removeEdge;
			}
		}
		this.interceptedCanvas = null;
		this.origCanvasMethods = {};
	}
	async loadSettings() {
		const stored = (await this.loadData()) || {};
		const migrated = { ...stored };
		if (migrated.maxNodeWidth === 420)
			migrated.maxNodeWidth = DEFAULT_SETTINGS.maxNodeWidth;
		if (migrated.maxNodeHeight === 300)
			migrated.maxNodeHeight = DEFAULT_SETTINGS.maxNodeHeight;
		this.settings = normalizeSettings(migrated);
		if (JSON.stringify(this.settings) !== JSON.stringify(stored))
			await this.saveData(this.settings);
	}
	async saveSettings() {
		this.settings = normalizeSettings(this.settings);
		await this.saveData(this.settings);
		this.layoutEngine = new LayoutEngine({
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap,
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight
		});
		this.nodeOps = new NodeOperations(this.canvasApi, {
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap,
			isAutoAdjust: (canvas) => this.isAutoAdjustCanvas(canvas)
		});
		if (this.keyboardHandler) {
			this.keyboardHandler.nodeOps = this.nodeOps;
			this.keyboardHandler.layoutEngine = this.layoutEngine;
			this.keyboardHandler.zoomPadding =
				this.settings.navigationZoomPadding;
		}
	}
};
