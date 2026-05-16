/** @vitest-environment jsdom */

/**
 * Regression: concurrent neighbor generation must not drop tiles.
 * Exercises the same useHistory.push + flushSync pattern as HexmindApp
 * after two centers expand without overlapping neighbor keys.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { flushSync } from "react-dom";
import { useHistory } from "@/hooks/useHistory";
import { getNodeKey } from "@/types/hexmind";
import { DIRECTIONS } from "@/lib/hexConstants";
import type { HexNode } from "@/types/hivemind";

function addSixPlaceholderNeighbors(
  prev: Record<string, HexNode>,
  center: HexNode,
  label: string
): Record<string, HexNode> {
  const centerKey = getNodeKey(center.q, center.r);
  const next = { ...prev };
  DIRECTIONS.forEach((dir, i) => {
    const nQ = center.q + dir.q;
    const nR = center.r + dir.r;
    const neighborKey = getNodeKey(nQ, nR);
    next[neighborKey] = {
      q: nQ,
      r: nR,
      text: `${label}-${i}`,
      description: "",
      type: "concept",
      depth: (center.depth ?? 0) + 1,
      parentId: centerKey,
      pinned: false,
      clusterId: center.clusterId ?? "main",
    };
  });
  return next;
}

describe("HexmindApp neighbor commit pattern", () => {
  it("keeps both six-neighbor rings after two flushSync functional pushes", () => {
    const rootA: HexNode = {
      q: 0,
      r: 0,
      text: "A",
      description: "",
      type: "root",
      depth: 0,
      pinned: true,
      clusterId: "left",
      isClusterRoot: true,
    };
    const rootB: HexNode = {
      q: 4,
      r: 0,
      text: "B",
      description: "",
      type: "root",
      depth: 0,
      pinned: true,
      clusterId: "right",
      isClusterRoot: true,
    };

    const initial: Record<string, HexNode> = {
      [getNodeKey(0, 0)]: rootA,
      [getNodeKey(4, 0)]: rootB,
    };

    const { result } = renderHook(() =>
      useHistory<Record<string, HexNode>>(initial)
    );

    act(() => {
      flushSync(() => {
        result.current.push(prev =>
          addSixPlaceholderNeighbors(prev, rootA, "ringA")
        );
      });
      flushSync(() => {
        result.current.push(prev =>
          addSixPlaceholderNeighbors(prev, rootB, "ringB")
        );
      });
    });

    const nodes = result.current.present;
    expect(Object.keys(nodes).length).toBe(14);

    const ringAKeys = DIRECTIONS.map(d =>
      getNodeKey(rootA.q + d.q, rootA.r + d.r)
    );
    const ringBKeys = DIRECTIONS.map(d =>
      getNodeKey(rootB.q + d.q, rootB.r + d.r)
    );

    for (const k of ringAKeys) {
      expect(nodes[k]?.text.startsWith("ringA-")).toBe(true);
    }
    for (const k of ringBKeys) {
      expect(nodes[k]?.text.startsWith("ringB-")).toBe(true);
    }
  });
});
