import { useState, useCallback, useMemo } from "react";

/**
 * Return type for the useHistory hook
 */
export interface UseHistoryReturn<T> {
  // Current state
  present: T;

  // Navigation capabilities
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;

  /** Snapshot or functional updater (prev = current present). */
  push: (state: T | ((prev: T) => T)) => void;
  /**
   * Amend the present entry in place — no new history entry, redo stack
   * untouched. For async refinements of an already-pushed action (e.g. an
   * LLM upgrading a merged tile's title) so one undo reverts the whole
   * action regardless of when the refinement lands.
   */
  replace: (state: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  jumpTo: (index: number) => void;

  // For external state sync (used when loading sessions)
  resetHistory: (newState: T) => void;
}

interface HistoryBundle<T> {
  entries: T[];
  index: number;
}

/**
 * Generic undo/redo hook with history management
 *
 * History and the active index live in one React state object so every
 * `push` is atomic: concurrent pushes in the same tick each see the
 * previous updater's result (no stale `historyIndex` closure, no truncated
 * redo stack).
 *
 * @param initialState - The initial state value
 * @param maxHistory - Maximum number of history entries to keep (default: 50)
 * @returns Object with present state and history navigation functions
 */
export function useHistory<T>(
  initialState: T,
  maxHistory: number = 50
): UseHistoryReturn<T> {
  const [{ entries, index }, setBundle] = useState<HistoryBundle<T>>({
    entries: [initialState],
    index: 0,
  });

  // Current state from history (with defensive fallback)
  const present = useMemo(
    () => entries[index] ?? entries[entries.length - 1] ?? initialState,
    [entries, index, initialState]
  );

  const canUndo = index > 0;
  const canRedo = index < entries.length - 1;

  /**
   * Push a new state to history. Removes any future states if we're not at the end.
   * Limits total history size to maxHistory.
   */
  const push = useCallback(
    (stateOrUpdater: T | ((prev: T) => T)) => {
      setBundle(({ entries: prevEntries, index: prevIndex }) => {
        const presentState =
          prevEntries[prevIndex] ?? prevEntries[prevEntries.length - 1];
        const nextPresent =
          typeof stateOrUpdater === "function"
            ? (stateOrUpdater as (prev: T) => T)(presentState)
            : stateOrUpdater;

        let newEntries = prevEntries.slice(0, prevIndex + 1);
        newEntries.push(nextPresent);

        if (newEntries.length > maxHistory) {
          newEntries = newEntries.slice(newEntries.length - maxHistory);
        }

        return {
          entries: newEntries,
          index: newEntries.length - 1,
        };
      });
    },
    [maxHistory]
  );

  /**
   * Replace the present entry without growing history. Entries before and
   * after the index (the redo branch) are preserved.
   */
  const replace = useCallback((stateOrUpdater: T | ((prev: T) => T)) => {
    setBundle(({ entries: prevEntries, index: prevIndex }) => {
      const presentState =
        prevEntries[prevIndex] ?? prevEntries[prevEntries.length - 1];
      const nextPresent =
        typeof stateOrUpdater === "function"
          ? (stateOrUpdater as (prev: T) => T)(presentState)
          : stateOrUpdater;
      if (nextPresent === presentState) {
        return { entries: prevEntries, index: prevIndex };
      }
      const newEntries = prevEntries.slice();
      newEntries[prevIndex] = nextPresent;
      return { entries: newEntries, index: prevIndex };
    });
  }, []);

  const undo = useCallback(() => {
    setBundle(s => (s.index > 0 ? { ...s, index: s.index - 1 } : s));
  }, []);

  const redo = useCallback(() => {
    setBundle(s =>
      s.index < s.entries.length - 1 ? { ...s, index: s.index + 1 } : s
    );
  }, []);

  /**
   * Clear history and reset to current state
   */
  const clear = useCallback(() => {
    setBundle(s => ({
      entries: [s.entries[s.index] ?? s.entries[s.entries.length - 1]],
      index: 0,
    }));
  }, []);

  /**
   * Jump to a specific index in history
   */
  const jumpTo = useCallback((jumpIndex: number) => {
    setBundle(s => {
      if (jumpIndex >= 0 && jumpIndex < s.entries.length) {
        return { ...s, index: jumpIndex };
      }
      return s;
    });
  }, []);

  /**
   * Reset history completely with a new state
   * Used when loading sessions or importing data
   */
  const resetHistory = useCallback((newState: T) => {
    setBundle({ entries: [newState], index: 0 });
  }, []);

  return {
    present,
    canUndo,
    canRedo,
    historyLength: entries.length,
    push,
    replace,
    undo,
    redo,
    clear,
    jumpTo,
    resetHistory,
  };
}
