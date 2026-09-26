"use strict";

const { ItemView, Menu, Notice, SearchComponent, setIcon } = require("obsidian");
const { buildForest, getGroupIds } = require("./tree-model.js");
const MarkdownMindMapCodec = require("./markdown-codec.js");

const OUTLINE_VIEW_TYPE = "tomindmap-outline";

function canvasNodeFilePath(node) {
	const values = [
		node?.unknownData?.file,
		node?.file,
		node?.filePath,
		node?.getData?.()?.file
	];
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value?.path === "string" && value.path.trim())
			return value.path.trim();
	}
	return "";
}

function canvasNodeUrl(node) {
	const values = [node?.unknownData?.url, node?.url, node?.getData?.()?.url];
	const value = values.find(
		(candidate) => typeof candidate === "string" && candidate.trim()
	);
	return typeof value === "string" ? value.trim() : "";
}

function canvasNodeMarkdownText(node) {
	if (!node) return "Untitled";
	return MarkdownMindMapCodec.serializeTopicText({
		...node,
		text: node.text ?? node.unknownData?.text,
		file: canvasNodeFilePath(node) || undefined,
		url: canvasNodeUrl(node) || undefined
	});
}

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
		if (!canvas || typeof canvas.getData !== "function" || !canvas.nodes)
			return { ok: false, reason: "invalid-canvas" };
		const data = canvas.getData();
		if (!data || typeof data !== "object" || !Array.isArray(data.nodes) || !Array.isArray(data.edges))
			return { ok: false, reason: "invalid-canvas-data" };
		const records = new Map();
		for (const record of data.nodes) {
			if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id)
				return { ok: false, reason: "invalid-node-record" };
			if (records.has(record.id))
				return { ok: false, reason: "duplicate-node-record" };
			records.set(record.id, record);
		}
		const forest = buildForest(canvas);
		const nodes = new Map();
		const collapsibleNodeIds = [];
		const pending = [...forest].reverse();
		while (pending.length > 0) {
			const tree = pending.pop();
			const id = tree?.canvasNode?.id;
			if (typeof id !== "string" || nodes.has(id))
				return { ok: false, reason: "invalid-forest" };
			nodes.set(id, tree);
			if (tree.children.length > 0) collapsibleNodeIds.push(id);
			for (let index = tree.children.length - 1; index >= 0; index--)
				pending.push(tree.children[index]);
		}
		const groups = [];
		for (const record of data.nodes) {
			if (record.type !== "group" && record.label === undefined) continue;
			if (typeof record.label !== "string")
				return { ok: false, reason: "invalid-group-label" };
			const node = canvas.nodes.get(record.id);
			if (!node || ![node.x, node.y, node.width, node.height].every(Number.isFinite))
				return { ok: false, reason: "invalid-group-geometry" };
			groups.push({
				node,
				label: record.label.trim() || "Untitled Group",
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
		return { ok: false, reason: "invalid-canvas", error };
	}
}

async function writeClipboardText(value, clipboard = globalThis.navigator?.clipboard) {
	if (typeof clipboard?.writeText !== "function")
		throw new Error("Clipboard access is unavailable");
	await clipboard.writeText(String(value || ""));
	return true;
}

class OutlineView extends ItemView {
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
		this.searchQuery = "";
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
	getDisplayText() { return "Map outline"; }
	getIcon() { return "list-tree"; }
	onOpen() {
		this.contentEl.addClass("tomindmap-outline");
		this.contentEl.setAttribute("role", "tree");
		this.contentEl.setAttribute("aria-label", "Map outline");
		const navHeader = this.containerEl.createDiv({ cls: "nav-header" });
		this.containerEl.insertBefore(navHeader, this.contentEl);
		this.navHeaderEl = navHeader;
		const navButtons = navHeader.createDiv({ cls: "nav-buttons-container" });
		const searchBtn = navButtons.createEl("button", {
			cls: "clickable-icon nav-action-button",
			attr: { type: "button", "aria-label": "Search map outline" }
		});
		setIcon(searchBtn, "search");
		this.collapseBtnEl = navButtons.createEl("button", {
			cls: "clickable-icon nav-action-button",
			attr: { type: "button", "aria-label": "Collapse all" }
		});
		setIcon(this.collapseBtnEl, "chevrons-down-up");
		this.addViewListener(searchBtn, "click", () => this.toggleSearch());
		this.addViewListener(this.collapseBtnEl, "click", () => this.toggleAllCollapsed());
		this.searchContainerEl = navHeader.createDiv({ cls: "tomindmap-outline-search-container" });
		this.searchContainerEl.hide();
		this.searchComponent = new SearchComponent(this.searchContainerEl);
		this.searchComponent.setPlaceholder("Filter...");
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
		this.addViewListener(this.contentEl, "click", (event) => this.handleOutlineClick(event));
		this.addViewListener(this.contentEl, "dblclick", (event) => this.handleOutlineDoubleClick(event));
		this.addViewListener(this.contentEl, "contextmenu", (event) => this.handleOutlineContextMenu(event));
		this.addViewListener(this.contentEl, "keydown", (event) => this.handleOutlineKeydown(event));
		this.addViewListener(this.contentEl, "pointerdown", (event) => {
			const handle = event.target?.closest?.(".tomindmap-outline-drag-handle");
			const id = handle?.parentElement?.getAttribute?.("data-outline-id");
			if (id) this.dragAllowedRoots.add(id);
		});
		this.addViewListener(this.contentEl, "dragstart", (event) => this.handleOutlineDragStart(event));
		this.addViewListener(this.contentEl, "dragend", () => this.clearOutlineDrag());
		this.addViewListener(this.contentEl, "dragover", (event) => this.handleOutlineDragOver(event));
		this.addViewListener(this.contentEl, "dragleave", (event) => this.handleOutlineDragLeave(event));
		this.addViewListener(this.contentEl, "drop", (event) => this.handleOutlineDrop(event));
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
			this.searchQuery = "";
			this.searchComponent.setValue("");
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
		this.canvasLeaf = this.app.workspace.getLeavesOfType("canvas").find((leaf) => leaf.view?.canvas === canvas) || null;
		if (this.searchComponent) this.searchComponent.setValue(this.searchQuery);
		this.collapsibleNodeIds = model.collapsibleNodeIds;
		this.renderModel(model);
		return true;
	}
	renderModel(model) {
		const canvas = model.canvas;
		this.contentEl.empty();
		this.contentEl.setAttribute("role", "tree");
		this.contentEl.setAttribute("aria-label", "Map outline");
		this.allItemEls.clear();
		this.allTreeItems.clear();
		this.groupElMap.clear();
		this.groupIds = model.groups.map((group) => group.node.id);
		if (model.ungrouped.length === 0 && model.groups.length === 0) {
			this.contentEl.createDiv({
				cls: "tomindmap-outline-empty",
				text: "No root topics",
				attr: { role: "status" }
			});
			this.updateCollapseButton();
			return;
		}
		if (model.ungrouped.length > 0) {
			const zone = this.contentEl.createDiv({
				cls: "tomindmap-outline-ungrouped-zone",
				attr: { role: "group", "aria-label": "Ungrouped topics", "data-outline-drop": "ungrouped" }
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
				cls: `tree-item${isCollapsed ? " is-collapsed" : ""}`,
				attr: {
					role: "treeitem",
					"aria-level": String(current.level),
					"aria-expanded": hasChildren ? String(!isCollapsed) : null,
					"aria-selected": "false",
					"data-outline-kind": "node",
					"data-outline-id": nodeId,
					"data-tomindmap-search-text": MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))
				}
			});
			this.allTreeItems.set(nodeId, treeItem);
			const self = treeItem.createDiv({ cls: "tree-item-self", attr: { role: "none" } });
			const collapse = self.createEl("button", {
				cls: "tree-item-icon collapse-icon",
				attr: {
					type: "button",
					"aria-label": `${isCollapsed ? "Expand" : "Collapse"} ${MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))}`,
					"aria-expanded": hasChildren ? String(!isCollapsed) : null,
					"data-outline-action": "collapse-node",
					"data-outline-id": nodeId
				}
			});
			collapse.disabled = !hasChildren;
			setIcon(collapse, hasChildren ? "right-triangle" : "minus");
			if (current.isRoot) {
				const handle = self.createDiv({
					cls: "tree-item-icon tomindmap-outline-drag-handle",
					attr: { "aria-hidden": "true" }
				});
				setIcon(handle, "grip-vertical");
			}
			const select = self.createEl("button", {
				cls: "tree-item-inner is-clickable tomindmap-outline-item",
				text: MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node)),
				attr: {
					type: "button",
					"aria-label": `Select ${MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))}`,
					"data-outline-action": "select-node",
					"data-outline-id": nodeId,
					"data-tomindmap-search-text": MarkdownMindMapCodec.topicTitle(canvasNodeMarkdownText(node))
				}
			});
			select.draggable = Boolean(current.isRoot && groupId == null);
			this.allItemEls.set(nodeId, select);
			if (hasChildren && !isCollapsed) {
				const children = treeItem.createDiv({
					cls: "tree-item-children",
					attr: { role: "group" }
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
			cls: `tree-item tomindmap-outline-group${collapsed ? " is-collapsed" : ""}`,
			attr: {
				role: "treeitem",
				"aria-level": "1",
				"aria-expanded": String(!collapsed),
				"data-outline-kind": "group",
				"data-outline-id": group.node.id,
				"data-tomindmap-search-text": group.label
			}
		});
		this.allTreeItems.set(group.node.id, treeItem);
		const self = treeItem.createDiv({ cls: "tree-item-self", attr: { role: "none" } });
		const collapse = self.createEl("button", {
			cls: "tree-item-icon collapse-icon",
			attr: {
				type: "button",
				"aria-label": `${collapsed ? "Expand" : "Collapse"} group ${group.label}`,
				"aria-expanded": String(!collapsed),
				"data-outline-action": "collapse-group",
				"data-outline-id": group.node.id
			}
		});
		setIcon(collapse, "right-triangle");
		const label = self.createEl("button", {
			cls: "tree-item-inner is-clickable",
			text: group.label,
			attr: {
				type: "button",
				"aria-label": `${collapsed ? "Expand" : "Collapse"} group ${group.label}`,
				"data-outline-action": "collapse-group",
				"data-outline-id": group.node.id,
				"data-tomindmap-search-text": group.label
			}
		});
		label.createSpan({ cls: "tomindmap-outline-group-count", text: String(group.roots.length) });
		this.groupElMap.set(group.node.id, self);
		const children = treeItem.createDiv({ cls: "tree-item-children", attr: { role: "group" } });
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
		setIcon(this.collapseBtnEl, allCollapsed ? "chevrons-up-down" : "chevrons-down-up");
		this.collapseBtnEl.disabled = !hasItems;
		this.collapseBtnEl.setAttribute("aria-label", allCollapsed ? "Expand all" : "Collapse all");
	}
	applyFilter() {
		const query = this.searchQuery.toLowerCase().trim();
		const items = Array.from(this.contentEl.querySelectorAll('[role="treeitem"]'));
		const childrenByItem = new Map();
		for (const item of items) {
			const container = item.parentElement;
			const parent = container?.hasClass?.("tree-item-children")
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
			const own = query === "" ||
				String(item.getAttribute("data-tomindmap-search-text") || "").toLowerCase().includes(query);
			const descendant = (childrenByItem.get(item) || [])
				.some((child) => !hidden.get(child));
			const visible = own || descendant;
			hidden.set(item, !visible);
			item.toggleClass("is-hidden", !visible);
		}
	}
	handleOutlineClick(event) {
		const button = event.target?.closest?.("[data-outline-action]");
		if (!button) return;
		const id = button.getAttribute("data-outline-id");
		const action = button.getAttribute("data-outline-action");
		if (action === "collapse-node") {
			if (this.collapsedNodes.has(id)) this.collapsedNodes.delete(id);
			else this.collapsedNodes.add(id);
			if (this.model) this.renderModel(this.model);
			return;
		}
		if (action === "collapse-group") {
			if (this.collapsedGroups.has(id)) this.collapsedGroups.delete(id);
			else this.collapsedGroups.add(id);
			if (this.model) this.renderModel(this.model);
			return;
		}
		if (action === "select-node") this.selectOutlineNode(id, event);
	}
	handleOutlineKeydown(event) {
		const button = event.target?.closest?.("[data-outline-action]");
		if (!button) return;
		const id = button.getAttribute("data-outline-id");
		const action = button.getAttribute("data-outline-action");
		if ((event.key === "Enter" || event.key === " ") &&
			(action === "select-node" || action === "collapse-group")) {
			event.preventDefault();
			this.handleOutlineClick({ target: button });
			return;
		}
		if (event.key === "ArrowRight" && action === "collapse-node" && this.collapsedNodes.has(id)) {
			event.preventDefault();
			this.collapsedNodes.delete(id);
			if (this.model) this.renderModel(this.model);
		} else if (event.key === "ArrowLeft" && action === "collapse-node" && !this.collapsedNodes.has(id)) {
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
				this.allItemEls.get(id)?.removeClass("is-selected");
			} else {
				this.clearSelection();
				this.selectedRoots.add(tree);
				this.allItemEls.get(id)?.addClass("is-selected");
			}
			this.allItemEls.get(id)?.setAttribute("aria-pressed", String(this.selectedRoots.has(tree)));
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
		const id = group.getAttribute("data-outline-id");
		const record = this.model.groups.find((candidate) => candidate.node.id === id);
		const label = group.querySelector(".tree-item-inner");
		if (record && label) this.startGroupRename(label, record, this.lastCanvas);
	}
	handleOutlineContextMenu(event) {
		const target = event.target?.closest?.("[data-outline-kind]");
		if (!target || !this.model || !this.lastCanvas) return;
		event.preventDefault();
		const kind = target.getAttribute("data-outline-kind");
		const id = target.getAttribute("data-outline-id");
		const menu = new Menu();
		if (kind === "node") {
			const node = this.model.nodes.get(id)?.canvasNode;
			if (!node) return;
			menu.addItem((item) => item.setTitle("Copy node link").setIcon("link").onClick(() => {
				this.runAsync(() => this.copyNodeLink(node), "copy node link");
			}));
			const tree = this.model.nodes.get(id);
			if (tree?.parent == null) {
				if (!this.selectedRoots.has(tree)) {
					this.clearSelection();
					this.selectedRoots.add(tree);
				}
				menu.addItem((item) => item.setTitle(`Create group (${this.selectedRoots.size} roots)`).setIcon("group").onClick(() => this.createGroupFromSelection()));
			}
		} else {
			const group = this.model.groups.find((candidate) => candidate.node.id === id);
			if (!group) return;
			menu.addItem((item) => item.setTitle("Rename group").setIcon("pencil").onClick(() => {
				const label = this.allTreeItems.get(id)?.querySelector(".tree-item-inner");
				if (label) this.startGroupRename(label, group, this.lastCanvas);
			}));
			menu.addItem((item) => item.setTitle("Layout forest").setIcon("layout-grid").onClick(() => {
				if (this.lastCanvas && this.onForestLayout) this.onForestLayout(this.lastCanvas, id);
			}));
		}
		menu.showAtMouseEvent(event);
	}
	async copyNodeLink(node) {
		const canvasPath = this.lastCanvas?.view?.file?.path || "";
		let link = `obsidian://tomindmap-navigate?canvas=${encodeURIComponent(canvasPath)}&id=${encodeURIComponent(node.id)}`;
		if (canvasNodeFilePath(node)) {
			const vaultName = this.app.vault.getName?.() || "";
			link = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(canvasNodeFilePath(node))}`;
		} else if (canvasNodeUrl(node)) link = canvasNodeUrl(node);
		await writeClipboardText(link);
		new Notice("Node link copied");
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
			this.allItemEls.get(root.canvasNode.id)?.removeClass("is-selected");
		this.selectedRoots.clear();
	}
	setActiveItem(nodeId) {
		if (this.activeNodeId && this.activeNodeId !== nodeId)
			this.allItemEls.get(this.activeNodeId)?.removeClass("is-active");
		this.activeNodeId = nodeId;
		const element = this.allItemEls.get(nodeId);
		element?.addClass("is-active");
		element?.setAttribute("aria-current", "true");
		element?.scrollIntoView({ block: "nearest" });
	}
	clearActiveItem() {
		if (this.activeNodeId) {
			this.allItemEls.get(this.activeNodeId)?.removeClass("is-active");
			this.allItemEls.get(this.activeNodeId)?.removeAttribute("aria-current");
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
		const group = canvas.createGroupNode?.({ pos: { x: minX, y: minY }, size: { width: maxX - minX, height: maxY - minY }, label: "" });
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
		for (const element of this.groupElMap.values()) element.removeClass("is-drag-over");
		this.contentEl.querySelector(".tomindmap-outline-ungrouped-zone")?.removeClass("is-drag-over");
	}
	handleOutlineDragStart(event) {
		const select = event.target?.closest?.('[data-outline-action="select-node"]');
		const id = select?.getAttribute("data-outline-id");
		const tree = id ? this.model?.nodes.get(id) : null;
		if (!id || !tree || tree.parent != null || !this.dragAllowedRoots.has(id)) {
			event.preventDefault();
			return;
		}
		const group = select.closest('[data-outline-kind="group"]');
		this.draggedRoot = tree;
		this.dragSourceGroupId = group?.getAttribute("data-outline-id") || null;
		select.addClass("is-dragging");
		event.dataTransfer?.setData("text/plain", id);
	}
	handleOutlineDragOver(event) {
		if (!this.draggedRoot) return;
		const target = event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]');
		if (!target) return;
		event.preventDefault();
		target.addClass("is-drag-over");
	}
	handleOutlineDragLeave(event) {
		event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]')?.removeClass("is-drag-over");
	}
	handleOutlineDrop(event) {
		const target = event.target?.closest?.('[data-outline-drop], [data-outline-kind="group"]');
		if (!target || !this.draggedRoot || !this.lastCanvas) return;
		event.preventDefault();
		const groupId = target.getAttribute("data-outline-id") || null;
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
		const originalText = label.textContent || "";
		label.contentEditable = "true";
		label.setAttribute("role", "textbox");
		label.setAttribute("aria-label", `Rename group ${group.label}`);
		label.focus();
		const range = canvas.view?.containerEl?.ownerDocument?.createRange?.() || document.createRange();
		range.selectNodeContents?.(label);
		const selection = label.ownerDocument?.defaultView?.getSelection?.();
		selection?.removeAllRanges?.();
		selection?.addRange?.(range);
		let done = false;
		const dispose = () => {
			label.removeEventListener("keydown", onKeydown);
			label.removeEventListener("blur", commit);
			label.removeEventListener("click", stop);
			this.session.disposers.delete(dispose);
		};
		const finish = (commitValue) => {
			if (done) return;
			done = true;
			const nextLabel = commitValue ? String(label.textContent || "").trim() || "Untitled Group" : originalText;
			label.contentEditable = "false";
			label.removeAttribute("role");
			label.removeAttribute("aria-label");
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
			if (event.key === "Enter") {
				event.preventDefault();
				finish(true);
			} else if (event.key === "Escape") {
				event.preventDefault();
				finish(false);
			}
		};
		label.addEventListener("keydown", onKeydown);
		label.addEventListener("blur", commit);
		label.addEventListener("click", stop);
		const tracked = () => {
			label.removeEventListener("keydown", onKeydown);
			label.removeEventListener("blur", commit);
			label.removeEventListener("click", stop);
		};
		this.session.disposers.add(tracked);
	}
	showUnavailable(message, canvas = null) {
		this.activateCanvasSession(canvas);
		this.lastCanvas = canvas;
		this.model = null;
		this.contentEl.empty();
		this.contentEl.setAttribute("role", "status");
		this.contentEl.setAttribute("aria-live", "polite");
		this.contentEl.createDiv({ cls: "tomindmap-outline-empty", text: String(message || "Map outline is unavailable") });
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
		this.contentEl.setAttribute("role", "status");
		this.contentEl.setAttribute("aria-live", "polite");
		this.contentEl.empty();
		this.contentEl.createDiv({ cls: "tomindmap-outline-empty", text: "Open a mind-map canvas to see its outline" });
	}
}

module.exports = {
	OUTLINE_VIEW_TYPE,
	OutlineView,
	buildOutlineModel,
	outlineTreeDescendants,
	writeClipboardText
};
