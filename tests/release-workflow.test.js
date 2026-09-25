"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflow = fs.readFileSync(
  path.resolve(__dirname, "..", ".github", "workflows", "verify-release.yml"),
  "utf8"
);
const readme = fs.readFileSync(path.resolve(__dirname, "..", "README.md"), "utf8");

function section(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing workflow job ${name}`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length;
  return workflow.slice(start, end < 0 ? workflow.length : end);
}

test("publication is tag-only and cannot be reached by main or pull requests", () => {
  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /tags:\s*\n\s+- ['"]\[0-9\]\*['"]/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(section("release"), /needs:\s+verify/);
  assert.match(
    section("release"),
    /if:\s+\$\{\{\s*github\.event_name == ['"]push['"] && startsWith\(github\.ref, ['"]refs\/tags\/['"]\)\s*\}\}/
  );
});

test("the release job consumes one verified handoff without rebuilding", () => {
  assert.equal((workflow.match(/npm run build/g) || []).length, 1);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.equal((workflow.match(/actions\/download-artifact@[0-9a-f]{40}/g) || []).length, 1);
  assert.doesNotMatch(workflow, /zip -q/);
  const release = section("release");
  assert.doesNotMatch(release, /npm ci|npm run build|npm run check|actions\/checkout/);
  assert.match(release, /sha256sum --check --strict handoff\.sha256/);
  assert.match(workflow, /--tag "\$RELEASE_TAG"[\s\S]*--expected-sha "\$EVENT_SHA"/);
  assert.match(release, /release-artifacts\.js['"]?\s+verify/);
  assert.match(release, /gh release create/);
  assert.doesNotMatch(release, /--clobber|gh release upload|repair/i);
});

test("the browser vector smoke check is bounded and emits a diagnostic artifact", () => {
  assert.match(workflow, /npm run verify:vector-pdf -- --output "\$RUNNER_TEMP\/vector-pdf-smoke\.pdf"/);
  assert.match(workflow, /timeout 180s npm run verify:vector-pdf/);
  assert.match(workflow, /PUPPETEER_CHANNEL: chrome/);
  assert.match(workflow, /vector-pdf-smoke\.log/);
  assert.match(workflow, /Upload vector PDF smoke artifact/);
});

test("release assets are immutable, licensed, hashed, and exclude runtime data", () => {
  assert.doesNotMatch(workflow, /(?<![A-Za-z])data\.json/);
  for (const required of ["LICENSE", "THIRD_PARTY_NOTICES.txt", "SHA256SUMS"])
    assert.match(workflow, new RegExp(required.replace(".", "\\.")));
  assert.match(workflow, /if gh release view "\$tag"[\s\S]*?exit 1/);
  assert.match(workflow, /--verify-tag/);
  assert.match(workflow, /github\.sha|EVENT_SHA/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.equal((workflow.match(/contents:\s*write/g) || []).length, 1);
});

test("README records compatibility, export, and data-preservation policy", () => {
  assert.match(readme, /## Compatibility/);
  assert.match(readme, /## Export policy/);
  assert.match(readme, /remote HTTP\(S\) resources are omitted/);
  assert.match(readme, /no user allowlist setting/);
  assert.match(readme, /data\.json/);
  assert.match(readme, /SHA256SUMS/);
});

test("all GitHub actions are pinned to reviewed full commit SHAs", () => {
  const reviewed = new Map([
    ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
    ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
    ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
    ["actions/download-artifact", "d3f86a106a0bac45b974a628896c90dbdf5c8093"]
  ]);
  const uses = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses) {
    const [action, sha] = reference.split("@");
    assert.match(reference, /^actions\/[^\s@]+@[0-9a-f]{40}$/);
    assert.equal(sha, reviewed.get(action), `unreviewed action pin: ${reference}`);
  }
});
