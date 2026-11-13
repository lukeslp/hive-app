import { describe, expect, it } from "vitest";
import { buildBoardSvg, wrapTileTitle } from "@/lib/boardExport";

const board = {
  "0,0": {
    q: 0,
    r: 0,
    text: "Neighborhood tool library",
    type: "root",
    parentId: null,
  },
  "1,0": {
    q: 1,
    r: 0,
    text: "Liability & <Loss> Risk",
    type: "risk",
    parentId: "0,0",
  },
  "0,1": {
    q: 0,
    r: 1,
    text: "Membership and Access Model",
    type: "action",
    parentId: "0,0",
    isKeyTheme: true,
  },
};

describe("buildBoardSvg", () => {
  it("returns null for an empty board", () => {
    expect(buildBoardSvg({})).toBeNull();
  });

  it("draws every tile with its title as SVG text", () => {
    const result = buildBoardSvg(board)!;
    expect(result.tileCount).toBe(3);
    expect(result.svg.startsWith("<svg xmlns=")).toBe(true);
    expect(result.svg).toContain(">Neighborhood<");
    expect(result.svg).toContain(">tool library<");
    expect(result.svg).toContain(">Membership and<");
    // One label and one title block per tile.
    expect(result.svg.match(/<text /g)).toHaveLength(6);
  });

  it("writes colors as attributes, with no HTML or CSS classes", () => {
    const { svg } = buildBoardSvg(board)!;
    expect(svg).not.toMatch(/class=|<div|<span|foreignObject/);
    expect(svg).toContain('fill="#ef4444"'); // risk
    expect(svg).toContain('fill="#f43f5e"'); // action
    expect(svg).toContain('stroke="#fde047"'); // key idea outline
    expect(svg).toContain("ACTION · KEY IDEA");
  });

  it("escapes tile text so the file stays valid XML", () => {
    const { svg } = buildBoardSvg(board)!;
    expect(svg).toContain("Liability &amp;");
    expect(svg).toContain("&lt;Loss&gt; Risk");
    expect(svg).not.toContain("<Loss>");
  });

  it("drops characters XML cannot carry", () => {
    const { svg } = buildBoardSvg({
      "0,0": { q: 0, r: 0, text: "Bad\u0000 char\u0008s", type: "concept" },
    })!;
    expect(svg).not.toMatch(/[\u0000\u0008]/);
    expect(svg).toContain(">Bad chars<");
  });

  it("connects a tile to its parent and skips a missing parent", () => {
    const { svg } = buildBoardSvg({
      ...board,
      "5,5": { q: 5, r: 5, text: "Orphan", type: "concept", parentId: "9,9" },
    })!;
    expect(svg.match(/<line /g)).toHaveLength(2);
  });

  it("fits the board to the requested pixel size", () => {
    const wide = buildBoardSvg(
      {
        "0,0": { q: 0, r: 0, text: "A", type: "concept" },
        "6,0": { q: 6, r: 0, text: "B", type: "concept" },
      },
      { maxPixels: 1000 }
    )!;
    expect(wide.width).toBe(1000);
    expect(wide.height).toBeLessThan(1000);
    expect(wide.svg).toContain(`width="1000" height="${wide.height}"`);
  });

  it("falls back to a neutral style for an unknown tile type", () => {
    const { svg } = buildBoardSvg({
      "0,0": { q: 0, r: 0, text: "Mystery", type: "priority" },
    })!;
    expect(svg).toContain(">TILE<");
  });
});

describe("wrapTileTitle", () => {
  it("wraps on words", () => {
    expect(wrapTileTitle("Storage and Lending Infrastructure")).toEqual([
      "Storage and",
      "Lending",
      "Infrastructure",
    ]);
  });

  it("splits a single word that is wider than a tile", () => {
    expect(wrapTileTitle("Internationalization")).toEqual([
      "Internationali-",
      "zation",
    ]);
  });

  it("ends with an ellipsis when the title does not fit", () => {
    const lines = wrapTileTitle(
      "A very long tile title that keeps going well past what four short lines can hold"
    );
    expect(lines).toHaveLength(4);
    expect(lines[3].endsWith("…")).toBe(true);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(15);
  });

  it("returns no lines for blank text", () => {
    expect(wrapTileTitle("   ")).toEqual([]);
  });
});
