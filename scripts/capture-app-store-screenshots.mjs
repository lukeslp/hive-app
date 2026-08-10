#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import WebSocket from "ws";

const root = process.cwd();
const baseUrl = process.env.IDEATILES_CAPTURE_URL ?? "http://127.0.0.1:5010";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fontPath = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf";
const iosOutput = path.join(root, "ios/fastlane/screenshots/en-US");
const macOutput = path.join(root, "macos/fastlane/screenshots/en-US");
const profile = await mkdtemp(path.join(tmpdir(), "idea-tiles-store-capture-"));
const rawDir = await mkdtemp(path.join(tmpdir(), "idea-tiles-store-raw-"));
const debuggingPort = 9333;

const shots = [
  ["canvas", "Map your thinking", "Map_Your_Thinking"],
  ["detail", "Turn detail into direction", "Turn_Detail_Into_Direction"],
  ["themes", "Focus on what matters", "Focus_On_What_Matters"],
  ["templates", "Start with a useful structure", "Start_With_A_Structure"],
  ["settings", "Make it work your way", "Make_It_Yours"],
];
const macShots = [
  ["canvas", "See the whole idea", "See_The_Whole_Idea"],
  ["detail", "Turn detail into direction", "Turn_Detail_Into_Direction"],
  ["themes", "Focus the signal", "Focus_The_Signal"],
  ["artifact", "Build a finished artifact", "Build_A_Finished_Artifact"],
  ["sphere", "See ideas from every angle", "Choose_Your_Style"],
];

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent("about:blank")}`,
        { method: "PUT" }
      );
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome debugging endpoint did not become ready.");
}

function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  socket.on("message", payload => {
    const message = JSON.parse(payload.toString());
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error
      ? reject(new Error(message.error.message))
      : resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    ready,
    call(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) =>
        pending.set(id, { resolve, reject })
      );
    },
    close: () => socket.close(),
  };
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`))
    );
  });
}

async function capture(client, shot, device, index, outputDirectory) {
  const [mode, caption, slug] = shot;
  const { logicalWidth, logicalHeight, scale, prefix, pointSize } = device;
  const width = Math.round(logicalWidth * scale);
  const height = Math.round(logicalHeight * scale);
  const rawPath = path.join(rawDir, `${prefix}-${index}.png`);
  const outputPath = path.join(
    outputDirectory,
    `${prefix}_${String(index).padStart(2, "0")}_${slug}.png`
  );
  await client.call("Emulation.setDeviceMetricsOverride", {
    width: logicalWidth,
    height: logicalHeight,
    deviceScaleFactor: scale,
    mobile: prefix !== "Mac",
    screenWidth: logicalWidth,
    screenHeight: logicalHeight,
  });
  await client.call("Page.navigate", { url: `${baseUrl}/?showcase=${mode}` });
  await sleep(1100);
  const { data } = await client.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(rawPath, Buffer.from(data, "base64"));

  const bannerWidth = Math.round(width * 0.88);
  const bannerHeight = Math.round(height * (prefix === "Mac" ? 0.13 : 0.105));
  const bannerX = Math.round((width - bannerWidth) / 2);
  const bannerY = Math.round(height * 0.035);
  const radius = Math.round(bannerHeight * 0.28);
  const textY =
    bannerY +
    Math.round((bannerHeight - pointSize) / 2) -
    Math.round(pointSize * 0.08);
  await run("magick", [
    rawPath,
    "-fill",
    "#090A0FE6",
    "-stroke",
    "#F7C94866",
    "-strokewidth",
    String(Math.max(2, Math.round(scale))),
    "-draw",
    `roundrectangle ${bannerX},${bannerY} ${bannerX + bannerWidth},${bannerY + bannerHeight} ${radius},${radius}`,
    "-font",
    fontPath,
    "-fill",
    "#FFF8DF",
    "-stroke",
    "none",
    "-pointsize",
    String(pointSize),
    "-gravity",
    "north",
    "-annotate",
    `+0+${textY}`,
    caption,
    outputPath,
  ]);
  process.stdout.write(
    `${path.relative(root, outputPath)} (${width}x${height})\n`
  );
}

await mkdir(iosOutput, { recursive: true });
await mkdir(macOutput, { recursive: true });
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--hide-scrollbars",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

try {
  const target = await waitForDebugger();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.call("Page.enable");
  const devices = [
    {
      prefix: "iPhone_6.9",
      logicalWidth: 440,
      logicalHeight: 956,
      scale: 3,
      pointSize: 68,
    },
    {
      prefix: "iPad_13",
      logicalWidth: 1032,
      logicalHeight: 1376,
      scale: 2,
      pointSize: 72,
    },
  ];
  for (const device of devices) {
    for (const [index, shot] of shots.entries())
      await capture(client, shot, device, index + 1, iosOutput);
  }
  for (const [index, shot] of macShots.entries()) {
    await capture(
      client,
      shot,
      {
        prefix: "Mac",
        logicalWidth: 1440,
        logicalHeight: 900,
        scale: 1,
        pointSize: 38,
      },
      index + 1,
      macOutput
    );
  }
  client.close();
} finally {
  chrome.kill("SIGTERM");
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(rawDir, { recursive: true, force: true });
}
