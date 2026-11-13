import { describe, expect, it } from "vitest";
import { hexTextCompensation, MAX_TILE_TEXT_ZOOM } from "@/lib/textZoom";

describe("hexTextCompensation", () => {
  it("leaves tile titles alone up to the largest size that fits", () => {
    expect(hexTextCompensation(1)).toBe(1);
    expect(hexTextCompensation(1.15)).toBe(1);
    expect(hexTextCompensation(MAX_TILE_TEXT_ZOOM)).toBe(1);
  });

  it("holds tile titles at that size when the system asks for more", () => {
    expect(hexTextCompensation(2)).toBeCloseTo(0.65, 3);
    expect(2 * hexTextCompensation(2)).toBeCloseTo(MAX_TILE_TEXT_ZOOM, 2);
  });

  it("treats a bad measurement as no enlargement", () => {
    expect(hexTextCompensation(Number.NaN)).toBe(1);
  });
});
