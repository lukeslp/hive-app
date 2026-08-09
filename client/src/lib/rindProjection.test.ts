import { describe, expect, it } from "vitest";
import type { HexNode } from "@/types/hivemind";
import {
  deriveRindProjection,
  rindSubdivisionsForNodeCount,
  semanticIdForRindNode,
  type RindTopologyTile,
} from "@/lib/rindProjection";

const tiles: RindTopologyTile[] = [
  { index: 0, neighborIndices: [1, 2], position: [0, 0, 5] },
  { index: 1, neighborIndices: [0, 3], position: [1, 0, 4] },
  { index: 2, neighborIndices: [0, 3], position: [-1, 0, 4] },
  { index: 3, neighborIndices: [1, 2], position: [0, 1, 4] },
];

const root: HexNode = {
  semanticId: "sphere:7",
  q: 0,
  r: 0,
  text: "Root",
  type: "root",
  depth: 0,
  pinned: true,
};

const child: HexNode = {
  q: 1,
  r: 0,
  text: "Child",
  type: "concept",
  depth: 1,
  parentId: "0,0",
  pinned: false,
};

describe("Rind sphere projection", () => {
  it("keeps imported subdivisions until the board needs more tiles", () => {
    expect(rindSubdivisionsForNodeCount(2, 4)).toBe(4);
    expect(rindSubdivisionsForNodeCount(163, 4)).toBe(5);
  });

  it("uses the canonical tile identity when a node has no imported semantic ID", () => {
    expect(semanticIdForRindNode(child)).toBe("tile:1:0");
    expect(semanticIdForRindNode(root)).toBe("sphere:7");
  });

  it("preserves imported Rind placement and assigns a child beside its parent", () => {
    const projection = deriveRindProjection(
      { "0,0": root, "1,0": child },
      tiles,
      {
        "sphere:7": { tileIndex: 2, position: [9, 8, 7] },
      },
      0
    );

    expect(projection["sphere:7"]).toEqual({
      tileIndex: 2,
      position: [9, 8, 7],
    });
    expect(tiles[2].neighborIndices).toContain(
      projection["tile:1:0"].tileIndex
    );
  });

  it("is deterministic, collision-free, and independent of object insertion order", () => {
    const third: HexNode = {
      q: -1,
      r: 0,
      text: "Third",
      type: "question",
      depth: 1,
      parentId: "0,0",
      pinned: false,
    };
    const first = deriveRindProjection(
      { "0,0": root, "1,0": child, "-1,0": third },
      tiles,
      {},
      0
    );
    const reordered = deriveRindProjection(
      { "-1,0": third, "1,0": child, "0,0": root },
      tiles,
      {},
      0
    );

    expect(reordered).toEqual(first);
    expect(
      new Set(Object.values(first).map(value => value.tileIndex)).size
    ).toBe(3);
  });
});
