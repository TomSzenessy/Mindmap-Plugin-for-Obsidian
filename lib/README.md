# Runtime modules

These files are the maintainable source modules for focused runtime services.

## Compiler provenance

`scripts/runtime-modules.js` is the single registry for embedded runtime
module names, source paths, bindings, and local dependencies. The compiler
derives both the generated `require` and declaration forms from each record;
`scripts/inline-runtime-modules.js` embeds the source and
`scripts/extract-main-source.js` reverses the marked blocks using those same
records. Generated IIFEs carry their own strict-mode directive, and registered
local dependencies are compiled into the surrounding runtime rather than left
as relative `require()` calls.

The current embedded source records are generated from that registry. The
release check regenerates and compares this marked block, so adding or removing
a runtime record cannot leave a stale hand-maintained inventory:

<!-- BEGIN runtime-module-inventory -->
- `tree-model` — `lib/tree-model.js`
- `path-safety` — `lib/path-safety.js`
- `settings` — `lib/settings.js`
- `media-drop` — `lib/media-drop.js`
- `live-sizing` — `lib/live-sizing.js`
- `markdown-order` — `lib/markdown-order.js`
- `clipboard-markdown` — `lib/clipboard-markdown.js`
- `vector-pdf` — `lib/vector-pdf-bundle.js` (generated from `lib/vector-pdf-entry.js`; the entry file is not separately embedded)
- `export` — `lib/export.js`
- `tree-drag` — `lib/tree-drag.js`
- `mindmap-actions` — `lib/mindmap-actions.js`
- `drag-preview-controller` — `lib/drag-preview-controller.js`
- `canvas-session` — `lib/canvas-session.js`
- `canvas-api` — `lib/canvas-api.js`
- `node-operations` — `lib/node-operations.js`
- `layout` — `lib/layout.js`
- `keyboard-navigation` — `lib/keyboard-navigation.js`
- `freemind` — `lib/freemind.js`
- `markdown-codec` — `lib/markdown-codec.js`
- `markdown-sync` — `lib/markdown-sync.js`
- `touch-controls` — `lib/touch-controls.js`
<!-- END runtime-module-inventory -->

The registry, rather than a second hand-maintained import list, is the source
of truth for compiler provenance. Do not edit generated `main.js` or the
vector bundle directly.

Development commands:

```bash
npm test
npm run build
npm run check
node scripts/release-artifacts.js runtime-inventory --check
```

Edit `src/main.js` and `lib/`; do not edit generated `main.js` directly.
Obsidian runtime installation uses `main.js`, `manifest.json`, and `styles.css`;
release archives additionally carry the project license and generated notices.
