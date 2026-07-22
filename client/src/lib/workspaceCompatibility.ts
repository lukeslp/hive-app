import type { HexNode, ViewState } from "@/types/hivemind";
import {
  workspaceToLegacyTilesSession,
  type SemanticGraph,
  type WorkspaceDocument,
} from "@shared/workspaceDocument";

/**
 * Lift the current coordinate-keyed HexNode API into the canonical semantic
 * graph. Existing callers can keep using HexNode while new workspace modes
 * share identity and relationships independently of renderer layout.
 */
export function canonicalGraphFromHexNodes(
  nodes: Record<string, HexNode>
): SemanticGraph {
  const canonicalTypes = new Set<SemanticGraph["nodes"][number]["type"]>([
    "root",
    "concept",
    "action",
    "technical",
    "question",
    "risk",
    "default",
  ]);
  const idByCoordinate = new Map(
    Object.entries(nodes).map(([key, node]) => [
      key,
      node.semanticId ?? `tile:${node.q}:${node.r}`,
    ])
  );
  const edges: SemanticGraph["edges"] = [];
  for (const [key, node] of Object.entries(nodes)) {
    const sourceId = idByCoordinate.get(key)!;
    if (node.parentId && idByCoordinate.has(node.parentId)) {
      edges.push({
        sourceId,
        targetId: idByCoordinate.get(node.parentId)!,
        kind: "hierarchy",
      });
    }
    for (const linked of node.linkedContext ?? []) {
      if (idByCoordinate.has(linked)) {
        edges.push({
          sourceId,
          targetId: idByCoordinate.get(linked)!,
          kind: "linkedContext",
        });
      }
    }
    for (const related of node.relatedNodeKeys ?? []) {
      if (idByCoordinate.has(related)) {
        edges.push({
          sourceId,
          targetId: idByCoordinate.get(related)!,
          kind: "related",
        });
      }
    }
  }
  return {
    nodes: Object.entries(nodes).map(([key, node]) => ({
      id: idByCoordinate.get(key)!,
      text: node.text,
      description: node.description,
      contextInfo: node.contextInfo,
      type: canonicalTypes.has(
        node.type as SemanticGraph["nodes"][number]["type"]
      )
        ? (node.type as SemanticGraph["nodes"][number]["type"])
        : "default",
      depth: node.depth,
      hierarchyLevel: node.hierarchyLevel,
      parentId: node.parentId
        ? (idByCoordinate.get(node.parentId) ?? null)
        : null,
      isKeyTheme: !!node.isKeyTheme,
      pinned: node.pinned,
      wasInteracted: node.wasInteracted,
      clusterId: node.clusterId,
      isClusterRoot: node.isClusterRoot,
      artifactAttachments: node.imageAttachment
        ? [
            {
              artifactId: node.imageAttachment.artifactId,
              fileId: node.imageAttachment.fileId,
              mimeType: node.imageAttachment.mimeType,
              checksum: node.imageAttachment.checksum,
            },
          ]
        : [],
    })),
    edges,
  };
}

export function hexNodesFromWorkspace(workspace: WorkspaceDocument): {
  nodes: Record<string, HexNode>;
  viewState: ViewState;
  creativity: number;
} {
  const legacy = workspaceToLegacyTilesSession(workspace);
  return {
    nodes: legacy.nodes as Record<string, HexNode>,
    viewState: legacy.viewState,
    creativity: legacy.creativity,
  };
}
