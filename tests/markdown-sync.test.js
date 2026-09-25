"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const {
  LINK_REASON,
  createSyncId,
  createMarkdownSyncOwnership,
  MarkdownSyncOwnership,
  OwnershipRegistry,
  resolveMarkdownSyncLink,
  resolveParentLink,
  adoptMarkdownSyncLink,
  adoptParentLink,
  parseFrontmatterOwnership,
  patchSyncIdOwnership,
  syncIdFrontmatterLines,
  OWNERSHIP_BLOCK_KEY,
  OWNERSHIP_FIELD_KEY,
  CARD_SYNC_KEY,
  MarkdownSyncIndex,
  MarkdownSyncCoordinator
} = require("../lib/markdown-sync");
const { allocateFilePath } = require("../lib/path-safety");

function unownedProof() {
  return `${"a".repeat(32)}.${"b".repeat(32)}`;
}

function disposableVault(files = {}) {
  const calls = [];
  const writes = [];
  const vault = {
    calls,
    writes,
    files,
    getAbstractFileByPath(path) {
      calls.push(["get", path]);
      return files[path] ?? null;
    },
    async cachedRead(file) {
      calls.push(["read", file.path]);
      return files[file.path]?.content ?? "";
    }
  };
  for (const name of [
    "process",
    "modify",
    "create",
    "createFolder",
    "rename",
    "delete",
    "trashSystem"
  ]) {
    vault[name] = (...args) => {
      writes.push([name, ...args]);
      throw new Error(`vault.${name} must not run inside an ownership decision`);
    };
  }
  return vault;
}

function assertNoWrites(vault) {
  assert.deepEqual(vault.writes, []);
}

function ownedMarkdown(syncId, body = "# Project\n\n- Topic\n") {
  return [
    "---",
    `${OWNERSHIP_BLOCK_KEY}:`,
    "  version: 1",
    `  ${OWNERSHIP_FIELD_KEY}: "${syncId}"`,
    "---",
    "",
    body
  ].join("\n");
}

function markdownFile(path, content) {
  return { path, extension: "md", content };
}

function canvasFile(path, nodes) {
  return {
    path,
    extension: "canvas",
    content: JSON.stringify({ nodes, edges: [] })
  };
}

function nestedMapCard(id, childPath, syncId = null) {
  const unknownData = {
    tomindmapTitleOnly: true,
    tomindmapCardKind: "nested-map",
    tomindmapCardTitle: "Nested map"
  };
  if (syncId) unknownData[CARD_SYNC_KEY] = syncId;
  return { id, type: "file", file: childPath, unknownData };
}

function persistedRegistry(registry, vault, adoption, { replaceExisting = false } = {}) {
  const target = adoption.targetPatch;
  if (target.markdown !== undefined) vault.files[target.path].content = target.markdown;
  if (target.unknownDataPatch !== undefined) {
    const record = JSON.parse(vault.files[target.canvas].content);
    const card = record.nodes.find((node) => node.id === target.nodeId);
    card.unknownData = target.unknownDataPatch;
    vault.files[target.canvas].content = JSON.stringify(record);
  }
  const saved = registry.upsert(adoption.registryRecord, { replaceExisting });
  assert.equal(saved.ok, true);
  return saved;
}

async function adoptedMarkdown(canvasPath, targetPath, vault, registry, options = {}) {
  const result = await adoptMarkdownSyncLink(
    { path: targetPath },
    canvasPath,
    registry,
    vault,
    { confirmed: true, ...options }
  );
  assert.equal(result.ok, true);
  persistedRegistry(registry, vault, result, options);
  return result;
}

