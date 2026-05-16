/**
 * Hex Grid Math
 *
 * Pure coordinate conversion functions for the axial hex grid.
 * Extracted from HiveMindApp.tsx to allow shared use across components and hooks.
 *
 * Coordinate system: axial (q, r) with pointy-top hexagons.
 */

import { HEX_SIZE } from "./hexConstants";

/**
 * Convert axial hex coordinates to pixel (canvas) coordinates.
 * Returns the center point of the hexagon.
 */
export function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = HEX_SIZE * ((3 / 2) * r);
  return { x, y };
}

/**
 * Convert pixel (canvas) coordinates to the nearest axial hex coordinate.
 * Uses rounding to snap to the closest hex center.
 */
export function pixelToHex(x: number, y: number): { q: number; r: number } {
  const q = Math.round(((Math.sqrt(3) / 3) * x - (1 / 3) * y) / HEX_SIZE);
  const r = Math.round(((2 / 3) * y) / HEX_SIZE);
  return { q, r };
}

/**
 * Hex distance (number of single steps) between two axial coords.
 * Equivalent to `(|Δq| + |Δq+Δr| + |Δr|) / 2` for pointy-top axial
 * hexes. Was previously duplicated verbatim across `useAIGeneration`,
 * `useMergeSuggestions`, and `HexmindApp` — kept here so any drift in
 * the math stays localized.
 */
export function hexDistance(
  a: { q: number; r: number },
  b: { q: number; r: number }
): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}
