'use strict';

const { allocateFilePath, portableFilenameStem } = require('./path-safety.js');
const {
	buildForest,
	findTreeForNode,
	getDescendants
} = require('./tree-model.js');

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
	return portableFilenameStem(topicTitleFromText(title) || 'Untitled');
}

function nextTopicFilePath(
	folderPath,
	title,
	extension = 'md',
	pathExists
) {
	return allocateFilePath(
		folderPath,
		topicTitleFromText(title) || 'Untitled',
		extension || 'md',
		pathExists
	);
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
	const findFn = findTreeForNode;
	const descFn = getDescendants;
	const treeNode = findFn ? findFn(forest, node?.id) : null;
	if (!treeNode) return [];
	return includeDescendants && descFn
		? [treeNode, ...descFn(treeNode)]
		: [treeNode];
}

function decodeLinkedCanvasData(sourceData) {
	if (!Array.isArray(sourceData?.nodes)) return { ok: false, reason: 'invalid-nodes' };
	if (!Array.isArray(sourceData?.edges)) return { ok: false, reason: 'invalid-edges' };

	const nodeIds = new Set();
	for (const node of sourceData.nodes) {
		if (!node || typeof node !== 'object' || Array.isArray(node)) {
			return { ok: false, reason: 'invalid-node-id' };
		}
		if (typeof node.id !== 'string' || !node.id.trim()) {
			return { ok: false, reason: 'invalid-node-id' };
		}
		if (nodeIds.has(node.id)) {
			return { ok: false, reason: 'duplicate-node-id' };
		}
		nodeIds.add(node.id);
	}

	const edgeIds = new Set();
	for (const edge of sourceData.edges) {
		if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
			return { ok: false, reason: 'invalid-edge-id' };
		}
		if (typeof edge.id !== 'string' || !edge.id.trim()) {
			return { ok: false, reason: 'invalid-edge-id' };
		}
		if (edgeIds.has(edge.id)) {
			return { ok: false, reason: 'duplicate-edge-id' };
		}
		edgeIds.add(edge.id);
		if (
			typeof edge.fromNode !== 'string' ||
			typeof edge.toNode !== 'string' ||
			!nodeIds.has(edge.fromNode) ||
			!nodeIds.has(edge.toNode)
		) {
			return { ok: false, reason: 'dangling-edge-endpoint' };
		}
	}

	if (sourceData.nodes.length === 0) {
		return { ok: true, value: { nodes: [], edges: [], rootId: null } };
	}

	const incomingCounts = new Map(sourceData.nodes.map((node) => [node.id, 0]));
	const outgoing = new Map();
	for (const edge of sourceData.edges) {
		if (edge.fromNode === edge.toNode) return { ok: false, reason: 'cycle' };
		incomingCounts.set(edge.toNode, incomingCounts.get(edge.toNode) + 1);
		if (!outgoing.has(edge.fromNode)) outgoing.set(edge.fromNode, []);
		outgoing.get(edge.fromNode).push(edge.toNode);
	}

	const roots = sourceData.nodes.filter((node) => incomingCounts.get(node.id) === 0);
	if (roots.length === 0) return { ok: false, reason: 'missing-root' };
	if (roots.length !== 1) return { ok: false, reason: 'multiple-roots' };

	const reachable = new Set([roots[0].id]);
	const reachableQueue = [roots[0].id];
	for (let cursor = 0; cursor < reachableQueue.length; cursor++) {
		for (const childId of outgoing.get(reachableQueue[cursor]) || []) {
			if (reachable.has(childId)) continue;
			reachable.add(childId);
			reachableQueue.push(childId);
		}
	}
	if (reachable.size !== sourceData.nodes.length) {
		return { ok: false, reason: 'unreachable-node' };
	}

	const remainingIncoming = new Map(incomingCounts);
	const cycleQueue = sourceData.nodes
		.filter((node) => remainingIncoming.get(node.id) === 0)
		.map((node) => node.id);
	let acyclicCount = 0;
	for (let cursor = 0; cursor < cycleQueue.length; cursor++) {
		acyclicCount++;
		for (const childId of outgoing.get(cycleQueue[cursor]) || []) {
			const nextCount = remainingIncoming.get(childId) - 1;
			remainingIncoming.set(childId, nextCount);
			if (nextCount === 0) cycleQueue.push(childId);
		}
	}
	if (acyclicCount !== sourceData.nodes.length) {
		return { ok: false, reason: 'cycle' };
	}
	if ([...incomingCounts.values()].some((count) => count > 1)) {
		return { ok: false, reason: 'multiple-parents' };
	}

	return {
		ok: true,
		value: { nodes: sourceData.nodes, edges: sourceData.edges, rootId: roots[0].id }
	};
}

