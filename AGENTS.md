# AGENTS.md

## Repository contract

- Treat `README.md` as the user-facing capability summary and `CONTEXT.md` as the domain-language source of truth. Use its terms (for example, **topic**, **clean note**, **collapsed subtree**, and **nested mind map**) in code, tests, and docs.
- Treat `src/main.js` plus the focused modules in `lib/` as maintainable product source. `main.js` and `lib/vector-pdf-bundle.js` are generated release artifacts; never repair them by hand.
- Keep each behavior in one source of truth. Change the maintainable module, then regenerate artifacts rather than copying logic into the bundle.
- When adding or removing an embedded runtime module, update `scripts/runtime-modules.js`, its `lib/README.md` entry, imports/exports, and focused tests together. The self-contained CommonJS bundling is intentional for Obsidian.
- Keep runtime behavior compatible with Node 20 during development and with both desktop and mobile Obsidian; `manifest.json` declares the plugin mobile-capable. Guard platform-only APIs and avoid adding Node-only dependencies to runtime paths.

## Working rules

- Preserve unrelated working-tree changes. Inspect before editing and use targeted edits; do not reset, clean, overwrite, or rewrite user work.
- Match the nearest file's established JavaScript style. This repository has no formatter or linter configuration, so avoid introducing a competing style system.
- Add or update focused `node:test` coverage under `tests/` for behavior changes. Cover failure and cleanup paths where they matter, and keep tests independent of a live Obsidian instance where practical.
- Treat Markdown, FreeMind/XML, filenames, media, URLs, settings, and imported Clipboard data as untrusted input. Validate before persistence or DOM use, constrain filesystem access, and preserve user data during cleanup or conversion.
- Keep `package.json`, `package-lock.json`, and `manifest.json` versions synchronized for release work. Do not hand-edit dependency lock data.
- Update documentation when observable behavior, controls, defaults, compatibility, or development workflow changes. Do not duplicate long implementation details in `README.md`.

## Verification

- Use the scripts declared in `package.json` as the command source of truth. For product-code changes, regenerate the distributable with `npm run build` and run `npm run check`; the release workflow also requires generated files to be committed and clean.
- For report-only or documentation-only work, do not rewrite generated artifacts. Verify claims against source, tests, Git state, and primary documentation instead.
- A task is complete only when every affected source, generated artifact, test, and document is intentionally handled; required checks pass; and no unrelated working-tree change was introduced.
