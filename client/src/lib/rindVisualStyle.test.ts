import { describe, expect, it } from "vitest";
import {
  RIND_NODE_INDICATOR_SEGMENTS,
  RIND_SURFACE_STYLES,
  RIND_TILE_CONTENT_OPTIONS,
} from "@/lib/rindVisualStyle";

describe("Rind visual style", () => {
  it("uses octagonal node indicators", () => {
    expect(RIND_NODE_INDICATOR_SEGMENTS).toBe(8);
  });

  it("keeps tile content away from the sphere limb without hiding the neighborhood", () => {
    expect(RIND_TILE_CONTENT_OPTIONS.minFacing).toBeGreaterThanOrEqual(0.45);
    expect(RIND_TILE_CONTENT_OPTIONS.showAllFrontFacing).toBe(true);
  });

  it.each(["light", "dark"] as const)(
    "gives %s mode an explicit contrasting seam",
    theme => {
      const style = RIND_SURFACE_STYLES[theme];
      expect(style.seam).not.toBe(style.shell);
      expect(style.background).not.toBe(style.shell);
    }
  );
});
