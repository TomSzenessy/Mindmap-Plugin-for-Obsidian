# Threat Model for ToMindMap

**Last Updated:** 2026-09-25
**Version:** 1.0.0
**Methodology:** STRIDE + natural-language analysis
**Scope:** Current working tree at baseline `279fb4be33eafd8bcc5e7a89e554c96bc426d261`, including the user's uncommitted collapse/layout/test changes.

## 1. System overview

ToMindMap is a local Obsidian Canvas plugin. It reads and writes Canvas JSON, Markdown, FreeMind XML, media, and generated nested maps inside the user's vault; renders cards through Obsidian; and exports Markdown, SVG, PNG, and PDF. It has no remote server, account system, database, or authentication layer.

### Architecture

1. **Obsidian host adapter** — `src/main.js` registers commands, settings, Canvas events, menus, protocol handling, and lifecycle hooks.
2. **Graph and layout modules** — `lib/tree-model.js`, `lib/layout.js`, `lib/canvas-api.js`, `lib/node-operations.js`, and `lib/tree-drag.js` interpret and mutate the Canvas graph.
3. **Markdown codec and sync** — source helpers in `src/main.js` plus `lib/markdown-order.js` and `lib/clipboard-markdown.js` parse, serialize, reconcile, and synchronize notes.
4. **Conversion/persistence modules** — `lib/mindmap-actions.js` and `lib/canvas-session.js` create linked cards, clean notes, branch notes, nested maps, and Canvas snapshots.
5. **Input/rendering modules** — `lib/live-sizing.js`, `lib/media-drop.js`, `lib/touch-controls.js`, and `lib/drag-preview-controller.js` handle DOM, sizing, gestures, and media.
6. **Export modules** — `lib/export.js`, `lib/vector-pdf-entry.js`, and the generated `lib/vector-pdf-bundle.js` create export assets and files.
7. **Build/release** — `scripts/*.js` embeds focused modules into generated `main.js`; GitHub Actions verifies and publishes releases.

### Data flow

```text
shared/downloaded .canvas, .md, .mm, clipboard, dropped File/URL
  -> JSON / Markdown / XML / resource / URL parsing
  -> Obsidian MarkdownRenderer and Canvas DOM
  -> graph reconciliation, layout, metadata, and vault writes
  -> local .canvas/.md/.canvas artifacts
  -> optional export asset fetch/file reads and Downloads/platform delivery
```

## 2. Trust boundaries and security zones

| Zone | Trust | Entry points and capabilities |
|---|---|---|
| Untrusted content | None | Shared `.canvas`/`.md`/`.mm`, raw HTML, pasted text, dropped files/URLs, persisted plugin metadata, generated/linked file content |
| Local user/workspace | Ambient Obsidian authority | User-selected imports, commands, exports, clipboard, file manager operations |
| Obsidian host | Trusted but private/runtime-dependent | Vault APIs, Canvas internals, Markdown renderer, workspace, platform download, desktop Node filesystem |
| Network | Untrusted remote origin | Export `fetch` requests to attacker-selected HTTP(S) URLs |
| Build/release | Privileged | Lockfile dependencies, GitHub Actions, write-capable release token, generated artifacts |

### Authentication and authorization

There is no service authentication or role model. The plugin runs with the local user's ambient Obsidian authority. Authorization is therefore expressed as ownership and capability validation at persisted-link, file, URL, and platform seams—not as user-role checks.

### Critical controls

- Only act on persisted links that are proven Markdown/Canvas targets and owned by the plugin.
- Treat Markdown, XML, raw HTML, paths, URLs, settings, and imported files as untrusted.
- Keep all I/O inside the vault or behind an explicit user-approved external-resource policy.
- Bound bytes, counts, depth, concurrency, time, and output dimensions.
- Preserve user data through compare-and-set semantics, explicit transactions, and conflict reporting.
- Generate release artifacts from one verified commit and do not mutate published versions.

## 3. Attack surface inventory

### Untrusted data inputs

- Canvas JSON and custom node/edge fields.
- `mindmapMarkdownSync.path` and `mindmapParent` metadata.
- Markdown headings, lists, Mermaid, code fences, frontmatter, raw HTML, links, images, and CSS URLs.
- FreeMind XML.
- Clipboard Markdown/plain text.
- Dropped `File` objects, Obsidian drag payloads, and URLs.
- Rendered DOM cloned into export artifacts.
- Persisted settings and legacy settings values.

### Filesystem sinks

- `vault.read`, `vault.cachedRead`, `vault.process`, `vault.modify`, `vault.create`.
- File-manager rename/open/trash operations.
- Node `fs.promises.readFile` for Downloads and the export `file:` fallback.
- ZIP/package creation in CI.

### Network sinks

- `fetch(url)` during export asset embedding.

### DOM/export sinks

- HTML labels and titles assigned to DOM.
- Cloned rendered content serialized into SVG `foreignObject`.
- Standalone SVG Blob download.
- PNG image decode/canvas allocation.
- PDF conversion and fallback text.

### Build/release surface

- `npm ci` and esbuild in GitHub Actions.
- Runtime-module registry/inliner/extractor.
- `actions/checkout` and `actions/setup-node` major tags.
- `GITHUB_TOKEN` with `contents: write` in the release job.
- GitHub release tag/asset mutation.

## 4. Critical assets

