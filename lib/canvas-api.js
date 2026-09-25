'use strict';

const { ItemView } = require('obsidian');
const { buildForest } = require('./tree-model.js');

function graphNodeId(node) {
	const id = typeof node === 'string' ? node : node?.id;
	return typeof id === 'string' && id.length > 0 ? id : null;
}

class CanvasGraphQuery {
	constructor(canvas, revision) {
		this.canvas = canvas;
		this.revision = revision;
		this.nodeCount = canvas?.nodes?.size || 0;
		this.edgeCount = canvas?.edges?.size || 0;
		this.forest = buildForest(canvas);
		this.treeNodes = new Map();
		this.roots = new Map();
		this.incomingEdges = new Map();
		this.outgoingEdges = new Map();
		for (const edge of canvas?.edges?.values?.() || []) {
			const fromId = graphNodeId(edge?.from?.node);
			const toId = graphNodeId(edge?.to?.node);
			if (fromId) {
				const edges = this.outgoingEdges.get(fromId) || [];
				edges.push(edge);
				this.outgoingEdges.set(fromId, edges);
			}
			if (toId) {
				const edges = this.incomingEdges.get(toId) || [];
				edges.push(edge);
				this.incomingEdges.set(toId, edges);
			}
		}
		const pending = [];
		for (let index = this.forest.length - 1; index >= 0; index--)
			pending.push({ treeNode: this.forest[index], root: this.forest[index].canvasNode });
		while (pending.length > 0) {
			const current = pending.pop();
			const treeNode = current?.treeNode;
			if (!treeNode) continue;
			const id = graphNodeId(treeNode.canvasNode);
			if (id) {
				this.treeNodes.set(id, treeNode);
				this.roots.set(id, current.root);
			}
			for (let index = treeNode.children.length - 1; index >= 0; index--)
				pending.push({ treeNode: treeNode.children[index], root: current.root });
		}
	}

	treeNodeOf(node) {
		const id = graphNodeId(node);
		return id ? this.treeNodes.get(id) || null : null;
	}

	parentOf(node) {
		return this.treeNodeOf(node)?.parent || null;
	}

	rootOf(node) {
		const id = graphNodeId(node);
		return id ? this.roots.get(id) || null : null;
	}

	parentEdgeOf(node) {
		const treeNode = this.treeNodeOf(node);
		const parent = treeNode?.parent;
		if (!treeNode || !parent) return null;
		const childId = graphNodeId(treeNode.canvasNode);
		const parentId = graphNodeId(parent.canvasNode);
		return (this.incomingEdges.get(childId) || []).find(
			(edge) =>
				!edge?.__mindMapPreview &&
				graphNodeId(edge?.from?.node) === parentId
		) || null;
	}

	incomingEdgesOf(node) {
		const id = graphNodeId(node);
		return id ? this.incomingEdges.get(id) || [] : [];
	}

	outgoingEdgesOf(node) {
		const id = graphNodeId(node);
		return id ? this.outgoingEdges.get(id) || [] : [];
	}

	childrenOf(node) {
		return this.treeNodeOf(node)?.children || [];
	}

	descendantsOf(node) {
		const root = this.treeNodeOf(node);
		if (!root) return [];
		const result = [];
		const stack = [...root.children].reverse();
		while (stack.length > 0) {
			const treeNode = stack.pop();
			if (!treeNode) continue;
			result.push(treeNode.canvasNode);
			for (let index = treeNode.children.length - 1; index >= 0; index--)
				stack.push(treeNode.children[index]);
		}
		return result;
	}

