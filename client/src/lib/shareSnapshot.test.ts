import { describe, expect, it } from "vitest";
import { buildShareSnapshot } from "./shareSnapshot";

const canvas = {
  nodes: { "0,0": { q: 0, r: 0, text: "Root", type: "idea" } },
  viewState: { x: 0, y: 0, zoom: 1 },
  creativity: 0.5,
};

describe("share snapshots", () => {
  it("remain canvas-only when no artifacts are explicitly selected", () => {
    expect(buildShareSnapshot(canvas, [])).toEqual(canvas);
    expect(buildShareSnapshot(canvas, [])).not.toHaveProperty("artifacts");
  });

  it("includes only explicitly selected artifact summaries", () => {
    const snapshot = buildShareSnapshot(canvas, [
      { id: "artifact:one", title: "One", kind: "markdown" },
      { id: "artifact:two", title: "Two", kind: "image" },
    ]);

    expect(snapshot.artifacts).toEqual([
      { id: "artifact:one", title: "One", kind: "markdown" },
      { id: "artifact:two", title: "Two", kind: "image" },
    ]);
  });
});
