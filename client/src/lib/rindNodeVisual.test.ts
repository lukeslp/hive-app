import { describe, expect, it } from "vitest";
import { rindNodeVisualSpec } from "@/lib/rindNodeVisual";
import type { HexNode } from "@/types/hivemind";

const node = (overrides: Partial<HexNode> = {}): HexNode => ({
  q: 0,
  r: 0,
  text: "Facial Expression Analysis",
  type: "concept",
  depth: 1,
  pinned: false,
  ...overrides,
});

describe("Rind node visual specification", () => {
  it("gives ordinary ideas a full-face tint, type icon, and wrapped title", () => {
    const visual = rindNodeVisualSpec(node(), {
      dark: false,
      selected: false,
      hovered: false,
      loading: false,
      generating: false,
    });

    expect(visual.faceFill).not.toBe(visual.borderColor);
    expect(visual.icon).toBe("lightbulb");
    expect(visual.lines).toEqual(["Facial Expression", "Analysis"]);
    expect(visual.dashed).toBe(false);
  });

  it("uses an inset card and strong type outline for selection", () => {
    const visual = rindNodeVisualSpec(node({ type: "technical" }), {
      dark: false,
      selected: true,
      hovered: false,
      loading: false,
      generating: false,
    });

    expect(visual.faceFill).toBe(0xffffff);
    expect(visual.borderColor).toBe(0x22d3ee);
    expect(visual.emphasis).toBe("selected");
  });

  it("gives key themes a visible sparkle and gold emphasis", () => {
    const visual = rindNodeVisualSpec(node({ isKeyTheme: true }), {
      dark: true,
      selected: false,
      hovered: false,
      loading: false,
      generating: false,
    });

    expect(visual.badge).toBe("sparkles");
    expect(visual.emphasis).toBe("key-theme");
    expect(visual.borderColor).toBe(0xfacc15);
  });

  it("represents loading and generated placeholders without relying on color", () => {
    const loading = rindNodeVisualSpec(node(), {
      dark: false,
      selected: false,
      hovered: false,
      loading: true,
      generating: false,
    });
    const placeholder = rindNodeVisualSpec(
      node({ text: "Generating…", type: "technical" }),
      {
        dark: false,
        selected: false,
        hovered: false,
        loading: false,
        generating: true,
      }
    );

    expect(loading.icon).toBe("spinner");
    expect(loading.lines).toEqual(["Generating"]);
    expect(placeholder.icon).toBe("ellipsis");
    expect(placeholder.lines).toEqual([]);
    expect(placeholder.dashed).toBe(true);
    expect(placeholder.borderColor).toBe(0xa5b4fc);
    expect(placeholder.faceFill).toBe(0xf8fafc);
  });

  it("maps root and action types to the same semantic icons as Tiles", () => {
    const state = {
      dark: false,
      selected: false,
      hovered: false,
      loading: false,
      generating: false,
    };

    expect(rindNodeVisualSpec(node({ type: "root" }), state).icon).toBe(
      "hexagon"
    );
    expect(rindNodeVisualSpec(node({ type: "action" }), state).icon).toBe(
      "activity"
    );
  });
});
