"use strict";

const CARD_LAYOUT_VERSION = 38;
const MAX_MEASUREMENT_LINES = 256;
const MAX_MEASUREMENT_WORDS = 4096;
const MAX_LAYOUT_CANDIDATES = 2048;
const MAX_MEASUREMENT_ELEMENTS = 4096;
const SIZING_STATUS = Object.freeze({
  MEASURED: "measured",
  UNAVAILABLE: "unavailable",
  CANCELLED: "cancelled"
});

function isTextTopicCard(node, groupIds = new Set()) {
  if (!node) return false;
  if (groupIds && typeof groupIds.has === "function" && groupIds.has(node.id)) return false;
  if (node.file || node.url) return false;
  const type = node.unknownData?.type || node.type;
  if (type === "file" || type === "link" || type === "group") return false;
  return typeof node.text === "string";
}

function collectBoundedElements(root, elements, limit = MAX_MEASUREMENT_ELEMENTS) {
  if (!root) return false;
  const pending = [root];
  while (pending.length > 0 && elements.size < limit) {
    const current = pending.pop();
    if (!current || elements.has(current)) continue;
    elements.add(current);
    const children = current.children;
    if (children && typeof children.length === "number") {
      for (let index = children.length - 1; index >= 0; index--)
        pending.push(children[index]);
    } else if (typeof current.querySelectorAll === "function") {
      for (const child of current.querySelectorAll("*")) {
        if (elements.size >= limit) break;
        pending.push(child);
      }
    }
  }
  return elements.size >= limit && pending.length > 0;
}

function editorContent(node) {
  const iframe = node.contentEl?.querySelector("iframe");
  const document = iframe?.contentDocument;
  return document?.querySelector(".cm-content") || null;
}

function hasAsyncRenderableContent(text) {
  return /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|<(?:img|audio|video|source|iframe|object|embed)\b/i.test(String(text || ""));
}

function isResizableCanvasNode(node, groupIds = new Set()) {
  if (!node)
    return false;
  if (!isTextTopicCard(node, groupIds))
    return true;
  return hasAsyncRenderableContent(node.text);
}

function exactSizingMeasurements(measurements, requested) {
  const valid = new Map();
  if (!(measurements instanceof Map))
    return valid;
  for (const node of requested) {
    const target = measurements.get(node.id);
    if (!target?.unavailable && Number.isFinite(target?.width) && target.width > 0
      && Number.isFinite(target?.height) && target.height > 0)
      valid.set(node.id, { width: target.width, height: target.height });
  }
  return valid;
}

