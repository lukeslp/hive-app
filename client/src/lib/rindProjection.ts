import type { HexNode } from "@/types/hivemind";

export interface RindTopologyTile {
  index: number;
  neighborIndices: number[];
  position: [number, number, number];
}

export interface RindNodePlacement {
  tileIndex: number;
  position: [number, number, number];
}

export function semanticIdForRindNode(node: HexNode): string {
  return node.semanticId ?? `tile:${node.q}:${node.r}`;
}

export function rindSubdivisionsForNodeCount(
  count: number,
  saved: number
): number {
  const needed = Math.ceil(Math.sqrt(Math.max(1, count - 2) / 10));
  return Math.min(12, Math.max(1, saved, needed));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function availableTilesFrom(
  start: number,
  tilesByIndex: Map<number, RindTopologyTile>,
  occupied: Set<number>
): number[] {
  const visited = new Set<number>([start]);
  const queue = [start];
  const available: number[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const tile = tilesByIndex.get(current);
    if (!tile) continue;
    const neighbors = [...tile.neighborIndices].sort((a, b) => a - b);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
      if (!occupied.has(neighbor)) available.push(neighbor);
    }
  }

  return available;
}

/**
 * Fill missing sphere placements without changing imported Rind positions.
 * Parents seed a breadth-first search so branches remain visually adjacent;
 * stable semantic ordering keeps the result identical across save/load order.
 */
export function deriveRindProjection(
  nodes: Record<string, HexNode>,
  tiles: RindTopologyTile[],
  existing: Record<string, RindNodePlacement>,
  preferredRootTileIndex: number
): Record<string, RindNodePlacement> {
  const tilesByIndex = new Map(tiles.map(tile => [tile.index, tile]));
  const occupied = new Set<number>();
  const result: Record<string, RindNodePlacement> = {};
  const entries = Object.entries(nodes).map(([key, node]) => ({
    key,
    node,
    semanticId: semanticIdForRindNode(node),
  }));
  const semanticIdByKey = new Map(
    entries.map(entry => [entry.key, entry.semanticId])
  );

  for (const entry of [...entries].sort((left, right) =>
    compareCodeUnits(left.semanticId, right.semanticId)
  )) {
    const placement = existing[entry.semanticId];
    if (!placement || !tilesByIndex.has(placement.tileIndex)) continue;
    if (occupied.has(placement.tileIndex)) continue;
    result[entry.semanticId] = placement;
    occupied.add(placement.tileIndex);
  }

  const ordered = [...entries].sort(
    (left, right) =>
      left.node.depth - right.node.depth ||
      compareCodeUnits(left.semanticId, right.semanticId)
  );
  for (const entry of ordered) {
    if (result[entry.semanticId]) continue;

    const parentSemanticId = entry.node.parentId
      ? semanticIdByKey.get(entry.node.parentId)
      : undefined;
    const parentTileIndex = parentSemanticId
      ? result[parentSemanticId]?.tileIndex
      : undefined;
    const seed =
      parentTileIndex ??
      (tilesByIndex.has(preferredRootTileIndex)
        ? preferredRootTileIndex
        : tiles[0]?.index);
    if (seed === undefined) break;

    const candidates = occupied.has(seed)
      ? availableTilesFrom(seed, tilesByIndex, occupied)
      : [seed, ...availableTilesFrom(seed, tilesByIndex, occupied)];
    const tileIndex = candidates[0];
    const tile =
      tileIndex === undefined ? undefined : tilesByIndex.get(tileIndex);
    if (!tile) continue;
    result[entry.semanticId] = {
      tileIndex,
      position: [...tile.position],
    };
    occupied.add(tileIndex);
  }

  return result;
}
