import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJSON = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const projectYAML = fs.readFileSync(path.join(root, "macos/project.yml"), "utf8");
const macProject = fs.readFileSync(
  path.join(root, "macos/IdeaTiles.xcodeproj/project.pbxproj"),
  "utf8"
);

const declaredMarketing = [...projectYAML.matchAll(/^\s*MARKETING_VERSION:\s*([^\s]+)\s*$/gm)].map(match => match[1]);
const declaredBuild = [...projectYAML.matchAll(/^\s*CURRENT_PROJECT_VERSION:\s*([^\s]+)\s*$/gm)].map(match => match[1]);
if (packageJSON.version !== "1.1.0") throw new Error(`package.json version is ${packageJSON.version}, expected 1.1.0`);
if (declaredMarketing.length !== 1 || declaredMarketing[0] !== "1.1.0") {
  throw new Error("macos/project.yml must declare MARKETING_VERSION 1.1.0 exactly once");
}
if (declaredBuild.length !== 1 || declaredBuild[0] !== "1") {
  throw new Error("macos/project.yml must declare CURRENT_PROJECT_VERSION 1 exactly once");
}
const generatedMarketing = new Set([...macProject.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1]));
const generatedBuild = new Set([...macProject.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1]));
if (generatedMarketing.size !== 1 || !generatedMarketing.has("1.1.0")) throw new Error("generated Mac project marketing version drifted");
if (generatedBuild.size !== 1 || !generatedBuild.has("1")) throw new Error("generated Mac project build version drifted");

const iosCandidates = ["App.xcodeproj", "IdeaTiles.xcodeproj"];
const iosVersions = [];
for (const name of iosCandidates) {
  const candidate = path.join(root, "ios/App", name, "project.pbxproj");
  if (!fs.existsSync(candidate)) continue;
  const contents = fs.readFileSync(candidate, "utf8");
  iosVersions.push({
    project: name,
    marketing: [...new Set([...contents.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1]))],
    builds: [...new Set([...contents.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1]))],
  });
}
const androidGradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const androidName = androidGradle.match(/versionName\s+["']([^"']+)["']/)?.[1] ?? "unknown";
const androidCode = androidGradle.match(/versionCode\s+(\d+)/)?.[1] ?? "unknown";

console.log(`Mac/package aligned: 1.1.0 (build 1)`);
console.log(`iOS (read-only): ${JSON.stringify(iosVersions)}`);
console.log(`Android (read-only): ${androidName} (code ${androidCode})`);