test("a stolen public token against its own target is unowned without a private record", async () => {
  const stolen = createSyncId();
  const target = markdownFile("Maps/Owned.md", ownedMarkdown(stolen));
  const vault = disposableVault({ [target.path]: target });
  const registry = createMarkdownSyncOwnership();

  const result = await resolveMarkdownSyncLink(
    { path: target.path, syncId: stolen, proof: unownedProof() },
    "Maps/Owned.canvas",
    registry,
    vault
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, LINK_REASON.RECORD_MISSING);
  // The target is not even opened: public equality cannot substitute for the
  // private registry record.
  assert.deepEqual(vault.calls, []);
  assertNoWrites(vault);
});

test("a missing CSPRNG cannot mint an ownership secret or proof", () => {
  const modulePath = require.resolve("../lib/markdown-sync");
  const script = `
    const assert = require("node:assert/strict");
    const module = require(${JSON.stringify(modulePath)});
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    const registry = module.createMarkdownSyncOwnership();
    assert.equal(registry.isValid(), false);
    const record = registry.issueRecord({
      canvasPath: "A.canvas", kind: "markdown", targetPath: "A.md",
      syncId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", nodeId: null
    });
    assert.equal(record.ok, false);
    assert.equal(module.createSyncId(), "");
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ["-e", script], { stdio: "pipe" }));
});

test("a matching private record authorizes the exact Canvas and target", async () => {
  const target = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [target.path]: target });
  const registry = createMarkdownSyncOwnership();
  const adopted = await adoptedMarkdown("Maps/Project.canvas", target.path, vault, registry);

  const result = await resolveMarkdownSyncLink(
    adopted.link,
    "Maps/Project.canvas",
    registry,
    vault
  );

  assert.equal(result.ok, true);
  assert.equal(result.link.path, target.path);
  assert.equal(result.link.syncId, adopted.link.syncId);
  assert.equal(result.link.proof, adopted.link.proof);
  assert.deepEqual(result.link.ownership, { source: "plugin-data" });
  assert.equal(JSON.stringify(result.link).includes(registry.toJSON().secret), false);
  assert.deepEqual(vault.calls, [
    ["get", target.path],
    ["read", target.path],
    ["get", target.path],
    ["read", target.path]
  ]);
  assertNoWrites(vault);
});

test("the current Canvas path is part of the proof", async () => {
  const target = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [target.path]: target });
  const registry = createMarkdownSyncOwnership();
  const adopted = await adoptedMarkdown("Maps/Project.canvas", target.path, vault, registry);

  vault.calls.length = 0;
  const wrong = await resolveMarkdownSyncLink(
    adopted.link,
    "Maps/Other.canvas",
    registry,
    vault
  );
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, LINK_REASON.WRONG_CANVAS);
  assert.deepEqual(vault.calls, []);
});

test("a proof is bound to Canvas, kind, target, syncId, and parent card", async () => {
  const target = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [target.path]: target });
  const registry = createMarkdownSyncOwnership();
  const adopted = await adoptedMarkdown("Maps/Project.canvas", target.path, vault, registry);

  vault.calls.length = 0;
  const wrongTarget = await resolveMarkdownSyncLink(
    { ...adopted.link, path: "Maps/Other.md" },
    "Maps/Project.canvas",
    registry,
    vault
  );
  assert.equal(wrongTarget.reason, LINK_REASON.WRONG_TARGET);
  assert.deepEqual(vault.calls, []);

  const wrongKind = await resolveParentLink(
    { canvas: target.path, nodeId: "card-1", ...adopted.link },
    "Maps/Project.canvas",
    registry,
    vault
  );
  assert.equal(wrongKind.reason, LINK_REASON.NOT_CANVAS);
  assert.deepEqual(vault.calls, []);

  const parent = canvasFile("Maps/Parent.canvas", [
    nestedMapCard("card-1", "Maps/Child.canvas")
  ]);
  const parentVault = disposableVault({ [parent.path]: parent });
  const parentAdopted = await adoptParentLink(
    { canvas: parent.path, nodeId: "card-1" },
    "Maps/Child.canvas",
    registry,
    parentVault,
    { confirmed: true }
  );
  assert.equal(parentAdopted.ok, true);
  persistedRegistry(registry, parentVault, parentAdopted);

  parentVault.calls.length = 0;
  const wrongCard = await resolveParentLink(
    { ...parentAdopted.link, nodeId: "card-2" },
    "Maps/Child.canvas",
    registry,
    parentVault
  );
  assert.equal(wrongCard.reason, LINK_REASON.WRONG_CARD);
  assert.deepEqual(parentVault.calls, []);
});

test("missing, tampered, or stale registry data fails closed", async () => {
  const target = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [target.path]: target });
  const registry = createMarkdownSyncOwnership();
  const adopted = await adoptedMarkdown("Maps/Project.canvas", target.path, vault, registry);

  vault.calls.length = 0;
  const absent = await resolveMarkdownSyncLink(
    adopted.link,
    "Maps/Project.canvas",
    null,
    vault
  );
  assert.equal(absent.reason, LINK_REASON.MISSING_REGISTRY);
  assert.deepEqual(vault.calls, []);

  const tamperedSecret = registry.toJSON();
  tamperedSecret.secret = tamperedSecret.secret.slice(0, -1) + (tamperedSecret.secret.endsWith("0") ? "1" : "0");
  assert.equal(OwnershipRegistry.fromJSON(tamperedSecret), null);

  const tamperedRecord = registry.toJSON();
  tamperedRecord.records[0].targetPath = "Maps/Attacker.md";
  assert.equal(OwnershipRegistry.fromJSON(tamperedRecord), null);

  const stale = registry.toJSON();
  stale.stale = true;
  assert.equal(OwnershipRegistry.fromJSON(stale), null);

  const badProof = registry.toJSON();
  badProof.records[0].proof = createSyncId();
  assert.equal(OwnershipRegistry.fromJSON(badProof), null);
});

test("adoption is mutation-free and returns both a target patch and a private upsert", async () => {
  const file = markdownFile("Maps/Legacy.md", "# Legacy\n");
  const vault = disposableVault({ [file.path]: file });
  const registry = createMarkdownSyncOwnership({ now: () => 1234 });

  const adopted = await adoptMarkdownSyncLink(
    { path: file.path },
    "Maps/Legacy.canvas",
    registry,
    vault,
    { confirmed: true }
  );
  assert.equal(adopted.ok, true);
  assert.equal(file.content, "# Legacy\n");
  assert.equal(vault.writes.length, 0);
  assert.equal(parseFrontmatterOwnership(adopted.targetPatch.markdown).syncId, adopted.link.syncId);
  assert.equal(adopted.targetPatch.path, file.path);
  assert.equal(adopted.registryRecord.canvasPath, "Maps/Legacy.canvas");
  assert.equal(adopted.registryRecord.kind, "markdown");
  assert.equal(adopted.registryRecord.targetPath, file.path);
  assert.equal(adopted.registryRecord.syncId, adopted.link.syncId);
  assert.equal(adopted.registryRecord.createdAt, 1234);
  assert.equal(adopted.registryRecord.updatedAt, 1234);
  assert.equal(typeof adopted.registryRecord.proof, "string");

  const linkText = JSON.stringify(adopted.link);
  const targetText = JSON.stringify(adopted.targetPatch);
  const recordText = JSON.stringify(adopted.registryRecord);
  assert.equal(linkText.includes("secret"), false);
  assert.equal(linkText.includes("records"), false);
  assert.equal(targetText.includes("secret"), false);
  assert.equal(targetText.includes("records"), false);
  assert.equal(targetText.includes(adopted.registryRecord.proof), false);
  assert.equal(recordText.includes(registry.toJSON().secret), false);

  const saved = registry.upsert(adopted.registryUpsert);
  assert.equal(saved.ok, true);
  vault.files[file.path].content = adopted.targetPatch.markdown;
  const resolved = await resolveMarkdownSyncLink(
    adopted.link,
    "Maps/Legacy.canvas",
    registry,
    vault
  );
  assert.equal(resolved.ok, true);
});

test("Canvas rename/migration moves the private binding while preserving authorization", async () => {
  const file = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [file.path]: file });
  const registry = createMarkdownSyncOwnership();
  const adopted = await adoptedMarkdown("Maps/Old.canvas", file.path, vault, registry);

  const migration = registry.renameCanvas("Maps/Old.canvas", "Maps/New.canvas");
  assert.equal(migration.ok, true);
  const moved = await resolveMarkdownSyncLink(
    migration.links[0],
    "Maps/New.canvas",
    registry,
    vault
  );
  assert.equal(moved.ok, true);

  const stale = await resolveMarkdownSyncLink(
    adopted.link,
    "Maps/Old.canvas",
    registry,
    vault
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, LINK_REASON.WRONG_CANVAS);

  // The migration operation is explicit and idempotent for the same path.
  assert.equal(registry.migrateCanvas("Maps/New.canvas", "Maps/New.canvas").ok, true);
});

test("a second Canvas conflicts and replace explicitly revokes the first link", async () => {
  const file = markdownFile("Maps/Project.md", "# Project\n");
  const vault = disposableVault({ [file.path]: file });
  const registry = createMarkdownSyncOwnership();
  const first = await adoptedMarkdown("Maps/One.canvas", file.path, vault, registry);

  vault.calls.length = 0;
  const refused = await adoptMarkdownSyncLink(
    { path: file.path },
    "Maps/Two.canvas",
    registry,
    vault,
    { confirmed: true }
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, LINK_REASON.ALREADY_OWNED);
  assert.deepEqual(vault.calls, []);
  assert.equal(file.content, first.targetPatch.markdown);

  const replacement = await adoptMarkdownSyncLink(
    { path: file.path },
    "Maps/Two.canvas",
    registry,
    vault,
    { confirmed: true, replaceExisting: true }
  );
  assert.equal(replacement.ok, true);
  assert.equal(replacement.replaces.canvasPath, "Maps/One.canvas");
  persistedRegistry(registry, vault, replacement, { replaceExisting: true });

  const old = await resolveMarkdownSyncLink(first.link, "Maps/One.canvas", registry, vault);
  assert.equal(old.ok, false);
  const current = await resolveMarkdownSyncLink(
    replacement.link,
    "Maps/Two.canvas",
    registry,
    vault
  );
  assert.equal(current.ok, true);
});

test("a public target token remains defense-in-depth but never authorizes", async () => {
  const syncId = createSyncId();
  const file = markdownFile("Maps/Project.md", ownedMarkdown(syncId));
  const vault = disposableVault({ [file.path]: file });
  const registry = createMarkdownSyncOwnership();

  const result = await resolveMarkdownSyncLink(
    { path: file.path, syncId, proof: unownedProof() },
    "Maps/Project.canvas",
    registry,
    vault
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, LINK_REASON.RECORD_MISSING);
  assert.deepEqual(vault.calls, []);
});

test("a legacy link without a private proof is rejected before any I/O", async () => {
  const file = markdownFile("Maps/Legacy.md", ownedMarkdown(createSyncId()));
  const vault = disposableVault({ [file.path]: file });
  const registry = createMarkdownSyncOwnership();

  for (const link of [
    { path: file.path },
    { path: file.path, syncId: createSyncId() }
  ]) {
    const result = await resolveMarkdownSyncLink(
      link,
      "Maps/Legacy.canvas",
      registry,
      vault
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, LINK_REASON.NEEDS_CONFIRMATION);
  }
  assert.deepEqual(vault.calls, []);
  assertNoWrites(vault);
});

test("adoption does not write proof, secret, or records into a parent Canvas card", async () => {
  const parent = canvasFile("Maps/Parent.canvas", [
    {
      ...nestedMapCard("card-1", "Maps/Child.canvas"),
      unknownData: {
        ...nestedMapCard("card-1", "Maps/Child.canvas").unknownData,
        secret: "must-not-be-written",
        records: [{ path: "must-not-be-written" }]
      }
    }
  ]);
  const vault = disposableVault({ [parent.path]: parent });
  const originalParent = parent.content;
  const registry = createMarkdownSyncOwnership();

  const adopted = await adoptParentLink(
    { canvas: parent.path, nodeId: "card-1" },
    "Maps/Child.canvas",
    registry,
    vault,
    { confirmed: true }
  );
  assert.equal(adopted.ok, true);
  assert.equal(adopted.targetPatch.canvas, parent.path);
  assert.equal(adopted.targetPatch.nodeId, "card-1");
  assert.equal(adopted.targetPatch.unknownDataPatch[CARD_SYNC_KEY], adopted.link.syncId);
  assert.equal(Object.hasOwn(adopted.targetPatch.unknownDataPatch, "proof"), false);
  assert.equal(Object.hasOwn(adopted.targetPatch.unknownDataPatch, "secret"), false);
  assert.equal(Object.hasOwn(adopted.targetPatch.unknownDataPatch, "records"), false);
  assert.equal(parent.content, originalParent);

  persistedRegistry(registry, vault, adopted);
  const result = await resolveParentLink(
    adopted.link,
    "Maps/Child.canvas",
    registry,
    vault
  );
  assert.equal(result.ok, true);
});

test("the registry round-trips through JSON and rejects stale schema versions", () => {
  const registry = createMarkdownSyncOwnership({ now: () => 10 });
  const record = registry.issueRecord({
    canvasPath: "A.canvas",
    kind: "markdown",
    targetPath: "A.md",
    syncId: createSyncId(),
    nodeId: null
  });
  assert.equal(record.ok, true);
  assert.equal(registry.upsert(record.record).ok, true);

  const wire = JSON.parse(JSON.stringify(registry));
  const restored = OwnershipRegistry.fromJSON(wire);
  assert.equal(restored.isValid(), true);
  assert.deepEqual(restored.recordsForCanvas("A.canvas"), [
    record.record
  ]);

  wire.version = 99;
  assert.equal(MarkdownSyncOwnership.fromJSON(wire), null);
  assert.equal(registry.isValid(), true);
});

test("the index remains bounded and the coordinator keeps newest work per path", async () => {
  const index = new MarkdownSyncIndex({ limit: 2 });
  assert.equal(index.link("a.canvas", "A.md"), true);
  assert.equal(index.link("b.canvas", "A.md"), true);
  assert.equal(index.link("c.canvas", "B.md"), true);
  assert.equal(index.link("d.canvas", "C.md"), false);
  assert.deepEqual(index.canvasesFor("A.md").sort(), ["a.canvas", "b.canvas"]);
  assert.equal(index.dropped, 1);

  const coordinator = new MarkdownSyncCoordinator({ delay: 1, maxAttempts: 3 });
  const seen = [];
  const first = coordinator.flush("A.md", async () => {
    seen.push("first");
    return { ok: false, reason: LINK_REASON.CONFLICT };
  });
  const second = coordinator.flush("A.md", async () => {
    seen.push("second");
    return { ok: true };
  });
  const results = await Promise.all([first, second]);
  assert.deepEqual(results[1], { ok: true });
  assert.ok(seen.includes("first"));
  assert.ok(seen.includes("second"));
  await coordinator.dispose();
});

test("a rejected rebind keeps the Canvas previous Markdown mapping", () => {
  const index = new MarkdownSyncIndex({ limit: 2 });
  assert.equal(index.link("a.canvas", "A.md"), true);
  assert.equal(index.link("b.canvas", "B.md"), true);

  assert.equal(index.link("d.canvas", "D.md"), false);
  assert.equal(index.link("b.canvas", "C.md"), false);

  assert.equal(index.markdownFor("b.canvas"), "B.md");
  assert.deepEqual(index.canvasesFor("B.md"), ["b.canvas"]);
  assert.deepEqual(index.canvasesFor("C.md"), []);
});

test("renaming a target merges reverse fan-out when the destination already exists", () => {
  const index = new MarkdownSyncIndex({ limit: 4 });
  assert.equal(index.link("old.canvas", "Old.md"), true);
  assert.equal(index.link("other.canvas", "New.md"), true);

  assert.equal(index.renameMarkdown("Old.md", "New.md"), true);

  assert.deepEqual(index.canvasesFor("New.md").sort(), ["old.canvas", "other.canvas"]);
  assert.deepEqual(index.canvasesFor("Old.md"), []);
  assert.equal(index.markdownFor("old.canvas"), "New.md");
  assert.equal(index.markdownFor("other.canvas"), "New.md");

  const rebind = new MarkdownSyncIndex({ limit: 2 });
  assert.equal(rebind.link("a.canvas", "A.md"), true);
  assert.equal(rebind.link("a.canvas", "B.md"), true);
  assert.deepEqual(rebind.canvasesFor("A.md"), []);
  assert.deepEqual(rebind.canvasesFor("B.md"), ["a.canvas"]);
});

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("a scheduled write coalesces, retries conflicts, and stops after disposal", async () => {
  const coordinator = new MarkdownSyncCoordinator({ delay: 1, maxAttempts: 3 });
  const seen = [];
  coordinator.schedule("A.md", async () => {
    seen.push("stale");
    return { ok: true };
  });
  coordinator.schedule("A.md", async () => {
    seen.push("newest");
    return { ok: true };
  });
  assert.deepEqual(await coordinator.flush("A.md"), { ok: true });
  assert.deepEqual(seen, ["newest"]);

  const gate = deferred();
  const blocked = coordinator.flush("B.md", async () => {
    gate.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true };
  });
  await gate.promise;
  assert.equal(coordinator.detach("B.md"), true);
  assert.deepEqual(await blocked, { ok: false, reason: LINK_REASON.DETACHED });
  await coordinator.dispose();
});

test("rename re-runs active latest work under the new path with cancellation", async () => {
  const coordinator = new MarkdownSyncCoordinator({ delay: 1, maxAttempts: 2 });
  const gate = deferred();
  const started = deferred();
  const contexts = [];
  let calls = 0;
  const result = coordinator.apply("A.md", async (context) => {
    contexts.push(context);
    calls += 1;
    if (calls === 1) {
      started.resolve();
      await gate.promise;
      return { ok: context.isCurrent(), path: context.path };
    }
    return { ok: true, path: context.path };
  });
  await started.promise;

  assert.equal(coordinator.rename("A.md", "B.md"), true);
  gate.resolve();
  assert.deepEqual(await result, {
    ok: false,
    reason: LINK_REASON.DETACHED
  });
  assert.deepEqual(await coordinator.flush("B.md"), { ok: true, path: "B.md" });
  assert.equal(calls, 2);
  assert.equal(contexts[0].isCurrent(), false);
  assert.equal(contexts[1].path, "B.md");
  assert.equal(contexts[1].isCurrent(), true);
  await coordinator.dispose();
});

test("unrelated YAML lists, tags, and multiline values do not hide the plugin block", () => {
  const syncId = createSyncId();
  const fixtures = [
    `---\ntags: [one, two]\nsubjects:\n  - alpha\n  - beta\n${OWNERSHIP_BLOCK_KEY}:\n  ${OWNERSHIP_FIELD_KEY}: "${syncId}"\n---\n\n# P\n`,
    `---\ndescription: |\n  line one\n  line two\n${OWNERSHIP_BLOCK_KEY}:\n  ${OWNERSHIP_FIELD_KEY}: "${syncId}"\n---\n\n# P\n`,
    `---\n${OWNERSHIP_BLOCK_KEY}:\n  ${OWNERSHIP_FIELD_KEY}: "${syncId}"\ntags: [after]\n---\n\n# P\n`
  ];
  for (const fixture of fixtures) {
    assert.deepEqual(parseFrontmatterOwnership(fixture), { ok: true, syncId });
    const patched = patchSyncIdOwnership(fixture, syncId);
    assert.equal(patched.ok, true);
    assert.equal(parseFrontmatterOwnership(patched.markdown).syncId, syncId);
  }
  assert.deepEqual(
    parseFrontmatterOwnership("---\ntags:\n  - one\nsubjects: [a, b]\n---\n\n# P\n"),
    { ok: true, syncId: null }
  );
  assert.equal(
    parseFrontmatterOwnership(`---\n${OWNERSHIP_BLOCK_KEY}:\n  secret: hidden\n  ${OWNERSHIP_FIELD_KEY}: "${syncId}"\n---\n`).reason,
    LINK_REASON.MALFORMED_TARGET
  );
  assert.equal(
    parseFrontmatterOwnership(`---\n${OWNERSHIP_BLOCK_KEY}:\n  ${OWNERSHIP_FIELD_KEY}: "${syncId}"\njust text\n---\n`).reason,
    LINK_REASON.MALFORMED_TARGET
  );
});

