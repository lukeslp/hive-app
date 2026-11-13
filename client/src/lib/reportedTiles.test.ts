import { describe, expect, it } from "vitest";
import { extractArtifactContext } from "@/lib/artifactContext";
import { buildBoardSvg } from "@/lib/boardExport";
import { withHiddenTilesMasked, withoutHiddenTiles } from "@/lib/reportedTiles";

const tile = (
  q: number,
  r: number,
  text: string,
  parentId: string | null,
  extra: Record<string, unknown> = {}
) => ({
  q,
  r,
  text,
  description: `About ${text}.`,
  type: parentId ? "concept" : "root",
  depth: parentId ? 1 : 0,
  parentId,
  pinned: !parentId,
  ...extra,
});

const board = {
  "0,0": tile(0, 0, "Tool library", null),
  "1,0": tile(1, 0, "Offensive words", "0,0", { relatedNodeKeys: ["0,1"] }),
  "0,1": tile(0, 1, "Membership", "0,0", { relatedNodeKeys: ["1,0"] }),
  "2,0": tile(2, 0, "Child of reported", "1,0", { depth: 2 }),
};
const hidden = new Set(["1,0"]);

describe("a reported tile whose text is hidden", () => {
  it("is left out of what Artifact Studio sends", () => {
    const context = extractArtifactContext(withoutHiddenTiles(board, hidden), {
      kind: "board",
    });
    expect(context.text).not.toContain("Offensive words");
    expect(context.originalNodeCount).toBe(3);
    // Its child stays, as a top-level tile.
    expect(context.text).toContain("Child of reported");
    expect(context.text).toContain("Membership");
  });

  it("is drawn as Reported in an exported picture", () => {
    const { svg, tileCount } = buildBoardSvg(
      withHiddenTilesMasked(board, hidden)
    )!;
    expect(tileCount).toBe(4);
    expect(svg).not.toContain("Offensive");
    expect(svg).toContain(">Reported<");
  });

  it("changes nothing when no tile is hidden", () => {
    const none = new Set<string>();
    expect(withoutHiddenTiles(board, none)).toBe(board);
    expect(withHiddenTilesMasked(board, none)).toBe(board);
  });
});