function embeddedContentFloor(text, settings) {
  const source = String(text || "");
  const minWidth = Math.max(80, Number(settings?.minNodeWidth) || 180);
  const maxWidth = Math.max(minWidth, Number(settings?.maxNodeWidth) || 1200);
  const maxHeight = Math.max(20, Number(settings?.maxNodeHeight) || 2400);
  const defaultWidth = Math.max(minWidth, Number(settings?.defaultNodeWidth) || 300);
  const defaultHeight = Math.max(20, Number(settings?.defaultNodeHeight) || 60);
  const fit = (kind, width, height) => ({
    kind,
    width: Math.min(maxWidth, Math.max(minWidth, width)),
    height: Math.min(maxHeight, Math.max(defaultHeight, height))
  });
  const wikiTarget = /!\[\[([^|\]#]+)(?:[|#][^\]]*)?\]\]/i.exec(source)?.[1] || "";
  const markdownTarget = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/i.exec(source);
  const linkedTarget = wikiTarget || markdownTarget?.[1] || markdownTarget?.[2] || "";
  const htmlPdf = /<(?:iframe|object|embed)\b[^>]*(?:src|data)=["'][^"']*\.pdf(?:[?#][^"']*)?["']/i.test(source);
  if (/\.pdf(?:$|[?#])/i.test(linkedTarget) || htmlPdf)
    return fit("document", Math.max(640, defaultWidth * 2), 480);
  if (/\.(?:mp4|m4v|mov|webm|ogv)(?:$|[?#])/i.test(linkedTarget) || /<video\b/i.test(source))
    return fit("video", Math.max(480, defaultWidth * 1.6), 300);
  if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(linkedTarget) || /<(?:img|picture)\b/i.test(source))
    return fit("image", Math.max(360, defaultWidth * 1.2), 220);
  if (/\.(?:mp3|m4a|ogg|wav|flac)(?:$|[?#])/i.test(linkedTarget) || /<audio\b/i.test(source))
    return fit("audio", Math.max(420, defaultWidth * 1.4), 96);
  if (/<(?:iframe|object|embed)\b/i.test(source))
    return fit("embed", Math.max(560, defaultWidth * 1.8), 360);
  return { kind: "text", width: minWidth, height: 0 };
}

class LiveSizingController {
  constructor(plugin, getGroupIds) {
    this.plugin = plugin;
    this.getGroupIds = getGroupIds;
    this.sessions = new WeakMap();
    this.sessionList = new Set();
    this.previewWaits = new WeakMap();
    this.nodeCanvases = new WeakMap();
  }

  createSession(canvas) {
    let session = this.sessions.get(canvas);
    if (session && !session.stopped)
      return session;
    if (session)
      this.sessionList.delete(session);
    session = {
      canvas,
      queueCleanup: null,
      watchCleanup: null,
      stopped: false,
      generation: 0,
      scheduled: new Set(),
      timerIds: new Map(),
      frames: new Map(),
      previewCancels: new Set(),
      status: SIZING_STATUS.MEASURED,
      lastError: null
    };
    this.sessions.set(canvas, session);
    this.sessionList.add(session);
    return session;
  }

  replaceSession(canvas) {
    const previous = this.sessions.get(canvas);
    if (previous) {
      previous.queueCleanup?.();
      previous.watchCleanup?.();
      for (const cancel of previous.previewCancels)
        cancel();
      previous.stopped = true;
      previous.generation++;
      this.cancelSessionFrames(previous);
      this.cancelSessionTimeouts(previous);
      previous.previewCancels.clear();
      this.sessionList.delete(previous);
    }
    return this.createSession(canvas);
  }

  cancelSessionTimeouts(session) {
    for (const timerId of session.timerIds.values()) {
      try {
        clearTimeout(timerId);
      } catch (_) {}
      this.plugin.pendingTimers?.delete(timerId);
    }
    session.timerIds.clear();
    session.scheduled.clear();
  }

  cancelSessionTimeout(session, key) {
    const timerId = session.timerIds.get(key);
    if (timerId !== undefined) {
      try {
        clearTimeout(timerId);
      } catch (_) {}
      this.plugin.pendingTimers?.delete(timerId);
    }
    session.timerIds.delete(key);
    session.scheduled.delete(key);
  }

  runSessionCallback(session, callback) {
    try {
      callback();
    } catch (error) {
      session.status = SIZING_STATUS.UNAVAILABLE;
      session.lastError = error;
      console.error("ToMindMap: live sizing callback failed", error);
    }
  }

  scheduleSessionTimeout(session, key, callback, delay) {
    if (!session || session.stopped || session.scheduled.has(key))
      return false;
    session.scheduled.add(key);
    const generation = session.generation;
    const run = () => {
      session.scheduled.delete(key);
      session.timerIds.delete(key);
      if (session.stopped
        || session.generation !== generation
        || this.sessions.get(session.canvas) !== session) {
        this.maybeReleaseSession(session);
        return;
      }
      this.runSessionCallback(session, callback);
      this.maybeReleaseSession(session);
    };
    const pendingTimers = this.plugin.pendingTimers;
    const beforeTimers = pendingTimers instanceof Set ? new Set(pendingTimers) : null;
    const timerId = typeof this.plugin.trackedTimeout === "function"
      ? this.plugin.trackedTimeout(run, delay)
      : setTimeout(run, delay);
    let trackedTimerId = timerId;
    if (trackedTimerId === undefined && beforeTimers && pendingTimers) {
      for (const id of pendingTimers) {
        if (!beforeTimers.has(id)) {
          trackedTimerId = id;
          break;
        }
      }
    }
    if (trackedTimerId !== undefined && session.scheduled.has(key))
      session.timerIds.set(key, trackedTimerId);
    return true;
  }

  scheduleSessionFrame(session, callback, key = "default") {
    if (!session || session.stopped || session.frames.has(key))
      return false;
    const frame = { id: null };
    session.frames.set(key, frame);
    const run = () => {
      if (session.frames.get(key) !== frame)
        return;
      session.frames.delete(key);
      if (session.stopped || this.sessions.get(session.canvas) !== session)
        return;
      this.runSessionCallback(session, callback);
      this.maybeReleaseSession(session);
    };
    if (typeof requestAnimationFrame === "function") {
      frame.id = requestAnimationFrame(() => {
        this.plugin.pendingRafs?.delete(frame.id);
        run();
      });
      this.plugin.pendingRafs?.add(frame.id);
    } else if (typeof this.plugin.trackedRaf === "function") {
      this.plugin.trackedRaf(run);
    } else {
      frame.id = setTimeout(run, 0);
      this.plugin.pendingTimers?.add(frame.id);
    }
    return true;
  }

  cancelSessionFrames(session) {
    for (const frame of session.frames.values()) {
      if (frame.id !== null) {
        if (typeof cancelAnimationFrame === "function") {
          try {
            cancelAnimationFrame(frame.id);
          } catch (_) {}
        }
        this.plugin.pendingRafs?.delete(frame.id);
        try {
          clearTimeout(frame.id);
        } catch (_) {}
        this.plugin.pendingTimers?.delete(frame.id);
      }
    }
    session.frames.clear();
  }

  maybeReleaseSession(session) {
    if (!session
      || session.stopped
      || session.queueCleanup
      || session.watchCleanup
      || session.scheduled.size > 0
      || session.timerIds.size > 0
      || session.frames.size > 0
      || session.previewCancels.size > 0)
      return;
    if (this.sessions.get(session.canvas) === session)
      this.sessions.delete(session.canvas);
    this.sessionList.delete(session);
  }

  rememberNodeCanvas(canvas, nodes) {
    for (const node of nodes || []) {
      if (node && canvas)
        this.nodeCanvases.set(node, canvas);
    }
  }

  forgetNodeCanvas(node, canvas = null) {
    if (node && (!canvas || this.nodeCanvases.get(node) === canvas))
      this.nodeCanvases.delete(node);
  }

  getPreviewSizer(node) {
    const iframe = node.contentEl?.querySelector("iframe");
    try {
      const inner = iframe?.contentDocument?.querySelector(".markdown-preview-sizer");
      if (inner) {
        this.applyPreviewGeometry(inner);
        return inner;
      }
    } catch (_) {
      // Canvas media can contain cross-origin frames; those are not previews.
    }
    const outer = node.contentEl?.querySelector(".markdown-preview-sizer") || null;
    this.applyPreviewGeometry(outer);
    return outer;
  }

  /** Keep live iframe previews geometrically identical to hidden clones. */
  applyPreviewGeometry(sizer) {
    if (!sizer?.style)
      return;
    sizer.style.setProperty("box-sizing", "border-box");
    sizer.style.setProperty("padding", "var(--size-4-1)");
    sizer.style.setProperty("flex", "0 0 auto");
    sizer.firstElementChild?.style?.setProperty("margin-block-start", "0");
    sizer.lastElementChild?.style?.setProperty("margin-block-end", "0");
    const preview = sizer.closest?.(".markdown-preview-view");
    preview?.style?.setProperty("overflow", "clip");
    for (const pre of Array.from(sizer.querySelectorAll?.("pre") || [])) {
      pre.style?.setProperty("white-space", "pre-wrap");
      pre.style?.setProperty("overflow-wrap", "anywhere");
      pre.style?.setProperty("overflow-x", "clip");
    }
  }

  /** Measure overflow from rendered geometry, without any preset allowance. */
  measureHorizontalOverflow(root) {
    if (!root)
      return 0;
    let overflow = 0;
    for (const element of [root, ...Array.from(root.querySelectorAll?.("*") || [])]) {
      const clientWidth = Number(element.clientWidth || 0);
      const scrollWidth = Number(element.scrollWidth || 0);
      if (clientWidth > 0)
        overflow = Math.max(overflow, scrollWidth - clientWidth);
    }
    return Math.max(0, Math.ceil(overflow));
  }

  /** Read an intrinsically auto-sized clone's complete border-box height. */
  measureIntrinsicHeight(element) {
    if (!element || typeof element.getBoundingClientRect !== "function")
      return 0;
    return Math.max(0, Math.ceil(Number(element.getBoundingClientRect().height || 0)));
  }

  /** Read an unwrapped rendered text clone's complete border-box width. */
  measureIntrinsicWidth(element) {
    if (!element || typeof element.getBoundingClientRect !== "function")
      return 0;
    return Math.max(0, Math.ceil(Number(element.getBoundingClientRect().width || 0)));
  }


  /** One rendered text line plus the preview's real vertical insets. */
  minimumTextHeight(sizer) {
    if (!sizer)
      return 1;
    const view = sizer.ownerDocument?.defaultView;
    let fontSize = 0;
    let lineHeight = 0;
    let paddingTop = 0;
    let paddingBottom = 0;
    try {
      const style = view?.getComputedStyle(sizer);
      fontSize = Number.parseFloat(style?.fontSize || "0") || 0;
      lineHeight = Number.parseFloat(style?.lineHeight || "0") || 0;
      paddingTop = Number.parseFloat(style?.paddingTop || "0") || 0;
      paddingBottom = Number.parseFloat(style?.paddingBottom || "0") || 0;
    } catch (_) {
      // Detached/test DOM nodes may not expose computed styles.
    }
    if (lineHeight <= 0)
      lineHeight = fontSize > 0 ? fontSize * 1.2 : 1;
    return Math.max(1, Math.ceil(lineHeight + paddingTop + paddingBottom));
  }

  /** Measure only the vertical content that is clipped in the live preview. */
  measureLiveVerticalOverflow(node, sizer) {
    const candidates = [];
    const preview = sizer?.closest?.(".markdown-preview-view");
    if (preview)
      candidates.push(preview);
    const iframe = node?.contentEl?.querySelector?.("iframe");
    try {
      if (iframe) {
        candidates.push(iframe);
        if (iframe.contentDocument?.documentElement)
          candidates.push(iframe.contentDocument.documentElement);
        if (iframe.contentDocument?.body)
          candidates.push(iframe.contentDocument.body);
      }
    } catch (_) {
      // Cross-origin media frames are not Markdown previews.
    }
    let overflow = 0;
    for (const element of candidates) {
      const clientHeight = Number(element.clientHeight || 0);
      const scrollHeight = Number(element.scrollHeight || 0);
      if (clientHeight > 0)
        overflow = Math.max(overflow, scrollHeight - clientHeight);
    }
    return Math.max(0, Math.ceil(overflow));
  }

  /**
   * Measure the rendered block extent without treating the preview viewport's
   * min-height as content. Child offsets include inter-block margins, which a
   * sum of offsetHeight values misses.
   */
  measureContentHeight(sizer) {
    if (!sizer)
      return 0;
    let contentHeight = 0;
    const sizerRect = typeof sizer.getBoundingClientRect === "function"
      ? sizer.getBoundingClientRect()
      : null;
    const view = sizer.ownerDocument?.defaultView || null;
    let paddingTop = 0;
    let paddingBottom = 0;
    try {
      const style = view?.getComputedStyle(sizer);
      paddingTop = Number.parseFloat(style?.paddingTop || "0") || 0;
      paddingBottom = Number.parseFloat(style?.paddingBottom || "0") || 0;
    } catch (_) {
      // Detached/test DOM nodes may not expose computed styles.
    }
    for (const child of Array.from(sizer.children || [])) {
      if (sizerRect && typeof child.getBoundingClientRect === "function") {
        const childRect = child.getBoundingClientRect();
        contentHeight = Math.max(contentHeight, childRect.bottom - sizerRect.top);
      }
      const offsetTop = Number(child.offsetTop || 0);
      const offsetHeight = Number(child.offsetHeight || 0);
      contentHeight = Math.max(contentHeight, offsetTop + offsetHeight);
    }
    const symmetricInset = Math.max(paddingTop, paddingBottom);
    const contentStart = Math.min(paddingTop, contentHeight);
    return Math.max(0, Math.ceil(Math.max(0, contentHeight - contentStart) + symmetricInset * 2));
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

  waitForPreview(node, callback, canvas = this.nodeCanvases.get(node) || this.plugin?.interceptedCanvas || null) {
    if (!node || typeof callback !== "function")
      return () => {};
    const session = canvas ? this.createSession(canvas) : null;
    this.rememberNodeCanvas(canvas, [node]);
    const existing = this.previewWaits.get(node);
    if (existing) {
      existing.callbacks.add(callback);
      return existing.cancel;
    }
    const contentEl = node.contentEl;
    const wait = {
      node,
      canvas,
      contentEl,
      callbacks: new Set([callback]),
      observer: null,
      stopped: false,
      cancel: null,
      timeoutKey: `preview-timeout:${node.id}`
    };
    const finish = (ready) => {
      if (wait.stopped)
        return;
      wait.stopped = true;
      if (session)
        this.cancelSessionTimeout(session, wait.timeoutKey);
      if (wait.observer) {
        wait.observer.disconnect();
        this.plugin.pendingObservers?.delete(wait.observer);
      }
      if (this.previewWaits.get(node) === wait)
        this.previewWaits.delete(node);
      if (session) {
        session.previewCancels.delete(wait.cancel);
        if (session.stopped)
          this.forgetNodeCanvas(node, canvas);
      }
      if (!ready) {
        this.forgetNodeCanvas(node, canvas);
        this.maybeReleaseSession(session);
        return;
      }
      try {
        for (const pending of wait.callbacks)
          pending();
      } finally {
        this.maybeReleaseSession(session);
      }
    };
    wait.cancel = () => finish(false);
    this.previewWaits.set(node, wait);
    if (session)
      session.previewCancels.add(wait.cancel);
    const check = () => {
      if (wait.stopped)
        return;
      if (session?.stopped) {
        finish(false);
        return;
      }
      if (canvas && canvas.nodes?.get?.(node.id) !== node) {
        finish(false);
        return;
      }
      if (node.contentEl !== contentEl) {
        finish(false);
        return;
      }
      if (node.isEditing)
        return;
      if (this.getPreviewSizer(node))
        finish(true);
    };
    const scheduleWaitTimeout = (key, delay, callback) => {
      if (session) {
        this.scheduleSessionTimeout(session, key, callback, delay);
      } else if (typeof this.plugin.trackedTimeout === "function") {
        this.plugin.trackedTimeout(callback, delay);
      } else {
        setTimeout(callback, delay);
      }
    };
    if (!contentEl || typeof MutationObserver === "undefined") {
      scheduleWaitTimeout(wait.timeoutKey, 100, () => {
        if (session?.stopped
          || node.contentEl !== contentEl
          || (canvas && canvas.nodes?.get?.(node.id) !== node))
          finish(false);
        else
          finish(!node.isEditing);
      });
      return wait.cancel;
    }
    wait.observer = new MutationObserver(() => {
      if (session)
        this.scheduleSessionFrame(session, check, `preview:${node.id}`);
      else if (typeof this.plugin.trackedRaf === "function")
        this.plugin.trackedRaf(check);
      else
        check();
    });
    this.plugin.pendingObservers?.add(wait.observer);
    wait.observer.observe(contentEl, { childList: true, subtree: true });
    scheduleWaitTimeout(wait.timeoutKey, 1200, () => {
      if (session?.stopped
        || node.contentEl !== contentEl
        || (canvas && canvas.nodes?.get?.(node.id) !== node))
        finish(false);
      else
        finish(!node.isEditing);
    });
    return wait.cancel;
  }

  measurePlainTextWidth(text, node = null) {
    const settings = this.plugin.settings;
    const minWidth = Math.max(80, Math.min(settings.minNodeWidth, settings.maxNodeWidth));
    const preferredMax = Math.min(settings.maxNodeWidth, Math.max(settings.defaultNodeWidth, 360));
    const rawLines = String(text || "").split("\n");
    const lines = [];
    let wordBudget = MAX_MEASUREMENT_WORDS;
    let truncated = rawLines.length > MAX_MEASUREMENT_LINES;
    for (const rawLine of rawLines.slice(0, MAX_MEASUREMENT_LINES)) {
      const line = rawLine
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/^[\s>*#\-\d.)]+/, "")
        .replace(/[*_`~[\]|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const words = [];
      for (const match of line.matchAll(/\S+/g)) {
        if (wordBudget-- <= 0) {
          truncated = true;
          break;
        }
        words.push(match[0]);
      }
      lines.push({ line, words });
      if (truncated) break;
    }
    if (truncated) return preferredMax;

    let measure = (value) => value.length * 9.5;
    let horizontalChrome = 52;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext?.("2d");
      if (context) {
        const sizer = node ? this.getPreviewSizer(node) : null;
        const view = sizer?.ownerDocument?.defaultView || document.defaultView;
        const style = sizer && view?.getComputedStyle ? view.getComputedStyle(sizer) : null;
        context.font = style?.font || `${style?.fontWeight || 400} ${style?.fontSize || "16px"} ${style?.fontFamily || "sans-serif"}`;
        measure = (value) => context.measureText(value).width;
        const paddingLeft = Number.parseFloat(style?.paddingLeft || "0") || 0;
        const paddingRight = Number.parseFloat(style?.paddingRight || "0") || 0;
        const chrome = node ? this.getPreviewChromeWidth(node) || 0 : 0;
        horizontalChrome = Math.max(24, paddingLeft + paddingRight) + chrome;
      }
    } catch (_) {}

    const spaceWidth = measure(" ");
    let naturalWidth = minWidth;
    for (const { line } of lines)
      naturalWidth = Math.max(naturalWidth, Math.ceil(measure(line) + horizontalChrome));
    if (naturalWidth <= Math.min(preferredMax, 240)) return naturalWidth;

    const candidates = new Set([minWidth]);
    for (const { words } of lines) {
      for (let start = 0; start < words.length && candidates.size < MAX_LAYOUT_CANDIDATES; start++) {
        let width = 0;
        const endLimit = Math.min(words.length, start + 64);
        for (let end = start; end < endLimit; end++) {
          width += (end > start ? spaceWidth : 0) + measure(words[end]);
          candidates.add(Math.min(preferredMax, Math.ceil(width + horizontalChrome)));
          if (candidates.size >= MAX_LAYOUT_CANDIDATES) break;
        }
      }
    }
    const lineCountAt = (width) => {
      const available = Math.max(1, width - horizontalChrome);
      let count = 0;
      for (const { words } of lines) {
        if (words.length === 0) {
          count++;
          continue;
        }
        let used = 0;
        for (const word of words) {
          const wordWidth = measure(word);
          if (used > 0 && used + spaceWidth + wordWidth > available) {
            count++;
            used = wordWidth;
          } else {
            used += (used > 0 ? spaceWidth : 0) + wordWidth;
          }
        }
        count++;
      }
      return Math.max(1, count);
    };
    const minimumLines = Math.max(1, lines.length);
    const maximumLines = Math.max(2, minimumLines);
    const choices = Array.from(candidates, (width) => {
      const lineCount = lineCountAt(width);
      const height = 16 + lineCount * 22;
      return { width, lineCount, area: width * height };
    }).filter((choice) => choice.lineCount >= minimumLines + 1 && choice.lineCount <= maximumLines);
    if (choices.length === 0) return Math.min(preferredMax, naturalWidth);
    let minimumArea = Number.POSITIVE_INFINITY;
    for (const choice of choices) minimumArea = Math.min(minimumArea, choice.area);
    let bestWidth = 0;
    for (const choice of choices) {
      if (choice.area <= minimumArea * 1.12)
        bestWidth = Math.max(bestWidth, choice.width);
    }
    return bestWidth;
  }

  estimate(text, node = null) {
    const settings = this.plugin.settings;
    const floor = embeddedContentFloor(text, settings);
    const minWidth = Math.max(80, Math.min(settings.minNodeWidth, settings.maxNodeWidth));
    const maxWidth = Math.max(minWidth, settings.maxNodeWidth);
    const softMaxWidth = Math.min(maxWidth, Math.max(720, settings.defaultNodeWidth * 2.4));
    const minHeight = settings.defaultNodeHeight;
    const rawText = String(text || "");
    const rawLines = rawText.split("\n");
    let measuredWords = 0;
    for (const line of rawLines.slice(0, MAX_MEASUREMENT_LINES + 1)) {
      for (const _match of line.matchAll(/\S+/g)) {
        measuredWords += 1;
        if (
          measuredWords > MAX_MEASUREMENT_WORDS
          || rawLines.length > MAX_MEASUREMENT_LINES
        ) {
          return { width: maxWidth, height: settings.maxNodeHeight };
        }
      }
    }
    const lines = rawLines.map((line) => line
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^[\s>*#\-\d.)]+/, "")
      .replace(/[*_`~[\]|]/g, " ")
      .replace(/\s+/g, " ")
      .trim());
    const charWidth = 9.5;
    const horizontalChrome = 52;
    const lineHeight = 22;
    let longestWord = 0;
    for (const line of lines) {
      for (const word of line.split(/\s+/).filter(Boolean))
        longestWord = Math.max(longestWord, word.length * charWidth);
    }
    const preferredWidth = Math.min(softMaxWidth, Math.max(settings.defaultNodeWidth, 360));
    const renderedLineWidth = this.measurePlainTextWidth(text, node);
    const firstWidth = Math.min(
      softMaxWidth,
      Math.max(
        minWidth,
        longestWord + horizontalChrome,
        Math.min(renderedLineWidth, preferredWidth)
      )
    );
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
      const score = width * height * (1 + Math.max(0, aspect - 5.5) * 0.08);
      if (!best || score < best.score || score === best.score && height < best.height)
        best = { width, height, score };
    }
    const result = best || { width: minWidth, height: minHeight };
    return {
      ...result,
      width: Math.max(result.width, floor.width),
      height: Math.max(result.height, floor.height),
      floorHeight: floor.height,
      contentKind: floor.kind
    };
  }

  measure(node, canvas = this.nodeCanvases.get(node) || this.plugin?.interceptedCanvas || null) {
    const groupIds = typeof this.getGroupIds === "function"
      ? this.getGroupIds(canvas)
      : new Set();
    if (!isTextTopicCard(node, groupIds))
      return { width: node.width, height: node.height };
    const settings = this.plugin.settings;
    const minWidth = Math.max(80, Math.min(settings.minNodeWidth, settings.maxNodeWidth));
    const maxWidth = Math.max(minWidth, settings.maxNodeWidth);
    const maxHeight = settings.maxNodeHeight;
    const rawText = node.isEditing ? editorContent(node)?.innerText || node.text : node.text;
    const estimate = this.estimate(rawText, node);
    const sizer = this.getPreviewSizer(node);
    if (!sizer || node.isEditing) {
      let intrinsicWidth = 0;
      let overflowHeight = 0;
      const elements = new Set();
      const truncated = collectBoundedElements(node.contentEl, elements);
      if (truncated)
        return { width: node.width, height: node.height, unavailable: true };
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
    let truncated = false;
    const addTree = (root) => {
      if (!root) return;
      truncated = collectBoundedElements(root, measurementElements) || truncated;
    };
    addTree(sizer);
    try {
      addTree(iframe?.contentDocument?.documentElement);
      addTree(iframe?.contentDocument?.body);
    } catch (_) {
      // Ignore cross-origin embedded media frames.
    }
    if (truncated)
      return { width: node.width, height: node.height, unavailable: true };
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
    const renderedHeight = contentHeight > 0 && chromeHeight !== null
      ? Math.min(maxHeight, Math.max(this.minimumTextHeight(sizer), Math.ceil(contentHeight)) + chromeHeight)
      : Math.min(maxHeight, estimate.height);
    const overflowHeight = this.measureLiveVerticalOverflow(node, sizer);
    const height = Math.min(
      maxHeight,
      Math.max(
        estimate.floorHeight || 0,
        renderedHeight,
        Number(node.height || 0) + overflowHeight
      )
    );
    return { width, height };
  }

  apply(canvas, nodes, relayout = false, layoutOptions = {}) {
    const changed = [];
    for (const node of nodes) {
      if (!node || node.isEditing)
        continue;
      const target = this.measure(node, canvas);
      if (target?.unavailable) continue;
      if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
        continue;
      node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
      changed.push(node);
    }
    if (changed.length > 0) {
      canvas.requestSave();
      if (relayout)
        this.plugin.relayoutAffectedBranches(canvas, changed, layoutOptions);
    }
    return changed;
  }

  resizeNodes(canvas, nodes, layoutOptions = {}) {
    this.rememberNodeCanvas(canvas, nodes);
    const session = this.createSession(canvas);
    const changed = this.apply(canvas, nodes, false, layoutOptions);
    if (changed.length === 0) {
      this.maybeReleaseSession(session);
      return;
    }
    for (const delay of [120, 280, 600])
      this.scheduleSessionTimeout(
        session,
        `retry:${delay}`,
        () => this.resizeNodesRetry(canvas, nodes, layoutOptions),
        delay
      );
  }

  resizeNodesRetry(canvas, nodes, layoutOptions = {}) {
    const session = this.sessions.get(canvas);
    if (session?.stopped)
      return;
    if (!this.plugin.isAutoAdjustCanvas(canvas) || !this.plugin.isMindmapCanvas(canvas))
      return;
    this.apply(canvas, nodes, true, layoutOptions);
  }

  /**
   * Run one exact sizing batch in the Canvas' own session.
   * @returns {Promise<{status: string, canvas: object, requestedIds: string[], measurements: Map}>}
   */
  resizeNodesWhenRendered(canvas, nodes, onSettled = null, layoutOptions = {}) {
    this.cancelQueue(canvas);
    this.stopWatchingCanvas(canvas);
    const session = this.replaceSession(canvas);
    const groupIds = this.getGroupIds(canvas) || new Set();
    this.rememberNodeCanvas(canvas, nodes);
    const requested = nodes.filter((node) => isTextTopicCard(node, groupIds));
    const requestedNodeById = new Map(requested.map((node) => [node.id, node]));
    const result = (status, measurements = new Map()) => ({
      status,
      canvas,
      requestedIds: requested.map((node) => node.id),
      measurements
    });
    if (requested.length === 0) {
      const data = canvas.getData();
      data.mindmapLayoutVersion = CARD_LAYOUT_VERSION;
      canvas.setData(data);
      canvas.requestSave();
      this.plugin.layoutEngine.layout(canvas, layoutOptions);
      this.plugin.updateGroupBounds(canvas);
      const measured = result(SIZING_STATUS.MEASURED);
      onSettled?.(measured);
      this.maybeReleaseSession(session);
      return Promise.resolve(measured);
    }

    let stopped = false;
    let resolveSizing = null;
    const sizing = new Promise((resolve) => {
      resolveSizing = resolve;
    });
    const finish = (status, measurements = new Map()) => {
      if (stopped)
        return;
      stopped = true;
      if (session.queueCleanup === cancel)
        session.queueCleanup = null;
      const typed = result(status, measurements);
      resolveSizing(typed);
      this.maybeReleaseSession(session);
    };
    const cancel = () => finish(SIZING_STATUS.CANCELLED);
    session.queueCleanup = cancel;
    const isCurrent = () => !stopped
      && !session.stopped
      && this.sessions.get(canvas) === session
      && !this.plugin.unloaded
      && this.plugin.isMindmapCanvas(canvas);

    const recordCompletedSizing = (measuredIds) => {
      const data = canvas.getData();
      const stored = new Set(Array.isArray(data.mindmapPendingResize) ? data.mindmapPendingResize : []);
      for (const node of requested)
        stored.add(node.id);
      for (const id of measuredIds)
        stored.delete(id);
      if (stored.size > 0) {
        data.mindmapPendingResize = Array.from(stored);
      } else {
        delete data.mindmapPendingResize;
        data.mindmapLayoutVersion = CARD_LAYOUT_VERSION;
      }
      canvas.setData(data);
      canvas.requestSave();
    };

    // Preserve the currently drawn graph until the exact pass is ready. This
    // avoids showing a heuristic layout first and then replacing it.
    // No live card is resized individually while this batch is pending.
    let measurement = null;
    try {
      measurement = this.plugin.measureMarkdownNodesOffscreen(
        canvas,
        requested,
        isCurrent
      );
    } catch (error) {
      console.error("ToMindMap: initial card measurement failed", error);
      finish(isCurrent() ? SIZING_STATUS.UNAVAILABLE : SIZING_STATUS.CANCELLED);
      return sizing;
    }
    void Promise.resolve(measurement).then((rawMeasurements) => {
      if (stopped)
        return;
      if (!isCurrent()) {
        finish(SIZING_STATUS.CANCELLED);
        return;
      }
      const measurements = exactSizingMeasurements(rawMeasurements, requested);
      if (measurements.size === 0) {
        finish(SIZING_STATUS.UNAVAILABLE);
        return;
      }
      const changed = [];
      const appliedIds = [];
      for (const [id, target] of measurements) {
        const expectedNode = requestedNodeById.get(id);
        const node = canvas.nodes.get(id);
        if (!expectedNode || node !== expectedNode || node.isEditing)
          continue;
        appliedIds.push(id);
        if (Math.abs(target.width - node.width) <= 1 && Math.abs(target.height - node.height) <= 1)
          continue;
        node.moveAndResize({ x: node.x, y: node.y, width: target.width, height: target.height });
        changed.push(node);
      }
      recordCompletedSizing(appliedIds);
      if (appliedIds.length === 0) {
        finish(SIZING_STATUS.UNAVAILABLE, measurements);
        return;
      }
      if (changed.length > 0)
        canvas.requestSave();
      this.plugin.layoutEngine.layout(canvas, layoutOptions);
      this.plugin.updateGroupBounds(canvas);
      for (const delay of [120, 280, 600])
        this.scheduleSessionTimeout(
          session,
          `retry:${delay}`,
          () => this.resizeNodesRetry(canvas, requested, layoutOptions),
          delay
        );
      const measured = result(SIZING_STATUS.MEASURED, measurements);
      if (onSettled)
        this.scheduleSessionTimeout(session, "settled", () => onSettled(measured), 650);
      // Plain Markdown is now final and remains entirely cache-driven. Observe
      // only embeds whose intrinsic size can genuinely change after rendering.
      const asynchronousNodes = requested.filter((node) => hasAsyncRenderableContent(node.text));
      if (asynchronousNodes.length > 0)
        this.watchCanvas(canvas, asynchronousNodes);
      finish(SIZING_STATUS.MEASURED, measurements);
    }).catch((error) => {
      console.error("ToMindMap: initial card measurement failed", error);
      finish(isCurrent() ? SIZING_STATUS.UNAVAILABLE : SIZING_STATUS.CANCELLED);
    });
    return sizing;
  }

  /**
   * Track only cards with asynchronous embeds after their atomic text sizing
   * pass. Plain Markdown uses its persisted dimensions and is never resized
   * merely because Canvas virtualized or materialized it.
   */
  watchCanvas(canvas, nodes) {
    this.stopWatchingCanvas(canvas);
    const session = this.createSession(canvas);
    this.rememberNodeCanvas(canvas, nodes);
    const wrapper = canvas?.wrapperEl;
    if (!wrapper || typeof MutationObserver === "undefined") {
      this.maybeReleaseSession(session);
      return;
    }
    const targetIds = new Set(
      (nodes || [])
        .filter((node) => node && typeof node.text === "string")
        .map((node) => node.id)
    );
    if (targetIds.size === 0) {
      this.maybeReleaseSession(session);
      return;
    }

    let stopped = false;
    let scanQueued = false;
    let discoverAll = true;
    let layoutTimer = null;
    const dirtyIds = new Set();
    const layoutIds = new Set();
    const liveSizers = new Map();
    const liveNodes = new Map();
    const nodeIframes = new Map();
    const iframeRecords = new Map();
    let outerMutationObserver = null;
    let outerResizeObserver = null;

    const isCurrent = () => !stopped
      && !session.stopped
      && this.sessions.get(canvas) === session
      && !this.plugin.unloaded
      && this.plugin.isMindmapCanvas(canvas);

    const forgetObserver = (observer) => {
      observer?.disconnect();
      if (observer)
        this.plugin.pendingObservers?.delete(observer);
    };

    const cleanupIframeRecord = (iframe, record) => {
      record.mutationObserver?.disconnect();
      if (record.mutationObserver)
        this.plugin.pendingObservers?.delete(record.mutationObserver);
      record.document?.removeEventListener?.("load", record.assetHandler, true);
      iframe?.removeEventListener?.("load", record.frameHandler);
      iframeRecords.delete(iframe);
    };

    const cleanupNodeRecords = (nodeId) => {
      const node = liveNodes.get(nodeId);
      const sizer = liveSizers.get(nodeId);
      if (sizer && outerResizeObserver) {
        try {
          outerResizeObserver.unobserve(sizer);
        } catch (_) {}
      }
      liveSizers.delete(nodeId);
      liveNodes.delete(nodeId);
      if (node)
        this.forgetNodeCanvas(node, canvas);
      const iframe = nodeIframes.get(nodeId);
      if (iframe) {
        const record = iframeRecords.get(iframe);
        if (record)
          cleanupIframeRecord(iframe, record);
      }
      nodeIframes.delete(nodeId);
    };

    const scheduleLayout = () => {
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers?.delete(layoutTimer);
      }
      layoutTimer = setTimeout(() => {
        this.plugin.pendingTimers?.delete(layoutTimer);
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
      this.plugin.pendingTimers?.add(layoutTimer);
    };

    const scan = () => {
      scanQueued = false;
      if (!isCurrent())
        return;
      const groupIds = this.getGroupIds(canvas) || new Set();
      if (discoverAll) {
        discoverAll = false;
        for (const id of targetIds)
          dirtyIds.add(id);
        const observedIds = new Set([
          ...liveNodes.keys(),
          ...liveSizers.keys(),
          ...nodeIframes.keys()
        ]);
        for (const id of observedIds) {
          if (!targetIds.has(id) || !canvas.nodes.has(id))
            cleanupNodeRecords(id);
        }
      }

      const changed = [];
      const ids = Array.from(dirtyIds);
      dirtyIds.clear();
      for (const id of ids) {
        const node = canvas.nodes.get(id);
        if (!node || node.isEditing || groupIds.has(id) || typeof node.text !== "string") {
          cleanupNodeRecords(id);
          continue;
        }
        if (liveNodes.get(id) !== node) {
          cleanupNodeRecords(id);
          liveNodes.set(id, node);
        }
        const sizer = this.getPreviewSizer(node);
        if (!sizer) {
          const previousSizer = liveSizers.get(id);
          if (previousSizer && outerResizeObserver) {
            try {
              outerResizeObserver.unobserve(previousSizer);
            } catch (_) {}
          }
          liveSizers.delete(id);
          observeNodeDocument(node);
          continue;
        }
        observeNode(node, sizer);
        const target = this.measure(node, canvas);
        if (target?.unavailable) {
          dirtyIds.add(id);
          continue;
        }
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
      this.scheduleSessionFrame(session, scan, "canvas-scan");
    };

    const createIframeRecord = (node, iframe, document) => {
      const record = {
        document,
        nodeId: node.id,
        mutationObserver: null,
        assetHandler: () => queueScan(record.nodeId),
        frameHandler: () => queueScan(record.nodeId, true)
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
        this.plugin.pendingObservers?.add(record.mutationObserver);
      }
        // Deliberately do not observe preview size itself. A manual Canvas
        // resize changes that box too, and observing it would immediately
        // auto-size the media card back over the user's chosen dimensions.
        // Asset load and DOM mutation listeners still handle async embeds.
      const fontsReady = document?.fonts?.ready;
      if (fontsReady && typeof fontsReady.then === "function")
        void fontsReady.then(() => queueScan(record.nodeId));
      iframeRecords.set(iframe, record);
      return record;
    };

    const observeNodeDocument = (node) => {
      const iframe = node.contentEl?.querySelector("iframe");
      const previousIframe = nodeIframes.get(node.id);
      if (previousIframe && previousIframe !== iframe) {
        const previousRecord = iframeRecords.get(previousIframe);
        if (previousRecord)
          cleanupIframeRecord(previousIframe, previousRecord);
        nodeIframes.delete(node.id);
      }
      if (iframe) {
        let record = iframeRecords.get(iframe);
        if (record && iframe.contentDocument && record.document !== iframe.contentDocument) {
          cleanupIframeRecord(iframe, record);
          record = null;
        }
        record = record || createIframeRecord(node, iframe, iframe.contentDocument);
        record.nodeId = node.id;
        nodeIframes.set(node.id, iframe);
        return { iframe, record };
      }
      return null;
    };

    const observeNode = (node, sizer) => {
      const previousSizer = liveSizers.get(node.id);
      if (previousSizer !== sizer) {
        if (previousSizer && outerResizeObserver) {
          try {
            outerResizeObserver.unobserve(previousSizer);
          } catch (_) {}
        }
        liveSizers.set(node.id, sizer);
      }
      if (observeNodeDocument(node))
        return;
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
    this.plugin.pendingObservers?.add(outerMutationObserver);
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
      this.plugin.pendingObservers?.add(outerResizeObserver);
    }

    const cleanup = () => {
      if (stopped)
        return;
      stopped = true;
      this.cancelSessionFrames(session);
      forgetObserver(outerMutationObserver);
      forgetObserver(outerResizeObserver);
      for (const [iframe, record] of Array.from(iframeRecords))
        cleanupIframeRecord(iframe, record);
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
        this.plugin.pendingTimers?.delete(layoutTimer);
      }
      dirtyIds.clear();
      layoutIds.clear();
      for (const node of liveNodes.values())
        this.forgetNodeCanvas(node, canvas);
      liveSizers.clear();
      liveNodes.clear();
      nodeIframes.clear();
      if (session.watchCleanup === cleanup)
        session.watchCleanup = null;
      this.maybeReleaseSession(session);
    };
    session.watchCleanup = cleanup;
    queueScan(null, true);
  }

  stopWatchingCanvas(canvas) {
    const target = canvas === undefined
      ? (this.plugin?.unloaded ? null : this.plugin?.interceptedCanvas || null)
      : canvas;
    const sessions = target
      ? [this.sessions.get(target)].filter(Boolean)
      : Array.from(this.sessionList);
    for (const session of sessions)
      session.watchCleanup?.();
  }

  cancelQueue(canvas) {
    const target = canvas === undefined
      ? (this.plugin?.unloaded ? null : this.plugin?.interceptedCanvas || null)
      : canvas;
    const sessions = target
      ? [this.sessions.get(target)].filter(Boolean)
      : Array.from(this.sessionList);
    for (const session of sessions) {
      session.generation++;
      this.cancelSessionFrames(session);
      this.cancelSessionTimeouts(session);
      for (const cancel of session.previewCancels)
        cancel();
      session.queueCleanup?.();
      this.maybeReleaseSession(session);
    }
  }
}

module.exports = {
  CARD_LAYOUT_VERSION,
  SIZING_STATUS,
  LiveSizingController,
  embeddedContentFloor,
  hasAsyncRenderableContent,
  isResizableCanvasNode,
  isTextTopicCard
};
