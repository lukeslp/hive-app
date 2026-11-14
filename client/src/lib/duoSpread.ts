/**
 * iPhone Duo two-page spread for the tiles board.
 *
 * The iOS shell reports the fold through DuoBridge.swift and the bundled
 * duo-fold.js shim (`window.DuoFold` and a `duo:fold` event). Browsers, Android
 * and the Mac app never load the shim, so nothing changes there.
 *
 * With a fold down the middle of the inner screen (book pose, or lying flat
 * sideways) the board takes the left page and a permanent inspect pane takes the
 * right page, with nothing to tap on the fold.
 */
import { useLayoutEffect, useState } from "react";

export interface DuoFoldState {
  hinge: boolean;
  pose: "book" | "laptop" | "flat" | null;
  axis?: "vertical" | "horizontal" | null;
  fold: { x: number; y: number; width: number; height: number } | null;
}

declare global {
  interface Window {
    DuoFold?: { readonly state: DuoFoldState };
  }
}

/** Viewport px: the board ends at `foldLeft`, the inspect pane starts at `foldRight`. */
export interface DuoSpread {
  foldLeft: number;
  foldRight: number;
}

/** Each page must hold the board or the pane comfortably. */
export const DUO_MIN_PAGE = 360;
/** The fold band down the inner screen's middle; used while it lies flat. */
export const DUO_FOLD_BAND = 40;

export function duoSpreadFor(
  state: DuoFoldState | null | undefined,
  width: number
): DuoSpread | null {
  if (!state?.hinge) return null;
  const fold = state.fold;
  let foldLeft: number;
  let foldRight: number;
  if (fold && fold.height > fold.width) {
    foldLeft = fold.x;
    foldRight = fold.x + fold.width;
  } else if (!fold && state.pose === "flat" && state.axis === "vertical") {
    foldLeft = (width - DUO_FOLD_BAND) / 2;
    foldRight = (width + DUO_FOLD_BAND) / 2;
  } else {
    return null;
  }
  if (foldLeft < DUO_MIN_PAGE || width - foldRight < DUO_MIN_PAGE) return null;
  return { foldLeft, foldRight };
}

function readSpread(): DuoSpread | null {
  if (typeof window === "undefined") return null;
  return duoSpreadFor(window.DuoFold?.state, window.innerWidth);
}

/**
 * The spread, or null everywhere else. While a spread is active, <html> carries
 * `data-tiles-spread` and `--duo-fold-left/right` so CSS can place the toolbar,
 * dialogs and toasts.
 */
export function useDuoSpread(): DuoSpread | null {
  const [spread, setSpread] = useState<DuoSpread | null>(readSpread);

  useLayoutEffect(() => {
    const update = () => {
      const next = readSpread();
      setSpread(prev =>
        prev?.foldLeft === next?.foldLeft && prev?.foldRight === next?.foldRight
          ? prev
          : next
      );
    };
    window.addEventListener("duo:fold", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("duo:fold", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useLayoutEffect(() => {
    if (!spread) return;
    const root = document.documentElement;
    root.setAttribute("data-tiles-spread", "");
    root.style.setProperty("--duo-fold-left", `${spread.foldLeft}px`);
    root.style.setProperty("--duo-fold-right", `${spread.foldRight}px`);
    return () => {
      root.removeAttribute("data-tiles-spread");
      root.style.removeProperty("--duo-fold-left");
      root.style.removeProperty("--duo-fold-right");
    };
  }, [spread]);

  return spread;
}
