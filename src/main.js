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
	removeEmptyNodeOnEditExit,
	pruneEmptyLeafTopics,
	isBlankMindmapCanvas,
	isRootTopicNode,
	deriveCanvasTitle,
	flushCanvasView
} = require('./lib/canvas-session.js');
var {
	CARD_LAYOUT_VERSION,
	LiveSizingController,
	SIZING_STATUS,
	hasAsyncRenderableContent,
	isResizableCanvasNode,
	isTextTopicCard
} = require('./lib/live-sizing.js');
var MarkdownMindMapCodec = require('./lib/markdown-codec.js');
var { normalizeClipboardMarkdown } = require('./lib/clipboard-markdown.js');
var {
	colorDistance,
	createExportAssetResolver,
	createExportDelivery,
	createExportMindMapModal,
	createExportPlan,
	createRasterExportSession,
	embedDocumentAssets,
	paginatedPdfDocument,
	parseCssColor,
	rasterizeSvg,
	renderHtmlAsVectorPdf,
	sanitizeExportElement,
	serializeXmlSafe,
	visibleCardPaint
} = require('./lib/export.js');
var { renderSvgToPdf } = require("./lib/vector-pdf-bundle.js");
var ExportMindMapModal = createExportMindMapModal(import_obsidian5.Modal);

var { CanvasAPI, findNodeFromEvent, genId } = require('./lib/canvas-api.js');
var {
	LINK_REASON,
	createSyncId,
	createMarkdownSyncOwnership,
	patchSyncIdOwnership,
	CARD_SYNC_KEY,
	loadMarkdownSyncOwnership,
	resolveMarkdownSyncLink,
	resolveParentLink,
	adoptMarkdownSyncLink,
	adoptParentLink,
	isCanonicalVaultPath,
	MarkdownSyncIndex,
	MarkdownSyncCoordinator
} = require('./lib/markdown-sync.js');
var { allocateFilePath } = require('./lib/path-safety.js');

/** Canvas palette color reserved for the automatic central topic. */
var ROOT_TOPIC_COLOR = '6';
var ROOT_TOPIC_CLASS = 'tomindmap-root-topic';

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

var { LayoutEngine, BranchColors } = require('./lib/layout.js');

var { KeyboardHandler, Navigation } = require('./lib/keyboard-navigation.js');

var { TouchControlsController } = require('./lib/touch-controls.js');

// src/settings.ts
var import_obsidian3 = require('obsidian');
var {
	DEFAULT_SETTINGS,
	SETTINGS_FIELDS,
	normalizeSettings
} = require('./lib/settings.js');
var {
	createFileNodeSpec,
	createLinkNodeSpec,
	decodeMediaResource,
	droppedUrl,
	hasSupportedDrop,
	linkLabel
} = require('./lib/media-drop.js');
var TreeDrag = require('./lib/tree-drag.js');
var {
	createDragAttachmentController,
	isPrimaryCardGesture
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
		const save = async (patch) => {
			this.plugin.settings = normalizeSettings({
				...this.plugin.settings,
				...patch
			});
			await this.plugin.saveSettings();
			return this.plugin.settings;
		};
		const descriptions = {
			defaultMindmapMode: [
				'Default mindmap mode',
				'Whether canvases default to mindmap mode (can be toggled per canvas).'
			],
			autoCreateRootTopic: [
				'Create a central topic on blank canvases',
				'Open an empty mindmap canvas with an editable, distinctly colored central topic already selected.'
			],
			renameCanvasFromRootTopic: [
				'Rename canvas from central topic',
				'Reuse the Canvas filename for the central topic after it is edited.'
			],
			autoColor: ['Auto-color branches', 'Assign distinct colors to top-level branches.'],
			mouseNavigation: [
				'Mouse back/forward navigation',
				"Use mouse back/forward buttons for in-canvas navigation instead of Obsidian's note navigation."
			],
			wrapArrowNavigation: [
				'Wrap arrow navigation',
				'At the edge of the map, continue from the opposite edge instead of stopping.'
			],
			exportMarkmapFrontmatter: [
				'Markmap export frontmatter',
				'Include portable Markmap YAML options in new Markdown exports. Imported frontmatter is preserved.'
			],
			createNewMindMapRibbon: [
				"Show 'Create new mind map' ribbon icon",
				"Add an icon to the left ribbon to quickly create a new mind map in the current folder."
			],
			renameCreateCanvas: [
				"Rename 'Create new canvas' to 'Create new mind map'",
				"Change Obsidian's default canvas creation command name to 'Create new mind map'."
			]
		};
		for (const field of SETTINGS_FIELDS) {
			if (field.type === 'boolean') {
				const [name, description] = descriptions[field.key] || [field.key, field.key];
				new import_obsidian3.Setting(containerEl)
					.setName(name)
					.setDesc(description)
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings[field.key])
							.onChange(async (value) => {
								const settings = await save({ [field.key]: value });
								toggle.setValue(settings[field.key]);
							})
					);
			}
		}
		new import_obsidian3.Setting(containerEl)
			.setName('Keyboard workflow')
			.setDesc(
				'Type to edit · Enter creates a sibling · Tab creates a child · Arrows navigate · Delete removes a branch · Mod+F opens the outline.'
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Customizable mind-map actions')
			.setDesc(
				'Open Settings → Hotkeys to customize collapse, conversions, linked-card expansion, parent navigation, relayout, outline, colors, and mode switching. Defaults use Mod.'
			);
		new import_obsidian3.Setting(containerEl)
			.setName('Touch controls')
			.setDesc(
				'Floating touch toolbar with long-press menus and double-tap editing. Auto shows it on touch-primary devices.'
			)
			.addDropdown((dropdown) => {
				for (const value of ['auto', 'on', 'off'])
					dropdown.addOption(value, value === 'auto' ? 'Auto' : value === 'on' ? 'Always on' : 'Off');
				dropdown
					.setValue(this.plugin.settings.touchControls)
					.onChange(async (value) => {
						const settings = await save({ touchControls: value });
						dropdown.setValue(settings.touchControls);
					});
			});
		const numericNames = {
			horizontalGap: ['Horizontal gap', 'Space between parent and child topics (px).'],
			verticalGap: ['Vertical gap', 'Space between sibling topics (px).'],
			minNodeWidth: ['Minimum automatic width', 'Smallest card width used by automatic layout (px).'],
			maxNodeWidth: ['Maximum auto width', 'Safety limit for exceptionally wide content (px).'],
			defaultNodeWidth: ['Default node width', 'Width of newly created topics (px).'],
			defaultNodeHeight: ['Default node height', 'Height of newly created topics (px).'],
			maxNodeHeight: ['Maximum auto height', 'Safety limit for exceptionally tall content (px).'],
			navigationCrossAxisBuffer: ['Arrow corridor buffer', 'Extra tolerance around the straight navigation line.'],
			navigationZoomPadding: ['Navigation zoom padding', 'Extra space around a navigation target (px).'],
			markmapColorFreezeLevel: ['Markmap color freeze level', 'Default value written to new Markmap exports (0–10).']
		};
		for (const field of SETTINGS_FIELDS) {
			if (field.type !== 'number') continue;
			const [name, description] = numericNames[field.key] || [field.key, field.key];
			new import_obsidian3.Setting(containerEl)
				.setName(name)
				.setDesc(description)
				.addText((text) =>
					text
						.setValue(String(this.plugin.settings[field.key]))
						.onChange(async (rawValue) => {
							const settings = await save({ [field.key]: rawValue });
							text.setValue(String(settings[field.key]));
						})
				);
		}
	}
};

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
	const wrapper = canvas.wrapperEl;
	const view = wrapper?.ownerDocument?.defaultView;
	const frozen = [];
	let activePointerId = null;
	let finished = false;
	const finish = (reason, event = null) => {
		if (finished) return false;
		if (event && activePointerId !== null && event.pointerId !== undefined &&
			event.pointerId !== activePointerId) return false;
		finished = true;
		activePointerId = null;
		let changed = false;
		for (const record of frozen) {
			if (record.hadOwn) record.node.moveTo = record.original;
			else delete record.node.moveTo;
			changed = true;
		}
		frozen.length = 0;
		if (reason === 'commit' && changed) canvas.requestSave();
		return changed;
	};
	const downHandler = (event) => {
		if (!enabled() || event.button !== 0 || !event.altKey) return;
		const node = findNodeFromEvent(canvas, event);
		if (!node || !getGroupIds(canvas).has(node.id)) return;
		finish('replace');
		finished = false;
		activePointerId = event.pointerId ?? null;
		for (const stranger of identifyStrangers(canvas, canvasApi, node, getGroupIds(canvas))) {
			frozen.push({
				node: stranger,
				hadOwn: Object.prototype.hasOwnProperty.call(stranger, 'moveTo'),
				original: stranger.moveTo
			});
			stranger.moveTo = () => {};
		}
	};
	const commit = (event) => finish('commit', event);
	const cancel = (event) => finish('cancel', event);
	const blur = () => finish('blur');
	wrapper?.addEventListener('pointerdown', downHandler, true);
	wrapper?.addEventListener('pointerup', commit, true);
	wrapper?.addEventListener('pointercancel', cancel, true);
	wrapper?.addEventListener('lostpointercapture', cancel, true);
	view?.addEventListener?.('blur', blur);
	const owner = {
		finish,
		dispose(reason = 'teardown') {
			finish(reason);
			wrapper?.removeEventListener('pointerdown', downHandler, true);
			wrapper?.removeEventListener('pointerup', commit, true);
			wrapper?.removeEventListener('pointercancel', cancel, true);
			wrapper?.removeEventListener('lostpointercapture', cancel, true);
			view?.removeEventListener?.('blur', blur);
		}
	};
	return owner;
}

