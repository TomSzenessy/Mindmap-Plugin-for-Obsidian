# Runtime modules

These files are the maintainable source modules for focused runtime services:

- `tree-model.js` — deterministic, cycle-safe forest construction and iterative tree traversal.
- `live-sizing.js` — deterministic first-pass sizing followed by measurements from the real Canvas preview. It owns the single batched observer used for virtualized cards.
- `markdown-order.js` — visual topic chronology and lossless movement of existing Markdown source subtrees.
- `media-drop.js` — dropped file/URL classification and native Canvas card sizing.
- `settings.js` — immutable defaults plus persisted-settings normalization.
- `export.js` — the export chooser, rasterization, and collision-free Downloads filenames.

Modules receive their small external dependencies from `main.js`. This keeps Canvas internals, Markdown parsing, and UI lifecycle ownership explicit and avoids parallel implementations of the same behavior.

Development commands:

```bash
npm test
npm run build
npm run check
```

The build script embeds the modules into `main.js`. Obsidian installations use the standard `main.js`, `manifest.json`, and `styles.css` release files.
