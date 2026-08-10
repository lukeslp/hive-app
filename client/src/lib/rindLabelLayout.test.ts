import { describe, expect, it } from "vitest";
import { selectRindLabelIds } from "@/lib/rindLabelLayout";

describe("Rind label layout", () => {
  it("hides labels that are edge-on or behind the sphere", () => {
    expect(
      selectRindLabelIds(
        [
          {
            id: "front",
            left: 100,
            top: 100,
            right: 220,
            bottom: 136,
            facing: 0.8,
            priority: 0,
            centerDistance: 10,
          },
          {
            id: "limb",
            left: 260,
            top: 100,
            right: 380,
            bottom: 136,
            facing: 0.08,
            priority: 4,
            centerDistance: 20,
          },
          {
            id: "back",
            left: 420,
            top: 100,
            right: 540,
            bottom: 136,
            facing: -0.5,
            priority: 4,
            centerDistance: 30,
          },
        ],
        { minFacing: 0.18, collisionPadding: 8, maxVisible: 8 }
      )
    ).toEqual(["front"]);
  });

  it("keeps the highest-priority label when cards overlap", () => {
    expect(
      selectRindLabelIds(
        [
          {
            id: "ordinary",
            left: 100,
            top: 100,
            right: 260,
            bottom: 144,
            facing: 0.95,
            priority: 0,
            centerDistance: 5,
          },
          {
            id: "selected",
            left: 130,
            top: 108,
            right: 290,
            bottom: 152,
            facing: 0.75,
            priority: 4,
            centerDistance: 25,
          },
          {
            id: "separate",
            left: 360,
            top: 100,
            right: 500,
            bottom: 144,
            facing: 0.7,
            priority: 0,
            centerDistance: 30,
          },
        ],
        { minFacing: 0.18, collisionPadding: 8, maxVisible: 8 }
      )
    ).toEqual(["selected", "separate"]);
  });

  it("caps dense label fields after accepting the best-centered cards", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `idea-${index}`,
      left: index * 150,
      top: 100,
      right: index * 150 + 120,
      bottom: 140,
      facing: 0.9,
      priority: 0,
      centerDistance: index,
    }));

    expect(
      selectRindLabelIds(candidates, {
        minFacing: 0.18,
        collisionPadding: 8,
        maxVisible: 6,
      })
    ).toEqual(["idea-0", "idea-1", "idea-2", "idea-3", "idea-4", "idea-5"]);
  });
});
