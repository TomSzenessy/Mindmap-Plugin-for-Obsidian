"use strict";

function editorContent(node) {
  const iframe = node.contentEl?.querySelector("iframe");
  const document = iframe?.contentDocument;
  return document?.querySelector(".cm-content") || null;
}

function hasAsyncRenderableContent(text) {
  return /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|<(?:img|audio|video|source|iframe|object|embed)\b/i.test(String(text || ""));
}

class LiveSizingController {
  constructor(plugin, getGroupIds) {
    this.plugin = plugin;
    this.getGroupIds = getGroupIds;
    this.queueCleanup = null;
    this.watchCleanup = null;
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

  /**
   * Measure the rendered block extent without treating the preview viewport's
   * min-height as content. Child offsets include inter-block margins, which a
   * sum of offsetHeight values misses.
   */
  measureContentHeight(sizer) {
    if (!sizer)
      return 0;
    const clientHeight = Number(sizer.clientHeight || 0);
    const scrollHeight = Number(sizer.scrollHeight || 0);
    let contentHeight = 0;
    const sizerRect = typeof sizer.getBoundingClientRect === "function"
      ? sizer.getBoundingClientRect()
      : null;
    const view = sizer.ownerDocument?.defaultView || null;
    let paddingBottom = 0;
    try {
      paddingBottom = Number.parseFloat(view?.getComputedStyle(sizer)?.paddingBottom || "0") || 0;
    } catch (_) {
      // Detached/test DOM nodes may not expose computed styles.
    }
    for (const child of Array.from(sizer.children || [])) {
      let marginBottom = 0;
      try {
        marginBottom = Number.parseFloat(view?.getComputedStyle(child)?.marginBottom || "0") || 0;
      } catch (_) {
        // Keep the geometry-only measurement.
      }
      if (sizerRect && typeof child.getBoundingClientRect === "function") {
        const childRect = child.getBoundingClientRect();
        contentHeight = Math.max(contentHeight, childRect.bottom - sizerRect.top + marginBottom + paddingBottom);
      }
      const offsetTop = Number(child.offsetTop || 0);
      const offsetHeight = Number(child.offsetHeight || 0);
      contentHeight = Math.max(contentHeight, offsetTop + offsetHeight + marginBottom + paddingBottom);
    }
    if (scrollHeight > clientHeight + 1)
      contentHeight = Math.max(contentHeight, scrollHeight);
    if (contentHeight <= 0 && scrollHeight > 0 && clientHeight <= 0)
      contentHeight = scrollHeight;
    return Math.max(0, Math.ceil(contentHeight));
  }

  /**
   * Return only the Canvas shell outside its content element.
   *
   * The iframe is intrinsically sized to its Markdown in some Obsidian
   * versions. Subtracting it from the saved node height therefore includes
   * any existing empty space and makes that padding self-perpetuating.
   * The content element, by contrast, is the node's layout viewport.
   */
  getPreviewChromeHeight(node) {
    const nodeHeight = Number(node?.height || 0);
    const contentHeight = Number(node?.contentEl?.clientHeight || 0);
    if (contentHeight <= 0 || nodeHeight <= 0)
      return null;
    return Math.max(0, nodeHeight - contentHeight);
  }

  /** Return the live Canvas shell width around a rendered Markdown preview. */
  getPreviewChromeWidth(node) {
    const iframe = node?.contentEl?.querySelector("iframe");
    const sizer = this.getPreviewSizer(node);
    const viewportWidth = Number(iframe?.clientWidth || sizer?.clientWidth || 0);
    const nodeWidth = Number(node?.width || 0);
    if (viewportWidth <= 0 || nodeWidth <= 0)
      return null;
    return Math.max(0, nodeWidth - viewportWidth);
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
          overflowHeight = Math.max(overflowHeight, node.height + scrollHeight - clientHeight);
      }
      return {
        width: Math.min(maxWidth, Math.max(estimate.width, intrinsicWidth)),
        height: Math.min(maxHeight, Math.max(estimate.height, overflowHeight))
      };
    }

    const iframe = node.contentEl?.querySelector("iframe");
    const chromeWidth = this.getPreviewChromeWidth(node) || 0;
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

    const contentHeight = this.measureContentHeight(sizer);
    const chromeHeight = this.getPreviewChromeHeight(node);
    const height = contentHeight > 0 && chromeHeight !== null
      ? Math.min(maxHeight, Math.max(1, Math.ceil(contentHeight + chromeHeight)))
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
    this.stopWatchingCanvas();
    const groupIds = this.getGroupIds(canvas);
    const requested = nodes.filter((node) => node && typeof node.text === "string" && !groupIds.has(node.id));
    if (requested.length === 0) {
      this.plugin.layoutEngine.layout(canvas);
      this.plugin.updateGroupBounds(canvas);
      return;
    }
    let stopped = false;

