import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const scripts = [
  "scripts/lib/mac-release-common.sh",
  "scripts/archive-mac-app-store.sh",
  "scripts/release-mac-direct.sh",
  "scripts/verify-mac-release.sh",
];

test("release shell scripts have valid Bash syntax", () => {
  for (const script of scripts) {
    execFileSync("bash", ["-n", path.join(root, script)]);
  }
});

test("repository integration validation passes", () => {
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/check-apple-versions.mjs")],
    {
      cwd: root,
      stdio: "pipe",
    }
  );
});

test("notarization is gated by an explicit Keychain profile", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/release-mac-direct.sh"),
    "utf8"
  );
  const guard = source.indexOf(
    "refusing to build a direct release without explicit IDEATILES_NOTARY_KEYCHAIN_PROFILE"
  );
  const submit = source.indexOf("notarytool submit");
  const archiveOnly = source.indexOf('if [[ "$mode" == "archive-only" ]]');
  assert.ok(guard >= 0, "missing explicit notary profile guard");
  assert.ok(
    archiveOnly > guard,
    "missing archive-only signing verification path"
  );
  assert.ok(
    submit > archiveOnly,
    "archive-only mode must exit before submission"
  );
  assert.ok(
    submit > guard,
    "notary submission must occur after the profile guard"
  );
  assert.equal(source.includes("--apple-id"), false);
  assert.equal(source.includes("--password"), false);
});
