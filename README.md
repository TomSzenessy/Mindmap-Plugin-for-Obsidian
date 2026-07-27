<div align="center">

# ToMindMap

**Keyboard-first mind mapping in Obsidian Canvas**

Turn native Canvas cards into fast, automatically arranged mind maps. Write with Markdown, move through ideas spatially, synchronize maps with notes, and export finished work in practical formats.

[Install](#install) · [Create a map](#create-a-map) · [Shortcuts](#keyboard-workflow) · [Markdown sync](#markdown-sync) · [Import and export](#import-and-export)

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

## Install

ToMindMap is distributed as a desktop Obsidian plugin. It supports Obsidian `1.5.0` and newer.

### Install with Git

```bash
cd "/path/to/Your Vault/.obsidian/plugins"
git clone https://github.com/TomSzenessy/Obsidian-Mindmap.git tomindmap
```

Reload Obsidian, open **Settings → Community plugins**, and enable **ToMindMap**.

To update:

```bash
cd "/path/to/Your Vault/.obsidian/plugins/tomindmap"
git pull
```

Then reload Obsidian.

### Install from downloaded files

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

Reload Obsidian and enable **ToMindMap** under **Settings → Community plugins**.

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

### Mouse actions

- `Mod`-click a topic to zoom to its complete branch.
- `Alt`-click a topic to select its complete tree.
- `Alt`-drag a group to move the group while keeping unrelated trees in place.
- Drop an image, PDF, audio file, video, or other file on a topic to embed it in that topic.
- Drop a file on empty Canvas space to create a native file card at that position.
- Drop a web or Obsidian URL on a topic to add it to the topic, or on empty space to create a link card.
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

The repository contains both maintainable runtime modules and Obsidian’s distributable `main.js`.

```bash
npm test          # run the Node regression suite
npm run build     # inline runtime modules into main.js
npm run check     # verify the bundle, tests, and JavaScript syntax
```

Runtime modules live in `lib/`:

- `tree-model.js` builds a deterministic, cycle-safe forest from Canvas data;
- `live-sizing.js` owns text and media measurement plus render observers;
- `markdown-order.js` preserves source slices while updating visual chronology;
- `settings.js` defines and normalizes persisted configuration;
- `media-drop.js` classifies dropped files and URLs and chooses native card sizes;
- `export.js` owns export UI, image rasterization, and collision-free filenames.

`scripts/inline-runtime-modules.js` embeds those modules into `main.js`, producing the three-file Obsidian release: `main.js`, `manifest.json`, and `styles.css`.

The tests cover Markdown sibling insertion, graph safety, deep-tree traversal, settings normalization, media sizing, export filenames, and bundle synchronization.

## Privacy

ToMindMap runs locally inside Obsidian and stores its map data in the vault. Links and embeds load through Obsidian’s normal content pipeline.

## License

ToMindMap is available under the [MIT License](LICENSE).

## Acknowledgements

ToMindMap draws inspiration from the fluid mapping workflows of [Xmind](https://xmind.com/), the portable Markdown approach of [Markmap](https://markmap.js.org/), Mermaid mindmaps, FreeMind, and native [Obsidian Canvas](https://obsidian.md/canvas).
