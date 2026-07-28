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

	if (descFn) {
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
	toggleSubtreeCollapse
};
