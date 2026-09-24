# ToMindMap domain

ToMindMap turns a visual topic hierarchy into navigable Obsidian files while keeping the Canvas graph as the source of structural relationships.

## Language

**Topic**: A text card in a mind-map Canvas whose first meaningful line is its display title.
_Avoid_: Node when the distinction from a linked file or group is not needed.

**Clean note**: An empty Markdown file whose basename is derived from a topic's title. A linked Canvas card represents it without adding a heading or body to the note.
_Avoid_: Converted file when the empty-content guarantee matters.

**Branch export note**: A single Markdown file named from the branch root that contains the exported hierarchy of that branch. It is different from a clean note because its body preserves the branch structure.
_Avoid_: Clean note when the Markdown hierarchy is present.

**Nested mind map**: A separate Canvas file containing a moved topic and its descendants. Its parent retains a title-only linked card at the original location.
_Avoid_: Embedded map when the content is a separate file.

**Parent link**: The immediate parent Canvas and linked-card identifier stored by a nested mind map. It is a one-level navigation relationship, not a Markdown body link.
_Avoid_: Backlink chain when describing the stored relationship.

**Include nested maps**: An export option that recursively substitutes linked nested Canvas content into the exported map instead of treating the link as a terminal card.
_Avoid_: Follow links when describing the export behavior.
