"use strict";

function topicNode(value) {
  return value?.canvasNode || value;
}

function topicText(value) {
  const node = topicNode(value);
  const text = node?.text ?? node?.unknownData?.text;
  if (typeof text === "string" && text.trim())
    return text;
  const file = node?.unknownData?.file ?? node?.file?.path ?? node?.file;
  if (typeof file === "string")
    return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(file)
      ? `![](<${file}>)`
      : file;
  const url = node?.unknownData?.url ?? node?.url;
  if (typeof url === "string")
    return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(url)
      ? `![](<${url}>)`
      : url;
  return "";
}

function isStandaloneBlock(value) {
  const text = String(topicText(value) || "").trim();
  const lines = text.split("\n");
  return /^(```|~~~|\$\$)/.test(text)
    || /^(?:-{3,}|_{3,}|\*(?:\s*\*){2,})$/.test(text)
    || /^>\s?/.test(text)
    || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(text)
    || /^!\[\[[^\]]+\]\]\s*$/.test(text)
    || /^<(?:(?:table|pre|img|picture|audio|video|iframe|object|embed)\b)/i.test(text)
    || lines.length >= 2
      && /^\s*\|.*\|\s*$/.test(lines[0])
      && /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[1]);
}

function compareTopToBottom(left, right) {
  const a = topicNode(left);
  const b = topicNode(right);
  // A raw block must precede heading siblings at the same parent, otherwise
  // Markdown would attach it to the last emitted heading and change the graph.
  return Number(isStandaloneBlock(right)) - Number(isStandaloneBlock(left))
    || (Number(a?.y) || 0) - (Number(b?.y) || 0)
    || (Number(a?.x) || 0) - (Number(b?.x) || 0)
    || String(a?.id || "").localeCompare(String(b?.id || ""));
}

/**
 * Return siblings in the chronology readers expect from a radial mind map.
 * Only a central topic splits its children into sides: right top-to-bottom,
 * followed by left top-to-bottom. Inside either branch, reading order is
 * simply top-to-bottom.
 */
function orderChildren(parent, children, splitRootSides = false) {
  const values = [...children];
  if (!splitRootSides)
    return values.sort(compareTopToBottom);
  const parentNode = topicNode(parent);
  const parentCenter = (Number(parentNode?.x) || 0) + (Number(parentNode?.width) || 0) / 2;
  const sideRank = (value) => {
    const node = topicNode(value);
    const center = (Number(node?.x) || 0) + (Number(node?.width) || 0) / 2;
    return center >= parentCenter ? 0 : 1;
  };
  return values.sort((left, right) => sideRank(left) - sideRank(right) || compareTopToBottom(left, right));
}

function canvasTopicPreorder(canvas, getGroupIds) {
  const groupIds = getGroupIds(canvas);
  const nodeById = new Map(
    Array.from(canvas.nodes.values())
      .filter((node) => !groupIds.has(node.id))
      .map((node) => [node.id, node])
  );
  const childrenById = new Map(Array.from(nodeById.keys()).map((id) => [id, []]));
  const childIds = new Set();
  for (const edge of canvas.getData().edges || []) {
    if (!nodeById.has(edge.fromNode) || !nodeById.has(edge.toNode))
      continue;
    childrenById.get(edge.fromNode).push(edge.toNode);
    childIds.add(edge.toNode);
  }
  const position = (id) => nodeById.get(id);
  const roots = Array.from(nodeById.keys())
    .filter((id) => !childIds.has(id))
    .sort((a, b) => position(a).y - position(b).y || position(a).x - position(b).x);
  const result = [];
  const visited = new Set();
  const rootIds = new Set(roots);
  const visit = (id) => {
    if (visited.has(id))
      return;
    visited.add(id);
    result.push(id);
    const children = orderChildren(
      position(id),
      (childrenById.get(id) || []).map(position).filter(Boolean),
      rootIds.has(id)
    ).map((child) => child.id);
    for (const child of children)
      visit(child);
  };
  for (const root of roots)
    visit(root);
  for (const id of nodeById.keys())
    visit(id);
  return result;
}

function orderMatches(canvas, imported, getGroupIds) {
  if (!imported)
    return false;
  const liveOrder = canvasTopicPreorder(canvas, getGroupIds);
  const liveIds = new Set(liveOrder);
  const sources = Array.isArray(imported.topicSources) ? imported.topicSources.filter((record) => liveIds.has(record.id)) : [];
  if (sources.length !== liveOrder.length)
    return false;
  const desiredIndex = new Map(liveOrder.map((id, index) => [id, index]));
  const children = new Map();
  for (const record of sources) {
    const key = record.parentId || "";
    if (!children.has(key))
      children.set(key, []);
    children.get(key).push(record);
  }
  for (const records of children.values()) {
    const desired = [...records].sort((left, right) => desiredIndex.get(left.id) - desiredIndex.get(right.id));
    if (records.every((record, index) => desired[index]?.id === record.id))
      continue;
    if (canMoveSourceSiblings(records))
      return false;
  }
  return true;
}

function canMoveSourceSiblings(records) {
  if (records.length < 2)
    return false;
  if (records.every((record) => record.kind === "heading")) {
    const level = records[0].level;
    return records.every((record) => record.level === level);
  }
  if (records.every((record) => record.kind === "list")) {
    const indent = records[0].indent || "";
    return records.every((record) => (record.indent || "") === indent);
  }
  return false;
}

function reorderPreservingSource(markdown, canvas, dependencies) {
  const {
    getGroupIds,
    parseDocument,
    lineRecords,
    withMetadata,
    withoutLegacyComments,
    identityKey,
    identityLabel,
    nodeText = (node) => node?.text || "Untitled"
  } = dependencies;
  let result = String(markdown || "");
  const desiredOrder = canvasTopicPreorder(canvas, getGroupIds);
  const desiredIndex = new Map(desiredOrder.map((id, index) => [id, index]));
  const desiredChildren = new Map();
  const addDesired = (parentId, id) => {
    const key = parentId || "";
    if (!desiredChildren.has(key))
      desiredChildren.set(key, []);
    desiredChildren.get(key).push(id);
  };
  const groupIds = getGroupIds(canvas);
  const liveIds = new Set(Array.from(canvas.nodes.keys()).filter((id) => !groupIds.has(id)));
  const liveParents = new Map();
  for (const edge of canvas.getData().edges || []) {
    if (liveIds.has(edge.fromNode) && liveIds.has(edge.toNode))
      liveParents.set(edge.toNode, edge.fromNode);
  }
  for (const id of desiredOrder)
    addDesired(liveParents.get(id), id);

  for (let pass = 0; pass < Math.max(1, desiredOrder.length); pass++) {
    const parsed = parseDocument(result);
    const sourceById = new Map(parsed.topicSources.map((record) => [record.id, record]));
    const sourceChildren = new Map();
    for (const record of parsed.topicSources) {
      const key = record.parentId || "";
      if (!sourceChildren.has(key))
        sourceChildren.set(key, []);
      sourceChildren.get(key).push(record.id);
    }
    const mismatches = [];
    for (const [parentKey, wanted] of desiredChildren) {
      const current = sourceChildren.get(parentKey) || [];
      if (current.length !== wanted.length)
        continue;
      const currentSet = new Set(current);
      if (wanted.some((id) => !currentSet.has(id)) || wanted.every((id, index) => current[index] === id))
        continue;
      const siblingRecords = current.map((id) => sourceById.get(id)).filter(Boolean);
      if (siblingRecords.length !== current.length || !canMoveSourceSiblings(siblingRecords))
        continue;
      let depth = 0;
      let parent = parentKey || null;
      const seen = new Set();
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        depth++;
        parent = sourceById.get(parent)?.parentId || null;
      }
      mismatches.push({ parentKey, wanted, current, depth });
    }
    if (mismatches.length === 0)
      break;
    mismatches.sort((a, b) => b.depth - a.depth
      || (desiredIndex.get(a.parentKey) || 0) - (desiredIndex.get(b.parentKey) || 0));
    const mismatch = mismatches[0];
    const records = lineRecords(result);
    const descendants = (id, found = new Set()) => {
      if (found.has(id))
        return found;
      found.add(id);
      for (const child of sourceChildren.get(id) || [])
        descendants(child, found);
      return found;
    };
    const ranges = new Map();
    let valid = true;
    for (const id of mismatch.current) {
      const topics = Array.from(descendants(id))
        .map((candidate) => sourceById.get(candidate))
        .filter(Boolean);
      const startLine = Math.min(...topics.map((record) => record.startLine));
      const endLine = Math.max(...topics.map((record) => record.endLine));
      const first = records[startLine];
      const last = records[endLine - 1];
      if (!first || !last) {
        valid = false;
        break;
      }
      ranges.set(id, { start: first.start, end: last.end });
    }
    const ordered = mismatch.current.map((id) => ranges.get(id));
    if (!valid || ordered.some((range) => !range))
      break;
    if (ordered.some((range, index) => index > 0 && ordered[index - 1].end > range.start))
      break;
    const gaps = ordered.slice(0, -1)
      .map((range, index) => result.slice(range.end, ordered[index + 1].start));
    const pieces = new Map(mismatch.current.map((id) => {
      const range = ranges.get(id);
      return [id, result.slice(range.start, range.end)];
    }));
    const replacement = mismatch.wanted
      .map((id, index) => `${index > 0 ? gaps[index - 1] || "" : ""}${pieces.get(id) || ""}`)
      .join("");
    const updated = result.slice(0, ordered[0].start)
      + replacement
      + result.slice(ordered[ordered.length - 1].end);
    if (updated === result)
      break;
    result = updated;
  }

  const liveById = new Map(Array.from(canvas.nodes.values()).map((node) => [node.id, node]));
  return withMetadata(
    withoutLegacyComments(result),
    desiredOrder,
    desiredOrder.map((id) => identityKey(nodeText(liveById.get(id)))),
    desiredOrder.map((id) => identityLabel(nodeText(liveById.get(id))))
  );
}

module.exports = {
  compareTopToBottom,
  orderChildren,
  canvasTopicPreorder,
  orderMatches,
  reorderPreservingSource
};
