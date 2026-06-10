/** @vitest-environment jsdom */

/**
 * useHistory — atomic push + functional updater semantics.
 *
 * Guards against the concurrent-generation bug: two synchronous pushes
 * must not truncate each other (stale historyIndex closure).
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "./useHistory";

describe("useHistory", () => {
  it("applies two synchronous functional pushes without losing either", () => {
    const { result } = renderHook(() =>
      useHistory<Record<string, number>>({ a: 1 })
    );

    act(() => {
      result.current.push(p => ({ ...p, b: 2 }));
      result.current.push(p => ({ ...p, c: 3 }));
    });

    expect(result.current.present).toEqual({ a: 1, b: 2, c: 3 });
    expect(result.current.historyLength).toBe(3);
  });

  it("applies two synchronous snapshot pushes; second replaces redo branch correctly", () => {
    const { result } = renderHook(() => useHistory(0));

    act(() => {
      result.current.push(1);
      result.current.push(2);
    });
    expect(result.current.present).toBe(2);
    expect(result.current.historyLength).toBe(3);

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe(1);

    act(() => {
      result.current.push(10);
    });
    expect(result.current.present).toBe(10);
    expect(result.current.historyLength).toBe(3);
    expect(result.current.canRedo).toBe(false);
  });

  it("trims to maxHistory and keeps present at last entry", () => {
    const { result } = renderHook(() => useHistory("a", 3));

    act(() => {
      result.current.push("b");
      result.current.push("c");
      result.current.push("d");
    });

    expect(result.current.historyLength).toBe(3);
    expect(result.current.present).toBe("d");
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe("c");

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe("b");
  });

  it("undo/redo round-trip", () => {
    const { result } = renderHook(() => useHistory({ x: 0 }));

    act(() => {
      result.current.push(p => ({ ...p, x: 1 }));
    });
    expect(result.current.present.x).toBe(1);

    act(() => {
      result.current.undo();
    });
    expect(result.current.present.x).toBe(0);

    act(() => {
      result.current.redo();
    });
    expect(result.current.present.x).toBe(1);
  });

  it("replace amends the present entry without growing history", () => {
    const { result } = renderHook(() => useHistory({ title: "a + b" }));

    act(() => {
      result.current.push({ title: "a + b" }); // the merge commit
    });
    expect(result.current.historyLength).toBe(2);

    act(() => {
      result.current.replace(p => ({ ...p, title: "Synthesized" }));
    });
    expect(result.current.present.title).toBe("Synthesized");
    expect(result.current.historyLength).toBe(2);

    // One undo reverts past the whole amended entry.
    act(() => {
      result.current.undo();
    });
    expect(result.current.present.title).toBe("a + b");
    expect(result.current.canUndo).toBe(false);
  });

  it("replace preserves the redo branch", () => {
    const { result } = renderHook(() => useHistory(0));

    act(() => {
      result.current.push(1);
      result.current.push(2);
      result.current.undo(); // present = 1, redo -> 2
    });

    act(() => {
      result.current.replace(10);
    });
    expect(result.current.present).toBe(10);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.present).toBe(2);
  });

  it("replace with an identity updater is a no-op", () => {
    const { result } = renderHook(() => useHistory({ x: 1 }));
    const before = result.current.present;

    act(() => {
      result.current.replace(p => p);
    });
    expect(result.current.present).toBe(before);
    expect(result.current.historyLength).toBe(1);
  });

  it("resetHistory clears stack", () => {
    const { result } = renderHook(() => useHistory(0));

    act(() => {
      result.current.push(1);
      result.current.push(2);
      result.current.resetHistory(99);
    });

    expect(result.current.present).toBe(99);
    expect(result.current.historyLength).toBe(1);
    expect(result.current.canUndo).toBe(false);
  });
});
