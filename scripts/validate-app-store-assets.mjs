#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const limits = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "keywords.txt": 100,
  "promotional_text.txt": 170,
  "description.txt": 4000,
  "release_notes.txt": 4000,
};
const errors = [];

for (const platform of ["ios", "macos"]) {
  const directory = path.join(root, platform, "fastlane/metadata/en-US");
  for (const [filename, limit] of Object.entries(limits)) {
    const content = (
      await readFile(path.join(directory, filename), "utf8")
    ).trim();
    if (content.length > limit) {
      errors.push(
        `${platform}/${filename}: ${content.length} characters (limit ${limit})`
      );
    } else {
      process.stdout.write(
        `${platform}/${filename}: ${content.length}/${limit}\n`
      );
    }
  }
}

const screenshotSets = [
  {
    directory: "ios/fastlane/screenshots/en-US",
    prefix: "iPhone_6.9_",
    size: "1320x2868",
  },
  {
    directory: "ios/fastlane/screenshots/en-US",
    prefix: "iPad_13_",
    size: "2064x2752",
  },
  {
    directory: "macos/fastlane/screenshots/en-US",
    prefix: "Mac_",
    size: "1440x900",
  },
];

for (const set of screenshotSets) {
  const directory = path.join(root, set.directory);
  const filenames = (await readdir(directory)).filter(
    filename => filename.startsWith(set.prefix) && filename.endsWith(".png")
  );
  if (filenames.length < 3 || filenames.length > 10) {
    errors.push(
      `${set.prefix}: found ${filenames.length} screenshots; expected 3–10`
    );
    continue;
  }
  for (const filename of filenames) {
    const file = path.join(directory, filename);
    const dimensions = execFileSync(
      "magick",
      ["identify", "-format", "%wx%h", file],
      { encoding: "utf8" }
    );
    if (dimensions !== set.size)
      errors.push(`${filename}: ${dimensions}; expected ${set.size}`);
  }
  process.stdout.write(
    `${set.prefix}: ${filenames.length} screenshots at ${set.size}\n`
  );
}

if (errors.length > 0) {
  process.stderr.write(
    `\nApp Store asset validation failed:\n- ${errors.join("\n- ")}\n`
  );
  process.exit(1);
}
process.stdout.write("\nApp Store metadata and screenshots are valid.\n");
