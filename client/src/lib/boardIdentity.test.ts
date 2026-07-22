import { describe, expect, it, vi } from "vitest";
import {
  boardIdForLocalSession,
  readAutosaveBoardId,
} from "@/lib/boardIdentity";

describe("local board identity", () => {
  it("reuses the board ID stored inside the legacy autosave payload", () => {
    const create = vi.fn(() => "board:local:new");

    expect(
      readAutosaveBoardId(
        JSON.stringify({
          boardId: "board:local:stable",
          timestamp: 123,
          nodes: {},
        }),
        create
      )
    ).toBe("board:local:stable");
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses the canonical workspace ID from compact autosaves", () => {
    const create = vi.fn(() => "board:local:new");
    expect(
      readAutosaveBoardId(
        JSON.stringify({
          format: "app.ideatiles.workspace-envelope",
          envelopeVersion: 1,
          workspace: { id: "board:local:canonical" },
        }),
        create
      )
    ).toBe("board:local:canonical");
    expect(create).not.toHaveBeenCalled();
  });

  it("derives a stable identity from a legacy autosave timestamp", () => {
    expect(
      readAutosaveBoardId(
        JSON.stringify({ timestamp: 1_721_600_000_000, nodes: {} }),
        () => "board:local:new"
      )
    ).toBe("board:autosave:1721600000000");
  });

  it("creates an identity when no usable autosave state exists", () => {
    expect(readAutosaveBoardId(null, () => "board:local:new")).toBe(
      "board:local:new"
    );
    expect(readAutosaveBoardId("not json", () => "board:local:newer")).toBe(
      "board:local:newer"
    );
  });

  it("uses saved board metadata or a stable local session fallback", () => {
    expect(
      boardIdForLocalSession("session_123", {
        boardId: "board:local:original",
      })
    ).toBe("board:local:original");
    expect(boardIdForLocalSession("session_123", {})).toBe(
      "board:session:session_123"
    );
  });
});
