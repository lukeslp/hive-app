import { describe, expect, it } from "vitest";
import { extractArtifactContext } from "@/lib/artifactContext";
import type { NodeMap } from "@/types/hexmind";

const nodes: NodeMap = {
  "2,0": {
    q: 2,
    r: 0,
    text: "Later child",
    description: "Second child in coordinate order.",
    type: "action",
    depth: 2,
    parentId: "0,1",
    pinned: false,
  },
  "0,0": {
    q: 0,
    r: 0,
    text: "Board root",
    description: "The starting point.",
    type: "root",
    depth: 0,
    parentId: null,
    pinned: true,
  },
  "-1,0": {
    q: -1,
    r: 0,
    text: "Other branch",
    description: "Not part of the selected branch.",
    type: "concept",
    depth: 1,
    parentId: "0,0",
    pinned: false,
  },
  "0,1": {
    q: 0,
    r: 1,
    text: "Chosen branch",
    description: "The branch root.",
    type: "technical",
    depth: 1,
    parentId: "0,0",
    pinned: false,
    isKeyTheme: true,
  },
  "1,0": {
    q: 1,
    r: 0,
    text: "Earlier child",
    description: "First child in coordinate order.",
    type: "question",
    depth: 2,
    parentId: "0,1",
    pinned: false,
  },
};

describe("artifact context extraction", () => {
  it("orders whole-board context deterministically by depth and coordinates", () => {
    const context = extractArtifactContext(nodes, { kind: "board" });

    expect(context.nodeIds).toEqual(["0,0", "-1,0", "0,1", "1,0", "2,0"]);
    expect(context.text.indexOf("Board root")).toBeLessThan(
      context.text.indexOf("Chosen branch")
    );
    expect(context.truncated).toBe(false);
  });

  it("includes only a branch root and all of its descendants", () => {
    const context = extractArtifactContext(nodes, {
      kind: "branch",
      rootNodeId: "0,1",
    });

    expect(context.nodeIds).toEqual(["0,1", "1,0", "2,0"]);
  });

  it("normalizes explicit selections instead of trusting selection order", () => {
    const context = extractArtifactContext(nodes, {
      kind: "selection",
      nodeIds: ["2,0", "missing", "0,0", "2,0"],
    });

    expect(context.nodeIds).toEqual(["0,0", "2,0"]);
    expect(context.originalNodeCount).toBe(2);
  });

  it("reduces context to the requested character budget", () => {
    const context = extractArtifactContext(nodes, { kind: "board" }, 160);

    expect(context.text.length).toBeLessThanOrEqual(160);
    expect(context.includedNodeCount).toBeLessThan(context.originalNodeCount);
    expect(context.truncated).toBe(true);
  });
});
