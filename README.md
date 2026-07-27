<div align="center">

# ToMindMap

**Fast, keyboard-first mind mapping inside Obsidian Canvas**

Create and navigate maps like a dedicated mind-mapping app, keep them automatically arranged, and sync their structure with clean, portable Markdown.

[Installation](#installation) · [Quick start](#quick-start) · [Keyboard shortcuts](#keyboard-shortcuts) · [Markdown sync](#markdown-sync)

</div>

## Highlights

- **Keyboard-first authoring:** `Tab` creates a child, `Enter` creates a sibling, and typing edits the selected topic.
- **Spatial arrow navigation:** move naturally to the nearest topic in any direction while the Canvas follows your selection.
- **Automatic layout:** cards resize to their content and branches stay balanced and readable.
- **Clean Markdown sync:** edit the map or its linked Markdown file with bidirectional updates and no generated HTML comments.
- **Rich content:** tasks, lists, links, LaTeX, code blocks, tables, images, PDFs, audio, video, and Obsidian embeds.
- **Multiple maps per Canvas:** use several independent central topics in one workspace.
- **Useful imports and exports:** Markdown, Markmap-style documents, Mermaid mindmaps, FreeMind `.mm`, and direct PDF export.
- **Nested outline:** browse, search, and jump through the complete map from the right sidebar.

ToMindMap is inspired by the fluid workflows of [Xmind](https://xmind.com/) and the portable Markdown approach of [Markmap](https://markmap.js.org/), while remaining built around native [Obsidian Canvas](https://obsidian.md/canvas) files.

## Installation

ToMindMap is not yet available in Obsidian's Community Plugins catalog.

### Manual installation

1. Download or clone this repository.
2. Create this directory inside your vault:

   ```text
   <Your Vault>/.obsidian/plugins/tomindmap/
   ```

3. Copy these files into it:

   ```text
   main.js
   manifest.json
   styles.css
   ```

4. Restart Obsidian.
5. Open **Settings → Community plugins** and enable **ToMindMap**.

Obsidian `1.5.0` or newer on desktop is required.

### Install with Git

```bash
cd "/path/to/Your Vault/.obsidian/plugins"
git clone https://github.com/TomSzenessy/Obsidian-Mindmap.git tomindmap
```

To update a Git installation, run `git pull` in the plugin directory and reload Obsidian.

## Quick start

1. Create or open a Canvas.
2. Enable Mindmap mode with the network icon in the Canvas toolbar.
3. Select a text card as your central topic.
4. Type to edit it, then press `Enter` to finish.
5. Press `Tab` for a child or `Enter` for a sibling.
6. Navigate with the arrow keys.

Mindmap shortcuts take priority over native Canvas shortcuts while Mindmap mode is active. ToMindMap automatically sizes and arranges every map as you work.

## Keyboard shortcuts

`Mod` means `Command` on macOS and `Ctrl` on Windows or Linux.

| Action | Shortcut |
| --- | --- |
| Edit selected topic | Start typing or press `F2` |
| Finish editing | `Enter` |
| Line break while editing | `Shift` + `Enter` |
| Create sibling | `Enter` |
| Create sibling above | `Shift` + `Enter` |
| Create child | `Tab` |
| Insert parent | `Mod` + `Enter` |
| Navigate spatially | `←` `→` `↑` `↓` |
| Select central topic | `Mod` + `R` or `Mod` + `Home` |
| Reorder siblings | `Alt` + `↑` / `Alt` + `↓` |
| Delete topic and branch | `Delete` or `Backspace` |
| Delete topic but retain its children | `Mod` + `Delete` |

Central topics can be deleted. Most actions are also available from the Command Palette and can be assigned custom hotkeys in Obsidian.

## Automatic layout and navigation

ToMindMap treats a Canvas as one or more independent trees. It balances the two sides of each central topic, manages card dimensions from their rendered content without routine scrollbars, and reflows only the part of the map affected by a change.

Arrow navigation is based on visible geometry rather than only parent/child relationships. It prefers well-aligned nearby topics, uses the viewport to resolve wider directional choices, wraps at map edges when enabled, and keeps the selected topic in view.

## Markdown sync

Choose **Sync to Markdown file** from the Canvas three-dot menu. A Canvas named `Project.canvas` creates `Project Mindmap.md`; if that name exists, ToMindMap selects the next available number.

The files then sync in both directions:

- Canvas content and hierarchy update the Markdown file.
- Markdown edits update and automatically lay out the Canvas.
- Renaming either file keeps the link.
- Deleting either file only detaches the other; it never deletes both.
- Multiple central topics become multiple top-level Markdown sections.

### Lossless source preservation

When ToMindMap converts or reads an existing valid Markdown/Markmap document, it does **not** serialize its body into a preferred style. It only inserts or updates a `tomindmap` property block in YAML frontmatter.

Everything below the frontmatter remains character-for-character unchanged, including:

- whitespace and blank lines;
- list markers and indentation;
- tables and alignment rows;
- fenced code blocks;
- links, embeds, and media syntax;
- the file's existing line-ending style.

ToMindMap generates no node-ID comments and no `mindvas` wrapper comments. Stable topic IDs live only in frontmatter, leaving the document readable in Obsidian, Markmap, other Markdown tools, and version-control diffs.

Pixel coordinates are never stored in Markdown. The hierarchy is parsed into a fresh automatic layout, so the text file remains the portable source of structure.

### Convert an existing note

Right-click a Markdown file in Obsidian's file explorer and choose **Convert to mindmap**. ToMindMap creates a same-folder Canvas, links it to the original note, adds sync properties at the top, and leaves the original document body untouched.

## Rich Markdown and compatibility

Topics support Obsidian-rendered Markdown, including:

- inline formatting, ordered and unordered lists, and task checkboxes;
- inline and block LaTeX;
- inline and fenced code;
- Markdown tables;
- standard links, wikilinks, and links to other map topics;
- images, PDFs, audio, video, and common media embeds.

Missing local media can be validated from the Canvas menu and is highlighted in red.

ToMindMap understands heading/list-based Markdown used by Markmap, common Mermaid mindmap syntax, and FreeMind `.mm` hierarchy files. Compatibility refers to portable structure; ToMindMap uses its own Canvas renderer and layout engine rather than bundling Markmap.

## Outline, import, and export

The **Map outline** in the right sidebar shows the complete nested hierarchy and lets you search or jump to any topic.

The Canvas menu includes:

- sync or detach Markdown;
- copy the complete map as Markdown;
- import pasted Markdown or a Markdown file;
- validate local media;
- export the selection, viewport, or complete Canvas directly to PDF.

PDF files are saved to the operating system's Downloads folder without opening a print dialog.

## Settings

Open **Settings → ToMindMap** to customize:

- default Mindmap mode and automatic branch colors;
- horizontal and vertical spacing;
- card sizing safety limits for exceptionally large content;
- arrow-navigation wrapping, corridor tolerance, and camera padding;
- optional mouse back/forward navigation;
- Markmap export frontmatter and color freeze level.

## Privacy

ToMindMap works locally in your Obsidian vault. It has no account, telemetry, or hosted synchronization service. Remote media referenced by your own notes may still be loaded according to Obsidian's normal behavior.

## License

ToMindMap is released under the [MIT License](LICENSE).

## Acknowledgements

ToMindMap is an independent project inspired by Xmind, Markmap, Mermaid, FreeMind, and Obsidian Canvas. It is not affiliated with or endorsed by those projects.
