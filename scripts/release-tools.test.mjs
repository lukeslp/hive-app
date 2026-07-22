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

test("release verification never launches the signed app", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-mac-release.sh"),
    "utf8"
  );
  assert.equal(source.includes("Contents/MacOS/IdeaTiles"), false);
  assert.equal(source.includes("mktemp"), false);
  assert.ok(source.includes("codesign --verify"));
  assert.ok(source.includes("stapler validate"));
  assert.ok(source.includes("spctl --assess"));
});

test("Mac privacy manifest declares only the audited UserDefaults reason", () => {
  const manifestPath = path.join(
    root,
    "macos/IdeaTiles/PrivacyInfo.xcprivacy"
  );
  assert.ok(fs.existsSync(manifestPath), "missing Mac privacy manifest");
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(
    manifest,
    /<key>NSPrivacyTrackingDomains<\/key>\s*<array\s*\/>/
  );
  assert.match(
    manifest,
    /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\s*\/>/
  );
  assert.match(
    manifest,
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>NSPrivacyAccessedAPICategoryUserDefaults<\/string>/
  );
  assert.match(manifest, /<string>CA92\.1<\/string>/);
  assert.equal(
    (manifest.match(/NSPrivacyAccessedAPICategory/g) ?? []).length,
    1,
    "unexpected unaudited required-reason API category"
  );

  const project = fs.readFileSync(path.join(root, "macos/project.yml"), "utf8");
  assert.match(
    project,
    /path: IdeaTiles\/PrivacyInfo\.xcprivacy\s+buildPhase: resources/
  );
});

test("every Mac release lane verifies the bundled privacy manifest", () => {
  const common = fs.readFileSync(
    path.join(root, "scripts/lib/mac-release-common.sh"),
    "utf8"
  );
  assert.ok(common.includes('Contents/Resources/PrivacyInfo.xcprivacy'));
  assert.ok(common.includes("NSPrivacyAccessedAPICategoryUserDefaults"));
  assert.ok(common.includes("CA92.1"));

  for (const releaseScript of [
    "scripts/archive-mac-app-store.sh",
    "scripts/release-mac-direct.sh",
  ]) {
    const source = fs.readFileSync(path.join(root, releaseScript), "utf8");
    assert.ok(
      source.includes('verify_release_metadata "$app_path"'),
      `${releaseScript} must validate archive resources`
    );
  }
});

test("public privacy copy covers each native Mac data path and artifact sync control", () => {
  const privacy = fs
    .readFileSync(
    path.join(root, "client/public/privacy.html"),
    "utf8"
    )
    .replace(/\s+/g, " ");
  assert.ok(privacy.includes("Apple Foundation Models"));
  assert.ok(privacy.includes("stored in your Mac's Keychain"));
  assert.ok(privacy.includes("directly to that provider"));
  assert.ok(privacy.includes("Dreamer gateway"));
  assert.ok(privacy.includes("does not promise a fixed retention period"));
  assert.ok(privacy.includes("Text artifact content is included"));
  assert.ok(privacy.includes("image file is uploaded only if you select it"));
});

test("Mac target compiles the existing Idea Tiles artwork as its app icon", () => {
  const catalog = path.join(root, "macos/IdeaTiles/Assets.xcassets");
  const contents = path.join(catalog, "AppIcon.appiconset/Contents.json");
  assert.ok(fs.existsSync(contents), "missing Mac AppIcon asset catalog");
  const definition = JSON.parse(fs.readFileSync(contents, "utf8"));
  const representations = definition.images.filter((image) => image.filename);
  assert.equal(representations.length, 10);
  for (const image of representations) {
    assert.ok(
      fs.existsSync(path.join(path.dirname(contents), image.filename)),
      `missing ${image.filename}`
    );
  }

  const project = fs.readFileSync(path.join(root, "macos/project.yml"), "utf8");
  assert.ok(project.includes("ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon"));

  const common = fs.readFileSync(
    path.join(root, "scripts/lib/mac-release-common.sh"),
    "utf8"
  );
  assert.ok(common.includes('Contents/Resources/AppIcon.icns'));
});

test("cloud defaults and their release review date remain explicit", () => {
  const proxy = fs.readFileSync(path.join(root, "server/llmProxy.ts"), "utf8");
  assert.ok(proxy.includes('const model = "gemini-3.6-flash"'));
  assert.ok(proxy.includes('const model = "grok-4.5"'));
  assert.equal(proxy.includes("gemini-2.0-flash"), false);
  assert.equal(proxy.includes("grok-3-mini-fast"), false);

  const releaseGuide = fs.readFileSync(
    path.join(root, "docs/MAC_DISTRIBUTION.md"),
    "utf8"
  );
  assert.ok(releaseGuide.includes("Provider defaults last reviewed: 2026-07-21"));
  for (const model of [
    "gemini-3.6-flash",
    "claude-haiku-4-5-20251001",
    "gpt-5.6-luna",
    "grok-4.5",
    "mistral-small-latest",
  ]) {
    assert.ok(releaseGuide.includes(model));
  }
});
