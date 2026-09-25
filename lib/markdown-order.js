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
 * Sort siblings with the block flag resolved once per topic.
 *
 * `compareTopToBottom` re-reads and re-classifies each topic's text, so calling
 * it from `sort` costs that work O(n log n) times. A central topic with tens of
 * thousands of siblings is a normal mind map, not an edge case, so the flag is
 * decorated onto each value up front and the ordering rule is unchanged.
 */
function sortSiblings(values, compare) {
  return values
    .map((value) => {
      const node = topicNode(value);
      return {
        value,
        block: isStandaloneBlock(node),
        y: Number(node?.y) || 0,
        x: Number(node?.x) || 0,
        id: String(node?.id || "")
      };
    })
    .sort((left, right) => compare(left, right))
    .map((entry) => entry.value);
}

/**
 * Return siblings in the chronology readers expect from a radial mind map.
 * Only a central topic splits its children into sides: right top-to-bottom,
 * followed by left top-to-bottom. Inside either branch, reading order is
 * simply top-to-bottom.
 */
function orderChildren(parent, children, splitRootSides = false) {
  const byPosition = (left, right) =>
    right.block - left.block || left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
  if (!splitRootSides)
    return sortSiblings(children, byPosition);
  const parentNode = topicNode(parent);
  const parentCenter = (Number(parentNode?.x) || 0) + (Number(parentNode?.width) || 0) / 2;
  const sideRank = (entry) => entry.x + (Number(topicNode(entry.value)?.width) || 0) / 2 >= parentCenter ? 0 : 1;
  return sortSiblings(children, (left, right) => sideRank(left) - sideRank(right) || byPosition(left, right));
}

/**
 * One parent/child view of a live Canvas: `{nodes, parents, children, roots}`.
 *
 * A topic has exactly one parent. The first edge that reaches it wins, a
 * surplus parent, a directed cycle, a self loop, and a dangling endpoint are
 * all ignored, and a union-find over the accepted edges keeps the decision
 * from depending on iteration order. Reading the edge list directly with a
 * last-write-wins parent map would instead let a surplus edge move a topic
 * under a different parent and reorder the map underneath the user.
 *
 * `options.graph` accepts that same shape from a caller that already owns the
 * canonical forest, which keeps one graph authoritative across this module and
 * its callers instead of rebuilding the same rules twice.
 */
function canvasTopicGraph(canvas, getGroupIds, options = {}) {
  const supplied = options?.graph;
  if (supplied && supplied.nodes instanceof Map && supplied.parents instanceof Map)
    return supplied;
  const groupIds = typeof getGroupIds === "function" ? getGroupIds(canvas) : new Set();
  const nodes = new Map();
  for (const node of canvas?.nodes?.values?.() || []) {
    if (!node?.id || groupIds.has(node.id)) continue;
    nodes.set(node.id, node);
  }
  const children = new Map();
  for (const id of nodes.keys()) children.set(id, []);
  const parents = new Map();
  const component = new Map(Array.from(nodes.keys(), (id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (component.get(root) !== root) root = component.get(root);
    while (component.get(id) !== id) {
      const next = component.get(id);
      component.set(id, root);
      id = next;
    }
    return root;
  };
  for (const edge of canvas?.getData?.()?.edges || []) {
    const from = edge?.fromNode;
    const to = edge?.toNode;
    if (!nodes.has(from) || !nodes.has(to) || from === to || parents.has(to)) continue;
    const left = find(from);
    const right = find(to);
    if (left === right) continue;
    component.set(right, left);
    parents.set(to, from);
    children.get(from).push(to);
  }
  return {
    groupIds,
    nodes,
    parents,
    children,
    roots: Array.from(nodes.keys()).filter((id) => !parents.has(id))
  };
}

/** The live topics in the chronological reading order of the canonical graph. */
function canvasTopicPreorder(canvas, getGroupIds, options = {}) {
  const graph = canvasTopicGraph(canvas, getGroupIds, options);
  const position = (id) => graph.nodes.get(id);
  const roots = [...graph.roots].sort(
    (left, right) =>
      (Number(position(left)?.y) || 0) - (Number(position(right)?.y) || 0)
      || (Number(position(left)?.x) || 0) - (Number(position(right)?.x) || 0)
      || String(left).localeCompare(String(right))
  );
  const rootIds = new Set(roots);
  // Membership is tracked in a Set beside the list: scanning the growing list
  // would make a wide map quadratic. The walk itself is an explicit stack, so
  // depth costs memory rather than call frames.
  const result = [];
  const visited = new Set();
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const id = stack.pop();
    if (visited.has(id))
      continue;
    visited.add(id);
    result.push(id);
    const children = orderChildren(
      position(id),
      (graph.children.get(id) || []).map(position).filter(Boolean),
      rootIds.has(id)
    ).map((child) => child.id);
    for (let index = children.length - 1; index >= 0; index--)
      stack.push(children[index]);
  }
  for (const id of graph.nodes.keys())
    if (!visited.has(id))
      result.push(id);
  return result;
}

function orderMatches(canvas, imported, getGroupIds, options = {}) {
  if (!imported)
    return false;
  const liveOrder = canvasTopicPreorder(canvas, getGroupIds, options);
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

/** Every source record under `rootId`, collected with an explicit stack. */
function collectDescendants(rootId, sourceChildren) {
  const found = new Set();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (found.has(id))
      continue;
    found.add(id);
    for (const child of sourceChildren.get(id) || [])
      stack.push(child);
  }
  return found;
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
    nodeText = (node) => node?.text || "Untitled",
    graph
  } = dependencies;
  let result = String(markdown || "");
  const topicGraph = canvasTopicGraph(canvas, getGroupIds, graph ? { graph } : {});
  const desiredOrder = canvasTopicPreorder(canvas, getGroupIds, { graph: topicGraph });
  const desiredIndex = new Map(desiredOrder.map((id, index) => [id, index]));
  const desiredChildren = new Map();
  const addDesired = (parentId, id) => {
    const key = parentId || "";
    if (!desiredChildren.has(key))
      desiredChildren.set(key, []);
    desiredChildren.get(key).push(id);
  };
  for (const id of desiredOrder) addDesired(topicGraph.parents.get(id), id);

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
    const ranges = new Map();
    let valid = true;
    for (const id of mismatch.current) {
      const topics = collectDescendants(id, sourceChildren);
      // Measured in a loop: `Math.min(...topics)` throws once a subtree has
      // more than roughly 125,000 records, which one wide branch can reach.
      let startLine = Infinity;
      let endLine = -Infinity;
      for (const candidate of topics) {
        const record = sourceById.get(candidate);
        if (!record) continue;
        if (record.startLine < startLine) startLine = record.startLine;
        if (record.endLine > endLine) endLine = record.endLine;
      }
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

  return withMetadata(
    withoutLegacyComments(result),
    desiredOrder,
    desiredOrder.map((id) => identityKey(nodeText(topicGraph.nodes.get(id)))),
    desiredOrder.map((id) => identityLabel(nodeText(topicGraph.nodes.get(id))))
  );
}

module.exports = {
  canvasTopicGraph,
  compareTopToBottom,
  orderChildren,
  canvasTopicPreorder,
  orderMatches,
  reorderPreservingSource
};
