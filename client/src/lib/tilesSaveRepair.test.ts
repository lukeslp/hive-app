import { describe, expect, it } from "vitest";
import {
  migrateTilesSession,
  normalizeClarificationFields,
  repairTilesNodesForSave,
} from "@shared/workspaceDocument";

const root = {
  q: 0,
  r: 0,
  text: "Neighborhood tool library",
  type: "root",
  depth: 0,
  parentId: null,
  pinned: true,
  clusterId: "main",
};
const tile = (q: number, r: number, extra: Record<string, unknown> = {}) => ({
  q,
  r,
  text: `Tile ${q},${r}`,
  description: "",
  type: "concept",
  depth: 1,
  parentId: "0,0",
  pinned: false,
  clusterId: "main",
  ...extra,
});
const session = (nodes: Record<string, unknown>) => ({
  boardId: "board.test",
  nodes,
  viewState: { x: 0, y: 0, zoom: 0.8 },
  creativity: 0.5,
  keyThemes: [],
});

describe("saving a board whose tiles came back from a model out of range", () => {
  // The two cases seen in logcat on 1.3.3: after either one, every autosave
  // of the board threw and the app showed "Autosave could not store this
  // board locally".
  const reported = {
    "0,0": root,
    "1,0": tile(1, 0, {
      shouldAskClarifyingQuestion: true,
      clarifyingQuestion: "What matters most to you?",
      userInputCategory: "priority",
      suggestedAnswers: ["One", "Two", "Three", "Four", "Five", "Six"],
    }),
  };

  it("is rejected by the schema as generated", () => {
    expect(() => migrateTilesSession(session(reported))).toThrow();
  });

  it("saves once repaired, keeping every tile and the question", () => {
    const repaired = repairTilesNodesForSave(reported);
    const workspace = migrateTilesSession(session(repaired));
    expect(workspace.graph.nodes).toHaveLength(2);
    const asked = workspace.graph.nodes.find(node => node.id === "tile:1:0")!;
    expect(asked.compatibility?.tiles?.clarifyingQuestion).toBe(
      "What matters most to you?"
    );
    expect(asked.compatibility?.tiles?.userInputCategory).toBeUndefined();
    expect(asked.compatibility?.tiles?.suggestedAnswers).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ]);
  });

  it("repairs the other fields the schema is strict about", () => {
    const messy = {
      "0,0": root,
      "1,0": tile(1, 0, {
        text: `  ${"x".repeat(600)}  `,
        description: "d".repeat(9_000),
        type: "priority",
        depth: 1.5,
        // "9,9" was merged away; "1,0" is the tile itself.
        relatedNodeKeys: ["0,0", "9,9", "1,0", "0,0"],
        linkedContext: ["9,9"],
      }),
      "0,1": tile(0, 1, { parentId: "9,9", text: "   " }),
    };
    expect(() => migrateTilesSession(session(messy))).toThrow();

    const repaired = repairTilesNodesForSave(messy);
    expect(repaired["1,0"].text).toHaveLength(512);
    expect(repaired["1,0"].description).toHaveLength(8_000);
    expect(repaired["1,0"].type).toBe("concept");
    expect(repaired["1,0"].depth).toBe(1);
    expect(repaired["1,0"].relatedNodeKeys).toEqual(["0,0"]);
    expect(repaired["1,0"].linkedContext).toEqual([]);
    expect(repaired["0,1"].parentId).toBeNull();
    expect(repaired["0,1"].text).toBe("Untitled");
    expect(migrateTilesSession(session(repaired)).graph.nodes).toHaveLength(3);
  });

  it("returns the same objects when nothing needs repair", () => {
    const clean = {
      "0,0": root,
      "1,0": tile(1, 0, {
        userInputCategory: "goal",
        suggestedAnswers: ["A", "B"],
        relatedNodeKeys: ["0,0"],
      }),
    };
    expect(repairTilesNodesForSave(clean)).toBe(clean);
  });
});

describe("normalizeClarificationFields", () => {
  it("keeps a known category in any letter case", () => {
    expect(
      normalizeClarificationFields({ userInputCategory: " Goal " })
    ).toEqual({ userInputCategory: "goal", suggestedAnswers: undefined });
  });

  it("drops non-strings, blanks and repeats from the answers", () => {
    expect(
      normalizeClarificationFields({
        suggestedAnswers: ["Yes", "", 4, " Yes ", "No", null],
      }).suggestedAnswers
    ).toEqual(["Yes", "No"]);
  });

  it("treats a missing or malformed value as absent", () => {
    expect(
      normalizeClarificationFields({
        userInputCategory: 7,
        suggestedAnswers: "Yes",
      })
    ).toEqual({ userInputCategory: undefined, suggestedAnswers: undefined });
  });
});
