import { describe, expect, it } from "vitest";
import { readAutosaveInfo } from "@/lib/autosaveInfo";
import {
  migrateTilesSession,
  workspaceTransportForCloud,
} from "@shared/workspaceDocument";

const storageWith = (value: string | null) => ({ getItem: () => value });

const autosave = JSON.stringify(
  workspaceTransportForCloud(
    migrateTilesSession({
      boardId: "board.test",
      nodes: {
        "0,0": {
          q: 0,
          r: 0,
          text: "Tool library",
          type: "root",
          depth: 0,
          parentId: null,
          pinned: true,
        },
        "1,0": {
          q: 1,
          r: 0,
          text: "Membership",
          type: "action",
          depth: 1,
          parentId: "0,0",
          pinned: false,
        },
      },
      viewState: { x: 0, y: 0, zoom: 0.8 },
      creativity: 0.5,
    })
  )
);

describe("readAutosaveInfo", () => {
  it("counts the tiles in a stored board", () => {
    expect(readAutosaveInfo(storageWith(autosave))?.nodeCount).toBe(2);
  });

  it("returns null when nothing is stored or it cannot be read", () => {
    expect(readAutosaveInfo(storageWith(null))).toBeNull();
    expect(readAutosaveInfo(storageWith("{not json"))).toBeNull();
    expect(readAutosaveInfo(storageWith('{"nodes":{}}'))).toBeNull();
  });
});