test("flushAll repeats snapshots for generations queued during a drain", async () => {
  const coordinator = new MarkdownSyncCoordinator({ delay: 50, maxAttempts: 2 });
  const order = [];
  const first = async () => {
    order.push("first");
    coordinator.schedule("A.md", async () => {
      order.push("second");
      return { ok: true };
    });
    return { ok: true };
  };

  coordinator.schedule("A.md", first);
  const result = await coordinator.flushAll();
  assert.deepEqual(result, { ok: true, passes: 2 });
  assert.deepEqual(order, ["first", "second"]);
  await coordinator.dispose();
});

test("dispose rejects late schedules and surfaces an unsaved generation", async () => {
  const coordinator = new MarkdownSyncCoordinator({ delay: 1 });
  const entered = deferred();
  const release = deferred();
  const inFlight = coordinator.apply("A.md", async () => {
    entered.resolve();
    await release.promise;
    return { ok: true };
  });
  await entered.promise;
  const disposing = coordinator.dispose();
  const late = await coordinator.schedule("B.md", async () => ({ ok: true }));
  assert.deepEqual(late, { ok: false, reason: LINK_REASON.DISPOSING });
  const lateExisting = await coordinator.schedule("A.md", async () => ({ ok: true }));
  assert.deepEqual(lateExisting, { ok: false, reason: LINK_REASON.DISPOSING });
  release.resolve();
  assert.deepEqual(await inFlight, { ok: true });
  const disposal = await disposing;
  assert.equal(disposal.ok, false);
  assert.equal(disposal.reason, LINK_REASON.UNSAVED);
  assert.equal(coordinator.entries.has("A.md"), true);
  assert.equal(coordinator.disposed, false);

  const unsaved = new MarkdownSyncCoordinator({ delay: 1 });
  unsaved.schedule("C.md", async () => ({ ok: false, reason: LINK_REASON.FAILED }));
  const result = await unsaved.dispose();
  assert.equal(result.ok, false);
  assert.equal(result.reason, LINK_REASON.UNSAVED);
  assert.equal(unsaved.entries.has("C.md"), true);
});

test("the legacy frontmatter codec remains byte-preserving and never stores a proof", () => {
  const syncId = createSyncId();
  const source = "﻿---\r\ntags: [a]\r\n---\r\n\r\n# P\r\n";
  const patched = patchSyncIdOwnership(source, syncId);
  assert.equal(patched.ok, true);
  assert.equal(parseFrontmatterOwnership(patched.markdown).syncId, syncId);
  assert.equal(patched.markdown.includes("proof"), false);
  assert.deepEqual(syncIdFrontmatterLines(syncId), [
    `${OWNERSHIP_BLOCK_KEY}:`,
    `  ${OWNERSHIP_FIELD_KEY}: "${syncId}"`
  ]);
  const path = allocateFilePath("", "100% done");
  assert.equal(path, "100% done.md");
});
