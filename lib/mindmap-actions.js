'use strict';

const treeModel =
	(typeof require === 'function'
		? (function () {
				try {
					return require('./tree-model.js');
				} catch (_) {
					return {};
				}
			})()
		: {}) || {};

function getFindTreeForNode() {
	return (
		treeModel.findTreeForNode ||
		(typeof findTreeForNode === 'function' ? findTreeForNode : null)
	);
}

function getGetDescendants() {
	return (
		treeModel.getDescendants ||
		(typeof getDescendants === 'function' ? getDescendants : null)
	);
}

/**
 * Read the first meaningful line of a topic as a clean display title.
 * Conversion targets file basenames, not Markdown documents, so heading and
 * list markers are intentionally removed while ordinary punctuation is kept.
 */
function topicTitleFromText(text) {
	const source = String(text || '')
		.replace(/\r\n?/g, '\n')
		.replace(/<!--\s*tomindmap:id=[A-Za-z0-9_-]+\s*-->/gi, '')
		.trim();
	const firstLine = source.split('\n').find((line) => line.trim()) || '';
	const title = firstLine
		.replace(
			/^!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/,
			(_match, target, alias) => alias || target
		)
		.replace(/^!\[([^\]]*)\]\([^)]*\)/, '$1')
		.replace(/^#{1,6}\s+/, '')
		.replace(/^[-+*]\s+/, '')
		.replace(/^\[[ xX]\]\s+/, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~`]/g, '')
		.replace(/\\([\\`*_[\]{}()#+.!>-])/g, '$1')
		.trim();
	return title || 'Untitled';
}

function topicTitleFromNode(node) {
	return topicTitleFromText(
		node?.text ?? node?.unknownData?.text ?? node?.label ?? ''
	);
}

/** Keep generated note names portable across the platforms Obsidian supports. */
function safeTopicFilename(title) {
	const value = String(topicTitleFromText(title) || 'Untitled')
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '')
		.slice(0, 120)
		.trim();
	return value || 'Untitled';
}

function nextTopicFilePath(
	folderPath,
	title,
	extension = 'md',
	pathExists
) {
	const folder = String(folderPath || '')
		.replace(/^\/+|\/+$/g, '')
		.replace(/\\/g, '/');
	const base = safeTopicFilename(title);
	const suffixExtension = String(extension || 'md').replace(/^\.+/, '');
	const exists = typeof pathExists === 'function' ? pathExists : () => false;
	let index = 0;
	let candidate;
	do {
		const suffix = index === 0 ? '' : ` ${index}`;
		const basename = `${base}${suffix}`;
		candidate = folder
			? `${folder}/${basename}.${suffixExtension}`
			: `${basename}.${suffixExtension}`;
		index++;
	} while (exists(candidate));
	return candidate;
}

function nextTopicNotePath(folderPath, title, pathExists) {
	return nextTopicFilePath(folderPath, title, 'md', pathExists);
}

function isTextTopicNode(node, groupIds = new Set()) {
	if (!node || groupIds.has(node.id)) return false;
	if (node.file || node.filePath || node.url) return false;
	const type = node.type || node.unknownData?.type;
	return type !== 'group' && type !== 'file' && type !== 'link';
}

function getTopicBranch(forest, node, includeDescendants = true) {
	const findFn = getFindTreeForNode();
	const descFn = getGetDescendants();
	const treeNode = findFn ? findFn(forest, node?.id) : null;
	if (!treeNode) return [];
	return includeDescendants && descFn
		? [treeNode, ...descFn(treeNode)]
		: [treeNode];
}

/**
 * Remap a serialized nested Canvas graph into a target Canvas at an anchor.
 * Source IDs are never reused, so expanding a linked map cannot overwrite an
 * unrelated card in the parent map.
 */
