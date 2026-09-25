"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// This table is intentionally explicit: a new bundled package or changed
// license label must be reviewed before the generated notice file can change.
const REVIEWED_PACKAGE_NOTICES = Object.freeze({
  "@babel/runtime": { license: "MIT", files: ["LICENSE"] },
  canvg: { license: "MIT", files: ["LICENSE"] },
  "core-js": { license: "MIT", files: ["LICENSE"] },
  cssesc: { license: "MIT", files: ["LICENSE-MIT.txt"] },
  dompurify: {
    license: "(MPL-2.0 OR Apache-2.0)",
    files: ["LICENSE", "LICENSE-MPL"]
  },
  "fast-png": { license: "MIT", files: ["LICENSE"] },
  fflate: { license: "MIT", files: ["LICENSE"] },
  "font-family-papandreou": { license: "MIT", files: ["LICENSE"] },
  html2canvas: { license: "MIT", files: ["LICENSE"] },
  iobuffer: { license: "MIT", files: ["LICENSE"] },
  jspdf: { license: "MIT", files: ["LICENSE"] },
  pako: {
    license: "(MIT AND Zlib)",
    files: ["LICENSE"],
    sourceBanners: ["dist/pako.esm.mjs"]
  },
  "performance-now": { license: "MIT", files: ["license.txt"] },
  raf: { license: "MIT", files: ["LICENSE"] },
  rgbcolor: {
    license: "MIT OR SEE LICENSE IN FEEL-FREE.md",
    files: ["LICENSE.md", "FEEL-FREE.md"]
  },
  specificity: { license: "MIT", files: ["LICENSE"] },
  "stackblur-canvas": { license: "MIT", files: ["LICENSE-MIT.txt"] },
  "svg-pathdata": { license: "MIT", files: ["LICENSE"] },
  "svg2pdf.js": { license: "MIT", files: ["LICENSE"] },
  svgpath: { license: "MIT", files: ["LICENSE"] }
});

const RELEASE_ASSET_NAMES = Object.freeze([
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
  "manifest.json",
  "main.js",
  "styles.css"
]);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ZIP_DATE = 0x21;
const ZIP_TIME = 0;
const ZIP_MODE = 0x81a40000;