// src/ui/auto-resize.ts
function registerAutoResize(canvas, config, onEditExit) {
	var _a, _b, _c;
	let activeNode = null;
	let pendingTimer = null;
	let watchGeneration = 0;
	function clearPending() {
		if (pendingTimer !== null) clearTimeout(pendingTimer);
		pendingTimer = null;
	}
	function scheduleStop(expectedNode) {
		clearPending();
		const generation = ++watchGeneration;
		pendingTimer = setTimeout(() => {
			pendingTimer = null;
			if (generation !== watchGeneration || activeNode !== expectedNode) return;
			if (!expectedNode.isEditing) stopWatching();
		}, 50);
	}
	function startWatching(node) {
		if (typeof config.enabled === 'function' && !config.enabled()) return;
		clearPending();
		watchGeneration++;
		if (node.nodeEl)
			node.nodeEl.removeClass('tomindmap-navigation-selected');
		activeNode = node;
	}
	function stopWatching(triggerRelayout = true) {
		clearPending();
		watchGeneration++;
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
		scheduleStop(activeNode);
	};
	const pointerHandler = (e) => {
		var _a2;
		if (!activeNode) return;
		if ((_a2 = activeNode.nodeEl) == null ? void 0 : _a2.contains(e.target))
			return;
		scheduleStop(activeNode);
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

var import_obsidian4 = require('obsidian');
var OUTLINE_VIEW_TYPE = 'tomindmap-outline';
function outlineTreeDescendants(tree) {
	const result = [];
	const stack = [...(tree?.children || [])].reverse();
	while (stack.length > 0) {
		const item = stack.pop();
		if (!item) continue;
		result.push(item);
		for (let index = item.children.length - 1; index >= 0; index--)
			stack.push(item.children[index]);
	}
	return result;
}

function buildOutlineModel(canvas) {
	try {
		if (!canvas || typeof canvas.getData !== 'function' || !canvas.nodes)
			return { ok: false, reason: 'invalid-canvas' };
		const data = canvas.getData();
		if (!data || typeof data !== 'object' || !Array.isArray(data.nodes) || !Array.isArray(data.edges))
			return { ok: false, reason: 'invalid-canvas-data' };
		const records = new Map();
		for (const record of data.nodes) {
			if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id)
				return { ok: false, reason: 'invalid-node-record' };
			if (records.has(record.id))
				return { ok: false, reason: 'duplicate-node-record' };
			records.set(record.id, record);
		}
		const forest = buildForest(canvas);
		const nodes = new Map();
		const collapsibleNodeIds = [];
		const pending = [...forest].reverse();
		while (pending.length > 0) {
			const tree = pending.pop();
			const id = tree?.canvasNode?.id;
			if (typeof id !== 'string' || nodes.has(id))
				return { ok: false, reason: 'invalid-forest' };
			nodes.set(id, tree);
			if (tree.children.length > 0) collapsibleNodeIds.push(id);
			for (let index = tree.children.length - 1; index >= 0; index--)
				pending.push(tree.children[index]);
		}
		const groups = [];
		for (const record of data.nodes) {
			if (record.type !== 'group' && record.label === undefined) continue;
			if (typeof record.label !== 'string')
				return { ok: false, reason: 'invalid-group-label' };
			const node = canvas.nodes.get(record.id);
			if (!node || ![node.x, node.y, node.width, node.height].every(Number.isFinite))
				return { ok: false, reason: 'invalid-group-geometry' };
			groups.push({
				node,
				label: record.label.trim() || 'Untitled Group',
				area: node.width * node.height,
				roots: []
			});
		}
		groups.sort((left, right) =>
			left.node.y - right.node.y ||
			left.node.x - right.node.x ||
			String(left.node.id).localeCompare(String(right.node.id))
		);
		const ungrouped = [];
		for (const root of forest) {
			const node = root.canvasNode;
			const centerX = Number(node.x) + Number(node.width) / 2;
			const centerY = Number(node.y) + Number(node.height) / 2;
			let selectedGroup = null;
			for (const group of groups) {
				const area = group.node;
				if (
					centerX >= area.x && centerX <= area.x + area.width &&
					centerY >= area.y && centerY <= area.y + area.height &&
					(!selectedGroup || group.area < selectedGroup.area)
				) selectedGroup = group;
			}
			if (selectedGroup) selectedGroup.roots.push(root);
			else ungrouped.push(root);
		}
		return {
			ok: true,
			value: {
				canvas,
				forest,
				groups: groups.filter((group) => group.roots.length > 0),
				ungrouped,
				nodes,
				collapsibleNodeIds
			}
		};
	} catch (error) {
		return { ok: false, reason: 'invalid-canvas', error };
	}
}

async function writeClipboardText(value, clipboard = globalThis.navigator?.clipboard) {
	if (typeof clipboard?.writeText !== 'function')
		throw new Error('Clipboard access is unavailable');
	await clipboard.writeText(String(value || ''));
	return true;
}

var OutlineView = class extends import_obsidian4.ItemView {
	constructor(leaf) {
		super(leaf);
		this.canvasLeaf = null;
		this.collapsedGroups = new Set();
		this.collapsedNodes = new Set();
		this.selectedRoots = new Set();
		this.lastCanvas = null;
		this.groupIds = [];
		this.collapsibleNodeIds = [];
		this.draggedRoot = null;
		this.dragSourceGroupId = null;
		this.dragAllowedRoots = new Set();
		this.activeNodeId = null;
		this.allItemEls = new Map();
		this.allTreeItems = new Map();
		this.groupElMap = new Map();
		this.searchQuery = '';
		this.navHeaderEl = null;
		this.collapseBtnEl = null;
		this.searchContainerEl = null;
		this.searchComponent = null;
		this.zoomPadding = 0;
		this.onForestLayout = null;
		this.model = null;
		this.viewDisposers = [];
		this.session = {
			canvas: null,
			generation: 0,
			timers: new Set(),
			disposers: new Set()
		};
	}
	getViewType() { return OUTLINE_VIEW_TYPE; }
	getDisplayText() { return 'Map outline'; }
	getIcon() { return 'list-tree'; }
	onOpen() {
		this.contentEl.addClass('tomindmap-outline');
		this.contentEl.setAttribute('role', 'tree');
		this.contentEl.setAttribute('aria-label', 'Map outline');
		const navHeader = this.containerEl.createDiv({ cls: 'nav-header' });
		this.containerEl.insertBefore(navHeader, this.contentEl);
		this.navHeaderEl = navHeader;
		const navButtons = navHeader.createDiv({ cls: 'nav-buttons-container' });
		const searchBtn = navButtons.createEl('button', {
			cls: 'clickable-icon nav-action-button',
			attr: { type: 'button', 'aria-label': 'Search map outline' }
		});
		(0, import_obsidian4.setIcon)(searchBtn, 'search');
		this.collapseBtnEl = navButtons.createEl('button', {
			cls: 'clickable-icon nav-action-button',
			attr: { type: 'button', 'aria-label': 'Collapse all' }
		});
		(0, import_obsidian4.setIcon)(this.collapseBtnEl, 'chevrons-down-up');
		this.addViewListener(searchBtn, 'click', () => this.toggleSearch());
		this.addViewListener(this.collapseBtnEl, 'click', () => this.toggleAllCollapsed());
		this.searchContainerEl = navHeader.createDiv({ cls: 'tomindmap-outline-search-container' });
		this.searchContainerEl.hide();
		this.searchComponent = new import_obsidian4.SearchComponent(this.searchContainerEl);
		this.searchComponent.setPlaceholder('Filter...');
		this.searchComponent.onChange((value) => {
			this.searchQuery = value;
			if (this.model) this.renderModel(this.model);
		});
		this.installDelegatedListeners();
		if (this.lastCanvas) this.refresh(this.lastCanvas);
		else this.clear();
		return Promise.resolve();
	}
	onClose() {
		this.disposeCanvasSession();
		for (const dispose of this.viewDisposers.splice(0)) dispose();
		if (this.navHeaderEl) this.navHeaderEl.remove();
		this.navHeaderEl = null;
		this.collapseBtnEl = null;
		this.searchContainerEl = null;
		this.searchComponent = null;
		return Promise.resolve();
	}
	addViewListener(target, type, listener, options) {
		target.addEventListener(type, listener, options);
		const dispose = () => target.removeEventListener(type, listener, options);
		this.viewDisposers.push(dispose);
		return dispose;
	}
	installDelegatedListeners() {
		this.addViewListener(this.contentEl, 'click', (event) => this.handleOutlineClick(event));
		this.addViewListener(this.contentEl, 'dblclick', (event) => this.handleOutlineDoubleClick(event));
		this.addViewListener(this.contentEl, 'contextmenu', (event) => this.handleOutlineContextMenu(event));
		this.addViewListener(this.contentEl, 'keydown', (event) => this.handleOutlineKeydown(event));
		this.addViewListener(this.contentEl, 'pointerdown', (event) => {
			const handle = event.target?.closest?.('.tomindmap-outline-drag-handle');
			const id = handle?.parentElement?.getAttribute?.('data-outline-id');
			if (id) this.dragAllowedRoots.add(id);
		});
		this.addViewListener(this.contentEl, 'dragstart', (event) => this.handleOutlineDragStart(event));
		this.addViewListener(this.contentEl, 'dragend', () => this.clearOutlineDrag());
		this.addViewListener(this.contentEl, 'dragover', (event) => this.handleOutlineDragOver(event));
		this.addViewListener(this.contentEl, 'dragleave', (event) => this.handleOutlineDragLeave(event));
		this.addViewListener(this.contentEl, 'drop', (event) => this.handleOutlineDrop(event));
	}
	openSearch() {
		if (!this.searchContainerEl || !this.searchComponent) return;
		this.searchContainerEl.show();
		this.searchComponent.inputEl.focus();
		this.searchComponent.inputEl.select();
	}
	toggleSearch() {
		if (!this.searchContainerEl || !this.searchComponent) return;
		if (this.searchContainerEl.isShown()) {
			this.searchContainerEl.hide();
			this.searchQuery = '';
			this.searchComponent.setValue('');
			if (this.model) this.renderModel(this.model);
		} else {
			this.searchContainerEl.show();
			this.searchComponent.inputEl.focus();
		}
	}
	toggleAllCollapsed() {
		if (!this.lastCanvas || !this.model) return;
		const ids = [...this.groupIds, ...this.collapsibleNodeIds];
		if (ids.length === 0) return;
		const allCollapsed = this.groupIds.every((id) => this.collapsedGroups.has(id)) &&
			this.collapsibleNodeIds.every((id) => this.collapsedNodes.has(id));
		if (allCollapsed) {
			this.collapsedGroups.clear();
			this.collapsedNodes.clear();
		} else {
			for (const id of this.groupIds) this.collapsedGroups.add(id);
			for (const id of this.collapsibleNodeIds) this.collapsedNodes.add(id);
		}
		this.renderModel(this.model);
	}
	activateCanvasSession(canvas) {
		if (this.session.canvas === canvas) return;
		this.disposeCanvasSession();
		this.session.canvas = canvas;
		this.session.generation++;
		this.collapsedGroups.clear();
		this.collapsedNodes.clear();
		this.selectedRoots.clear();
		this.groupIds = [];
		this.collapsibleNodeIds = [];
		this.activeNodeId = null;
		this.clearOutlineDrag();
	}
	disposeCanvasSession() {
		for (const timer of this.session.timers) clearTimeout(timer);
		this.session.timers.clear();
		for (const dispose of this.session.disposers) dispose();
		this.session.disposers.clear();
		this.dragAllowedRoots.clear();
	}
	trackSessionTimeout(callback, delay) {
		const generation = this.session.generation;
		const timer = setTimeout(() => {
			this.session.timers.delete(timer);
			if (!this.lastCanvas || this.session.generation !== generation) return;
			callback();
		}, delay);
		this.session.timers.add(timer);
		return timer;
	}
	refresh(canvas) {
		const decoded = buildOutlineModel(canvas);
		if (!decoded.ok) return false;
		const model = decoded.value;
		this.activateCanvasSession(canvas);
		this.lastCanvas = canvas;
		this.model = model;
		this.canvasLeaf = this.app.workspace.getLeavesOfType('canvas').find((leaf) => leaf.view?.canvas === canvas) || null;
		if (this.searchComponent) this.searchComponent.setValue(this.searchQuery);
		this.collapsibleNodeIds = model.collapsibleNodeIds;
		this.renderModel(model);
		return true;
	}
	renderModel(model) {
		const canvas = model.canvas;
		this.contentEl.empty();
		this.contentEl.setAttribute('role', 'tree');
		this.contentEl.setAttribute('aria-label', 'Map outline');
		this.allItemEls.clear();
		this.allTreeItems.clear();
		this.groupElMap.clear();
		this.groupIds = model.groups.map((group) => group.node.id);
		if (model.ungrouped.length === 0 && model.groups.length === 0) {
			this.contentEl.createDiv({
				cls: 'tomindmap-outline-empty',
				text: 'No root topics',
				attr: { role: 'status' }
			});
			this.updateCollapseButton();
			return;
		}
		if (model.ungrouped.length > 0) {
			const zone = this.contentEl.createDiv({
				cls: 'tomindmap-outline-ungrouped-zone',
				attr: { role: 'group', 'aria-label': 'Ungrouped topics', 'data-outline-drop': 'ungrouped' }
			});
			for (const root of model.ungrouped)
				this.renderTopicBranch(zone, root, canvas, 1, null, true);
		}
		for (const group of model.groups)
			this.renderGroup(group, canvas);
		this.applyFilter();
		this.updateCollapseButton();
		if (this.activeNodeId) this.setActiveItem(this.activeNodeId);
	}
	renderTopicBranch(container, rootTree, canvas, level, groupId, isRoot) {
		const pending = [{ tree: rootTree, container, level, groupId, isRoot }];
		while (pending.length > 0) {
			const current = pending.pop();
			const tree = current.tree;
			const node = tree.canvasNode;
			const nodeId = node.id;
			const hasChildren = tree.children.length > 0;
			const isCollapsed = hasChildren && !this.searchQuery &&
				(this.collapsedNodes.has(nodeId) || (current.isRoot && this.collapsedGroups.has(groupId)));
			const treeItem = current.container.createDiv({
				cls: `tree-item${isCollapsed ? ' is-collapsed' : ''}`,
				attr: {
					role: 'treeitem',
					'aria-level': String(current.level),
					'aria-expanded': hasChildren ? String(!isCollapsed) : null,
					'aria-selected': 'false',
					'data-outline-kind': 'node',
					'data-outline-id': nodeId,
					'data-tomindmap-search-text': MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))
				}
			});
			this.allTreeItems.set(nodeId, treeItem);
			const self = treeItem.createDiv({ cls: 'tree-item-self', attr: { role: 'none' } });
			const collapse = self.createEl('button', {
				cls: 'tree-item-icon collapse-icon',
				attr: {
					type: 'button',
					'aria-label': `${isCollapsed ? 'Expand' : 'Collapse'} ${MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))}`,
					'aria-expanded': hasChildren ? String(!isCollapsed) : null,
					'data-outline-action': 'collapse-node',
					'data-outline-id': nodeId
				}
			});
			collapse.disabled = !hasChildren;
			(0, import_obsidian4.setIcon)(collapse, hasChildren ? 'right-triangle' : 'minus');
			if (current.isRoot) {
				const handle = self.createDiv({
					cls: 'tree-item-icon tomindmap-outline-drag-handle',
					attr: { 'aria-hidden': 'true' }
				});
				(0, import_obsidian4.setIcon)(handle, 'grip-vertical');
			}
			const select = self.createEl('button', {
				cls: 'tree-item-inner is-clickable tomindmap-outline-item',
				text: MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node)),
				attr: {
					type: 'button',
					'aria-label': `Select ${MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))}`,
					'data-outline-action': 'select-node',
					'data-outline-id': nodeId,
					'data-tomindmap-search-text': MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))
				}
			});
			select.draggable = Boolean(current.isRoot && groupId == null);
			this.allItemEls.set(nodeId, select);
			if (hasChildren && !isCollapsed) {
				const children = treeItem.createDiv({
					cls: 'tree-item-children',
					attr: { role: 'group' }
				});
				for (let index = tree.children.length - 1; index >= 0; index--) {
					pending.push({
						tree: tree.children[index],
						container: children,
						level: current.level + 1,
						groupId: current.groupId,
						isRoot: false
					});
				}
			}
		}
	}
	renderGroup(group, canvas) {
		const collapsed = this.collapsedGroups.has(group.node.id) && !this.searchQuery;
		const treeItem = this.contentEl.createDiv({
			cls: `tree-item tomindmap-outline-group${collapsed ? ' is-collapsed' : ''}`,
			attr: {
				role: 'treeitem',
				'aria-level': '1',
				'aria-expanded': String(!collapsed),
				'data-outline-kind': 'group',
				'data-outline-id': group.node.id,
				'data-tomindmap-search-text': group.label
			}
		});
		this.allTreeItems.set(group.node.id, treeItem);
		const self = treeItem.createDiv({ cls: 'tree-item-self', attr: { role: 'none' } });
		const collapse = self.createEl('button', {
			cls: 'tree-item-icon collapse-icon',
			attr: {
				type: 'button',
				'aria-label': `${collapsed ? 'Expand' : 'Collapse'} group ${group.label}`,
				'aria-expanded': String(!collapsed),
				'data-outline-action': 'collapse-group',
				'data-outline-id': group.node.id
			}
		});
		(0, import_obsidian4.setIcon)(collapse, 'right-triangle');
		const label = self.createEl('button', {
			cls: 'tree-item-inner is-clickable',
			text: group.label,
			attr: {
				type: 'button',
				'aria-label': `${collapsed ? 'Expand' : 'Collapse'} group ${group.label}`,
				'data-outline-action': 'collapse-group',
				'data-outline-id': group.node.id,
				'data-tomindmap-search-text': group.label
			}
		});
		label.createSpan({ cls: 'tomindmap-outline-group-count', text: String(group.roots.length) });
		this.groupElMap.set(group.node.id, self);
		const children = treeItem.createDiv({ cls: 'tree-item-children', attr: { role: 'group' } });
		if (!collapsed) {
			for (const root of group.roots)
				this.renderTopicBranch(children, root, canvas, 2, group.node.id, true);
		}
	}
	updateCollapseButton() {
		if (!this.collapseBtnEl) return;
		const hasItems = this.groupIds.length > 0 || this.collapsibleNodeIds.length > 0;
		const allCollapsed = hasItems &&
			this.groupIds.every((id) => this.collapsedGroups.has(id)) &&
			this.collapsibleNodeIds.every((id) => this.collapsedNodes.has(id));
		(0, import_obsidian4.setIcon)(this.collapseBtnEl, allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
		this.collapseBtnEl.disabled = !hasItems;
		this.collapseBtnEl.setAttribute('aria-label', allCollapsed ? 'Expand all' : 'Collapse all');
	}
	applyFilter() {
		const query = this.searchQuery.toLowerCase().trim();
		const items = Array.from(this.contentEl.querySelectorAll('[role="treeitem"]'));
		const childrenByItem = new Map();
		for (const item of items) {
			const container = item.parentElement;
			const parent = container?.hasClass?.('tree-item-children')
				? container.parentElement
				: null;
			if (parent) {
				const children = childrenByItem.get(parent) || [];
				children.push(item);
				childrenByItem.set(parent, children);
			}
		}
		const hidden = new Map();
		for (let index = items.length - 1; index >= 0; index--) {
			const item = items[index];
			const own = query === '' ||
				String(item.getAttribute('data-tomindmap-search-text') || '').toLowerCase().includes(query);
			const descendant = (childrenByItem.get(item) || [])
				.some((child) => !hidden.get(child));
			const visible = own || descendant;
			hidden.set(item, !visible);
			item.toggleClass('is-hidden', !visible);
		}
	}
	handleOutlineClick(event) {
		const button = event.target?.closest?.('[data-outline-action]');
		if (!button) return;
		const id = button.getAttribute('data-outline-id');
		const action = button.getAttribute('data-outline-action');
		if (action === 'collapse-node') {
			if (this.collapsedNodes.has(id)) this.collapsedNodes.delete(id);
			else this.collapsedNodes.add(id);
			if (this.model) this.renderModel(this.model);
			return;
		}
		if (action === 'collapse-group') {
			if (this.collapsedGroups.has(id)) this.collapsedGroups.delete(id);
			else this.collapsedGroups.add(id);
			if (this.model) this.renderModel(this.model);
			return;
		}
		if (action === 'select-node') this.selectOutlineNode(id, event);
	}
	handleOutlineKeydown(event) {
		const button = event.target?.closest?.('[data-outline-action]');
		if (!button) return;
		const id = button.getAttribute('data-outline-id');
		const action = button.getAttribute('data-outline-action');
		if ((event.key === 'Enter' || event.key === ' ') &&
			(action === 'select-node' || action === 'collapse-group')) {
			event.preventDefault();
			this.handleOutlineClick({ target: button });
			return;
		}
		if (event.key === 'ArrowRight' && action === 'collapse-node' && this.collapsedNodes.has(id)) {
			event.preventDefault();
			this.collapsedNodes.delete(id);
			if (this.model) this.renderModel(this.model);
		} else if (event.key === 'ArrowLeft' && action === 'collapse-node' && !this.collapsedNodes.has(id)) {
			event.preventDefault();
			this.collapsedNodes.add(id);
			if (this.model) this.renderModel(this.model);
		}
	}
	selectOutlineNode(id, event = {}) {
		const tree = this.model?.nodes.get(id);
		const node = tree?.canvasNode;
		const canvas = this.lastCanvas;
		if (!tree || !node || !canvas) return;
		if (tree.parent == null && (event.ctrlKey || event.metaKey)) {
			if (this.selectedRoots.has(tree)) {
				this.selectedRoots.delete(tree);
				this.allItemEls.get(id)?.removeClass('is-selected');
			} else {
				this.clearSelection();
				this.selectedRoots.add(tree);
				this.allItemEls.get(id)?.addClass('is-selected');
			}
			this.allItemEls.get(id)?.setAttribute('aria-pressed', String(this.selectedRoots.has(tree)));
			return;
		}
		this.clearSelection();
		this.setActiveItem(id);
		if (this.canvasLeaf) this.app.workspace.setActiveLeaf(this.canvasLeaf, { focus: true });
		if (tree.parent == null) this.selectAndZoom(canvas, node);
		else this.canvasApiSelectAndReveal(canvas, node);
	}
	handleOutlineDoubleClick(event) {
		const group = event.target?.closest?.('[data-outline-kind="group"]');
		if (!group || !this.model) return;
		const id = group.getAttribute('data-outline-id');
		const record = this.model.groups.find((candidate) => candidate.node.id === id);
		const label = group.querySelector('.tree-item-inner');
		if (record && label) this.startGroupRename(label, record, this.lastCanvas);
	}
	handleOutlineContextMenu(event) {
		const target = event.target?.closest?.('[data-outline-kind]');
		if (!target || !this.model || !this.lastCanvas) return;
		event.preventDefault();
		const kind = target.getAttribute('data-outline-kind');
		const id = target.getAttribute('data-outline-id');
		const menu = new import_obsidian4.Menu();
		if (kind === 'node') {
			const node = this.model.nodes.get(id)?.canvasNode;
			if (!node) return;
			menu.addItem((item) => item.setTitle('Copy node link').setIcon('link').onClick(() => {
				this.runAsync(() => this.copyNodeLink(node), 'copy node link');
			}));
			const tree = this.model.nodes.get(id);
			if (tree?.parent == null) {
				if (!this.selectedRoots.has(tree)) {
					this.clearSelection();
					this.selectedRoots.add(tree);
				}
				menu.addItem((item) => item.setTitle(`Create group (${this.selectedRoots.size} roots)`).setIcon('group').onClick(() => this.createGroupFromSelection()));
			}
		} else {
			const group = this.model.groups.find((candidate) => candidate.node.id === id);
			if (!group) return;
			menu.addItem((item) => item.setTitle('Rename group').setIcon('pencil').onClick(() => {
				const label = this.allTreeItems.get(id)?.querySelector('.tree-item-inner');
				if (label) this.startGroupRename(label, group, this.lastCanvas);
			}));
			menu.addItem((item) => item.setTitle('Layout forest').setIcon('layout-grid').onClick(() => {
				if (this.lastCanvas && this.onForestLayout) this.onForestLayout(this.lastCanvas, id);
			}));
		}
		menu.showAtMouseEvent(event);
	}
	async copyNodeLink(node) {
		const canvasPath = this.lastCanvas?.view?.file?.path || '';
		let link = `obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${encodeURIComponent(node.id)}`;
		if (canvasNodeFilePath(node)) {
			const vaultName = this.app.vault.getName?.() || '';
			link = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(canvasNodeFilePath(node))}`;
		} else if (canvasNodeUrl(node)) link = canvasNodeUrl(node);
		await writeClipboardText(link);
		new import_obsidian4.Notice('Node link copied');
	}
	selectAndZoom(canvas, node) {
		canvas.selectOnly(node);
		const pad = this.zoomPadding;
		canvas.zoomToBbox({
			minX: node.x + node.width / 2 - pad,
			minY: node.y + node.height / 2 - pad,
			maxX: node.x + node.width / 2 + pad,
			maxY: node.y + node.height / 2 + pad
		});
	}
	canvasApiSelectAndReveal(canvas, node) { this.selectAndZoom(canvas, node); }
	clearSelection() {
		for (const root of this.selectedRoots)
			this.allItemEls.get(root.canvasNode.id)?.removeClass('is-selected');
		this.selectedRoots.clear();
	}
	setActiveItem(nodeId) {
		if (this.activeNodeId && this.activeNodeId !== nodeId)
			this.allItemEls.get(this.activeNodeId)?.removeClass('is-active');
		this.activeNodeId = nodeId;
		const element = this.allItemEls.get(nodeId);
		element?.addClass('is-active');
		element?.setAttribute('aria-current', 'true');
		element?.scrollIntoView({ block: 'nearest' });
	}
	clearActiveItem() {
		if (this.activeNodeId) {
			this.allItemEls.get(this.activeNodeId)?.removeClass('is-active');
			this.allItemEls.get(this.activeNodeId)?.removeAttribute('aria-current');
		}
		this.activeNodeId = null;
	}
	syncHighlightFromCanvas(canvas) {
		if (canvas !== this.lastCanvas || canvas.selection.size !== 1) {
			this.clearActiveItem();
			return;
		}
		const item = canvas.selection.values().next().value;
		if (!item || !this.allItemEls.has(item.id)) this.clearActiveItem();
		else this.setActiveItem(item.id);
	}
	createGroupFromSelection() {
		const canvas = this.lastCanvas;
		if (!canvas || this.selectedRoots.size === 0) return;
		const allNodes = [];
		for (const root of this.selectedRoots) {
			allNodes.push(root.canvasNode);
			for (const descendant of outlineTreeDescendants(root)) allNodes.push(descendant.canvasNode);
		}
		const padding = 20;
		const minX = Math.min(...allNodes.map((node) => node.x)) - padding;
		const minY = Math.min(...allNodes.map((node) => node.y)) - padding;
		const maxX = Math.max(...allNodes.map((node) => node.x + node.width)) + padding;
		const maxY = Math.max(...allNodes.map((node) => node.y + node.height)) + padding;
		const group = canvas.createGroupNode?.({ pos: { x: minX, y: minY }, size: { width: maxX - minX, height: maxY - minY }, label: '' });
		if (!group) return;
		canvas.requestSave();
		if (this.canvasLeaf) this.app.workspace.setActiveLeaf(this.canvasLeaf, { focus: true });
		canvas.selectOnly(group);
		this.trackSessionTimeout(() => group.startEditing?.(), 50);
		this.clearSelection();
	}
	clearOutlineDrag() {
		this.draggedRoot = null;
		this.dragSourceGroupId = null;
		this.dragAllowedRoots.clear();
		for (const element of this.groupElMap.values()) element.removeClass('is-drag-over');
		this.contentEl.querySelector('.tomindmap-outline-ungrouped-zone')?.removeClass('is-drag-over');
	}
	handleOutlineDragStart(event) {
		const select = event.target?.closest?.('[data-outline-action="select-node"]');
		const id = select?.getAttribute('data-outline-id');
		const tree = id ? this.model?.nodes.get(id) : null;
		if (!id || !tree || tree.parent != null || !this.dragAllowedRoots.has(id)) {
			event.preventDefault();
			return;
		}
		const group = select.closest('[data-outline-kind="group"]');
		this.draggedRoot = tree;
		this.dragSourceGroupId = group?.getAttribute('data-outline-id') || null;
		select.addClass('is-dragging');
		event.dataTransfer?.setData('text/plain', id);
	}
	handleOutlineDragOver(event) {
		if (!this.draggedRoot) return;
		const target = event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]');
		if (!target) return;
		event.preventDefault();
		target.addClass('is-drag-over');
	}
	handleOutlineDragLeave(event) {
		event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]')?.removeClass('is-drag-over');
	}
	handleOutlineDrop(event) {
		const target = event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]');
		if (!target || !this.draggedRoot || !this.lastCanvas) return;
		event.preventDefault();
		const groupId = target.getAttribute('data-outline-id') || null;
		if (groupId === this.dragSourceGroupId) {
			this.clearOutlineDrag();
			return;
		}
		if (groupId) this.moveTreeToGroup(this.draggedRoot, groupId, this.dragSourceGroupId);
		else this.ungroupTree(this.draggedRoot, this.dragSourceGroupId);
		this.clearOutlineDrag();
	}
	moveTreeToGroup(root, targetGroupId) {
		const canvas = this.lastCanvas;
		const group = canvas?.nodes.get(targetGroupId);
		if (!canvas || !group) return;
		const descendants = [root, ...outlineTreeDescendants(root)];
		const dx = group.x + group.width / 2 - root.canvasNode.x - root.canvasNode.width / 2;
		const dy = group.y + group.height / 2 - root.canvasNode.y - root.canvasNode.height / 2;
		for (const tree of descendants) tree.canvasNode.moveTo({ x: tree.canvasNode.x + dx, y: tree.canvasNode.y + dy });
		this.onForestLayout?.(canvas, targetGroupId);
		this.refresh(canvas);
	}
	ungroupTree(root, sourceGroupId) {
		const canvas = this.lastCanvas;
		if (!canvas) return;
		const groupIds = getGroupIds(canvas);
		let maxY = -Infinity;
		for (const id of groupIds) {
			const group = canvas.nodes.get(id);
			if (group) maxY = Math.max(maxY, group.y + group.height);
		}
		const descendants = [root, ...outlineTreeDescendants(root)];
		const dy = maxY + 80 - root.canvasNode.y;
		for (const tree of descendants) tree.canvasNode.moveTo({ x: tree.canvasNode.x, y: tree.canvasNode.y + dy });
		if (sourceGroupId) this.onForestLayout?.(canvas, sourceGroupId);
		this.refresh(canvas);
	}
	startGroupRename(label, group, canvas) {
		const originalText = label.textContent || '';
		label.contentEditable = 'true';
		label.setAttribute('role', 'textbox');
		label.setAttribute('aria-label', `Rename group ${group.label}`);
		label.focus();
		const range = canvas.view?.containerEl?.ownerDocument?.createRange?.() || document.createRange();
		range.selectNodeContents?.(label);
		const selection = label.ownerDocument?.defaultView?.getSelection?.();
		selection?.removeAllRanges?.();
		selection?.addRange?.(range);
		let done = false;
		const dispose = () => {
			label.removeEventListener('keydown', onKeydown);
			label.removeEventListener('blur', commit);
			label.removeEventListener('click', stop);
			this.session.disposers.delete(dispose);
		};
		const finish = (commitValue) => {
			if (done) return;
			done = true;
			const nextLabel = commitValue ? String(label.textContent || '').trim() || 'Untitled Group' : originalText;
			label.contentEditable = 'false';
			label.removeAttribute('role');
			label.removeAttribute('aria-label');
			label.textContent = nextLabel;
			dispose();
			if (!commitValue || nextLabel === originalText || !canvas) return;
			const data = canvas.getData();
			const record = Array.isArray(data.nodes) ? data.nodes.find((item) => item.id === group.node.id) : null;
			if (!record) return;
			record.label = nextLabel;
			canvas.setData(data);
			canvas.requestSave?.();
			this.refresh(canvas);
		};
		const commit = () => finish(true);
		const cancel = () => finish(false);
		const stop = (event) => event.stopPropagation();
		const onKeydown = (event) => {
			event.stopPropagation();
			if (event.key === 'Enter') {
				event.preventDefault();
				finish(true);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				finish(false);
			}
		};
		label.addEventListener('keydown', onKeydown);
		label.addEventListener('blur', commit);
		label.addEventListener('click', stop);
		const tracked = () => {
			label.removeEventListener('keydown', onKeydown);
			label.removeEventListener('blur', commit);
			label.removeEventListener('click', stop);
		};
		this.session.disposers.add(tracked);
	}
	showUnavailable(message, canvas = null) {
		this.activateCanvasSession(canvas);
		this.lastCanvas = canvas;
		this.model = null;
		this.contentEl.empty();
		this.contentEl.setAttribute('role', 'status');
		this.contentEl.setAttribute('aria-live', 'polite');
		this.contentEl.createDiv({ cls: 'tomindmap-outline-empty', text: String(message || 'Map outline is unavailable') });
	}
	clear() {
		this.disposeCanvasSession();
		this.session.canvas = null;
		this.session.generation++;
		this.canvasLeaf = null;
		this.lastCanvas = null;
		this.model = null;
		this.selectedRoots.clear();
		this.groupElMap.clear();
		this.allItemEls.clear();
		this.allTreeItems.clear();
		this.collapsedGroups.clear();
		this.collapsedNodes.clear();
		this.groupIds = [];
		this.collapsibleNodeIds = [];
		this.activeNodeId = null;
		this.contentEl.setAttribute('role', 'status');
		this.contentEl.setAttribute('aria-live', 'polite');
		this.contentEl.empty();
		this.contentEl.createDiv({ cls: 'tomindmap-outline-empty', text: 'Open a mind-map canvas to see its outline' });
	}
};
function canvasNodeFilePath(node) {
	const values = [
		node?.unknownData?.file,
		node?.file,
		node?.filePath,
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
	return MarkdownMindMapCodec.serializeTopicText({
		...node,
		text: node.text ?? node.unknownData?.text,
		file: canvasNodeFilePath(node) || undefined,
		url: canvasNodeUrl(node) || undefined
	});
}


const TOMINMAP_TITLE_ONLY = 'tomindmapTitleOnly';
const TOMINMAP_CARD_KIND = 'tomindmapCardKind';
const TOMINMAP_CARD_TITLE = 'tomindmapCardTitle';
const TOMINMAP_PARENT = 'mindmapParent';

function canvasNodeUnknownData(node) {
	if (!node) return {};
	try {
		if (typeof node.getData === 'function') return node.getData() || {};
	} catch (_) {}
	return node.unknownData || {};
}

function setCanvasNodeUnknownData(node, patch) {
	if (!node) return;
	const data = canvasNodeUnknownData(node);
	if (typeof node.setData === 'function') node.setData({ ...data, ...patch });
	else node.unknownData = { ...data, ...patch };
}

function canvasFolderPath(canvas) {
	const raw = canvas?.view?.file?.parent?.path || '';
	if (raw === '/') return '';
	return raw.replace(/^\/+|\/+$/g, '');
}

function canvasPathFor(canvas) {
	const raw = canvas?.view?.file?.path || '';
	return raw.replace(/^\/+/g, '');
}

function titleOnlyCardTitle(node) {
	const data = canvasNodeUnknownData(node);
	if (data[TOMINMAP_CARD_TITLE]) return data[TOMINMAP_CARD_TITLE];
	const filePath = canvasNodeFilePath(node);
	if (filePath) {
		const basename = filePath.split('/').pop() || filePath;
		return basename.replace(/\.[^.]+$/, '') || 'Untitled';
	}
	return MindmapActions.topicTitleFromNode(node);
}

function applyTitleOnlyCardMarker(node, kind, title) {
	if (!node) return;
	setCanvasNodeUnknownData(node, {
		[TOMINMAP_TITLE_ONLY]: true,
		[TOMINMAP_CARD_KIND]: kind,
		[TOMINMAP_CARD_TITLE]: title || titleOnlyCardTitle(node)
	});
	const marker = title || titleOnlyCardTitle(node);
	const shell =
		node.nodeEl?.closest?.('.canvas-node') || node.nodeEl;
	if (!shell) return;
	shell.toggleClass?.('tomindmap-title-only-card', true);
	shell.setAttribute?.('data-tomindmap-card-title', marker);
	shell.setAttribute?.('data-tomindmap-card-kind', kind);
	const kindLabel =
		kind === 'nested-map'
			? 'nested mind map'
			: kind === 'branch-note'
				? 'branch file'
				: 'linked file';
	shell.setAttribute?.('aria-label', `${marker} — open ${kindLabel}`);
}

function setCanvasNodeCollapsedClass(node, collapsed) {
	if (!node) return;
	const el = node.nodeEl;
	if (!el) return;
	const shell = el.closest?.('.canvas-node') || el;
	for (const target of new Set([el, shell])) {
		if (typeof target.toggleClass === 'function') {
			target.toggleClass('tomindmap-collapsed-node', collapsed);
		} else if (typeof target.removeClass === 'function') {
			if (collapsed) target.addClass('tomindmap-collapsed-node');
			else target.removeClass('tomindmap-collapsed-node');
		} else if (target.classList) {
			target.classList.toggle('tomindmap-collapsed-node', collapsed);
		}
	}
}

function nodeIsConvertibleTopic(canvas, node) {
	return MindmapActions.isTextTopicNode(node, getGroupIds(canvas));
}

function findNativeCanvasMenuItem(menu, titlePattern) {
	if (!menu || !Array.isArray(menu.items)) return null;
	return (
		menu.items.find((item) => {
			const text = String(
				item?.titleEl?.textContent ||
					item?.title ||
					item?.title__ ||
					''
			).trim();
			return titlePattern.test(text);
		}) || null
	);
}

function removeNativeCanvasMenuItem(menu, titlePattern) {
	if (!menu) return false;
	let removed = false;
	const scrubItem = (item) => {
		if (item?.dom) {
			item.dom.remove?.();
			item.dom.style?.setProperty('display', 'none', 'important');
		}
	};
	if (Array.isArray(menu.items)) {
		for (let i = menu.items.length - 1; i >= 0; i--) {
			const item = menu.items[i];
			const text = String(
				item?.titleEl?.textContent ||
				item?.title ||
				item?.title__ ||
				item?.dom?.textContent ||
				''
			).trim();
			if (titlePattern.test(text)) {
				menu.items.splice(i, 1);
				scrubItem(item);
				removed = true;
			}
		}
	}
	if (menu.dom) {
		const domItems = menu.dom.querySelectorAll?.('.menu-item') || [];
		for (const domItem of domItems) {
			const text = (domItem.textContent || '').trim();
			if (titlePattern.test(text)) {
				domItem.remove?.();
				domItem.style?.setProperty('display', 'none', 'important');
				removed = true;
			}
		}
	}
	return removed;
}

function serializedBranchData(canvas, branchNodes, rootNode) {
	const data = canvas.getData();
	const byId = new Map((data.nodes || []).map((item) => [item.id, item]));
	const rootRecord = byId.get(rootNode.id) || {};
	const rootX = Number(rootRecord.x ?? rootNode.x) || 0;
	const rootY = Number(rootRecord.y ?? rootNode.y) || 0;
	const ids = new Set(branchNodes.map((item) => item.id));
	const nodes = branchNodes
		.map((item) => byId.get(item.id))
		.filter(Boolean)
		.map((item) => ({
			...item,
			x: (Number(item.x) || 0) - rootX,
			y: (Number(item.y) || 0) - rootY
		}));
	const edges = (data.edges || []).filter(
		(edge) => ids.has(edge.fromNode) && ids.has(edge.toNode)
	);
	return { nodes, edges };
}

function layoutNestedMindmapData(data, layoutEngine) {
	if (!data || !Array.isArray(data.nodes) || data.nodes.length <= 1) return;
	const nodeMap = new Map();
	for (const n of data.nodes) {
		nodeMap.set(n.id, {
			id: n.id,
			x: Number(n.x) || 0,
			y: Number(n.y) || 0,
			width: Number(n.width) || 200,
			height: Number(n.height) || 60,
			moveTo(pos) {
				this.x = pos.x;
				this.y = pos.y;
			}
		});
	}
	const edgeMap = new Map();
	for (const e of data.edges || []) {
		const fromNode = nodeMap.get(e.fromNode);
		const toNode = nodeMap.get(e.toNode);
		if (!fromNode || !toNode) continue;
		edgeMap.set(e.id, {
			id: e.id,
			from: { node: fromNode, side: e.fromSide || 'right' },
			to: { node: toNode, side: e.toSide || 'left' },
			fromNode: e.fromNode,
			toNode: e.toNode,
			fromSide: e.fromSide || 'right',
			toSide: e.toSide || 'left'
		});
	}
	const mockCanvas = {
		nodes: nodeMap,
		edges: edgeMap,
		getData: () => data,
		requestSave() {},
		requestFrame() {}
	};
	layoutEngine.layout(mockCanvas, {
		persist: false,
		animate: false,
		preserveRootSides: false,
		spreadEqually: true
	});
	for (const n of data.nodes) {
		const updated = nodeMap.get(n.id);
		if (updated) {
			n.x = updated.x;
			n.y = updated.y;
		}
	}
	for (const e of data.edges || []) {
		const updated = edgeMap.get(e.id);
		if (updated) {
			e.fromSide = updated.from.side;
			e.toSide = updated.to.side;
		}
	}
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
	const ownerDocument = source.ownerDocument || globalThis.document;
	const safe = sanitizeExportElement(clone, { document: ownerDocument });
	const sourceRect = source.getBoundingClientRect();
	return {
		html: serializeXmlSafe(safe, { document: ownerDocument }),
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
function edgePath(from, to, fromSide, toSide, lineType, curve, curvature) {
	if (lineType === 'straight' || curve === false) {
		const [x1, y1] = edgeAnchor(from, fromSide);
		const [x2, y2] = edgeAnchor(to, toSide);
		return `M ${x1} ${y1} L ${x2} ${y2}`;
	}
	return edgeCurve(from, to, fromSide, toSide);
}

function exportMarkerId(color) {
	return `arrow-${String(color || 'default').replace(/[^a-z0-9_-]/gi, '_')}`;
}
function canvasPrintDocument(canvas, scope) {
	const data = canvas.getData();
	const dataById = new Map(data.nodes.map((node) => [node.id, node]));
	const wrapperRect =
		canvas.wrapperEl?.getBoundingClientRect?.() || {
			left: 0,
			top: 0,
			right: 1600,
			bottom: 900,
			width: 1600,
			height: 900
		};
	const wrapperStyle =
		canvas.wrapperEl?.ownerDocument?.defaultView?.getComputedStyle(
			canvas.wrapperEl
		);
	const background = safeCssValue(
		wrapperStyle?.backgroundColor,
		nearestPaintedBackground(canvas.wrapperEl)
	);
	const backdropRgb = parseCssColor(background) || [255, 255, 255];
	const isDarkTheme =
		(backdropRgb[0] * 299 + backdropRgb[1] * 587 + backdropRgb[2] * 114) / 1000 <= 145 ||
		Boolean(canvas.wrapperEl?.ownerDocument?.body?.classList?.contains('theme-dark'));
	const defaultCardFill = isDarkTheme ? 'rgb(36, 36, 36)' : '#ffffff';
	const defaultCardTextColor = isDarkTheme ? '#f8fafc' : '#0f172a';
	const defaultFontFamily =
		wrapperStyle?.fontFamily ||
		"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

	const selectedIds = new Set();
	if (scope === 'selection') {
		for (const item of canvas.selection || []) {
			if (typeof item === 'string') selectedIds.add(item);
			else if (item && typeof item === 'object') {
				const id = item.id || item.node?.id;
				if (id) selectedIds.add(id);
			}
		}
		try {
			const forest = buildForest(canvas, { includeHidden: true });
			for (const id of Array.from(selectedIds)) {
				const treeNode = findTreeForNode(forest, id);
				if (treeNode) {
					for (const desc of getDescendants(treeNode)) {
						const descId = desc.id || desc.canvasNode?.id;
						if (descId) selectedIds.add(descId);
					}
				}
			}
		} catch (_) {}
		const queue = Array.from(selectedIds);
		const outgoing = new Map();
		const addEdge = (u, v) => {
			if (!u || !v || u === v) return;
			if (!outgoing.has(u)) outgoing.set(u, []);
			outgoing.get(u).push(v);
		};
		for (const edge of data.edges || []) {
			if (edge.fromEnd === 'arrow' && edge.toEnd !== 'arrow') {
				addEdge(edge.toNode, edge.fromNode);
			} else {
				addEdge(edge.fromNode, edge.toNode);
			}
		}
		if (typeof canvas.edges?.values === 'function') {
			for (const edge of canvas.edges.values()) {
				const from = edge.fromNode || edge.from?.node?.id || edge.from?.id;
				const to = edge.toNode || edge.to?.node?.id || edge.to?.id;
				if (edge.fromEnd === 'arrow' && edge.toEnd !== 'arrow') {
					addEdge(to, from);
				} else {
					addEdge(from, to);
				}
			}
		}
		while (queue.length > 0) {
			const curr = queue.shift();
			for (const next of outgoing.get(curr) || []) {
				if (!selectedIds.has(next)) {
					selectedIds.add(next);
					queue.push(next);
				}
			}
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
		const nodeX = Number(node.x);
		const nodeY = Number(node.y);
		const nodeWidth = Number(node.width);
		const nodeHeight = Number(node.height);
		if (
			![nodeX, nodeY, nodeWidth, nodeHeight].every(Number.isFinite) ||
			nodeWidth <= 0 || nodeHeight <= 0 || nodeWidth > 100000 || nodeHeight > 100000
		)
			continue;
		const viewportMode = scope === 'viewport';
		const titleOnly = !!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY];
		const rendered =
			nodeData.type === 'group' || titleOnly
				? null
				: printableNodeSnapshot(node);
		const displayText =
			nodeData.type === 'group'
				? nodeData.label || 'Group'
				: titleOnly
					? titleOnlyCardTitle(node)
					: node.text || canvasNodeMarkdownText(nodeData);
		const logicalScale = viewportMode
			? 1
			: domRect && nodeWidth
				? domRect.width / nodeWidth
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
								: nodeX) +
							(rendered.rect.left - domRect.left) / logicalScale,
						y:
							(viewportMode
								? domRect.top - wrapperRect.top
								: nodeY) +
							(rendered.rect.top - domRect.top) / logicalScale,
						width: rendered.rect.width / logicalScale,
						height: rendered.rect.height / logicalScale
					}
				: null;
		const cardState = [
			canvas.selection?.has?.(node) ? 'selected' : '',
			node.isEditing ? 'editing' : '',
			titleOnly ? 'linked' : '',
			canvasNodeUnknownData(node).collapsed ? 'collapsed' : '',
			Array.isArray(data.mindmapMissingMedia?.[node.id]) &&
			data.mindmapMissingMedia[node.id].length > 0
				? 'missing-media'
				: ''
		].filter(Boolean).join(' ');
		const rawFill = safeCssValue(
			nodeStyle?.backgroundColor,
			nearestPaintedBackground(node.nodeEl, defaultCardFill)
		);
		const rawTextColor = safeCssValue(
			nodeStyle?.color,
			defaultCardTextColor
		);
		const radius = parseFloat(nodeStyle?.borderRadius);
		const cardRadius = Number.isFinite(radius) && radius > 0 ? radius : (nodeData.type === 'group' ? 4 : 8);

		records.push({
			id: node.id,
			state: cardState,
			x: viewportMode ? domRect.left - wrapperRect.left : nodeX,
			y: viewportMode ? domRect.top - wrapperRect.top : nodeY,
			width: viewportMode ? domRect.width : nodeWidth,
			height: viewportMode ? domRect.height : nodeHeight,
			text: displayText,
			renderedHtml: rendered?.html || '',
			contentRect,
			color: node.color || nodeData.color || '',
			group: nodeData.type === 'group',
			fill: rawFill,
			stroke: safeCssValue(nodeStyle?.borderColor, ''),
			strokeWidth: parseFloat(nodeStyle?.borderWidth) || 2,
			radius: cardRadius,
			textColor: rawTextColor,
			fontFamily: nodeStyle?.fontFamily || defaultFontFamily,
			fontSize: parseFloat(nodeStyle?.fontSize) || 14,
			lineHeight: parseFloat(nodeStyle?.lineHeight) || 20
		});
	}
	if (records.length === 0) return null;
	const byId = new Map(records.map((record) => [record.id, record]));
	const viewportEndpoint = (node, side) => {
		const rect = node?.nodeEl?.getBoundingClientRect?.();
		const record = rect
			? {
					x: rect.left - wrapperRect.left,
					y: rect.top - wrapperRect.top,
					width: rect.width,
					height: rect.height
				}
			: node;
		const [x, y] = edgeAnchor(record, side);
		return {
			x: Math.max(0, Math.min(wrapperRect.width, x)),
			y: Math.max(0, Math.min(wrapperRect.height, y)),
			width: 0,
			height: 0
		};
	};
	const edges = [];
	for (const edge of data.edges || []) {
		let from = byId.get(edge.fromNode);
		let to = byId.get(edge.toNode);
		if (from && to) {
			edges.push({
				from,
				to,
				id: edge.id,
				label: edge.label,
				color: edge.color || '',
				fromSide: edge.fromSide,
				toSide: edge.toSide,
				fromEnd: edge.fromEnd,
				toEnd: edge.toEnd,
				lineType: edge.lineType,
				curve: edge.curve,
				curvature: edge.curvature
			});
			continue;
		}
		if (scope !== 'viewport' || (!from && !to)) continue;
		from ||= viewportEndpoint(canvas.nodes.get(edge.fromNode), edge.fromSide);
		to ||= viewportEndpoint(canvas.nodes.get(edge.toNode), edge.toSide);
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
		minX = Infinity;
		minY = Infinity;
		maxX = -Infinity;
		maxY = -Infinity;
		for (const record of records) {
			minX = Math.min(minX, record.x);
			minY = Math.min(minY, record.y);
			maxX = Math.max(maxX, record.x + record.width);
			maxY = Math.max(maxY, record.y + record.height);
		}
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
		.map(({ from, to, color, fromSide, toSide, fromEnd, toEnd, lineType, curve, curvature, label }) => {
			const stroke = colorOf(color, '#94a3b8');
			const path = edgePath(from, to, fromSide, toSide, lineType, curve, curvature);
			const marker = exportMarkerId(color);
			const start = fromEnd === 'arrow' ? ` marker-start="url(#${marker})"` : '';
			const end = toEnd !== 'none' ? ` marker-end="url(#${marker})"` : '';
			const [x1, y1] = edgeAnchor(from, fromSide);
			const [x2, y2] = edgeAnchor(to, toSide);
			const labelMarkup = label
				? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-size="12" fill="${escapeXml(stroke)}">${escapeXml(label)}</text>`
				: '';
			return `<path d="${path}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="2"${start}${end}/>${labelMarkup}`;
		})
		.join('');
	const nodeSvg = records
		.map((record) => {
			const accent = colorOf(
				record.color,
				record.group ? '#94a3b8' : '#64748b'
			);
			const paint = visibleCardPaint(
				record.fill,
				record.stroke,
				background,
				accent
			);
			let stroke = paint.stroke;
			let stateStrokeWidth = record.strokeWidth;
			if (record.state.split(/\s+/).includes('selected')) {
				stroke = '#2563eb';
				stateStrokeWidth = Math.max(3, record.strokeWidth + 1);
			} else if (record.state.split(/\s+/).includes('missing-media')) {
				stroke = '#dc2626';
			}

			const fillRgb = parseCssColor(paint.fill) || (isDarkTheme ? [36, 36, 36] : [255, 255, 255]);
			const fillLum = (fillRgb[0] * 299 + fillRgb[1] * 587 + fillRgb[2] * 114) / 1000;
			let textRgb = parseCssColor(record.textColor);
			let effectiveTextColor = record.textColor;
			if (!textRgb || colorDistance(textRgb, fillRgb) < 110) {
				effectiveTextColor = fillLum < 145 ? '#f8fafc' : '#0f172a';
			}

			const stateAttribute = ` data-tomindmap-card-state="${escapeXml(record.state)}"`;
			if (record.group) {
				return `<g${stateAttribute}><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(paint.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${stateStrokeWidth}"/><text x="${record.x + 12}" y="${record.y + 22}" font-size="${record.fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(effectiveTextColor)}">${escapeXml(MarkdownMindMapCodec.topicTitle(record.text))}</text></g>`;
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
				return `<g${stateAttribute}><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(paint.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${stateStrokeWidth}"/><text data-tomindmap-pdf-fallback="true" opacity="0" x="${record.x + 12}" y="${fallbackY}" font-size="${fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(effectiveTextColor)}">${fallbackSpans}</text><foreignObject x="${box.x}" y="${box.y}" width="${Math.max(1, box.width)}" height="${Math.max(1, box.height)}"><div xmlns="http://www.w3.org/1999/xhtml" class="tomindmap-pdf-card">${record.renderedHtml}</div></foreignObject></g>`;
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
			return `<g${stateAttribute}><rect x="${record.x}" y="${record.y}" width="${record.width}" height="${record.height}" rx="${record.radius}" fill="${escapeXml(paint.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${stateStrokeWidth}"/><text x="${record.x + 12}" y="${textY}" font-size="${fontSize}" font-family="${escapeXml(record.fontFamily)}" fill="${escapeXml(effectiveTextColor)}">${tspans}</text></g>`;
		})
		.join('');
	const title =
		canvas.view && canvas.view.file
			? canvas.view.file.basename
			: 'Mind map';
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
	DEFAULT_FREEMIND_BUDGETS,
	FREEMIND_REASON,
	decodeFreeMind,
	exportToFreeMind,
	layoutTree
} = require('./lib/freemind.js');

