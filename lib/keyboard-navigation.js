"use strict";

const { buildForest, findTreeForNode, getDescendants, getGroupIds } = require("./tree-model.js");

var import_obsidian2 = require("obsidian");
var KeyboardHandler = class {
  constructor(plugin, canvasApi, nodeOps, layoutEngine, branchColors, autoColorEnabled, isMindmapEnabled = () => true, onNodesChanged = () => {
  }) {
    this.plugin = plugin;
    this.canvasApi = canvasApi;
    this.nodeOps = nodeOps;
    this.layoutEngine = layoutEngine;
    this.branchColors = branchColors;
    this.autoColorEnabled = autoColorEnabled;
    this.isMindmapEnabled = isMindmapEnabled;
    this.onNodesChanged = onNodesChanged;
    /** Called before actions that leave the current node, to finalize auto-resize. */
    this.onBeforeLeaveNode = null;
    /** Padding (px) added around target node when zooming after navigation. */
    this.zoomPadding = 0;
    /** Opens the existing map outline search for Cmd/Ctrl+F. */
    this.onFindRequested = null;
  }
  register() {
    this.plugin.addCommand({
      id: "mindmap-edit-node",
      name: "Edit selected node",
      checkCallback: (checking) => {
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        const activeEl = document.activeElement;
        if (activeEl && !canvas.wrapperEl.contains(activeEl))
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        if (node.isEditing)
          return false;
        if (checking)
          return true;
        this.startEditing(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-save-node",
      name: "Save and exit edit mode",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        if (!node.isEditing)
          return false;
        if (checking)
          return true;
        this.finishEditing(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-add-child",
      name: "Add child node",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        if (checking)
          return true;
        this.addChild(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-add-sibling",
      name: "Add sibling node",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        if (checking)
          return true;
        this.addSibling(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-add-sibling-before",
      name: "Add sibling topic before",
      checkCallback: (checking) => {
        const canvas = this.canvasApi.getActiveCanvas();
        const node = canvas ? this.canvasApi.getSelectedNode(canvas) : null;
        if (!canvas || !node)
          return false;
        if (checking)
          return true;
        this.addSibling(canvas, node, true);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-add-parent",
      name: "Add parent topic",
      checkCallback: (checking) => {
        const canvas = this.canvasApi.getActiveCanvas();
        const node = canvas ? this.canvasApi.getSelectedNode(canvas) : null;
        if (!canvas || !node)
          return false;
        if (checking)
          return true;
        this.addParent(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-delete-branch",
      name: "Delete topic and branch",
      checkCallback: (checking) => {
        const canvas = this.canvasApi.getActiveCanvas();
        const node = canvas ? this.canvasApi.getSelectedNode(canvas) : null;
        if (!canvas || !node)
          return false;
        if (checking)
          return true;
        this.deleteBranch(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-delete-node",
      name: "Delete single topic and keep its children",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        if (checking)
          return true;
        this.deleteSingleTopic(canvas, node);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-flip-branch",
      name: "Flip branch to other side",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        if (!this.isMindmapEnabled(canvas))
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        const parent = this.canvasApi.getParentNode(canvas, node);
        if (!parent)
          return false;
        if (checking)
          return true;
        const wasEditing = node.isEditing;
        if (!wasEditing)
          (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
        const parentNode = this.nodeOps.flipBranch(canvas, node);
        if (parentNode) {
          this.layoutEngine.layoutChildren(canvas, parentNode.id);
          if (this.autoColorEnabled()) {
            this.branchColors.applyColors(canvas);
          }
          this.onNodesChanged(canvas);
          if (wasEditing)
            node.startEditing();
        }
      }
    });
    this.plugin.addCommand({
      id: "mindmap-toggle-balance",
      name: "Toggle balanced layout",
      checkCallback: (checking) => {
        var _a;
        const canvas = this.canvasApi.getActiveCanvas();
        if (!canvas)
          return false;
        if (!this.isMindmapEnabled(canvas))
          return false;
        const node = this.canvasApi.getSelectedNode(canvas);
        if (!node)
          return false;
        const children = this.canvasApi.getChildNodes(canvas, node);
        if (children.length < 2)
          return false;
        if (checking)
          return true;
        (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
        const nodeCx = node.x + node.width / 2;
        let allRight = true;
        let allLeft = true;
        for (const child of children) {
          const childCx = child.x + child.width / 2;
          if (childCx >= nodeCx)
            allLeft = false;
          else
            allRight = false;
        }
        const allOneSide = allRight || allLeft;
        if (allOneSide) {
          const sorted = [...children].sort((a, b) => a.y - b.y);
          for (let i = 0; i < sorted.length; i++) {
            const child = sorted[i];
            if (i % 2 === 1) {
              const mirrorX = nodeCx - (child.x + child.width / 2 - nodeCx) - child.width / 2;
              child.moveTo({ x: mirrorX, y: child.y });
            }
          }
        } else {
          for (const child of children) {
            const childCx = child.x + child.width / 2;
            if (childCx < nodeCx) {
              const mirrorX = nodeCx + (nodeCx - childCx) - child.width / 2;
              child.moveTo({ x: mirrorX, y: child.y });
            }
          }
        }
        this.layoutEngine.layoutChildren(canvas, node.id);
        if (this.autoColorEnabled()) {
          this.branchColors.applyColors(canvas);
        }
        this.onNodesChanged(canvas);
      }
    });
    this.plugin.addCommand({
      id: "mindmap-nav-right",
      name: "Navigate right",
      checkCallback: (checking) => {
        return this.directionCommand(checking, "right");
      }
    });
    this.plugin.addCommand({
      id: "mindmap-nav-left",
      name: "Navigate left",
      checkCallback: (checking) => {
        return this.directionCommand(checking, "left");
      }
    });
    this.plugin.addCommand({
      id: "mindmap-nav-next-sibling",
      name: "Navigate down",
      checkCallback: (checking) => {
        return this.directionCommand(checking, "down");
      }
    });
    this.plugin.addCommand({
      id: "mindmap-nav-prev-sibling",
      name: "Navigate up",
      checkCallback: (checking) => {
        return this.directionCommand(checking, "up");
      }
    });
    this.registerPhysicalKeyShortcuts();
  }
  /**
   * Access the CodeMirror 6 EditorView inside a canvas node's iframe.
   */
  getEditorView(node) {
    var _a, _b, _c, _d, _e, _f;
    const iframe = (_a = node.contentEl) == null ? void 0 : _a.querySelector("iframe");
    const doc = (_c = iframe == null ? void 0 : iframe.contentDocument) != null ? _c : (_b = node.contentEl) == null ? void 0 : _b.ownerDocument;
    if (!doc)
      return null;
    const container = (_d = iframe == null ? void 0 : iframe.contentDocument) != null ? _d : node.contentEl;
    const cmContent = container == null ? void 0 : container.querySelector(".cm-content");
    return (_f = (_e = cmContent == null ? void 0 : cmContent.cmView) == null ? void 0 : _e.view) != null ? _f : null;
  }
  /**
   * Extract the selected text from a node's editor and delete it.
   * Returns the selected text, or null if nothing is selected.
   */
  extractAndDeleteSelection(node) {
    const view = this.getEditorView(node);
    if (!view)
      return null;
    const { from, to } = view.state.selection.main;
    if (from === to)
      return null;
    const text = view.state.sliceDoc(from, to);
    view.dispatch({ changes: { from, to, insert: "" } });
    return text;
  }
  /**
   * Install one coherent, canvas-scoped keyboard controller. Canvas text
   * editors live in iframes, so their documents are observed and wired too.
   */
  attachToCanvas(canvas) {
    const documents = /* @__PURE__ */ new Set();
    const iframes = /* @__PURE__ */ new Map();
    const priorityBindings = /* @__PURE__ */ new Map();
    const handler = (event) => this.handleKeydown(canvas, event);
    const promoteBindings = (scope, bindings) => {
      if (!Array.isArray(scope == null ? void 0 : scope.keys))
        return;
      for (const binding of bindings) {
        const index = scope.keys.indexOf(binding);
        if (index >= 0)
          scope.keys.splice(index, 1);
      }
      scope.keys.unshift(...bindings);
    };
    const bindingMatches = (binding, context) => {
      if (!context)
        return false;
      const modifiersMatch = binding.modifiers === null || binding.modifiers === context.modifiers;
      if (!modifiersMatch)
        return false;
      if (!binding.key)
        return true;
      if (binding.key === context.vkey)
        return true;
      return !!context.key && binding.key.toLowerCase() === context.key.toLowerCase();
    };
    const installPriorityBindings = (scope) => {
      if (!scope || typeof scope.register !== "function")
        return;
      const existing = priorityBindings.get(scope);
      if (existing) {
        promoteBindings(scope, existing);
        return;
      }
      const bindings = [];
      const delegateToNative = (currentBinding, event, context) => {
        if (!Array.isArray(scope.keys))
          return;
        const currentIndex = scope.keys.indexOf(currentBinding);
        for (let index = Math.max(0, currentIndex + 1); index < scope.keys.length; index++) {
          const candidate = scope.keys[index];
          if (bindings.includes(candidate) || !bindingMatches(candidate, context))
            continue;
          return candidate.func(event, context);
        }
      };
      const registerFirst = (modifiers, key, callback) => {
        let binding = null;
        binding = scope.register(modifiers, key, (event, context) => {
          return callback(event, context, () => delegateToNative(binding, event, context));
        });
        bindings.push(binding);
      };
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        registerFirst([], key, (event, context, delegate) => {
          if (!this.shouldCaptureArrow(canvas, event))
            return delegate();
          event.__tomindmapHandled = true;
          this.consume(event);
          const node = this.canvasApi.getSelectedNode(canvas);
          this.navigate(canvas, node, key.slice(5).toLowerCase());
          return false;
        });
      }
      const registerPriorityShortcut = (modifiers, key) => {
        registerFirst(modifiers, key, (event, context, delegate) => {
          if (!this.shouldCaptureNavigationShortcut(canvas, event))
            return delegate();
          this.handleKeydown(canvas, event);
          if (!event.defaultPrevented)
            return delegate();
          event.__tomindmapHandled = true;
          return false;
        });
      };
      for (const key of ["Tab", "Enter", "Delete", "Backspace", "F2"])
        registerPriorityShortcut([], key);
      registerPriorityShortcut(["Shift"], "Enter");
      for (const key of ["Enter", "Delete", "Backspace", "Home"])
        registerPriorityShortcut(["Mod"], key);
      registerPriorityShortcut(["Mod"], "R");
      registerPriorityShortcut(["Mod"], "F");
      registerPriorityShortcut(["Mod"], "Z");
      registerPriorityShortcut(["Mod", "Shift"], "Z");
      registerPriorityShortcut(["Mod"], "Y");
      registerPriorityShortcut(["Alt"], "ArrowUp");
      registerPriorityShortcut(["Alt"], "ArrowDown");
      priorityBindings.set(scope, bindings);
      promoteBindings(scope, bindings);
    };
    const refreshPriorityScopes = () => {
      var _a, _b, _c;
      const keymap = this.plugin.app.keymap;
      const scopes = [
        canvas.scope,
        (_a = canvas.view) == null ? void 0 : _a.scope,
        (_c = (_b = canvas.view) == null ? void 0 : _b.leaf) == null ? void 0 : _c.scope,
        keymap == null ? void 0 : keymap.scope
      ];
      for (const scope of scopes)
        installPriorityBindings(scope);
    };
    refreshPriorityScopes();
    const attachDocument = (doc) => {
      if (!doc || documents.has(doc))
        return;
      doc.addEventListener("keydown", handler, true);
      documents.add(doc);
    };
    const scanEditorDocuments = () => {
      for (const node of canvas.nodes.values()) {
        var _a;
        const iframe = (_a = node.contentEl) == null ? void 0 : _a.querySelector("iframe");
        if (!iframe)
          continue;
        if (!iframes.has(iframe)) {
          const loadHandler = () => attachDocument(iframe.contentDocument);
          iframe.addEventListener("load", loadHandler);
          iframes.set(iframe, loadHandler);
        }
        if (iframe.contentDocument)
          attachDocument(iframe.contentDocument);
      }
    };
    canvas.wrapperEl.addEventListener("keydown", handler, true);
    scanEditorDocuments();
    const observer = new MutationObserver(() => {
      scanEditorDocuments();
      refreshPriorityScopes();
    });
    observer.observe(canvas.wrapperEl, { childList: true, subtree: true });
    const focusHandler = () => {
      scanEditorDocuments();
      refreshPriorityScopes();
    };
    const pointerHandler = () => refreshPriorityScopes();
    canvas.wrapperEl.addEventListener("focusin", focusHandler, true);
    canvas.wrapperEl.addEventListener("pointerdown", pointerHandler, true);
    const refreshRaf = requestAnimationFrame(refreshPriorityScopes);
    return () => {
      cancelAnimationFrame(refreshRaf);
      for (const [scope, bindings] of priorityBindings) {
        for (const binding of bindings) {
          if (typeof scope.unregister === "function") {
            try {
              scope.unregister(binding);
            } catch (error) {
            }
          }
          if (Array.isArray(scope.keys)) {
            const index = scope.keys.indexOf(binding);
            if (index >= 0)
              scope.keys.splice(index, 1);
          }
        }
      }
      priorityBindings.clear();
      canvas.wrapperEl.removeEventListener("keydown", handler, true);
      canvas.wrapperEl.removeEventListener("focusin", focusHandler, true);
      canvas.wrapperEl.removeEventListener("pointerdown", pointerHandler, true);
      observer.disconnect();
      for (const doc of documents) {
        doc.removeEventListener("keydown", handler, true);
      }
      for (const [iframe, loadHandler] of iframes) {
        iframe.removeEventListener("load", loadHandler);
      }
      documents.clear();
      iframes.clear();
    };
  }
  shouldCaptureArrow(canvas, event) {
    if (!event || event.isComposing || event.defaultPrevented)
      return false;
    if (!this.isMindmapEnabled(canvas) || this.canvasApi.getActiveCanvas() !== canvas)
      return false;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return false;
    const node = this.canvasApi.getSelectedNode(canvas);
    return !!node && !node.isEditing && !getGroupIds(canvas).has(node.id) && !this.isEditableTarget(event.target);
  }
  shouldCaptureNavigationShortcut(canvas, event) {
    if (!event || event.isComposing || event.defaultPrevented)
      return false;
    if (!this.isMindmapEnabled(canvas) || this.canvasApi.getActiveCanvas() !== canvas)
      return false;
    const primary = import_obsidian2.Platform.isMacOS ? event.metaKey : event.ctrlKey;
    if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f")
      return true;
    const node = this.canvasApi.getSelectedNode(canvas);
    return !!node && !node.isEditing && !getGroupIds(canvas).has(node.id) && !this.isEditableTarget(event.target);
  }
  handleKeydown(canvas, event) {
    if (event.__tomindmapHandled || !this.isMindmapEnabled(canvas) || event.defaultPrevented || event.isComposing)
      return;
    const primary = import_obsidian2.Platform.isMacOS ? event.metaKey : event.ctrlKey;
    if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
      this.consume(event);
      this.onFindRequested?.(canvas);
      return;
    }
    const node = this.canvasApi.getSelectedNode(canvas);
    if (!node || getGroupIds(canvas).has(node.id))
      return;
    if (node.isEditing) {
      this.handleEditingKeydown(canvas, node, event);
      return;
    }
    if (this.isEditableTarget(event.target))
      return;
    if (primary && !event.altKey && event.key.toLowerCase() === "z") {
      this.consume(event);
      if (event.shiftKey) {
        canvas.redo?.();
      } else {
        canvas.undo?.();
      }
      return;
    }
    if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "y") {
      this.consume(event);
      canvas.redo?.();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !primary && !event.altKey) {
      this.consume(event);
      this.addChild(canvas, node);
      return;
    }
    if (event.key === "Enter") {
      this.consume(event);
      if (primary) {
        this.addParent(canvas, node);
      } else {
        this.addSibling(canvas, node, event.shiftKey);
      }
      return;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey && !primary) {
      this.consume(event);
      this.reorderTopic(canvas, node, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key.startsWith("Arrow") && !primary && !event.altKey && !event.shiftKey) {
      const direction = event.key.slice(5).toLowerCase();
      this.consume(event);
      this.navigate(canvas, node, direction);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && primary && !event.altKey) {
      this.consume(event);
      this.deleteSingleTopic(canvas, node);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !primary && !event.altKey) {
      this.consume(event);
      this.deleteBranch(canvas, node);
      return;
    }
    if ((event.key === "Home" && primary) || (event.key.toLowerCase() === "r" && primary && !event.shiftKey && !event.altKey)) {
      this.consume(event);
      this.navigateToRoot(canvas, node);
      return;
    }
    if (event.key === "F2") {
      this.consume(event);
      this.startEditing(canvas, node);
      return;
    }
    if (event.key === "Dead" && !primary && !event.altKey) {
      this.consume(event);
      this.startEditing(canvas, node);
      return;
    }
    if (this.isPrintableKey(event)) {
      this.consume(event);
      this.startEditing(canvas, node, event.key);
    }
  }
  handleEditingKeydown(canvas, node, event) {
    const primary = import_obsidian2.Platform.isMacOS ? event.metaKey : event.ctrlKey;
    if (event.key === "Enter" && event.shiftKey && !primary && !event.altKey) {
      this.consume(event);
      this.insertEditorText(node, "\n");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      this.consume(event);
      if (primary) {
        this.addParent(canvas, node);
      } else {
        this.finishEditing(canvas, node);
      }
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !primary && !event.altKey) {
      this.consume(event);
      this.addChild(canvas, node);
      return;
    }
    if (event.key === "Escape") {
      this.consume(event);
      this.finishEditing(canvas, node);
    }
  }
  isEditableTarget(target) {
    if (!target || typeof target.closest !== "function")
      return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
  }
  isPrintableKey(event) {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  }
  consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  startEditing(canvas, node, initialText = "") {
    for (const candidate of canvas.nodes.values()) {
      var _a;
      (_a = candidate.nodeEl) == null ? void 0 : _a.removeClass("mindvas-navigation-selected");
    }
    node.startEditing();
    if (initialText)
      this.insertEditorTextWhenReady(node, initialText);
  }
  insertEditorTextWhenReady(node, text, attempt = 0) {
    const view = this.getEditorView(node);
    if (view) {
      const end = view.state.doc.length;
      view.dispatch({ selection: { anchor: end } });
      view.dispatch({ changes: { from: end, to: end, insert: text } });
      view.focus();
      return;
    }
    if (attempt < 10) {
      setTimeout(() => this.insertEditorTextWhenReady(node, text, attempt + 1), 20);
      return;
    }
    node.setText(`${node.text || ""}${text}`);
    node.startEditing();
  }
  insertEditorText(node, text) {
    const view = this.getEditorView(node);
    if (!view)
      return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length }
    });
    view.focus();
  }
  finishEditing(canvas, node) {
    var _a;
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    node.blur();
    this.canvasApi.selectForNavigation(canvas, node, this.zoomPadding);
  }
  addChild(canvas, node) {
    var _a;
    let selectedText = null;
    if (node.isEditing)
      selectedText = this.extractAndDeleteSelection(node);
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    const newNode = this.nodeOps.addChild(canvas, node);
    if (!newNode)
      return;
    if (selectedText)
      newNode.setText(selectedText);
    this.finishMutation(canvas, node);
    this.canvasApi.selectAndEdit(canvas, newNode, this.zoomPadding);
  }
  addSibling(canvas, node, before = false) {
    var _a;
    let selectedText = null;
    if (node.isEditing)
      selectedText = this.extractAndDeleteSelection(node);
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    const newNode = this.nodeOps.addSibling(canvas, node, before);
    if (!newNode)
      return;
    if (selectedText)
      newNode.setText(selectedText);
    const parent = this.canvasApi.getParentNode(canvas, newNode);
    this.finishMutation(canvas, parent || node);
    this.canvasApi.selectAndEdit(canvas, newNode, this.zoomPadding);
  }
  addParent(canvas, node) {
    var _a;
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    const newNode = this.nodeOps.addParent(canvas, node);
    if (!newNode)
      return;
    this.finishMutation(canvas, newNode);
    this.canvasApi.selectAndEdit(canvas, newNode, this.zoomPadding);
  }
  deleteBranch(canvas, node) {
    var _a;
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    const parent = this.canvasApi.getParentNode(canvas, node);
    const removedIds = this.collectBranchIds(canvas, node);
    const fallback = parent || this.nearestRemainingNode(canvas, node, removedIds);
    this.nodeOps.deleteSubtree(canvas, node);
    this.finishMutation(canvas, fallback);
    if (fallback)
      this.canvasApi.selectForNavigation(canvas, fallback, this.zoomPadding);
    else
      this.clearSelection(canvas);
  }
  deleteSingleTopic(canvas, node) {
    var _a;
    (_a = this.onBeforeLeaveNode) == null ? void 0 : _a.call(this);
    const focusNode = this.nodeOps.deleteAndFocusParent(canvas, node);
    this.finishMutation(canvas, focusNode);
    if (focusNode)
      this.canvasApi.selectForNavigation(canvas, focusNode, this.zoomPadding);
    else
      this.clearSelection(canvas);
  }
  finishMutation(canvas, anchor) {
    if (anchor)
      this.relayoutFromAnchor(canvas, anchor);
    if (this.autoColorEnabled() && this.isMindmapEnabled(canvas))
      this.branchColors.applyColors(canvas);
    this.onNodesChanged(canvas);
  }
  relayoutFromAnchor(canvas, anchor) {
    if (!this.plugin.isAutoAdjustCanvas(canvas) || !this.isMindmapEnabled(canvas))
      return;
    const forest = buildForest(canvas);
    const tree = findTreeForNode(forest, anchor.id);
    if (!tree)
      return;
    let root = tree;
    while (root.parent)
      root = root.parent;
    this.layoutEngine.layoutChildren(canvas, root.canvasNode.id);
  }
  navigate(canvas, node, direction) {
    const target = this.findSpatialTarget(canvas, node, direction);
    if (target)
      this.canvasApi.selectForNavigation(canvas, target, this.zoomPadding);
  }
  directionCommand(checking, direction) {
    const canvas = this.canvasApi.getActiveCanvas();
    if (!canvas || !this.isMindmapEnabled(canvas))
      return false;
    const node = this.canvasApi.getSelectedNode(canvas);
    if (!node)
      return false;
    if (checking)
      return true;
    if (node.isEditing)
      this.finishEditing(canvas, node);
    this.navigate(canvas, node, direction);
    return true;
  }
  findSpatialTarget(canvas, current, direction) {
    const groupIds = getGroupIds(canvas);
    const all = Array.from(canvas.nodes.values()).filter((node) => node.id !== current.id && !groupIds.has(node.id));
    const buffer = Math.max(0, Number(this.plugin.settings.navigationCrossAxisBuffer) || 0);
    const viewport = canvas.wrapperEl && typeof canvas.wrapperEl.getBoundingClientRect === "function" ? canvas.wrapperEl.getBoundingClientRect() : null;
    const screenRect = (node) => {
      if (node.nodeEl && typeof node.nodeEl.getBoundingClientRect === "function") {
        const rect = node.nodeEl.getBoundingClientRect();
        if (Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0)
          return rect;
      }
      return {
        left: node.x,
        right: node.x + node.width,
        top: node.y,
        bottom: node.y + node.height,
        width: node.width,
        height: node.height
      };
    };
    const currentRect = screenRect(current);
    const currentCenterX = (currentRect.left + currentRect.right) / 2;
    const currentCenterY = (currentRect.top + currentRect.bottom) / 2;
    const origin = direction === "left" ? { x: currentRect.left, y: currentCenterY } : direction === "right" ? { x: currentRect.right, y: currentCenterY } : direction === "up" ? { x: currentCenterX, y: currentRect.top } : { x: currentCenterX, y: currentRect.bottom };
    const pointFacingOrigin = (rect) => direction === "left" ? { x: rect.right, y: (rect.top + rect.bottom) / 2 } : direction === "right" ? { x: rect.left, y: (rect.top + rect.bottom) / 2 } : direction === "up" ? { x: (rect.left + rect.right) / 2, y: rect.bottom } : { x: (rect.left + rect.right) / 2, y: rect.top };
    const rayHitsTargetViewportEdge = (rayOrigin, dx, dy) => {
      if (!viewport)
        return true;
      if (direction === "left" || direction === "right") {
        if (Math.abs(dx) < 0.01)
          return false;
        const edgeX = direction === "left" ? viewport.left : viewport.right;
        const t = (edgeX - rayOrigin.x) / dx;
        if (t <= 0)
          return false;
        const hitY = rayOrigin.y + t * dy;
        return hitY >= viewport.top - buffer && hitY <= viewport.bottom + buffer;
      }
      if (Math.abs(dy) < 0.01)
        return false;
      const edgeY = direction === "up" ? viewport.top : viewport.bottom;
      const t = (edgeY - rayOrigin.y) / dy;
      if (t <= 0)
        return false;
      const hitX = rayOrigin.x + t * dx;
      return hitX >= viewport.left - buffer && hitX <= viewport.right + buffer;
    };
    const ranked = all.map((candidate) => {
      const rect = screenRect(candidate);
      const point = pointFacingOrigin(rect);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const primary = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
      const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const strictCrossAxisOverlap = direction === "left" || direction === "right" ? rect.bottom >= currentRect.top && rect.top <= currentRect.bottom : rect.right >= currentRect.left && rect.left <= currentRect.right;
      const crossAxisOverlap = direction === "left" || direction === "right" ? rect.bottom >= currentRect.top - buffer && rect.top <= currentRect.bottom + buffer : rect.right >= currentRect.left - buffer && rect.left <= currentRect.right + buffer;
      return {
        node: candidate,
        primary,
        cross,
        distance: dx * dx + dy * dy,
        alignment: cross / Math.max(primary, 1),
        inStrictCorridor: primary > 1 && strictCrossAxisOverlap,
        crossAxisOverlap,
        inCorridor: primary > 1 && crossAxisOverlap,
        inViewportWedge: primary > 1 && rayHitsTargetViewportEdge(origin, dx, dy),
        rect
      };
    });
    const tieBreak = (a, b) => {
      const ay = a.node.y + a.node.height / 2;
      const by = b.node.y + b.node.height / 2;
      const ax = a.node.x + a.node.width / 2;
      const bx = b.node.x + b.node.width / 2;
      return ay - by || ax - bx || String(a.node.id).localeCompare(String(b.node.id));
    };
    const byDistance = (a, b) => a.distance - b.distance || tieBreak(a, b);
    const byAlignmentThenDistance = (a, b) => {
      const bandA = Math.floor(a.alignment / 0.12);
      const bandB = Math.floor(b.alignment / 0.12);
      return bandA - bandB || byDistance(a, b);
    };
    const strictCorridor = ranked.filter((candidate) => candidate.inStrictCorridor).sort(byDistance);
    if (strictCorridor.length > 0)
      return strictCorridor[0].node;
    const corridor = ranked.filter((candidate) => candidate.inCorridor).sort(byAlignmentThenDistance);
    if (corridor.length > 0)
      return corridor[0].node;
    const wedge = ranked.filter((candidate) => candidate.inViewportWedge).sort(byAlignmentThenDistance);
    if (wedge.length > 0)
      return wedge[0].node;
    if (!this.plugin.settings.wrapArrowNavigation)
      return null;
    if (!viewport) {
      const opposite = ranked.filter((candidate) => candidate.primary < -1);
      opposite.sort((a, b) => a.primary - b.primary || a.cross - b.cross || tieBreak(a, b));
      return opposite.length > 0 ? opposite[0].node : null;
    }
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const wrapOrigin = direction === "left" ? { x: viewport.right, y: clamp(origin.y, viewport.top, viewport.bottom) } : direction === "right" ? { x: viewport.left, y: clamp(origin.y, viewport.top, viewport.bottom) } : direction === "up" ? { x: clamp(origin.x, viewport.left, viewport.right), y: viewport.bottom } : { x: clamp(origin.x, viewport.left, viewport.right), y: viewport.top };
    const wrapRanked = ranked.map((candidate) => {
      const point = pointFacingOrigin(candidate.rect);
      const dx = point.x - wrapOrigin.x;
      const dy = point.y - wrapOrigin.y;
      const primary = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
      const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const strictStraight = direction === "left" || direction === "right" ? candidate.rect.top <= wrapOrigin.y && candidate.rect.bottom >= wrapOrigin.y : candidate.rect.left <= wrapOrigin.x && candidate.rect.right >= wrapOrigin.x;
      const straight = direction === "left" || direction === "right" ? candidate.rect.top <= wrapOrigin.y + buffer && candidate.rect.bottom >= wrapOrigin.y - buffer : candidate.rect.left <= wrapOrigin.x + buffer && candidate.rect.right >= wrapOrigin.x - buffer;
      return {
        node: candidate.node,
        primary,
        cross,
        distance: dx * dx + dy * dy,
        alignment: cross / Math.max(primary, 1),
        inStrictCorridor: primary > 1 && strictStraight,
        inCorridor: primary > 1 && straight,
        inViewportWedge: primary > 1 && rayHitsTargetViewportEdge(wrapOrigin, dx, dy)
      };
    });
    const wrapStrictCorridor = wrapRanked.filter((candidate) => candidate.inStrictCorridor).sort(byDistance);
    if (wrapStrictCorridor.length > 0)
      return wrapStrictCorridor[0].node;
    const wrapCorridor = wrapRanked.filter((candidate) => candidate.inCorridor).sort(byAlignmentThenDistance);
    if (wrapCorridor.length > 0)
      return wrapCorridor[0].node;
    const wrapWedge = wrapRanked.filter((candidate) => candidate.inViewportWedge).sort(byAlignmentThenDistance);
    if (wrapWedge.length > 0)
      return wrapWedge[0].node;
    return null;
  }
  collectBranchIds(canvas, node) {
    const ids = /* @__PURE__ */ new Set([node.id]);
    const queue = [node.id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      for (const edge of this.canvasApi.getOutgoingEdges(canvas, id)) {
        const childId = edge.to.node.id;
        if (!ids.has(childId)) {
          ids.add(childId);
          queue.push(childId);
        }
      }
    }
    return ids;
  }
  nearestRemainingNode(canvas, current, excludedIds) {
    const groupIds = getGroupIds(canvas);
    const cx = current.x + current.width / 2;
    const cy = current.y + current.height / 2;
    return Array.from(canvas.nodes.values()).filter((node) => !excludedIds.has(node.id) && !groupIds.has(node.id)).sort((a, b) => {
      const ad = Math.hypot(a.x + a.width / 2 - cx, a.y + a.height / 2 - cy);
      const bd = Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy);
      return ad - bd || a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id));
    })[0] || null;
  }
  clearSelection(canvas) {
    if (typeof canvas.deselectAll === "function")
      canvas.deselectAll();
    if (typeof canvas.requestFrame === "function")
      canvas.requestFrame();
  }
  navigateToRoot(canvas, node) {
    const forest = buildForest(canvas);
    let tree = findTreeForNode(forest, node.id);
    if (!tree)
      return;
    while (tree.parent)
      tree = tree.parent;
    this.canvasApi.selectForNavigation(canvas, tree.canvasNode, this.zoomPadding);
  }
  reorderTopic(canvas, node, delta) {
    const forest = buildForest(canvas);
    const tree = findTreeForNode(forest, node.id);
    if (!tree || !tree.parent)
      return;
    const parentCx = tree.parent.canvasNode.x + tree.parent.canvasNode.width / 2;
    const currentCx = node.x + node.width / 2;
    const onLeft = currentCx < parentCx;
    const siblings = tree.parent.children.filter((sibling) => {
      const siblingCx = sibling.canvasNode.x + sibling.canvasNode.width / 2;
      return (siblingCx < parentCx) === onLeft;
    }).sort((a, b) => a.canvasNode.y - b.canvasNode.y);
    const index = siblings.indexOf(tree);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length)
      return;
    const target = siblings[targetIndex].canvasNode;
    const oldY = node.y;
    node.moveTo({ x: node.x, y: target.y });
    target.moveTo({ x: target.x, y: oldY });
    this.plugin.markMarkdownOrderDirty(canvas);
    this.finishMutation(canvas, tree.parent.canvasNode);
    this.canvasApi.selectForNavigation(canvas, node, this.zoomPadding);
  }
  /**
   * Fallback keydown listener that uses event.code (physical key position)
   * instead of event.key (character). Activates only when a non-Latin layout
   * is detected (event.key doesn't match the expected Latin character),
   * so it won't double-fire with Obsidian's built-in hotkey system.
   */
  registerPhysicalKeyShortcuts() {
    const shortcuts = [
      { code: "Period", key: ".", ctrl: true, shift: false, alt: false, cmdId: `${this.plugin.manifest.id}:mindmap-add-child` },
      { code: "KeyS", key: "s", ctrl: true, shift: false, alt: false, cmdId: `${this.plugin.manifest.id}:mindmap-save-node` },
      { code: "KeyS", key: "s", ctrl: true, shift: true, alt: false, cmdId: `${this.plugin.manifest.id}:mindmap-flip-branch` },
      { code: "KeyD", key: "d", ctrl: true, shift: true, alt: false, cmdId: `${this.plugin.manifest.id}:mindmap-toggle-balance` },
      { code: "KeyL", key: "l", ctrl: true, shift: true, alt: false, cmdId: `${this.plugin.manifest.id}:mindmap-resize-subtree` },
      { code: "KeyR", key: "r", ctrl: true, shift: true, alt: true, cmdId: `${this.plugin.manifest.id}:mindmap-resize-all` }
    ];
    this.plugin.registerDomEvent(document, "keydown", (e) => {
      var _a, _b, _c;
      const canvas = this.canvasApi.getActiveCanvas();
      if (!canvas)
        return;
      const ctrlOrCmd = import_obsidian2.Platform.isMacOS ? e.metaKey : e.ctrlKey;
      if (!ctrlOrCmd)
        return;
      if (e.code === "KeyZ" && !e.altKey && e.key.toLowerCase() !== "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          (_a = canvas.redo) == null ? void 0 : _a.call(canvas);
        } else {
          (_b = canvas.undo) == null ? void 0 : _b.call(canvas);
        }
        return;
      }
      if (e.code === "KeyY" && !e.shiftKey && !e.altKey && e.key.toLowerCase() !== "y") {
        e.preventDefault();
        e.stopPropagation();
        (_c = canvas.redo) == null ? void 0 : _c.call(canvas);
        return;
      }
      const { commands } = this.plugin.app;
      if (!(commands == null ? void 0 : commands.executeCommandById))
        return;
      for (const s of shortcuts) {
        if (e.code === s.code && ctrlOrCmd === s.ctrl && e.shiftKey === s.shift && e.altKey === s.alt) {
          if (e.key.toLowerCase() === s.key)
            return;
          e.preventDefault();
          e.stopPropagation();
          commands.executeCommandById(s.cmdId);
          return;
        }
      }
    });
  }
  /**
   * Find the child whose vertical center is closest to the current node's.
   */
  nearestChild(tree, candidates) {
    const children = candidates != null ? candidates : tree.children;
    if (children.length === 0)
      return null;
    const nodeCy = tree.canvasNode.y + tree.canvasNode.height / 2;
    let best = children[0];
    let bestDist = Math.abs(best.canvasNode.y + best.canvasNode.height / 2 - nodeCy);
    for (let i = 1; i < children.length; i++) {
      const childCy = children[i].canvasNode.y + children[i].canvasNode.height / 2;
      const dist = Math.abs(childCy - nodeCy);
      if (dist < bestDist) {
        best = children[i];
        bestDist = dist;
      }
    }
    return best.canvasNode;
  }
};

// src/ui/navigation.ts
var Navigation = class {
  constructor(canvasApi) {
    this.canvasApi = canvasApi;
  }
  /**
   * Select the entire tree (root + all descendants) that a node belongs to.
   * Triggered by Alt+click on a node.
   */
  selectTree(canvas, node) {
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    const treeNode = findTreeForNode(forest, node.id);
    if (!treeNode)
      return;
    let root = treeNode;
    while (root.parent)
      root = root.parent;
    const allNodes = [root, ...getDescendants(root)];
    canvas.deselectAll();
    for (const n of allNodes) {
      canvas.selection.add(n.canvasNode);
    }
    canvas.requestFrame();
  }
  /**
   * Zoom to fit an entire branch (node + all descendants).
   * Triggered by Ctrl+click on a node.
   */
  zoomToBranch(canvas, node) {
    const forest = buildForest(canvas);
    if (forest.length === 0)
      return;
    const treeNode = findTreeForNode(forest, node.id);
    if (!treeNode)
      return;
    const allNodes = [treeNode, ...getDescendants(treeNode)];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of allNodes) {
      const cn = n.canvasNode;
      minX = Math.min(minX, cn.x);
      minY = Math.min(minY, cn.y);
      maxX = Math.max(maxX, cn.x + cn.width);
      maxY = Math.max(maxY, cn.y + cn.height);
    }
    const pad = 50;
    canvas.zoomToBbox({
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad
    });
  }
  /**
   * Register Ctrl+click handler for zoom-to-branch.
   */
  registerClickHandler(canvas) {
    var _a;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey)
        return;
      const target = e.target;
      if (target.closest(".canvas-node-connection-point"))
        return;
      const nodeEl = target.closest(".canvas-node");
      if (!nodeEl)
        return;
      for (const node of canvas.nodes.values()) {
        if (node.nodeEl === nodeEl) {
          e.preventDefault();
          e.stopPropagation();
          if (e.altKey) {
            this.selectTree(canvas, node);
          } else {
            this.zoomToBranch(canvas, node);
          }
          break;
        }
      }
    };
    (_a = canvas.wrapperEl) == null ? void 0 : _a.addEventListener("click", handler, true);
    return () => {
      var _a2;
      (_a2 = canvas.wrapperEl) == null ? void 0 : _a2.removeEventListener("click", handler, true);
    };
  }
};

module.exports = { KeyboardHandler, Navigation };
