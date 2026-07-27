# Runtime modules

These files are the maintainable source modules for focused runtime services:

- `tree-model.js` — deterministic, cycle-safe forest construction and iterative tree traversal.
- `canvas-api.js` — Canvas selection, graph indexing, node/edge mutation, and camera helpers.
- `node-operations.js` — keyboard-oriented topic creation, deletion, flipping, and collision avoidance.
- `layout.js` — edge-side updates, branch coloring, and compact two-sided tree layout.
- `keyboard-navigation.js` — command registration, editing lifecycle, spatial navigation, and history.
- `freemind.js` — FreeMind XML parsing and deterministic Canvas placement.
- `live-sizing.js` — deterministic first-pass sizing followed by measurements from the real Canvas preview. It owns the single batched observer used for virtualized cards.
- `markdown-order.js` — visual topic chronology and lossless movement of existing Markdown source subtrees.
- `media-drop.js` — dropped file/URL classification and native Canvas card sizing.
- `canvas-session.js` — whole-map drag reflow and native Canvas save flushing across leaf changes.
- `settings.js` — immutable defaults plus persisted-settings normalization.
- `export.js` — the export chooser, rasterization, and collision-free Downloads filenames.

Modules receive their small external dependencies from `main.js`. This keeps Canvas internals, Markdown parsing, and UI lifecycle ownership explicit and avoids parallel implementations of the same behavior.

Development commands:

```bash
npm test
npm run build
npm run check
```

`src/main.js` is the maintainable entry point. The build script embeds these
modules into the generated `main.js`; Obsidian installations still use the
standard `main.js`, `manifest.json`, and `styles.css` release files.
