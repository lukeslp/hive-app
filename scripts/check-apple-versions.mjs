import fs from "node:fs";
import path from "node:path";

const EXPECTED_SEMANTIC_VERSION = "1.3.1";
const EXPECTED_APPLE_VERSION = "1.3.1";
const EXPECTED_APPLE_BUILD = "4";
const EXPECTED_ANDROID_CODE = "11000";
const APP_BUNDLE_ID = "app.hexmind.ios";
const MAC_TEST_BUNDLE_ID = "app.hexmind.ios.macos.tests";

const root = process.cwd();
const read = relativePath =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const fail = message => {
  throw new Error(`Version integration check failed: ${message}`);
};
const uniqueMatches = (contents, expression) => [
  ...new Set([...contents.matchAll(expression)].map(match => match[1])),
];
const expectOnly = (label, values, expected) => {
  if (values.length !== 1 || values[0] !== expected) {
    fail(`${label} is ${JSON.stringify(values)}; expected only ${expected}`);
  }
};
const count = (contents, value) => contents.split(value).length - 1;
const normalizedVersion = version => {
  const parts = version.split(".");
  if (!parts.every(part => /^\d+$/.test(part)) || parts.length > 3) {
    fail(`version ${version} is not a numeric semantic version`);
  }
  return [...parts, "0", "0"].slice(0, 3).join(".");
};
const expectEquivalentVersion = (label, version) => {
  if (normalizedVersion(version) !== EXPECTED_SEMANTIC_VERSION) {
    fail(
      `${label} is ${version}; expected semantic equivalent of ${EXPECTED_SEMANTIC_VERSION}`
    );
  }
};

const packageJSON = JSON.parse(read("package.json"));
if (packageJSON.version !== EXPECTED_SEMANTIC_VERSION) {
  fail(
    `package.json version is ${packageJSON.version}; expected ${EXPECTED_SEMANTIC_VERSION}`
  );
}
expectEquivalentVersion("package.json version", packageJSON.version);

const iosProjectDirectory = path.join(root, "ios/App/IdeaTiles.xcodeproj");
const capacitorProjectLink = path.join(root, "ios/App/App.xcodeproj");
if (!fs.statSync(iosProjectDirectory).isDirectory()) {
  fail("ios/App/IdeaTiles.xcodeproj must be the real iOS project directory");
}
if (!fs.lstatSync(capacitorProjectLink).isSymbolicLink()) {
  fail("ios/App/App.xcodeproj must be a compatibility symlink");
}
if (fs.readlinkSync(capacitorProjectLink) !== "IdeaTiles.xcodeproj") {
  fail("ios/App/App.xcodeproj must point relatively to IdeaTiles.xcodeproj");
}
if (
  fs.realpathSync(capacitorProjectLink) !== fs.realpathSync(iosProjectDirectory)
) {
  fail("the Capacitor compatibility symlink resolves to the wrong project");
}

