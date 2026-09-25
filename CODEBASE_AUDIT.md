# ToMindMap Whole-Repository Audit

**Audit date:** 2026-09-25
**Repository:** `TomSzenessy/Mindmap-Plugin-for-Obsidian`
**Local baseline:** `main` at `279fb4be33eafd8bcc5e7a89e554c96bc426d261` plus the user's uncommitted work
**Mode:** Report-only; no product implementation, build, dependency install, Git mutation, release mutation, or generated-file rewrite
**Runtime used for checks:** Node `v26.7.0`, npm `11.19.0`

> This report is the single consolidated source of truth for the audit. Temporary scoped reports were used for cross-checking and removed/ignored during synthesis. The threat model and security configuration are retained under `.security/`; per-run findings remain ignored audit output, not product code.

## Executive summary

The repository has a strong small-team foundation: a clear maintainable-source/generated-artifact split, focused CommonJS modules, cycle-safe graph construction, useful semantic layout tests, safe exclusive desktop export writes, and a healthy current test run. It is not yet release-hardened for untrusted shared content, long-lived concurrent editing, large maps, or immutable release provenance.

### Canonical result

| Priority | Baseline findings | Current-work integration risks | Total |
|---|---:|---:|---:|
| **P0** | 1 | 0 | **1** |
| **P1** | 26 | 0 | **26** |
| **P2** | 27 | 3 | **30** |
| **P3** | 6 | 0 | **6** |
| **Total** | **60** | **3** | **63** |

- **P0:** untrusted Canvas metadata can direct automatic Markdown synchronization at an unrelated existing vault file.
- **P1 themes:** data-loss races, non-transactional conversion, broken generated collapse dependency, lossy drag rollback, Markdown codec corruption, recursive/unbounded imports, export network/file/resource exposure, mobile export delivery, malformed rich SVG, nested-map export incoherence, release provenance, and settings overwrite through packaged `data.json`.
- **P2 themes:** architecture/source-of-truth drift, large-map repeated work, observer/session leaks, accessibility, test-surface mismatch, build/vector verification, documentation, and bounded media/export/sizing work.
- **P3 themes:** proven dead/legacy code and cleanup, runtime inventory drift, reduced motion, and legacy settings migration.

### Highest-risk shortlist

1. **Block unowned persisted links before any automatic I/O** — `AR-001`.
2. **Make Canvas and Markdown persistence conflict-safe** — `AR-003` through `AR-007`.
3. **Make conversion/media/import multi-artifact operations transactional** — `AR-008`, `AR-041`, `AR-042`.
4. **Fix the generated tree-model dependency before relying on the current collapse work** — `AR-002`.
5. **Constrain export resources and delivery** — `AR-020` through `AR-023`.
6. **Create one Markdown codec and one bounded import plan** — `AR-009` and `AR-010`.
7. **Use one canonical graph/gesture/session owner** — `AR-011` through `AR-019`, `AR-024`.
8. **Fail-closed release workflow and remove `data.json` from distribution** — `AR-026` and `AR-027`.
9. **Move behavior tests onto production interfaces and run the real vector converter** — `AR-053` and `AR-054`.
10. **Delete dead code only after the correct live seams are protected by tests** — `AR-060`.

## 1. Scope, baseline, and working-tree boundary

### 1.1 Repository identity and upstream freshness

Verified from authoritative GitHub sources on 2026-09-25:

- Local `HEAD`, local `origin/main`, and authoritative GitHub `main` all equal `279fb4be33eafd8bcc5e7a89e554c96bc426d261`.
- GitHub compare reports 0 ahead / 0 behind; there are no upstream commits after local HEAD.
- Latest tag/release is `0.12.5`, pointing at HEAD.
- The four individual `0.12.5` assets (`main.js`, `manifest.json`, `styles.css`, `data.json`) have SHA-256 digests matching committed HEAD, not the locally modified `main.js`.
- All nine public workflow runs for the current workflow history succeeded.
- GitHub has no open or closed issues, no open or closed PRs, and no milestones. Discussions are disabled.
- Local tag refs are stale: only `0.10.0` and `0.11.0`; upstream also has `0.12.0` through `0.12.5`.

Primary sources:

