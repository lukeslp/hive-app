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

    expect(context.nodeIds).toEqual([
      "tile:0:0",
      "tile:-1:0",
      "tile:0:1",
      "tile:1:0",
      "tile:2:0",
    ]);
    expect(context.includedNodeIds).toEqual(context.nodeIds);
    expect(context.text).toContain("Tile: -1,0; depth: 1");
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

    expect(context.scope).toEqual({
      kind: "branch",
      rootNodeId: "tile:0:1",
    });
    expect(context.nodeIds).toEqual(["tile:0:1", "tile:1:0", "tile:2:0"]);
  });

  it("keeps a negative-coordinate branch scope semantic", () => {
    const context = extractArtifactContext(nodes, {
      kind: "branch",
      rootNodeId: "-1,0",
    });

    expect(context.scope).toEqual({
      kind: "branch",
      rootNodeId: "tile:-1:0",
    });
    expect(context.nodeIds).toEqual(["tile:-1:0"]);
  });

  it("normalizes explicit selections instead of trusting selection order", () => {
    const context = extractArtifactContext(nodes, {
      kind: "selection",
      nodeIds: ["2,0", "missing", "-1,0", "2,0"],
    });

    expect(context.scope).toEqual({
      kind: "selection",
      nodeIds: ["tile:2:0", "missing", "tile:-1:0", "tile:2:0"],
    });
    expect(context.nodeIds).toEqual(["tile:-1:0", "tile:2:0"]);
    expect(context.originalNodeCount).toBe(2);
  });

  it("reduces context to the requested character budget", () => {
    const context = extractArtifactContext(nodes, { kind: "board" }, 160);

    expect(context.text.length).toBeLessThanOrEqual(160);
    expect(context.includedNodeCount).toBeLessThan(context.originalNodeCount);
    expect(context.includedNodeIds).toEqual(
      context.nodeIds.slice(0, context.includedNodeCount)
    );
    expect(context.truncated).toBe(true);
  });

  it("attributes a partially included first tile to that tile only", () => {
    const context = extractArtifactContext(nodes, { kind: "board" }, 10);

    expect(context.text.length).toBeLessThanOrEqual(10);
    expect(context.includedNodeIds).toEqual(["tile:0:0"]);
    expect(context.includedNodeCount).toBe(1);
    expect(context.originalNodeCount).toBe(5);
    expect(context.truncated).toBe(true);
  });

  it("preserves explicit semantic IDs while displaying renderer coordinates", () => {
    const context = extractArtifactContext(
      {
        "-2,1": {
          q: -2,
          r: 1,
          semanticId: "idea:explicit-negative",
          text: "Explicit identity",
          type: "concept",
          depth: 0,
          parentId: null,
          pinned: false,
        },
      },
      { kind: "selection", nodeIds: ["-2,1"] }
    );

    expect(context.scope).toEqual({
      kind: "selection",
      nodeIds: ["idea:explicit-negative"],
    });
    expect(context.nodeIds).toEqual(["idea:explicit-negative"]);
    expect(context.nodes[0].id).toBe("idea:explicit-negative");
    expect(context.text).toContain("Tile: -2,1; depth: 0");
  });
});