	visibleForest() {
		return buildForest(this.canvas, { includeHidden: false });
	}
}

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
		this.graphQueries = /* @__PURE__ */ new WeakMap();
		this.graphRevision = 0;
		this.navigationRevealFrames = /* @__PURE__ */ new WeakMap();
	}
	/**
	 * Return the canonical topic graph for the current Canvas revision.
	 * Structural mutations invalidate the index; size checks also observe
	 * direct native Canvas changes made before those mutations are wrapped.
	 */
	getGraphQuery(canvas) {
		const cached = this.graphQueries.get(canvas);
		if (
			cached &&
			cached.nodeCount === (canvas?.nodes?.size || 0) &&
			cached.edgeCount === (canvas?.edges?.size || 0)
		)
			return cached;
		const query = new CanvasGraphQuery(canvas, ++this.graphRevision);
		this.graphQueries.set(canvas, query);
		return query;
	}

	invalidateGraphQuery() {
		this.graphQueries = /* @__PURE__ */ new WeakMap();
	}

	/**
	 * Invalidate the edge index (call after adding/removing edges).
	 */
	invalidateEdgeIndex() {
		this.invalidateGraphQuery();
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
		if (!item || typeof item !== "object" || !("nodeEl" in item)) return null;
		return item;
	}
	/**
	 * Create a file-backed node at a given position.
	 */
	createFileNode(canvas, file, x, y, width = 260, height = 60) {
		if (typeof canvas.createFileNode === 'function') {
			const node = canvas.createFileNode({
				pos: { x, y },
				size: { width, height },
				file,
				focus: false,
				save: false
			});
			if (node) {
				if (typeof node.moveAndResize === 'function') {
					node.moveAndResize({ x, y, width, height });
				} else if (typeof node.moveTo === 'function') {
					node.moveTo({ x, y });
					node.width = width;
					node.height = height;
				}
				if (!canvas.nodes.has(node.id) && typeof canvas.addNode === 'function')
					canvas.addNode(node);
				return node;
			}
		}
		const id = genId();
		while (canvas.nodes.has(id)) id = genId();
		canvas.importData({
			nodes: [
				{
					id,
					type: 'file',
					file: typeof file === 'string' ? file : file.path,
					x,
					y,
					width,
					height
				}
			],
			edges: []
		});
		return canvas.nodes.get(id) || null;
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
		if (!node) return null;
		if (!String(text || '').trim()) node.__tomindmapPendingCreation = true;
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
		color,
		options = {}
	) {
		let id = options.id || genId();
		while (canvas.edges.has(id)) id = genId();
		canvas.importData({
			edges: [
				{
					id,
					fromNode: fromNode.id,
					fromSide,
					fromEnd: options.fromEnd || 'none',
					toNode: toNode.id,
					toSide,
					toEnd: options.toEnd || 'arrow',
					...(color || options.color
						? { color: color || options.color }
						: {}),
					...(options.label !== undefined
						? { label: options.label }
						: {}),
					...(options.lineType !== undefined
						? { lineType: options.lineType }
						: {}),
					...(options.curve !== undefined
						? { curve: options.curve }
						: {}),
					...(options.curvature !== undefined
						? { curvature: options.curvature }
						: {})
				}
			],
			nodes: []
		});
		this.invalidateEdgeIndex();
		return canvas.edges.get(id) || null;
	}
	/**
	 * Replace an authored edge while preserving its identity. The original is
	 * restored if Canvas rejects the replacement import.
	 */
	replaceEdge(
		canvas,
		edge,
		fromNode,
		toNode,
		fromSide = 'right',
		toSide = 'left',
		color,
		options = {}
	) {
		if (!edge || !canvas?.removeEdge) return null;
		const snapshot = {
			id: edge.id,
			fromNode: edge.from?.node?.id,
			fromSide: edge.from?.side || fromSide,
			fromEnd: edge.from?.end || 'none',
			toNode: edge.to?.node?.id,
			toSide: edge.to?.side || toSide,
			toEnd: edge.to?.end || 'arrow',
			...(edge.color || color ? { color: edge.color || color } : {}),
			...(edge.label !== undefined ? { label: edge.label } : {}),
			...(edge.lineType !== undefined ? { lineType: edge.lineType } : {}),
			...(edge.curve !== undefined ? { curve: edge.curve } : {}),
			...(edge.curvature !== undefined ? { curvature: edge.curvature } : {})
		};
		canvas.removeEdge(edge);
		this.invalidateEdgeIndex();
		try {
			const replacement = this.createEdge(
				canvas,
				fromNode,
				toNode,
				fromSide,
				toSide,
				color,
				{ ...options, id: edge.id }
			);
			if (!replacement) throw new Error('Canvas did not create the replacement edge');
			return replacement;
		} catch (error) {
			try {
				canvas.importData({ nodes: [], edges: [snapshot] });
				this.invalidateEdgeIndex();
			} catch (_) {
				// Preserve the original replacement error; the host may have already restored state.
			}
			return null;
		}
	}

	/**
	 * Recreate an existing edge after one endpoint has been replaced.
	 */
	cloneEdge(canvas, edge, replacements) {
		const fromNode = replacements.get(edge.from?.node?.id) || edge.from?.node;
		const toNode = replacements.get(edge.to?.node?.id) || edge.to?.node;
		if (!fromNode || !toNode) return null;
		return this.createEdge(
			canvas,
			fromNode,
			toNode,
			edge.from?.side || 'right',
			edge.to?.side || 'left',
			edge.color,
			{
				fromEnd: edge.from?.end,
				toEnd: edge.to?.end,
				label: edge.label,
				lineType: edge.lineType,
				curve: edge.curve,
				curvature: edge.curvature
			}
		);
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
		const query = this.getGraphQuery(canvas);
		return Array.from(new Set([
			...query.incomingEdgesOf(node),
			...query.outgoingEdgesOf(node)
		]));
	}
	/**
	 * Get parent node (the node that has an edge pointing TO this node).
	 */
	getParentNode(canvas, node) {
		return this.getGraphQuery(canvas).parentOf(node)?.canvasNode || null;
	}
	/**
	 * Find the root of the canonical map affected by this topic.
	 */
	getAffectedRootNode(canvas, node) {
		return this.getGraphQuery(canvas).rootOf(node);
	}
	/**
	 * Get the stable edge that defines this node's canonical parent.
	 */
	getParentEdge(canvas, node) {
		return this.getGraphQuery(canvas).parentEdgeOf(node);
	}
	/**
	 * Get child nodes (nodes that this node has edges pointing TO).
	 */
	getChildNodes(canvas, node) {
		return this.getGraphQuery(canvas)
			.childrenOf(node)
			.map((treeNode) => treeNode.canvasNode);
	}
	/**
	 * Get the complete canonical branch below a topic.
	 */
	getDescendantNodes(canvas, node) {
		return this.getGraphQuery(canvas).descendantsOf(node);
	}
	/**
	 * Project the canonical topics currently visible outside collapsed subtrees.
	 */
	getVisibleForest(canvas) {
		return this.getGraphQuery(canvas).visibleForest();
	}
	/**
	 * Get outgoing edges from a node for edge-preserving mutations.
	 */
	getOutgoingEdges(canvas, node) {
		return this.getGraphQuery(canvas).outgoingEdgesOf(node);
	}
	/**
	 * Get incoming edges to a node for edge-preserving mutations.
	 */
	getIncomingEdges(canvas, node) {
		return this.getGraphQuery(canvas).incomingEdgesOf(node);
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
