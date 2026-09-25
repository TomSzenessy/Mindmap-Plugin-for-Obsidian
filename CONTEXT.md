# ToMindMap domain

ToMindMap turns a visual topic hierarchy into navigable Obsidian files while keeping the Canvas graph as the source of structural relationships.

## Language

**Topic**: A text card in a mind-map Canvas whose first meaningful line is its display title.
_Avoid_: Node when the distinction from a linked file or group is not needed.

**Clean note**: An empty Markdown file whose basename is derived from a topic's title. A linked Canvas card represents it without adding a heading or body to the note.
_Avoid_: Converted file when the empty-content guarantee matters.

**Branch export note**: A single Markdown file named from the branch root that contains the exported hierarchy of that branch. It is different from a clean note because its body preserves the branch structure.
_Avoid_: Clean note when the Markdown hierarchy is present.

**Missing linked topic**: A generated file card whose target no longer exists. It remains a file card until the user explicitly chooses to restore it as a normal topic.
_Avoid_: Automatically recovered topic when the user has not chosen that action.

**Linked content expansion**: Replacing a generated file card with a normal topic and importing the hierarchy stored in its linked Canvas or Markdown branch while keeping the card's place in the current map. The replacement inherits that place and attachment; it does not detach imported descendants or absorb neighboring roots.
_Avoid_: Flattened link when the imported descendants must remain attached.

**Collapsed subtree**: A topic whose descendants and their connecting edges are hidden from the interactive Canvas without being removed from the saved hierarchy.
_Avoid_: Deleted branch when the underlying structure should remain recoverable.

**Nested mind map**: A separate Canvas file containing a moved topic and its descendants. It may have multiple root topics; its parent link identifies the map as a whole, and no root is discarded merely because the map is nested.
_Avoid_: Embedded map when the content is a separate file.

**Parent link**: The mutually consistent identity of an immediate parent Canvas and the exact linked card that represents a nested mind map. It is a one-level navigation relationship in which the parent card title follows the nested map's main title; it is not a Markdown body link, a backlink chain, or permission to synchronize an arbitrary file.
_Avoid_: Backlink chain when describing the stored relationship.

**Unowned parent link**: A parent-link claim whose parent Canvas and linked-card identity cannot be verified together. It grants no navigation or automatic file-I/O capability until the relationship is valid.
_Avoid_: Parent link when ownership is unproven.

**Include nested maps**: An export option that recursively substitutes readable linked nested Canvas content into one coherent exported map instead of treating the link as a terminal card. Every root in an included map remains represented; an unreadable or cyclic link remains a terminal card.
_Avoid_: Follow links when describing the export behavior.

**Export fidelity**: The format-specific promise that Markdown preserves the complete readable hierarchy, while SVG, PNG, and PDF preserve the selected area's supported geometry, card text, and resolvable vault assets. PDF uses vector SVG geometry and a text fallback rather than pixel-identical rich XHTML, and no export preserves interaction or plugin-only controls.
_Avoid_: Pixel-perfect export when describing a format projection.
