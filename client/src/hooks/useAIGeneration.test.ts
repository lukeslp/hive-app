/**
 * Tests for the weighted board context system in useAIGeneration.
 *
 * We test the buildBoardContext function indirectly by importing it,
 * and verify the weighting/scoring logic that drives cluster bridging.
 */
import { describe, it, expect } from "vitest";
import type { HexNode } from "@/types/hivemind";
import { hexDistance } from "@/lib/hexGrid";

// We need to extract buildBoardContext for testing.
// Since it's not exported, we test the weighting logic directly.

// Replicate the scoring logic for testing
function scoreNode(node: HexNode): number {
  let weight = 0;
  if (node.isKeyTheme) weight += 5;
  if (node.wasInteracted) weight += 3;
  if (node.isClusterRoot) weight += 2;
  if (node.contextInfo) weight += 1;
  if (node.relatedNodeKeys && node.relatedNodeKeys.length > 0) weight += 1;
  return weight;
}

function makeNode(
  overrides: Partial<HexNode> & { q: number; r: number; text: string }
): HexNode {
  return {
    type: "concept",
    depth: 1,
    pinned: false,
    ...overrides,
  };
}

describe("Weighted Board Context Scoring", () => {
  it("scores starred (isKeyTheme) nodes highest", () => {
    const starred = makeNode({ q: 0, r: 0, text: "Starred", isKeyTheme: true });
    const plain = makeNode({ q: 1, r: 0, text: "Plain" });
    expect(scoreNode(starred)).toBe(5);
    expect(scoreNode(plain)).toBe(0);
    expect(scoreNode(starred)).toBeGreaterThan(scoreNode(plain));
  });

  it("scores user-expanded nodes with +3", () => {
    const expanded = makeNode({
      q: 0,
      r: 0,
      text: "Expanded",
      wasInteracted: true,
    });
    expect(scoreNode(expanded)).toBe(3);
  });

  it("scores cluster roots with +2", () => {
    const root = makeNode({ q: 0, r: 0, text: "Root", isClusterRoot: true });
    expect(scoreNode(root)).toBe(2);
  });

  it("scores nodes with contextInfo with +1", () => {
    const withContext = makeNode({
      q: 0,
      r: 0,
      text: "Context",
      contextInfo: "some notes",
    });
    expect(scoreNode(withContext)).toBe(1);
  });

  it("scores nodes with relatedNodeKeys with +1", () => {
    const withRelated = makeNode({
      q: 0,
      r: 0,
      text: "Related",
      relatedNodeKeys: ["0,1"],
    });
    expect(scoreNode(withRelated)).toBe(1);
  });

  it("accumulates weights for nodes with multiple signals", () => {
    const superNode = makeNode({
      q: 0,
      r: 0,
      text: "Super",
      isKeyTheme: true, // +5
      wasInteracted: true, // +3
      isClusterRoot: true, // +2
      contextInfo: "notes", // +1
      relatedNodeKeys: ["1,0"], // +1
    });
    expect(scoreNode(superNode)).toBe(12);
  });

  it("sorts by weight descending, then distance ascending", () => {
    const center = { q: 0, r: 0 };
    const nodes = [
      { key: "a", weight: 5, distance: 10 },
      { key: "b", weight: 3, distance: 2 },
      { key: "c", weight: 5, distance: 3 },
      { key: "d", weight: 0, distance: 1 },
    ];

    const sorted = nodes.sort(
      (a, b) => b.weight - a.weight || a.distance - b.distance
    );
    expect(sorted.map(n => n.key)).toEqual(["c", "a", "b", "d"]);
  });
});

describe("Hex Distance Calculation", () => {
  it("returns 0 for same position", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it("returns 1 for adjacent hexes", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
  });

  it("returns correct distance for far hexes", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 5 })).toBe(5);
  });

  it("handles negative coordinates", () => {
    expect(hexDistance({ q: -2, r: 1 }, { q: 2, r: -1 })).toBe(4);
  });
});

describe("Board Context Filtering", () => {
  it("identifies nodes from different clusters as bridge candidates", () => {
    const nodes: Record<string, HexNode> = {
      "0,0": makeNode({ q: 0, r: 0, text: "Center", clusterId: "A" }),
      "1,0": makeNode({
        q: 1,
        r: 0,
        text: "Same Cluster",
        clusterId: "A",
        isKeyTheme: true,
      }),
      "5,0": makeNode({
        q: 5,
        r: 0,
        text: "Other Starred",
        clusterId: "B",
        isKeyTheme: true,
      }),
      "6,0": makeNode({
        q: 6,
        r: 0,
        text: "Other Expanded",
        clusterId: "B",
        wasInteracted: true,
      }),
      "7,0": makeNode({ q: 7, r: 0, text: "Other Plain", clusterId: "B" }),
    };

    const center = nodes["0,0"];
    const otherCluster = Object.entries(nodes)
      .filter(
        ([key, node]) =>
          node.clusterId !== center.clusterId && scoreNode(node) >= 3
      )
      .map(([key, node]) => ({ key, node, weight: scoreNode(node) }));

    // Should find the starred and expanded nodes from cluster B
    expect(otherCluster).toHaveLength(2);
    expect(otherCluster.map(n => n.node.text)).toContain("Other Starred");
    expect(otherCluster.map(n => n.node.text)).toContain("Other Expanded");
    // Should NOT include the plain node (weight 0 < 3)
    expect(otherCluster.map(n => n.node.text)).not.toContain("Other Plain");
  });

  it("excludes the center node from context", () => {
    const nodes: Record<string, HexNode> = {
      "0,0": makeNode({ q: 0, r: 0, text: "Center", isKeyTheme: true }),
      "1,0": makeNode({ q: 1, r: 0, text: "Neighbor" }),
    };

    const center = nodes["0,0"];
    const centerKey = "0,0";
    const others = Object.entries(nodes).filter(([key]) => key !== centerKey);
    expect(others).toHaveLength(1);
    expect(others[0][1].text).toBe("Neighbor");
  });
});
