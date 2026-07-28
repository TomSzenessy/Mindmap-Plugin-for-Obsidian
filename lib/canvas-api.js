'use strict';

const { ItemView } = require('obsidian');
function genId() {
	const bytes = new Uint8Array(8);
	if (
		globalThis.crypto &&
		typeof globalThis.crypto.getRandomValues === 'function'
	) {
		globalThis.crypto.getRandomValues(bytes);
		return Array.from(bytes, (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
	}
	return Array.from({ length: 16 }, () =>
		Math.floor(Math.random() * 16).toString(16)
	).join('');
}
function findNodeFromEvent(canvas, e) {
	var _a;
	const target = e.target;
	if (!target) return null;
	for (const node of canvas.nodes.values()) {
		if ((_a = node.nodeEl) == null ? void 0 : _a.contains(target))
			return node;
	}
	return null;
}
var CanvasAPI = class {
	constructor(app) {
		this.app = app;
		this.edgeIndex = null;
		this.indexedCanvas = null;
		this.indexedEdgeCount = -1;
		this.navigationRevealFrames = /* @__PURE__ */ new WeakMap();
	}
	/**
	 * Get or rebuild the edge index for the given canvas.
	 * Rebuilds if canvas changed or edge count changed (structural mutation).
	 */
	getEdgeIndex(canvas) {
		if (
			this.edgeIndex &&
			this.indexedCanvas === canvas &&
			this.edgeIdsMatch(canvas)
		) {
			return this.edgeIndex;
		}
		const incoming = /* @__PURE__ */ new Map();
		const outgoing = /* @__PURE__ */ new Map();
		for (const edge of canvas.edges.values()) {
			const fromId = edge.from.node.id;
			const toId = edge.to.node.id;
			let out = outgoing.get(fromId);
			if (!out) {
				out = [];
				outgoing.set(fromId, out);
			}
			out.push(edge);
			let inc = incoming.get(toId);
			if (!inc) {
				inc = [];
				incoming.set(toId, inc);
			}
			inc.push(edge);
		}
		this.edgeIndex = { incoming, outgoing };
		this.indexedCanvas = canvas;
		this.indexedEdgeCount = canvas.edges.size;
		return this.edgeIndex;
	}
	/**
	 * Structural Canvas methods are wrapped by the plugin and invalidate this
	 * index. The count check also covers changes made before wrapping.
	 */
	edgeIdsMatch(canvas) {
		return canvas.edges.size === this.indexedEdgeCount;
	}
	/**
	 * Invalidate the edge index (call after adding/removing edges).
	 */
	invalidateEdgeIndex() {
		this.edgeIndex = null;
		this.indexedEdgeCount = -1;
	}
	/**
	 * Get the active canvas if a canvas view is currently focused.
	 */
	getActiveCanvas() {
		var _a;
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		if (!view || view.getViewType() !== 'canvas') return null;
		return (_a = view.canvas) != null ? _a : null;
	}
	/**
	 * Get canvas from any open canvas leaf (first found).
	 */
	getAnyCanvas() {
		var _a;
		const leaves = this.app.workspace.getLeavesOfType('canvas');
		if (leaves.length === 0) return null;
		const view = leaves[0].view;
		return (_a = view == null ? void 0 : view.canvas) != null ? _a : null;
	}
	/**
	 * Get the currently selected node (single selection).
	 */
	getSelectedNode(canvas) {
		const selection = canvas.selection;
		if (selection.size !== 1) return null;
		const item = selection.values().next().value;
		if (!item || !('nodeEl' in item)) return null;
		return item;
	}
	/**
	 * Create a text node at a given position.
	 */
	createTextNode(canvas, x, y, text = '', width = 260, height = 60) {
		const node = canvas.createTextNode({
			pos: { x, y },
			size: { width, height },
			text,
			focus: false,
			save: false
		});
		return node;
	}
	/**
	 * Create an edge between two nodes using canvas.importData.
	 */
	createEdge(
		canvas,
		fromNode,
		toNode,
		fromSide = 'right',
		toSide = 'left',
		color
	) {
		let id = genId();
		while (canvas.edges.has(id)) id = genId();
		canvas.importData({
			edges: [
				{
					id,
					fromNode: fromNode.id,
					fromSide,
					fromEnd: 'none',
					toNode: toNode.id,
					toSide,
					toEnd: 'arrow',
					...(color ? { color } : {})
				}
			],
			nodes: []
		});
		this.invalidateEdgeIndex();
		return canvas.edges.get(id) || null;
	}
	/**
	 * Remove an edge.
	 */
	removeEdge(canvas, edge) {
		canvas.removeEdge(edge);
		this.invalidateEdgeIndex();
	}
	/**
	 * Remove a node and all its connected edges.
	 */
	removeNode(canvas, node) {
		const connectedEdges = this.getConnectedEdges(canvas, node);
		for (const edge of connectedEdges) {
			canvas.removeEdge(edge);
		}
		canvas.removeNode(node);
		this.invalidateEdgeIndex();
	}
	/**
	 * Get all edges connected to a node (incoming + outgoing).
	 */
	getConnectedEdges(canvas, node) {
		var _a, _b;
		const idx = this.getEdgeIndex(canvas);
		const inc = (_a = idx.incoming.get(node.id)) != null ? _a : [];
		const out = (_b = idx.outgoing.get(node.id)) != null ? _b : [];
		return [...inc, ...out];
	}
	/**
	 * Get parent node (the node that has an edge pointing TO this node).
	 */
	getParentNode(canvas, node) {
		const idx = this.getEdgeIndex(canvas);
		const inc = idx.incoming.get(node.id);
		return inc && inc.length > 0 ? inc[0].from.node : null;
	}
	/**
	 * Get child nodes (nodes that this node has edges pointing TO).
	 */
	getChildNodes(canvas, node) {
		var _a;
		const idx = this.getEdgeIndex(canvas);
		const out = (_a = idx.outgoing.get(node.id)) != null ? _a : [];
		const children = out.map((e) => e.to.node);
		children.sort((a, b) => a.y - b.y);
		return children;
	}
	/**
	 * Get outgoing edges from a node (for BFS traversal).
	 */
	getOutgoingEdges(canvas, nodeId) {
		var _a;
		const idx = this.getEdgeIndex(canvas);
		return (_a = idx.outgoing.get(nodeId)) != null ? _a : [];
	}
	/**
	 * Get incoming edges to a node.
	 */
	getIncomingEdges(canvas, node) {
		const id = typeof node === 'string' ? node : node?.id;
		if (!id) return [];
		const idx = this.getEdgeIndex(canvas);
		return idx.incoming.get(id) || [];
	}
	/**
	 * Get sibling nodes (other children of the same parent).
	 */
	getSiblingNodes(canvas, node) {
		const parent = this.getParentNode(canvas, node);
		if (!parent) return [];
		return this.getChildNodes(canvas, parent).filter(
			(n) => n.id !== node.id
		);
	}
	/**
	 * Select a node and zoom to it with padding.
	 */
	selectAndZoom(canvas, node, zoomPadding) {
		canvas.selectOnly(node);
		if (zoomPadding > 0) {
			const cx = node.x + node.width / 2;
			const cy = node.y + node.height / 2;
			canvas.zoomToBbox({
				minX: cx - zoomPadding,
				minY: cy - zoomPadding,
				maxX: cx + zoomPadding,
				maxY: cy + zoomPadding
			});
		} else {
			canvas.zoomToSelection();
		}
	}
	/**
	 * Select a node and keep the camera still while it remains comfortably
	 * visible. If navigation leaves the viewport, reveal it with the same
	 * contextual padding used for newly created topics.
	 */
	selectForNavigation(canvas, node, zoomPadding = 0) {
		for (const candidate of canvas.nodes.values()) {
			var _a;
			(_a = candidate.nodeEl) == null
				? void 0
				: _a.removeClass('tomindmap-navigation-selected');
		}
		canvas.selectOnly(node);
		if (node.nodeEl) {
			node.nodeEl.addClass('tomindmap-navigation-selected');
		}
		canvas.requestFrame();
		if (canvas.wrapperEl && typeof canvas.wrapperEl.focus === 'function') {
			canvas.wrapperEl.focus({ preventScroll: true });
		}
		this.revealNavigationTarget(canvas, node, zoomPadding);
	}
	revealNavigationTarget(canvas, node, zoomPadding) {
		var _a;
		const wrapper = canvas.wrapperEl;
		const nodeEl = node.nodeEl;
		if (
			!wrapper ||
			!nodeEl ||
			typeof wrapper.getBoundingClientRect !== 'function' ||
			typeof nodeEl.getBoundingClientRect !== 'function'
		)
			return;
		const ownerWindow =
			(_a = wrapper.ownerDocument) == null ? void 0 : _a.defaultView;
		const frameWindow = ownerWindow || window;
		const previousFrame = this.navigationRevealFrames.get(canvas);
		if (previousFrame !== void 0)
			frameWindow.cancelAnimationFrame(previousFrame);
		const frame = frameWindow.requestAnimationFrame(() => {
			this.navigationRevealFrames.delete(canvas);
			if (canvas.selection && !canvas.selection.has(node)) return;
			const viewport = wrapper.getBoundingClientRect();
			const target = nodeEl.getBoundingClientRect();
			const margin = Math.min(
				48,
				Math.max(20, Math.min(viewport.width, viewport.height) * 0.05)
			);
			const comfortablyVisible =
				target.left >= viewport.left + margin &&
				target.right <= viewport.right - margin &&
				target.top >= viewport.top + margin &&
				target.bottom <= viewport.bottom - margin;
			if (comfortablyVisible) return;
			if (zoomPadding > 0 && typeof canvas.zoomToBbox === 'function') {
				const cx = node.x + node.width / 2;
				const cy = node.y + node.height / 2;
				const paddingX = Math.max(zoomPadding, node.width / 2 + margin);
				const paddingY = Math.max(
					zoomPadding,
					node.height / 2 + margin
				);
				canvas.zoomToBbox({
					minX: cx - paddingX,
					minY: cy - paddingY,
					maxX: cx + paddingX,
					maxY: cy + paddingY
				});
			} else if (typeof canvas.zoomToSelection === 'function') {
				canvas.zoomToSelection();
			}
		});
		this.navigationRevealFrames.set(canvas, frame);
	}
	selectAndEdit(canvas, node, zoomPadding = 0) {
		for (const candidate of canvas.nodes.values()) {
			var _a;
			(_a = candidate.nodeEl) == null
				? void 0
				: _a.removeClass('tomindmap-navigation-selected');
		}
		this.selectAndZoom(canvas, node, zoomPadding);
		setTimeout(() => {
			if (node.nodeEl)
				node.nodeEl.removeClass('tomindmap-navigation-selected');
			node.startEditing();
		}, 50);
	}
};

module.exports = { CanvasAPI, findNodeFromEvent, genId };
