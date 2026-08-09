import { describe, expect, it } from "vitest";
import { findFrontFacingTile, generateHexasphere } from "@/lib/hexasphere";

describe("Rind hexasphere geometry", () => {
  it("builds the expected dual shell with reciprocal neighbors", () => {
    const sphere = generateHexasphere(5, 4);

    expect(sphere.tiles).toHaveLength(162);
    expect(sphere.tiles.filter(tile => tile.isPentagon)).toHaveLength(12);
    for (const tile of sphere.tiles) {
      expect(tile.neighborIndices).toHaveLength(tile.isPentagon ? 5 : 6);
      for (const neighbor of tile.neighborIndices) {
        expect(sphere.tiles[neighbor].neighborIndices).toContain(tile.index);
      }
    }
  });

  it("chooses a front-facing hexagon for the initial root", () => {
    const sphere = generateHexasphere(5, 6);
    const index = findFrontFacingTile(sphere.tiles, sphere.radius);

    expect(sphere.tiles[index].isPentagon).toBe(false);
    expect(sphere.tiles[index].centerPoint.z).toBeGreaterThan(4.5);
  });
});
