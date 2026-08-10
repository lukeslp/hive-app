import { describe, expect, it } from "vitest";
import {
  RIND_LABEL_LAYOUT_OPTIONS,
  RIND_NODE_INDICATOR_SEGMENTS,
  RIND_SURFACE_STYLES,
} from "@/lib/rindVisualStyle";

describe("Rind visual style", () => {
  it("uses octagonal node indicators", () => {
    expect(RIND_NODE_INDICATOR_SEGMENTS).toBe(8);
  });

  it("keeps labels away from the sphere limb", () => {
    expect(RIND_LABEL_LAYOUT_OPTIONS.minFacing).toBeGreaterThanOrEqual(0.45);
    expect(RIND_LABEL_LAYOUT_OPTIONS.maxVisible).toBeLessThanOrEqual(6);
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
