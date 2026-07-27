"use strict";

function editorContent(node) {
  const iframe = node.contentEl?.querySelector("iframe");
  const document = iframe?.contentDocument;
  return document?.querySelector(".cm-content") || null;
}

class LiveSizingController {
  constructor(plugin, getGroupIds) {
    this.plugin = plugin;
    this.getGroupIds = getGroupIds;
    this.queueCleanup = null;
  }

  getPreviewSizer(node) {
    const iframe = node.contentEl?.querySelector("iframe");
    try {
      const inner = iframe?.contentDocument?.querySelector(".markdown-preview-sizer");
      if (inner)
        return inner;
    } catch (_) {
      // Canvas media can contain cross-origin frames; those are not previews.
    }
    return node.contentEl?.querySelector(".markdown-preview-sizer") || null;
  }

  waitForPreview(node, callback) {
    if (this.getPreviewSizer(node) && !node.isEditing) {
      callback();
      return;
    }
    const contentEl = node.contentEl;
    if (!contentEl || typeof MutationObserver === "undefined") {
      this.plugin.trackedTimeout(() => {
        if (!node.isEditing)
          callback();
      }, 100);
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished || node.isEditing || !this.getPreviewSizer(node))
        return;
      finished = true;
      observer.disconnect();
      this.plugin.pendingObservers.delete(observer);
      callback();
    };
    const observer = new MutationObserver(() => this.plugin.trackedRaf(finish));
    this.plugin.pendingObservers.add(observer);
    observer.observe(contentEl, { childList: true, subtree: true });
    for (const delay of [100, 250, 600, 1200])
      this.plugin.trackedTimeout(finish, delay);
  }

  estimate(text) {
    const settings = this.plugin.settings;
    const minWidth = Math.max(80, Math.min(settings.minNodeWidth, settings.maxNodeWidth));
    const maxWidth = Math.max(minWidth, settings.maxNodeWidth);
    const softMaxWidth = Math.min(maxWidth, Math.max(720, settings.defaultNodeWidth * 2.4));
    const minHeight = settings.defaultNodeHeight;
    const lines = String(text || "").split("\n").map((line) => line
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^[\s>*#\-\d.)]+/, "")
      .replace(/[*_`~[\]|]/g, " ")
      .replace(/\s+/g, " ")
      .trim());
    const charWidth = 7.5;
    const horizontalChrome = 44;
    const lineHeight = 22;
    const words = lines.flatMap((line) => line.split(/\s+/).filter(Boolean));
    const longestWord = Math.max(0, ...words.map((word) => word.length * charWidth));
    const firstWidth = Math.min(softMaxWidth, Math.max(minWidth, longestWord + horizontalChrome));
    const lineCount = (width) => {
      const available = Math.max(40, width - horizontalChrome);
      let count = 0;
      for (const line of lines) {
        const lineWords = line.split(/\s+/).filter(Boolean);
        if (lineWords.length === 0) {
          count++;
          continue;
        }
        let used = 0;
        for (const word of lineWords) {
          const wordWidth = word.length * charWidth;
          if (used > 0 && used + charWidth + wordWidth > available) {
            count++;
            used = wordWidth;
          } else {
            used += (used > 0 ? charWidth : 0) + wordWidth;
          }
        }
        count++;
      }
      return Math.max(1, count);
    };
    let best = null;
    for (let width = Math.ceil(firstWidth / 10) * 10; width <= softMaxWidth; width += 20) {
      const height = Math.max(minHeight, 28 + lineCount(width) * lineHeight);
      const aspect = width / Math.max(1, height);
      const score = width * height * (1 + Math.max(0, 1.1 - aspect) * 0.45 + Math.max(0, aspect - 5.5) * 0.08);
      if (!best || score < best.score || score === best.score && height < best.height)
        best = { width, height, score };
    }
    return best || { width: minWidth, height: minHeight };
  }

  measure(node) {
    if (typeof node.text !== "string")
      return { width: node.width, height: node.height };
    const settings = this.plugin.settings;
    const minWidth = Math.max(80, Math.min(settings.minNodeWidth, settings.maxNodeWidth));
    const maxWidth = Math.max(minWidth, settings.maxNodeWidth);
    const minHeight = settings.defaultNodeHeight;
    const maxHeight = settings.maxNodeHeight;
    const rawText = node.isEditing ? editorContent(node)?.innerText || node.text : node.text;
    const estimate = this.estimate(rawText);
    const sizer = this.getPreviewSizer(node);
    if (!sizer || node.isEditing) {
      let intrinsicWidth = 0;
      let overflowHeight = 0;
      const elements = typeof node.contentEl?.querySelectorAll === "function"
        ? Array.from(node.contentEl.querySelectorAll("*"))
        : [];
      for (const element of elements) {
        const clientWidth = Number(element.clientWidth || 0);
        const scrollWidth = Number(element.scrollWidth || 0);
        if (clientWidth > 0 && scrollWidth > clientWidth + 1)
          intrinsicWidth = Math.max(intrinsicWidth, node.width + scrollWidth - clientWidth + 12);
        const clientHeight = Number(element.clientHeight || 0);
        const scrollHeight = Number(element.scrollHeight || 0);
        if (clientHeight > 0 && scrollHeight > clientHeight + 1)
          overflowHeight = Math.max(overflowHeight, node.height + scrollHeight - clientHeight + 12);
      }
      return {
        width: Math.min(maxWidth, Math.max(estimate.width, intrinsicWidth)),
        height: Math.min(maxHeight, Math.max(estimate.height, overflowHeight))
      };
    }

    const iframe = node.contentEl?.querySelector("iframe");
    const viewportWidth = Number(iframe?.clientWidth || sizer.clientWidth || 0);
    const chromeWidth = Math.max(36, Number(node.width || 0) - viewportWidth);
    let intrinsicWidth = 0;
    const measurementElements = new Set([sizer]);
    const addTree = (root) => {
      if (!root)
        return;
      measurementElements.add(root);
      if (typeof root.querySelectorAll === "function") {
        for (const element of root.querySelectorAll("*"))
          measurementElements.add(element);
      }
    };
    addTree(sizer);
    try {
      addTree(iframe?.contentDocument?.documentElement);
      addTree(iframe?.contentDocument?.body);
    } catch (_) {
      // Ignore cross-origin embedded media frames.
    }
    for (const element of measurementElements) {
      const clientWidth = Number(element.clientWidth || 0);
      const scrollWidth = Number(element.scrollWidth || 0);
      if (clientWidth > 0 && scrollWidth > clientWidth + 1)
        intrinsicWidth = Math.max(intrinsicWidth, node.width + scrollWidth - clientWidth + 8);
      const tag = String(element.tagName || "").toLowerCase();
      if (/^(?:table|pre|img|video|audio|iframe|embed|object)$/.test(tag))
        intrinsicWidth = Math.max(intrinsicWidth, scrollWidth + chromeWidth, Number(element.offsetWidth || 0) + chromeWidth);
    }
    const width = Math.min(maxWidth, Math.max(minWidth, estimate.width, Math.ceil(intrinsicWidth / 10) * 10 || 0));
    if (Math.abs(width - node.width) > 1)
      return { width, height: Math.min(maxHeight, estimate.height) };

    const children = Array.from(sizer.children);
    const childrenHeight = children.reduce((sum, child) => sum + Number(child.offsetHeight || 0), 0);
    const scrollHeight = Number(sizer.scrollHeight || 0);
    const clientHeight = Number(sizer.clientHeight || 0);
    let contentHeight = childrenHeight;
    if (scrollHeight > clientHeight + 1)
      contentHeight = Math.max(contentHeight, scrollHeight);
    if (contentHeight <= 0)
      contentHeight = Number(sizer.offsetHeight || 0);
    const viewportHeight = Number(iframe?.clientHeight || clientHeight || 0);
    const chromeHeight = Math.max(20, Number(node.height || 0) - viewportHeight);
    const height = contentHeight > 0
      ? Math.min(maxHeight, Math.max(minHeight, Math.ceil(contentHeight + chromeHeight + 10)))
      : Math.min(maxHeight, estimate.height);
    return { width, height };
  }

  apply(canvas, nodes, relayout = false) {
    const changed = [];
    for (const node of nodes) {
      if (!node || node.isEditing)
        continue;
      const target = this.measure(node);
      if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
        continue;
      node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
      changed.push(node);
    }
    if (changed.length > 0) {
      canvas.requestSave();
      if (relayout)
        this.plugin.relayoutAffectedBranches(canvas, changed);
    }
    return changed;
  }

  applyEstimates(canvas, nodes) {
    let changed = false;
    for (const node of nodes) {
      if (!node || typeof node.text !== "string")
        continue;
      const target = this.estimate(node.text);
      if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
        continue;
      node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
      changed = true;
    }
    if (changed)
      canvas.requestSave();
  }

  resizeNodes(canvas, nodes) {
    const changed = this.apply(canvas, nodes, false);
    if (changed.length === 0)
      return;
    for (const delay of [120, 280, 600])
      this.plugin.trackedTimeout(() => this.resizeNodesRetry(canvas, nodes), delay);
  }

  resizeNodesRetry(canvas, nodes) {
    if (!this.plugin.isAutoAdjustCanvas(canvas) || !this.plugin.isMindmapCanvas(canvas))
      return;
    this.apply(canvas, nodes, true);
  }

  resizeNodesWhenRendered(canvas, nodes) {
    this.cancelQueue();
    const groupIds = this.getGroupIds(canvas);
    const pending = new Set(nodes.filter((node) => node && typeof node.text === "string" && !groupIds.has(node.id)).map((node) => node.id));
    if (pending.size === 0) {
      this.plugin.layoutEngine.layout(canvas);
      this.plugin.updateGroupBounds(canvas);
      return;
    }
    const requestedIds = new Set(pending);
    const measuredIds = new Set();
    const state = new Map();
    let stopped = false;
    let mutationObserver = null;
    let resizeObserver = null;
    let scanQueued = false;
    let layoutTimer = null;

    const cleanup = () => {
      if (stopped)
        return;
      stopped = true;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (mutationObserver)
        this.plugin.pendingObservers.delete(mutationObserver);
      if (resizeObserver)
        this.plugin.pendingObservers.delete(resizeObserver);
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers.delete(layoutTimer);
      }
      if (this.queueCleanup === cleanup)
        this.queueCleanup = null;
    };
    this.queueCleanup = cleanup;

    const recordCompletedSizing = () => {
      const data = canvas.getData();
      const stored = new Set(Array.isArray(data.mindmapPendingResize) ? data.mindmapPendingResize : []);
      for (const id of measuredIds)
        stored.delete(id);
      if (stored.size > 0)
        data.mindmapPendingResize = Array.from(stored);
      else
        delete data.mindmapPendingResize;
      const allTopicsRequested = Array.from(canvas.nodes.values())
        .filter((node) => !groupIds.has(node.id) && typeof node.text === "string")
        .every((node) => requestedIds.has(node.id));
      if (allTopicsRequested && pending.size === 0)
        data.mindmapLayoutVersion = 10;
      canvas.setData(data);
      canvas.requestSave();
    };

    const scheduleLayout = () => {
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers.delete(layoutTimer);
      }
      layoutTimer = setTimeout(() => {
        this.plugin.pendingTimers.delete(layoutTimer);
        layoutTimer = null;
        if (stopped || !this.plugin.isMindmapCanvas(canvas))
          return;
        this.plugin.layoutEngine.layout(canvas);
        this.plugin.updateGroupBounds(canvas);
        if (pending.size === 0) {
          recordCompletedSizing();
          cleanup();
        }
      }, 220);
      this.plugin.pendingTimers.add(layoutTimer);
    };

    const scan = () => {
      scanQueued = false;
      if (stopped || !this.plugin.isMindmapCanvas(canvas))
        return;
      const changed = [];
      for (const id of [...pending]) {
        const node = canvas.nodes.get(id);
        if (!node) {
          pending.delete(id);
          continue;
        }
        const sizer = this.getPreviewSizer(node);
        if (!sizer || node.isEditing)
          continue;
        try {
          resizeObserver?.observe(sizer);
        } catch (_) {
          // Some Electron builds reject cross-document ResizeObserver targets.
        }
        const target = this.measure(node);
        const signature = `${target.width}x${target.height}`;
        const previous = state.get(id);
        const isSame = Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1;
        if (!isSame) {
          node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
          changed.push(node);
        }
        const stable = isSame && previous?.signature === signature ? previous.stable + 1 : 0;
        state.set(id, { signature, stable });
        if (stable >= 2) {
          pending.delete(id);
          measuredIds.add(id);
        }
      }
      if (changed.length > 0) {
        canvas.requestSave();
        this.plugin.relayoutAffectedBranches(canvas, changed);
        scheduleLayout();
      }
      if (pending.size === 0)
        scheduleLayout();
    };
    const queueScan = () => {
      if (scanQueued || stopped)
        return;
      scanQueued = true;
      this.plugin.trackedRaf(scan);
    };

    this.applyEstimates(canvas, nodes);
    this.plugin.layoutEngine.layout(canvas);
    this.plugin.updateGroupBounds(canvas);

    // Canvas virtualizes distant cards. Measure every imported topic once in
    // an invisible real Markdown renderer, then lay out the completed batch.
    void this.plugin.measureMarkdownNodesOffscreen(
      canvas,
      nodes,
      () => !stopped && !this.plugin.unloaded && this.plugin.isMindmapCanvas(canvas)
    ).then((measurements) => {
      if (stopped || measurements.size === 0)
        return;
      let changed = false;
      for (const [id, target] of measurements) {
        const node = canvas.nodes.get(id);
        if (!node || node.isEditing)
          continue;
        pending.delete(id);
        measuredIds.add(id);
        if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
          continue;
        node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
        changed = true;
      }
      if (changed)
        canvas.requestSave();
      scheduleLayout();
    }).catch((error) => {
      console.error("ToMindMap: initial card measurement failed", error);
    });

    if (canvas.wrapperEl && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(queueScan);
      mutationObserver.observe(canvas.wrapperEl, { childList: true, subtree: true });
      this.plugin.pendingObservers.add(mutationObserver);
    }
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(queueScan);
      this.plugin.pendingObservers.add(resizeObserver);
    }
    for (const delay of [0, 80, 180, 350, 700, 1200, 2200, 4000, 7000])
      this.plugin.trackedTimeout(scan, delay);
  }

  cancelQueue() {
    if (this.queueCleanup)
      this.queueCleanup();
  }
}

module.exports = { LiveSizingController };