- [Repository metadata](https://api.github.com/repos/TomSzenessy/Mindmap-Plugin-for-Obsidian)
- [Authoritative main branch](https://api.github.com/repos/TomSzenessy/Mindmap-Plugin-for-Obsidian/branches/main)
- [HEAD comparison](https://api.github.com/repos/TomSzenessy/Mindmap-Plugin-for-Obsidian/compare/279fb4be33eafd8bcc5e7a89e554c96bc426d261...main)
- [Latest release](https://api.github.com/repos/TomSzenessy/Mindmap-Plugin-for-Obsidian/releases/latest)
- [Workflow runs](https://api.github.com/repos/TomSzenessy/Mindmap-Plugin-for-Obsidian/actions/runs?per_page=100)

### 1.2 User work preserved

The audit treated these as user-owned and did not overwrite them:

- Modified: `lib/keyboard-navigation.js`, `lib/tree-model.js`, `src/main.js`, generated `main.js`, `tests/tree-model.test.js`.
- Untracked before auditing: `tests/conversion-layout.test.js`.
- `AGENTS.md` was created at the user's explicit request before analysis and then followed for the rest of the task.

Aggregate tracked user diff at audit start: 139 insertions and 18 deletions, no staged changes. The current collapse/layout work is treated as an integration context, not as a baseline defect. Only `AR-028` through `AR-030` are attributed to interactions with that pending work.

### 1.3 Size and coverage profile

- Total relevant repository text/configuration inventory before audit outputs: approximately **116k lines**.
- `src/main.js`: **10,245 lines**.
- Maintainable `lib/` modules plus vector entry: approximately **7,914 lines**.
- Tests: **3,597 lines** across 18 working-tree test files.
- Generated `main.js`: **55,093 lines / 2,371,583 bytes**.
- Generated `lib/vector-pdf-bundle.js`: **36,956 lines / 1,717,905 bytes**.
- Generated/vendor output is about **79%** of the total line count and about **72%** of the release bundle's vector portion.

No maintainable source line was intentionally skipped. Generated and vendored lines were covered mechanically through provenance markers, module boundaries, source mapping, composition, require/import searches, security-sensitive ranges, parity checks, and executable probes—not by pretending to hand-interpret every vendored line.

## 2. Method and verification

The audit used:

- One upstream GitHub/release researcher.
- Twelve domain auditors covering entry/outline, Markdown core, export, lifecycle, sync/conversion, media/interactions, graph/navigation, content/actions, UI/sizing, tests, build/docs, and security.
- Six adversarial consolidation passes covering correctness/security, performance/scale, architecture/dead code, tests/build/docs, UI/accessibility, and final falsification.
- Direct `read`, `grep`, and `glob` inspection; read-only Git commands; GitHub primary APIs; and non-destructive in-memory probes.
- `npm test`: **149/149 passed** on the current working tree, including the untracked conversion-layout test.
- `node scripts/inline-runtime-modules.js --check`: registered runtime modules are currently embedded in `main.js`.
- `node --check main.js` and `node test-load.js`: syntax passed; generated plugin load printed `onload success`.
- `npm audit --json`: **0 known vulnerabilities** at audit time.
- Security JSON and count invariants validated with `jq`.

No build was run, as requested. No live Obsidian desktop/mobile vault, browser export consumer, or destructive vault exploit was used.

## 3. Architecture and maintainability map

### 3.1 Current module shape

| Area | Main files | Current responsibility |
|---|---|---|
| Plugin composition | `src/main.js` | Commands, settings UI, Canvas lifecycle, events, menus, protocol, conversions, sync orchestration, export orchestration |
| Graph | `lib/tree-model.js`, `lib/canvas-api.js`, `lib/node-operations.js`, `lib/keyboard-navigation.js` | Forest construction, Canvas mutation, selection/navigation, node actions |
| Layout/drag | `lib/layout.js`, `lib/tree-drag.js`, `lib/drag-preview-controller.js`, `lib/drag-attachment.js` | Geometry, side balancing, attachment, preview/commit/cancel |
| Markdown | source range `src/main.js:1569-3498`, `lib/markdown-order.js`, `lib/clipboard-markdown.js` | Parse, serialize, identify, reconcile, source-preserve, reorder, clipboard normalization |
| Sync/conversion | `src/main.js:6083-8064`, `lib/mindmap-actions.js`, `lib/canvas-session.js` | Linked files, clean notes, nested maps, save/reflow/prune lifecycle |
| Sizing/UI | `lib/live-sizing.js`, `lib/touch-controls.js`, `styles.css` | Measurement, observers, gestures, toolbar, visual states |
| Media | `lib/media-drop.js`, source range `src/main.js:8065-9500` | URL/file classification, dropped/picked media, missing-media state |
| Export | `lib/export.js`, `lib/vector-pdf-entry.js`, generated vector bundle, source range `src/main.js:3499-4080` | Snapshot, SVG/PNG/PDF, asset policy, delivery |
| Build | `scripts/runtime-modules.js`, `scripts/inline-runtime-modules.js`, `scripts/extract-main-source.js` | Module registry, generated `main.js`, source extraction |
| Tests | `tests/*.test.js`, `test-load.js` | Pure modules, selected generated behavior, smoke load |

### 3.2 Architectural diagnosis

The code has useful deep modules (`tree-model`, `drag-preview-controller`, `live-sizing` in parts, `markdown-order`, focused settings normalization), but important behavior still crosses too many interfaces:

- Canonical hierarchy is rebuilt or bypassed in mutation, navigation, layout, group bounds, and linked import.
- Markdown syntax, resource interpretation, identity, source preservation, sync, and export are split across a 1,930-line source cluster plus injected callbacks.
- One plugin class owns settings, lifecycle, Canvas mutation, Markdown sync, conversions, media, export, and UI.
- Input state is attached at leaf-change time but not centrally reconfigured/disposed.
- Tests sometimes cross private/generated seams instead of the same interfaces production uses.

The correct response is **fewer deep modules with clearer ownership**, not more pass-through services or speculative adapters.

## 4. Priority index

| ID | Priority | Confidence | Area | Finding |
|---|---|---|---|---|
| AR-001 | P0 | High | Security/data | Untrusted persisted links are treated as owned vault capabilities |
| AR-002 | P1 | High | Generated release | Generated release loses the tree-model dependency for collapse sync |
| AR-003 | P1 | High | Persistence | Canvas teardown can overwrite a newer Canvas file |
| AR-004 | P1 | High | Markdown sync | Parse failure is applied as an authoritative empty graph |
| AR-005 | P1 | High | Editing/sync | Markdown-to-Canvas can replace an active topic edit |
| AR-006 | P1 | High | Sync lifecycle | Sync uses split, unserialized timer/write/detach state machines |
| AR-007 | P1 | High | Rename migration | Closed-Canvas parent migration is a read/modify race |
| AR-008 | P1 | High | Conversion | Conversions remove the source before replacement commit |
| AR-009 | P1 | High | Markdown | Codec is not syntax-aware and is not an inverse of its output |
| AR-010 | P1 | High | Scale/import | Deep-map contract stops at forest construction; decode is unbounded/superlinear |
| AR-011 | P1 | High | Graph | Mutations bypass the canonical forest and can move/delete an ancestor |
| AR-012 | P1 | High | Drag performance | Drag preview repeats descendant discovery every frame |
| AR-013 | P1 | High | Input/lifecycle | Drag claims ineligible gestures and lacks terminal cancellation |
| AR-014 | P1 | High | Touch | Cancel/multitouch events can commit the wrong gesture |
| AR-015 | P1 | High | Settings/mode | Live Canvas actions are not reconfigured or eligibility-guarded |
| AR-016 | P1 | High | Decoration | Mode-disable/unload do not restore plugin-owned presentation |
| AR-017 | P1 | High | Collapse/layout | Structural attach/detach paths omit collapse postconditions |
| AR-018 | P1 | High | Navigation | Arrow navigation can select a collapsed-hidden topic |
| AR-019 | P1 | High | Drag/data | Drag begin/cancel/commit discards authored edge metadata |
| AR-020 | P1 | High | Export/security | Asset resolution trusts sources and has no export-wide budget |
| AR-021 | P1 | High | Mobile export | Mobile branch is selected by invalid loader-syntax capability test |
| AR-022 | P1 | High | Export/XML | HTML `outerHTML` makes rich SVG/XML malformed |
| AR-023 | P1 | High | Nested export | Nested export returns an incoherent half-Canvas model |
| AR-024 | P1 | High | Lifecycle | Teardown snapshots a drag preview before restoring permanent graph |
| AR-025 | P1 | High | Sizing | Unavailable exact sizing is recorded as successful migration |
| AR-026 | P1 | High | Release | Publication is not fail-closed, immutable, or tied to one artifact/SHA |
| AR-027 | P1 | High | Settings/release | Packaged `data.json` can overwrite user settings and conflicts with defaults |
| AR-028 | P2 | High | Current work | Enabling mode does not synchronize persisted collapse decoration |
| AR-029 | P2 | High | Current work | Preserved root sides expose an imbalanced insertion rule |
| AR-030 | P2 | High | Current work | Mutation observer performs full graph work per child-list burst |
| AR-031 | P2 | High | Outline | Outline lacks a session model and rebuilds all DOM/listeners |
| AR-032 | P2 | High | Accessibility | Outline/media/mode controls are not platform-native accessible controls |
| AR-033 | P2 | High | Robustness | Outline trusts malformed Canvas group metadata |
| AR-034 | P2 | High | Clipboard | Copy actions report success before async write succeeds |
| AR-035 | P2 | High | Settings | Settings UI duplicates and weakens the normalizer |
| AR-036 | P2 | High | Resources | Resource interpretation is fragmented across decode/rebase/class/size |
| AR-037 | P2 | High | Reconciliation | Text↔media reconciliation keeps wrong dimensions |
| AR-038 | P2 | High | Startup/fan-out | Sync indexing/fan-out are unbounded and not failure-isolated |
| AR-039 | P2 | High | Filenames | Generated filenames violate cross-platform portability |
| AR-040 | P2 | High | Linked import | Linked Canvas import accepts invalid IDs/endpoints and assumes one root |
| AR-041 | P2 | High | Media import | Media import is unbounded, non-transactional, and stale after teardown |
| AR-042 | P2 | High | Import | FreeMind/Markdown creation lacks a complete awaited transaction |
| AR-043 | P2 | High | Sizing/lifecycle | Sizing/deferred effects are global instead of per-Canvas sessions |
| AR-044 | P2 | High | Performance | Hot paths repeatedly rebuild/sort/traverse/reflow the whole graph |
| AR-045 | P2 | High | Media state | Media-drop/missing-media state is incomplete and can target stale content |
| AR-046 | P2 | High | Layout contracts | Layout/collapse/color entry points violate shared transaction contracts |
| AR-047 | P2 | High | Placement | Collision search can knowingly return an occupied slot |
| AR-048 | P2 | High | Markdown UI | Rich checkbox mapping uses incomplete render-order/regex assumptions |
| AR-049 | P2 | Medium | Export | Export projections lose graph/card semantics and format promises |
| AR-050 | P2 | High | Export/performance | Snapshot and rasterization have no total work/pixel budget |
| AR-051 | P2 | High | Sizing/performance | Off-screen sizing retains all content and uses quadratic fallback estimation |
| AR-052 | P2 | High | Build | Build contains legacy rewrites and drifting extraction metadata |
| AR-053 | P2 | High | Build/test/size | Vector artifact lacks freshness, real-converter, toolchain, and size gates |
| AR-054 | P2 | High | Tests | Tests validate secondary generated/private/test-only surfaces |
| AR-055 | P2 | Medium | Security/UI | URL and standalone-artifact sanitization is incomplete |
| AR-056 | P2 | High | Pruning | Blank-leaf pruning stops after arbitrary 50 passes |
| AR-057 | P2 | High | License | Release artifacts omit project license and complete third-party notices |
| AR-058 | P3 | High | Lifecycle polish | Canceled group animation can strand a transition class |
| AR-059 | P3 | High | Export cleanup | Browser-download URL cleanup is not protected by `finally` |
| AR-060 | P3 | High | Dead code | Definite dead code and test-only compatibility surface remain |
| AR-061 | P3 | High | Docs/provenance | Runtime and provenance docs are not derived from the registry |
| AR-062 | P3 | High | Accessibility | Motion ignores reduced-motion preference |
| AR-063 | P3 | High | Settings migration | Legacy sizing migration checks raw values before normalization |

## 5. Detailed findings

## P0 — release blocker

### AR-001 — Untrusted persisted links are treated as owned vault capabilities

- **Evidence:** `src/main.js:4453-4460`, `src/main.js:5950-5969`, `src/main.js:6616-6677`, `src/main.js:6763-6912`, `src/main.js:6985-7075`, `src/main.js:7224-7245`, `src/main.js:9018-9065`.
- **Trigger:** Opening a shared `.canvas` with `mindmapMarkdownSync.path` naming an older existing vault file is enough. After the mtime branch, the plugin can replace that target with structural Markdown. Reverse sync can also treat a non-Markdown target as Markdown. A forged parent path needs a later title edit but can patch an unrelated record.
- **Impact:** Arbitrary in-vault file tampering from untrusted content, with potential loss of notes/configuration. This is the only P0.
- **Recommendation:** One deep `OwnedVaultLink` interface must require a canonical vault-relative Markdown `TFile` and matching unpredictable ownership token before automatic I/O. Parent links additionally require `.canvas` schema plus a marked nested-map card. Invalid/unowned links detach without touching the target. Existing links migrate only after explicit confirmation.
- **Effort/sequence:** M; first fix, shared by sync, parent navigation, title sync, rename, startup index, and delete handling.
- **Validation:** Disposable-vault tests for `.md`, `.canvas`, JSON, traversal, missing file, token mismatch, renamed extension, and parent mismatch. Rejected paths must cause zero target reads/writes.

## P1 — correctness, data integrity, security, and major scale

### AR-002 — Generated release loses the tree-model dependency

- **Evidence:** `lib/mindmap-actions.js:3-12`, `lib/mindmap-actions.js:234-281`, `scripts/inline-runtime-modules.js:23-35`, generated `main.js:44409-44418`, `main.js:44640-44650`.
- **Impact:** The conditional relative `require('./tree-model.js')` survives embedding and fails in the three-file release. `syncCollapsedVisibility()` returns without hiding descendant cards/edges while layout can still consume persisted collapse data. Source tests and startup load can remain green.
- **Recommendation:** Replace it with an ordinary registered static import. Keep the existing `MindmapActions` interface; do not add a fallback adapter.
- **Effort/validation:** S; add a generated restricted-loader test that toggles/reopens a persisted collapsed subtree and proves descendant/edge presentation.

### AR-003 — Canvas teardown can overwrite a newer Canvas file

- **Evidence:** `lib/canvas-session.js:11-24`, `src/main.js:5052-5065`, `src/main.js:5183-5203`.
- **Impact:** The fallback snapshots, awaits `view.save()`, then unconditionally returns the snapshot if file text differs. A second window or sync client can be overwritten with stale data.
- **Recommendation:** Make native `view.save()` authoritative. Retain a vault fallback only when a fresh post-save comparison proves the pending state belongs to this plugin.
- **Validation:** Deferred save/process promises with a newer valid graph inserted between them; newer content must survive.

### AR-004 — Parse failure becomes an authoritative empty graph

- **Evidence:** `src/main.js:2392-2405`, `src/main.js:2795-2799`, `src/main.js:6985-7075`, `src/main.js:2866-2970`.
- **Impact:** An unclosed frontmatter/plugin block can delete topics, edges, and identity metadata automatically.
- **Recommendation:** Typed `{ok:true,value}` / `{ok:false,reason}` decode results. Only explicit validated emptiness may clear a graph.
- **Validation:** Malformed frontmatter/plugin block plus valid empty and valid documents; failure must not call `setData`/`vault.process`.

### AR-005 — Markdown-to-Canvas can replace an active edit

- **Evidence:** Forward write guard `src/main.js:6775-6779`; unguarded reverse apply `src/main.js:7077-7125`.
- **Impact:** A sync-client Markdown change during editing replaces the editor and saves the replacement, losing in-progress text.
- **Recommendation:** Retain the pending Markdown generation when any topic is editing; apply after edit exit or present a conflict if revisions still differ.
- **Effort/validation:** S–M; one focused editing-state regression.

### AR-006 — Split sync timer/write/detach state machines

- **Evidence:** `src/main.js:6679-6719`, `6740-6761`, `6911-6913`, `6962-6974`, `7224-7245`, unload timer clearing `src/main.js:5067-5068`.
- **Impact:** Old/new writes can finish out of order; conflicts have no retry; detach/rename can be undone by in-flight work; unload drops the last debounce window.
- **Recommendation:** One per-path coordinator with `schedule`, `flush`, `detach`, `rename`, and `dispose/flushAll`; one promise chain/generation per link, newest-state coalescing, and fresh compare-and-set retry.
- **Validation:** Deferred writes in both completion orders, two Canvases/one Markdown path, detach/rename before resolution, unload inside 350 ms.

### AR-007 — Closed-Canvas rename migration is not atomic

- **Evidence:** `src/main.js:7192-7222` uses `cachedRead` then `vault.modify`; `7224-7245` republishes index state before migrations finish.
- **Impact:** Concurrent Canvas edits can be overwritten, and one migration failure can leave disk/index inconsistent.
- **Recommendation:** Patch inside `vault.process`, validate the old link atomically, and publish index entries only for successful generations.
- **Validation:** Race a valid Canvas edit between read and migration; inject one failure and verify unrelated edits and index consistency.

### AR-008 — Conversion removes the source before replacement commit

- **Evidence:** `src/main.js:7253-7395`, `7476-7723`; removal precedes fallible layout/color/decoration/save, while catches delete new artifacts without restoring originals.
- **Impact:** A late failure can persist the destructive half and delete the only branch export. Linked expansion can leak a fallback root.
- **Recommendation:** One transaction interface with `prepare/commit/rollback`: verify replacement first, snapshot source graph/boundary edges, delete the last source representation only after replacement save, and preserve recovery files if restoration itself fails.
- **Validation:** Fault-inject after every destructive/save step for all four conversion variants.

### AR-009 — Markdown codec is not syntax-aware or inverse

- **Evidence:** Multiline emission/parser `src/main.js:2176-2240`, `2593-2617`; raw regex rewrites `1811-1823`, `2011-2017`, `2077-2102`, `2972-2991`, `3459-3497`; heading/shape cleanup `2196-2304`; clipboard gate `lib/clipboard-markdown.js:3-25`.
- **Impact:** `Title\nBody` can become two topics; code/comments can be rewritten/deleted; `C#` and `array[0]` can be truncated; valid Clipboard blocks can flatten; duplicate anchors can fail.
- **Recommendation:** One embedded `MarkdownMindMapCodec` interface: `parse`, `serialize`, `planPreservingUpdate`. Syntax classification, metadata, resources, identity, and ordering stay internal. Add conformance tests before moving implementation.
- **Validation:** Round-trip full node text/IDs; byte-preserve code/comments; retain Mermaid hierarchy; cover duplicate/encoded anchors and all block forms.

### AR-010 — Deep-map guarantee stops at forest construction

- **Evidence:** Recursive layout `lib/layout.js:362-430`; collapse `lib/mindmap-actions.js:234-274`; ordering `lib/markdown-order.js:70-109`; parser/layout `src/main.js:2148-2805`; outline `src/main.js:836-843`, `1145-1228`; unbounded import `3504-3537`, `7874-8046`; quadratic matching/reparse `src/main.js:2642-2828`, `lib/markdown-order.js:152-264`.
- **Impact:** Valid deep maps overflow later stages; large/stale metadata and repeated reparse block the UI; malformed input can fail without controlled recovery.
- **Recommendation:** Iterative traversal/post-order everywhere plus a bounded typed import plan with byte/topic/depth limits and one source index.
- **Validation:** 12,000-level chain/wide through import/layout/collapse/outline/order; 5k/10k stale-metadata fixtures; no `RangeError`, bounded operations, controlled rejection.

### AR-011 — Structural mutations bypass canonical hierarchy

- **Evidence:** Canonical forest `lib/tree-model.js:104-115`; raw-edge delete/flip `lib/node-operations.js:210-285`, `lib/canvas-api.js:273-276`; local BFS `src/main.js:5997-6012`, `8408-8428`.
- **Impact:** In a cycle/surplus-parent graph, deleting/resizing/flipping a canonical child can delete or move its rejected ancestor.
- **Recommendation:** One revisioned graph query interface (`parentOf`, `childrenOf`, `descendantsOf`, visible projection). Remove duplicate raw traversal after migration.
- **Validation:** Cycle, surplus-parent, and duplicate-edge fixtures across delete/flip/drag/resize/focus; one linear index for affected-branch reflow.

### AR-012 — Drag preview is quadratic per animation frame

- **Evidence:** `lib/drag-preview-controller.js:119-198`, `lib/tree-drag.js:122-149`, `src/main.js:8496-8580`.
- **Impact:** Every candidate repeats forest and descendant discovery. A prior 2,000-topic in-memory probe took about 320 ms before DOM work.
- **Recommendation:** Build one descendant-ID set and immutable geometry index at `begin`; keep `begin/updatePreview/commit/cancel` as the interface and make per-frame selection linear.
- **Validation:** 5,000-node operation-count test and randomized equivalence.

### AR-013 — Drag owns ineligible gestures and lacks one terminal path

- **Evidence:** Selection eligibility `src/main.js:5320-5346`; reparent pointerdown `8335-8380`; group drag `555-599`, `5460-5487`; finalization/cleanup `8583-8633`, `8913-8966`.
- **Impact:** Right/middle/connection-point gestures can fight native Canvas. OS cancel, blur, or release outside can leave wrappers, classes, listeners, and stale async finalizers.
- **Recommendation:** One primary-card gesture predicate and one idempotent session `finish(reason)` for commit/cancel/lost capture/blur/mode/teardown.
- **Validation:** Synthetic pointer matrix; assert only owned gestures mutate and every terminal path cleans fully.

### AR-014 — Touch cancel and multitouch can commit the wrong gesture

- **Evidence:** `lib/touch-controls.js:13-89`, `253-302`.
- **Impact:** A canceled touch can open edit on the next tap; a second finger can replace the active target and later finish the wrong gesture.
- **Recommendation:** Track one `pointerId`; ignore secondary pointers; true cancel clears timer and double-tap memory.
- **Validation:** Canceled-first-tap/second-tap and simultaneous pointer IDs.

### AR-015 — Settings/mode changes do not reconfigure or guard live actions

- **Evidence:** Attach-time-only touch/mouse `src/main.js:5372-5400`, `5733-5757`; `saveSettings` `10219-10243`; mode-off `10017-10049`; missing common guards `4287-4319`, `lib/live-sizing.js:542-604`, `lib/touch-controls.js:316-344`.
- **Impact:** Settings take effect only after a leaf switch; stale touch controls can mutate ordinary Canvas files after mode-off.
- **Recommendation:** `syncCanvasBindings(canvas)` plus one `runMindMapAction` eligibility check. Reconfigure only affected adapters and guard every command/touch/sizing path.
- **Validation:** Toggle every relevant setting/mode in both directions without leaf switch; listener counts exactly 0↔1 and ordinary Canvas unchanged.

### AR-016 — Mode-disable/unload do not restore presentation

- **Evidence:** Collapse writes classes/inline edge display `lib/mindmap-actions.js:218-281`; teardown `src/main.js:5052-5276`; mode-off `10017-10049`.
- **Impact:** In source execution, disabled mode/plugin can leave hidden descendants/edges in ordinary Canvas. Persisted collapse data should remain, but presentation must reverse.
- **Recommendation:** One Canvas-decoration disposer that removes only plugin-owned classes/attributes/inline styles and selection state.
- **Validation:** Disable/reload collapsed and expanded trees; native nodes/edges visible, serialized collapse unchanged.

### AR-017 — Structural attach/detach omits collapse postconditions

- **Evidence:** Detach/separate/connect paths `src/main.js:4261-4284`, `4744-4808`, `5460-5579`, `9344-9376`.
- **Impact:** Detached children can remain hidden/omitted from layout; newly attached children can remain visible under a collapsed parent.
- **Recommendation:** One structural mutation postcondition: edge change → collapse/visible roots → order dirty → affected roots → one layout.
- **Validation:** Attach/detach/reparent under expanded/collapsed parents; compare classes, edges, geometry, visible forest, and order.

### AR-018 — Arrow navigation can select collapsed-hidden topics

- **Evidence:** Hidden marking `lib/mindmap-actions.js:244-280`; raw spatial candidates `lib/keyboard-navigation.js:954-1115`.
- **Impact:** Invisible cards can be selected/revealed, making navigation appear stuck.
- **Recommendation:** Navigation consumes the same visible-forest projection as layout/collapse; floating-card policy remains explicit.
- **Validation:** Navigate from all visible neighbors while collapsed; descendants return only after expansion.

### AR-019 — Drag discards authored edge metadata

- **Evidence:** Reduced snapshot `lib/drag-preview-controller.js:33-40`; default recreation `59-75`; commit replacement `254-305`.
- **Impact:** Labels, IDs, end styles, curvature, and line type can disappear on cancel or commit.
- **Recommendation:** Lossless full-edge snapshot/restore at the Canvas edge seam; preserve ID when supported, otherwise every serialized user-visible property.
- **Validation:** Cancel, failed preview, same/cross-parent commit, multi-parent repair with full edge fixtures.

### AR-020 — Export asset policy has no authorization or export-wide budget

- **Evidence:** `lib/export.js:237-339`, `src/main.js:9924-9954`, `lib/vector-pdf-entry.js:16-22`.
- **Impact:** Arbitrary HTTP(S) requests occur. If `file:` references survive rendering, an implicit filesystem fallback can embed local bytes. Many/slow/large assets can hang or exhaust memory.
- **Recommendation:** One `ExportAssetResolver` policy: vault-only default; explicit remote approval/allowlist; reject private/loopback/link-local/user-info/unsafe redirects; remove implicit external-file read; bound concurrency, streamed per-resource and aggregate bytes, time, and output.
- **Qualification:** Request and unbounded buffering are confirmed. End-to-end local-file disclosure still needs a live renderer test.
- **Validation:** Resolver spies for forbidden hosts/files, redirects, oversize, slow peer, cancellation, and peak concurrency.

### AR-021 — Mobile export branch uses an invalid capability test

- **Evidence:** CommonJS plugin `src/main.js:36`; `lib/export.js:397-428`; mobile declaration `manifest.json:8`.
- **Impact:** A loaded plugin necessarily has `require`; on mobile without Node `fs/path/os`, every export can render expensively and then fail in the desktop branch.
- **Recommendation:** Real two-adapter delivery interface—desktop filesystem and platform/browser download—selected by explicit Obsidian platform/capability information, not loader syntax.
- **Validation:** Callable `require` with unavailable `fs`, desktop collision tests, and current iOS/Android exports.

### AR-022 — Rich HTML serialization makes SVG/XML malformed

- **Evidence:** `src/main.js:3607-3650`, `3860-3888`; strict parse `lib/vector-pdf-entry.js:8-15`; PNG loader `lib/export.js:342-386`.
- **Impact:** Normal void elements such as `img`, `br`, and `input` serialize unclosed in XHTML, causing SVG/PNG/PDF parse failure.
- **Recommendation:** XML-safe serialization is part of the printable snapshot; sanitize, use `XMLSerializer`, and parse the completed canonical SVG once.
- **Validation:** Checkbox/image/br/table/KaTeX fixture in SVG, PNG, and real PDF.

### AR-023 — Nested-map export returns an incoherent half-Canvas

- **Evidence:** Expanded data/edges `src/main.js:9473-9770`; synthetic `edges: new Map()` while data has edges; only first root replaced `9646-9667`; raw type/file/url/body discarded `9747-9769`.
- **Impact:** Markdown hierarchy can flatten; later roots disconnect; links/body semantics disappear.
- **Recommendation:** One coherent export snapshot/plan with graph, raw content, geometry, and zero-to-many endpoint replacement semantics.
- **Validation:** Two-root nested Canvas with parent, sibling, child, and file card across Markdown/SVG/PDF.

### AR-024 — Teardown snapshots preview state before gesture cleanup

- **Evidence:** Flush first `src/main.js:5052-5065`, `5183-5204`; preview already removed permanent edge `lib/drag-preview-controller.js:43-75`; restore only on cancel/cleanup `226-251`, `322-325`.
- **Impact:** Switching/unloading mid-drag can save preview endpoint/marker or omit original parent.
- **Recommendation:** Enforce lifecycle order: stop input → restore permanent graph → settle work → snapshot/save → unwrap.
- **Validation:** Switch/unload during active preview; saved graph equals pre-drag permanent graph.

### AR-025 — Unavailable sizing is recorded as successful exact migration

- **Evidence:** Empty maps for unavailable conditions `src/main.js:6136-6527`; treated as success `lib/live-sizing.js:590-604`.
- **Impact:** Virtualization/renderer failure can persist heuristic dimensions and remove pending IDs, preventing later exact correction.
- **Recommendation:** Typed `measured | unavailable | cancelled`; preserve pending/version on unavailable.
- **Validation:** No DOM/renderer/calibration/thrown render/valid-empty cases.

### AR-026 — Release publication is not fail-closed or artifact-bound

- **Evidence:** `verify-release.yml:15-17`, `24-54`, `64-80`, `82-94`, `96-128`.
- **Impact:** Automatic tags omit an explicit target; cancellation plus missing-name repair can mix commits; verify and write jobs build independently; ZIP metadata is nondeterministic.
- **Recommendation:** Tag-push publication only, exact tag checkout/SHA verification, one verified artifact handoff with hashes, never mutate an existing version, deterministic archive metadata.
- **Counter-evidence:** Current `0.12.5` assets match HEAD. This is a future workflow risk, not evidence that the current release is already mixed.
- **Validation:** Advance main during a run, cancel between uploads, tamper with same-name asset, and force artifact divergence.

### AR-027 — Packaged `data.json` can overwrite settings and conflicts with defaults

- **Evidence:** `verify-release.yml:82-104`; `data.json:1-19`; defaults `lib/settings.js:3-22`; BRAT consumes only three standard files.
- **Impact:** Manual ZIP extraction can replace user settings; different installation paths observe 10× different maximum dimensions.
- **Recommendation:** Remove `data.json` from distributables and make `DEFAULT_SETTINGS` the sole source. Never delete/overwrite an existing user plugin `data.json` during upgrade.
- **Validation:** Existing custom settings survive simulated BRAT update and manual extraction; fresh defaults match source.

## P2 — meaningful debt, scale, robustness, and maintainability

### AR-028 — Enabling mode does not synchronize persisted collapse decoration

- **Evidence/current-work boundary:** Current `lib/tree-model.js:139-166` plus unchanged `src/main.js:10017-10049`.
- **Impact:** An inactive Canvas can have visible descendants omitted from layout, causing overlap on enable.
- **Action/validation:** Synchronize collapse before sizing/layout; test inactive persisted-collapse mode enable.

### AR-029 — Preserved root sides expose imbalanced insertion

- **Evidence/current-work boundary:** `lib/node-operations.js:16-30`; current `lib/keyboard-navigation.js:938-953`.
- **Impact:** After one right child, later insertions go left and preserved-side layout makes that imbalance final.
- **Action/validation:** Reuse `countChildrenPerSide`; test three children from empty and one-right-child states plus explicit overrides.

### AR-030 — Current observer performs full graph work per mutation burst

- **Evidence/current-work boundary:** Current `src/main.js:5875-5905`; `lib/mindmap-actions.js:234-281`.
- **Impact:** Virtualization, iframe, and preview mutations can cause O((N+E) × bursts) work.
- **Action/validation:** One tracked RAF, dirty IDs, topology/collapse full pass only when needed; 1k/5k burst fixtures.

### AR-031 — Outline lacks a session-owned model

- **Evidence:** `src/main.js:817-987`, `992-1230`, untracked timers `1323-1393`, `1481-1535`, save refresh `4132-4142`, `5814-5819`.
- **Impact:** Stale cross-Canvas state, detached callbacks, O(N) DOM/listener rebuild, recursive overflow.
- **Action/validation:** Validated outline model + iterative visible-branch renderer + session timer/listener registry; Canvas A→B, empty forest, refresh during drag, 12k nodes.

### AR-032 — Core controls lack native accessibility semantics

- **Evidence:** Outline `div`s `src/main.js:741-750`, `996-1021`, `1149-1194`, `1336-1400`; missing media `9453-9470`; toggle `10050-10135`; macOS Ctrl-only selection `1062-1071`.
- **Impact:** Keyboard/screen-reader users cannot reliably operate outline/mode/collapse/error affordances; macOS root multi-select differs from `Mod`; secondary pointer toggles mode.
- **Action/validation:** Real tree interface/native buttons, ARIA state, keyboard activation, accessible missing-media description, Ctrl/Meta platform tests.

### AR-033 — Outline trusts malformed Canvas group metadata

- **Evidence:** `src/main.js:851-860`, `1503-1507`; `lib/tree-model.js:3-9`.
- **Impact:** Non-string labels/non-array nodes can throw after old DOM is cleared.
- **Action/validation:** Build/validate a safe model before replacing DOM; malformed fixture preserves prior view.

### AR-034 — Clipboard success is reported before write succeeds

- **Evidence:** `src/main.js:1092-1114`, `1195-1218`, `4607-4627`.
- **Impact:** Missing/denied Clipboard API yields false success/unhandled rejection.
- **Action/validation:** One awaited adapter with fallback; missing/reject/success tests.

### AR-035 — Settings UI duplicates normalizer rules

- **Evidence:** UI `src/main.js:118-120`, `181-390`; `lib/settings.js:24-78`.
- **Impact:** UI can display values later silently normalized; rules can drift.
- **Action/validation:** Field descriptors/one binder; decimal/exponent/malformed/range table for every field.

### AR-036 — Resource interpretation has multiple sources of truth

- **Evidence:** `src/main.js:1594-1607`, `2307-2335`, `7268-7287`, `7761-7790`, `9234-9326`; `lib/media-drop.js:3-123`; `lib/live-sizing.js:32-58`.
- **Impact:** Encoded paths, case, fragments, moved notes, long extensions, `.oga`, and configured bounds fail inconsistently.
- **Action/validation:** Typed resource result plus shared `fitCardSize`; source-aware vault resolution and unresolved state.

### AR-037 — Text↔media reconciliation retains wrong dimensions

- **Evidence:** `src/main.js:2882-2920`, `7115-7150`; test only media→media `tests/markdown-sibling-sync.test.js:548-588`.
- **Impact:** Text↔file/link transitions keep old geometry and suppress resize.
- **Action/validation:** Compare content kinds; full transition matrix.

### AR-038 — Startup index/fan-out are unbounded and failure-coupled

- **Evidence:** `src/main.js:6639-6677`, `6985-7075`.
- **Impact:** Large vault I/O/memory spike; one failed link prevents later links and metadata commit.
- **Action/validation:** Bounded bidirectional index and per-link result aggregation; 5k Canvases and first-link failure test.

### AR-039 — Generated filenames are not truly portable

- **Evidence:** `lib/mindmap-actions.js:61-101`; separate `lib/canvas-session.js:155-184`; callers `7417-7425`, `7656-7668`, `9074-9107`.
- **Impact:** Emoji/Han byte overflow, surrogate splits, reserved `CON`/`NUL`, inconsistent decorated titles.
- **Action/validation:** One filename allocator with UTF-8 bytes, grapheme boundaries, reserved stems, collisions.

### AR-040 — Linked Canvas import accepts invalid graphs

- **Evidence:** `lib/mindmap-actions.js:125-183`; caller `src/main.js:7269-7327`.
- **Impact:** Missing/duplicate IDs, dangling edges, and extra roots can partially import before the source card is removed.
- **Action/validation:** Linked-graph decoder with unique IDs/endpoints/root policy and isolated verification before commit.

### AR-041 — Media import is unbounded/non-transactional

- **Evidence:** `src/main.js:9140-9232`; unawaited callers `8304-8310`, `9118-9138`.
- **Impact:** Large batches pressure memory/storage; failures orphan files; old Canvas/topic can mutate after teardown.
- **Action/validation:** `MediaImportTransaction` with preflight, created-file tracking, generation checks, rollback, partial result.

### AR-042 — FreeMind/Markdown creation lacks a complete awaited transaction

- **Evidence:** `lib/freemind.js:22-153`; `src/main.js:7787-7808`, `9960-10004`.
- **Impact:** Deep/repeated FreeMind work, unhandled read/create/open failures, orphan Canvases/index entries.
- **Action/validation:** Iterative measured-once FreeMind plus one awaited read→convert→create→metadata→open transaction.

### AR-043 — Sizing/deferred effects are not per-Canvas sessions

- **Evidence:** Global queue/watch `lib/live-sizing.js:61-67`, `547-571`; active-canvas dependency `429-431`; stale records `660-875`; raw edit/camera effects `lib/canvas-api.js:337-401`.
- **Impact:** Background Canvases cancel each other; old callbacks fire after switch/unload; observers retain replaced DOM.
- **Action/validation:** Per-Canvas sizing/session context, tracked scheduler, delete records on missing/replacement; two-Canvas and repeated iframe tests.

### AR-044 — Hot paths repeatedly rebuild/sort/traverse/reflow

- **Evidence:** Selection O(N²) group scans `src/main.js:5420-5437`; group bounds `5997-6080`; duplicate reflow `5681-5705`, `5831-5848`; navigation sorts `lib/keyboard-navigation.js:973-1115`; per-root layout `lib/layout.js:632-647`; media placement `lib/tree-drag.js:321-397`; drag-over `8263-8285`.
- **Impact:** Large-map selection, arrows, group layout, media drop, and edits scale superlinearly.
- **Action/validation:** Per-revision graph/size index, linear top-one navigation, minimal-root group bounds, one reflow per transaction.

### AR-045 — Media interaction/marker state can target stale content

- **Evidence:** `lib/media-drop.js:190-253`; `src/main.js:8249-8303`, `9405-9470`; split CSS/producer classes.
- **Impact:** Empty URI lists are swallowed; stale hover can attach to an old topic; deleted markers persist; many repairs become O(N²).
- **Action/validation:** Payload-derived support, event-derived final target, one feedback class, Map-based current marker recomputation.

### AR-046 — Layout/collapse/color entry points violate shared contracts

- **Evidence:** Command/menu collapse `src/main.js:4344-4368`, `4774-4808`; color `lib/layout.js:911-936`; ignored `persist/animate` `lib/layout.js:92-140`.
- **Impact:** Equivalent actions differ; collapsed descendants keep stale colors; preview layout can still save/animate.
- **Action/validation:** One layout transaction with persistent vs visible views and forwarded options.

### AR-047 — Collision search can return an occupied slot

- **Evidence:** `lib/node-operations.js:182-205`.
- **Impact:** Dense/manual maps can visibly overlap after creation.
- **Action/validation:** Explicit bounded placement result and alternate bounded search; >200 occupied candidates.

### AR-048 — Checkbox mapping is not Markdown-syntax-safe

- **Evidence:** `src/main.js:5588-5632`.
- **Impact:** Ordered/blockquote task clicks can fail or update the wrong source task.
- **Action/validation:** Renderer-to-source mapping from the canonical codec; mixed task/non-task lists.

### AR-049 — Export projections lose graph/card/format semantics

- **Evidence:** Viewport edge endpoints `src/main.js:3701-3710`, `3779-3791`; PDF rich removal `lib/vector-pdf-entry.js:16-22`; card state `src/main.js:3711-3776`, `3856-3904`; aspect/paint `lib/export.js:94-138`.
- **Impact:** Visible edge segments disappear; PDF is text-only while assets are fetched; state markers vanish; extreme aspect and alpha themes contradict promises.
- **Action/validation:** Canonical export record, either endpoint for viewport edge, explicit PDF contract, card-state SVG, exact aspect/tile or clamp truth, alpha compositing.

### AR-050 — Export snapshot/raster have no total budget

- **Evidence:** `src/main.js:3595-3919`; `lib/export.js:342-386`.
- **Impact:** UI stalls and up to 67 MP/roughly 256 MiB raster allocation, especially on mobile.
- **Action/validation:** Bounded yielding/cancellable snapshot plus total-pixel/estimated-byte budget shared by fallback.

### AR-051 — Off-screen sizing retains all content and uses quadratic fallback estimation

- **Evidence:** `src/main.js:6235-6527`; `lib/live-sizing.js:275-356`.
- **Impact:** O(total rich DOM/resources), possible hidden media activity, quadratic long-text work/new context per call.
- **Action/validation:** Inert embeds, release each batch retaining numbers, one reusable context, bounded wrap search.

### AR-052 — Build contains legacy rewrites and drifting extraction metadata

- **Evidence:** `scripts/inline-runtime-modules.js:23-45`, `64-124`; `scripts/extract-main-source.js:12-21`; `scripts/runtime-modules.js:71-75`.
- **Impact:** Current wrapper edits can be silently discarded, strict semantics differ, extraction can miss live bindings. Current export bindings are complete; canvas-session is the confirmed mismatch.
- **Action/validation:** Delete legacy transforms; one binding list per module; strict-mode IIFEs; nonstandard wrapper/extraction/strict fixtures.

### AR-053 — Vector artifact lacks complete verification/size gates

- **Evidence:** `package.json:6-24`; `tests/export.test.js:90-120`; `scripts/verify-vector-pdf.js:14-49`; sizes above.
- **Impact:** `npm run check` does not rebuild/compare the vector bundle; real converter is fake/unwired; Puppeteer 25 requires Node 22.12 while project CI says Node 20; vector bundle dominates load size.
- **Counter-evidence:** CI's full build/diff catches a stale committed vector artifact.
- **Action/validation:** Non-mutating rebuild/byte check, portable Node-20-compatible real PDF smoke, metafile/size budget.

### AR-054 — Tests validate secondary surfaces

- **Evidence:** Generated/private test loading `tests/markdown-sibling-sync.test.js:9-47`, untracked conversion test `43-52`; test-only navigation `tests/tree-navigation.test.js:1-82`; text scans `tests/export.test.js:108-120`, `tests/ui-styles.test.js:13-25`.
- **Impact:** Green tests can miss production navigation/source behavior or pass unreachable text.
- **Action/validation:** Maintainable behavior tests through production interfaces, one shared Canvas/DOM harness, one generated artifact contract test.

### AR-055 — URL/standalone-artifact sanitization is incomplete

- **Evidence:** `lib/media-drop.js:218-240`; `src/main.js:3607-3651`, `3860-3888`, `9822-9834`.
- **Impact:** Unknown schemes persist; iframe/object/embed/link/srcdoc/external resources may survive into top-level SVG depending on host/consumer. Execution was not established.
- **Action/validation:** One allowlist resource/sanitization policy; dangerous scheme fixtures and clean-browser SVG network/navigation trace.

### AR-056 — Blank-leaf pruning has a 50-pass ceiling

- **Evidence:** `lib/canvas-session.js:96-133`; two-level tests only.
- **Impact:** A 51+ blank chain leaves blank topics and repeated edge-index work.
- **Action/validation:** Removable-leaf queue with exhaustion; 51/500/1,000-level tests.

### AR-057 — Release license/notices are incomplete

- **Evidence:** `LICENSE:1-21`; release list `verify-release.yml:82-104`; generated third-party code.
- **Impact:** Published copies omit the project's MIT notice and do not provide a deterministic complete third-party notice set.
- **Action/validation:** Package `LICENSE` and generated `THIRD_PARTY_NOTICES.txt`; legal review of dual/custom licenses.

## P3 — cleanup and compatibility polish

### AR-058 — Group animation class can survive canceled timer

- **Evidence:** `src/main.js:6057-6080` versus teardown cancellation `5203-5204`, `10154-10165`.
- **Action:** Make class removal an idempotent decoration teardown postcondition; test switch/unload before 260 ms.

### AR-059 — Browser-download URL cleanup is outside `finally`

- **Evidence:** `lib/export.js:397-413`.
- **Action:** Establish URL lifetime in `try/finally`, preserving delayed normal revocation; throwing click still revokes once.

### AR-060 — Definite dead code and test-only compatibility surface remain

- **Evidence and inventory:** Section 7 below.
- **Action:** Delete only proven unreachable code after live gesture/export behavior is tested; move/remove test-only helpers separately.

### AR-061 — Runtime/provenance documentation is not registry-derived

- **Evidence:** `lib/README.md:3-18` omits registered modules; stale `src/**/*.ts` markers in `src/main.js:30`, `73`, `101`, `396`, `517`, `602`, `698`, `1804`, `4079`.
- **Action:** Generate/validate module inventory and actual path provenance.

### AR-062 — Motion ignores reduced-motion preference

- **Evidence:** `styles.css:18-21`, `102-112`, `155-161`, `214-233`, `625-631`.
- **Action:** Focused reduced-motion override while retaining state feedback.

### AR-063 — Legacy settings migration checks raw values first

- **Evidence:** `src/main.js:10208-10217`; string acceptance `lib/settings.js:37-78`.
- **Impact:** `"420"`/`"300"` bypass migration and persist differently from numbers.
- **Action:** Normalize/coerce first and keep migration in the settings module; table-test all representations.

## 6. Recommended target architecture

The target is a small set of deep modules. An adapter is justified only where two real implementations exist or genuinely vary.

```text
Obsidian commands / menus / settings
                 |
       CanvasMindMapPlugin          registration/composition only
                 |
       CanvasSession (per Canvas)  attach / refreshBindings / finishGesture / dispose
          |             |                    |
   MindMapGraph   SizingSession      CanvasDecoration owner
   GraphSnapshot  typed result       classes/edges/timers/selection
          |
   MindmapActions.mutate(...)       graph + visibility + order + layout + save postconditions
          |
   MarkdownMindMapCodec             parse / serialize / planPreservingUpdate
          |
   MarkdownSyncCoordinator         validated link + per-path generation/promise state
       /                              \
 live Canvas adapter              raw Canvas-data adapter

Export:
  PrintableSnapshot / ExportPlan -> Markdown / SVG / PNG / PDF projections
       -> ExportAssetResolver      vault / approved-network / approved-file policy
       -> ExportDelivery           desktop filesystem / platform download

Build:
  module registry (source + bindings + dependencies)
       -> direct imports -> strict generated CommonJS blocks
       -> source behavior tests + one restricted-loader generated smoke
```

### Design rules

1. **GraphSnapshot is the graph interface/test surface.** Callers ask canonical parent/children/descendants and visible projection; they do not walk raw edges.
2. **One mutation transaction owns postconditions.** Edge/collapse/order/layout/color/group/save happen once, with changed roots returned.
3. **One Markdown codec owns syntax.** Do not add parser/scanner wrappers around the 1,930-line source cluster; move behavior and delete duplicates.
4. **One sync coordinator owns ownership, generations, retries, and live/closed fan-out.**
5. **One CanvasSession owns listeners, input bindings, gesture terminal paths, deferred work, and plugin presentation.**
6. **One sizing session per Canvas.** Empty/unavailable is not success; only numeric results survive a batch.
7. **One coherent export snapshot.** Format-specific behavior is explicit, not inferred from a half-Canvas.
8. **Tests use the same interface as callers.** Geometry/postorder internals stay private.
9. **Deletion test:** a deep module earns its keep when deletion spreads complexity to callers. A pass-through/impossible branch should be deleted.

## 7. Dead and legacy code inventory

Generated occurrences in `main.js` are mirrors, not independent consumers.

### Definitely unused in the current repository

| Candidate | Evidence | Action |
|---|---|---|
| `lib/drag-attachment.js` | Entire file `1-22`; undeclared identifiers; no import/registry/test/generated marker | Delete broken orphan file |
| `collectDescendants`, `registerSubtreeDragHandler` | `src/main.js:397-515`; no caller | Delete superseded gesture owner |
| `getEditorElements` | `src/main.js:603-612`; no caller | Delete |
| `cleanupDragHandler`, `cleanupSubtreeDragHandler` | `src/main.js:4086-4087`, `5080-5087`, `5209-5216`, `5406-5407`; never assigned disposers | Delete state/branches |
| `renderResizeQueueCleanup` | `src/main.js:4111`, `10159`; never assigned | Delete nonexistent second owner |
| `mediaBtnEl`, `.tomindmap-media-btn` | State never assigned; CSS `styles.css:3-12` | Delete together |
| `handleAutoAdjustDrag` | `src/main.js:6107-6111`; no caller | Delete façade |
| Plugin `resizeNodes`, `resizeNodesRetry` | `src/main.js:6129-6131`, `6546-6548`; controller internals remain live | Delete plugin façades only |
| `saveMindMapMarkdown` | `src/main.js:7897-7899`; no caller | Delete |
| `renderSvgAsJpeg`, `mindMapPdfBytes` | `src/main.js:3955-4071`; no caller after vector migration | Delete |
| Duplicate `escapeXml` in `lib/export.js` | `lib/export.js:176-183`; no caller | Delete module copy; retain live source helper |
| `parseMarkdownMindMap` wrapper | `src/main.js:2792-2794`; no caller | Delete with codec move |
| Local `canvasTopicPreorder` wrapper | `src/main.js:3034-3036`; active code calls module directly | Delete wrapper |
| `stableIdCount`, `metadataCurrent` fields | Calculated/forwarded, never read | Remove with codec interface cleanup |
| `registerDragEndHandler` | `lib/layout.js:43-70`, `948`; unused import/export, no test/caller | Delete |
| `CanvasAPI.getSiblingNodes` | `lib/canvas-api.js:287-296`; no caller | Delete |
| `KeyboardHandler.nearestChild` | `lib/keyboard-navigation.js:1416-1437`; no caller | Delete |
| `isWithinGraphBounds` | `lib/tree-drag.js:798-853`; no caller/test | Delete |
| `TouchControlsController.lastPointerType` | Assigned, never read | Delete |
| Dead `record.resizeObserver` branch | Checked/disconnected but never constructed | Delete or implement only with proven policy |
| `tomindmap-resizable-content` | Produced, no consumer | Delete producer |
| Drop-feedback split | `tomindmap-node-drop-hover` has no style; `.tomindmap-drop-active` has no producer | Choose one intentional pair, delete other |
| `.tomindmap-print-frame` | CSS only, no producer | Delete |

Unused **bindings** whose implementations remain live: `computeEdgeSides`, `updateAllEdgeSides`, `createGestureTracker`, `dispatchTouchAction`, `parseFreeMindXml`, and several tree-model/layout imports. Remove bindings, not live behavior.

### Test-only compatibility candidates

- `findTreeTraversalTarget` — tests only; production uses spatial navigation.
- `compactHorizontalSprings`, `getAdaptiveHorizontalGap`, `packSubtrees`, `packRootSubtrees` — tests/internal-only layout seams.
- `findClosestNodeOnRay`, `isWithinAttachmentRadius` — tests only.
- `nextTopicNotePath` — test-only alias of the production function.

Delete or privatize these only after production-interface tests cover the real behavior.

### Compatibility-only / needs a decision

- `CanvasAPI.createFileNode` and TreeDrag host-method fallbacks: retain until a supported desktop/mobile matrix proves native methods everywhere.
- `paginatedPdfDocument` legacy fields and ignored `electronApi`: reduce if no external caller is supported.
- Parent-card metadata duplication: verify real `Canvas.getData()` before removing either shape.
- Legacy Markdown comments/node markers: active migration behavior, not dead.
- `canvasDataToMindMapMarkdown`: test/raw-data seam; keep until the codec exposes an intentional raw-data interface.
- `scripts/verify-vector-pdf.js`: either wire portably or remove it and the unsupported tooling choice.

### Not dead

- `main.js` and `lib/vector-pdf-bundle.js` are live generated artifacts.
- `lib/vector-pdf-entry.js` is the build/source entry.
- `computeEdgeSides`/`updateAllEdgeSides` remain live internal implementations.
- `parseFreeMindXml` and `hasMarkdownStructure` remain live internally even if their public exports are unnecessary.
- `tests/conversion-layout.test.js` is valuable user work, not dead code.

## 8. Test and quality plan

### 8.1 Test layers

1. **Pure production-interface tests** for graph queries, Markdown codec, sizing math, settings, export filename/asset policy, and conversion validation.
2. **Shared Canvas/DOM behavior harness** for plugin lifecycle, touch attach, pointer gestures, settings/mode rebinding, observers, selection, and decoration cleanup.
3. **Generated artifact contract tests** using a restricted loader that rejects relative modules; exercise collapse, startup, and a small export/menu path.
4. **Real browser tests** for XML-safe SVG, sanitizer behavior, PNG dimensions, and actual jsPDF/svg2pdf output.
5. **Scale tests** with operation counters rather than timing-only thresholds.

### 8.2 Highest-value missing regressions

- Unowned sync/parent links cause zero target I/O.
- Parse failures never clear Canvas data.
- Newer Canvas file wins during flush.
- Conversion rollback after every destructive step.
- Deep layout/import/collapse/outline/order never throw `RangeError`.
- Drag cancel/commit preserves full edge payload.
- Pointer cancel/blur/secondary pointer clean state.
- Settings/mode toggles reconfigure active Canvas exactly once.
- Generated collapse works with no external relative modules.
- Export rejects private/file targets and enforces concurrency/byte/time budgets.
- Rich SVG parses as XML; real PDF returns valid bytes.
- Nested multi-root export preserves hierarchy and content.
- Text↔media transitions use correct dimensions.
- Filename allocator handles emoji/Han/reserved names/collisions.
- Pruning reaches a fixed point for 1,000 blank levels.

### 8.3 Static/build checks to add

- Registry/document consistency.
- No relative `require()` in generated `main.js` except intentionally external host modules.
- Source and generated module binding equality.
- Strict-mode semantic fixture.
- Vector bundle byte freshness using esbuild `write:false`.
- Action references pinned to reviewed full SHAs.
- Secret/dependency/license policy checks.
- Bundle raw/compressed size and metafile composition budget.

## 9. Documentation and repository improvements

### README

- Separate **verified current behavior** from **platform-dependent behavior**.
- Document that PDF is currently vector geometry plus text fallback, not rich HTML fidelity, unless that changes.
- Define supported remote export resources and local-file policy.
- Explain mobile download behavior only after device verification.
- Add a compatibility matrix: Obsidian minimum/current, desktop/mobile, Chromium/WebView, export formats, and known private Canvas APIs.
- Add an explicit recovery note: never overwrite plugin `data.json` during manual upgrade.

### `lib/README.md`

- Generate or validate the list from `scripts/runtime-modules.js`.
- Include every embedded module and distinguish `vector-pdf-entry.js` from generated `vector-pdf-bundle.js`.
- Keep the one-source/generated rule concise; avoid duplicating implementation details.

### Domain/context documentation

- Define behavior for multiple-root nested maps.
- Define linked-content expansion graph invariants and parent-link ownership.
- Define export fidelity and nested-map inclusion semantics.
- Keep `CONTEXT.md` as domain vocabulary, not architecture documentation.

### Repository hygiene

- Untrack `.DS_Store` while preserving the local file and ignore rule.
- Remove stale TypeScript provenance markers.
- Decide whether the project remains BRAT-only; `versions.json` becomes relevant only if official community distribution is adopted.
- Add lightweight contribution/PR templates only if they encode real release/test expectations; avoid generic governance files.

## 10. Security summary

The formal STRIDE artifacts are in `.security/`:

- `.security/threat-model.md`
- `.security/config.json`
- `.security/findings.json`
- `.security/validated-findings.json`
- `.security/report.md`
- `.security/reports/report-2026-09-25.md`

Validated security counts:

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 5 |
| Medium | 8 |
| **Total confirmed** | **14** |

Three additional items require live renderer/device verification: implicit `file:` export reachability, unsupported URL scheme activation, and active descendants in standalone SVG. XXE, SQL/command injection, and generic web-auth/IDOR findings were rejected as false positives for this architecture.

## 11. GitHub and release observations

- Upstream branch is current; local tags are stale.
- Current release assets match committed HEAD.
- Six `0.12.x` releases were published in roughly ten hours after the linked-topic feature line, followed by several `fix:` commits. This makes linked cards, collapse state, linked expansion, conversion, shortcuts, and parent-card sync the highest-value regression areas.
- No issues/PRs exist to clarify intended edge cases; current behavior must be inferred from code, tests, README, and `CONTEXT.md`.
- The sole branch is unprotected in public metadata; release correctness depends entirely on workflow discipline.
- Community health is 42%; no topics/templates/Dependabot config are visible. These are maintenance observations, not product defects.
- Authenticated Dependabot/code/secret scanning state is unknown. Public advisory endpoints and `npm audit` returned no known issue, which is not proof of zero vulnerabilities.
- Latest commit is unsigned. This is a provenance fact, not evidence of malicious or modified code.

## 12. What is already strong

- `buildForest` is a genuinely deep, deterministic, cycle-safe graph module with malformed-graph and 12,000-node model coverage.
- The live drag-preview controller has a coherent small state interface and focused target/rollback tests.
- Settings normalization is immutable, bounded, and returns fresh objects.
- The expected-current Markdown write guard is a strong compare-and-set primitive; it needs coordination around it, not replacement by a weaker layer.
- Source-preserving Markdown patches reject uncertain changes and fall back to readable structural output.
- Export uses one canonical SVG path for formats and safely escapes generated text/attributes.
- Desktop Downloads writes use exclusive creation and sanitized names.
- Normal dropped-file resolution uses Obsidian file/metadata APIs rather than arbitrary direct writes.
- Tests emphasize semantic layout properties (collision, gutter, side preservation) rather than only coordinate snapshots.
- The repository has a clear generated-artifact contract and CI does build/diff generated output.
- Package/manifest/lock versions are synchronized at 0.12.5.
- The current user work meaningfully improves persisted-collapse handling and stable root sides; the issues above are integration/architecture gaps, not reasons to discard that work.

## 13. Coverage ledger

| Area | Coverage |
|---|---|
| `AGENTS.md`, `README.md`, `CONTEXT.md`, `lib/README.md`, `LICENSE` | Full |
| `package.json`, `package-lock.json`, `manifest.json`, `data.json`, `.gitignore` | Full |
| `.github/workflows/verify-release.yml` | Full |
| `src/main.js` | All 10,245 maintainable lines; split into six contiguous semantic audits and cross-validated |
| Maintainable `lib/*.js` | All files/full ranges, including the orphan `drag-attachment.js` |
| `scripts/*.js` | Full |
| `styles.css` | Full |
| `tests/*.test.js` and `test-load.js` | Full, including untracked conversion test |
| `main.js` | Full mechanical coverage: markers, all requires/imports, symbols, secret/provenance searches, source parity, security-sensitive ranges, load/restricted-loader probes |
| `lib/vector-pdf-bundle.js` | Full mechanical provenance/composition/dependency/security search; not hand-interpreted vendored code |
| `node_modules` | Locked versions, engine/license/provenance, and `npm audit`; no line-by-line dependency audit |
| `.DS_Store` | Metadata/size/tracking status; binary contents are not source |
| GitHub | Branch, tags, releases, assets, workflows/runs, issues/PRs/milestones, community metadata, public advisory endpoints |

## 14. Limitations and manual verification queue

No conclusion should be upgraded beyond the evidence without:

1. Live supported Obsidian desktop and mobile vaults.
2. Minimum/current Obsidian compatibility matrix, including non-public Canvas/runtime surfaces.
3. `view.save()` and concurrent-writer behavior.
4. Touch pointer cancel/blur/multitouch and screen-reader output.
5. Mobile download activation and filesystem capability.
6. Clean-browser standalone SVG network/navigation/script trace.
7. Real PDF/PNG visual export and jsPDF/svg2pdf execution.
8. Node 20 versus locked Puppeteer toolchain.
9. Node 20/mobile performance and memory thresholds.
10. Authenticated GitHub alert state.

## 15. Recommended remediation sequence

### Phase 0 — Freeze behavior and preserve user work

- Commit or otherwise preserve the current collapse/layout/test work separately.
- Add the generated restricted-loader collapse test before changing that area.
- Do not run broad dead-code deletion yet.

### Phase 1 — Release/data-integrity blockers

- `AR-001` owned-link validation.
- `AR-003`, `AR-004`, `AR-005`, `AR-006`, `AR-007` persistence/sync state.
- `AR-008`, `AR-041`, `AR-042` transaction/rollback.
- `AR-026`, `AR-027` release/settings packaging.

### Phase 2 — Correctness and mobile/export safety

- `AR-002` generated dependency.
- `AR-009` Markdown codec conformance before extraction.
- `AR-011`, `AR-013`, `AR-017`, `AR-018`, `AR-019`, `AR-024` graph/gesture ownership.
- `AR-014`, `AR-015`, `AR-016`, `AR-025` input/session/sizing correctness.
- `AR-020` through `AR-023` export policy/delivery/XML/model.

### Phase 3 — Scale and bounded work

- `AR-010` iterative/bounded import pipeline.
- `AR-012`, `AR-030`, `AR-038`, `AR-043`, `AR-044`, `AR-050`, `AR-051` per-operation indexes/sessions/budgets.
- Add operation-count and device benchmarks before micro-optimizing.

### Phase 4 — Architecture, tests, and build

- Introduce/replace the target deep modules rather than layering wrappers.
- `AR-052` artifact compiler invariants.
- `AR-053` real vector/freshness/size gates.
- `AR-054` production-interface test layers.
- `AR-057` release notices.

### Phase 5 — UX, docs, and cleanup

- `AR-031` through `AR-049` and `AR-055`, `AR-056` as product priority permits.
- `AR-058` through `AR-063`.
- Dead-code deletion last, followed by normal generated regeneration and complete verification.

## 16. Final assessment

The repository is compact in distribution and has better-than-average focused-module discipline for a small Obsidian plugin, but its **effective complexity is concentrated in `src/main.js`, the Markdown codec, Canvas lifecycle/persistence, and the artifact/release seams**. The highest-value improvement is not a large rewrite: it is to establish a few deep ownership interfaces—owned links, graph snapshot, mutation transaction, Markdown codec, Canvas session, export plan, and artifact compiler—and let callers become much smaller.

Fix the P0 and P1 data-integrity/security paths first, protect them with production-interface tests, then improve scale and cleanup. This sequence produces the largest correctness, maintainability, and user-trust improvement without introducing speculative layers or a second implementation.