function parseArguments(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--"))
      throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (name === "check" || name === "write") {
      options[name] = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for --${name}`);
    const optionName = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[optionName] = value;
    index += 1;
  }
  return { command, options };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function git(root, args) {
  return childProcess.execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function assertVersionMetadata(root) {
  const packageJson = readJson(path.join(root, "package.json"));
  const manifest = readJson(path.join(root, "manifest.json"));
  const lock = readJson(path.join(root, "package-lock.json"));
  const version = packageJson.version;
  if (!VERSION_PATTERN.test(version))
    throw new Error(`Release version is not a numeric semantic version: ${version}`);
  if (manifest.version !== version || lock.version !== version || lock.packages?.[""]?.version !== version)
    throw new Error("package.json, manifest.json, and package-lock.json versions must match");
  return { version, manifest };
}

function assertSourceProvenance(root, tag, expectedSha) {
  if (tag === undefined && expectedSha === undefined)
    throw new Error("Release preparation requires --tag or --expected-sha");
  const version = assertVersionMetadata(root).version;
  if (tag !== undefined && !VERSION_PATTERN.test(tag))
    throw new Error(`Release tag is not a numeric semantic version: ${tag}`);
  if (tag !== undefined && tag !== version)
    throw new Error(`Release tag ${tag} does not match version ${version}`);
  const head = git(root, ["rev-parse", "HEAD"]).toLowerCase();
  let commit = head;
  if (tag !== undefined) {
    let tagCommit;
    try {
      tagCommit = git(root, ["rev-parse", `refs/tags/${tag}^{commit}`]).toLowerCase();
    } catch (error) {
      throw new Error(`Release tag ${tag} is not available in the checkout`);
    }
    if (tagCommit !== head)
      throw new Error(`Release tag ${tag} does not resolve to the checked-out commit`);
  }
  if (expectedSha !== undefined) {
    if (!/^[0-9a-f]{40}$/i.test(expectedSha))
      throw new Error("Expected source SHA must be a full 40-character commit SHA");
    if (head !== expectedSha.toLowerCase())
      throw new Error("Checked-out HEAD does not match the expected source SHA");
  }
  const status = git(root, ["status", "--porcelain", "--untracked-files=all"]);
  if (status)
    throw new Error("Release checkout must be clean before packaging");
  return { version, tag: tag || version, commit: expectedSha ? expectedSha.toLowerCase() : head };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipLocalHeader(name, size, checksum) {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(ZIP_TIME, 10);
  header.writeUInt16LE(ZIP_DATE, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  nameBytes.copy(header, 30);
  return header;
}

function zipCentralHeader(name, size, checksum, offset) {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(46 + nameBytes.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(ZIP_TIME, 12);
  header.writeUInt16LE(ZIP_DATE, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(ZIP_MODE, 38);
  header.writeUInt32LE(offset, 42);
  nameBytes.copy(header, 46);
  return header;
}

function createDeterministicZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  let centralSize = 0;
  for (const name of [...entries.keys()].sort()) {
    const content = entries.get(name);
    const checksum = crc32(content);
    const local = zipLocalHeader(name, content.length, checksum);
    localChunks.push(local, content);
    centralChunks.push(zipCentralHeader(name, content.length, checksum, offset));
    offset += local.length + content.length;
    centralSize += centralChunks[centralChunks.length - 1].length;
  }
  const central = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localChunks, central, end]);
}

function parseChecksumFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) throw new Error(`Malformed checksum line in ${path.basename(filePath)}`);
    if (entries.has(match[2])) throw new Error(`Duplicate checksum entry: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function writeChecksumFile(filePath, names, root) {
  const lines = [...names].sort().map((name) => `${fileSha256(path.join(root, name))}  ${name}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, { flag: "wx" });
}

function assertChecksumFile(filePath, names, root) {
  const actual = parseChecksumFile(filePath);
  const expectedNames = [...names].sort();
  if (actual.size !== expectedNames.length || expectedNames.some((name) => !actual.has(name)))
    throw new Error(`Checksum inventory does not match the release handoff: ${path.basename(filePath)}`);
  for (const name of expectedNames) {
    if (actual.get(name) !== fileSha256(path.join(root, name)))
      throw new Error(`Checksum mismatch for ${name}`);
  }
}

function shippedPackageNames(root) {
  const bundle = fs.readFileSync(
    path.join(root, "lib", "vector-pdf-bundle.js"),
    "utf8"
  );
  const names = new Set();
  for (const match of bundle.matchAll(/^\/\/ node_modules\/((?:@[^/]+\/)?[^/]+)\//gm))
    names.add(match[1]);
  return [...names].sort();
}

// Keep package notice text stable across checkouts without changing its words.
function normalizedText(value) {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd();
}

function leadingSourceBanner(filePath) {
  const source = normalizedText(fs.readFileSync(filePath, "utf8"));
  const start = source.indexOf("/*!");
  if (start < 0)
    throw new Error(`Missing leading source notice: ${filePath}`);
  const end = source.indexOf("\n\n", start);
  if (end < 0)
    throw new Error(`Unterminated leading source notice: ${filePath}`);
  return source.slice(start, end).trim();
}

function generateNotices(root) {
  const lock = readJson(path.join(root, "package-lock.json"));
  const shippedNames = shippedPackageNames(root);
  const reviewedNames = Object.keys(REVIEWED_PACKAGE_NOTICES).sort();
  if (shippedNames.join("\n") !== reviewedNames.join("\n")) {
    const unreviewed = shippedNames.filter((name) => !REVIEWED_PACKAGE_NOTICES[name]);
    const stale = reviewedNames.filter((name) => !shippedNames.includes(name));
    throw new Error(
      `Shipped dependency review is out of date (unreviewed: ${unreviewed.join(", ") || "none"}; ` +
      `not shipped: ${stale.join(", ") || "none"})`
    );
  }

  const sections = [
    "THIRD-PARTY NOTICES",
    "===================",
    "",
    "This file is generated from package-lock.json and the package paths present",
    "in lib/vector-pdf-bundle.js. License labels are the reviewed package metadata",
    "labels reproduced below; this inventory does not state a legal conclusion.",
    "Review custom and dual-license terms before redistribution.",
    ""
  ];
  for (const name of shippedNames) {
    const review = REVIEWED_PACKAGE_NOTICES[name];
    const packageRoot = path.join(root, "node_modules", ...name.split("/"));
    const installed = readJson(path.join(packageRoot, "package.json"));
    const locked = lock.packages?.[`node_modules/${name}`];
    if (!locked || typeof locked.version !== "string" || typeof locked.integrity !== "string")
      throw new Error(`Missing locked integrity for shipped dependency: ${name}`);
    if (locked.license !== review.license || installed.version !== locked.version ||
        installed.license !== review.license) {
      throw new Error(`Locked or installed license metadata changed for ${name}`);
    }

    sections.push(
      `${name}@${locked.version}`,
      `License label: ${locked.license}`,
      `Lock integrity: ${locked.integrity}`,
      ""
    );
    for (const file of review.files) {
      const licenseText = normalizedText(fs.readFileSync(path.join(packageRoot, file), "utf8"));
      sections.push(`----- ${name}: ${file} -----`, licenseText, "");
    }
    for (const file of review.sourceBanners || []) {
      sections.push(
        `----- ${name}: leading notice from ${file} -----`,
        leadingSourceBanner(path.join(packageRoot, file)),
        ""
      );
    }
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

const INVENTORY_START = "<!-- BEGIN runtime-module-inventory -->";
const INVENTORY_END = "<!-- END runtime-module-inventory -->";

function renderRuntimeInventory(root) {
  const registry = require(path.join(root, "scripts", "runtime-modules.js"));
  const lines = registry.modules.map((definition) => {
    const source = path.posix.normalize(definition.source);
    if (definition.name === "vector-pdf") {
      return `- \`${definition.name}\` — \`${source}\` (generated from ` +
        "`lib/vector-pdf-entry.js`; the entry file is not separately embedded)";
    }
    return `- \`${definition.name}\` — \`${source}\``;
  });
  return `${INVENTORY_START}\n${lines.join("\n")}\n${INVENTORY_END}\n`;
}

