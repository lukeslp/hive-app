/**
 * File Purpose: Keep a reported tile's hidden text out of what the app
 *   sends or draws while it is hidden.
 * Primary Components: withoutHiddenTiles (Artifact Studio input),
 *   withHiddenTilesMasked (image exports).
 * I/O: Take the tile map and the set of hidden tile keys; return a tile map.
 *
 * Hiding a reported tile on the board is not enough if the same words then
 * go to the server inside an Artifact Studio request, or come out in an
 * exported picture. Save (JSON) and autosave are not changed: they are the
 * board itself, and the text has to be there for "Show text" to work.
 */

import { repairTilesNodesForSave } from "@shared/workspaceDocument";

export const REPORTED_TILE_LABEL = "Reported";

/**
 * The board without its hidden tiles. A child of a removed tile becomes a
 * top-level tile, and references to removed tiles are dropped.
 */
export function withoutHiddenTiles<T extends object>(
  nodes: Record<string, T>,
  hidden: ReadonlySet<string>
): Record<string, T> {
  if (hidden.size === 0) return nodes;
  const kept: Record<string, T> = {};
  for (const [key, node] of Object.entries(nodes)) {
    if (!hidden.has(key)) kept[key] = node;
  }
  return repairTilesNodesForSave(
    kept as unknown as Record<string, Record<string, unknown>>
  ) as unknown as Record<string, T>;
}

/** The board with each hidden tile's words replaced by "Reported". */
export function withHiddenTilesMasked<T extends { text: string }>(
  nodes: Record<string, T>,
  hidden: ReadonlySet<string>
): Record<string, T> {
  if (hidden.size === 0) return nodes;
  const masked: Record<string, T> = {};
  for (const [key, node] of Object.entries(nodes)) {
    masked[key] = hidden.has(key)
      ? { ...node, text: REPORTED_TILE_LABEL }
      : node;
  }
  return masked;
}
