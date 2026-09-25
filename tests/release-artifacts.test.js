"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "release-artifacts.js");

function runReleaseScript(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function createTaggedFixture(temporary, version) {
  const fixture = path.join(temporary, "source");
  fs.mkdirSync(fixture, { recursive: true });
  for (const name of [
    "package.json",
    "package-lock.json",
    "manifest.json",
    "main.js",
    "styles.css",
    "LICENSE",
    "THIRD_PARTY_NOTICES.txt"
  ])
    fs.copyFileSync(path.join(root, name), path.join(fixture, name));
  fs.mkdirSync(path.join(fixture, "lib"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "lib", "vector-pdf-bundle.js"),
    path.join(fixture, "lib", "vector-pdf-bundle.js")
  );
  fs.copyFileSync(path.join(root, "lib", "README.md"), path.join(fixture, "lib", "README.md"));
  fs.mkdirSync(path.join(fixture, "scripts"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "scripts", "runtime-modules.js"),
    path.join(fixture, "scripts", "runtime-modules.js")
  );
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(fixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
  const git = (...args) => execFileSync("git", ["-C", fixture, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "release-test@example.invalid");
  git("config", "user.name", "Release Test");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  git("tag", version);
  return { fixture, sha: git("rev-parse", "HEAD").trim() };
}

test("notices are deterministic and include reviewed shipped dependency terms", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-notices-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const first = path.join(temporary, "first.txt");
  const second = path.join(temporary, "second.txt");

  for (const output of [first, second]) {
    const result = runReleaseScript(["notices", "--root", root, "--output", output]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const firstBytes = fs.readFileSync(first);
  const secondBytes = fs.readFileSync(second);
  assert.deepEqual(firstBytes, secondBytes);
  const notices = firstBytes.toString("utf8");
  assert.match(notices, /jspdf@4\.2\.1/);
  assert.match(notices, /svg2pdf\.js@2\.8\.1/);
  assert.match(notices, /dompurify@3\.4\.14[\s\S]*?\(MPL-2\.0 OR Apache-2\.0\)/);
  assert.match(notices, /pako@2\.2\.0[\s\S]*?\(MIT AND Zlib\)/);
  assert.match(notices, /rgbcolor@1\.0\.1[\s\S]*?MIT OR SEE LICENSE IN FEEL-FREE\.md/);
  assert.match(notices, /does not state a legal conclusion/);
});

test("the committed third-party notice file matches the locked shipped bundle", () => {
  const result = runReleaseScript(["notices", "--root", root, "--check"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /THIRD_PARTY_NOTICES\.txt is current/);
});

test("the runtime module inventory is derived from the compiler registry", () => {
  const result = runReleaseScript(["runtime-inventory", "--root", root, "--check"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /lib\/README\.md runtime inventory is current/);
});

test("runtime inventory writing follows the registry rather than a fixed list", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-inventory-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(temporary, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(temporary, "scripts", "runtime-modules.js"),
    'module.exports = { modules: [{ name: "fixture", source: "lib/fixture.js" }] };\n'
  );
  fs.writeFileSync(
    path.join(temporary, "lib", "README.md"),
    "# Runtime modules\n\n<!-- BEGIN runtime-module-inventory -->\n<!-- END runtime-module-inventory -->\n"
  );

  const result = runReleaseScript(["runtime-inventory", "--root", temporary, "--write"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    fs.readFileSync(path.join(temporary, "lib", "README.md"), "utf8"),
    /- `fixture` — `lib\/fixture\.js`/
  );
});

test("prepare refuses to run without immutable tag or SHA provenance", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-provenance-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const { fixture } = createTaggedFixture(temporary, version);
  const result = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "release")
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--tag or --expected-sha/);
});

test("prepare creates a deterministic archive with fixed metadata and no data.json", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-release-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const { fixture, sha } = createTaggedFixture(temporary, version);

  for (const output of [first, second]) {
    const result = runReleaseScript([
      "prepare",
      "--root",
      fixture,
      "--out",
      output,
      "--tag",
      version,
      "--expected-sha",
      sha
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const firstFiles = fs.readdirSync(first).sort();
  const secondFiles = fs.readdirSync(second).sort();
  const archiveName = `tomindmap-${version}.zip`;
  assert.deepEqual(firstFiles, secondFiles);
  assert.deepEqual(firstFiles, [
    "LICENSE",
    "SHA256SUMS",
    "THIRD_PARTY_NOTICES.txt",
    "handoff.sha256",
    "main.js",
    "manifest.json",
    "release-artifacts.js",
    "release-metadata.json",
    "styles.css",
    archiveName
  ]);
  assert.equal(firstFiles.includes("data.json"), false);
  assert.deepEqual(
    fs.readFileSync(path.join(first, "SHA256SUMS")),
    fs.readFileSync(path.join(second, "SHA256SUMS"))
  );
  const checksumLines = fs.readFileSync(path.join(first, "SHA256SUMS"), "utf8").trim().split("\n");
  assert.deepEqual(
    checksumLines.map((line) => line.split("  ", 2)[1]).sort(),
    ["LICENSE", "THIRD_PARTY_NOTICES.txt", "main.js", "manifest.json", "styles.css", archiveName].sort()
  );
  for (const line of checksumLines) {
    const [digest, name] = line.split("  ", 2);
    assert.equal(digest, crypto.createHash("sha256").update(fs.readFileSync(path.join(first, name))).digest("hex"));
  }
  assert.deepEqual(
    fs.readFileSync(path.join(first, archiveName)),
    fs.readFileSync(path.join(second, archiveName))
  );

  const zip = fs.readFileSync(path.join(first, archiveName));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(8), 0);
  assert.equal(zip.readUInt16LE(12), 0x21);
  const zipNames = [];
  for (let offset = 0; offset <= zip.length - 46; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = zip.readUInt16LE(offset + 28);
    zipNames.push(zip.subarray(offset + 46, offset + 46 + length).toString("utf8"));
  }
  assert.equal(zipNames.includes("data.json"), false);

  const verify = runReleaseScript(["verify", "--input", first]);
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);

  fs.appendFileSync(path.join(first, "main.js"), "tampered\n");
  const tampered = runReleaseScript(["verify", "--input", first]);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /mismatch|metadata/i);
});

test("prepare refuses to overwrite an existing handoff directory", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-existing-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, "release");
  fs.mkdirSync(output);
  const sentinel = path.join(output, "keep.txt");
  fs.writeFileSync(sentinel, "user data\n");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const { fixture, sha } = createTaggedFixture(temporary, version);

  const result = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    output,
    "--tag",
    version,
    "--expected-sha",
    sha
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to overwrite/i);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "user data\n");
});