function readDeterministicZip(filePath) {
  const archive = fs.readFileSync(filePath);
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0)
    throw new Error("ZIP end-of-central-directory record is missing");
  const count = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize > endOffset)
    throw new Error("ZIP central directory is out of bounds");
  const entries = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("Malformed ZIP central directory");
    const method = archive.readUInt16LE(cursor + 10);
    const time = archive.readUInt16LE(cursor + 12);
    const date = archive.readUInt16LE(cursor + 14);
    const checksum = archive.readUInt32LE(cursor + 16);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (method !== 0 || time !== ZIP_TIME || date !== ZIP_DATE || externalAttributes !== ZIP_MODE)
      throw new Error(`ZIP metadata is not deterministic for ${name}`);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error(`Malformed ZIP local header for ${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + size);
    if (crc32(data) !== checksum)
      throw new Error(`ZIP checksum mismatch for ${name}`);
    entries.set(name, Buffer.from(data));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function assertRuntimeInventory(root) {
  const readme = fs.readFileSync(path.join(root, "lib", "README.md"), "utf8");
  if (!readme.includes(renderRuntimeInventory(root)))
    throw new Error("lib/README.md runtime inventory is stale");
}

function prepareRelease(options) {
  if (!options.out)
    throw new Error("prepare requires --out <directory>");
  const root = path.resolve(options.root || path.join(__dirname, ".."));
  const output = path.resolve(options.out);
  const provenance = assertSourceProvenance(root, options.tag, options.expectedSha);
  const notices = generateNotices(root);
  const committedNotices = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES.txt"), "utf8");
  if (notices !== committedNotices)
    throw new Error("THIRD_PARTY_NOTICES.txt is stale; regenerate it before packaging");
  assertRuntimeInventory(root);
  for (const name of RELEASE_ASSET_NAMES) {
    if (!fs.statSync(path.join(root, name)).isFile())
      throw new Error(`Required release asset is missing: ${name}`);
  }
  if (fs.existsSync(output) && fs.readdirSync(output).length > 0)
    throw new Error(`Refusing to overwrite non-empty release directory: ${output}`);
  fs.mkdirSync(output, { recursive: true });

  const sourceEntries = new Map();
  for (const name of RELEASE_ASSET_NAMES) {
    const content = fs.readFileSync(path.join(root, name));
    sourceEntries.set(name, content);
    fs.writeFileSync(path.join(output, name), content, { flag: "wx" });
  }
  if (sourceEntries.has("data.json"))
    throw new Error("data.json must not be shipped as a release asset");
  const archiveName = `tomindmap-${provenance.version}.zip`;
  const archive = createDeterministicZip(sourceEntries);
  fs.writeFileSync(path.join(output, archiveName), archive, { flag: "wx" });
  const checksumNames = [...RELEASE_ASSET_NAMES, archiveName].sort();
  writeChecksumFile(path.join(output, "SHA256SUMS"), checksumNames, output);
  fs.copyFileSync(__filename, path.join(output, "release-artifacts.js"), fs.constants.COPYFILE_EXCL);

  const assetNames = [...RELEASE_ASSET_NAMES, archiveName, "SHA256SUMS"].sort();
  const assets = assetNames.map((name) => ({
    name,
    sha256: fileSha256(path.join(output, name)),
    size: fs.statSync(path.join(output, name)).size
  }));
  const metadata = {
    schemaVersion: 1,
    product: "tomindmap",
    version: provenance.version,
    tag: provenance.tag,
    sourceCommit: provenance.commit,
    archive: archiveName,
    zipEntries: [...sourceEntries.keys()].sort(),
    assets
  };
  fs.writeFileSync(
    path.join(output, "release-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    { flag: "wx" }
  );
  const handoffNames = [
    ...assetNames,
    "release-artifacts.js",
    "release-metadata.json"
  ].sort();
  writeChecksumFile(path.join(output, "handoff.sha256"), handoffNames, output);
  if (options.githubOutput) {
    const outputPath = path.resolve(options.githubOutput);
    fs.appendFileSync(
      outputPath,
      [
        `version=${provenance.version}`,
        `tag=${provenance.tag}`,
        `archive=${archiveName}`,
        `archive_sha256=${fileSha256(path.join(output, archiveName))}`,
        ""
      ].join("\n")
    );
  }
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

function verifyRelease(options) {
  if (!options.input)
    throw new Error("verify requires --input <directory>");
  const input = path.resolve(options.input);
  const metadata = readJson(path.join(input, "release-metadata.json"));
  if (metadata.schemaVersion !== 1 || metadata.product !== "tomindmap")
    throw new Error("Unsupported release metadata");
  if (options.tag !== undefined && metadata.tag !== options.tag)
    throw new Error("Release metadata tag does not match the requested tag");
  if (options.expectedSha !== undefined && metadata.sourceCommit !== options.expectedSha.toLowerCase())
    throw new Error("Release metadata commit does not match the requested SHA");
  if (!VERSION_PATTERN.test(metadata.version) || metadata.tag !== metadata.version ||
      !/^[0-9a-f]{40}$/.test(metadata.sourceCommit) ||
      metadata.archive !== `tomindmap-${metadata.version}.zip`)
    throw new Error("Release metadata version, tag, source SHA, or archive name is invalid");
  const expectedAssetNames = [...RELEASE_ASSET_NAMES, metadata.archive, "SHA256SUMS"].sort();
  const actualAssetNames = metadata.assets.map((asset) => asset.name).sort();
  if (actualAssetNames.join("\n") !== expectedAssetNames.join("\n"))
    throw new Error("Release metadata asset inventory is invalid");
  for (const asset of metadata.assets) {
    if (asset.sha256 !== fileSha256(path.join(input, asset.name)) ||
        asset.size !== fs.statSync(path.join(input, asset.name)).size)
      throw new Error(`Release asset metadata mismatch: ${asset.name}`);
  }
  assertChecksumFile(
    path.join(input, "SHA256SUMS"),
    [...RELEASE_ASSET_NAMES, metadata.archive],
    input
  );
  const handoffNames = [...expectedAssetNames, "release-artifacts.js", "release-metadata.json"];
  assertChecksumFile(path.join(input, "handoff.sha256"), handoffNames, input);
  const zipEntries = readDeterministicZip(path.join(input, metadata.archive));
  const expectedZipNames = RELEASE_ASSET_NAMES;
  if ([...zipEntries.keys()].sort().join("\n") !== [...expectedZipNames].sort().join("\n"))
    throw new Error("Release ZIP entry inventory is invalid");
  for (const name of expectedZipNames) {
    if (!zipEntries.get(name).equals(fs.readFileSync(path.join(input, name))))
      throw new Error(`Release ZIP content mismatch: ${name}`);
  }
  if (zipEntries.has("data.json"))
    throw new Error("data.json must not be present in a release ZIP");
  process.stdout.write(`Release handoff verified: ${metadata.tag} (${metadata.sourceCommit})\n`);
}

function runRuntimeInventory(options) {
  const root = path.resolve(options.root || path.join(__dirname, ".."));
  const readmePath = path.join(root, "lib", "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");
  const generated = renderRuntimeInventory(root);
  if (options.check) {
    if (!readme.includes(generated))
      throw new Error("lib/README.md runtime inventory is stale; regenerate it from scripts/runtime-modules.js");
    process.stdout.write("lib/README.md runtime inventory is current\n");
    return;
  }
  if (!options.write)
    throw new Error("runtime-inventory requires --check or --write");
  const start = readme.indexOf(INVENTORY_START);
  const end = readme.indexOf(INVENTORY_END);
  if (start < 0 || end < start)
    throw new Error("lib/README.md is missing runtime inventory markers");
  const suffix = readme.slice(end + INVENTORY_END.length).replace(/^\n+/, "\n");
  const updated = `${readme.slice(0, start)}${generated}${suffix}`;
  fs.writeFileSync(readmePath, updated);
}

function runNotices(options) {
  const root = path.resolve(options.root || path.join(__dirname, ".."));
  const notices = generateNotices(root);
  if (options.check) {
    const committedPath = path.join(root, "THIRD_PARTY_NOTICES.txt");
    let committed = null;
    try {
      committed = fs.readFileSync(committedPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (committed !== notices)
      throw new Error("THIRD_PARTY_NOTICES.txt is stale; regenerate it from the locked shipped bundle");
    process.stdout.write("THIRD_PARTY_NOTICES.txt is current\n");
    return;
  }
  if (options.write) {
    fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.txt"), notices);
    process.stdout.write("THIRD_PARTY_NOTICES.txt regenerated\n");
    return;
  }
  if (!options.output) {
    process.stdout.write(notices);
    return;
  }
  fs.writeFileSync(path.resolve(options.output), notices, { flag: "wx" });
}

function main(args = process.argv.slice(2)) {
  const { command, options } = parseArguments(args);
  if (command === "notices") {
    runNotices(options);
    return;
  }
  if (command === "runtime-inventory") {
    runRuntimeInventory(options);
    return;
  }
  if (command === "prepare") {
    prepareRelease(options);
    return;
  }
  if (command === "verify") {
    verifyRelease(options);
    return;
  }
  throw new Error(
    "Usage: release-artifacts.js notices|runtime-inventory|prepare|verify [options]"
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  REVIEWED_PACKAGE_NOTICES,
  createDeterministicZip,
  generateNotices,
  main,
  prepareRelease,
  readDeterministicZip,
  shippedPackageNames,
  verifyRelease
};
