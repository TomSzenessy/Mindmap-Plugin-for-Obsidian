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
	toggleSubtreeCollapse,
	topicTitleFromText,
	topicTitleFromNode,
	safeTopicFilename,
	nextTopicFilePath,
	nextTopicNotePath,
	isTextTopicNode,
	getTopicBranch
};
