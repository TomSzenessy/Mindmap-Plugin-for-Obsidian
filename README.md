<div align="center">

# ToMindMap

**Keyboard-first mind mapping in Obsidian Canvas**

Turn native Canvas cards into fast, automatically arranged mind maps. Write with Markdown, move through ideas spatially, synchronize maps with notes, and export finished work in practical formats.

[Installation](#installation) · [Create a map](#create-a-map) · [Shortcuts](#keyboard-workflow) · [Markdown sync](#markdown-sync) · [Import and export](#import-and-export)

</div>

## What ToMindMap does

ToMindMap adds a focused mind-mapping workflow to Obsidian Canvas:

- creates children, siblings, and parents directly from the keyboard;
- lays out one or many independent mind maps on the same Canvas;
- balances branches on both sides of each central topic;
- sizes cards from their rendered Markdown content;
- gives PDFs, images, video, audio, and embedded documents readable viewports;
- navigates to the nearest topic with the arrow keys and keeps it in view;
- synchronizes Canvas hierarchy and topic order with a linked Markdown file;
- renders tasks, links, LaTeX, code, tables, images, PDFs, media, and Obsidian embeds;
- groups maps into forests and provides a searchable, collapsible outline;
- imports Markdown, Mermaid mindmaps, Markmap-style notes, and FreeMind `.mm` files;
- accepts dropped files and URLs directly on the Canvas or on an existing topic;
- exports the whole map, viewport, or selection as PDF, PNG, or SVG;
- exports the complete hierarchy as portable Markdown;
- validates local media references and highlights items that need attention.

The result remains a native `.canvas` file, so the map fits naturally into an Obsidian vault and works with Canvas links, groups, colors, undo, and redo.

## Installation

ToMindMap is a desktop-only Obsidian plugin for Obsidian `1.5.0` and newer.

Before installing, make sure **Settings → Community plugins → Restricted mode** is turned off. The plugin directory must be named `tomindmap`, because that name matches the plugin ID in `manifest.json`.

### Install with Git

Clone the repository directly into your vault’s plugin directory:

```bash
cd "/path/to/Your Vault/.obsidian/plugins"
git clone https://github.com/TomSzenessy/Obsidian-Mindmap.git tomindmap
```

Then:

1. Reload Obsidian.
2. Open **Settings → Community plugins**.
3. Select **Reload plugins** if ToMindMap is not listed.
4. Enable **ToMindMap**.

To update:

```bash
cd "/path/to/Your Vault/.obsidian/plugins/tomindmap"
git pull
```

Reload Obsidian after updating. A Git installation includes the development source, but Obsidian loads only the generated `main.js`, `manifest.json`, and `styles.css`.

### Install a downloaded release

Create this folder:

```text
<Your Vault>/.obsidian/plugins/tomindmap/
```

Place these release files inside it:

```text
main.js
manifest.json
styles.css
```

Use the files from the same release version. Do not copy `src/`, `lib/`, `scripts/`, or the test files for a normal installation; those are development sources and are already bundled into `main.js`.

Reload Obsidian and enable **ToMindMap** under **Settings → Community plugins**.

### Troubleshooting installation

- Confirm the final path is `<vault>/.obsidian/plugins/tomindmap/manifest.json`, without an extra nested folder.
- Confirm all three release files are present and came from the same version.
- Confirm community plugins are enabled and ToMindMap is switched on.
- After replacing files manually, reload the plugin or restart Obsidian.

## Create a map

1. Create or open a Canvas.
2. Click the network button in the Canvas controls to enable Mindmap mode.
3. Select a text card as the central topic.
4. Start typing to edit the topic.
5. Press `Enter` to finish editing.
6. Press `Tab` to create a child or `Enter` to create a sibling.
7. Use the arrow keys to move through the map.

The image-plus button in the Canvas controls opens the media picker. With a text topic selected, chosen files are embedded in that topic; with the Canvas selected, each file becomes a native file card.

Mindmap mode continuously keeps the active map readable. Topic dimensions are measured from Obsidian’s rendered Markdown, branches are packed around their roots, edge directions follow the layout, and group bounds follow their contents.

## Keyboard workflow

`Mod` means `Command` on macOS and `Ctrl` on Windows or Linux.

| Action | Shortcut |
| --- | --- |
| Edit the selected topic | Start typing or press `F2` |
| Finish editing | `Enter` or `Escape` |
| Insert a line break while editing | `Shift` + `Enter` |
| Create a sibling below | `Enter` |
| Create a sibling above | `Shift` + `Enter` |
| Create a child | `Tab` |
| Insert a parent | `Mod` + `Enter` |
| Navigate spatially | `←` `→` `↑` `↓` |
| Select the central topic | `Mod` + `R` or `Mod` + `Home` |
| Reorder siblings | `Alt` + `↑` / `Alt` + `↓` |
| Search the map outline | `Mod` + `F` |
| Delete a topic and its branch | `Delete` or `Backspace` |
| Delete one topic and retain its children | `Mod` + `Delete` |
| Undo / redo | `Mod` + `Z` / `Mod` + `Shift` + `Z` |

The Command Palette also exposes topic creation, deletion, branch flipping, layout balancing, resizing, coloring, import, export, Markdown sync, media validation, outline, and navigation actions. Obsidian can assign custom hotkeys to every command.

### Mouse and Context Menu actions

- Drag a card or complete branch near another node to preview and **switch** its single parent connection (XMind-style), keeping the complete subtree intact.
- Attachment uses a fixed 180-Canvas-unit edge-to-edge distance. Moving beyond every node’s attachment distance detaches the branch; moving any standalone node inside that distance previews and creates a new connection.
- Drop an image, PDF, audio file, video, or URL on a topic card to create a connected **standalone child media node**.
- Drop a file or URL on empty Canvas space to create an independent **root media node**.
- Standalone file and link nodes maintain their readable default sizes and support manual resizing without being affected by text auto-layout.
- Right-click any topic to access branch tools:
  - **Separate branch**: Detach a branch from its parent into an independent root node/tree.
  - **Collapse / Expand subtree**: Fold or unfold child branches to streamline complex maps.
  - **Color branch**: Color-code a topic and all its descendants recursively.
- `Mod`-click a topic to zoom to its complete branch.
- `Alt`-click a topic to select its complete tree.
- `Alt`-drag a group to move the group while keeping unrelated trees in place.
- Select two topics, open one topic’s context menu, and choose **Connect this topic → selected topic** to create a branch connection.
- Enable mouse back/forward navigation in settings to move through topic history with extra mouse buttons.

## Automatic layout and content sizing

ToMindMap models each map as a central topic with left and right branches. It uses rendered topic dimensions and subtree contours to create a compact layout with consistent horizontal and vertical spacing.

Text cards stay compact. Rich content receives a viewport suited to its format:

- PDF and document viewers open at a readable document size;
- video and generic embeds receive presentation-sized frames;
- images receive a useful visual preview area;
- audio receives enough width for its controls;
- tables and code blocks expand to accommodate rigid content.

The automatic width and height limits in **Settings → ToMindMap** remain the final bounds for every card. Reopening a measured map reuses its saved dimensions, while asynchronously loaded media is watched for genuine size changes.

Spatial navigation uses visible card geometry. It favors aligned nearby topics, expands into a directional wedge when needed, supports edge wrapping, and reveals targets with configurable camera padding.

## Markdown sync

Choose **Sync to Markdown file** from a Canvas file menu or run **Sync / detach Markdown file** from the Command Palette. A Canvas named `Project.canvas` creates and links `Project Mindmap.md`.

The linked pair supports both editing directions:

- Canvas topic text, hierarchy, and visual reading order update the Markdown note.
- Markdown text, headings, lists, and hierarchy update the Canvas.
- Renames update the stored link.
- Stable topic identities live in a `tomindmap` YAML block.
- Multiple central topics become multiple top-level Markdown sections.

ToMindMap applies localized source edits when the linked document’s structure supports them. Existing headings, list markers, blank lines, code fences, tables, links, embeds, and surrounding note content retain their original source form. The synchronized Markdown stays readable in Obsidian, Markmap, text editors, and version-control diffs.

### Convert a note into a map

Right-click a Markdown file and choose **Convert to mindmap**. ToMindMap:

1. reads its heading and list hierarchy;
2. creates a same-folder Canvas;
3. assigns stable topic identities;
4. lays out and sizes the topics;
5. links the note and Canvas for ongoing synchronization.

## Rich topics and media

Every text topic uses Obsidian’s Markdown renderer. Topics can contain:

- emphasis, links, wikilinks, and topic links;
- ordered lists, unordered lists, and task checkboxes;
- inline and block LaTeX;
- inline code and fenced code blocks;
- Markdown tables and blockquotes;
- images and animated images;
- PDF documents;
- audio and video;
- HTML media elements and Obsidian embeds.

Task checkboxes can be toggled directly from the Canvas. **Validate local media and embeds** checks vault paths and marks unresolved references in red with their target names.

## Outline and groups

Open **Map outline** from the Canvas menu or Command Palette. The sidebar provides:

- the complete nested hierarchy;
- live selection highlighting;
- collapse and expand controls;
- topic search;
- click-to-jump navigation;
- root-tree drag and drop between groups;
- group creation and inline group renaming;
- forest layout inside groups.

A single Canvas can hold several independent central topics. Groups organize related trees, and group bounds update with their map contents.

## Import and export

### Import

ToMindMap reads:

- heading-based Markdown;
- nested ordered and unordered Markdown lists;
- Markmap-style Markdown;
- Mermaid `mindmap` blocks;
- FreeMind `.mm` XML;
- pasted Markdown and local Markdown files.

Imported maps are placed below existing Canvas content, measured with the active Obsidian theme, laid out, colored, and added to the outline.

### Export

Open **Export mind map…** and choose a format:

| Format | Areas |
| --- | --- |
| PDF | Whole map, current viewport, or selection |
| PNG | Whole map, current viewport, or selection |
| SVG | Whole map, current viewport, or selection |
| Markdown | Complete hierarchy |

Exports are saved to the operating system’s Downloads folder. Existing filenames are preserved by adding a numeric suffix to each new export.

## Settings

Open **Settings → ToMindMap** to configure:

- default Mindmap mode;
- automatic branch colors;
- horizontal and vertical spacing;
- default, minimum, and maximum card dimensions;
- arrow-navigation wrapping and corridor tolerance;
- camera padding around navigation targets;
- mouse back/forward topic navigation;
- Markmap export frontmatter and color freeze level.

Settings are normalized into safe, internally consistent ranges when the plugin loads and whenever they are saved.

## Development

The repository separates maintainable source from the distributable plugin bundle:

- `src/main.js` is the application entry point and owns plugin lifecycle and integration orchestration.
- `lib/` contains focused CommonJS runtime modules.
- `main.js` is generated and committed as the self-contained Obsidian release artifact.
- `manifest.json` and `styles.css` complete the three-file release.

Use Node.js `20` or newer. There are currently no third-party npm dependencies, so a fresh clone can run the scripts immediately:

```bash
npm test
npm run build
npm run check
```

The normal development workflow is:

1. Edit `src/main.js` and the relevant module in `lib/`.
2. Run `npm test` while iterating.
3. Run `npm run build` to regenerate `main.js`.
4. Run `npm run check` before committing.

Do not edit generated `main.js` directly. If changes were made there accidentally, `npm run source:extract` can reconstruct `src/main.js` by replacing embedded module blocks with their source imports; review the resulting diff before keeping it.

### Source modules

- `tree-model.js` builds a deterministic, cycle-safe forest from Canvas data;
- `canvas-api.js` owns Canvas selection, graph indexing, node and edge mutation, and camera helpers;
- `node-operations.js` implements topic creation, deletion, branch flipping, and collision avoidance;
- `layout.js` owns edge orientation, compact two-sided layout, and branch coloring;
- `keyboard-navigation.js` owns command registration, editing behavior, spatial navigation, and history;
- `freemind.js` parses FreeMind XML and lays imported trees out on Canvas;
- `tree-drag.js` handles XMind-style node drag-and-drop reparenting and drop zone classification;
- `drag-preview-controller.js` manages temporary reparenting previews and commit/rollback behavior;
- `drag-attachment.js` contains attachment-distance calculations;
- `mindmap-actions.js` manages branch separation, subtree collapse/expand, and branch coloring;
- `live-sizing.js` owns text and media measurement plus render observers;
- `markdown-order.js` preserves source slices while updating visual chronology;
- `canvas-session.js` handles Canvas save flushing and complete-map reflow after movement;
- `settings.js` defines and normalizes persisted configuration;
- `media-drop.js` classifies dropped files and URLs and constructs native card specifications;
- `export.js` owns export UI, image rasterization, and collision-free filenames.

The module registry in `scripts/runtime-modules.js` is the source of truth for bundling. When adding a runtime module, register its source import and generated declaration there. `scripts/inline-runtime-modules.js` then embeds the registered modules into `main.js`; `npm run build:check` fails when the committed bundle is stale.

The test suite covers Markdown synchronization, drag attachment and previews, Canvas lifecycle persistence, graph safety, deep-tree traversal, settings normalization, media sizing, export filenames, and bundle synchronization.

### Release checklist

1. Update the version in `manifest.json` and `package.json`.
2. Run `npm run build`.
3. Run `npm run check`.
4. Package `main.js`, `manifest.json`, and `styles.css` from the same commit.

## Privacy

ToMindMap runs locally inside Obsidian and stores its map data in the vault. Links and embeds load through Obsidian’s normal content pipeline.

## License

ToMindMap is available under the [MIT License](LICENSE).

## Acknowledgements

ToMindMap draws inspiration from the fluid mapping workflows of [Xmind](https://xmind.com/), the portable Markdown approach of [Markmap](https://markmap.js.org/), Mermaid mindmaps, FreeMind, and native [Obsidian Canvas](https://obsidian.md/canvas).