- **Vault integrity:** Markdown, Canvas, clean notes, branch notes, nested maps, frontmatter, and custom metadata.
- **Local confidentiality:** any file readable by the desktop Obsidian process.
- **Network position:** the user's loopback, private, link-local, metadata, and public network reachability.
- **Availability:** UI thread, DOM, heap, Canvas rendering, vault I/O, and mobile WebView memory.
- **Release integrity:** generated runtime, bundled third-party code, release tags, assets, and publication credentials.

## 5. STRIDE analysis

### Spoofing

- The custom `tomindmap-navigate` protocol accepts a Canvas path and node ID. A failed open can fall back to another Canvas. This is a navigation-integrity concern; no privilege bypass is established.
- Persisted sync/parent paths can claim ownership of a file unless a plugin ownership token is required.

### Tampering

- Unowned `mindmapMarkdownSync.path` can direct automatic reads/writes to unrelated vault files.
- Parse failure is coerced to an empty graph and can erase synchronized structure.
- Conversion removes the source branch before fallible replacement work completes.
- Asynchronous Canvas flush can overwrite newer external edits.
- Drag rollback/commit reconstructs only a subset of authored edge data.

### Repudiation

- The plugin emits console warnings and Notices but no durable audit trail. For a local plugin this is informational unless a concrete external log consumer exists.

### Information disclosure

- Export can issue arbitrary HTTP(S) requests.
- Export has an implicit `file:` filesystem fallback; whether raw local references survive Obsidian rendering requires live verification.
- Generated errors/paths may expose local paths, but no secret-bearing logging was found.

### Denial of service

- Markdown, FreeMind, and deep layout paths recurse without depth limits.
- Markdown identity reconciliation and source-preserving reorder can become quadratic or worse.
- Export assets use unbounded concurrency and post-read byte checks.
- Off-screen sizing retains all rendered DOM until completion.
- PNG export permits a 67-megapixel square allocation.
- Startup sync indexing launches unbounded reads.
- Dropped media is fully buffered without count/aggregate budgets.

### Elevation of privilege

- No remote service or plugin sandbox exists. No separate elevation primitive was found.
- External local-file/network access is the main privilege expansion from content rendering into ambient host capabilities.

## 6. Vulnerability pattern library

### Persisted path without ownership

```js
// Vulnerable: any nonempty persisted path is treated as a sync target.
const path = canvasNode.mindmapMarkdownSync?.path;
await vault.process(vault.getAbstractFileByPath(path), fn);
```

Use a typed `OwnedVaultLink` decoder requiring a canonical Markdown `TFile` and matching unpredictable ownership token before any I/O.

### Unbounded external resource

```js
// Vulnerable: buffers first, checks size later, no host/time/concurrency policy.
const bytes = await response.arrayBuffer();
if (bytes.length > maxBytes) throw new Error('too large');
```

Resolve authorization before I/O; use bounded concurrency, streamed byte caps, abort deadlines, redirect revalidation, and aggregate budgets.

### Recursive untrusted input

```js
// Vulnerable: depth is controlled by input.
function visit(node) {
  for (const child of node.children) visit(child);
}
```

Preflight explicit depth/size limits and use iterative traversal/post-order processing.

### Destructive multi-artifact mutation

```js
// Vulnerable: source is removed before replacement is proven.
removeOriginal();
await createReplacement();
await layout();
```

Prepare and verify the replacement, snapshot the source, commit last, and roll back all graph/file changes on failure.

### Unsafe DOM-to-artifact serialization

```js
// Vulnerable: HTML serialization is embedded in strict XHTML/SVG.
const html = clone.outerHTML;
svg += `<foreignObject>${html}</foreignObject>`;
```

Sanitize an allowlisted DOM and serialize with `XMLSerializer`; parse the complete XML once before delivery.

## 7. Security testing strategy

| Test | Purpose | Frequency |
|---|---|---|
| Owned-link vault-spy suite | Reject unowned/non-Markdown paths before read/write | Every commit |
| Conversion fault injection | Prove graph/file rollback after every destructive step | Every commit |
| Generated-runtime restricted-loader test | Prove embedded dependencies and collapse behavior | Every commit |
| Markdown conformance corpus | Preserve code, comments, headings, media, and malformed-input behavior | Every commit |
| Deep/wide import tests | Enforce depth/count/time budgets and iterative traversal | Every commit + nightly scale run |
| Export resolver tests | Block private/loopback/file reads; enforce byte/concurrency/time budgets | Every commit |
| Real browser PDF/SVG tests | Validate XML, sanitization, and converter integration | Every commit in CI |
| `npm audit --json` | Detect known dependency advisories | Every commit and scheduled |
| Secret/action-pin policy | Prevent credentials and mutable action references | Every commit |

Manual validation remains necessary for supported Obsidian desktop/mobile versions, screen readers, touch pointers, native Canvas internals, mobile delivery, and CORS/private-network behavior.

## 8. Assumptions and accepted risks

- The plugin has the same ambient filesystem/network authority as Obsidian; this is not a sandbox.
- Normal dropped-file resolution through Obsidian APIs is preferred over direct paths.
- Export is an explicit user action, but rendering untrusted content must not silently acquire new filesystem/network authority.
- Generated/vendor dependencies are assessed through lockfile integrity, advisory results, provenance, and bundle composition rather than line-by-line authorship review.
- No authenticated GitHub alert state was available; absence of public advisories is not proof of zero vulnerabilities.

## 9. Changelog

### 1.0.0 — 2026-09-25

- Initial threat model created.
- STRIDE analysis completed across source, generated artifacts, tests, build, and release.
- P0/P1 validated findings and manual-review items documented separately.