const iosProject = read("ios/App/IdeaTiles.xcodeproj/project.pbxproj");
expectOnly(
  "iOS marketing version",
  uniqueMatches(iosProject, /MARKETING_VERSION = ([^;]+);/g),
  EXPECTED_APPLE_VERSION
);
expectOnly(
  "iOS build number",
  uniqueMatches(iosProject, /CURRENT_PROJECT_VERSION = ([^;]+);/g),
  EXPECTED_APPLE_BUILD
);
expectOnly(
  "iOS app bundle identifier",
  uniqueMatches(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
  APP_BUNDLE_ID
);
if (!iosProject.includes("path = ../../macos/IdeaTiles.xcodeproj;")) {
  fail("the iOS project does not link the native Mac subproject");
}

const fastlane = read("ios/fastlane/Fastfile");
const fastlaneAppVersions = [
  ...fastlane.matchAll(/app_version:\s*["']([^"']+)["']/g),
].map(match => match[1]);
if (
  fastlaneAppVersions.length !== 1 ||
  fastlaneAppVersions[0] !== EXPECTED_APPLE_VERSION
) {
  fail(
    `Fastlane app_version entries are ${JSON.stringify(fastlaneAppVersions)}; expected exactly one ${EXPECTED_APPLE_VERSION}`
  );
}

// Exactly three shared schemes, one per entry point: the two platform schemes
// each archive their own store submission, and the workspace scheme builds both
// at once. Duplicates here are what produced the "Idea Tiles" / "IdeaTiles" /
// "Idea Tiles 1" / "Hexmind" pile-up, so the count is asserted, not just the names.
const iosSchemeDirectory = path.join(
  root,
  "ios/App/IdeaTiles.xcodeproj/xcshareddata/xcschemes"
);
const iosSchemes = fs
  .readdirSync(iosSchemeDirectory)
  .filter(name => name.endsWith(".xcscheme"));
if (
  iosSchemes.length !== 1 ||
  iosSchemes[0] !== "Idea Tiles (iOS).xcscheme"
) {
  fail(
    `iOS shared schemes are ${JSON.stringify(iosSchemes)}; expected only ["Idea Tiles (iOS).xcscheme"]`
  );
}

const macSchemeDirectory = path.join(
  root,
  "macos/IdeaTiles.xcodeproj/xcshareddata/xcschemes"
);
const macSchemes = fs
  .readdirSync(macSchemeDirectory)
  .filter(name => name.endsWith(".xcscheme"));
if (
  macSchemes.length !== 1 ||
  macSchemes[0] !== "Idea Tiles (macOS).xcscheme"
) {
  fail(
    `Mac shared schemes are ${JSON.stringify(macSchemes)}; expected only ["Idea Tiles (macOS).xcscheme"]`
  );
}

const iosSchemeContents = fs.readFileSync(
  path.join(iosSchemeDirectory, "Idea Tiles (iOS).xcscheme"),
  "utf8"
);
if (
  iosSchemeContents.includes('ReferencedContainer = "container:App.xcodeproj"')
) {
  fail("the iOS scheme still references the compatibility project name");
}
if (
  !iosSchemeContents.includes(
    'ReferencedContainer = "container:IdeaTiles.xcodeproj"'
  )
) {
  fail("the iOS scheme does not reference the renamed iOS project");
}

// The combined scheme lives at workspace level so `xcodegen generate` cannot
// clobber it, and so its container paths resolve from the repository root.
const combinedScheme = read(
  "IdeaTiles.xcworkspace/xcshareddata/xcschemes/Idea Tiles (All).xcscheme"
);
for (const container of [
  'ReferencedContainer = "container:ios/App/IdeaTiles.xcodeproj"',
  'ReferencedContainer = "container:macos/IdeaTiles.xcodeproj"',
]) {
  if (!combinedScheme.includes(container)) {
    fail(`the combined "Idea Tiles (All)" scheme is missing ${container}`);
  }
}
// A two-platform scheme cannot produce a single submittable archive, so the
// combined scheme must never be the thing a release reaches for.
if (combinedScheme.includes("buildForArchiving = \"YES\"")) {
  fail(
    'the combined "Idea Tiles (All)" scheme must not enable archiving; archive the per-platform schemes instead'
  );
}

const macYAML = read("macos/project.yml");
expectOnly(
  "Mac source marketing version",
  uniqueMatches(macYAML, /^\s*MARKETING_VERSION:\s*([^\s]+)\s*$/gm),
  EXPECTED_APPLE_VERSION
);
expectOnly(
  "Mac source build number",
  uniqueMatches(macYAML, /^\s*CURRENT_PROJECT_VERSION:\s*([^\s]+)\s*$/gm),
  EXPECTED_APPLE_BUILD
);
const macSourceBundleIDs = uniqueMatches(
  macYAML,
  /^\s*PRODUCT_BUNDLE_IDENTIFIER:\s*([^\s]+)\s*$/gm
).sort();
const expectedMacSourceBundleIDs = [APP_BUNDLE_ID, MAC_TEST_BUNDLE_ID].sort();
if (
  JSON.stringify(macSourceBundleIDs) !==
  JSON.stringify(expectedMacSourceBundleIDs)
) {
  fail(
    `macos/project.yml bundle identifiers are ${JSON.stringify(macSourceBundleIDs)}; expected ${JSON.stringify(expectedMacSourceBundleIDs)}`
  );
}

const macProject = read("macos/IdeaTiles.xcodeproj/project.pbxproj");
expectOnly(
  "generated Mac marketing version",
  uniqueMatches(macProject, /MARKETING_VERSION = ([^;]+);/g),
  EXPECTED_APPLE_VERSION
);
expectOnly(
  "generated Mac build number",
  uniqueMatches(macProject, /CURRENT_PROJECT_VERSION = ([^;]+);/g),
  EXPECTED_APPLE_BUILD
);
const macBundleIDs = uniqueMatches(
  macProject,
  /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g
).sort();
const expectedMacBundleIDs = [APP_BUNDLE_ID, MAC_TEST_BUNDLE_ID].sort();
if (JSON.stringify(macBundleIDs) !== JSON.stringify(expectedMacBundleIDs)) {
  fail(
    `generated Mac bundle identifiers are ${JSON.stringify(macBundleIDs)}; expected ${JSON.stringify(expectedMacBundleIDs)}`
  );
}

const workspace = read("IdeaTiles.xcworkspace/contents.xcworkspacedata");
for (const project of [
  "group:ios/App/IdeaTiles.xcodeproj",
  "group:macos/IdeaTiles.xcodeproj",
]) {
  if (count(workspace, project) !== 1) {
    fail(`root workspace must reference ${project} exactly once`);
  }
}
if (workspace.includes("ios/App/App.xcodeproj")) {
  fail(
    "root workspace must reference the renamed iOS project, not its symlink"
  );
}

const androidGradle = read("android/app/build.gradle");
expectOnly(
  "Android marketing version",
  uniqueMatches(androidGradle, /versionName\s+["']([^"']+)["']/g),
  EXPECTED_SEMANTIC_VERSION
);
expectOnly(
  "Android version code",
  uniqueMatches(androidGradle, /versionCode\s+(\d+)/g),
  EXPECTED_ANDROID_CODE
);

// Keys every Apple target must declare identically. iOS and macOS ship as one
// App Store product, so a submission-affecting key present on one platform and
// absent on the other is drift, not a platform difference. Export compliance
// drifted exactly that way: iOS declared ITSAppUsesNonExemptEncryption and
// macOS did not, so every Mac submission stopped to ask the encryption
// question by hand. Both apps use only HTTPS and Keychain, which is exempt.
const REQUIRED_APPLE_PLIST_KEYS = { ITSAppUsesNonExemptEncryption: "false" };
const plistValue = (contents, key) => {
  const match = contents.match(
    new RegExp(`<key>${key}</key>\\s*(?:<(true|false)/>|<string>([^<]*)</string>)`)
  );
  return match ? (match[1] ?? match[2]) : null;
};

for (const plist of ["ios/App/App/Info.plist", "macos/IdeaTiles/Info.plist"]) {
  const contents = read(plist);
  if (
    !contents.includes("$(MARKETING_VERSION)") ||
    !contents.includes("$(CURRENT_PROJECT_VERSION)")
  ) {
    fail(`${plist} must resolve both version values from build settings`);
  }
  for (const [key, expected] of Object.entries(REQUIRED_APPLE_PLIST_KEYS)) {
    const actual = plistValue(contents, key);
    if (actual !== expected) {
      fail(
        `${plist} declares ${key} as ${actual ?? "absent"}; expected ${expected} on every Apple platform`
      );
    }
  }
}

expectEquivalentVersion("Apple marketing version", EXPECTED_APPLE_VERSION);

console.log(
  `Versions aligned: Apple ${EXPECTED_APPLE_VERSION}; package/Android ${EXPECTED_SEMANTIC_VERSION}; Apple build ${EXPECTED_APPLE_BUILD}; Android code ${EXPECTED_ANDROID_CODE}`
);
console.log(
  `Projects aligned: ${APP_BUNDLE_ID}; IdeaTiles.xcworkspace; Capacitor compatibility symlink valid`
);
