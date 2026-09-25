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

Right-click a text topic to create an empty, title-named Markdown note, export a whole branch as one title-named Markdown file containing its hierarchy, or move the branch into a separate nested mind map. Generated cards show only their title, open the target on double-click, and remain ordinary Canvas file links so Obsidian can index them. A nested map remembers its immediate parent; right-click its main topic and choose **Go to parent node** to return there. For a generated card, choose **Expand linked content into mind map** to bring its nested Canvas or Markdown hierarchy back into the current map; if its target is missing, choose **Convert to normal topic** to restore only its title.

The export dialog includes **Include nested maps**. When enabled, linked nested maps are expanded into the exported map and placed in available space so cards do not overlap. **Collapse subtree** hides the full descendant branch and its connecting edges; **Expand subtree** restores it. Collapsed topics have a dashed outline and `＋` marker, nested-map links use a double border and `◈` marker, and file/branch links use a distinct document/link marker.

## Development

Runtime modules live in `lib/`, the plugin source in `src/main.js`; `npm run build` embeds the modules into the `main.js` distributable. `npm run check` verifies the bundle is current and runs the test suite (`node --test`). Exports (SVG/PDF/PNG) run through a bundled vector pipeline; on devices without filesystem access they go to the platform download pipeline instead of `~/Downloads`.

MIT licensed.
