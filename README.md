# ToMindMap

A mind mapping plugin for Obsidian Canvas. Type a topic, grow branches, and the auto-layout keeps the map readable — on your computer with the keyboard, on your phone with touch.

## Install (BRAT)

1. In Obsidian, install **BRAT** from the community plugin browser (works on desktop and mobile).
2. BRAT → **Add beta plugin for testing** → paste `TomSzenessy/Mindmap-Plugin-for-Obsidian` → Install.
3. Enable **ToMindMap** in Community plugins. Open any Canvas — mindmap mode is on by default.

Updates arrive the same way: BRAT → check for updates.

## Controls on the phone

Tap a topic to select it and a floating toolbar appears at the bottom: edit, add child, add sibling, more. Long-press a topic for the full menu (add parent, move up/down, delete branch or just the topic, copy link, collapse, color). Double-tap a topic to edit it. Drag a topic onto another to move it there — the whole branch follows. No keybinds, no hidden gestures.

On the computer nothing changes: Tab and Enter grow the map, arrows navigate, and every keybind keeps working. The touch toolbar is a setting away if you want it on or off on any device.

## Linked topics and nested maps

Right-click a text topic to create a title-named file, either **with subtree** or **without subtree**, or move the branch into a separate nested mind map. Generated cards show only their title, open the target on double-click, and remain ordinary Canvas file links so Obsidian can index them. A nested map remembers its immediate parent; editing its main title updates the parent linked card automatically. Right-click its main topic and choose **Go to parent node** to return there. For a generated card, choose **Expand linked content into mind map** to bring its nested Canvas or Markdown hierarchy back into the current map; if its target is missing, choose **Convert to normal topic** to restore only its title.

The export dialog includes **Include nested maps**. When enabled, linked nested maps are expanded into the exported map and placed in available space so cards do not overlap. **Collapse subtree** hides the full descendant branch and its connecting edges; **Expand subtree** restores it. Collapsed topics have a dashed outline and `＋` marker, nested-map links use a double border and `◈` marker, and file/branch links use a distinct document/link marker. All major actions are available in Obsidian’s **Settings → Hotkeys**; the plugin provides defaults for collapse/expand, file conversion, linked-card expansion, nested-map conversion, parent navigation, relayout, outline, colors, and mode switching.

## Compatibility

The release manifest declares Obsidian **1.5.0** as the minimum app version and declares the plugin mobile-capable. The source and release checks run with Node **20** on Linux; they do not replace a live Obsidian vault test on desktop or mobile. Canvas behavior depends on Obsidian Canvas and some non-public Canvas/runtime surfaces, so a future Obsidian release can require compatibility review.

| Area | Policy |
| --- | --- |
| Obsidian | Test the declared minimum and the current desktop/mobile versions in a real vault before broad distribution. |
| Desktop | Keyboard and pointer paths are the primary computer workflow; filesystem export delivery is used when the host exposes it. |
| Mobile | Touch controls and platform download are intended targets; live device delivery and private Canvas API behavior remain a release verification item. |
| Development | Node 20 or newer, with dependencies installed from `package-lock.json`. |

## Export policy

The export dialog offers **Markdown**, **SVG**, **PNG**, and **PDF**. Choose the whole mind map, the current viewport, or the current selection where the format supports a scope; Markdown always represents the complete hierarchy and does not include Canvas coordinates.

- **Markdown** preserves the readable topic hierarchy and branch order, without screen geometry or interaction state.
- **SVG** and **PNG** use the same export snapshot and selected area. PNG is a raster image; if rich card rendering is unavailable, the exporter falls back to a portable text-oriented SVG before rasterizing.
- **PDF** fits the selected export onto one aspect-matched page. It preserves supported SVG geometry and a text fallback; rich XHTML/`foreignObject` card interiors are not a pixel-identical PDF promise.
- **Include nested maps** recursively expands readable nested Canvas files in place. All roots and their relationships remain part of the snapshot; an unreadable or cyclic nested link stays a terminal linked card rather than being silently discarded.
- Vault-local images and attachments are the supported resource path for standalone exports. External `file:` paths are not read, and remote HTTP(S) resources are omitted; there is no user allowlist setting because browser DNS checks cannot prove public or non-rebinding safety. The release grants no additional network or filesystem permission.
- An export is a portable snapshot, not an interactive Canvas: collapse controls, editing handles, plugin-only decorations, and private Canvas APIs are not expected to survive the round trip.

## Releases and upgrades

A GitHub release is published only by a pushed numeric version tag (for example, `0.13.0`). The workflow verifies the exact tag commit, performs one checked build, and hands the same verified bytes to the publishing job. The ZIP has fixed entry order and metadata and is accompanied by `SHA256SUMS`; the release also includes `LICENSE` and the generated `THIRD_PARTY_NOTICES.txt`. Existing version releases are never repaired or overwritten by the workflow—if a release already exists, publication fails for manual review.

The distributed ZIP contains `manifest.json`, `main.js`, `styles.css`, `LICENSE`, and `THIRD_PARTY_NOTICES.txt`. It intentionally does **not** contain `data.json`: that file is runtime user data, not a release default. Keep an existing plugin `data.json` when upgrading manually so custom settings survive; a fresh installation gets defaults from the plugin source. Never extract a release archive over a plugin directory in a way that replaces `data.json`.

## Development

Runtime modules live in `lib/`, the plugin source in `src/main.js`; `npm run build` embeds the modules into the `main.js` distributable. `npm run check` verifies generated artifacts and runs the test suite (`node --test`). The release-only checks are also available directly:

```bash
node scripts/release-artifacts.js notices --check
node scripts/release-artifacts.js runtime-inventory --check
```

`THIRD_PARTY_NOTICES.txt` is generated from the locked packages represented in the shipped vector bundle; review its recorded labels and included license texts before redistribution. Tag CI additionally runs the real vector converter in a browser with a bounded timeout and retains its diagnostic PDF/log separately; `npm run check` remains the no-Chrome freshness and test check. MIT licensed.