/**
 * Validate and remap a serialized nested Canvas graph at a target anchor.
 * Source IDs are never reused, so expanding a linked map cannot overwrite an
 * unrelated card in the parent map.
 */
function remapLinkedCanvasData(sourceData, anchor, existingIds, makeId) {
	const decoded = decodeLinkedCanvasData(sourceData);
	if (!decoded.ok) return decoded;
	const { nodes: sourceNodes, edges: sourceEdges, rootId: sourceRootId } = decoded.value;
	if (sourceNodes.length === 0) {
		return {
			ok: true,
			value: { nodes: [], edges: [], idMap: new Map(), rootId: null }
		};
	}

	const usedIds = new Set(existingIds || []);
	const nextId =
		typeof makeId === 'function'
			? makeId
			: () => `linked-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	const idMap = new Map();
	for (const sourceNode of sourceNodes) {
		let id = String(nextId() || '');
		while (!id || usedIds.has(id)) id = String(nextId() || '');
		usedIds.add(id);
		idMap.set(sourceNode.id, id);
	}
	const sourceRoot = sourceNodes.find((node) => node.id === sourceRootId);
	const sourceRootX = Number(sourceRoot.x) || 0;
	const sourceRootY = Number(sourceRoot.y) || 0;
	const anchorX = Number(anchor?.x) || 0;
	const anchorY = Number(anchor?.y) || 0;
	const nodes = sourceNodes.map((item) => ({
		...item,
		id: idMap.get(item.id),
		type: item.type || (item.file || item.url ? 'file' : 'text'),
		x: anchorX + (Number(item.x) || 0) - sourceRootX,
		y: anchorY + (Number(item.y) || 0) - sourceRootY,
		width: Number(item.width) || Number(anchor?.width) || 300,
		height: Number(item.height) || Number(anchor?.height) || 60
	}));
	const edges = sourceEdges.map((edge) => {
		let edgeId = String(nextId() || '');
		while (!edgeId || usedIds.has(edgeId)) edgeId = String(nextId() || '');
		usedIds.add(edgeId);
		const next = {
			...edge,
			id: edgeId,
			fromNode: idMap.get(edge.fromNode),
			toNode: idMap.get(edge.toNode)
		};
		delete next.from;
		delete next.to;
		return next;
	});
	return {
		ok: true,
		value: { nodes, edges, idMap, rootId: idMap.get(sourceRootId) }
	};
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
	if (!canvas?.nodes) return 0;
	const nodes = Array.from(canvas.nodes.values());
	for (const node of nodes) {
		setCanvasNodeClass(node, 'tomindmap-collapsed-hidden', false);
		setCanvasNodeClass(node, 'tomindmap-collapsed-node', false);
	}
	for (const edge of canvas.edges?.values?.() || [])
		setCanvasEdgeHidden(edge, false);

	const forest = buildForest(canvas, { includeHidden: true });
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
	const stack = [];
	for (let index = forest.length - 1; index >= 0; index--) {
		stack.push({ treeNode: forest[index], hiddenByAncestor: false });
	}
	while (stack.length > 0) {
		const { treeNode, hiddenByAncestor } = stack.pop();
		const node = treeNode.canvasNode;
		if (!node) continue;
		const hasChildren = Array.isArray(treeNode.children) && treeNode.children.length > 0;
		const collapsed = hasChildren && getData(node).collapsed === true;
		if (collapsed) {
			setCanvasNodeClass(node, 'tomindmap-collapsed-node', true);
		} else {
			setCanvasNodeClass(node, 'tomindmap-collapsed-node', false);
		}
		if (hiddenByAncestor) {
			hiddenIds.add(node.id);
			setCanvasNodeClass(node, 'tomindmap-collapsed-hidden', true);
		}
		const hideChildren = hiddenByAncestor || collapsed;
		for (let index = treeNode.children.length - 1; index >= 0; index--) {
			stack.push({
				treeNode: treeNode.children[index],
				hiddenByAncestor: hideChildren
			});
		}
	}
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

	const findFn = findTreeForNode;
	const descFn = getDescendants;
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

	const findFn = findTreeForNode;
	const descFn = getDescendants;
	const treeNode = findFn ? findFn(forest, node.id) : null;
	if (!treeNode || treeNode.children.length === 0) return false;

	const data =
		typeof node.getData === 'function'
			? node.getData()
			: node.unknownData || {};
	const currentlyCollapsed = data.collapsed === true;
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
