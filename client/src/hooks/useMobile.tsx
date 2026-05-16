import * as React from "react";

/** Tailwind `md:` (default). Override per-call site when a component
 *  cares about a different breakpoint (e.g. minimap wants `sm:` 640). */
const DEFAULT_MOBILE_BREAKPOINT = 768;

/**
 * Reactive "is the viewport narrower than `breakpoint` px?" hook.
 *
 * Returns `false` on the very first render (server / pre-mount) and
 * then settles on the real value once the effect runs. Re-evaluates
 * via `matchMedia` `change` events, so it correctly tracks orientation
 * changes, window resizes, and Stage Manager / Split View transitions.
 */
export function useIsMobile(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return !!isMobile;
}
