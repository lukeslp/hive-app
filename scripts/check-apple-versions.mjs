import fs from "node:fs";
import path from "node:path";

const EXPECTED_VERSION = "1.1.0";
const EXPECTED_APPLE_BUILD = "2";
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

const packageJSON = JSON.parse(read("package.json"));
if (packageJSON.version !== EXPECTED_VERSION) {
  fail(
    `package.json version is ${packageJSON.version}; expected ${EXPECTED_VERSION}`
  );
}

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
  EXPECTED_VERSION
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

const iosSchemeDirectory = path.join(
  root,
  "ios/App/IdeaTiles.xcodeproj/xcshareddata/xcschemes"
);
const iosSchemes = fs
  .readdirSync(iosSchemeDirectory)
  .filter(name => name.endsWith(".xcscheme"));
if (!iosSchemes.includes("Idea Tiles.xcscheme")) {
  fail('the canonical shared iOS scheme "Idea Tiles" is missing');
}
for (const scheme of iosSchemes) {
  const contents = fs.readFileSync(
    path.join(iosSchemeDirectory, scheme),
    "utf8"
  );
  if (contents.includes('ReferencedContainer = "container:App.xcodeproj"')) {
    fail(`${scheme} still references the compatibility project name`);
  }
  if (
    !contents.includes('ReferencedContainer = "container:IdeaTiles.xcodeproj"')
  ) {
    fail(`${scheme} does not reference the renamed iOS project`);
  }
}

const macYAML = read("macos/project.yml");
expectOnly(
  "Mac source marketing version",
  uniqueMatches(macYAML, /^\s*MARKETING_VERSION:\s*([^\s]+)\s*$/gm),
  EXPECTED_VERSION
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
  EXPECTED_VERSION
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
  EXPECTED_VERSION
);
expectOnly(
  "Android version code",
  uniqueMatches(androidGradle, /versionCode\s+(\d+)/g),
  EXPECTED_ANDROID_CODE
);

for (const plist of ["ios/App/App/Info.plist", "macos/IdeaTiles/Info.plist"]) {
  const contents = read(plist);
  if (
    !contents.includes("$(MARKETING_VERSION)") ||
    !contents.includes("$(CURRENT_PROJECT_VERSION)")
  ) {
    fail(`${plist} must resolve both version values from build settings`);
  }
}

console.log(
  `Versions aligned: ${EXPECTED_VERSION}; Apple build ${EXPECTED_APPLE_BUILD}; Android code ${EXPECTED_ANDROID_CODE}`
);
console.log(
  `Projects aligned: ${APP_BUNDLE_ID}; IdeaTiles.xcworkspace; Capacitor compatibility symlink valid`
);
