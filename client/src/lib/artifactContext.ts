import type { ArtifactScope } from "@shared/macArtifacts";
import type { SemanticGraph, SemanticNode } from "@shared/workspaceDocument";
import { canonicalGraphFromHexNodes } from "@/lib/workspaceCompatibility";

export const DEFAULT_ARTIFACT_CONTEXT_LIMIT = 12_000;

export interface ArtifactContextSourceNode {
  semanticId?: string;
  q: number;
  r: number;
  text: string;
  description?: string;
  contextInfo?: string;
  type: string;
  depth: number;
  parentId?: string | null;
  isKeyTheme?: boolean;
}

export interface ArtifactContextNode {
  id: string;
  text: string;
  description?: string;
  contextInfo?: string;
  type: string;
  depth: number;
  parentId?: string | null;
  isKeyTheme: boolean;
}

export interface ArtifactContext {
  scope: ArtifactScope;
  nodeIds: string[];
  includedNodeIds: string[];
  nodes: ArtifactContextNode[];
  text: string;
  originalNodeCount: number;
  includedNodeCount: number;
  truncated: boolean;
}

function compareNodeEntries(
  [keyA, a]: [string, SemanticNode],
  [keyB, b]: [string, SemanticNode]
): number {
  return a.depth - b.depth || keyA.localeCompare(keyB);
}

function selectEntries(
  nodes: Record<string, SemanticNode>,
  scope: ArtifactScope
): Array<[string, SemanticNode]> {
  const allEntries = Object.entries(nodes);

  if (scope.kind === "board") {
    return allEntries.sort(compareNodeEntries);
  }

  if (scope.kind === "selection") {
    const selected = new Set(scope.nodeIds);
    return allEntries
      .filter(([key]) => selected.has(key))
      .sort(compareNodeEntries);
  }

  if (!nodes[scope.rootNodeId]) return [];

  const branchIds = new Set<string>([scope.rootNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, node] of allEntries) {
      if (
        !branchIds.has(key) &&
        node.parentId &&
        branchIds.has(node.parentId)
      ) {
        branchIds.add(key);
        changed = true;
      }
    }
  }

  return allEntries
    .filter(([key]) => branchIds.has(key))
    .sort(compareNodeEntries);
}

function formatNode(id: string, node: SemanticNode): string {
  const flags = [node.type.toUpperCase()];
  if (node.isKeyTheme) flags.push("KEY THEME");
  const details = [node.description, node.contextInfo]
    .filter((value): value is string => !!value?.trim())
    .join("\nContext: ");

  return [
    `[${flags.join(" · ")}] ${node.text.trim()}`,
    details,
    `Tile: ${id}; depth: ${node.depth}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function reduceToBudget(
  entries: Array<[string, SemanticNode]>,
  maximumCharacters: number
): { text: string; includedNodeCount: number; truncated: boolean } {
  const limit = Math.max(0, Math.floor(maximumCharacters));
  if (entries.length === 0 || limit === 0) {
    return {
      text: "",
      includedNodeCount: 0,
      truncated: entries.length > 0,
    };
  }

  const sections: string[] = [];
  for (const [id, node] of entries) {
    const section = formatNode(id, node);
    const candidate = [...sections, section].join("\n\n");
    if (candidate.length > limit) break;
    sections.push(section);
  }

  if (sections.length === entries.length) {
    return {
      text: sections.join("\n\n"),
      includedNodeCount: sections.length,
      truncated: false,
    };
  }

  if (sections.length === 0) {
    const first = formatNode(entries[0][0], entries[0][1]);
    const suffix = "…";
    return {
      text:
        limit <= suffix.length
          ? suffix.slice(0, limit)
          : `${first.slice(0, limit - suffix.length)}${suffix}`,
      includedNodeCount: 1,
      truncated: true,
    };
  }

  const omitted = entries.length - sections.length;
  const marker = `\n\n[… ${omitted} tile${omitted === 1 ? "" : "s"} omitted]`;
  let text = sections.join("\n\n");
  if (text.length + marker.length <= limit) text += marker;

  return {
    text,
    includedNodeCount: sections.length,
    truncated: true,
  };
}

function extractCanonicalContext(
  graph: SemanticGraph,
  scope: ArtifactScope,
  maximumCharacters: number,
  displayIdBySemanticId: Map<string, string>
): ArtifactContext {
  const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
  const entries: Array<[string, SemanticNode]> = selectEntries(
    nodes,
    scope
  ).map(([id, node]) => [displayIdBySemanticId.get(id) ?? id, node]);
  const reduced = reduceToBudget(entries, maximumCharacters);

  return {
    scope,
    nodeIds: entries.map(([id]) => id),
    includedNodeIds: entries
      .slice(0, reduced.includedNodeCount)
      .map(([id]) => id),
    nodes: entries.map(([id, node]) => ({
      id,
      text: node.text,
      description: node.description,
      contextInfo: node.contextInfo,
      type: node.type,
      depth: node.depth,
      parentId: node.parentId
        ? (displayIdBySemanticId.get(node.parentId) ?? node.parentId)
        : node.parentId,
      isKeyTheme: !!node.isKeyTheme,
    })),
    text: reduced.text,
    originalNodeCount: entries.length,
    includedNodeCount: reduced.includedNodeCount,
    truncated: reduced.truncated,
  };
}

export function extractArtifactContextFromGraph(
  graph: SemanticGraph,
  scope: ArtifactScope,
  maximumCharacters = DEFAULT_ARTIFACT_CONTEXT_LIMIT
): ArtifactContext {
  return extractCanonicalContext(
    graph,
    scope,
    maximumCharacters,
    new Map(graph.nodes.map(node => [node.id, node.id]))
  );
}

export function extractArtifactContext(
  nodes: Record<string, ArtifactContextSourceNode>,
  scope: ArtifactScope,
  maximumCharacters = DEFAULT_ARTIFACT_CONTEXT_LIMIT
): ArtifactContext {
  const fullNodes = nodes as Record<string, import("@/types/hivemind").HexNode>;
  const graph = canonicalGraphFromHexNodes(fullNodes);
  const semanticIdByLegacyId = new Map(
    Object.entries(nodes).map(([legacyId, node]) => [
      legacyId,
      node.semanticId ?? `tile:${node.q}:${node.r}`,
    ])
  );
  const displayIdBySemanticId = new Map(
    Array.from(semanticIdByLegacyId, ([legacyId, semanticId]) => [
      semanticId,
      legacyId,
    ])
  );
  const canonicalScope: ArtifactScope =
    scope.kind === "branch"
      ? {
          kind: "branch",
          rootNodeId:
            semanticIdByLegacyId.get(scope.rootNodeId) ?? scope.rootNodeId,
        }
      : scope.kind === "selection"
        ? {
            kind: "selection",
            nodeIds: scope.nodeIds.map(
              id => semanticIdByLegacyId.get(id) ?? id
            ),
          }
        : scope;
  return extractCanonicalContext(
    graph,
    canonicalScope,
    maximumCharacters,
    displayIdBySemanticId
  );
}