function remapLinkedCanvasData(sourceData, anchor, existingIds, makeId) {
	const sourceNodes = (Array.isArray(sourceData?.nodes) ? sourceData.nodes : []).filter(
		(node) => node && typeof node === 'object'
	);
	if (sourceNodes.length === 0) {
		return { nodes: [], edges: [], idMap: new Map(), rootId: null };
	}
	const usedIds = new Set(existingIds || []);
	const nextId =
		typeof makeId === 'function'
			? makeId
			: () => `linked-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	const idMap = new Map();
	for (const sourceNode of sourceNodes) {
		const oldId = String(sourceNode.id || '');
		let id = String(nextId() || '');
		while (!id || usedIds.has(id)) id = String(nextId() || '');
		usedIds.add(id);
		idMap.set(oldId, id);
	}
	const sourceEdges = (Array.isArray(sourceData?.edges) ? sourceData.edges : []).filter(
		(edge) => edge && typeof edge === 'object'
	);
	const incoming = new Set(sourceEdges.map((edge) => String(edge.toNode || '')));
	const sourceRoot =
		sourceNodes.find((item) => !incoming.has(String(item.id || ''))) || sourceNodes[0];
	const sourceRootX = Number(sourceRoot.x) || 0;
	const sourceRootY = Number(sourceRoot.y) || 0;
	const anchorX = Number(anchor?.x) || 0;
	const anchorY = Number(anchor?.y) || 0;
	const nodes = sourceNodes.map((item) => ({
		...item,
		id: idMap.get(String(item.id || '')),
		type: item.type || (item.file || item.url ? 'file' : 'text'),
		x: anchorX + (Number(item.x) || 0) - sourceRootX,
		y: anchorY + (Number(item.y) || 0) - sourceRootY,
		width: Number(item.width) || Number(anchor?.width) || 300,
		height: Number(item.height) || Number(anchor?.height) || 60
	}));
	const edges = [];
	for (const edge of sourceEdges) {
		const fromNode = idMap.get(String(edge.fromNode || ''));
		const toNode = idMap.get(String(edge.toNode || ''));
		if (!fromNode || !toNode) continue;
		let edgeId = String(nextId() || '');
		while (!edgeId || usedIds.has(edgeId)) edgeId = String(nextId() || '');
		usedIds.add(edgeId);
		const next = {
			...edge,
			id: edgeId,
			fromNode,
			toNode
		};
		delete next.from;
		delete next.to;
		edges.push(next);
	}
	return { nodes, edges, idMap, rootId: idMap.get(String(sourceRoot.id || '')) };
}

function updateLinkedParentCardData(data, nodeId, title, filePath = '') {
	const record = (Array.isArray(data?.nodes) ? data.nodes : []).find(
		(item) => item?.id === nodeId
	);
	if (!record || !title) return null;
	record.unknownData = {
		...(record.unknownData || {}),
		tomindmapTitleOnly: true,
		tomindmapCardKind: 'nested-map',
		tomindmapCardTitle: title
	};
	record.tomindmapTitleOnly = true;
	record.tomindmapCardKind = 'nested-map';
	record.tomindmapCardTitle = title;
	if (filePath) record.file = filePath;
	return data;
}

function setCanvasNodeClass(node, className, enabled) {
	const nodeElement = node?.nodeEl;
	const shell =
		nodeElement?.closest?.('.canvas-node') ||
		node?.containerEl?.closest?.('.canvas-node') ||
		node?.containerEl;
	for (const element of new Set([nodeElement, shell].filter(Boolean))) {
		if (typeof element.toggleClass === 'function') {
			element.toggleClass(className, enabled);
		} else {
			element.classList?.toggle(className, enabled);
		}
	}
}

function setCanvasEdgeHidden(edge, hidden) {
	for (const element of [
		edge?.lineGroupEl,
		edge?.lineEndGroupEl,
		edge?.el,
		edge?.edgeEl
	]) {
		if (element?.style) element.style.display = hidden ? 'none' : '';
	}
}

/**
 * Apply persisted collapse state to node elements and edge line groups. The
 * layout engine can then omit hidden descendants without changing the saved
 * graph, while exports and the outline still see the complete hierarchy.
 */
function syncCollapsedVisibility(canvas) {
	if (!canvas?.nodes || !treeModel.buildForest) return 0;
	const nodes = Array.from(canvas.nodes.values());
	for (const node of nodes) {
		setCanvasNodeClass(node, 'tomindmap-collapsed-hidden', false);
		setCanvasNodeClass(node, 'tomindmap-collapsed-node', false);
	}
	for (const edge of canvas.edges?.values?.() || [])
		setCanvasEdgeHidden(edge, false);

	const forest = treeModel.buildForest(canvas, { includeHidden: true });
	const hiddenIds = new Set();
	const getData = (node) => {
		try {
			return typeof node.getData === 'function'
				? node.getData() || {}
				: node.unknownData || {};
		} catch (_) {
			return {};
		}
	};
	const descFn = getGetDescendants();
	const visit = (treeNode) => {
		if (getData(treeNode.canvasNode).collapsed) {
			setCanvasNodeClass(
				treeNode.canvasNode,
				'tomindmap-collapsed-node',
				true
			);
		}
		if (getData(treeNode.canvasNode).collapsed && descFn) {
			for (const descendant of descFn(treeNode)) {
				const child = descendant.canvasNode;
				if (!child) continue;
				hiddenIds.add(child.id);
				setCanvasNodeClass(child, 'tomindmap-collapsed-hidden', true);
			}
		}
		for (const child of treeNode.children) visit(child);
	};
	for (const root of forest) visit(root);
	for (const edge of canvas.edges?.values?.() || []) {
		const fromId = edge.from?.node?.id;
		const toId = edge.to?.node?.id;
		if (hiddenIds.has(fromId) || hiddenIds.has(toId))
			setCanvasEdgeHidden(edge, true);
	}
	return hiddenIds.size;
}

function separateBranch(canvas, canvasApi, node) {
	if (!canvas || !canvasApi || !node) return false;

	const incoming = canvasApi.getIncomingEdges
		? canvasApi.getIncomingEdges(canvas, node)
		: [];
	if (incoming.length === 0) return false;

	for (const edge of incoming) {
		canvasApi.removeEdge(canvas, edge);
	}
	return true;
}

function colorBranch(canvas, forest, node, color) {
	if (!canvas || !node) return 0;

	const findFn = getFindTreeForNode();
	const descFn = getGetDescendants();
	const treeNode = findFn ? findFn(forest, node.id) : null;
	const targetNodes = [node];
	if (treeNode && descFn) {
		for (const descendant of descFn(treeNode)) {
			if (descendant.canvasNode) targetNodes.push(descendant.canvasNode);
		}
	}

	let count = 0;
	for (const target of targetNodes) {
		if (typeof target.setColor === 'function') {
			target.setColor(color);
			count++;
		} else {
			target.color = color;
			count++;
		}
	}
	return count;
}

function toggleSubtreeCollapse(canvas, forest, node) {
	if (!canvas || !node) return false;

	const findFn = getFindTreeForNode();
	const descFn = getGetDescendants();
	const treeNode = findFn ? findFn(forest, node.id) : null;
	if (!treeNode || treeNode.children.length === 0) return false;

	const data =
		typeof node.getData === 'function'
			? node.getData()
			: node.unknownData || {};
	const currentlyCollapsed = !!data.collapsed;
	const nextState = !currentlyCollapsed;

	if (typeof node.setData === 'function') {
		node.setData({ ...data, collapsed: nextState });
	} else {
		node.unknownData = {
			...(node.unknownData || {}),
			collapsed: nextState
		};
	}

	if (canvas.nodes?.values) {
		syncCollapsedVisibility(canvas);
	} else if (descFn) {
		const descendants = descFn(treeNode);
		for (const item of descendants) {
			const childNode = item.canvasNode;
			if (!childNode || !childNode.nodeEl) continue;
			if (nextState) {
				childNode.nodeEl.addClass('tomindmap-collapsed-hidden');
			} else {
				childNode.nodeEl.removeClass('tomindmap-collapsed-hidden');
			}
		}
	}
	return nextState;
}

module.exports = {
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
};