    const cleanup = () => {
      if (stopped)
        return;
      stopped = true;
      if (this.queueCleanup === cleanup)
        this.queueCleanup = null;
    };
    this.queueCleanup = cleanup;

    const recordCompletedSizing = (measuredIds) => {
      const data = canvas.getData();
      const stored = new Set(Array.isArray(data.mindmapPendingResize) ? data.mindmapPendingResize : []);
      for (const id of measuredIds)
        stored.delete(id);
      if (stored.size > 0)
        data.mindmapPendingResize = Array.from(stored);
      else
        delete data.mindmapPendingResize;
      data.mindmapLayoutVersion = 17;
      canvas.setData(data);
      canvas.requestSave();
    };

    // Preserve the currently drawn graph until the exact pass is ready. This
    // avoids showing a heuristic layout first and then replacing it.
    // No live card is resized individually while this batch is pending.
    void this.plugin.measureMarkdownNodesOffscreen(
      canvas,
      requested,
      () => !stopped && !this.plugin.unloaded && this.plugin.isMindmapCanvas(canvas)
    ).then((measurements) => {
      if (stopped)
        return;
      if (measurements.size === 0) {
        cleanup();
        return;
      }
      const changed = [];
      for (const [id, target] of measurements) {
        const node = canvas.nodes.get(id);
        if (!node || node.isEditing)
          continue;
        if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
          continue;
        node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
        changed.push(node);
      }
      if (changed.length > 0)
        canvas.requestSave();
      this.plugin.layoutEngine.layout(canvas);
      this.plugin.updateGroupBounds(canvas);
      recordCompletedSizing(measurements.keys());
      // Plain Markdown is now final and remains entirely cache-driven. Observe
      // only embeds whose intrinsic size can genuinely change after rendering.
      const asynchronousNodes = requested.filter((node) => hasAsyncRenderableContent(node.text));
      if (asynchronousNodes.length > 0)
        this.watchCanvas(canvas, asynchronousNodes);
      cleanup();
    }).catch((error) => {
      console.error("ToMindMap: initial card measurement failed", error);
      cleanup();
    });
  }

  /**
   * Track only cards with asynchronous embeds after their atomic text sizing
   * pass. Plain Markdown uses its persisted dimensions and is never resized
   * merely because Canvas virtualized or materialized it.
   */
  watchCanvas(canvas, nodes) {
    this.stopWatchingCanvas();
    const wrapper = canvas?.wrapperEl;
    if (!wrapper || typeof MutationObserver === "undefined")
      return;
    const targetIds = new Set(
      (nodes || [])
        .filter((node) => node && typeof node.text === "string")
        .map((node) => node.id)
    );
    if (targetIds.size === 0)
      return;

    let stopped = false;
    let scanQueued = false;
    let discoverAll = true;
    let layoutTimer = null;
    const dirtyIds = new Set();
    const layoutIds = new Set();
    const liveSizers = new Map();
    const iframeRecords = new Map();
    let outerMutationObserver = null;
    let outerResizeObserver = null;

    const isCurrent = () => !stopped
      && !this.plugin.unloaded
      && this.plugin.isMindmapCanvas(canvas)
      && this.plugin.interceptedCanvas === canvas;

    const forgetObserver = (observer) => {
      observer?.disconnect();
      if (observer)
        this.plugin.pendingObservers.delete(observer);
    };

    const cleanupIframeRecord = (iframe, record) => {
      record.mutationObserver?.disconnect();
      record.resizeObserver?.disconnect();
      if (record.mutationObserver)
        this.plugin.pendingObservers.delete(record.mutationObserver);
      if (record.resizeObserver)
        this.plugin.pendingObservers.delete(record.resizeObserver);
      record.document?.removeEventListener("load", record.assetHandler, true);
      iframe?.removeEventListener("load", record.frameHandler);
      iframeRecords.delete(iframe);
    };

    const scheduleLayout = () => {
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers.delete(layoutTimer);
      }
      layoutTimer = setTimeout(() => {
        this.plugin.pendingTimers.delete(layoutTimer);
        layoutTimer = null;
        if (!isCurrent())
          return;
        const changed = Array.from(layoutIds)
          .map((id) => canvas.nodes.get(id))
          .filter(Boolean);
        layoutIds.clear();
        if (changed.length === 0)
          return;
        this.plugin.relayoutAffectedBranches(canvas, changed);
        this.plugin.updateGroupBounds(canvas);
      }, 100);
      this.plugin.pendingTimers.add(layoutTimer);
    };

    const scan = () => {
      scanQueued = false;
      if (!isCurrent())
        return;
      const groupIds = this.getGroupIds(canvas);
      if (discoverAll) {
        discoverAll = false;
        for (const id of targetIds)
          dirtyIds.add(id);
      }

      const changed = [];
      const ids = Array.from(dirtyIds);
      dirtyIds.clear();
      for (const id of ids) {
        const node = canvas.nodes.get(id);
        if (!node || node.isEditing || groupIds.has(id) || typeof node.text !== "string")
          continue;
        const sizer = this.getPreviewSizer(node);
        if (!sizer) {
          observeNodeDocument(node);
          continue;
        }
        observeNode(node, sizer);
        const target = this.measure(node);
        if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
          continue;
        node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
        changed.push(node);
        layoutIds.add(id);
        // Width changes alter Markdown wrapping. Remeasure from the next
        // rendered frame instead of predicting the resulting height.
        dirtyIds.add(id);
      }
      if (changed.length > 0) {
        canvas.requestSave();
        scheduleLayout();
      }
      if (dirtyIds.size > 0)
        queueScan();
    };

    const queueScan = (nodeId, rediscover = false) => {
      if (nodeId)
        dirtyIds.add(nodeId);
      if (rediscover)
        discoverAll = true;
      if (scanQueued || !isCurrent())
        return;
      scanQueued = true;
      this.plugin.trackedRaf(scan);
    };

    const createIframeRecord = (node, iframe, document) => {
      const record = {
        document,
        nodeId: node.id,
        observedSizers: new WeakSet(),
        mutationObserver: null,
        resizeObserver: null,
        assetHandler: () => queueScan(record.nodeId),
        frameHandler: () => queueScan(node.id, true)
      };
      iframe.addEventListener("load", record.frameHandler);
      document?.addEventListener("load", record.assetHandler, true);
      if (document?.documentElement) {
        record.mutationObserver = new MutationObserver(() => queueScan(record.nodeId));
        record.mutationObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
        this.plugin.pendingObservers.add(record.mutationObserver);
      }
      const ResizeObserverCtor = document?.defaultView?.ResizeObserver;
      if (typeof ResizeObserverCtor === "function") {
        record.resizeObserver = new ResizeObserverCtor(() => queueScan(record.nodeId));
        this.plugin.pendingObservers.add(record.resizeObserver);
      }
      const fontsReady = document?.fonts?.ready;
      if (fontsReady && typeof fontsReady.then === "function")
        void fontsReady.then(() => queueScan(record.nodeId));
      iframeRecords.set(iframe, record);
      return record;
    };

    const observeNodeDocument = (node) => {
      const iframe = node.contentEl?.querySelector("iframe");
      if (iframe) {
        let record = iframeRecords.get(iframe);
        if (record && iframe.contentDocument && record.document !== iframe.contentDocument) {
          cleanupIframeRecord(iframe, record);
          record = null;
        }
        record = record || createIframeRecord(node, iframe, iframe.contentDocument);
        record.nodeId = node.id;
        return { iframe, record };
      }
      return null;
    };

    const observeNode = (node, sizer) => {
      const previousSizer = liveSizers.get(node.id);
      if (previousSizer !== sizer)
        liveSizers.set(node.id, sizer);
      const iframeState = observeNodeDocument(node);
      if (iframeState) {
        const { record } = iframeState;
        if (record.resizeObserver && !record.observedSizers.has(sizer)) {
          try {
            record.resizeObserver.observe(sizer);
            record.observedSizers.add(sizer);
          } catch (_) {
            // The iframe mutation/load listeners still cover this preview.
          }
        }
        return;
      }
      if (outerResizeObserver && previousSizer !== sizer) {
        try {
          outerResizeObserver.observe(sizer);
        } catch (_) {
          // Outer DOM mutations will rediscover and remeasure the card.
        }
      }
    };

    outerMutationObserver = new MutationObserver(() => queueScan(null, true));
    outerMutationObserver.observe(wrapper, { childList: true, subtree: true });
    this.plugin.pendingObservers.add(outerMutationObserver);
    if (typeof ResizeObserver !== "undefined") {
      outerResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          for (const [id, sizer] of liveSizers) {
            if (sizer === entry.target)
              dirtyIds.add(id);
          }
        }
        queueScan();
      });
      this.plugin.pendingObservers.add(outerResizeObserver);
    }

    const cleanup = () => {
      if (stopped)
        return;
      stopped = true;
      forgetObserver(outerMutationObserver);
      forgetObserver(outerResizeObserver);
      for (const [iframe, record] of Array.from(iframeRecords))
        cleanupIframeRecord(iframe, record);
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers.delete(layoutTimer);
      }
      dirtyIds.clear();
      layoutIds.clear();
      liveSizers.clear();
      if (this.watchCleanup === cleanup)
        this.watchCleanup = null;
    };
    this.watchCleanup = cleanup;
    queueScan(null, true);
  }

  stopWatchingCanvas() {
    if (this.watchCleanup)
      this.watchCleanup();
  }

  cancelQueue() {
    if (this.queueCleanup)
      this.queueCleanup();
  }
}

module.exports = { LiveSizingController };
