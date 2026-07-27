# Runtime modules

These files are the maintainable source modules for focused runtime services:

- `live-sizing.js` — deterministic first-pass sizing followed by measurements from the real Canvas preview. It owns the single batched observer used for virtualized cards.
- `markdown-order.js` — visual topic chronology and lossless movement of existing Markdown source subtrees.
- `export.js` — the export chooser, rasterization, and collision-free Downloads filenames.

Modules receive their small external dependencies from `main.js`. This keeps Canvas internals, Markdown parsing, and UI lifecycle ownership explicit and avoids parallel implementations of the same behavior.

Before distributing the plugin, run:

```bash
node scripts/inline-runtime-modules.js
```

The build script embeds the modules into `main.js`, because Obsidian installations only need the standard `main.js`, `manifest.json`, and `styles.css` files.