test("prepare accepts either immutable tag or full source SHA provenance", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tomindmap-tag-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const { fixture, sha } = createTaggedFixture(temporary, version);
  const output = path.join(temporary, "release");

  const valid = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    output,
    "--tag",
    version,
    "--expected-sha",
    sha
  ]);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  const tagOnly = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "tag-only"),
    "--tag",
    version
  ]);
  assert.equal(tagOnly.status, 0, tagOnly.stderr || tagOnly.stdout);

  const shaOnly = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "sha-only"),
    "--expected-sha",
    sha
  ]);
  assert.equal(shaOnly.status, 0, shaOnly.stderr || shaOnly.stdout);

  fs.appendFileSync(path.join(fixture, "styles.css"), "dirty\n");
  const dirty = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "dirty"),
    "--tag",
    version,
    "--expected-sha",
    sha
  ]);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /clean/i);

  const wrongSha = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "wrong-sha"),
    "--tag",
    version,
    "--expected-sha",
    "0".repeat(40)
  ]);
  assert.notEqual(wrongSha.status, 0, `${wrongSha.stdout}\n${wrongSha.stderr}`);
  assert.match(wrongSha.stderr, /expected source SHA/i);

  const wrongTag = runReleaseScript([
    "prepare",
    "--root",
    fixture,
    "--out",
    path.join(temporary, "wrong-tag"),
    "--tag",
    "9.9.9",
    "--expected-sha",
    sha
  ]);
  assert.notEqual(wrongTag.status, 0);
  assert.match(wrongTag.stderr, /does not match version/i);
});