// src/main.ts
var CanvasMindMapPlugin = class extends import_obsidian5.Plugin {
	constructor() {
		super(...arguments);
		this.settings = DEFAULT_SETTINGS;
		this.liveSizing = new LiveSizingController(this, getGroupIds);
		this.canvasDecorationState = new WeakMap();
		this.groupAnimationVersions = new WeakMap();
		this.canvasGestureOwners = new Set();
		this.canvasGeneration = 0;
		this.cleanupClickHandler = null;
		this.cleanupGroupDragHandler = null;
		this.cleanupTouchHandler = null;
		this.touchController = null;
		this.autoResizeHandle = null;
		this.interceptedCanvas = null;
		this.toggleBtnEl = null;
		this.ribbonIconEl = null;
		this.pendingNestedMindMapUndo = null;
		this.cleanupToggleHandler = null;
		this.cleanupCardSelectionHandler = null;
		this.cleanupCardDoubleClickHandler = null;
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
		this.markdownOwnership = createMarkdownSyncOwnership();
		this.markdownSyncIndex = new MarkdownSyncIndex();
		this.markdownSyncCoordinator = new MarkdownSyncCoordinator();
		this.verifiedMarkdownLinks = new Map();
		this.verifiedParentLinks = new Map();
		this.markdownSyncTimers = /* @__PURE__ */ new Map();
		this.markdownModifyTimers = /* @__PURE__ */ new Map();
		this.markdownWriteGuards = /* @__PURE__ */ new Map();
		this.markdownWriteGuardTimers = /* @__PURE__ */ new Map();
		this.markdownOrderDirty = /* @__PURE__ */ new WeakSet();
		this.persistenceQueue = Promise.resolve();
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
			nodeHeight: this.settings.defaultNodeHeight,
			// Canvas edges update synchronously; animating only the cards makes
			// the visible graph temporarily disagree with its edge geometry.
			animate: false
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
			this.runAsync(() => this.showOutline(canvas, true), 'show outline');
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
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
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
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'O' }],
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
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'K' }],
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
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'T' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas) return false;
				if (checking) return true;
				this.toggleMindmapMode(canvas);
			}
		});
		this.addCommand({
			id: 'mindmap-toggle-subtree',
			name: 'Collapse or expand selected subtree',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'C' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node) return false;
				const forest = buildForest(canvas);
				const tree = findTreeForNode(forest, node.id);
				if (!tree || tree.children.length === 0) return false;
				if (checking) return true;
				const next = MindmapActions.toggleSubtreeCollapse(
					canvas,
					forest,
					node
				);
				this.layoutEngine.layout(canvas, { preserveRootSides: true });
				canvas.requestSave();
				this.refreshOutline(canvas);
				new import_obsidian5.Notice(
					next ? 'Subtree collapsed' : 'Subtree expanded'
				);
			}
		});
		this.addCommand({
			id: 'mindmap-convert-file-with-subtree',
			name: 'Convert selected topic to file with subtree',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'F' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node || !nodeIsConvertibleTopic(canvas, node)) return false;
				const forest = buildForest(canvas);
				const tree = findTreeForNode(forest, node.id);
				if (!tree || tree.children.length === 0) return false;
				if (checking) return true;
				this.runAsync(() => this.convertTopicToCleanNotes(canvas, node, true), 'convert topic to clean notes');
			}
		});
		this.addCommand({
			id: 'mindmap-convert-file-without-subtree',
			name: 'Convert selected topic to file without subtree',
			hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'F' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node || !nodeIsConvertibleTopic(canvas, node)) return false;
				if (checking) return true;
				this.runAsync(() => this.convertTopicToCleanNotes(canvas, node, false), 'convert topic to clean notes');
			}
		});
		this.addCommand({
			id: 'mindmap-convert-linked-to-topic',
			name: 'Expand linked file into a normal topic',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'N' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (
					!node ||
					!canvasNodeFilePath(node) ||
					!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY]
				)
					return false;
				if (checking) return true;
				this.runAsync(() => this.convertLinkedNodeToNormalTopic(canvas, node), 'convert linked node to normal topic');
			}
		});
		this.addCommand({
			id: 'mindmap-convert-to-nested',
			name: 'Convert selected topic to nested mind map',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'M' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const node = this.canvasApi.getSelectedNode(canvas);
				if (!node || !nodeIsConvertibleTopic(canvas, node)) return false;
				if (checking) return true;
				this.runAsync(() => this.convertTopicToNestedMindMap(canvas, node), 'convert topic to nested mind map');
			}
		});
		this.addCommand({
			id: 'mindmap-open-parent',
			name: 'Go to parent mind map',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'ArrowUp' }],
			checkCallback: (checking) => {
				const canvas = this.canvasApi.getActiveCanvas();
				if (!canvas || !this.isMindmapCanvas(canvas)) return false;
				const parent = canvas.getData?.()?.[TOMINMAP_PARENT];
				if (!parent?.canvas || !parent?.nodeId) return false;
				if (checking) return true;
				this.runAsync(() => this.openParentMindMap(canvas, parent), 'open parent mind map');
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
			this.runAsync(() => this.rebuildMarkdownSyncIndex(), 'rebuild markdown sync index');
			const view = this.app.workspace.getActiveViewOfType(
				import_obsidian5.ItemView
			);
			if (view) this.onLeafChange(view.leaf);
		});
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof import_obsidian5.TFolder) {
					menu.addItem((item) => {
						item.setTitle('Create new mind map')
							.setIcon('git-fork')
							.onClick(() => this.createNewMindMap(file.path));
					});
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
				menu.addSeparator();
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
					this.markdownSyncIndex.canvasesFor(file.path).length > 0
				)
					this.scheduleMarkdownToCanvas(file);
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.runAsync(() => this.handleSyncedFileRename(file, oldPath), 'handle synced file rename');
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.runAsync(() => this.handleSyncedFileDelete(file), 'handle synced file delete');
			})
		);
		this.registerEvent(
			this.app.workspace.on('canvas:node-menu', (menu, node) => {
				const canvas = node?.canvas || this.canvasApi.getActiveCanvas();
				menu.addItem((item) => {
					item.setTitle('Copy node link')
						.setIcon('link')
						.onClick(() => {
							this.runAsync(async () => {
								const canvasPath = node.canvas?.view?.file?.path || '';
								let link;
								if (canvasNodeFilePath(node)) {
									const vaultName = this.app.vault.getName?.() || '';
									link = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(canvasNodeFilePath(node))}`;
								} else if (canvasNodeUrl(node)) link = canvasNodeUrl(node);
								else link = `obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${node.id}`;
								await writeClipboardText(link);
								new import_obsidian5.Notice('Node link copied');
							}, 'copy node link');
						});
				});
				if (canvas && this.isMindmapCanvas(canvas)) {
					const scrubNative = () => {
						removeNativeCanvasMenuItem(
							menu,
							/convert to file/i
						);
					};
					scrubNative();
					setTimeout(scrubNative, 0);
					setTimeout(scrubNative, 50);
					if (typeof menu.addItem === 'function' && !menu.__tomindmapScrubbed) {
						menu.__tomindmapScrubbed = true;
						const origAddItem = menu.addItem;
						menu.addItem = function(callback) {
							return origAddItem.call(this, (item) => {
								callback(item);
								const title = String(item?.titleEl?.textContent || item?.title || item?.title__ || '').trim();
								if (/^convert to file/i.test(title)) {
									if (item.dom) {
										item.dom.remove?.();
										item.dom.style?.setProperty('display', 'none', 'important');
									}
									const idx = menu.items?.indexOf?.(item);
									if (idx >= 0) menu.items.splice(idx, 1);
								}
							});
						};
					}
				}
				if (
					canvas &&
					this.isMindmapCanvas(canvas) &&
					nodeIsConvertibleTopic(canvas, node)
				) {
					const conversionForest = buildForest(canvas);
					const conversionTree = findTreeForNode(
						conversionForest,
						node.id
					);
					const hasBranch = !!(
						conversionTree && conversionTree.children.length > 0
					);
					const convertWithSubtree = () =>
						this.runAsync(() => this.convertTopicToCleanNotes(canvas, node, true), 'convert topic to clean notes');
					const convertWithoutSubtree = () =>
						this.runAsync(() => this.convertTopicToCleanNotes(canvas, node, false), 'convert topic to clean notes');
					if (hasBranch) {
						menu.addItem((item) => {
							item.setTitle('Convert branch to file (with subtree)')
								.setIcon('file-text')
								.onClick(convertWithSubtree);
						});
						menu.addItem((item) => {
							item.setTitle('Convert branch to file (without subtree)')
								.setIcon('file-plus')
								.onClick(convertWithoutSubtree);
						});
						menu.addItem((item) => {
							item.setTitle('Convert branch to nested mind map')
								.setIcon('network')
								.onClick(() =>
									this.runAsync(() => this.convertTopicToNestedMindMap(canvas, node), 'convert topic to nested mind map')
								);
						});
					} else {
						menu.addItem((item) => {
							item.setTitle('Convert topic to file')
								.setIcon('file-plus')
								.onClick(convertWithoutSubtree);
						});
						menu.addItem((item) => {
							item.setTitle('Convert to nested mind map')
								.setIcon('network')
								.onClick(() =>
									this.runAsync(() => this.convertTopicToNestedMindMap(canvas, node), 'convert topic to nested mind map')
								);
						});
					}
				}
				const linkedPath = canvasNodeFilePath(node);
				const linkedTopic =
					canvas &&
					this.isMindmapCanvas(canvas) &&
					!!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY] &&
					!!linkedPath;
				if (linkedTopic) {
					const targetFile = this.app.vault.getAbstractFileByPath(linkedPath);
					const isNested = canvasNodeUnknownData(node)[TOMINMAP_CARD_KIND] === 'nested-map';
					menu.addItem((item) => {
						item.setTitle(
							targetFile
								? (isNested ? 'Expand nested mind map into topics' : 'Expand linked content into mind map')
								: 'Convert to normal topic'
						)
							.setIcon(targetFile ? 'network' : 'file-minus')
							.onClick(() =>
								void this.convertLinkedNodeToNormalTopic(canvas, node)
							);
					});
				}
				const parentLink = canvas?.getData?.()?.[TOMINMAP_PARENT];
				const parentForest = canvas ? buildForest(canvas) : [];
				const parentTree = canvas
					? findTreeForNode(parentForest, node.id)
					: null;
				if (
					parentLink &&
					parentTree &&
					!parentTree.parent
				) {
					menu.addItem((item) => {
						item.setTitle('Go to parent node')
							.setIcon('arrow-up-left')
							.onClick(() =>
								void this.openParentMindMap(canvas, parentLink)
							);
					});
				}
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
				this.runAsync(() => this.copyMindMapMarkdown(canvas), 'copy mind map markdown');
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
				this.runAsync(() => this.validateMediaLinks(canvas, nodes, true), 'validate media links');
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
		this.addCommand({
			id: 'create-new-mindmap',
			name: 'Create new mind map',
			callback: () => {
				this.runAsync(() => this.createNewMindMap(), 'create new mind map');
			}
		});
		this.updateRibbonIcon();
		this.applyCanvasCommandRename();
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
	async onunload() {
		this.unloaded = true;
		this.applyCanvasCommandRename(true);
		if (this.ribbonIconEl) {
			this.ribbonIconEl.remove();
			this.ribbonIconEl = null;
		}
		if (this.canvasLifecycleTimer !== null) {
			clearTimeout(this.canvasLifecycleTimer);
			this.canvasLifecycleTimer = null;
		}
		const canvas = this.interceptedCanvas;
		this.disposeCanvasGestures('unload');
		const drainMarkdownSync = this.markdownSyncCoordinator.flushAll()
			.then(() => this.markdownSyncCoordinator.dispose())
			.then((result) => {
				if (!result.ok) console.warn('ToMindMap: Markdown sync did not drain during unload', result);
			})
			.catch((error) => console.warn('ToMindMap: Markdown coordinator unload failed', error));
		await drainMarkdownSync;
		try { await this.persistenceQueue; } catch (_) {}
		try {
			await flushCanvasView(canvas, this.app.vault);
		} catch (error) {
			console.error(
				'ToMindMap: could not flush the active Canvas during unload',
				error
			);
		}
		this.cancelPendingAsync(canvas);
		this.disposeCanvasDecorations(canvas);
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
		if (this.cleanupKeyboardHandler) {
			this.cleanupKeyboardHandler();
			this.cleanupKeyboardHandler = null;
		}
		if (this.cleanupTouchHandler) {
			this.cleanupTouchHandler();
			this.cleanupTouchHandler = null;
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
		if (this.cleanupCardDoubleClickHandler) {
			this.cleanupCardDoubleClickHandler();
			this.cleanupCardDoubleClickHandler = null;
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
			this.disposeCanvasGestures('leaf-change');
			this.cancelPendingAsync(previousCanvas);
			this.disposeCanvasDecorations(previousCanvas);
			void flushCanvasView(previousCanvas, this.app.vault).catch(
				(error) => {
					console.error(
						'ToMindMap: could not flush Canvas changes before switching views',
						error
					);
				}
			);
			if (pendingMarkdownWrite) {
				clearTimeout(pendingMarkdownWrite);
				this.markdownSyncTimers.delete(previousCanvasPath);
				this.runAsync(() => this.flushCanvasToMarkdown(previousCanvas), 'flush canvas to markdown');
			}
		}
		this.unwrapCanvasMethods();
		if (this.cleanupClickHandler) {
			this.cleanupClickHandler();
			this.cleanupClickHandler = null;
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
		if (this.cleanupKeyboardHandler) {
			this.cleanupKeyboardHandler();
			this.cleanupKeyboardHandler = null;
		}
		if (this.cleanupTouchHandler) {
			this.cleanupTouchHandler();
			this.cleanupTouchHandler = null;
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
		if (this.cleanupCardDoubleClickHandler) {
			this.cleanupCardDoubleClickHandler();
			this.cleanupCardDoubleClickHandler = null;
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
			this.hideOutline();
			return;
		}
		const canvasData = canvas.getData();
		this.captureCanvasDecorations(canvas);
		if (this.isMindmapCanvas(canvas)) {
			MindmapActions.syncCollapsedVisibility(canvas);
			this.layoutEngine.updateEdgeSides?.(canvas, { persist: false });
		}
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
		if (canvas.view && !canvas.view.__tomindmap_pane_menu_hooked) {
			canvas.view.__tomindmap_pane_menu_hooked = true;
			const origOnPaneMenu = canvas.view.onPaneMenu;
			const self = this;
			canvas.view.onPaneMenu = function (menu, source) {
				if (typeof origOnPaneMenu === 'function') {
					origOnPaneMenu.call(this, menu, source);
				}
				if (self.isMindmapCanvas(this.canvas || canvas)) {
					self.filterMindmapPaneMenu(menu);
				}
			};
		}
		const onCardPointerDown = (event) => {
			const node = isPrimaryCardGesture(event, {
				isEnabled: () => this.isMindmapCanvas(canvas),
				findNode: (pointerEvent) => findNodeFromEvent(canvas, pointerEvent),
				isGroupNode: (candidate) => getGroupIds(canvas).has(candidate.id)
			});
			if (!node) return;
			if (event.shiftKey || event.metaKey || event.ctrlKey) return;
			const isNodeInSelection = Boolean(
				canvas.selection && (
					canvas.selection.has(node) ||
					canvas.selection.has(node.id) ||
					Array.from(canvas.selection).some((item) => item === node || item === node?.id || (item && item.id === node?.id))
				)
			);
			if (isNodeInSelection && canvas.selection.size > 1) return;
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
		const onCardDoubleClick = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			const node = findNodeFromEvent(canvas, event);
			if (!node || !canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY]) return;
			const filePath = canvasNodeFilePath(node);
			let file = this.app.vault.getAbstractFileByPath(filePath);
			if (
				canvasNodeUnknownData(node)[TOMINMAP_CARD_KIND] === 'nested-map' &&
				typeof this.findMostRecentNestedMapForNode === 'function'
			) {
				const mostRecent = this.findMostRecentNestedMapForNode(canvas, node);
				if (mostRecent) file = mostRecent;
			}
			if (!(file instanceof import_obsidian5.TFile)) return;
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();
			canvas.selectOnly(node);
			void this.app.workspace.getLeaf(false).openFile(file);
		};
		canvas.wrapperEl.addEventListener(
			'dblclick',
			onCardDoubleClick,
			true
		);
		this.cleanupCardDoubleClickHandler = () => {
			canvas.wrapperEl.removeEventListener(
				'dblclick',
				onCardDoubleClick,
				true
			);
		};
		this.cleanupKeyboardHandler =
			this.keyboardHandler.attachToCanvas(canvas);
		this.syncCanvasBindings(canvas);
		this.cleanupClickHandler = this.navigation.registerClickHandler(canvas);
		// Card movement, subtree movement, attachment preview, and commit are
		// deliberately owned by registerNodeDragReparentHandler. Multiple gesture
		// owners used to race each other and could save a transient preview.
		this.cleanupGroupDragHandler = registerGroupDragHandler(
			canvas,
			this.canvasApi,
			() => this.isMindmapCanvas(canvas)
		);
		this.canvasGestureOwners.add(this.cleanupGroupDragHandler);
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
			const toggled = MarkdownMindMapCodec.toggleTopicCheckbox(
				node.text,
				checkboxIndex
			);
			if (!toggled.changed) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			node.setText(toggled.text);
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
			const data = canvas.getData();
			const markers = {
				...(data.mindmapMissingMedia && typeof data.mindmapMissingMedia === 'object'
					? data.mindmapMissingMedia
					: {})
			};
			const missing = Array.isArray(markers[node.id]) ? markers[node.id].slice() : [];
			if (!missing.includes(source)) missing.push(source);
			markers[node.id] = missing;
			data.mindmapMissingMedia = markers;
			canvas.setData(data);
			this.applyMissingMediaMarkers(canvas);
			if (this.settings.autoColor && this.isMindmapCanvas(canvas))
				this.branchColors.applyColors(canvas);
			canvas.requestSave();
		};
		const onMediaLoad = (event) => {
			if (!this.isMindmapCanvas(canvas)) return;
			const node = findNodeFromEvent(canvas, event);
			if (!node) return;
			const data = canvas.getData();
			const markers = data.mindmapMissingMedia;
			if (!markers || !Array.isArray(markers[node.id])) return;
			delete markers[node.id];
			data.mindmapMissingMedia = markers;
			canvas.setData(data);
			this.applyMissingMediaMarkers(canvas);
			if (this.settings.autoColor && this.isMindmapCanvas(canvas))
				this.branchColors.applyColors(canvas);
			canvas.requestSave();
		};
		canvas.wrapperEl.addEventListener('error', onMediaLoadError, true);
		canvas.wrapperEl.addEventListener('load', onMediaLoad, true);
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
			canvas.wrapperEl.removeEventListener(
				'load',
				onMediaLoad,
				true
			);
		};
		this.cleanupMediaDropHandler = this.registerMediaDropHandler(canvas);
		this.cleanupNodeDragReparentHandler =
			this.registerNodeDragReparentHandler(canvas);
		this.canvasGestureOwners.add(this.cleanupNodeDragReparentHandler);
		const handleEditExit = (canvas2, editedNode) => {
				const finalized = removeEmptyNodeOnEditExit(
					canvas2,
					editedNode,
					this.canvasApi
				);
				const pruned = pruneEmptyLeafTopics(canvas2, this.canvasApi);
				if (finalized.removed || pruned.length > 0) {
					this.layoutEngine.layout(canvas2, { preserveRootSides: true });
					this.updateGroupBounds(canvas2);
					if (this.settings.autoColor)
						this.branchColors.applyColors(canvas2);
					this.markMarkdownOrderDirty(canvas2);
					const focus =
						finalized.parent ||
						pruned[pruned.length - 1]?.parent ||
						null;
					if (focus && canvas2.nodes.has(focus.id))
						this.canvasApi.selectForNavigation(
							canvas2,
							focus,
							this.settings.navigationZoomPadding
						);
					this.runAsync(() => this.flushCanvasToMarkdown(canvas2), 'flush canvas to markdown');
					return true;
				}
				this.waitForPreview(editedNode, () => {
					if (this.canvasApi.getActiveCanvas() !== canvas2) return;
					if (!this.isMindmapCanvas(canvas2)) return;
					this.runAsync(() => this.renameCanvasFromRootTopic(canvas2, editedNode), 'rename canvas from root topic');
					if (!this.isAutoAdjustCanvas(canvas2)) return;
					this.resizeNodesWhenRendered(
						canvas2,
						[editedNode],
						null,
						{ preserveRootSides: true }
					);
				});
				return false;
		};
		this.autoResizeHandle = registerAutoResize(
			canvas,
			{
				enabled: () => this.isMindmapCanvas(canvas)
			},
			handleEditExit
		);
		this.keyboardHandler.onBeforeLeaveNode = () => {
			var _a2;
			(_a2 = this.autoResizeHandle) == null ? void 0 : _a2.finalizeNode();
		};
		this.keyboardHandler.onAfterFinishEditing = handleEditExit;
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
		const origRemoveNode = canvas.removeNode.bind(canvas);
		let structuralReflowQueued = false;
		this.origCanvasMethods = {
			requestSave: origSave,
			createGroupNode: origCreateGroup,
			undo: origUndo,
			redo: origRedo,
			selectOnly: origSelectOnly,
			deselectAll: origDeselectAll,
			importData: origImportData,
			removeEdge: origRemoveEdge,
			removeNode: origRemoveNode
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
		canvas.removeNode = (...args) => {
			const result = origRemoveNode(...args);
			this.canvasApi.invalidateEdgeIndex();
			if (
				this.isMindmapCanvas(canvas) &&
				this.isAutoAdjustCanvas(canvas) &&
				!structuralReflowQueued
			) {
				structuralReflowQueued = true;
				this.trackedRaf(() => {
					structuralReflowQueued = false;
					if (!this.isMindmapCanvas(canvas)) return;
					pruneEmptyLeafTopics(canvas, this.canvasApi);
					MindmapActions.syncCollapsedVisibility(canvas);
					this.layoutEngine.layout(canvas, { preserveRootSides: true });
					this.updateGroupBounds(canvas);
					canvas.requestSave();
				});
			}
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
				this.checkNestedMindMapUndo(canvas);
			};
		}
		if (origRedo) {
			canvas.redo = () => {
				origRedo();
				this.canvasApi.invalidateEdgeIndex();
				this.markMarkdownOrderDirty(canvas);
				this.debouncedOutlineRefresh();
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
			const refreshCanvasDecorations = () => {
				refreshPreviewGeometry();
				if (this.isMindmapCanvas(canvas)) {
					MindmapActions.syncCollapsedVisibility(canvas);
					this.layoutEngine.updateEdgeSides?.(canvas, { persist: false });
				}
			};
			refreshCanvasDecorations();
			if (typeof MutationObserver !== 'undefined' && canvas.wrapperEl) {
				let previewRefreshQueued = false;
				const previewObserver = new MutationObserver(() => {
					if (previewRefreshQueued) return;
					previewRefreshQueued = true;
					this.trackedRaf(() => {
						previewRefreshQueued = false;
						if (
							this.interceptedCanvas !== canvas ||
							!this.isMindmapCanvas(canvas)
						) return;
						refreshCanvasDecorations();
					});
				});
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
					MindmapActions.syncCollapsedVisibility(canvas);
					this.layoutEngine.updateEdgeSides?.(canvas, { persist: false });
					this.updateNodeTypeAttributes(canvas);
					refreshPreviewGeometry();
				}, delay);
			}
		} else {
			this.hideOutline();
		}
		this.trackedTimeout(() => this.ensureRootTopic(canvas), 120);
		const canvasFile = canvas.view?.file;
		if (canvasFile) {
			void (async () => {
				const owned = await this.resolveMarkdownLinkForCanvas(canvas);
				if (!owned.ok) return;
				const source = owned.link.file;
				if (!(source instanceof import_obsidian5.TFile)) return;
				const canvasModified = Number(canvasFile.stat?.mtime || 0);
				const markdownModified = Number(source.stat?.mtime || 0);
				if (canvasModified > markdownModified) {
					this.trackedTimeout(() => { void this.flushCanvasToMarkdown(canvas).catch(() => {}); }, 80);
				} else {
					this.trackedTimeout(() => { void this.syncMarkdownFileToCanvases(source).catch(() => {}); }, 80);
				}
			})().catch((error) => console.warn('ToMindMap: could not initialize owned sync', error));
		}
	}
	refreshOutline(canvas) {
		for (const leaf of this.app.workspace.getLeavesOfType(
			OUTLINE_VIEW_TYPE
		)) {
			const view = leaf.view;
			if (view instanceof OutlineView) {
				for (const node of canvas.nodes.values()) {
					const collapsed = canvasNodeUnknownData(node).collapsed;
					if (collapsed === true) view.collapsedNodes.add(node.id);
					else if (collapsed === false)
						view.collapsedNodes.delete(node.id);
				}
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
		if (!root) return [];
		return [root, ...this.canvasApi.getDescendantNodes(canvas, root)];
	}
	/**
	 * Recalculate bounds for all groups to tightly fit their contained subtrees.
	 * A root node belongs to a group if its center is inside the group's current bounds.
	 */
	updateGroupBounds(canvas) {
		const PADDING = 20;
		const groupIds = getGroupIds(canvas);
		if (groupIds.size === 0) return;
		const graph = this.canvasApi.getGraphQuery?.(canvas) || {
			visibleForest: () => buildForest(canvas, { includeHidden: false }),
			descendantsOf: (root) => this.collectSubtreeNodes(canvas, root).slice(1)
		};
		const groups = Array.from(groupIds, (id) => canvas.nodes.get(id)).filter(Boolean);
		const contained = new Map(groups.map((group) => [group.id, new Set()]));
		for (const root of graph.visibleForest()) {
			const node = root.canvasNode;
			const centerX = node.x + node.width / 2;
			const centerY = node.y + node.height / 2;
			let owner = null;
			for (const group of groups) {
				if (
					centerX < group.x || centerX > group.x + group.width ||
					centerY < group.y || centerY > group.y + group.height
				) continue;
				if (
					!owner ||
					group.width * group.height < owner.width * owner.height
				) owner = group;
			}
			if (!owner) continue;
			contained.get(owner.id).add(node);
			for (const descendant of graph.descendantsOf(node))
				contained.get(owner.id).add(descendant);
		}
		let changed = false;
		for (const group of groups) {
			const nodes = contained.get(group.id);
			if (!nodes || nodes.size === 0) continue;
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const node of nodes) {
				minX = Math.min(minX, node.x);
				minY = Math.min(minY, node.y);
				maxX = Math.max(maxX, node.x + node.width);
				maxY = Math.max(maxY, node.y + node.height);
			}
			const next = {
				x: minX - PADDING,
				y: minY - PADDING,
				width: maxX - minX + PADDING * 2,
				height: maxY - minY + PADDING * 2
			};
			if (
				next.x === group.x && next.y === group.y &&
				next.width === group.width && next.height === group.height
			) continue;
			group.nodeEl?.addClass('mindmap-group-animating');
			group.moveAndResize(next);
			const version = (this.groupAnimationVersions.get(group) || 0) + 1;
			this.groupAnimationVersions.set(group, version);
			this.trackedTimeout(() => {
				if (this.groupAnimationVersions.get(group) !== version) return;
				if (this.interceptedCanvas !== canvas || !this.isMindmapCanvas(canvas))
					return;
				group.nodeEl?.removeClass('mindmap-group-animating');
			}, 260);
			changed = true;
		}
		if (changed) canvas.requestSave();
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
	relayoutAffectedBranches(canvas, nodes, layoutOptions = {}) {
		const rootIds = new Set(
			nodes
				.map((node) => this.canvasApi.getAffectedRootNode(canvas, node))
				.filter(Boolean)
				.map((root) => root.id)
		);
		for (const rootId of rootIds)
			this.layoutEngine.layoutChildren(canvas, rootId, null, layoutOptions);
		this.updateGroupBounds(canvas);
	}
	applyStructuralMutation(canvas, changedNodes = [], options = {}) {
		if (!canvas || !this.isMindmapCanvas(canvas))
			return { ok: false, reason: 'ineligible', rootIds: [] };
		this.canvasApi.invalidateEdgeIndex();
		MindmapActions.syncCollapsedVisibility(canvas);
		this.markMarkdownOrderDirty(canvas);
		const rootIds = [...new Set(
			changedNodes
				.map((node) => this.canvasApi.getAffectedRootNode(canvas, node))
				.filter(Boolean)
				.map((root) => root.id)
		)];
		if (options.layout !== false) {
			if (rootIds.length > 0) {
				for (const rootId of rootIds)
					this.layoutEngine.layoutChildren(canvas, rootId, null, options.layoutOptions || {});
			} else {
				this.layoutEngine.layout(canvas, { preserveRootSides: true });
			}
		}
		if (this.settings.autoColor && options.color !== false)
			this.branchColors.applyColors(canvas);
		this.updateGroupBounds(canvas);
		this.updateNodeTypeAttributes(canvas);
		if (options.save !== false) canvas.requestSave();
		return { ok: true, rootIds };
	}
	getAutoNodeSize(node) {
		return this.liveSizing.measure(node);
	}
	/**
	 * Render Markdown off-screen so virtualized Canvas cards can be measured
	 * before they have ever appeared in the viewport.
	 */
	async measureMarkdownNodesOffscreen(canvas, nodes, isCurrent) {
		if (
			typeof document === 'undefined' || !document.body ||
			typeof import_obsidian5.MarkdownRenderer?.renderMarkdown !== 'function' ||
			!import_obsidian5.Component
		) return new Map();
		let host = null;
		let component = null;
		const sourcePath = this.verifiedMarkdownLinks.get(canvas.view?.file?.path)?.path || canvas.view?.file?.path || '';
		const minWidth = Math.max(80, Math.min(this.settings.minNodeWidth, this.settings.maxNodeWidth));
		const maxWidth = Math.max(minWidth, this.settings.maxNodeWidth);
		const fallbackHeight = this.settings.defaultNodeHeight;
		const maxHeight = this.settings.maxNodeHeight;
		const findCalibrationNode = () => Array.from(canvas.nodes.values()).find((node) => {
			const sizer = this.liveSizing.getPreviewSizer(node);
			const preview = sizer?.closest?.('.markdown-preview-view');
			return Boolean(preview?.parentElement && node.contentEl);
		}) || null;
		const waitForCalibrationNode = () => new Promise((resolve) => {
			let settled = false;
			let observer = null;
			let interval = null;
			let timeout = null;
			const finish = (node) => {
				if (settled) return;
				settled = true;
				observer?.disconnect();
				if (interval !== null) clearInterval(interval);
				if (timeout !== null) clearTimeout(timeout);
				resolve(node);
			};
			const check = () => {
				if (!isCurrent()) return finish(null);
				const node = findCalibrationNode();
				if (node) finish(node);
			};
			if (canvas.wrapperEl && typeof MutationObserver !== 'undefined') {
				observer = new MutationObserver(check);
				observer.observe(canvas.wrapperEl, { childList: true, subtree: true });
			}
			interval = setInterval(check, 80);
			timeout = setTimeout(() => finish(null), 1200);
			check();
		});
		const nextFrame = () => new Promise((resolve) => {
			const frameWindow = host?.ownerDocument?.defaultView;
			if (typeof frameWindow?.requestAnimationFrame === 'function') frameWindow.requestAnimationFrame(() => resolve());
			else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
			else setTimeout(resolve, 0);
		});
		const makeInert = (element) => {
			element.setAttribute?.('inert', '');
			element.setAttribute?.('aria-hidden', 'true');
			for (const media of [element, ...(element.querySelectorAll?.('iframe,object,embed,video,audio,img') || [])]) {
				if (media.tagName === 'IFRAME') {
					media.setAttribute('sandbox', '');
					media.setAttribute('loading', 'lazy');
				} else if (media.tagName === 'VIDEO' || media.tagName === 'AUDIO') {
					media.setAttribute('preload', 'none');
					media.setAttribute('controls', 'false');
					media.setAttribute('autoplay', 'false');
				}
			}
		};
		try {
			const calibrationNode = findCalibrationNode() || await waitForCalibrationNode();
			if (!calibrationNode) return new Map();
			const calibrationSizer = this.liveSizing.getPreviewSizer(calibrationNode);
			const measurementDocument = calibrationSizer?.ownerDocument || document;
			if (!measurementDocument.body) return new Map();
			const calibrationCard = calibrationSizer.closest('.markdown-preview-view');
			const calibrationEmbedContent = calibrationCard.parentElement;
			const calibrationContent = calibrationCard.closest('.canvas-node-content') || calibrationNode.contentEl;
			if (!calibrationEmbedContent || !calibrationContent) return new Map();
			const calibrationChromeHeight = this.liveSizing.getPreviewChromeHeight(calibrationNode) || 0;
			const calibrationChromeWidth = this.liveSizing.getPreviewChromeWidth(calibrationNode) || 0;
			host = measurementDocument.createElement('div');
			host.className = 'tomindmap-measurement-host';
			Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', display: 'block' });
			measurementDocument.body.appendChild(host);
			component = new import_obsidian5.Component();
			component.load?.();
			if (measurementDocument.fonts?.ready)
				await Promise.race([measurementDocument.fonts.ready, new Promise((resolve) => setTimeout(resolve, 500))]);
			const result = new Map();
			for (const node of nodes) {
				if (!isCurrent()) return result;
				let shell = null;
				try {
					const estimated = this.getAutoNodeSize(node);
					const targetWidth = Math.max(minWidth, Math.min(maxWidth, Math.max(Number(node.width) || 0, estimated.width)));
					const initialHeight = String(node.text || '').trim() ? Math.max(1, Number(estimated.floorHeight) || 0) : fallbackHeight;
					shell = measurementDocument.createElement('div');
					shell.className = 'canvas-node tomindmap-measurement-node';
					Object.assign(shell.style, { position: 'relative', display: 'block', width: `${targetWidth}px`, height: 'auto', minHeight: '0', overflow: 'visible' });
					shell.style.setProperty('--canvas-node-width', `${targetWidth}px`);
					const content = calibrationContent.cloneNode(false);
					content.removeAttribute('id');
					content.removeAttribute('style');
					content.classList.add('canvas-node-content', 'markdown-embed');
					Object.assign(content.style, { width: '100%', height: 'auto', minHeight: '0', overflow: 'visible', position: 'relative' });
					const embedContent = calibrationEmbedContent.cloneNode(false);
					embedContent.removeAttribute('id');
					embedContent.removeAttribute('style');
					embedContent.classList.add('markdown-embed-content');
					Object.assign(embedContent.style, { height: 'auto', minHeight: '0', overflow: 'visible' });
					const card = calibrationCard.cloneNode(false);
					card.removeAttribute('id');
					card.removeAttribute('style');
					card.classList.add('markdown-preview-view', 'markdown-rendered');
					Object.assign(card.style, { height: 'auto', minHeight: '0', overflow: 'visible' });
					const sizer = calibrationSizer.cloneNode(false);
					sizer.removeAttribute('id');
					sizer.removeAttribute('style');
					sizer.classList.add('markdown-preview-sizer');
					Object.assign(sizer.style, { boxSizing: 'border-box', height: 'auto', minHeight: '0', overflow: 'visible', padding: 'var(--size-4-1)' });
					card.appendChild(sizer);
					embedContent.appendChild(card);
					content.appendChild(embedContent);
					shell.appendChild(content);
					makeInert(shell);
					host.appendChild(shell);
					await import_obsidian5.MarkdownRenderer.renderMarkdown(String(node.text || ''), sizer, sourcePath, component);
					this.liveSizing.applyPreviewGeometry(sizer);
					await nextFrame();
					const probed = [];
					const probe = (element, declarations) => {
						probed.push([element, element.getAttribute('style')]);
						for (const [property, value] of declarations) element.style.setProperty(property, value, 'important');
					};
					for (const table of sizer.querySelectorAll('table')) {
						probe(table, [['width', 'max-content'], ['max-width', 'none'], ['table-layout', 'auto']]);
						for (const cell of table.querySelectorAll('th, td'))
							probe(cell, [['max-width', 'none'], ['white-space', 'nowrap'], ['overflow', 'visible'], ['text-overflow', 'clip']]);
					}
					await nextFrame();
					let intrinsicWidth = estimated.contentKind === 'text' ? this.liveSizing.measureIntrinsicWidth(sizer) + calibrationChromeWidth : 0;
					for (const element of [sizer, ...sizer.querySelectorAll('*')]) {
						const tagName = String(element.tagName || '').toLowerCase();
						const clientWidth = Number(element.clientWidth || 0);
						const scrollWidth = Number(element.scrollWidth || 0);
						if (clientWidth > 0 && scrollWidth > clientWidth + 1) intrinsicWidth = Math.max(intrinsicWidth, targetWidth + scrollWidth - clientWidth);
						if (/^(?:table|img|video|audio|iframe|embed|object)$/.test(tagName)) intrinsicWidth = Math.max(intrinsicWidth, Number(element.scrollWidth || 0) + Math.max(0, targetWidth - Number(card.clientWidth || 0)), Number(element.offsetWidth || 0) + Math.max(0, targetWidth - Number(card.clientWidth || 0)));
					}
					for (const [element, styleText] of probed) {
						if (styleText === null) element.removeAttribute('style');
						else element.setAttribute('style', styleText);
					}
					let width = estimated.contentKind === 'text' ? Math.min(maxWidth, Math.max(minWidth, estimated.width)) : Math.min(maxWidth, Math.max(minWidth, estimated.width, Math.ceil(intrinsicWidth / 10) * 10 || 0));
					shell.style.width = `${width}px`;
					shell.style.setProperty('--canvas-node-width', `${width}px`);
					for (let pass = 0; pass < 4; pass++) {
						await nextFrame();
						const overflow = this.liveSizing.measureHorizontalOverflow(card);
						if (overflow <= 0 || width >= maxWidth) break;
						const nextWidth = Math.min(maxWidth, width + Math.ceil(overflow));
						if (nextWidth <= width) break;
						width = nextWidth;
						shell.style.width = `${width}px`;
						shell.style.setProperty('--canvas-node-width', `${width}px`);
					}
					const intrinsicHeight = this.liveSizing.measureIntrinsicHeight(sizer);
					const oneLineHeight = this.liveSizing.minimumTextHeight(sizer);
					const height = Math.min(maxHeight, Math.max(oneLineHeight, intrinsicHeight || this.liveSizing.measureContentHeight(sizer) || fallbackHeight) + calibrationChromeHeight);
					if (isCurrent()) result.set(node.id, { width: Math.round(width), height });
				} finally {
					shell?.remove();
				}
			}
			return result;
		} catch (error) {
			console.error('ToMindMap: off-screen Markdown measurement failed', error);
			return new Map();
		} finally {
			component?.unload?.();
			host?.remove();
		}
	}
	/**
	 * Imported Canvas cards exist before Obsidian has rendered their Markdown.
	 * Give them a useful estimated size immediately, then remeasure ready cards
	 * in one shared observer/timer queue and perform one coalesced final layout.
	 */
	resizeNodesWhenRendered(canvas, nodes, onSettled, layoutOptions = {}) {
		if (!canvas || !this.isMindmapCanvas(canvas)) {
			const result = {
				status: SIZING_STATUS.CANCELLED,
				canvas,
				requestedIds: [],
				measurements: new Map()
			};
			onSettled?.(result);
			return Promise.resolve(result);
		}
		return this.liveSizing.resizeNodesWhenRendered(
			canvas,
			nodes,
			onSettled,
			layoutOptions
		);
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
		this.selectAndEditTracked(canvas, newNode, this.settings.navigationZoomPadding);
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
	decodeMarkdownDocument(markdown, options = {}) {
		return MarkdownMindMapCodec.decodeMarkdownMindMap(markdown, {
			budgets: MarkdownMindMapCodec.DEFAULT_MARKDOWN_BUDGETS,
			...options
		});
	}
	layoutMarkdownDocument(markdown, options = {}) {
		return MarkdownMindMapCodec.layoutMarkdownMindMap(markdown, {
			...this.markdownLayoutOptions(),
			...options,
			layout: layoutTree
		});
	}
	encodeMarkdownDocument(canvas, options = {}) {
		return MarkdownMindMapCodec.encodeMindMapMarkdown(canvas, {
			...this.settings,
			...options
		});
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
	async confirmLegacyLink(kind, link) {
		const target = kind === 'parent' ? link?.canvas : link?.path;
		return new Promise((resolve) => {
			const modal = new import_obsidian5.Modal(this.app);
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				resolve(value);
				modal.close();
			};
			modal.onOpen = () => {
				modal.contentEl.empty();
				modal.contentEl.createEl('h2', { text: 'Confirm legacy mind-map link' });
				modal.contentEl.createEl('p', {
					text: `Allow ToMindMap to claim ${target || 'this untrusted link'}? A private ownership record and target metadata will be written only after confirmation.`
				});
				const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' });
				const cancel = actions.createEl('button', { text: 'Cancel' });
				const confirm = actions.createEl('button', { text: 'Adopt link', cls: 'mod-cta' });
				cancel.addEventListener('click', () => finish(false));
				confirm.addEventListener('click', () => finish(true));
			};
			modal.open();
		});
	}
	restoreOwnershipSnapshot(records = []) {
		const previousPaths = new Set(records.map((record) => record.canvasPath));
		for (const canvasPath of new Set(this.markdownOwnership.records.map((record) => record.canvasPath))) {
			if (!previousPaths.has(canvasPath)) this.markdownOwnership.removeCanvas(canvasPath);
		}
		for (const record of records) this.markdownOwnership.upsert(record, { replaceExisting: true });
	}
	restoreOwnershipRecords(canvasPath, records = []) {
		this.markdownOwnership.removeCanvas(canvasPath);
		for (const record of records) this.markdownOwnership.upsert(record, { replaceExisting: true });
	}
	async resolveMarkdownLinkForCanvas(canvas, { confirmLegacy = false } = {}) {
		const data = canvas?.getData?.() || {};
		const rawLink = data.mindmapMarkdownSync;
		const canvasPath = canvas?.view?.file?.path;
		if (!rawLink || !canvasPath) return { ok: false, reason: LINK_REASON.NO_LINK };
		let resolved = await resolveMarkdownSyncLink(
			rawLink,
			canvasPath,
			this.markdownOwnership,
			this.app.vault
		);
		if (!resolved.ok && resolved.reason === LINK_REASON.NEEDS_CONFIRMATION && confirmLegacy) {
			if (!(await this.confirmLegacyLink('markdown', rawLink)))
				return resolved;
			const adopted = await adoptMarkdownSyncLink(
				rawLink,
				canvasPath,
				this.markdownOwnership,
				this.app.vault,
				{ confirmed: true }
			);
			if (!adopted.ok) return adopted;
			const before = await this.app.vault.cachedRead(adopted.targetPatch.file);
			const previousRecords = this.markdownOwnership.recordsForCanvas(canvasPath);
			const previousLink = data.mindmapMarkdownSync;
			let targetPatched = false;
			try {
				await this.app.vault.process(adopted.targetPatch.file, (current) => {
					if (current !== before) throw new Error('Markdown target changed during adoption');
					targetPatched = true;
					return adopted.targetPatch.markdown;
				});
				const saved = this.markdownOwnership.upsert(adopted.registryRecord);
				if (!saved.ok) throw new Error('Ownership registry rejected the adoption');
				await this.persistPluginData();
				data.mindmapMarkdownSync = adopted.link;
				canvas.setData(data);
				canvas.requestSave();
				await flushCanvasView(canvas, this.app.vault);
				if (!this.indexMarkdownLink(canvasPath, adopted.link.path)) {
					throw new Error('Markdown sync index is full');
				}
				this.verifiedMarkdownLinks.set(canvasPath, adopted.link);
				resolved = { ok: true, link: adopted.link };
			} catch (error) {
				if (targetPatched) {
					try {
						await this.app.vault.process(adopted.targetPatch.file, (current) =>
							current === adopted.targetPatch.markdown ? before : current
						);
					} catch (_) {}
				}
				this.restoreOwnershipRecords(canvasPath, previousRecords);
				try { await this.persistPluginData(); } catch (_) {}
				try {
					data.mindmapMarkdownSync = previousLink;
					canvas.setData(data);
					canvas.requestSave?.();
					await flushCanvasView(canvas, this.app.vault);
				} catch (_) {}
				console.warn('ToMindMap: legacy Markdown adoption was not completed', error);
				return { ok: false, reason: LINK_REASON.FAILED, error };
			}
		}
		if (resolved.ok) {
			if (!this.indexMarkdownLink(canvasPath, resolved.link.path))
				return { ok: false, reason: LINK_REASON.FAILED };
			this.verifiedMarkdownLinks.set(canvasPath, resolved.link);
		}
		return resolved;
	}
	async resolveParentLinkForCanvas(canvas, parentLink, { confirmLegacy = false } = {}) {
		const childPath = canvas?.view?.file?.path;
		if (!parentLink || !childPath) return { ok: false, reason: LINK_REASON.NO_LINK };
		let resolved = await resolveParentLink(
			parentLink,
			childPath,
			this.markdownOwnership,
			this.app.vault
		);
		if (!resolved.ok && resolved.reason === LINK_REASON.NEEDS_CONFIRMATION && confirmLegacy) {
			if (!(await this.confirmLegacyLink('parent', parentLink))) return resolved;
			const adopted = await adoptParentLink(
				parentLink,
				childPath,
				this.markdownOwnership,
				this.app.vault,
				{ confirmed: true }
			);
			if (!adopted.ok) return adopted;
			const parentOpen = this.getOpenCanvasByPath(adopted.targetPatch.canvas);
			const applyParentPatch = (raw) => {
				const parentData = JSON.parse(raw);
				const card = (parentData.nodes || []).find((node) => node.id === adopted.targetPatch.nodeId);
				if (!card) return raw;
				card.unknownData = adopted.targetPatch.unknownDataPatch;
				return JSON.stringify(parentData, null, '\t');
			};
			const before = await this.app.vault.cachedRead(adopted.targetPatch.file);
			const previousRecords = this.markdownOwnership.recordsForCanvas(childPath);
			const childDataBefore = JSON.parse(JSON.stringify(canvas.getData()));
			const parentDataBefore = parentOpen?.getData?.();
			const parentCardBefore = parentOpen?.nodes?.get(adopted.targetPatch.nodeId)?.unknownData;
			let parentPatched = false;
			let parentAfter = null;
			try {
				if (parentOpen) {
					const parentData = parentOpen.getData();
					const card = parentOpen.nodes.get(adopted.targetPatch.nodeId);
					if (!card) throw new Error('Parent card disappeared');
					card.unknownData = adopted.targetPatch.unknownDataPatch;
					parentOpen.setData(parentData);
					parentOpen.requestSave();
					await flushCanvasView(parentOpen, this.app.vault);
					parentPatched = true;
				} else {
					await this.app.vault.process(adopted.targetPatch.file, (raw) => {
						if (raw !== before) throw new Error('Parent Canvas changed during adoption');
						parentPatched = true;
						parentAfter = applyParentPatch(raw);
						return parentAfter;
					});
				}
				const saved = this.markdownOwnership.upsert(adopted.registryRecord);
				if (!saved.ok) throw new Error('Ownership registry rejected the adoption');
				await this.persistPluginData();
				const childData = canvas.getData();
				childData.mindmapParent = adopted.link;
				canvas.setData(childData);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
				resolved = { ok: true, link: adopted.link };
			} catch (error) {
				if (parentPatched && !parentOpen) {
					try {
						await this.app.vault.process(adopted.targetPatch.file, (current) =>
							current === parentAfter ? before : current
						);
					} catch (_) {}
				}
				if (parentOpen && parentDataBefore) {
					try {
						parentOpen.setData(parentDataBefore);
						if (parentOpen.nodes?.has(adopted.targetPatch.nodeId))
							parentOpen.nodes.get(adopted.targetPatch.nodeId).unknownData = parentCardBefore;
						parentOpen.requestSave?.();
						await flushCanvasView(parentOpen, this.app.vault);
					} catch (_) {}
				}
				try {
					canvas.setData(childDataBefore);
					canvas.requestSave?.();
					await flushCanvasView(canvas, this.app.vault);
				} catch (_) {}
				this.restoreOwnershipRecords(childPath, previousRecords);
				try { await this.persistPluginData(); } catch (_) {}
				console.warn('ToMindMap: legacy parent-link adoption was not completed', error);
				return { ok: false, reason: LINK_REASON.FAILED, error };
			}
		}
		if (resolved.ok) this.verifiedParentLinks.set(childPath, resolved.link);
		return resolved;
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
		return this.markdownSyncIndex.markdownFor(canvasPath);
	}
	indexMarkdownLink(canvasPath, markdownPath) {
		if (!canvasPath || !markdownPath) return false;
		const previous = this.markdownSyncIndex.markdownFor(canvasPath);
		const linked = this.markdownSyncIndex.link(canvasPath, markdownPath);
		if (!linked && previous) this.markdownSyncIndex.link(canvasPath, previous);
		return linked;
	}
	unindexCanvas(canvasPath) {
		return this.markdownSyncIndex.unlink(canvasPath);
	}
	captureIndexSnapshot() {
		return Array.from(this.markdownSyncIndex.markdownByCanvas.entries());
	}
	restoreIndexSnapshot(snapshot) {
		this.markdownSyncIndex.clear();
		for (const [canvasPath, markdownPath] of snapshot)
			this.markdownSyncIndex.link(canvasPath, markdownPath);
	}
	async rebuildMarkdownSyncIndex() {
		this.markdownSyncIndex.clear();
		if (!this.markdownOwnership?.isValid?.()) return 0;
		const files = (this.app.vault.getFiles?.() || [])
			.filter((file) => file instanceof import_obsidian5.TFile && file.extension === 'canvas')
			.slice(0, 5000);
		let indexed = 0;
		for (let start = 0; start < files.length; start += 16) {
			const batch = files.slice(start, start + 16);
			const results = await Promise.all(batch.map(async (file) => {
				try {
					const data = JSON.parse(await this.app.vault.cachedRead(file));
					const rawLink = data?.mindmapMarkdownSync;
					if (!rawLink || typeof rawLink !== 'object') return false;
					const resolved = await resolveMarkdownSyncLink(
						rawLink,
						file.path,
						this.markdownOwnership,
						this.app.vault
					);
					if (!resolved.ok) return false;
					return this.indexMarkdownLink(file.path, resolved.link.path);
				} catch (_) {
					return false;
				}
			}));
			for (const result of results) if (result) indexed++;
		}
		return indexed;
	}
	scheduleCanvasToMarkdown(canvas) {
		if (this.syncApplyingCanvas.has(canvas)) return;
		void (async () => {
			try {
				const resolved = await this.resolveMarkdownLinkForCanvas(canvas);
				if (!resolved.ok) return;
				const file = canvas.view?.file;
				if (!file) return;
				const path = resolved.link.path;
				const pending = this.markdownModifyTimers.get(path);
				if (pending !== undefined) {
					clearTimeout(pending);
					this.markdownModifyTimers.delete(path);
				}
				void this.markdownSyncCoordinator.schedule(path, () =>
					this.writeCanvasToLinkedMarkdown(canvas, resolved.link)
				);
			} catch (error) {
				console.warn('ToMindMap: could not schedule Canvas-to-Markdown sync', error);
			}
		})();
	}
	async flushCanvasToMarkdown(canvas) {
		const file = canvas?.view?.file;
		if (!file) return { ok: false, reason: LINK_REASON.NO_LINK };
		const resolved = await this.resolveMarkdownLinkForCanvas(canvas);
		if (!resolved.ok) return resolved;
		return this.markdownSyncCoordinator.flush(resolved.link.path, () =>
			this.writeCanvasToLinkedMarkdown(canvas, resolved.link)
		);
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
			if (conflicted) {
				this.clearMarkdownWriteGuard(file.path);
				return { ok: false, reason: LINK_REASON.CONFLICT };
			}
			if (!changed) this.clearMarkdownWriteGuard(file.path);
			return { ok: true };
		} catch (error) {
			this.clearMarkdownWriteGuard(file.path);
			return { ok: false, reason: LINK_REASON.FAILED, error };
		}
	}
	async writeCanvasToLinkedMarkdown(canvas, resolvedLink = null) {
		const canvasPath = canvas?.view?.file?.path;
		if (!canvasPath) return { ok: false, reason: LINK_REASON.NO_LINK };
		const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
		if (!(canvasFile instanceof import_obsidian5.TFile))
			return { ok: false, reason: LINK_REASON.MISSING_TARGET };
		const owned = resolvedLink || await this.resolveMarkdownLinkForCanvas(canvas);
		if (!owned?.ok) return owned || { ok: false, reason: LINK_REASON.NO_LINK };
		const source = owned.link.file;
		const markdownPath = owned.link.path;
		if (!(source instanceof import_obsidian5.TFile)) {
			await this.detachMarkdownSync(canvas, false);
			new import_obsidian5.Notice('Markdown sync detached because the linked file no longer exists');
			return { ok: false, reason: LINK_REASON.MISSING_TARGET };
		}
		const groupIds = getGroupIds(canvas);
		const topicNodes = Array.from(canvas.nodes.values()).filter((node) => !groupIds.has(node.id));
		if (topicNodes.some((node) => node.isEditing))
			return { ok: false, reason: LINK_REASON.EDITING };
		let finalizedBlankTopic = false;
		for (const node of topicNodes) {
			if (isTextTopicCard(node, groupIds) && !String(node.text || '').trim()) {
				node.setText?.('Untitled');
				finalizedBlankTopic = true;
			}
		}
		if (finalizedBlankTopic) canvas.requestSave();
		try {
			const current = await this.app.vault.read(source);
			const decoded = this.layoutMarkdownDocument(current, this.markdownLayoutOptions());
			if (!decoded.ok) {
				new import_obsidian5.Notice(`Markdown sync skipped: ${decoded.reason}`);
				return;
			}
			const imported = decoded.value;
			const graphMatches = MarkdownMindMapCodec.canvasMatchesDocument(canvas, imported, canvasFile.path);
			const orderMatches = MarkdownMindMapCodec.canvasOrderMatchesDocument(canvas, imported);
			const orderWasChangedInCanvas = this.markdownOrderDirty.has(canvas);
			let markdown;
			if (graphMatches && (orderMatches || !orderWasChangedInCanvas)) {
				markdown = MarkdownMindMapCodec.markdownWithTopicMetadata(
					MarkdownMindMapCodec.withoutLegacyPluginComments(current),
					{
						topicIds: imported.topicIds || [],
						topicKeys: imported.topicKeys || [],
						topicLabels: imported.topicLabels || []
					}
				);
			} else {
				const plan = MarkdownMindMapCodec.planMarkdownSourceUpdate(
					current,
					canvas,
					imported,
					canvasFile.path
				);
				if (plan.ok) {
					const patched = this.layoutMarkdownDocument(plan.value.markdown, this.markdownLayoutOptions());
					if (
						patched.ok &&
						MarkdownMindMapCodec.canvasMatchesDocument(canvas, patched.value, canvasFile.path) &&
						(!orderWasChangedInCanvas || MarkdownMindMapCodec.canvasOrderMatchesDocument(canvas, patched.value))
					) markdown = plan.value.markdown;
				}
				if (!markdown) {
					const encoded = this.encodeMarkdownDocument(canvas, this.settings);
					if (!encoded.ok) {
						new import_obsidian5.Notice(`Could not encode the mind map: ${encoded.reason}`);
						return { ok: false, reason: encoded.reason };
					}
					markdown = encoded.value.markdown;
				}
			}
			if (markdown && orderWasChangedInCanvas) {
				const ordered = MarkdownMindMapCodec.planMarkdownTopicReorder(markdown, canvas);
				if (ordered.ok) {
					const verified = this.layoutMarkdownDocument(ordered.value.markdown, this.markdownLayoutOptions());
					if (
						verified.ok &&
						MarkdownMindMapCodec.canvasMatchesDocument(canvas, verified.value, canvasFile.path) &&
						MarkdownMindMapCodec.canvasOrderMatchesDocument(canvas, verified.value)
					) markdown = ordered.value.markdown;
				}
			}
			const verified = this.layoutMarkdownDocument(markdown || '', this.markdownLayoutOptions());
			if (!verified.ok || !MarkdownMindMapCodec.canvasMatchesDocument(canvas, verified.value, canvasFile.path))
				console.warn('ToMindMap: Markdown verification was unavailable; preserving the readable fallback');
			const written = await this.writeMarkdownFile(source, markdown, current);
			if (!written.ok) return written;
			if (!this.indexMarkdownLink(canvasFile.path, source.path))
				return { ok: false, reason: LINK_REASON.FAILED };
			this.markdownOrderDirty.delete(canvas);
			return { ok: true, link: owned.link };
		} catch (error) {
			console.error('ToMindMap: Canvas to Markdown sync failed', error);
			new import_obsidian5.Notice('Markdown sync could not access the linked file');
			return { ok: false, reason: LINK_REASON.FAILED, error };
		}
	}
	async attachMarkdownSync(canvas) {
		const canvasFile = canvas?.view?.file;
		if (!canvasFile) return { ok: false, reason: LINK_REASON.NO_LINK };
		const encoded = this.encodeMarkdownDocument(canvas, this.settings);
		if (!encoded.ok) {
			new import_obsidian5.Notice(`Could not encode the mind map: ${encoded.reason}`);
			return encoded;
		}
		const markdown = encoded.value.markdown;
		if (!markdown.trim()) {
			new import_obsidian5.Notice('Add at least one topic before enabling Markdown sync');
			return { ok: false, reason: LINK_REASON.NO_PENDING };
		}
		const folder = canvasFile.parent?.path || '';
		const markdownPath = allocateFilePath(
			folder,
			`${canvasFile.basename} Mindmap`,
			'md',
			(candidate) => !!this.app.vault.getAbstractFileByPath(candidate)
		);
		const syncId = createSyncId();
		const issued = this.markdownOwnership.issueRecord({
			canvasPath: canvasFile.path,
			kind: 'markdown',
			targetPath: markdownPath,
			syncId,
			nodeId: null
		});
		if (!syncId || !issued.ok) return issued;
		const patched = patchSyncIdOwnership(markdown, issued.record.syncId);
		if (!patched.ok) return patched;
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		const previousRecords = this.markdownOwnership.recordsForCanvas(canvasFile.path);
		const previousIndexedPath = this.getIndexedMarkdownPath(canvasFile.path);
		let created = null;
		try {
			created = await this.app.vault.create(markdownPath, patched.markdown);
			const upserted = this.markdownOwnership.upsert(issued.record);
			if (!upserted.ok) throw new Error(upserted.reason);
			await this.persistPluginData();
			const link = {
				path: created.path,
				syncId: issued.record.syncId,
				proof: issued.record.proof,
				ownership: { source: 'plugin-data' }
			};
			const data = canvas.getData();
			data.mindmapMarkdownSync = link;
			canvas.setData(data);
			canvas.requestSave();
			await flushCanvasView(canvas, this.app.vault);
			if (!this.indexMarkdownLink(canvasFile.path, created.path))
				throw new Error('Markdown sync index is full');
			this.verifiedMarkdownLinks.set(canvasFile.path, link);
			new import_obsidian5.Notice(`Syncing with "${created.path}"`);
			return { ok: true, link };
		} catch (error) {
			this.restoreOwnershipRecords(canvasFile.path, previousRecords);
			if (previousIndexedPath) this.markdownSyncIndex.link(canvasFile.path, previousIndexedPath);
			else this.unindexCanvas(canvasFile.path);
			this.verifiedMarkdownLinks.delete(canvasFile.path);
			try { await this.persistPluginData(); } catch (_) {}
			try {
				const currentData = canvas.getData?.();
				if (currentData && typeof currentData === 'object')
					delete currentData.mindmapMarkdownSync;
				canvas.setData({ ...beforeData });
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			if (created) {
				try { await this.app.vault.delete(created); } catch (_) {}
			}
			console.error('ToMindMap: could not create Markdown sync file', error);
			new import_obsidian5.Notice('Could not create the Markdown sync file');
			return { ok: false, reason: LINK_REASON.FAILED, error };
		}
	}
	async detachMarkdownSync(canvas, showNotice = true) {
		const canvasFile = canvas.view && canvas.view.file;
		const data = canvas.getData();
		const oldPath = this.getMarkdownSyncPath(data);
		if (!oldPath) return;
		delete data.mindmapMarkdownSync;
		canvas.setData(data);
		if (canvasFile) {
			this.unindexCanvas(canvasFile.path);
			const parentRecords = this.markdownOwnership.recordsForCanvas(canvasFile.path)
				.filter((record) => record.kind === 'parent');
			this.markdownOwnership.removeCanvas(canvasFile.path);
			for (const record of parentRecords)
				this.markdownOwnership.upsert(record, { replaceExisting: true });
			if (this.markdownSyncIndex.canvasesFor(oldPath).length === 0)
				this.markdownSyncCoordinator.detach(oldPath);
			this.verifiedMarkdownLinks.delete(canvasFile.path);
			await this.persistPluginData();
		}
		canvas.requestSave();
		if (showNotice)
			new import_obsidian5.Notice(
				'Markdown sync detached; neither file was deleted'
			);
	}
	scheduleMarkdownToCanvas(file) {
		void this.markdownSyncCoordinator.schedule(file.path, () =>
			this.syncMarkdownFileToCanvases(file)
		);
	}
	async syncMarkdownFileToCanvases(file) {
		const linkedCanvases = this.markdownSyncIndex.canvasesFor(file.path);
		if (linkedCanvases.length === 0) return { ok: true, skipped: true };
		const entries = [];
		for (const canvasPath of linkedCanvases) {
			const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
			if (!(canvasFile instanceof import_obsidian5.TFile)) {
				this.unindexCanvas(canvasPath);
				continue;
			}
			try {
				const raw = await this.app.vault.cachedRead(canvasFile);
				const data = JSON.parse(raw);
				const rawLink = data?.mindmapMarkdownSync;
				if (!rawLink || typeof rawLink !== 'object') continue;
				const owned = await resolveMarkdownSyncLink(
					rawLink,
					canvasPath,
					this.markdownOwnership,
					this.app.vault
				);
				if (!owned.ok) continue;
				entries.push({
					canvasPath,
					canvasFile,
					openCanvas: this.getOpenCanvasByPath(canvasPath),
					data,
					canvasRaw: raw,
					link: owned.link
				});
			} catch (_) {
				// A missing/malformed Canvas is isolated from the other reverse routes.
			}
		}
		if (entries.length === 0) return { ok: true, skipped: true };
		let markdown;
		try {
			markdown = await this.app.vault.read(file);
		} catch (_) {
			return { ok: false, reason: LINK_REASON.FAILED };
		}
		if (this.markdownWriteGuards.get(file.path) === markdown) {
			this.clearMarkdownWriteGuard(file.path);
			return { ok: true };
		}
		const decoded = this.layoutMarkdownDocument(markdown, this.markdownLayoutOptions());
		if (!decoded.ok) {
			new import_obsidian5.Notice(`Markdown sync skipped: ${decoded.reason}`);
			return decoded;
		}
		const imported = decoded.value;
		const failures = [];
		let retry = false;
		for (const entry of entries) {
			try {
				// Re-read and re-resolve after the asynchronous Markdown read. A
				// detached, renamed, or replaced link must never receive this
				// snapshot based on its old index entry.
				const currentRaw = entry.openCanvas
					? JSON.stringify(entry.openCanvas.getData())
					: await this.app.vault.cachedRead(entry.canvasFile);
				const currentData = entry.openCanvas
					? entry.openCanvas.getData()
					: JSON.parse(currentRaw);
				const currentLink = currentData?.mindmapMarkdownSync;
				const currentOwned = currentLink
					? await resolveMarkdownSyncLink(
							currentLink,
							entry.canvasPath,
							this.markdownOwnership,
							this.app.vault
						)
					: { ok: false, reason: LINK_REASON.NO_LINK };
				if (
					!currentOwned.ok ||
					currentOwned.link.path !== entry.link.path ||
					currentOwned.link.proof !== entry.link.proof
				) {
					retry = true;
					failures.push({ canvasPath: entry.canvasPath, reason: LINK_REASON.CONFLICT });
					continue;
				}
				entry.link = currentOwned.link;
				const incoming = {
					...imported,
					nodes: MarkdownMindMapCodec.convertMarkdownAnchorsToCardLinks(
						imported.nodes.map((node) => ({ ...node })),
						entry.canvasPath
					),
					edges: imported.edges.map((edge) => ({ ...edge }))
				};
				if (entry.openCanvas) {
					const result = await this.applyMarkdownToLiveCanvas(
						entry.openCanvas,
						markdown,
						incoming,
						entry.link
					);
					if (!result?.ok) {
						const reason = result?.reason || LINK_REASON.FAILED;
						retry = retry || reason === LINK_REASON.EDITING || reason === LINK_REASON.CONFLICT;
						failures.push({ canvasPath: entry.canvasPath, reason, error: result?.error });
					}
					continue;
				}
				let processConflict = false;
				await this.app.vault.process(entry.canvasFile, (raw) => {
					if (raw !== currentRaw) {
						processConflict = true;
						return raw;
					}
					const current = JSON.parse(raw);
					const adapter = MarkdownMindMapCodec.canvasDataAdapter(current, entry.canvasFile);
					const matches =
						MarkdownMindMapCodec.canvasMatchesDocument(adapter, incoming, entry.canvasPath) &&
						MarkdownMindMapCodec.canvasOrderMatchesDocument(adapter, incoming);
					const updated = matches
						? current
						: MarkdownMindMapCodec.reconcileCanvasData(current, incoming);
					updated.mindmapMarkdownSync = entry.link;
					return JSON.stringify(updated, null, '\t');
				});
				if (processConflict) {
					retry = true;
					failures.push({ canvasPath: entry.canvasPath, reason: LINK_REASON.CONFLICT });
				}
			} catch (error) {
				retry = retry || error?.reason === LINK_REASON.CONFLICT;
				failures.push({ canvasPath: entry.canvasPath, reason: error?.reason || LINK_REASON.FAILED, error });
			}
		}
		if (failures.length > 0)
			return { ok: false, reason: retry ? LINK_REASON.CONFLICT : LINK_REASON.FAILED, failures };
		const preserved = MarkdownMindMapCodec.markdownWithTopicMetadata(
			MarkdownMindMapCodec.withoutLegacyPluginComments(markdown),
			{
				topicIds: imported.topicIds || [],
				topicKeys: imported.topicKeys || [],
				topicLabels: imported.topicLabels || []
			}
		);
		if (preserved !== markdown) {
			const written = await this.writeMarkdownFile(file, preserved, markdown);
			if (!written.ok) return written;
		}
		return { ok: true };
	}
	async applyMarkdownToLiveCanvas(canvas, markdown, prepared, ownedLink = null) {
		const canvasFile = canvas.view && canvas.view.file;
		if (!canvasFile) return { ok: false, reason: LINK_REASON.NO_LINK };
		if (!ownedLink?.path || !ownedLink?.proof)
			return { ok: false, reason: LINK_REASON.UNOWNED_LINK };
		// A native file drop copies data into the vault before the Canvas card can
		// be imported. Never let an older Markdown snapshot reconcile during that
		// asynchronous window, or while its Canvas-to-Markdown save is queued.
		if (
			this.localCanvasMutations.has(canvas) ||
			this.markdownSyncTimers.has(canvasFile.path) ||
			this.markdownSyncCoordinator.entries?.get(ownedLink.path)?.pending
		) {
			return { ok: false, reason: LINK_REASON.EDITING };
		}
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		const currentLink = beforeData?.mindmapMarkdownSync;
		const currentOwned = currentLink
			? await resolveMarkdownSyncLink(
					currentLink,
					canvasFile.path,
					this.markdownOwnership,
					this.app.vault
				)
			: { ok: false, reason: LINK_REASON.UNOWNED_LINK };
		if (
			!currentOwned.ok ||
			currentOwned.link.path !== ownedLink.path ||
			currentOwned.link.proof !== ownedLink.proof
		)
			return { ok: false, reason: LINK_REASON.CONFLICT };
		ownedLink = currentOwned.link;
		let imported;
		if (prepared) {
			imported = {
				...prepared,
				nodes: prepared.nodes.map((node) => ({ ...node })),
				edges: prepared.edges.map((edge) => ({ ...edge }))
			};
		} else {
			const decoded = this.layoutMarkdownDocument(
				markdown,
				this.markdownLayoutOptions()
			);
			if (!decoded.ok) return decoded;
			imported = decoded.value;
		}
		imported.nodes = MarkdownMindMapCodec.convertMarkdownAnchorsToCardLinks(
			imported.nodes,
			canvasFile.path
		);
		if (
			MarkdownMindMapCodec.canvasMatchesDocument(canvas, imported, canvasFile.path) &&
			MarkdownMindMapCodec.canvasOrderMatchesDocument(canvas, imported)
		) {
			if (this.isMindmapCanvas(canvas)) {
				this.layoutEngine.layout(canvas);
				this.updateGroupBounds(canvas);
			}
			this.refreshOutline(canvas);
			return { ok: true, unchanged: true };
		}
		const selected =
			canvas.selection && canvas.selection.size === 1
				? canvas.selection.values().next().value
				: null;
		const reconciled = MarkdownMindMapCodec.reconcileCanvasData(canvas.getData(), imported);
		const pendingResizeIds = new Set(
			Array.isArray(reconciled.mindmapPendingResize)
				? reconciled.mindmapPendingResize
				: []
		);
		reconciled.mindmapMarkdownSync = ownedLink;
		this.syncApplyingCanvas.add(canvas);
		try {
			canvas.setData(reconciled);
			this.canvasApi.invalidateEdgeIndex();
			if (this.isMindmapCanvas(canvas))
				MindmapActions.syncCollapsedVisibility(canvas);
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
			return { ok: true };
		} catch (error) {
			try {
				canvas.setData(beforeData);
				this.canvasApi.invalidateEdgeIndex();
				if (this.isMindmapCanvas(canvas)) MindmapActions.syncCollapsedVisibility(canvas);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			return { ok: false, reason: LINK_REASON.FAILED, error };
		} finally {
			this.syncApplyingCanvas.delete(canvas);
		}
	}
	async snapshotCanvasState(canvasPath) {
		const open = this.getOpenCanvasByPath(canvasPath);
		if (open) return { canvasPath, open, data: JSON.parse(JSON.stringify(open.getData())) };
		const file = this.app.vault.getAbstractFileByPath(canvasPath);
		if (!(file instanceof import_obsidian5.TFile)) return { canvasPath, file: null, raw: null };
		return { canvasPath, file, raw: await this.app.vault.cachedRead(file) };
	}
	async restoreCanvasState(snapshot) {
		if (!snapshot) return;
		try {
			if (snapshot.open) {
				snapshot.open.setData(snapshot.data);
				snapshot.open.requestSave?.();
				await flushCanvasView(snapshot.open, this.app.vault);
				return;
			}
			if (snapshot.file && typeof snapshot.raw === 'string') {
				await this.app.vault.process(snapshot.file, (current) =>
					current === snapshot.raw ? current : snapshot.raw
				);
			}
		} catch (_) {}
	}
	async updateCanvasLinkMetadata(canvasPath, kind, link) {
		const key = kind === 'parent' ? 'mindmapParent' : 'mindmapMarkdownSync';
		const openCanvas = this.getOpenCanvasByPath(canvasPath);
		if (openCanvas) {
			const data = openCanvas.getData();
			if (link) data[key] = link;
			else delete data[key];
			openCanvas.setData(data);
			openCanvas.requestSave();
			await flushCanvasView(openCanvas, this.app.vault);
			return { ok: true };
		}
		const file = this.app.vault.getAbstractFileByPath(canvasPath);
		if (!(file instanceof import_obsidian5.TFile)) return { ok: false, reason: LINK_REASON.MISSING_TARGET };
		let changed = false;
		await this.app.vault.process(file, (raw) => {
			try {
				const data = JSON.parse(raw);
				if (link) data[key] = link;
				else delete data[key];
				changed = true;
				return JSON.stringify(data, null, '\t');
			} catch (_) {
				return raw;
			}
		});
		return changed ? { ok: true } : { ok: false, reason: LINK_REASON.FAILED };
	}
	async updateCanvasSyncMetadata(canvasPath, markdownLink, { expectedRaw = null, expectedData = null } = {}) {
		const link = markdownLink && typeof markdownLink === 'object'
			? { ...markdownLink }
			: null;
		const openCanvas = this.getOpenCanvasByPath(canvasPath);
		if (openCanvas) {
			this.syncApplyingCanvas.add(openCanvas);
			try {
				const data = openCanvas.getData();
				if (expectedData !== null && JSON.stringify(data) !== expectedData) {
					const error = new Error('Canvas changed during sync metadata update');
					error.reason = LINK_REASON.CONFLICT;
					throw error;
				}
				if (link) data.mindmapMarkdownSync = link;
				else delete data.mindmapMarkdownSync;
				openCanvas.setData(data);
				openCanvas.requestSave();
				await flushCanvasView(openCanvas, this.app.vault);
			} finally {
				this.syncApplyingCanvas.delete(openCanvas);
			}
			return { ok: true };
		}
		const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
		if (!(canvasFile instanceof import_obsidian5.TFile))
			return { ok: false, reason: LINK_REASON.MISSING_TARGET };
		let changed = false;
		await this.app.vault.process(canvasFile, (raw) => {
			if (expectedRaw !== null && raw !== expectedRaw) {
				const error = new Error('Canvas changed during sync metadata update');
				error.reason = LINK_REASON.CONFLICT;
				throw error;
			}
			try {
				const data = JSON.parse(raw);
				if (link) data.mindmapMarkdownSync = link;
				else delete data.mindmapMarkdownSync;
				changed = true;
				return JSON.stringify(data, null, '\t');
			} catch (_) {
				return raw;
			}
		});
		return changed ? { ok: true } : { ok: false, reason: LINK_REASON.FAILED };
	}
	async updateNestedParentReferences(oldPath, newPath) {
		if (!oldPath || !newPath || oldPath === newPath) return;
		const parentRecords = this.markdownOwnership.records.filter(
			(record) => record.kind === 'parent' && record.targetPath === oldPath
		);
		const migratedLinks = new Map();
		for (const record of parentRecords) {
			const issued = this.markdownOwnership.issueRecord({
				canvasPath: record.canvasPath,
				kind: 'parent',
				targetPath: newPath,
				syncId: record.syncId,
				nodeId: record.nodeId
			});
			if (!issued.ok) continue;
			const upserted = this.markdownOwnership.upsert(issued.record, { replaceExisting: true });
			if (!upserted.ok) continue;
			migratedLinks.set(record.canvasPath, {
				canvas: newPath,
				nodeId: record.nodeId,
				syncId: issued.record.syncId,
				proof: issued.record.proof,
				ownership: { source: 'plugin-data' }
			});
		}
		const canvasFiles = (this.app.vault.getFiles?.() || []).filter(
			(file) => file instanceof import_obsidian5.TFile && file.extension === 'canvas'
		);
		for (const file of canvasFiles) {
			const openCanvas = this.getOpenCanvasByPath(file.path);
			try {
				const data = openCanvas
					? openCanvas.getData()
					: JSON.parse(await this.app.vault.cachedRead(file));
				const rawParent = data.mindmapParent;
				if (!rawParent || (rawParent.canvas !== oldPath && !migratedLinks.has(file.path))) continue;
				const link = migratedLinks.get(file.path) || rawParent;
				const resolved = await resolveParentLink(
					link,
					file.path,
					this.markdownOwnership,
					this.app.vault
				);
				if (!resolved.ok) continue;
				const nextParent = {
					canvas: newPath,
					nodeId: resolved.link.nodeId,
					syncId: resolved.link.syncId,
					proof: resolved.link.proof,
					ownership: resolved.link.ownership
				};
				if (openCanvas) {
					data.mindmapParent = nextParent;
					openCanvas.setData(data);
					openCanvas.requestSave();
				} else {
					await this.app.vault.process(file, (raw) => {
						const current = JSON.parse(raw);
						if (current.mindmapParent?.canvas !== oldPath) return raw;
						current.mindmapParent = nextParent;
						return JSON.stringify(current, null, '\t');
					});
				}
			} catch (error) {
				console.warn(`ToMindMap: could not update parent link in ${file.path}`, error);
			}
		}
		if (migratedLinks.size > 0) await this.persistPluginData();
	}
	async handleSyncedFileRename(file, oldPath) {
		if (file instanceof import_obsidian5.TFile && file.extension === 'canvas') {
			const previousRecords = this.markdownOwnership.recordsForCanvas(oldPath);
			const previousAllRecords = this.markdownOwnership.records.map((record) => ({ ...record }));
			const previousIndex = this.captureIndexSnapshot();
			const previousCanvas = await this.snapshotCanvasState(file.path);
			const previousVerifiedMarkdown = this.verifiedMarkdownLinks.get(oldPath);
			const previousVerifiedParent = this.verifiedParentLinks.get(oldPath);
			try {
				const migration = this.markdownOwnership.renameCanvas(oldPath, file.path);
				if (!migration.ok) return;
				const links = [
					...(migration.links || []),
					...(migration.parentLinks || [])
				];
				for (const link of links) {
					const kind = link.canvas ? 'parent' : 'markdown';
					const result = await this.updateCanvasLinkMetadata(file.path, kind, link);
					if (!result.ok) throw new Error(`Canvas metadata migration failed: ${result.reason}`);
				}
				await this.persistPluginData();
				if (previousVerifiedMarkdown) this.verifiedMarkdownLinks.set(file.path, migration.links?.[0] || null);
				if (previousVerifiedParent) this.verifiedParentLinks.set(file.path, migration.parentLinks?.[0] || null);
				if (this.markdownSyncIndex.markdownFor(oldPath))
					this.markdownSyncIndex.renameCanvas(oldPath, file.path);
				await this.updateNestedParentReferences(oldPath, file.path);
			} catch (error) {
				this.restoreOwnershipSnapshot(previousAllRecords);
				this.restoreIndexSnapshot(previousIndex);
				if (previousVerifiedMarkdown) this.verifiedMarkdownLinks.set(oldPath, previousVerifiedMarkdown);
				else this.verifiedMarkdownLinks.delete(oldPath);
				if (previousVerifiedParent) this.verifiedParentLinks.set(oldPath, previousVerifiedParent);
				else this.verifiedParentLinks.delete(oldPath);
				await this.restoreCanvasState(previousCanvas);
				try { await this.persistPluginData(); } catch (_) {}
				console.warn('ToMindMap: Canvas rename transaction rolled back', error);
			}
			return;
		}
		const canvasPaths = this.markdownSyncIndex.canvasesFor(oldPath);
		if (canvasPaths.length === 0) return;
		const previousRecords = this.markdownOwnership.records.map((record) => ({ ...record }));
		const previousIndex = this.captureIndexSnapshot();
		const previousVerified = new Map(canvasPaths.map((path) => [path, this.verifiedMarkdownLinks.get(path)]));
		const snapshots = new Map();
		try {
			const updates = [];
			for (const canvasPath of canvasPaths) {
				const record = this.markdownOwnership.recordsForCanvas(canvasPath).find(
					(candidate) => candidate.kind === 'markdown' && candidate.targetPath === oldPath
				);
				if (!record) throw new Error(`Ownership record missing for ${canvasPath}`);
				const issued = this.markdownOwnership.issueRecord({
					canvasPath,
					kind: 'markdown',
					targetPath: file.path,
					syncId: record.syncId,
					nodeId: null
				});
				if (!issued.ok) throw issued;
				const upserted = this.markdownOwnership.upsert(issued.record, { replaceExisting: true });
				if (!upserted.ok) throw upserted;
				const link = {
					path: file.path,
					syncId: issued.record.syncId,
					proof: issued.record.proof,
					ownership: { source: 'plugin-data' }
				};
				snapshots.set(canvasPath, await this.snapshotCanvasState(canvasPath));
				const updated = await this.updateCanvasSyncMetadata(canvasPath, link);
				if (!updated.ok) throw updated;
				updates.push({ canvasPath, link });
			}
			await this.persistPluginData();
			if (!this.markdownSyncIndex.renameMarkdown(oldPath, file.path))
				throw new Error('Markdown index route could not be renamed');
			this.markdownSyncCoordinator.rename(oldPath, file.path);
			for (const { canvasPath, link } of updates)
				this.verifiedMarkdownLinks.set(canvasPath, link);
			if (this.markdownWriteGuards.has(oldPath)) {
				const guardedContent = this.markdownWriteGuards.get(oldPath);
				this.clearMarkdownWriteGuard(oldPath);
				this.setMarkdownWriteGuard(file.path, guardedContent);
			}
		} catch (error) {
			this.restoreOwnershipSnapshot(previousRecords);
			this.restoreIndexSnapshot(previousIndex);
			for (const [canvasPath, link] of previousVerified) {
				if (link) this.verifiedMarkdownLinks.set(canvasPath, link);
				else this.verifiedMarkdownLinks.delete(canvasPath);
			}
			for (const snapshot of snapshots.values()) await this.restoreCanvasState(snapshot);
			try { await this.persistPluginData(); } catch (_) {}
			console.warn('ToMindMap: Markdown rename transaction rolled back', error);
		}
	}
	findMostRecentNestedMapForNode(canvas, node) {
		const filePath = canvasNodeFilePath(node);
		const currentFile = filePath ? this.app.vault.getAbstractFileByPath(filePath) : null;
		const parentPath = canvasPathFor(canvas);
		if (typeof this.app.vault.getFiles !== 'function') {
			return currentFile instanceof import_obsidian5.TFile ? currentFile : null;
		}
		const title = titleOnlyCardTitle(node) || node.text || '';
		const folder = canvasFolderPath(canvas);
		const candidates = [];
		if (currentFile instanceof import_obsidian5.TFile) {
			candidates.push(currentFile);
		}
		const allCanvasFiles = this.app.vault
			.getFiles()
			.filter((f) => f.extension === 'canvas' && f.path !== parentPath);

		for (const f of allCanvasFiles) {
			if (currentFile && f.path === currentFile.path) continue;
			const isSameFolder = !folder || f.path.startsWith(folder + '/');
			const base = f.basename;
			const matchesTitle = title && (base === title || base.startsWith(title + ' '));
			if (isSameFolder && matchesTitle) {
				candidates.push(f);
			}
		}

		if (candidates.length <= 1) {
			return currentFile instanceof import_obsidian5.TFile ? currentFile : candidates[0] || null;
		}

		candidates.sort((a, b) => {
			const timeA = a.stat?.ctime || a.stat?.mtime || 0;
			const timeB = b.stat?.ctime || b.stat?.mtime || 0;
			return timeB - timeA;
		});

		const newest = candidates[0];
		if (currentFile && newest.path !== currentFile.path) {
			if (typeof node.setFilePath === 'function') {
				node.setFilePath(newest.path, node.subpath || '');
			} else if (typeof node.setFile === 'function') {
				node.setFile(newest, '');
			} else {
				node.file = newest.path;
				node.filePath = newest.path;
			}
			canvas.requestSave?.();
		}
		return newest;
	}

	async convertLinkedNodeToNormalTopic(canvas, node) {
		if (
			!canvas ||
			!node ||
			!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY] ||
			!canvasNodeFilePath(node)
		)
			return false;
		const isNestedMap = canvasNodeUnknownData(node)[TOMINMAP_CARD_KIND] === 'nested-map';
		let filePath = canvasNodeFilePath(node);
		let targetFile = this.app.vault.getAbstractFileByPath(filePath);
		if (isNestedMap && typeof this.findMostRecentNestedMapForNode === 'function') {
			const mostRecent = this.findMostRecentNestedMapForNode(canvas, node);
			if (mostRecent) {
				targetFile = mostRecent;
				filePath = mostRecent.path;
			}
		}
		const oldData = { ...canvasNodeUnknownData(node) };
		const title = titleOnlyCardTitle(node);
		const importedIds = [];
		let replacementRoot = null;
		try {
			let sourceData = null;
			if (targetFile instanceof import_obsidian5.TFile) {
				const raw = await this.app.vault.cachedRead(targetFile);
				if (String(filePath).toLowerCase().endsWith('.canvas')) {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed?.nodes)) sourceData = parsed;
				} else if (String(filePath).toLowerCase().endsWith('.md')) {
					const decoded = this.layoutMarkdownDocument(
						raw,
						this.markdownLayoutOptions()
					);
					if (!decoded.ok) throw new Error(`Markdown decode failed: ${decoded.reason}`);
					sourceData = decoded.value;
				}
			}
			if (sourceData?.nodes?.length) {
				const remappedResult = MindmapActions.remapLinkedCanvasData(
					sourceData,
					node,
					new Set(canvas.nodes.keys()),
					() => genId()
				);
				if (!remappedResult.ok) throw new Error(`Linked map decode failed: ${remappedResult.reason}`);
				const remapped = remappedResult.value;
				const sourceRoot = remapped.nodes.find(
					(item) => item.id === remapped.rootId
				);
				if (sourceRoot) {
					if (
						sourceRoot.type === 'file' ||
						sourceRoot.file ||
						sourceRoot.filePath ||
						sourceRoot.url
					) {
						sourceRoot.type = 'text';
						sourceRoot.text = sourceRoot.text || title;
						delete sourceRoot.file;
						delete sourceRoot.filePath;
						delete sourceRoot.subpath;
						delete sourceRoot.url;
					}
					if (!sourceRoot.text) sourceRoot.text = title;
					sourceRoot.unknownData = {
						...(sourceRoot.unknownData || {})
					};
					delete sourceRoot.unknownData[TOMINMAP_TITLE_ONLY];
					delete sourceRoot.unknownData[TOMINMAP_CARD_KIND];
					delete sourceRoot.unknownData[TOMINMAP_CARD_TITLE];
					delete sourceRoot.unknownData.file;
					delete sourceRoot[TOMINMAP_TITLE_ONLY];
					delete sourceRoot[TOMINMAP_CARD_KIND];
					delete sourceRoot[TOMINMAP_CARD_TITLE];
				}
				canvas.importData({
					nodes: remapped.nodes,
					edges: remapped.edges
				});
				importedIds.push(...remapped.nodes.map((item) => item.id));
				replacementRoot = remapped.rootId
					? canvas.nodes.get(remapped.rootId)
					: null;
				if (!replacementRoot) {
					throw new Error('Linked content did not produce a root card');
				}
			}
			if (!replacementRoot) {
				replacementRoot = this.canvasApi.createTextNode(
					canvas,
					Number(node.x) || 0,
					Number(node.y) || 0,
					title,
					Number(node.width) || this.settings.defaultNodeWidth,
					Number(node.height) || this.settings.defaultNodeHeight
				);
			}
			if (!replacementRoot) return false;
			if (isNestedMap) {
				setCanvasNodeUnknownData(replacementRoot, {
					collapsed: false
				});
				setCanvasNodeCollapsedClass(replacementRoot, false);
			} else if (oldData.collapsed !== undefined) {
				setCanvasNodeUnknownData(replacementRoot, {
					collapsed: oldData.collapsed
				});
			}
			if (node.color && typeof replacementRoot.setColor === 'function')
				replacementRoot.setColor(node.color);
			const replacements = new Map([[node.id, replacementRoot]]);
			this.cloneEdgesAroundReplacedNodes(
				canvas,
				[node],
				replacements,
				true
			);
			const wasSelected = canvas.selection?.has?.(node);
			this.canvasApi.removeNode(canvas, node);
			this.canvasApi.invalidateEdgeIndex();
			if (wasSelected) {
				canvas.deselectAll?.();
				canvas.select?.(replacementRoot);
			}
			MindmapActions.syncCollapsedVisibility(canvas);
			if (this.isMindmapCanvas(canvas)) {
				this.layoutEngine.layout(canvas, { preserveRootSides: true });
				if (this.settings.autoColor) this.branchColors.applyColors(canvas);
				const importedTextNodes = importedIds
					.map((id) => canvas.nodes.get(id))
					.filter((item) => item && !item.file && !item.url);
				if (importedTextNodes.length > 0)
					this.resizeNodesWhenRendered(
						canvas,
						importedTextNodes,
						null,
						{ preserveRootSides: true }
					);
			}
			this.updateNodeTypeAttributes(canvas);
			this.updateGroupBounds(canvas);
			this.markMarkdownOrderDirty(canvas);
			canvas.requestSave();
			this.refreshOutline(canvas);

			if (
				(isNestedMap || String(filePath).toLowerCase().endsWith('.canvas')) &&
				targetFile instanceof import_obsidian5.TFile
			) {
				try {
					if (typeof this.app.vault.trash === 'function') {
						await this.app.vault.trash(targetFile, true);
					} else if (typeof this.app.vault.delete === 'function') {
						await this.app.vault.delete(targetFile);
					}
				} catch (fileErr) {
					console.warn('ToMindMap: could not trash expanded nested mind map file', fileErr);
				}
				try {
					this.markdownOwnership.removeCanvas(filePath);
					const parentCanvasPath = canvasPathFor(canvas);
					if (typeof this.app.vault.getFiles === 'function') {
						const folder = canvasFolderPath(canvas);
						const remainingDuplicates = this.app.vault
							.getFiles()
							.filter(
								(f) =>
									f.extension === 'canvas' &&
									f.path !== parentCanvasPath &&
									f.path !== filePath &&
									(!folder || f.path.startsWith(folder + '/')) &&
									title &&
									(f.basename === title || f.basename.startsWith(title + ' '))
							);
						for (const dup of remainingDuplicates) {
							try {
								const rawDup = await this.app.vault.cachedRead(dup);
								const parsedDup = JSON.parse(rawDup);
								if (parsedDup?.mindmapParent?.canvas === parentCanvasPath) {
									if (typeof this.app.vault.trash === 'function') {
										await this.app.vault.trash(dup, true);
									} else if (typeof this.app.vault.delete === 'function') {
										await this.app.vault.delete(dup);
									}
									this.markdownOwnership.removeCanvas(dup.path);
								}
							} catch (_) {}
						}
					}
					await this.persistPluginData();
				} catch (regErr) {
					console.warn('ToMindMap: could not clean up ownership for expanded nested map', regErr);
				}
			}

			new import_obsidian5.Notice(
				targetFile
					? 'Expanded the linked content into a normal mind map'
					: 'Converted the missing link to a normal topic'
			);
			return true;
		} catch (error) {
			console.error('ToMindMap: linked-content conversion failed', error);
			for (const id of importedIds) {
				try {
					const importedNode = canvas.nodes.get(id);
					if (importedNode) this.canvasApi.removeNode(canvas, importedNode);
				} catch (_) {}
			}
			new import_obsidian5.Notice('Could not convert the linked content');
			return false;
		}
	}

	async handleSyncedFileDelete(file) {
		const path = file.path;
		const canvasPaths = this.markdownSyncIndex.canvasesFor(path);
		if (canvasPaths.length > 0) {
			const previousRecords = this.markdownOwnership.records.map((record) => ({ ...record }));
			const previousIndex = this.captureIndexSnapshot();
			const previousVerified = new Map(
				canvasPaths.map((canvasPath) => [canvasPath, this.verifiedMarkdownLinks.get(canvasPath)])
			);
			const snapshots = new Map();
			try {
				// Preflight every owner and capture exact bytes before the first write.
				for (const canvasPath of canvasPaths) {
					const record = this.markdownOwnership.recordsForCanvas(canvasPath).find(
						(candidate) => candidate.kind === 'markdown' && candidate.targetPath === path
					);
					if (!record) throw new Error(`Ownership record missing for ${canvasPath}`);
					snapshots.set(canvasPath, await this.snapshotCanvasState(canvasPath));
				}
				for (const canvasPath of canvasPaths) {
					const snapshot = snapshots.get(canvasPath);
					const result = await this.updateCanvasSyncMetadata(
						canvasPath,
						null,
						snapshot.open
							? { expectedData: JSON.stringify(snapshot.data) }
							: { expectedRaw: snapshot.raw }
					);
					if (!result.ok) throw result;
					const parentRecords = this.markdownOwnership.recordsForCanvas(canvasPath)
						.filter((record) => record.kind === 'parent');
					this.markdownOwnership.removeCanvas(canvasPath);
					for (const record of parentRecords)
						this.markdownOwnership.upsert(record, { replaceExisting: true });
				}
				await this.persistPluginData();
				for (const canvasPath of canvasPaths) this.unindexCanvas(canvasPath);
				this.markdownSyncCoordinator.detach(path);
				for (const canvasPath of canvasPaths) this.verifiedMarkdownLinks.delete(canvasPath);
				new import_obsidian5.Notice('Markdown sync detached because the linked file was deleted');
			} catch (error) {
				for (const snapshot of snapshots.values()) await this.restoreCanvasState(snapshot);
				this.restoreOwnershipSnapshot(previousRecords);
				this.restoreIndexSnapshot(previousIndex);
				for (const [canvasPath, link] of previousVerified) {
					if (link) this.verifiedMarkdownLinks.set(canvasPath, link);
					else this.verifiedMarkdownLinks.delete(canvasPath);
				}
				try { await this.persistPluginData(); } catch (_) {}
				console.warn('ToMindMap: Markdown delete transaction rolled back', error);
			}
			return;
		}
		if (String(path).toLowerCase().endsWith('.canvas')) {
			const previousRecords = this.markdownOwnership.records.map((record) => ({ ...record }));
			const previousIndex = this.captureIndexSnapshot();
			try {
				this.markdownOwnership.removeCanvas(path);
				this.unindexCanvas(path);
				await this.persistPluginData();
			} catch (error) {
				this.restoreOwnershipSnapshot(previousRecords);
				this.restoreIndexSnapshot(previousIndex);
				try { await this.persistPluginData(); } catch (_) {}
				console.warn('ToMindMap: deleted Canvas ownership rollback failed', error);
			}
		}
	}
	async createCleanNoteForTopic(canvas, node, title, content = '') {
		const folder = canvasFolderPath(canvas);
		const path = MindmapActions.nextTopicFilePath(
			folder,
			title,
			'md',
			(candidate) => !!this.app.vault.getAbstractFileByPath(candidate)
		);
		return this.app.vault.create(path, content);
	}

	createTitleOnlyFileCard(canvas, file, sourceNode, kind, title) {
		const width = Number(sourceNode?.width) || this.settings.defaultNodeWidth;
		const height =
			Number(sourceNode?.height) || this.settings.defaultNodeHeight;
		const targetX = Number(sourceNode?.x) || 0;
		const targetY = Number(sourceNode?.y) || 0;
		const card = this.canvasApi.createFileNode(
			canvas,
			file,
			targetX,
			targetY,
			width,
			height
		);
		if (!card) throw new Error('Canvas could not create a file card');
		if (typeof card.moveAndResize === 'function') {
			card.moveAndResize({ x: targetX, y: targetY, width, height });
		} else if (typeof card.moveTo === 'function') {
			card.moveTo({ x: targetX, y: targetY });
			card.width = width;
			card.height = height;
		}
		const sourceData = canvasNodeUnknownData(sourceNode);
		const isSubtreeConverted = kind === 'nested-map' || kind === 'branch-note';
		const patch = {
			...(!isSubtreeConverted && sourceData.collapsed !== undefined
				? { collapsed: sourceData.collapsed }
				: { collapsed: false })
		};
		setCanvasNodeUnknownData(card, patch);
		if (isSubtreeConverted) {
			setCanvasNodeCollapsedClass(card, false);
		}
		if (sourceNode?.color && typeof card.setColor === 'function')
			card.setColor(sourceNode.color);
		applyTitleOnlyCardMarker(card, kind, title);
		return card;
	}

	cloneEdgesAroundReplacedNodes(
		canvas,
		oldNodes,
		replacements,
		includeInternal,
		onlyNodeId = null
	) {
		const oldIds = new Set(oldNodes.map((node) => node.id));
		const edges = Array.from(canvas.edges?.values?.() || []);
		for (const edge of edges) {
			const fromId = edge.from?.node?.id;
			const toId = edge.to?.node?.id;
			const touchesOld = onlyNodeId
				? fromId === onlyNodeId || toId === onlyNodeId
				: oldIds.has(fromId) || oldIds.has(toId);
			if (!touchesOld) continue;
			if (!includeInternal && oldIds.has(fromId) && oldIds.has(toId))
				continue;
			const cloned = this.canvasApi.cloneEdge(canvas, edge, replacements);
			if (!cloned) throw new Error('Canvas did not create a replacement edge');
			const clonedFromId = cloned.from?.node?.id;
			const clonedToId = cloned.to?.node?.id;
			if (!clonedFromId || !clonedToId) throw new Error('Replacement edge is missing an endpoint');
		}
		return edges.length;
	}

	async convertTopicBranchToMarkdownFile(canvas, node) {
		if (!canvas || !node || !nodeIsConvertibleTopic(canvas, node)) {
			new import_obsidian5.Notice('Select a text topic to convert');
			return [];
		}
		const forest = buildForest(canvas);
		const treeNode = findTreeForNode(forest, node.id);
		if (!treeNode) return [];
		const branch = MindmapActions.getTopicBranch(forest, node, true).map(
			(item) => item.canvasNode
		);
		const title = MindmapActions.topicTitleFromNode(node);
		const encoded = this.encodeMarkdownDocument(canvas, {
			includeFrontmatter: false,
			rootTrees: [treeNode]
		});
		if (!encoded.ok) throw new Error(`Markdown encode failed: ${encoded.reason}`);
		const content = encoded.value.markdown.trim()
			? encoded.value.markdown
			: `# ${title}\n`;
		let file = null;
		let card = null;
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		try {
			const targetX = Number(node?.x) || 0;
			const targetY = Number(node?.y) || 0;
			const targetWidth = Number(node?.width) || this.settings.defaultNodeWidth;
			const targetHeight = Number(node?.height) || this.settings.defaultNodeHeight;
			file = await this.createCleanNoteForTopic(
				canvas,
				node,
				title,
				content
			);
			card = this.createTitleOnlyFileCard(
				canvas,
				file,
				node,
				'branch-note',
				title
			);
			const replacements = new Map([[node.id, card]]);
			this.cloneEdgesAroundReplacedNodes(
				canvas,
				branch,
				replacements,
				false,
				node.id
			);
			await flushCanvasView(canvas, this.app.vault);
			for (const topic of branch.slice().reverse())
				this.canvasApi.removeNode(canvas, topic);
			this.canvasApi.invalidateEdgeIndex();
			if (typeof card.moveAndResize === 'function') {
				card.moveAndResize({
					x: targetX,
					y: targetY,
					width: targetWidth,
					height: targetHeight
				});
			} else if (typeof card.moveTo === 'function') {
				card.moveTo({ x: targetX, y: targetY });
				card.width = targetWidth;
				card.height = targetHeight;
			}
			for (const edge of canvas.edges?.values?.() || []) {
				if (edge?.from?.node?.id === card.id || edge?.to?.node?.id === card.id) {
					edge.render?.();
				}
			}
			if (canvas.selection?.has?.(node)) {
				canvas.deselectAll?.();
				canvas.select?.(card);
			}
			this.markMarkdownOrderDirty(canvas);
			MindmapActions.syncCollapsedVisibility(canvas);
			if (this.isMindmapCanvas(canvas)) {
				this.layoutEngine.layout(canvas, { preserveRootSides: true });
				if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			}
			this.updateNodeTypeAttributes(canvas);
			this.updateGroupBounds(canvas);
			canvas.requestSave();
			this.refreshOutline(canvas);
			new import_obsidian5.Notice(
				`Exported branch to "${file.path}"`
			);
			return [file];
		} catch (error) {
			try {
				canvas.setData(beforeData);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			console.error('ToMindMap: branch Markdown export failed', error);
			if (card) {
				try {
					this.canvasApi.removeNode(canvas, card);
				} catch (_) {}
			}
			if (file) {
				try {
					await this.app.vault.delete(file);
				} catch (_) {}
			}
			new import_obsidian5.Notice('Could not export the branch as Markdown');
			return [];
		}
	}

	async convertTopicToCleanNotes(canvas, node, includeDescendants = false) {
		if (!canvas || !node || !nodeIsConvertibleTopic(canvas, node)) {
			new import_obsidian5.Notice('Select a text topic to convert');
			return [];
		}
		const forest = buildForest(canvas);
		if (includeDescendants) {
			const treeNode = findTreeForNode(forest, node.id);
			if (treeNode && treeNode.children.length > 0)
				return this.convertTopicBranchToMarkdownFile(canvas, node);
		}
		const branch = MindmapActions.getTopicBranch(
			forest,
			node,
			includeDescendants
		)
			.map((item) => item.canvasNode)
			.filter((item) => nodeIsConvertibleTopic(canvas, item));
		if (branch.length === 0) return [];
		const createdFiles = [];
		const createdCards = [];
		const replacements = new Map();
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		try {
			for (const topic of branch) {
				const title = MindmapActions.topicTitleFromNode(topic);
				const file = await this.createCleanNoteForTopic(canvas, topic, title);
				createdFiles.push(file);
				const card = this.createTitleOnlyFileCard(
					canvas,
					file,
					topic,
					'note',
					title
				);
				createdCards.push(card);
				replacements.set(topic.id, card);
			}
			this.cloneEdgesAroundReplacedNodes(
				canvas,
				branch,
				replacements,
				true
			);
			await flushCanvasView(canvas, this.app.vault);
			const selectedIds = new Set(
				Array.from(canvas.selection || [])
					.filter((item) => item && 'nodeEl' in item)
					.map((item) => item.id)
			);
			for (const topic of branch) this.canvasApi.removeNode(canvas, topic);
			this.canvasApi.invalidateEdgeIndex();
			if (selectedIds.size > 0) {
				canvas.deselectAll?.();
				for (const [oldId, card] of replacements) {
					if (selectedIds.has(oldId)) canvas.select?.(card);
				}
			}
			this.markMarkdownOrderDirty(canvas);
			MindmapActions.syncCollapsedVisibility(canvas);
			if (this.isMindmapCanvas(canvas)) {
				this.layoutEngine.layout(canvas, { preserveRootSides: true });
				if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			}
			this.updateNodeTypeAttributes(canvas);
			this.updateGroupBounds(canvas);
			canvas.requestSave();
			this.refreshOutline(canvas);
			new import_obsidian5.Notice(
				`Created ${createdFiles.length} clean note${createdFiles.length === 1 ? '' : 's'}`
			);
			return createdFiles;
		} catch (error) {
			try {
				canvas.setData(beforeData);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			console.error('ToMindMap: clean-note conversion failed', error);
			for (const card of createdCards) {
				try {
					this.canvasApi.removeNode(canvas, card);
				} catch (_) {}
			}
			for (const file of createdFiles) {
				try {
					await this.app.vault.delete(file);
				} catch (_) {}
			}
			new import_obsidian5.Notice('Could not create the clean note');
			return [];
		}
	}

	async convertTopicToNestedMindMap(canvas, node) {
		if (!canvas || !node || !nodeIsConvertibleTopic(canvas, node)) {
			new import_obsidian5.Notice('Select a text topic to convert');
			return null;
		}
		const forest = buildForest(canvas);
		const branch = MindmapActions.getTopicBranch(forest, node, true)
			.map((item) => item.canvasNode)
			.filter((item) => !getGroupIds(canvas).has(item.id));
		if (branch.length === 0) return null;
		const rootNode = branch[0];
		const parentPath = canvasPathFor(canvas);
		const nested = serializedBranchData(canvas, branch, rootNode);
		nested.mindmap = true;
		nested.mindmapNestedVersion = 1;
		layoutNestedMindmapData(nested, this.layoutEngine);
		nested.mindmapPendingResize = nested.nodes.map((item) => item.id);
		const folder = canvasFolderPath(canvas);
		const title = MindmapActions.topicTitleFromNode(rootNode);
		const rawPreferred = `${folder ? folder + '/' : ''}${title}.canvas`;
		const preferredPath = typeof import_obsidian5.normalizePath === 'function'
			? (0, import_obsidian5.normalizePath)(rawPreferred)
			: rawPreferred;
		const existingPreferred = this.app.vault.getAbstractFileByPath(preferredPath);
		if (existingPreferred instanceof import_obsidian5.TFile) {
			try {
				const rawExisting = await this.app.vault.cachedRead(existingPreferred);
				const parsedExisting = JSON.parse(rawExisting);
				if (parsedExisting?.mindmapParent?.canvas === parentPath) {
					if (typeof this.app.vault.trash === 'function') {
						await this.app.vault.trash(existingPreferred, true);
					} else if (typeof this.app.vault.delete === 'function') {
						await this.app.vault.delete(existingPreferred);
					}
					this.markdownOwnership.removeCanvas(preferredPath);
				}
			} catch (_) {}
		}
		const nestedPath = allocateFilePath(
			folder,
			title,
			'canvas',
			(candidate) => !!this.app.vault.getAbstractFileByPath(candidate)
		);
		let created = null;
		let card = null;
		let oldCardData = null;
		let registrySaved = false;
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		try {
			created = await this.app.vault.create(nestedPath, JSON.stringify(nested, null, '\t'));
			card = this.createTitleOnlyFileCard(
				canvas,
				created,
				rootNode,
				'nested-map',
				MindmapActions.topicTitleFromNode(rootNode)
			);
			oldCardData = { ...canvasNodeUnknownData(card) };
			const syncId = createSyncId();
			const issued = this.markdownOwnership.issueRecord({
				canvasPath: nestedPath,
				kind: 'parent',
				targetPath: parentPath,
				syncId,
				nodeId: card.id
			});
			if (!syncId || !issued.ok) throw new Error(issued.reason || 'Could not mint parent ownership');
			const parentLink = {
				canvas: parentPath,
				nodeId: card.id,
				syncId: issued.record.syncId,
				proof: issued.record.proof,
				ownership: { source: 'plugin-data' }
			};
			setCanvasNodeUnknownData(card, { [CARD_SYNC_KEY]: issued.record.syncId });
			nested.mindmapParent = parentLink;
			await this.app.vault.process(created, (raw) => JSON.stringify(nested, null, '\t'));
			const upserted = this.markdownOwnership.upsert(issued.record);
			if (!upserted.ok) throw new Error(upserted.reason);
			registrySaved = true;
			await this.persistPluginData();
			await flushCanvasView(canvas, this.app.vault);
			const replacements = new Map([[rootNode.id, card]]);
			const targetX = Number(rootNode.x) || 0;
			const targetY = Number(rootNode.y) || 0;
			const targetWidth = Number(rootNode.width) || this.settings.defaultNodeWidth;
			const targetHeight = Number(rootNode.height) || this.settings.defaultNodeHeight;
			this.cloneEdgesAroundReplacedNodes(canvas, branch, replacements, false, rootNode.id);
			for (const topic of branch.slice().reverse()) this.canvasApi.removeNode(canvas, topic);
			if (canvas?.edges && canvas?.nodes) {
				for (const edge of Array.from(canvas.edges.values())) {
					const fromId = edge.from?.node?.id || edge.fromNode;
					const toId = edge.to?.node?.id || edge.toNode;
					if (!canvas.nodes.has(fromId) || !canvas.nodes.has(toId)) {
						this.canvasApi.removeEdge(canvas, edge);
					}
				}
			}
			this.canvasApi.invalidateEdgeIndex();
			this.applyStructuralMutation(canvas, [card], { save: false, layout: false });
			if (typeof card.moveAndResize === 'function') {
				card.moveAndResize({
					x: targetX,
					y: targetY,
					width: targetWidth,
					height: targetHeight
				});
			} else if (typeof card.moveTo === 'function') {
				card.moveTo({ x: targetX, y: targetY });
				card.width = targetWidth;
				card.height = targetHeight;
			}
			this.updateNodeTypeAttributes(canvas);
			this.updateGroupBounds(canvas);
			for (const edge of canvas.edges?.values?.() || []) {
				if (edge?.from?.node?.id === card.id || edge?.to?.node?.id === card.id) {
					edge.render?.();
				}
			}
			this.layoutEngine.updateEdgeSides(canvas, { persist: false });
			canvas.requestFrame?.();
			canvas.requestSave();
			this.refreshOutline(canvas);
			this.verifiedParentLinks.set(nestedPath, parentLink);
			this.pendingNestedMindMapUndo = {
				canvas,
				canvasPath: canvas.view?.file?.path || canvas.file?.path,
				nestedPath,
				nestedFile: created,
				cardId: card.id
			};
			new import_obsidian5.Notice(`Moved ${branch.length} topic${branch.length === 1 ? '' : 's'} to ${created.path}`);
			return { file: created, card, data: nested, link: parentLink };
		} catch (error) {
			try {
				canvas.setData(beforeData);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			console.error('ToMindMap: nested mind-map conversion failed', error);
			if (registrySaved) {
				this.markdownOwnership.removeCanvas(nestedPath);
				try { await this.persistPluginData(); } catch (_) {}
			}
			if (card) {
				try {
					if (oldCardData) setCanvasNodeUnknownData(card, oldCardData);
					this.canvasApi.removeNode(canvas, card);
				} catch (_) {}
			}
			if (created) {
				try { await this.app.vault.delete(created); } catch (_) {}
			}
			new import_obsidian5.Notice('Could not create the nested mind map');
			return null;
		}
	}

	async waitForCanvasNode(path, nodeId, timeoutMs = 1000) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const open = this.getOpenCanvasByPath(path);
			const node = open?.nodes?.get(nodeId);
			if (open && node) return { canvas: open, node };
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return null;
	}
	async openParentMindMap(canvas, parent) {
		if (!parent) {
			new import_obsidian5.Notice('This mind map has no parent link');
			return;
		}
		const childPath = canvas?.view?.file?.path;
		const parentPath = parent.canvas || parent.targetPath || parent.path;
		const parentNodeId = parent.nodeId;
		let targetFile = null;
		let targetNodeId = parentNodeId;

		const resolved = await this.resolveParentLinkForCanvas(canvas, parent, { confirmLegacy: true });
		if (resolved.ok && resolved.link) {
			targetFile = resolved.link.file;
			targetNodeId = resolved.link.nodeId || parentNodeId;
		} else if (parentPath) {
			const candidate = this.app.vault.getAbstractFileByPath(parentPath);
			if (candidate instanceof import_obsidian5.TFile) {
				targetFile = candidate;
			}
		}

		if (!targetFile) {
			new import_obsidian5.Notice('The parent canvas file could not be found');
			return;
		}

		try {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(targetFile);
			const ready = await this.waitForCanvasNode(targetFile.path, targetNodeId);
			if (ready && ready.node) {
				this.canvasApi.selectForNavigation(ready.canvas, ready.node, this.settings.navigationZoomPadding);
				return;
			}
			let parentCanvas = null;
			try {
				parentCanvas = this.canvasApi?.getActiveCanvas?.() || this.canvasApi?.getAnyCanvas?.();
			} catch (_) {}
			if (parentCanvas) {
				if (childPath) {
					const matchingCard = Array.from(parentCanvas.nodes?.values() || []).find((n) => {
						const f = canvasNodeFilePath(n);
						return f === childPath || (f && childPath.endsWith('/' + f.split('/').pop()));
					});
					if (matchingCard) {
						this.canvasApi.selectForNavigation(parentCanvas, matchingCard, this.settings.navigationZoomPadding);
						return;
					}
				}
				const forest = buildForest(parentCanvas);
				if (forest.length > 0 && forest[0].canvasNode) {
					this.canvasApi.selectForNavigation(parentCanvas, forest[0].canvasNode, this.settings.navigationZoomPadding);
					return;
				}
			}
		} catch (error) {
			console.error('ToMindMap: parent navigation failed', error);
			new import_obsidian5.Notice('Could not open the parent mind map');
		}
	}

	async convertMarkdownFileToMindMap(file) {
		let created = null;
		let registrySaved = false;
		let sourcePatched = false;
		let originalMarkdown = '';
		let patchedMarkdownContent = '';
		try {
			originalMarkdown = await this.app.vault.cachedRead(file);
			const decoded = this.layoutMarkdownDocument(
				originalMarkdown,
				this.markdownLayoutOptions()
			);
			if (!decoded.ok) {
				new import_obsidian5.Notice(`Could not read the Markdown hierarchy: ${decoded.reason}`);
				return;
			}
			const imported = decoded.value;
			const folder = file.parent?.path || '';
			const canvasPath = allocateFilePath(
				folder,
				file.basename,
				'canvas',
				(candidate) => !!this.app.vault.getAbstractFileByPath(candidate)
			);
			const syncId = createSyncId();
			const issued = this.markdownOwnership.issueRecord({
				canvasPath,
				kind: 'markdown',
				targetPath: file.path,
				syncId,
				nodeId: null
			});
			if (!syncId || !issued.ok) throw new Error(issued.reason || 'Could not mint Markdown ownership');
			const patchedMarkdown = patchSyncIdOwnership(originalMarkdown, issued.record.syncId);
			if (!patchedMarkdown.ok) throw new Error(patchedMarkdown.reason);
			imported.nodes = MarkdownMindMapCodec.convertMarkdownAnchorsToCardLinks(imported.nodes, canvasPath);
			const link = {
				path: file.path,
				syncId: issued.record.syncId,
				proof: issued.record.proof,
				ownership: { source: 'plugin-data' }
			};
			const canvasData = {
				nodes: imported.nodes,
				edges: imported.edges,
				mindmap: true,
				mindmapPendingResize: imported.nodes.map((node) => node.id),
				mindmapMarkdownFrontmatter: imported.frontmatter || '',
				mindmapMarkdownSync: link
			};
			created = await this.app.vault.create(canvasPath, JSON.stringify(canvasData, null, '\t'));
			const preserved = MarkdownMindMapCodec.markdownWithTopicMetadata(
				MarkdownMindMapCodec.withoutLegacyPluginComments(patchedMarkdown.markdown),
				{
					topicIds: imported.topicIds || [],
					topicKeys: imported.topicKeys || [],
					topicLabels: imported.topicLabels || []
				}
			);
			patchedMarkdownContent = preserved;
			const written = await this.writeMarkdownFile(file, preserved, originalMarkdown);
			if (!written.ok) throw new Error(written.reason || LINK_REASON.FAILED);
			sourcePatched = true;
			const upserted = this.markdownOwnership.upsert(issued.record);
			if (!upserted.ok) throw new Error(upserted.reason);
			registrySaved = true;
			await this.persistPluginData();
			if (!this.indexMarkdownLink(created.path, file.path))
				throw new Error(LINK_REASON.FAILED);
			this.verifiedMarkdownLinks.set(created.path, link);
			await this.app.workspace.getLeaf(false).openFile(created);
			new import_obsidian5.Notice(
				`Created "${created.path}" and linked it to "${file.path}"`
			);
		} catch (error) {
			if (registrySaved) {
				this.markdownOwnership.removeCanvas(created?.path || '');
				try { await this.persistPluginData(); } catch (_) {}
			}
			if (sourcePatched && originalMarkdown && patchedMarkdownContent) {
				try { await this.writeMarkdownFile(file, originalMarkdown, patchedMarkdownContent); } catch (_) {}
			}
			if (created) {
				try {
					this.unindexCanvas(created.path);
					this.verifiedMarkdownLinks.delete(created.path);
					await this.app.vault.delete(created);
				} catch (_) {}
			}
			console.error('ToMindMap: Markdown conversion failed', error);
			new import_obsidian5.Notice('Could not convert that Markdown file to a mind map');
		}
	}
	async copyMindMapMarkdown(canvas) {
		const encoded = this.encodeMarkdownDocument(canvas, { includeFrontmatter: false });
		if (!encoded.ok || !encoded.value.markdown.trim()) {
			new import_obsidian5.Notice('No mind map topics to copy');
			return;
		}
		try {
			await writeClipboardText(encoded.value.markdown);
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
		const roots = MarkdownMindMapCodec.extractSelectedTopicForest(canvas);
		if (roots.length === 0) return;
		const encoded = this.encodeMarkdownDocument(canvas, {
			includeFrontmatter: false,
			rootTrees: roots
		});
		if (!encoded.ok) return;
		const markdown = encoded.value.markdown;
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
		const decoded = this.layoutMarkdownDocument(
			markdown,
			this.markdownLayoutOptions()
		);
		if (!decoded.ok) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const parent = this.canvasApi.getSelectedNode(canvas);
		this.runAsync(
			() => this.importMarkdownIntoCanvas(canvas, markdown, 'clipboard', parent),
			'paste Markdown'
		);
	}
	async readBoundedMarkdownFile(file) {
		const maxBytes = MarkdownMindMapCodec.DEFAULT_MARKDOWN_BUDGETS.maxFileBytes;
		if (Number(file?.size || 0) > maxBytes) {
			return { ok: false, reason: 'file-byte-budget' };
		}
		if (typeof file?.stream === 'function') {
			const reader = file.stream().getReader();
			const chunks = [];
			let bytes = 0;
			try {
				while (true) {
					const part = await reader.read();
					if (part.done) break;
					bytes += part.value?.byteLength || part.value?.length || 0;
					if (bytes > maxBytes) {
						await reader.cancel?.();
						return { ok: false, reason: 'file-byte-budget' };
					}
					chunks.push(part.value);
				}
			} finally {
				reader.releaseLock?.();
			}
			const decoder = new TextDecoder();
			const output = new Uint8Array(bytes);
			let offset = 0;
			for (const chunk of chunks) {
				output.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return { ok: true, value: decoder.decode(output) };
		}
		const text = await file.text();
		if (new TextEncoder().encode(text).byteLength > maxBytes)
			return { ok: false, reason: 'file-byte-budget' };
		return { ok: true, value: text };
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
			this.runAsync(async () => {
				const read = await this.readBoundedMarkdownFile(file);
				if (!read.ok) {
					new import_obsidian5.Notice(`Could not import Markdown: ${read.reason}`);
					return;
				}
				await this.importMarkdownIntoCanvas(canvas, read.value, file.name);
			}, 'import Markdown file');
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
		if (new TextEncoder().encode(String(markdown || '')).byteLength >
			MarkdownMindMapCodec.DEFAULT_MARKDOWN_BUDGETS.maxFileBytes) {
			new import_obsidian5.Notice('Could not import Markdown: file-byte-budget');
			return { ok: false, reason: 'file-byte-budget' };
		}
		const decoded = this.layoutMarkdownDocument(markdown, {
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			maxNodeHeight: this.settings.maxNodeHeight,
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap
		});
		if (!decoded.ok) {
			new import_obsidian5.Notice(`Could not import Markdown: ${decoded.reason}`);
			return;
		}
		const imported = decoded.value;
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
		let localMinX = Infinity;
		let localMinY = Infinity;
		for (const node of imported.nodes) {
			localMinX = Math.min(localMinX, Number(node.x) || 0);
			localMinY = Math.min(localMinY, Number(node.y) || 0);
		}
		if (!Number.isFinite(localMinX) || !Number.isFinite(localMinY))
			return { ok: false, reason: 'invalid-geometry' };
		let existingMinX = Infinity;
		let existingMaxY = -Infinity;
		for (const node of existing) {
			existingMinX = Math.min(existingMinX, Number(node.x) || 0);
			existingMaxY = Math.max(existingMaxY, (Number(node.y) || 0) + (Number(node.height) || 0));
		}
		const targetX = parentNode
			? parentNode.x + parentNode.width + this.settings.horizontalGap
			: existing.length > 0
				? existingMinX
				: 0;
		const targetY = parentNode
			? parentNode.y
			: existing.length > 0
				? existingMaxY + Math.max(160, this.settings.verticalGap * 8)
				: 0;
		const dx = targetX - localMinX;
		const dy = targetY - localMinY;
		for (const node of imported.nodes) {
			node.x += dx;
			node.y += dy;
		}
		const canvasPath =
			canvas.view && canvas.view.file ? canvas.view.file.path : '';
		imported.nodes = MarkdownMindMapCodec.convertMarkdownAnchorsToCardLinks(
			imported.nodes,
			canvasPath
		);
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		try {
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
		if (importedNodes.length !== imported.nodes.length)
			throw new Error('Canvas did not materialize every imported topic');
		const importedEdges = imported.edges
			.map((data) => canvas.edges.get(data.id))
			.filter(Boolean);
		if (importedEdges.length !== imported.edges.length)
			throw new Error('Canvas did not materialize every imported edge');
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
				if (!root) throw new Error('An imported root disappeared before connection');
				const edge = this.canvasApi.createEdge(
					canvas,
					parentNode,
					root,
					'right',
					'left',
					parentNode.color || void 0
				);
				if (!edge) throw new Error('Canvas did not create an imported-root edge');
			}
		}
		this.markMarkdownOrderDirty(canvas);
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
			return { ok: true, imported: imported.nodes.length };
		} catch (error) {
			try {
				canvas.setData(beforeData);
				this.canvasApi.invalidateEdgeIndex();
				if (this.isMindmapCanvas(canvas)) MindmapActions.syncCollapsedVisibility(canvas);
				canvas.requestSave?.();
				await flushCanvasView(canvas, this.app.vault);
			} catch (_) {}
			new import_obsidian5.Notice('Could not import the Markdown hierarchy');
			return { ok: false, reason: LINK_REASON.FAILED, error };
		}
	}
	updateNodeTypeAttributes(canvas) {
		if (!canvas || !canvas.nodes) return;
		const graph = this.canvasApi.getGraphQuery?.(canvas) || null;
		for (const node of canvas.nodes.values()) {
			if (!node || !node.nodeEl) continue;
			const nodeFilePath = canvasNodeFilePath(node);
			const nodeUrl = canvasNodeUrl(node);
			const nodeData = canvasNodeUnknownData(node);
			const titleOnly = !!nodeData[TOMINMAP_TITLE_ONLY];
			const type = nodeFilePath
				? 'file'
				: node.unknownData?.type === 'group' || node.type === 'group'
					? 'group'
					: nodeUrl
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
			const isRootTopic =
				type === 'text' &&
				(graph?.incomingEdgesOf(node)?.length || 0) === 0;
			for (const element of new Set([
				node.nodeEl,
				shell,
				controlsOwner
			])) {
				if (!element) continue;
				element.setAttribute('data-node-type', type);
				if (titleOnly) {
					element.setAttribute(
						'data-tomindmap-card-title',
						nodeData[TOMINMAP_CARD_TITLE] || titleOnlyCardTitle(node)
					);
					element.setAttribute(
						'data-tomindmap-card-kind',
						nodeData[TOMINMAP_CARD_KIND] || 'note'
					);
					element.setAttribute(
						'aria-label',
						`${nodeData[TOMINMAP_CARD_TITLE] || titleOnlyCardTitle(node)} — open linked file`
					);
				} else {
					element.removeAttribute('data-tomindmap-card-title');
					element.removeAttribute('data-tomindmap-card-kind');
					element.removeAttribute('aria-label');
				}
				if (typeof element.toggleClass === 'function') {
					element.toggleClass(
						'tomindmap-plain-card',
						type === 'text'
					);
					element.toggleClass(
						'tomindmap-resizable-content',
						type !== 'text'
					);
					element.toggleClass(ROOT_TOPIC_CLASS, isRootTopic);
					element.toggleClass(
						'tomindmap-title-only-card',
						titleOnly && element === shell
					);
					element.toggleClass(
						'tomindmap-file-card',
						type === 'file' && element === shell
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
					element.classList?.toggle(
						ROOT_TOPIC_CLASS,
						isRootTopic
					);
					element.classList?.toggle(
						'tomindmap-title-only-card',
						titleOnly && element === shell
					);
					element.classList?.toggle(
						'tomindmap-file-card',
						type === 'file' && element === shell
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
			this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
		}
		return attached;
	}
	registerMediaDropHandler(canvas) {
		const wrapper = canvas.wrapperEl;
		if (!wrapper) return () => {};
		let hoveredNode = null;
		const supports = (event) =>
			hasSupportedDrop(event.dataTransfer);

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
			void (async () => {
				if (!this.isMindmapCanvas(canvas)) {
					clearHover();
					return;
				}
				if (!supports(event)) {
					clearHover();
					return;
				}
				event.preventDefault();
				event.stopImmediatePropagation();
				const target = findNodeFromEvent(canvas, event);
				clearHover();
				const groupIds = getGroupIds(canvas);
				const topic = target && !groupIds.has(target.id) ? target : null;
				const position = canvas.posFromEvt(event);
				const files = Array.from(event.dataTransfer?.files || []);
				if (files.length > 0) {
					await this.addDroppedFiles(canvas, files, position, topic);
					return;
				}
				const url = droppedUrl(event.dataTransfer);
				if (url) await this.addDroppedUrl(canvas, url, position, topic);
			})().catch((error) => {
				clearHover();
				console.error('ToMindMap: media drop failed', error);
				new import_obsidian5.Notice('Could not add the dropped media');
			});
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
	isTouchUiEnabled() {
		const mode = this.settings?.touchControls || 'auto';
		if (mode === 'on') return true;
		if (mode === 'off') return false;
		if (typeof window === 'undefined' || !window.matchMedia) return false;
		return (
			window.matchMedia('(pointer: coarse)').matches &&
			!window.matchMedia('(pointer: fine)').matches
		);
	}
	/**
	 * Reconfigure only the live input adapters affected by settings or mode.
	 * Keyboard, mutation, media, and drag listeners stay attached for the
	 * Canvas session, so changing a preference never requires a leaf switch.
	 */
	syncCanvasBindings(canvas = this.interceptedCanvas) {
		if (this.cleanupTouchHandler) {
			this.cleanupTouchHandler();
			this.cleanupTouchHandler = null;
		}
		if (this.cleanupNavHandler) {
			this.cleanupNavHandler();
			this.cleanupNavHandler = null;
		}
		this.touchController = null;
		if (!canvas || !this.isMindmapCanvas(canvas)) return false;
		if (this.isTouchUiEnabled()) {
			this.touchController = new TouchControlsController({
				canvas,
				actions: this.createMindMapActionSurface(canvas),
				Menu: import_obsidian5.Menu,
				setIcon: import_obsidian5.setIcon,
				isEnabled: () =>
					this.isTouchUiEnabled() && this.isMindmapCanvas(canvas),
				isTopicNode: (node) =>
					nodeIsConvertibleTopic(canvas, node) ||
					!!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY],
				onDoubleTap: (node) => {
					if (!canvasNodeUnknownData(node)[TOMINMAP_TITLE_ONLY]) return false;
					let file = this.app.vault.getAbstractFileByPath(
						canvasNodeFilePath(node)
					);
					if (
						canvasNodeUnknownData(node)[TOMINMAP_CARD_KIND] === 'nested-map' &&
						typeof this.findMostRecentNestedMapForNode === 'function'
					) {
						const mostRecent = this.findMostRecentNestedMapForNode(canvas, node);
						if (mostRecent) file = mostRecent;
					}
					if (!(file instanceof import_obsidian5.TFile)) return false;
					void this.app.workspace.getLeaf(false).openFile(file);
					return true;
				},
				getNodeAtEvent: (event) => findNodeFromEvent(canvas, event),
				buildMenuItems: (menu, node) => {
					this.app.workspace.trigger('canvas:node-menu', menu, node);
				}
			});
			this.cleanupTouchHandler = this.touchController.attach();
		}
		if (this.settings.mouseNavigation) {
			const onPointerDown = (event) => {
				if (event.button !== 3 && event.button !== 4) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				if (event.button === 3) this.navigateBack(canvas);
				else this.navigateForward(canvas);
			};
			canvas.wrapperEl?.addEventListener('pointerdown', onPointerDown, true);
			this.cleanupNavHandler = () =>
				canvas.wrapperEl?.removeEventListener('pointerdown', onPointerDown, true);
		}
		return true;
	}
	registerNodeDragReparentHandler(canvas) {
		const wrapper = canvas.wrapperEl;
		if (!wrapper) return { finish() { return false; }, dispose() {} };
		const ownerDocument = wrapper.ownerDocument || document;
		const ownerWindow = ownerDocument.defaultView;
		let draggedNode = null;
		let dragStartPos = null;
		let isSingleCardDrag = false;
		let isMultiCardDrag = false;
		let multiMovingNodes = [];
		let multiTopLevelNodes = [];
		let multiStartPositions = new Map();
		let preservedSelection = null;
		let resizingNode = null;
		let previewFrame = null;
		let pointerUpFrame = null;
		let cachedDragForest = [];
		let liveBranchDirection = null;
		let livePreviewTargetId = null;
		let liveDetached = false;
		let singleStartPositions = new Map();
		let previewResolved = false;
		let draggedDescendants = [];
		let draggedMoveTo = null;
		let dragPointerStart = null;
		let latestPointerPosition = null;
		let terminalReason = null;
		let terminalResult = null;
		let activePointerId = null;
		let dragThresholdPassed = false;
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
			if (isMultiCardDrag) {
				const dx = latestPointerPosition.x - dragPointerStart.x;
				const dy = latestPointerPosition.y - dragPointerStart.y;
				for (const node of multiMovingNodes) {
					const start = multiStartPositions.get(node.id);
					if (start) {
						node.moveTo({
							x: start.x + dx,
							y: start.y + dy
						});
					}
				}
			} else {
				draggedNode.moveTo({
					x:
						dragStartPos.x +
						latestPointerPosition.x -
						dragPointerStart.x,
					y: dragStartPos.y + latestPointerPosition.y - dragPointerStart.y
				});
			}
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
			if (!dragThresholdPassed) {
				const pointerMoved = dragPointerStart
					? Math.hypot(
							latestPointerPosition.x - dragPointerStart.x,
							latestPointerPosition.y - dragPointerStart.y
					  )
					: Math.hypot(
							draggedNode.x - dragStartPos.x,
							draggedNode.y - dragStartPos.y
					  );
				if (pointerMoved <= 10) return;
				dragThresholdPassed = true;
			}
			if (previewFrame !== null) return;
			const view = wrapper.ownerDocument?.defaultView;
			const run = () => {
				previewFrame = null;
				if (!draggedNode) return;
				applyUnsnappedDragPosition();
				const preview = (isSingleCardDrag || isMultiCardDrag)
					? dragAttachment.updatePreview(draggedNode)
					: null;
				previewResolved = Boolean(preview);
				if (preview?.state === 'preview' && preview.target) {
					liveDetached = false;
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
						if (isSingleCardDrag) {
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
				} else if (preview?.state === 'detached') {
					const shouldRebalance =
						!liveDetached ||
						livePreviewTargetId !== null ||
						liveBranchDirection !== null;
					livePreviewTargetId = null;
					liveBranchDirection = null;
					if (shouldRebalance && isSingleCardDrag) {
						liveDetached = true;
						this.layoutEngine?.layoutChildren?.(
							canvas,
							draggedNode.id,
							null,
							{
								treatAsRoot: true,
								spreadEqually: true,
								animate: false,
								persist: false
							}
						);
					}
				} else if (this.canvasApi.getParentNode(canvas, draggedNode)) {
					liveDetached = false;
					const direction = directionFromParent(draggedNode);
					const leftTargetPreview = livePreviewTargetId !== null;
					livePreviewTargetId = null;
					if (
						direction &&
						(leftTargetPreview || direction !== liveBranchDirection)
					) {
						liveBranchDirection = direction;
						if (isSingleCardDrag) {
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
			const pointerDelta = (dragPointerStart && latestPointerPosition)
				? Math.hypot(
						latestPointerPosition.x - dragPointerStart.x,
						latestPointerPosition.y - dragPointerStart.y
				  )
				: 0;
			if (dragThresholdPassed || pointerDelta > 10) {
				applyUnsnappedDragPosition();
			}

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
					this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
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
				this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
				return;
			}
			setMediaDragging(draggedNode, false);
			setMindmapDragging(false);
			const movedDistance = Math.max(
				pointerDelta,
				Math.hypot(
					draggedNode.x - dragStartPos.x,
					draggedNode.y - dragStartPos.y
				)
			);
			const nodeToMove = draggedNode;
			const wasSingleCardDrag = isSingleCardDrag;
			restoreDraggedMove();

			if (movedDistance <= 10) {
				dragAttachment.cancel();
				if (draggedNode && dragStartPos) {
					draggedNode.moveTo?.(dragStartPos);
				}
				if (isMultiCardDrag && draggedNode) {
					canvas.selectOnly?.(draggedNode);
					canvas.requestFrame?.();
				}
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				isMultiCardDrag = false;
				multiMovingNodes = [];
				multiTopLevelNodes = [];
				multiStartPositions.clear();
				preservedSelection = null;
				dragThresholdPassed = false;
				return;
			}

			const forest = buildForest(canvas);
			if (wasSingleCardDrag) {
				// A fast release may precede the first preview frame. Otherwise commit
				// the exact locked target represented by the visible preview arrow.
				if (!previewResolved) dragAttachment.updatePreview(nodeToMove);
				const result = dragAttachment.commit(nodeToMove);
				if (canvas.selection && canvas.selection.size > 1) {
					for (const item of canvas.selection) {
						const other = typeof item === 'string' ? canvas.nodes.get(item) : (item?.id ? canvas.nodes.get(item.id) || item : item);
						if (other && other.id !== nodeToMove.id) {
							TreeDrag.removeIncomingParentEdges(canvas, this.canvasApi, other);
						}
					}
				}
				// Mind-map positions are authoritative. Reflow even if the closest
				// parent stayed the same, so media cannot remain freely positioned.
				if (this.isMindmapCanvas(canvas)) {
					const parentNode = result.target || this.canvasApi.getParentNode(canvas, nodeToMove);
					const currentSide = parentNode
						? (nodeToMove.x + nodeToMove.width / 2 >= parentNode.x + parentNode.width / 2 ? 'right' : 'left')
						: null;
					const branchDirection = (result.state === 'attached' && result.changed && result.incomingSide)
						? directionOppositeIncomingSide(result.incomingSide)
						: currentSide || liveBranchDirection || directionFromParent(nodeToMove);
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
				this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				return;
			}

			if (isMultiCardDrag) {
				if (!previewResolved) dragAttachment.updatePreview(nodeToMove);
				const preview = dragAttachment.updatePreview(nodeToMove);
				dragAttachment.cancel();

				let targetNode = (preview?.state === 'preview' && preview?.target)
					? preview.target
					: (findNodeFromEvent(canvas, event) || null);
				if (targetNode && (multiStartPositions.has(targetNode.id) || getGroupIds(canvas).has(targetNode.id))) {
					targetNode = null;
				}

				let hierarchyChanged = false;
				if (targetNode) {
					if (TreeDrag.reparentSubtree(
						canvas,
						this.canvasApi,
						nodeToMove,
						targetNode,
						'child',
						forest
					)) {
						hierarchyChanged = true;
					}
					const otherNodes = new Set([...multiMovingNodes, ...multiTopLevelNodes]);
					for (const node of otherNodes) {
						if (node.id === nodeToMove.id || node.id === targetNode.id) continue;
						TreeDrag.removeIncomingParentEdges(canvas, this.canvasApi, node);
						hierarchyChanged = true;
					}
				} else if (preview?.state === 'detached') {
					for (const node of multiTopLevelNodes) {
						TreeDrag.removeIncomingParentEdges(canvas, this.canvasApi, node);
						hierarchyChanged = true;
					}
				}

				if (this.isMindmapCanvas(canvas)) {
					const branchDirection = targetNode
						? directionFromParent(nodeToMove) || directionFromParent(targetNode) || 'right'
						: null;
					this.layoutEngine.layout(canvas, {
						preserveRootSides: true,
						spreadEquallyForRootIds: preview?.state === 'detached'
							? new Set(multiTopLevelNodes.map((n) => n.id))
							: null,
						branchDirectionOverride: branchDirection && targetNode
							? {
									nodeId: targetNode.id,
									direction: branchDirection
								}
							: null
					});
					this.updateGroupBounds(canvas);
				}
				if (this.settings.autoColor && this.isMindmapCanvas(canvas))
					this.branchColors.applyColors(canvas);
				if (hierarchyChanged) this.markMarkdownOrderDirty(canvas);
				canvas.requestSave();

				if (preservedSelection && preservedSelection.size > 0) {
					canvas.deselectAll?.();
					for (const selNode of preservedSelection) {
						const n = typeof selNode === 'string' ? canvas.nodes.get(selNode) : selNode;
						if (n) canvas.select?.(n);
					}
					canvas.requestFrame?.();
				}

				for (const node of multiMovingNodes) {
					rememberMediaPosition(node);
				}
				this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
				if (hierarchyChanged) {
					new import_obsidian5.Notice('Re-parented nodes to branch');
				}
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				isMultiCardDrag = false;
				multiMovingNodes = [];
				multiTopLevelNodes = [];
				multiStartPositions.clear();
				preservedSelection = null;
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
			this.runAsync(() => this.flushCanvasToMarkdown(canvas), 'flush canvas to markdown');
			if (hierarchyChanged)
				new import_obsidian5.Notice(
					dropZone === 'child'
						? 'Re-parented as child topic'
						: 'Re-parented as sibling topic'
				);
		};

		const detachOwnedListeners = () => {
			ownerDocument.removeEventListener('pointermove', onPointerMove, true);
			ownerDocument.removeEventListener('pointerup', onPointerUp, true);
			ownerDocument.removeEventListener('mousemove', onPointerMove, true);
			ownerDocument.removeEventListener('mouseup', onPointerUp, true);
		};
		const clearOwnedGesture = () => {
			cancelPreviewFrame();
			if (pointerUpFrame !== null) {
				if (typeof ownerWindow?.cancelAnimationFrame === 'function')
					ownerWindow.cancelAnimationFrame(pointerUpFrame);
				else clearTimeout(pointerUpFrame);
				pointerUpFrame = null;
			}
			setMediaDragging(draggedNode, false);
			setMindmapDragging(false);
			dragAttachment.finish(
				terminalReason === 'commit' ? 'commit' : 'cancel',
				draggedNode
			);
			if (terminalReason !== 'commit') {
				if (isMultiCardDrag) {
					for (const [id, pos] of multiStartPositions) {
						const node = canvas.nodes?.get(id);
						node?.moveTo?.(pos);
					}
				} else if (isSingleCardDrag && singleStartPositions.size > 0) {
					for (const [id, pos] of singleStartPositions) {
						const node = canvas.nodes?.get(id);
						node?.moveTo?.(pos);
					}
					this.layoutEngine?.updateEdgeSides?.(canvas, { persist: false });
				}
			}
			restoreDraggedMove();
			detachOwnedListeners();
			activePointerId = null;
			draggedNode = null;
			dragStartPos = null;
			isSingleCardDrag = false;
			isMultiCardDrag = false;
			multiMovingNodes = [];
			multiTopLevelNodes = [];
			multiStartPositions.clear();
			singleStartPositions.clear();
			preservedSelection = null;
			liveBranchDirection = null;
			livePreviewTargetId = null;
			liveDetached = false;
			previewResolved = false;
			resizingNode = null;
			dragPointerStart = null;
			latestPointerPosition = null;
			dragThresholdPassed = false;
		};
		const finishGesture = (reason, event = null) => {
			if (terminalReason) return terminalResult;
			if (
				activePointerId !== null &&
				event?.pointerId !== undefined &&
				event.pointerId !== activePointerId
			) return terminalResult;
			terminalReason = reason;
			if (reason === 'commit') {
				try {
					finishPointerUp(event);
				} finally {
					clearOwnedGesture();
				}
			} else {
				clearOwnedGesture();
			}
			terminalResult = { ok: true, reason };
			return terminalResult;
		};
		const onPointerCancel = (event) => finishGesture('cancel', event);
		const onWindowBlur = () => finishGesture('blur');

		const onPointerUp = (event) => {
			if (terminalReason || pointerUpFrame !== null) return;
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
				finishGesture('commit', event);
			};
			pointerUpFrame =
				typeof view?.requestAnimationFrame === 'function'
					? view.requestAnimationFrame(finish)
					: setTimeout(finish, 0);
		};

		const onPointerDown = (event) => {
			if (terminalReason) {
				dragAttachment.cancel();
				terminalReason = null;
				terminalResult = null;
			}
			const node = isPrimaryCardGesture(event, {
				isEnabled: () => this.isMindmapCanvas(canvas),
				findNode: (pointerEvent) => findNodeFromEvent(canvas, pointerEvent),
				isGroupNode: (candidate) => getGroupIds(canvas).has(candidate.id)
			});
			if (node) {
				// Claim the gesture before Obsidian's native Canvas drag sees it.
				// Letting both handlers move the same cards produces overlapping
				// layouts and stale edge geometry after even a tiny drag.
				event.preventDefault?.();
				event.stopPropagation?.();
				event.stopImmediatePropagation?.();
				activePointerId = event.pointerId ?? null;
				draggedNode = node;
				dragStartPos = { x: node.x, y: node.y };
				dragPointerStart = canvas.posFromEvt(event);
				latestPointerPosition = dragPointerStart;
				dragThresholdPassed = false;
				const isNodeInSelection = Boolean(
					canvas.selection && (
						canvas.selection.has(node) ||
						canvas.selection.has(node.id) ||
						Array.from(canvas.selection).some((item) => item === node || item === node?.id || (item && item.id === node?.id))
					)
				);
				const hasMultiSelection = Boolean(
					isNodeInSelection &&
					canvas.selection.size > 1
				);

				if (hasMultiSelection) {
					isSingleCardDrag = false;
					isMultiCardDrag = true;
					preservedSelection = new Set(canvas.selection);

					const groupIds = getGroupIds(canvas);
					const selectedList = Array.from(canvas.selection)
						.map((item) => (typeof item === 'string' ? canvas.nodes.get(item) : (item && item.id && !item.x) ? (canvas.nodes.get(item.id) || item) : item))
						.filter(
							(n) =>
								n &&
								typeof n.x === 'number' &&
								typeof n.y === 'number' &&
								!groupIds.has(n.id)
						);
					selectedList.sort((a, b) => (a.y - b.y) || (a.x - b.x));

					const forest = cachedDragForest.length > 0
						? cachedDragForest
						: buildForest(canvas);
					const selectedIds = new Set(selectedList.map((n) => n.id));
					multiTopLevelNodes = selectedList.filter((n) => {
						let tree = findTreeForNode(forest, n.id);
						if (!tree) return true;
						let curr = tree.parent;
						while (curr) {
							if (selectedIds.has(curr.canvasNode?.id)) return false;
							curr = curr.parent;
						}
						return true;
					});

					const allMovingSet = new Set();
					for (const root of multiTopLevelNodes) {
						allMovingSet.add(root);
						for (const desc of this.collectSubtreeNodes(canvas, root)) {
							allMovingSet.add(desc);
						}
					}
					multiMovingNodes = Array.from(allMovingSet);
					multiStartPositions = new Map(
						multiMovingNodes.map((n) => [n.id, { x: n.x, y: n.y }])
					);

					liveBranchDirection = null;
					livePreviewTargetId = null;
					previewResolved = false;

					const excluded = new Set(multiMovingNodes.map((n) => n.id));
					dragAttachment.begin(node, { excludedIds: excluded });
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
				} else {
					isSingleCardDrag = true;
					isMultiCardDrag = false;
					multiMovingNodes = [];
					multiTopLevelNodes = [];
					multiStartPositions.clear();
					singleStartPositions.clear();
					singleStartPositions.set(node.id, { x: node.x, y: node.y });
					for (const desc of this.collectSubtreeNodes(canvas, node)) {
						singleStartPositions.set(desc.id, { x: desc.x, y: desc.y });
					}
					preservedSelection = null;

					const parentNode = this.canvasApi.getParentNode(canvas, node);
					liveBranchDirection = parentNode
						? directionFromParent(node)
						: null;
					livePreviewTargetId = null;
					liveDetached = false;
					previewResolved = false;

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
				if (draggedNode) finishGesture('cancel', event);
				activePointerId = null;
				draggedNode = null;
				dragStartPos = null;
				isSingleCardDrag = false;
				isMultiCardDrag = false;
				multiMovingNodes = [];
				multiTopLevelNodes = [];
				multiStartPositions.clear();
				preservedSelection = null;
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
		ownerDocument.addEventListener('pointercancel', onPointerCancel, true);
		ownerDocument.addEventListener('lostpointercapture', onPointerCancel, true);
		ownerWindow?.addEventListener?.('blur', onWindowBlur);
		return {
			finish: finishGesture,
			dispose(reason = 'teardown') {
				finishGesture(reason === 'commit' ? 'commit' : reason);
				wrapper.removeEventListener('mousedown', blockNonFileResizing, true);
				wrapper.removeEventListener('pointerdown', blockNonFileResizing, true);
				wrapper.removeEventListener('touchstart', blockNonFileResizing, true);
				wrapper.removeEventListener('pointerdown', onPointerDown, true);
				wrapper.removeEventListener('pointermove', onPointerMove, true);
				wrapper.removeEventListener('pointerup', onPointerUp, true);
				ownerDocument.removeEventListener('pointercancel', onPointerCancel, true);
				ownerDocument.removeEventListener('lostpointercapture', onPointerCancel, true);
				ownerWindow?.removeEventListener?.('blur', onWindowBlur);
				detachOwnedListeners();
			}
		};
	}
	canvasViewportCenter(canvas) {
		const rect = canvas.wrapperEl.getBoundingClientRect();
		return canvas.posFromEvt({
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2
		});
	}
	/**
	 * Seed an empty mindmap canvas with a selected, editable central topic.
	 * The pending-creation flag is cleared so the deliberately blank root
	 * survives the automatic cleanup that removes abandoned child cards.
	 */
	ensureRootTopic(canvas) {
		if (this.unloaded) return false;
		if (!this.settings.autoCreateRootTopic) return false;
		if (!canvas || this.canvasApi.getActiveCanvas() !== canvas) return false;
		if (!this.isMindmapCanvas(canvas)) return false;
		if (!isBlankMindmapCanvas(canvas)) return false;
		const width = this.settings.defaultNodeWidth;
		const height = this.settings.defaultNodeHeight;
		const center = this.canvasViewportCenter(canvas);
		const node = this.canvasApi.createTextNode(
			canvas,
			Math.round(center.x - width / 2),
			Math.round(center.y - height / 2),
			'',
			width,
			height
		);
		if (!node) return false;
		delete node.__tomindmapPendingCreation;
		if (typeof node.setColor === 'function') node.setColor(ROOT_TOPIC_COLOR);
		this.markRootTopic(node, true);
		this.canvasApi.invalidateEdgeIndex();
		this.updateNodeTypeAttributes(canvas);
		canvas.selectOnly(node);
		canvas.requestSave();
		this.trackedTimeout(() => {
			if (this.unloaded) return;
			if (this.canvasApi.getActiveCanvas() !== canvas) return;
			if (!canvas.nodes.has(node.id)) return;
			node.startEditing();
		}, 60);
		return true;
	}
	markRootTopic(node, isRoot) {
		const element = node?.nodeEl;
		if (!element || typeof element.toggleClass !== 'function') return;
		element.toggleClass(ROOT_TOPIC_CLASS, isRoot);
	}
	async syncParentLinkedCardTitle(canvas, title, childFile = null) {
		const parentLink = canvas?.getData?.()?.[TOMINMAP_PARENT];
		if (!parentLink || !title) return false;
		const resolved = await this.resolveParentLinkForCanvas(canvas, parentLink);
		if (!resolved.ok) return false;
		const parentPath = resolved.link.canvas;
		const parentNodeId = resolved.link.nodeId;
		const parentFile = resolved.link.file;
		if (!(parentFile instanceof import_obsidian5.TFile)) return false;
		const patchData = (data) => {
			const card = (data.nodes || []).find((node) => node.id === parentNodeId);
			if (!card) return null;
			card.unknownData = {
				...(card.unknownData || {}),
				[TOMINMAP_TITLE_ONLY]: true,
				[TOMINMAP_CARD_KIND]: 'nested-map',
				[TOMINMAP_CARD_TITLE]: title,
				[CARD_SYNC_KEY]: resolved.link.syncId
			};
			if (childFile?.path) card.file = childFile.path;
			return data;
		};
		const parentCanvas = this.getOpenCanvasByPath(parentPath);
		const card = parentCanvas?.nodes?.get(parentNodeId);
		if (card) {
			if (childFile?.path) {
				if (typeof card.setFilePath === 'function') card.setFilePath(childFile.path, card.subpath || '');
				else if (typeof card.setFile === 'function') card.setFile(childFile, '');
				else { card.file = childFile; card.filePath = childFile.path; }
			}
			setCanvasNodeUnknownData(card, {
				[TOMINMAP_TITLE_ONLY]: true,
				[TOMINMAP_CARD_KIND]: 'nested-map',
				[TOMINMAP_CARD_TITLE]: title,
				[CARD_SYNC_KEY]: resolved.link.syncId
			});
			this.updateNodeTypeAttributes(parentCanvas);
			this.updateGroupBounds(parentCanvas);
			this.syncApplyingCanvas.add(parentCanvas);
			try {
				parentCanvas.requestSave?.();
				await flushCanvasView(parentCanvas, this.app.vault);
			} finally {
				this.syncApplyingCanvas.delete(parentCanvas);
			}
			return true;
		}
		if (typeof this.app.vault.process !== 'function') return false;
		let patchedCard = false;
		try {
			await this.app.vault.process(parentFile, (raw) => {
				const data = JSON.parse(raw);
				const patched = patchData(data);
				patchedCard = Boolean(patched);
				return patched ? JSON.stringify(patched, null, '\t') : raw;
			});
			return patchedCard;
		} catch (error) {
			console.error('ToMindMap: could not update the parent linked card', error);
			return false;
		}
	}

	/**
	 * Rename a Canvas file after its central topic is titled. Only a lone
	 * root topic drives the name so a canvas holding several maps keeps its
	 * own filename, and an existing file is never overwritten.
	 */
	async renameCanvasFromRootTopic(canvas, node) {
		if (this.unloaded) return false;
		if (!canvas || !this.isMindmapCanvas(canvas)) return false;
		const file = canvas.view?.file;
		if (!file || file.extension !== 'canvas') return false;
		if (!isRootTopicNode(canvas, node, this.canvasApi)) return false;
		const title = deriveCanvasTitle(node.text);
		if (!title) return false;
		await this.syncParentLinkedCardTitle(canvas, title, file);
		if (!this.settings.renameCanvasFromRootTopic) return false;
		// A canvas may hold floating cards beside its map. Rename only when this
		// root is the single branching map, so several real maps never fight
		// over the filename.
		const forest = buildForest(canvas);
		const competingMaps = forest.filter(
			(tree) =>
				tree.canvasNode?.id !== node.id &&
				(tree.children?.length || 0) > 0
		);
		if (competingMaps.length > 0) return false;
		if (title === file.basename) return false;
		const target = allocateFilePath(
			file.parent?.path || '',
			title,
			'canvas',
			(candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate))
		);
		if (target === file.path) return false;
		try {
			await this.app.fileManager.renameFile(file, target);
			await this.syncParentLinkedCardTitle(
				canvas,
				title,
				this.app.vault.getAbstractFileByPath(target) ||
					canvas.view?.file ||
					file
			);
			return true;
		} catch (error) {
			console.error('ToMindMap: could not rename the Canvas file', error);
			return false;
		}
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
			this.runAsync(() => this.addDroppedFiles(canvas, files, position, topic), 'add dropped files');
		};
		input.addEventListener('change', handler);
		input.click();
	}
	async addDroppedFiles(canvas, files, position, topic = null) {
		if (!this.isMindmapCanvas(canvas)) return { ok: false, reason: LINK_REASON.UNOWNED_LINK };
		const MAX_FILES = 100;
		const MAX_BYTES = 256 * 1024 * 1024;
		const selected = Array.from(files || []).slice(0, MAX_FILES);
		let totalBytes = 0;
		for (const file of selected) totalBytes += Number(file?.size || 0);
		if (totalBytes > MAX_BYTES) {
			new import_obsidian5.Notice('The dropped media is too large to import safely');
			return { ok: false, reason: 'file-byte-budget' };
		}
		const sourcePath = canvas.view?.file?.path || '';
		const createdFiles = [];
		let failures = 0;
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		const markdownPath = this.verifiedMarkdownLinks.get(canvas.view?.file?.path)?.path || '';
		const queuedMarkdownApply = markdownPath
			? this.markdownModifyTimers.get(markdownPath)
			: void 0;
		if (queuedMarkdownApply !== void 0) {
			clearTimeout(queuedMarkdownApply);
			this.markdownModifyTimers.delete(markdownPath);
		}
		this.localCanvasMutations.add(canvas);
		try {
			for (const file of selected) {
				try {
					const attachmentPath = await this.app.fileManager.getAvailablePathForAttachment(
						file.name || 'Attachment',
						sourcePath
					);
					const created = await this.app.vault.createBinary(
						attachmentPath,
						await file.arrayBuffer()
					);
					createdFiles.push({ file: created, mimeType: file.type || '' });
				} catch (error) {
					failures++;
					console.error(`ToMindMap: could not add dropped file "${file.name || 'Attachment'}"`, error);
				}
			}
			if (createdFiles.length === 0) {
				new import_obsidian5.Notice('Could not add the dropped files');
				return { ok: false, reason: LINK_REASON.FAILED, failures };
			}
			const nodes = [];
			let cursorY = topic ? topic.y : Number(position?.y) || 0;
			const startX = topic ? topic.x + topic.width + this.settings.horizontalGap : Number(position?.x) || 0;
			for (const { file, mimeType } of createdFiles) {
				let id = genId();
				while (canvas.nodes.has(id)) id = genId();
				const nodeSpec = createFileNodeSpec(file.path, mimeType, { x: startX, y: cursorY }, this.settings, id);
				if (!nodeSpec) throw new Error('Could not create a media card');
				nodes.push(nodeSpec);
				cursorY += nodeSpec.height + this.settings.verticalGap;
			}
			canvas.importData({ nodes, edges: [] });
			if (nodes.some((spec) => !canvas.nodes.has(spec.id))) throw new Error('Canvas did not materialize imported media');
			this.canvasApi.invalidateEdgeIndex();
			if (topic) {
				for (const spec of nodes) {
					const childNode = canvas.nodes.get(spec.id);
					if (childNode) this.connectTopics(canvas, topic, childNode);
				}
			} else {
				this.attachNearbyOrphanMedia(canvas, nodes.map((node) => node.id));
				const first = canvas.nodes.get(nodes[0].id);
				if (first) this.canvasApi.selectForNavigation(canvas, first, this.settings.navigationZoomPadding);
			}
			canvas.requestSave();
			await flushCanvasView(canvas, this.app.vault);
			const added = createdFiles.length;
			new import_obsidian5.Notice(`Added ${added} file${added === 1 ? '' : 's'} to the mind map${failures > 0 ? ` · ${failures} could not be read` : ''}`);
			return { ok: true, imported: added, failures };
		} catch (error) {
			try { canvas.setData(beforeData); } catch (_) {}
			for (const { file } of createdFiles) {
				try { await this.app.vault.delete(file); } catch (_) {}
			}
			new import_obsidian5.Notice('Could not add the dropped files');
			return { ok: false, reason: LINK_REASON.FAILED, error };
		} finally {
			this.localCanvasMutations.delete(canvas);
		}
	}
	resolveDroppedVaultFile(value, sourcePath = '') {
		const resource = decodeMediaResource(value, sourcePath);
		if (!resource.ok || resource.type !== 'vault-file') return null;
		const candidates = [];
		const addCandidate = (candidate) => {
			const normalized = String(candidate || '')
				.trim()
				.replace(/\\/g, '/')
				.replace(/^\/+/, '');
			if (normalized && !candidates.includes(normalized))
				candidates.push(normalized);
		};
		addCandidate(resource.path);
		if (!resource.protocol && resource.sourceDirectory) {
			addCandidate(`${resource.sourceDirectory}/${resource.path}`);
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
			const suffix = `/${candidate}`;
			const matches = files.filter((file) => `/${file.path}`.endsWith(suffix));
			if (matches.length === 1) return matches[0];
		}
		return null;
	}
	async addDroppedUrl(canvas, url, position, topic = null) {
		if (!this.isMindmapCanvas(canvas)) return { ok: false, reason: LINK_REASON.UNOWNED_LINK };
		const resource = decodeMediaResource(url, canvas.view?.file?.path || '');
		if (!resource.ok) {
			new import_obsidian5.Notice(`Could not read the dropped resource: ${resource.reason}`);
			return { ok: false, reason: LINK_REASON.FAILED };
		}
		const sourcePath = canvas.view?.file?.path || '';
		const vaultFile = this.resolveDroppedVaultFile(url, sourcePath);
		if (resource.type === 'vault-file' && !vaultFile) {
			new import_obsidian5.Notice(`Could not resolve the dropped vault file: ${url}`);
			return { ok: false, reason: LINK_REASON.MISSING_TARGET };
		}
		let id = genId();
		while (canvas.nodes.has(id)) id = genId();
		const startX = topic ? topic.x + topic.width + this.settings.horizontalGap : Number(position?.x) || 0;
		const startY = topic ? topic.y : Number(position?.y) || 0;
		const nodeSpec = vaultFile
			? createFileNodeSpec(
					vaultFile.path,
					vaultFile.extension ? `application/${vaultFile.extension}` : '',
					{ x: startX, y: startY },
					this.settings,
					id
				)
			: createLinkNodeSpec(url, { x: startX, y: startY }, this.settings, id);
		if (!nodeSpec) {
			new import_obsidian5.Notice('Could not create a card for that resource');
			return { ok: false, reason: LINK_REASON.FAILED };
		}
		const beforeData = JSON.parse(JSON.stringify(canvas.getData()));
		try {
			canvas.importData({ nodes: [nodeSpec], edges: [] });
			const node = canvas.nodes.get(id);
			if (!node) throw new Error('Canvas did not materialize the resource card');
			this.canvasApi.invalidateEdgeIndex();
			if (topic) {
				this.connectTopics(canvas, topic, node);
				if (this.canvasApi.getParentNode(canvas, node)?.id !== topic.id)
					throw new Error('The resource could not be connected to the selected topic');
			} else {
				this.canvasApi.selectForNavigation(canvas, node, this.settings.navigationZoomPadding);
			}
			canvas.requestSave();
			await flushCanvasView(canvas, this.app.vault);
			new import_obsidian5.Notice('Added link to the mind map');
			return { ok: true, node };
		} catch (error) {
			try { canvas.setData(beforeData); } catch (_) {}
			new import_obsidian5.Notice('Could not add the dropped resource');
			return { ok: false, reason: LINK_REASON.FAILED, error };
		}
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
		const resource = decodeMediaResource(target, sourcePath);
		if (!resource.ok) return false;
		if (resource.type !== 'vault-file') return true;
		const candidates = [resource.path, resource.path.replace(/^\/+/, '')];
		if (!resource.protocol && resource.sourceDirectory)
			candidates.push(`${resource.sourceDirectory}/${resource.path}`);
		for (const candidate of candidates) {
			const resolved = this.app.metadataCache.getFirstLinkpathDest(
				candidate,
				sourcePath
			);
			if (resolved) return true;
			const normalized =
				typeof import_obsidian5.normalizePath === 'function'
					? (0, import_obsidian5.normalizePath)(candidate)
					: candidate.replace(/\\/g, '/').replace(/\/+/g, '/');
			if (this.app.vault.getAbstractFileByPath(normalized)) return true;
		}
		return false;
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
			const targets = MarkdownMindMapCodec.extractLocalMediaTargets(node.text || '')
				.map((target) => decodeMediaResource(target, sourcePath))
				.filter((resource) => resource.ok && resource.type === 'vault-file')
				.map((resource) => resource.path);
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
			const previousMissing = node.nodeEl.getAttribute?.('data-tomindmap-missing-media');
			node.nodeEl.removeClass('tomindmap-missing-media');
			node.nodeEl.removeAttribute('data-tomindmap-missing-media');
			if (previousMissing?.startsWith('Missing media: '))
				node.nodeEl.removeAttribute('aria-label');
			const missing = markers[node.id];
			if (!Array.isArray(missing) || missing.length === 0) continue;
			const description = `Missing: ${missing.join(', ')}`;
			node.nodeEl.addClass('tomindmap-missing-media');
			node.nodeEl.setAttribute('data-tomindmap-missing-media', description);
			node.nodeEl.setAttribute('aria-label', `Missing media: ${missing.join(', ')}`);
		}
	}
	async prepareCanvasForExport(canvas, includeNestedMaps = false) {
		if (!includeNestedMaps) return canvas;
		const sourceData = canvas.getData();
		const cache = new Map();
		const active = new Set([canvasPathFor(canvas)].filter(Boolean));
		let sequence = 0;
		const MAX_NESTED_DEPTH = 32;
		const MAX_EXPORT_NODES = 20000;
		const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
		const budget = { nodes: 0, bytes: 0 };
		const filePathOf = (node) =>
			String(node?.file || '')
				.split('#')[0]
				.split('?')[0];
		const isNestedCard = (node) =>
			node?.type === 'file' &&
			/\.canvas$/i.test(filePathOf(node)) &&
			canvasNodeUnknownData(node)[TOMINMAP_CARD_KIND] === 'nested-map';
		const nodeText = (node) => {
			if (node?.type === 'group') return node.label || 'Group';
			if (node?.type === 'file') {
				if (node[TOMINMAP_CARD_TITLE]) return node[TOMINMAP_CARD_TITLE];
				const path = filePathOf(node);
				return path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'File';
			}
			return MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node));
		};
		const rectOf = (node) => {
			const x = Number(node?.x);
			const y = Number(node?.y);
			const width = Number(node?.width);
			const height = Number(node?.height);
			if (
				![x, y, width, height].every(Number.isFinite) ||
				width <= 0 || height <= 0 || width > 100000 || height > 100000
			) throw new Error('Nested export geometry is invalid');
			return { x, y, width, height };
		};
		const intersects = (left, right, gap = 42) =>
			!(
				left.x + left.width + gap <= right.x ||
				right.x + right.width + gap <= left.x ||
				left.y + left.height + gap <= right.y ||
				right.y + right.height + gap <= left.y
			);
		const groupBounds = (nodes) => {
			const rects = nodes.map(rectOf);
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const item of rects) {
				minX = Math.min(minX, item.x);
				minY = Math.min(minY, item.y);
				maxX = Math.max(maxX, item.x + item.width);
				maxY = Math.max(maxY, item.y + item.height);
			}
			return {
				x: minX,
				y: minY,
				width: Math.max(1, maxX - minX),
				height: Math.max(1, maxY - minY)
			};
		};
		const translate = (nodes, dx, dy) =>
			nodes.map((node) => ({ ...node, x: (Number(node.x) || 0) + dx, y: (Number(node.y) || 0) + dy }));
		const placeGroup = (nodes, anchor, occupied) => {
			if (nodes.length === 0) return [];
			const root = nodes[0];
			const base = translate(
				nodes,
				rectOf(anchor).x - rectOf(root).x,
				rectOf(anchor).y - rectOf(root).y
			);
			const bounds = groupBounds(base);
			const stepX = Math.max(120, bounds.width + 72);
			const stepY = Math.max(100, bounds.height + 72);
			const candidates = [
				[0, 0],
				[stepX, 0],
				[-stepX, 0],
				[0, stepY],
				[0, -stepY],
				[stepX, stepY],
				[-stepX, stepY],
				[stepX, -stepY],
				[-stepX, -stepY]
			];
			for (const [dx, dy] of candidates) {
				const candidate = translate(base, dx, dy);
				const candidateBounds = groupBounds(candidate);
				if (
					occupied.every((item) => !intersects(candidateBounds, item))
				)
					return candidate;
			}
			for (let ring = 2; ring <= 12; ring++) {
				for (const [dx, dy] of [
					[1, 0],
					[0, 1],
					[-1, 0],
					[0, -1],
					[1, 1],
					[-1, 1],
					[1, -1],
					[-1, -1]
				]) {
					const candidate = translate(
						base,
						dx * stepX * ring,
						dy * stepY * ring
					);
					const candidateBounds = groupBounds(candidate);
					if (
						occupied.every(
							(item) => !intersects(candidateBounds, item)
						)
					)
						return candidate;
				}
			}
			let occupiedBottom = rectOf(anchor).y;
			for (const item of occupied)
				occupiedBottom = Math.max(occupiedBottom, item.y + item.height);
			return translate(
				base,
				0,
				occupiedBottom + stepY - rectOf(base).y
			);
		};
		const loadCanvas = async (path) => {
			if (!path || active.has(path) || !isCanonicalVaultPath(path) || !/\.canvas$/i.test(path))
				return null;
			if (cache.has(path)) return cache.get(path);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof import_obsidian5.TFile)) {
				cache.set(path, null);
				return null;
			}
			if (Number.isFinite(file.size) && file.size > MAX_EXPORT_BYTES) {
				cache.set(path, null);
				return null;
			}
			try {
				const raw = await this.app.vault.cachedRead(file);
				const bytes = new TextEncoder().encode(raw).byteLength;
				if (bytes > MAX_EXPORT_BYTES) {
					cache.set(path, null);
					return null;
				}
				budget.bytes += bytes;
				if (budget.bytes > MAX_EXPORT_BYTES) throw new Error('Nested export byte budget exceeded');
				const data = JSON.parse(raw);
				if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges))
					throw new Error('Nested Canvas schema is invalid');
				cache.set(path, data);
				return data;
			} catch (error) {
				if (/Nested export (?:byte|node|depth) budget exceeded/.test(String(error?.message || "")))
					throw error;
				console.warn(`ToMindMap: could not read nested map ${path}`, error);
				cache.set(path, null);
				return null;
			}
		};
		const expandLevel = async (
			data,
			prefix,
			occupied,
			ancestry,
			ownerPath = canvasPathFor(canvas),
			depth = 0
		) => {
			if (depth > MAX_NESTED_DEPTH)
				throw new Error('Nested export depth budget exceeded');
			const sourceNodes = Array.isArray(data?.nodes) ? data.nodes : [];
			budget.nodes += sourceNodes.length;
			if (budget.nodes > MAX_EXPORT_NODES)
				throw new Error('Nested export node budget exceeded');
			const nodes = sourceNodes.map((node) => ({
				...node,
				id: `${prefix}${node.id}`
			}));
			const byId = new Map(nodes.map((node) => [node.id, node]));
			const sourceEdges = Array.isArray(data?.edges) ? data.edges : [];
			const output = [];
			const outputEdges = [];
			const replacements = new Map();
			const replacementsAll = new Map();
			const nestedCards = new Set(
				nodes.filter((node) => isNestedCard(node)).map((node) => node.id)
			);
			const occupiedHere = occupied.slice();
			for (const node of nodes) {
				if (!nestedCards.has(node.id)) {
					output.push(node);
					occupiedHere.push(rectOf(node));
				}
			}
			for (const node of nodes) {
				if (!nestedCards.has(node.id)) continue;
				const path = filePathOf(node);
				const nested = await loadCanvas(path);
				const parentLink = nested?.mindmapParent;
				const ownedParent =
					Boolean(parentLink) &&
					parentLink.canvas === ownerPath &&
					this.markdownOwnership
						.recordsForCanvas(path)
						.some(
							(record) =>
								record.kind === 'parent' &&
								record.targetPath === ownerPath &&
								record.nodeId === parentLink.nodeId &&
								record.proof === parentLink.proof
						);
				if (!nested || !ownedParent || ancestry.has(path)) {
					output.push(node);
					occupiedHere.push(rectOf(node));
					continue;
				}
				const childPrefix = `${prefix}map-${sequence++}-`;
				const child = await expandLevel(
					nested,
					childPrefix,
					occupiedHere,
					new Set([...ancestry, path]),
					path,
					depth + 1
				);
				if (child.nodes.length === 0) {
					output.push(node);
					occupiedHere.push(rectOf(node));
					continue;
				}
				const childRootId = child.rootIds[0] || child.nodes[0]?.id;
				const childRoot =
					child.nodes.find((item) => item.id === childRootId) ||
					child.nodes[0];
				const orderedChildNodes = childRoot
					? [
							childRoot,
							...child.nodes.filter((item) => item.id !== childRoot.id)
						]
					: [];
				const placed = placeGroup(
					orderedChildNodes,
					node,
					occupiedHere
				);
				output.push(...placed);
				outputEdges.push(...child.edges);
				for (const placedNode of placed) occupiedHere.push(rectOf(placedNode));
				replacements.set(node.id, child.rootIds);
				replacementsAll.set(node.id, child.nodes.map((item) => item.id));
			}
			const mapEndpoint = (id) => replacements.get(id) || [id];
			for (const [edgeIndex, edge] of sourceEdges.entries()) {
				const fromValues = mapEndpoint(`${prefix}${edge.fromNode}`);
				const toValues = mapEndpoint(`${prefix}${edge.toNode}`);
				if (!byId.has(`${prefix}${edge.fromNode}`) || !byId.has(`${prefix}${edge.toNode}`))
					continue;
				for (const fromNode of fromValues) {
					for (const toNode of toValues) {
						outputEdges.push({
							...edge,
							id: `${prefix}edge-${edge.id || edgeIndex}`,
							fromNode,
							toNode
						});
					}
				}
			}
			const incoming = new Set(outputEdges.map((edge) => edge.toNode));
			const rootIds = output
				.filter((node) => !incoming.has(node.id))
				.map((node) => node.id);
			if (rootIds.length === 0 && output.length > 0) rootIds.push(output[0].id);
			return {
				nodes: output,
				edges: outputEdges,
				rootIds,
				replacements,
				replacementsAll
			};
		};
		const expanded = await expandLevel(sourceData, '', [], active);
		const exportPlan = createExportPlan({
			title: canvas.view?.file?.basename || 'Mind map',
			nodes: expanded.nodes,
			edges: expanded.edges
		}, {
			replacements: expanded.replacements,
			strictEdges: false
		});
		const exportData = {
			...sourceData,
			nodes: exportPlan.topics,
			edges: exportPlan.edges
		};
		const wrapperRect =
			canvas.wrapperEl?.getBoundingClientRect?.() || {
				left: 0,
				top: 0,
				width: 0,
				height: 0
			};
		const referenceNode = Array.from(canvas.nodes.values()).find(
			(node) =>
				node.nodeEl &&
				typeof node.nodeEl.getBoundingClientRect === 'function' &&
				node.width
		);
		const referenceRect = referenceNode?.nodeEl?.getBoundingClientRect?.();
		const exportScale =
			referenceRect && referenceNode?.width
				? referenceRect.width / referenceNode.width
				: 1;
		const exportOffsetX = referenceRect
			? referenceRect.left - referenceNode.x * exportScale
			: wrapperRect.left;
		const exportOffsetY = referenceRect
			? referenceRect.top - referenceNode.y * exportScale
			: wrapperRect.top;
		const exportNodeElement = (node) => {
			const x = exportOffsetX + (Number(node.x) || 0) * exportScale;
			const y = exportOffsetY + (Number(node.y) || 0) * exportScale;
			const width = (Number(node.width) || 260) * exportScale;
			const height = (Number(node.height) || 60) * exportScale;
			return {
				ownerDocument: canvas.wrapperEl?.ownerDocument || document,
				parentElement: canvas.wrapperEl || null,
				querySelector: () => null,
				matches: () => false,
				getBoundingClientRect: () => ({
					left: x,
					top: y,
					right: x + width,
					bottom: y + height,
					width,
					height
				})
			};
		};
		const rawSelection = new Set();
		for (const item of canvas.selection || []) {
			const id = typeof item === 'string' ? item : item?.id || item?.node?.id;
			if (id) rawSelection.add(id);
		}
		try {
			const forest = buildForest(canvas, { includeHidden: true });
			for (const id of Array.from(rawSelection)) {
				const treeNode = findTreeForNode(forest, id);
				if (treeNode) {
					for (const desc of getDescendants(treeNode)) {
						const descId = desc.id || desc.canvasNode?.id;
						if (descId) rawSelection.add(descId);
					}
				}
			}
		} catch (_) {}
		const exportSelection = new Set();
		for (const id of rawSelection) {
			const allMapped = expanded.replacementsAll?.get(id) || expanded.replacements?.get(id) || [id];
			for (const childId of allMapped) exportSelection.add(childId);
		}
		const queue = Array.from(exportSelection);
		const outgoing = new Map();
		const addEdge = (u, v) => {
			if (!u || !v || u === v) return;
			if (!outgoing.has(u)) outgoing.set(u, []);
			outgoing.get(u).push(v);
		};
		for (const edge of exportData.edges || []) {
			if (edge.fromEnd === 'arrow' && edge.toEnd !== 'arrow') {
				addEdge(edge.toNode, edge.fromNode);
			} else {
				addEdge(edge.fromNode, edge.toNode);
			}
		}
		while (queue.length > 0) {
			const curr = queue.shift();
			for (const next of outgoing.get(curr) || []) {
				if (!exportSelection.has(next)) {
					exportSelection.add(next);
					queue.push(next);
				}
			}
		}
		const syntheticNodes = new Map(
			expanded.nodes.map((node) => {
				const existing = canvas.nodes?.get?.(node.id);
				return [
					node.id,
					{
						...node,
						id: node.id,
						x: Number(node.x) || 0,
						y: Number(node.y) || 0,
						width: Number(node.width) || 260,
						height: Number(node.height) || 60,
						color: node.color || existing?.color || '',
						text: nodeText(node),
						unknownData: { ...(node.unknownData || existing?.unknownData || {}) },
						nodeEl: existing?.nodeEl || exportNodeElement(node),
						contentEl: existing?.contentEl || null
					}
				];
			})
		);
		const syntheticEdges = new Map(
			exportData.edges.map((edge) => [
				edge.id,
				{
					...edge,
					from: { node: syntheticNodes.get(edge.fromNode), side: edge.fromSide },
					to: { node: syntheticNodes.get(edge.toNode), side: edge.toSide }
				}
			])
		);
		return {
			wrapperEl: canvas.wrapperEl,
			view: canvas.view,
			selection: exportSelection,
			nodes: syntheticNodes,
			edges: syntheticEdges,
			exportPlan,
			getData: () => exportData
		};
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
			await this.exportMindMapPdf(
				canvas,
				scope,
				request.includeNestedMaps
			);
			return;
		}
		let exportCanvas;
		let base;
		let scopeName;
		const rasterSession = createRasterExportSession();
		try {
			exportCanvas = await this.prepareCanvasForExport(
				canvas,
				request.includeNestedMaps
			);
			base =
				canvas.view && canvas.view.file
					? canvas.view.file.basename
					: 'Mind map';
			scopeName =
				scope === 'whole'
					? 'Whole map'
					: scope === 'viewport'
						? 'Viewport'
						: 'Selection';
			if (request.format === 'markdown') {
				const encoded = this.encodeMarkdownDocument(exportCanvas, {
					includeFrontmatter: false
				});
				if (!encoded.ok) throw new Error(encoded.reason);
				const markdown = encoded.value.markdown;
				const filename = await this.deliverExport({
					baseName: base,
					suffix: 'Mind map',
					extension: 'md',
					content: markdown
				});
				new import_obsidian5.Notice(`Saved Markdown: ${filename}`);
				return;
			}
			if (request.format === 'freemind') {
				let forest = buildForest(exportCanvas, { includeHidden: true });
				if (scope === 'selection') {
					const selectedIds = new Set();
					for (const item of exportCanvas.selection || canvas.selection || []) {
						const id = typeof item === 'string' ? item : item?.id || item?.node?.id;
						if (id) selectedIds.add(id);
					}
					const selectedTrees = [];
					for (const root of forest) {
						if (selectedIds.has(root.canvasNode?.id || root.id)) {
							selectedTrees.push(root);
						} else {
							for (const desc of getDescendants(root)) {
								if (selectedIds.has(desc.canvasNode?.id || desc.id)) {
									selectedTrees.push(desc);
								}
							}
						}
					}
					if (selectedTrees.length > 0) forest = selectedTrees;
				}
				const xml = exportToFreeMind(forest, { title: base });
				const filename = await this.deliverExport({
					baseName: base,
					suffix: scopeName,
					extension: 'mm',
					content: xml
				});
				new import_obsidian5.Notice(`Saved FreeMind: ${filename}`);
				return;
			}
			const html = canvasPrintDocument(exportCanvas, scope);
			if (!html)
				throw new Error('Nothing is available in that export area');
			const embedded = await embedDocumentAssets(
				html,
				this.exportAssetResolvers()
			);
			if (request.format === 'svg') {
				const svg = pdfSvgFromDocument(embedded, true);
				if (!svg) throw new Error('Could not build SVG');
				const filename = await this.deliverExport({
					baseName: base,
					suffix: scopeName,
					extension: 'svg',
					content: svg.svg
				});
				new import_obsidian5.Notice(`Saved SVG: ${filename}`);
				return;
			}
			if (request.format === 'png') {
				const ownerDocument =
					exportCanvas.wrapperEl.ownerDocument || document;
				let svg = pdfSvgFromDocument(embedded, false);
				if (!svg) throw new Error('Could not build image');
				let bytes;
				try {
					bytes = await rasterizeSvg(svg, ownerDocument, 'image/png', {
						session: rasterSession
					});
				} catch (error) {
					console.warn(
						'ToMindMap: rich image rendering failed; using portable text SVG',
						error
					);
					svg = pdfSvgFromDocument(embedded, true);
					if (!svg) throw error;
					bytes = await rasterizeSvg(svg, ownerDocument, 'image/png', {
						session: rasterSession
					});
				}
				const filename = await this.deliverExport({
					baseName: base,
					suffix: scopeName,
					extension: 'png',
					content: bytes
				});
				new import_obsidian5.Notice(`Saved PNG: ${filename}`);
			}
		} catch (error) {
			console.error('ToMindMap: export failed', error);
			new import_obsidian5.Notice(
				`Could not export ${request.format.toUpperCase()}`
			);
		}
	}
	async exportMindMapPdf(canvas, scope, includeNestedMaps = false) {
		try {
			const exportCanvas = await this.prepareCanvasForExport(
				canvas,
				includeNestedMaps
			);
			const html = canvasPrintDocument(exportCanvas, scope);
			if (!html) {
				new import_obsidian5.Notice(
					scope === 'selection'
						? 'Select at least one card to export'
						: 'Nothing is available in that export area'
				);
				return;
			}
			const embedded = await embedDocumentAssets(
				html,
				this.exportAssetResolvers()
			);
			// Use the exact same canonical SVG as the SVG export. The PDF renderer
			// embeds that vector document directly instead of rebuilding the map.
			const svgInfo = pdfSvgFromDocument(embedded, false);
			if (!svgInfo) throw new Error('Could not build the mind map SVG');
			const pdfLayout = paginatedPdfDocument(embedded, svgInfo);
			const pdf = await renderHtmlAsVectorPdf(embedded, svgInfo, null, {
				document: pdfLayout,
				ownerDocument: canvas.wrapperEl.ownerDocument || document
			});
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
			const filename = await this.deliverExport({
				baseName: base,
				suffix: scopeName,
				extension: 'pdf',
				content: pdf
			});
			new import_obsidian5.Notice(`Saved PDF: ${filename}`);
		} catch (error) {
			console.error('ToMindMap: PDF export failed', error);
			const detail = error instanceof Error ? `: ${error.message}` : '';
			new import_obsidian5.Notice(`Could not export PDF${detail}`);
		}
	}
	/**
	 * Vault assets are the default. HTTPS assets are reachable only after the
	 * user explicitly approves their exact origin, and local file URLs are
	 * never given an implicit filesystem reader.
	 */
	exportAssetResolvers() {
		const vault = this.app.vault;
		const readVaultFile = async (path) => {
			const file = vault.getAbstractFileByPath(path);
			if (!(file instanceof import_obsidian5.TFile)) return null;
			try {
				if (typeof vault.readBinary === 'function')
					return await vault.readBinary(file);
				if (typeof vault.adapter?.readBinary === 'function')
					return await vault.adapter.readBinary(file.path);
				return null;
			} catch (error) {
				console.warn(`ToMindMap: could not read "${path}" for export`, error);
				return null;
			}
		};
		return {
			assetResolver: createExportAssetResolver({ readVaultFile })
		};
	}
	/**
	 * Obsidian's platform flag, not loader syntax, selects export delivery.
	 * Desktop writes with exclusive filesystem creation; mobile uses the
	 * browser download adapter when those capabilities are present.
	 */
	exportDeliveryCapabilities() {
		const platform = import_obsidian5.Platform || {};
		const ownerWindow = typeof window === 'undefined' ? null : window;
		const ownerDocument = ownerWindow?.document || globalThis.document || null;
		let filesystem = null;
		if (platform.isDesktopApp === true && typeof require === 'function') {
			try {
				const fs = require('fs');
				const path = require('path');
				const os = require('os');
				fsystem = {
					fs,
					path,
					directory: path.join(os.homedir(), 'Downloads')
				};
			} catch (_) {
				filesystem = null;
			}
		}
		const canDownloadFiles = Boolean(
			ownerWindow &&
			typeof ownerWindow.Blob === 'function' &&
			ownerWindow.URL?.createObjectURL &&
			ownerWindow.URL?.revokeObjectURL &&
			ownerDocument?.createElement &&
			ownerDocument?.body?.appendChild
		);
		return {
			canWriteDownloads: Boolean(filesystem),
			canDownloadFiles,
			filesystem,
			browser: { window: ownerWindow, document: ownerDocument },
			maxOutputBytes: 64 * 1024 * 1024
		};
	}
	deliverExport(request) {
		return createExportDelivery(this.exportDeliveryCapabilities()).deliver(request);
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
				let created = null;
				let canvasPath = '';
				try {
					const xml = await file.text();
					const decoded = decodeFreeMind(xml, {
						budgets: DEFAULT_FREEMIND_BUDGETS,
						nodeWidth: this.settings.defaultNodeWidth,
						nodeHeight: this.settings.defaultNodeHeight,
						maxNodeHeight: this.settings.maxNodeHeight,
						horizontalGap: this.settings.horizontalGap,
						verticalGap: this.settings.verticalGap
					});
					if (!decoded.ok) {
						const detail = decoded.reason === FREEMIND_REASON.EXTERNAL_ENTITY
							? 'external entities are not allowed'
							: decoded.reason;
						new import_obsidian5.Notice(`Could not import the FreeMind file: ${detail}`);
						return;
					}
					const { roots, nodeCount, maxDepth, ...canvasData } = decoded.value;
					canvasData.mindmap = true;
					canvasData.mindmapPendingResize = canvasData.nodes.map((node) => node.id);
					const baseName = file.name.replace(/\.mm$/i, '') || 'Mind map';
					canvasPath = allocateFilePath(
						folderPath || '',
						baseName,
						'canvas',
						(candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate))
					);
					created = await this.app.vault.create(
						canvasPath,
						JSON.stringify(canvasData, null, '\t')
					);
					await this.app.workspace.getLeaf(false).openFile(created);
					new import_obsidian5.Notice(
						`Imported "${file.name}" as "${created.path}"`
					);
				} catch (error) {
					if (created) {
						try { await this.app.vault.delete(created); } catch (_) {}
					}
					console.error('ToMindMap: FreeMind import failed', error);
					new import_obsidian5.Notice('Could not import the FreeMind file');
				}
			})();
		};
		input.addEventListener('change', handler);
		input.click();
	}
	isMindmapCanvas(canvas) {
		try {
			if (!canvas || typeof canvas.getData !== 'function') return false;
			const data = canvas.getData();
			if (!data || typeof data !== 'object') return false;
			if (typeof data.mindmap === 'boolean') return data.mindmap;
			return this.settings.defaultMindmapMode;
		} catch (_) {
			return false;
		}
	}
	isAutoAdjustCanvas(canvas) {
		return this.isMindmapCanvas(canvas);
	}
	runMindMapAction(name, canvas, action, ...args) {
		if (!canvas || !this.isMindmapCanvas(canvas) || typeof action !== 'function')
			return { ok: false, reason: 'ineligible' };
		try {
			return { ok: true, value: action(...args) };
		} catch (error) {
			console.error(`ToMindMap: ${name} failed`, error);
			new import_obsidian5.Notice(`Could not ${name}`);
			return { ok: false, reason: 'failed', error };
		}
	}
	createMindMapActionSurface(canvas) {
		const surface = {};
		for (const name of [
			'startEditing',
			'addChild',
			'addSibling',
			'addParent',
			'reorderTopic',
			'deleteBranch',
			'deleteSingleTopic'
		]) {
			surface[name] = (...args) =>
				this.runMindMapAction(
					name,
					canvas,
					this.keyboardHandler[name]?.bind(this.keyboardHandler),
					...args
				).value;
		}
		return surface;
	}
	captureCanvasDecorations(canvas) {
		if (!canvas || this.canvasDecorationState.has(canvas)) return;
		const classes = [
			'tomindmap-collapsed-hidden',
			'tomindmap-collapsed-node',
			'tomindmap-navigation-selected',
			'mindmap-group-animating',
			'tomindmap-media-dragging',
			'tomindmap-plain-card',
			'tomindmap-resizable-content',
			ROOT_TOPIC_CLASS,
			'tomindmap-title-only-card',
			'tomindmap-file-card',
			'tomindmap-missing-media'
		];
		const attributes = [
			'data-node-type',
			'data-tomindmap-card-title',
			'data-tomindmap-card-kind',
			'data-tomindmap-missing-media',
			'aria-label'
		];
		const elements = new Map();
		const remember = (element) => {
			if (!element || elements.has(element)) return;
			elements.set(element, {
				classes: Object.fromEntries(
					classes.map((name) => [name, Boolean(element.hasClass?.(name))])
				),
				attributes: Object.fromEntries(
					attributes.map((name) => [name, element.getAttribute?.(name) ?? null])
				)
			});
		};
		for (const node of canvas.nodes?.values?.() || []) {
			const nodeElement = node.nodeEl;
			const shell = nodeElement?.matches?.('.canvas-node')
				? nodeElement
				: nodeElement?.closest?.('.canvas-node') || nodeElement?.querySelector?.('.canvas-node') || nodeElement;
			remember(nodeElement);
			remember(node.containerEl);
			remember(shell);
			let controlsOwner = shell;
			let ancestor = shell?.parentElement || null;
			const selected = canvas.selection?.has?.(node) || canvas.selection?.has?.(node.id);
			for (
				let depth = 0;
				selected && ancestor && ancestor !== canvas.wrapperEl && depth < 4;
				depth++
			) {
				const ownsResizeControl = Array.from(ancestor.children || []).some((child) =>
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
			remember(controlsOwner);
			for (const resizer of controlsOwner?.querySelectorAll?.(
				".canvas-node-resizer, .canvas-node-resizers, .canvas-node-resize-handle, [class*='resizer']"
			) || []) remember(resizer);
		}
		const edgeStyles = [];
		for (const edge of canvas.edges?.values?.() || []) {
			for (const element of [
				edge.lineGroupEl,
				edge.lineEndGroupEl,
				edge.el,
				edge.edgeEl
			]) {
				if (!element?.style) continue;
				edgeStyles.push([element, element.style.display ?? '']);
			}
		}
		this.canvasDecorationState.set(canvas, { elements, edgeStyles });
	}
	disposeCanvasDecorations(canvas) {
		const state = this.canvasDecorationState.get(canvas);
		if (!state) return false;
		for (const [element, snapshot] of state.elements) {
			for (const [name, enabled] of Object.entries(snapshot.classes))
				element.toggleClass?.(name, enabled);
			for (const [name, value] of Object.entries(snapshot.attributes)) {
				if (value === null) element.removeAttribute?.(name);
				else element.setAttribute?.(name, value);
			}
		}
		for (const [element, display] of state.edgeStyles)
			element.style.display = display;
		this.canvasDecorationState.delete(canvas);
		return true;
	}
	finishCanvasGesture(reason = 'cancel') {
		for (const owner of this.canvasGestureOwners) owner.finish(reason);
	}
	disposeCanvasGestures(reason = 'teardown') {
		this.finishCanvasGesture(reason);
		for (const owner of this.canvasGestureOwners) owner.dispose(reason);
		this.canvasGestureOwners.clear();
		this.cleanupNodeDragReparentHandler = null;
		this.cleanupGroupDragHandler = null;
	}
	toggleMindmapMode(canvas) {
		const data = canvas.getData();
		const newValue = !this.isMindmapCanvas(canvas);
		this.finishCanvasGesture(newValue ? 'mode-enable' : 'mode-disable');
		data.mindmap = newValue;
		delete data.mindmapAutoAdjust;
		canvas.setData(data);
		if (newValue) {
			this.captureCanvasDecorations(canvas);
			MindmapActions.syncCollapsedVisibility(canvas);
			this.layoutEngine.updateEdgeSides?.(canvas, { persist: false });
			this.updateNodeTypeAttributes(canvas);
			this.layoutEngine.layout(canvas, { preserveRootSides: true });
			if (this.settings.autoColor) this.branchColors.applyColors(canvas);
			const groupIds = getGroupIds(canvas);
			this.resizeNodesWhenRendered(
				canvas,
				Array.from(canvas.nodes.values()).filter(
					(node) => !groupIds.has(node.id)
				),
				undefined,
				{ preserveRootSides: true }
			);
			this.refreshOutline(canvas);
		} else {
			this.liveSizing.cancelQueue(canvas);
			this.liveSizing.stopWatchingCanvas(canvas);
			this.syncCanvasBindings(canvas);
			this.disposeCanvasDecorations(canvas);
			for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
				if (leaf.view instanceof OutlineView)
					leaf.view.showUnavailable('Mind-map mode is off for this canvas', canvas);
			}
		}
		canvas.requestSave();
		this.syncCanvasBindings(canvas);
		this.updateToggleButton(canvas);
	}
	injectToggleButton(canvas) {
		this.cleanupToggleHandler?.();
		this.cleanupToggleHandler = null;
		this.toggleBtnEl?.remove();
		this.toggleBtnEl = null;
		canvas.wrapperEl?.toggleClass(
			'tomindmap-mindmap-mode',
			this.isMindmapCanvas(canvas)
		);
		const container = canvas.view.containerEl;
		const controls = container.querySelector('.canvas-controls');
		if (!controls) return;
		const ownerDocument = controls.ownerDocument || document;
		const button = ownerDocument.createElement('button');
		button.type = 'button';
		button.addClass('tomindmap-toggle-btn', 'clickable-icon');
		button.setAttribute('aria-label', 'Toggle mindmap mode');
		button.setAttribute('aria-pressed', String(this.isMindmapCanvas(canvas)));
		const onToggleClick = (event) => {
			if (event.defaultPrevented) return;
			if (event.button !== undefined && event.button !== 0) return;
			if (!event.target?.closest?.('.tomindmap-toggle-btn')) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			this.toggleMindmapMode(canvas);
		};
		container.addEventListener('click', onToggleClick, true);
		this.cleanupToggleHandler = () =>
			container.removeEventListener('click', onToggleClick, true);
		controls.prepend(button);
		this.toggleBtnEl = button;
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
		this.toggleBtnEl.setAttribute('aria-pressed', String(isActive));
		this.toggleBtnEl.setAttribute(
			'aria-label',
			isActive
				? 'Mindmap mode: Enter sibling · Tab child · Type to edit'
				: 'Mindmap mode (inactive)'
		);
	}
	selectAndEditTracked(canvas, node, padding) {
		if (!canvas || !node) return;
		this.canvasApi.selectAndZoom?.(canvas, node, padding);
		this.trackedTimeout(() => {
			if (
				this.unloaded ||
				this.interceptedCanvas !== canvas ||
				!canvas.nodes?.has?.(node.id) ||
				canvas.nodes.get(node.id) !== node
			)
				return;
			node.nodeEl?.removeClass?.('tomindmap-navigation-selected');
			node.startEditing?.();
		}, 50);
	}
	/** Schedule a setTimeout that is automatically cancelled on unload/canvas switch. */
	trackedTimeout(callback, ms) {
		const id = setTimeout(() => {
			this.pendingTimers.delete(id);
			callback();
		}, ms);
		this.pendingTimers.add(id);
		return id;
	}
	/** Schedule a requestAnimationFrame that is automatically cancelled on cleanup. */
	trackedRaf(callback) {
		const id = requestAnimationFrame(() => {
			this.pendingRafs.delete(id);
			callback();
		});
		this.pendingRafs.add(id);
		return id;
	}
	/** Cancel all pending tracked timers, RAFs, and observers. */
	cancelPendingAsync(canvas = this.interceptedCanvas) {
		if (this.liveSizing) {
			this.liveSizing.cancelQueue(canvas);
			this.liveSizing.stopWatchingCanvas(canvas);
		}
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
			if (this.origCanvasMethods.removeNode) {
				this.interceptedCanvas.removeNode =
					this.origCanvasMethods.removeNode;
			}
		}
		this.interceptedCanvas = null;
		this.origCanvasMethods = {};
	}
	runAsync(task, label = 'async action') {
		Promise.resolve()
			.then(() => task())
			.catch((error) => {
				console.error(`ToMindMap: ${label} failed`, error);
				new import_obsidian5.Notice(`${label} failed`);
			});
	}
	pluginData() {
		return {
			schema: 'tomindmap.plugin-data',
			version: 1,
			settings: this.settings,
			ownership: this.markdownOwnership.toJSON()
		};
	}
	persistPluginData(extra = {}) {
		if (this.unloaded) return Promise.resolve(false);
		const payload = { ...this.pluginData(), ...extra };
		const write = this.persistenceQueue
			.catch(() => {})
			.then(() => {
				if (this.unloaded) return false;
				return this.saveData(payload);
			});
		this.persistenceQueue = write.catch(() => {});
		return write;
	}
	async loadSettings() {
		const stored = (await this.loadData()) || {};
		const settings = stored.settings && typeof stored.settings === 'object'
			? stored.settings
			: stored;
		this.settings = normalizeSettings(settings);
		const loadedOwnership = loadMarkdownSyncOwnership(
			stored.ownership || stored.markdownSyncOwnership || stored.tomindmapMarkdownSyncOwnership
		);
		if (loadedOwnership?.isValid()) this.markdownOwnership = loadedOwnership;
		if (stored.schema !== 'tomindmap.plugin-data' || !loadedOwnership?.isValid() ||
			JSON.stringify(this.settings) !== JSON.stringify(settings))
			await this.persistPluginData();
	}
	async saveSettings() {
		this.settings = normalizeSettings(this.settings);
		await this.persistPluginData();
		this.layoutEngine = new LayoutEngine({
			horizontalGap: this.settings.horizontalGap,
			verticalGap: this.settings.verticalGap,
			nodeWidth: this.settings.defaultNodeWidth,
			nodeHeight: this.settings.defaultNodeHeight,
			// Canvas edges update synchronously; animating only the cards makes
			// the visible graph temporarily disagree with its edge geometry.
			animate: false
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
		this.applyCanvasCommandRename();
		this.updateRibbonIcon();
		this.syncCanvasBindings(this.interceptedCanvas);
	}

	updateRibbonIcon() {
		if (this.settings.createNewMindMapRibbon) {
			if (!this.ribbonIconEl && typeof this.addRibbonIcon === 'function') {
				this.ribbonIconEl = this.addRibbonIcon('git-fork', 'Create new mind map', () => {
					this.runAsync(() => this.createNewMindMap(), 'create new mind map');
				});
			}
		} else if (this.ribbonIconEl) {
			this.ribbonIconEl.remove?.();
			this.ribbonIconEl = null;
		}
	}

	applyCanvasCommandRename(restore = false) {
		const cmd = this.app.commands?.commands?.['canvas:new-file'];
		if (cmd) {
			if (restore || !this.settings.renameCreateCanvas) {
				if (cmd.__tomindmap_orig_name) cmd.name = cmd.__tomindmap_orig_name;
			} else {
				if (!cmd.__tomindmap_orig_name) cmd.__tomindmap_orig_name = cmd.name;
				cmd.name = 'Create new mind map';
			}
		}
	}

	async createNewMindMap(targetFolder) {
		let folderPath = '';
		if (typeof targetFolder === 'string') {
			folderPath = targetFolder;
		} else {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile && activeFile.parent) {
				folderPath = activeFile.parent.path;
			} else {
				const leaves = this.app.workspace.getLeavesOfType('file-explorer');
				const focused = leaves[0]?.view?.tree?.focusedItem?.file;
				if (focused) {
					folderPath = focused instanceof import_obsidian5.TFolder ? focused.path : focused.parent?.path || '';
				}
			}
		}
		if (folderPath === '/' || folderPath === '.') folderPath = '';

		const canvasData = {
			nodes: [
				{
					id: genId(),
					type: 'text',
					text: '# Mind map',
					x: 0,
					y: 0,
					width: this.settings.defaultNodeWidth || 300,
					height: this.settings.defaultNodeHeight || 60
				}
			],
			edges: [],
			mindmap: true
		};

		const canvasPath = allocateFilePath(
			folderPath,
			'Untitled',
			'canvas',
			(candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate))
		);

		const created = await this.app.vault.create(
			canvasPath,
			JSON.stringify(canvasData, null, '\t')
		);

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(created);

		setTimeout(() => {
			const activeCanvas = this.canvasApi.getActiveCanvas();
			if (activeCanvas) {
				const root = activeCanvas.nodes?.values()?.next()?.value;
				if (root) {
					this.canvasApi.zoomToNode(activeCanvas, root, 1.2);
					this.canvasApi.startEditing(activeCanvas, root);
				}
			}
		}, 150);

		new import_obsidian5.Notice(`Created "${created.basename}"`);
		return created;
	}

	filterMindmapPaneMenu(menu) {
		const shouldHide = (text) => /better export pdf|export as image/i.test(text || '');
		const cleanItems = () => {
			if (!Array.isArray(menu?.items)) return;
			for (let i = menu.items.length - 1; i >= 0; i--) {
				const item = menu.items[i];
				const title = item.title || item.titleEl?.textContent || item.dom?.textContent || '';
				if (shouldHide(title)) {
					item.dom?.remove?.();
					if (item.dom?.style) item.dom.style.display = 'none';
					menu.items.splice(i, 1);
				}
			}
		};
		cleanItems();
		const origShowAtMouseEvent = menu.showAtMouseEvent;
		if (typeof origShowAtMouseEvent === 'function' && !menu.__tomindmap_hooked) {
			menu.__tomindmap_hooked = true;
			menu.showAtMouseEvent = function () {
				cleanItems();
				return origShowAtMouseEvent.apply(this, arguments);
			};
		}
		const origShowAtPosition = menu.showAtPosition;
		if (typeof origShowAtPosition === 'function' && !menu.__tomindmap_pos_hooked) {
			menu.__tomindmap_pos_hooked = true;
			menu.showAtPosition = function () {
				cleanItems();
				return origShowAtPosition.apply(this, arguments);
			};
		}
	}

	async checkNestedMindMapUndo(canvas) {
		const pending = this.pendingNestedMindMapUndo;
		if (!pending) return;
		const currentPath = canvas.view?.file?.path || canvas.file?.path;
		if (pending.canvas !== canvas && pending.canvasPath !== currentPath) return;
		let cardStillExists = false;
		if (canvas.nodes) {
			for (const node of canvas.nodes.values()) {
				if (node.id === pending.cardId) {
					cardStillExists = true;
					break;
				}
				const nodeFile = node.file?.path || node.file || node.filePath;
				if (nodeFile === pending.nestedPath) {
					cardStillExists = true;
					break;
				}
			}
		}
		if (!cardStillExists) {
			this.pendingNestedMindMapUndo = null;
			const file = pending.nestedFile || this.app.vault.getAbstractFileByPath(pending.nestedPath);
			if (file) {
				try {
					await this.app.vault.trash(file, true);
					this.verifiedParentLinks.delete(pending.nestedPath);
					new import_obsidian5.Notice(`Removed undone nested mind map "${file.name}"`);
				} catch (err) {
					console.warn('ToMindMap: could not remove undone nested mind map file', err);
				}
			}
		}
	}
};
