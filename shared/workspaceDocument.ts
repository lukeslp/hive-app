import { z } from "zod";

export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_ENVELOPE_VERSION = 1 as const;
export const WORKSPACE_FORMAT = "app.ideatiles.workspace" as const;
export const WORKSPACE_ENVELOPE_FORMAT =
  "app.ideatiles.workspace-envelope" as const;
export const IDEATILES_PACKAGE_EXTENSION = ".ideatiles" as const;
export const IDEATILES_PACKAGE_BOARD_FILENAME = "board.json" as const;
export const MAX_WORKSPACE_NODES = 4_096;
export const MAX_WORKSPACE_EDGES = 32_768;
/** Common web/native/package transport ceiling (UTF-8 bytes). */
export const MAX_WORKSPACE_TRANSPORT_BYTES = 16_000_000;
export const MAX_WORKSPACE_IMPORT_BYTES = MAX_WORKSPACE_TRANSPORT_BYTES;
export const MAX_WORKSPACE_JSON_DEPTH = 64;

const MAX_COORDINATE = 1_000_000;
const MAX_DEPTH = 512;
const MAX_RELATIONS_PER_NODE = 128;
const MAX_TEXT = 512;
const MAX_DESCRIPTION = 8_000;

export const workspaceModeSchema = z.enum(["tiles", "sphere"]);
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;

export const workspaceModeRegistry = [
  {
    id: "tiles",
    label: "Tiles",
    status: "available",
    rendererAvailable: true,
  },
  {
    id: "sphere",
    label: "Rind",
    status: "available",
    rendererAvailable: true,
  },
] as const satisfies ReadonlyArray<{
  id: WorkspaceMode;
  label: string;
  status: "available" | "preview";
  rendererAvailable: boolean;
}>;

const stableIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:,-]*$/);
const nodeTypeSchema = z.enum([
  "root",
  "concept",
  "action",
  "technical",
  "question",
  "risk",
  "default",
]);
const finiteCoordinateSchema = z
  .number()
  .finite()
  .min(-MAX_COORDINATE)
  .max(MAX_COORDINATE);
const boundedIntegerSchema = z
  .number()
  .int()
  .min(-MAX_COORDINATE)
  .max(MAX_COORDINATE);
const timestampSchema = z.string().datetime({ offset: true });
const canonicalTrimmedString = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(value => value === value.trim(), {
      message: "Canonical workspace strings must already be trimmed",
    });

const checksumSchema = z
  .object({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const codeSnippetSchema = z
  .object({
    language: z.string().max(128),
    code: z.string().max(MAX_DESCRIPTION),
  })
  .strict();
const visualizationSchema = z
  .object({
    type: z.enum(["chart", "map", "timeline", "diagram"]),
    data: z.unknown(),
    config: z.unknown().optional(),
  })
  .strict();
const compatibilityImageAttachmentSchema = z
  .object({
    artifactId: stableIdSchema,
    targetNodeId: z.string().min(1).max(128),
    fileId: stableIdSchema,
    mimeType: z.literal("image/png"),
    dataURL: z
      .string()
      .max(MAX_WORKSPACE_IMPORT_BYTES)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
    checksum: checksumSchema,
  })
  .strict();
const semanticCompatibilitySchema = z
  .object({
    tiles: z
      .object({
        clarifyingQuestion: z.string().max(MAX_DESCRIPTION).optional(),
        shouldAskClarifyingQuestion: z.boolean().optional(),
        clarificationReasoning: z.string().max(MAX_DESCRIPTION).optional(),
        userInputCategory: z
          .enum(["preference", "constraint", "situation", "goal"])
          .optional(),
        suggestedAnswers: z.array(z.string().max(MAX_TEXT)).max(5).optional(),
        codeSnippet: codeSnippetSchema.optional(),
        visualization: visualizationSchema.optional(),
        isBridge: z.boolean().optional(),
        bridgeTargetCluster: z.string().max(128).optional(),
        imageAttachment: compatibilityImageAttachmentSchema.optional(),
      })
      .strict()
      .optional(),
    sphere: z
      .object({
        hasDeepDive: z.boolean().optional(),
        contextPrompt: z.string().max(MAX_DESCRIPTION).optional(),
        codeSnippet: codeSnippetSchema.optional(),
        visualization: visualizationSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const artifactAttachmentMetadataSchema = z
  .object({
    artifactId: stableIdSchema,
    fileId: stableIdSchema,
    mimeType: z.string().min(1).max(128),
    checksum: checksumSchema,
  })
  .strict();

export const semanticNodeSchema = z
  .object({
    id: stableIdSchema,
    text: canonicalTrimmedString(MAX_TEXT),
    description: z.string().max(MAX_DESCRIPTION).optional(),
    contextInfo: z.string().max(MAX_DESCRIPTION).optional(),
    type: nodeTypeSchema,
    depth: z.number().int().min(0).max(MAX_DEPTH),
    hierarchyLevel: z.number().int().min(1).max(8).optional(),
    parentId: stableIdSchema.nullable(),
    isKeyTheme: z.boolean(),
    pinned: z.boolean(),
    wasInteracted: z.boolean().optional(),
    clusterId: stableIdSchema.optional(),
    isClusterRoot: z.boolean().optional(),
    artifactAttachments: z
      .array(artifactAttachmentMetadataSchema)
      .max(32)
      .default([]),
    compatibility: semanticCompatibilitySchema.optional(),
  })
  .strict();
export type SemanticNode = z.infer<typeof semanticNodeSchema>;

export const semanticEdgeSchema = z
  .object({
    sourceId: stableIdSchema,
    targetId: stableIdSchema,
    kind: z.enum(["hierarchy", "linkedContext", "related", "bridge"]),
  })
  .strict();
export type SemanticEdge = z.infer<typeof semanticEdgeSchema>;

export const semanticGraphSchema = z
  .object({
    nodes: z.array(semanticNodeSchema).max(MAX_WORKSPACE_NODES),
    edges: z.array(semanticEdgeSchema).max(MAX_WORKSPACE_EDGES),
  })
  .strict()
  .superRefine((graph, context) => {
    const ids = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (ids.has(node.id)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "id"],
          message: "Semantic node IDs must be unique",
        });
      }
      ids.add(node.id);
    });
    graph.nodes.forEach((node, index) => {
      if (
        node.parentId &&
        (!ids.has(node.parentId) || node.parentId === node.id)
      ) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "parentId"],
          message: "Parent must reference another semantic node",
        });
      }
    });
    const edgeKeys = new Set<string>();
    graph.edges.forEach((edge, index) => {
      const key = `${edge.kind}\0${edge.sourceId}\0${edge.targetId}`;
      if (
        !ids.has(edge.sourceId) ||
        !ids.has(edge.targetId) ||
        edge.sourceId === edge.targetId ||
        edgeKeys.has(key)
      ) {
        context.addIssue({
          code: "custom",
          path: ["edges", index],
          message: "Edges must be unique references between semantic nodes",
        });
      }
      edgeKeys.add(key);
    });
  });
export type SemanticGraph = z.infer<typeof semanticGraphSchema>;

const tilesProjectionSchema = z
  .object({
    nodes: z
      .record(
        stableIdSchema,
        z.object({ q: boundedIntegerSchema, r: boundedIntegerSchema }).strict()
      )
      .refine(value => Object.keys(value).length <= MAX_WORKSPACE_NODES, {
        message: "Tile projection exceeds the node limit",
      }),
    viewport: z
      .object({
        x: finiteCoordinateSchema,
        y: finiteCoordinateSchema,
        zoom: z.number().finite().min(0.05).max(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((projection, context) => {
    const coordinates = new Set<string>();
    for (const [id, position] of Object.entries(projection.nodes)) {
      const key = `${position.q},${position.r}`;
      if (coordinates.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", id],
          message: "Tile projection coordinates must be unique",
        });
      }
      coordinates.add(key);
    }
  });

const vector3Schema = z.tuple([
  finiteCoordinateSchema,
  finiteCoordinateSchema,
  finiteCoordinateSchema,
]);
const topicalAlignmentSchema = z
  .object({
    sourceId: stableIdSchema,
    targetId: stableIdSchema,
    score: z.number().finite().min(0).max(1),
    reason: canonicalTrimmedString(1_000),
    category: z.enum([
      "thematic",
      "causal",
      "complementary",
      "contrasting",
      "dependent",
    ]),
  })
  .strict();

const sphereProjectionSchema = z
  .object({
    nodes: z
      .record(
        stableIdSchema,
        z
          .object({
            tileIndex: z.number().int().min(0).max(1_000_000),
            position: vector3Schema,
          })
          .strict()
      )
      .refine(value => Object.keys(value).length <= MAX_WORKSPACE_NODES, {
        message: "Sphere projection exceeds the node limit",
      }),
    alignments: z.array(topicalAlignmentSchema).max(MAX_WORKSPACE_EDGES),
    camera: z
      .object({
        position: vector3Schema,
        target: vector3Schema,
        fov: z.number().finite().min(1).max(179),
        zoom: z.number().finite().min(0.05).max(20),
      })
      .strict(),
    subdivisions: z.number().int().min(1).max(32),
  })
  .strict()
  .superRefine((projection, context) => {
    const tileIndices = new Set<number>();
    for (const [id, position] of Object.entries(projection.nodes)) {
      if (tileIndices.has(position.tileIndex)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", id, "tileIndex"],
          message: "Sphere tile indices must be unique",
        });
      }
      tileIndices.add(position.tileIndex);
    }
    const alignmentKeys = new Set<string>();
    projection.alignments.forEach((alignment, index) => {
      const key = `${alignment.sourceId}\0${alignment.targetId}\0${alignment.category}`;
      if (alignment.sourceId === alignment.targetId || alignmentKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["alignments", index],
          message: "Sphere alignments must be unique between distinct nodes",
        });
      }
      alignmentKeys.add(key);
    });
  });

export const workspaceDocumentSchema = z
  .object({
    format: z.literal(WORKSPACE_FORMAT),
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    id: stableIdSchema,
    activeMode: workspaceModeSchema,
    graph: semanticGraphSchema,
    projections: z
      .object({
        tiles: tilesProjectionSchema,
        sphere: sphereProjectionSchema,
      })
      .strict(),
    preferences: z
      .object({ creativity: z.number().finite().min(0).max(1) })
      .strict(),
    metadata: z
      .object({
        name: canonicalTrimmedString(255).optional(),
        createdAt: timestampSchema.optional(),
        source: z.enum(["ideaTiles", "brainSphere"]).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((workspace, context) => {
    const ids = new Set(workspace.graph.nodes.map(node => node.id));
    for (const mode of ["tiles", "sphere"] as const) {
      for (const id of Object.keys(workspace.projections[mode].nodes)) {
        if (!ids.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["projections", mode, "nodes", id],
            message: "Projection references an unknown semantic node",
          });
        }
      }
    }
    workspace.projections.sphere.alignments.forEach((alignment, index) => {
      if (!ids.has(alignment.sourceId) || !ids.has(alignment.targetId)) {
        context.addIssue({
          code: "custom",
          path: ["projections", "sphere", "alignments", index],
          message: "Alignment references an unknown semantic node",
        });
      }
    });
    for (const node of workspace.graph.nodes) {
      if (
        !workspace.projections.tiles.nodes[node.id] &&
        !workspace.projections.sphere.nodes[node.id]
      ) {
        context.addIssue({
          code: "custom",
          path: ["graph", "nodes"],
          message: "Every semantic node needs at least one layout projection",
        });
      }
    }
  });
export type WorkspaceDocument = z.infer<typeof workspaceDocumentSchema>;

export const workspaceTransportEnvelopeSchema = z
  .object({
    format: z.literal(WORKSPACE_ENVELOPE_FORMAT),
    envelopeVersion: z.literal(WORKSPACE_ENVELOPE_VERSION),
    workspace: workspaceDocumentSchema,
  })
  .strict();
export type WorkspaceTransportEnvelope = z.infer<
  typeof workspaceTransportEnvelopeSchema
>;

const coordinateKeySchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^-?\d+,-?\d+$/);
const legacyImageAttachmentSchema = z
  .object({
    artifactId: stableIdSchema,
    targetNodeId: z.string().min(1).max(128),
    fileId: stableIdSchema,
    mimeType: z.literal("image/png"),
    dataURL: z
      .string()
      .max(MAX_WORKSPACE_IMPORT_BYTES)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
    checksum: checksumSchema,
  })
  .strict();
const legacyNodeSchema = z
  .object({
    semanticId: stableIdSchema.optional(),
    q: boundedIntegerSchema,
    r: boundedIntegerSchema,
    text: z.string().trim().min(1).max(MAX_TEXT),
    description: z.string().max(MAX_DESCRIPTION).optional(),
    type: nodeTypeSchema,
    depth: z.number().int().min(0).max(MAX_DEPTH),
    parentId: coordinateKeySchema.nullable().optional(),
    pinned: z.boolean(),
    isKeyTheme: z.boolean().optional(),
    wasInteracted: z.boolean().optional(),
    hierarchyLevel: z.number().int().min(1).max(8).optional(),
    clusterId: z.string().min(1).max(128).optional(),
    isClusterRoot: z.boolean().optional(),
    clarifyingQuestion: z.string().max(MAX_DESCRIPTION).optional(),
    shouldAskClarifyingQuestion: z.boolean().optional(),
    clarificationReasoning: z.string().max(MAX_DESCRIPTION).optional(),
    userInputCategory: z
      .enum(["preference", "constraint", "situation", "goal"])
      .optional(),
    suggestedAnswers: z.array(z.string().max(MAX_TEXT)).max(5).optional(),
    contextInfo: z.string().max(MAX_DESCRIPTION).optional(),
    codeSnippet: codeSnippetSchema.optional(),
    visualization: visualizationSchema.optional(),
    linkedContext: z
      .array(coordinateKeySchema)
      .max(MAX_RELATIONS_PER_NODE)
      .optional(),
    relatedNodeKeys: z
      .array(coordinateKeySchema)
      .max(MAX_RELATIONS_PER_NODE)
      .optional(),
    isBridge: z.boolean().optional(),
    bridgeTargetCluster: z.string().max(128).optional(),
    imageAttachment: legacyImageAttachmentSchema.optional(),
  })
  .strict();

const legacyNodeMapSchema = z
  .record(coordinateKeySchema, legacyNodeSchema)
  .refine(value => Object.keys(value).length <= MAX_WORKSPACE_NODES, {
    message: "Tile session exceeds the node limit",
  })
  .superRefine((nodes, context) => {
    const keys = new Set(Object.keys(nodes));
    const semanticIds = new Set<string>();
    for (const [key, node] of Object.entries(nodes)) {
      if (`${node.q},${node.r}` !== key) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Tile node keys must match their axial coordinates",
        });
      }
      const semanticId = node.semanticId ?? semanticIdForTile(node.q, node.r);
      if (semanticIds.has(semanticId)) {
        context.addIssue({
          code: "custom",
          path: [key, "semanticId"],
          message: "Semantic IDs must be unique",
        });
      }
      semanticIds.add(semanticId);
      for (const reference of [
        node.parentId,
        ...(node.linkedContext ?? []),
        ...(node.relatedNodeKeys ?? []),
      ]) {
        if (reference && !keys.has(reference)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Tile relationships must reference imported nodes",
          });
        }
      }
    }
  });

const legacyTilesSessionSchema = z
  .object({
    boardId: stableIdSchema.optional(),
    nodes: legacyNodeMapSchema,
    viewState: tilesProjectionSchema.shape.viewport.default({
      x: 0,
      y: 0,
      zoom: 0.8,
    }),
    creativity: z.number().finite().min(0).max(1).default(0.5),
    keyThemes: z.array(coordinateKeySchema).max(MAX_WORKSPACE_NODES).optional(),
    exportDate: timestampSchema.optional(),
    timestamp: z.number().int().nonnegative().optional(),
  })
  .strict();

const declaredTilesSessionSchema = z
  .object({
    nodes: legacyNodeMapSchema,
    view: tilesProjectionSchema.shape.viewport,
    metadata: z
      .object({
        id: stableIdSchema,
        name: z.string().trim().min(1).max(255),
        date: timestampSchema,
        nodeCount: z.number().int().min(0).max(MAX_WORKSPACE_NODES),
      })
      .strict(),
  })
  .strict()
  .superRefine((session, context) => {
    if (session.metadata.nodeCount !== Object.keys(session.nodes).length) {
      context.addIssue({
        code: "custom",
        path: ["metadata", "nodeCount"],
        message: "Session metadata node count must match the payload",
      });
    }
  });

const brainSphereNodeSchema = z
  .object({
    tileIndex: z.number().int().min(0).max(1_000_000),
    position: vector3Schema,
    text: z.string().trim().min(1).max(MAX_TEXT),
    description: z.string().max(MAX_DESCRIPTION).optional(),
    type: nodeTypeSchema,
    depth: z.number().int().min(0).max(MAX_DEPTH),
    parentIndex: z.number().int().min(0).max(1_000_000).nullable().optional(),
    pinned: z.boolean(),
    isKeyTheme: z.boolean().optional(),
    hasDeepDive: z.boolean().optional(),
    wasInteracted: z.boolean().optional(),
    hierarchyLevel: z.number().int().min(1).max(8).optional(),
    clusterId: z.string().min(1).max(128).optional(),
    isClusterRoot: z.boolean().optional(),
    contextPrompt: z.string().max(MAX_DESCRIPTION).optional(),
    contextInfo: z.string().max(MAX_DESCRIPTION).optional(),
    codeSnippet: codeSnippetSchema.optional(),
    visualization: visualizationSchema.optional(),
    linkedContext: z
      .array(z.number().int().min(0).max(1_000_000))
      .max(MAX_RELATIONS_PER_NODE)
      .optional(),
    relatedNodeIndices: z
      .array(z.number().int().min(0).max(1_000_000))
      .max(MAX_RELATIONS_PER_NODE)
      .optional(),
  })
  .strict();

const brainSphereSessionSchema = z
  .object({
    nodes: z
      .record(z.string().regex(/^\d+$/), brainSphereNodeSchema)
      .refine(value => Object.keys(value).length <= MAX_WORKSPACE_NODES, {
        message: "BrainSphere session exceeds the node limit",
      }),
    alignments: z
      .array(
        z
          .object({
            sourceIndex: z.number().int().min(0).max(1_000_000),
            targetIndex: z.number().int().min(0).max(1_000_000),
            score: z.number().finite().min(0).max(1),
            reason: z.string().trim().min(1).max(1_000),
            category: topicalAlignmentSchema.shape.category,
          })
          .strict()
      )
      .max(MAX_WORKSPACE_EDGES),
    camera: sphereProjectionSchema.shape.camera,
    metadata: z
      .object({
        id: z.string().min(1).max(128),
        name: z.string().trim().min(1).max(255),
        date: timestampSchema,
        nodeCount: z.number().int().min(0).max(MAX_WORKSPACE_NODES),
        alignmentCount: z.number().int().min(0).max(MAX_WORKSPACE_EDGES),
      })
      .strict(),
    sphereSubdivisions: z.number().int().min(1).max(32),
  })
  .strict()
  .superRefine((session, context) => {
    const indices = new Set<number>();
    for (const [key, node] of Object.entries(session.nodes)) {
      if (String(node.tileIndex) !== key || indices.has(node.tileIndex)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", key, "tileIndex"],
          message: "BrainSphere node keys and tile indices must be unique",
        });
      }
      indices.add(node.tileIndex);
    }
    for (const [key, node] of Object.entries(session.nodes)) {
      for (const reference of [
        node.parentIndex,
        ...(node.linkedContext ?? []),
        ...(node.relatedNodeIndices ?? []),
      ]) {
        if (
          reference !== null &&
          reference !== undefined &&
          !indices.has(reference)
        ) {
          context.addIssue({
            code: "custom",
            path: ["nodes", key],
            message: "BrainSphere relationships must reference imported nodes",
          });
        }
      }
    }
    session.alignments.forEach((alignment, index) => {
      if (
        !indices.has(alignment.sourceIndex) ||
        !indices.has(alignment.targetIndex)
      ) {
        context.addIssue({
          code: "custom",
          path: ["alignments", index],
          message: "BrainSphere alignments must reference imported nodes",
        });
      }
    });
    if (
      session.metadata.nodeCount !== Object.keys(session.nodes).length ||
      session.metadata.alignmentCount !== session.alignments.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["metadata"],
        message: "BrainSphere metadata counts must match the payload",
      });
    }
  });

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertJsonDepth(serialized: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of serialized) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > MAX_WORKSPACE_JSON_DEPTH) {
        throw new Error("Workspace import exceeds the nesting limit");
      }
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) throw new Error("Workspace import is not valid JSON");
    }
  }
}

export function workspaceImportFileSizeAllowed(size: number): boolean {
  return (
    Number.isSafeInteger(size) &&
    size >= 0 &&
    size <= MAX_WORKSPACE_IMPORT_BYTES
  );
}

function assertImportBudget(input: unknown): unknown {
  let serialized: string;
  try {
    serialized = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    throw new Error("Workspace import must be JSON serializable");
  }
  if (utf8ByteLength(serialized) > MAX_WORKSPACE_IMPORT_BYTES) {
    throw new Error("Workspace import exceeds the size limit");
  }
  assertJsonDepth(serialized);
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new Error("Workspace import is not valid JSON");
  }
}

function semanticIdForTile(q: number, r: number): string {
  return `tile:${q}:${r}`;
}

function semanticIdForSphere(tileIndex: number): string {
  return `sphere:${tileIndex}`;
}

function stableBrainSphereBoardId(sourceId: string): string {
  if (stableIdSchema.safeParse(sourceId).success) return sourceId;
  let hash = 2_166_136_261;
  for (let index = 0; index < sourceId.length; index += 1) {
    hash ^= sourceId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `board:brainsphere:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const compareCodeUnits = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

function stableTilesBoardId(workspaceWithoutId: unknown): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => compareCodeUnits(left, right))
          .map(([key, nested]) => [key, canonicalize(nested)])
      );
    }
    return value;
  };
  const canonical = JSON.stringify(canonicalize(workspaceWithoutId));
  let first = 2_166_136_261;
  let second = 2_166_136_261 ^ 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 16_777_619);
    second = Math.imul(second ^ (code + index), 16_777_619);
  }
  return `board:tiles:${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

function emptySphereProjection() {
  return {
    nodes: {},
    alignments: [],
    camera: { position: [0, 0, 15], target: [0, 0, 0], fov: 60, zoom: 1 },
    subdivisions: 4,
  } as const;
}

function dedupeEdges(edges: SemanticEdge[]): SemanticEdge[] {
  const seen = new Set<string>();
  return edges.filter(edge => {
    const key = `${edge.kind}\0${edge.sourceId}\0${edge.targetId}`;
    if (seen.has(key) || edge.sourceId === edge.targetId) return false;
    seen.add(key);
    return true;
  });
}

export function migrateTilesSession(input: unknown): WorkspaceDocument {
  const raw = assertImportBudget(input);
  const current = legacyTilesSessionSchema.safeParse(raw);
  const declared = current.success
    ? null
    : declaredTilesSessionSchema.parse(raw);
  const session = current.success
    ? current.data
    : {
        boardId: declared!.metadata.id,
        nodes: declared!.nodes,
        viewState: declared!.view,
        creativity: 0.5,
        keyThemes: undefined,
        exportDate: declared!.metadata.date,
        declaredName: declared!.metadata.name,
      };
  const idByKey = new Map(
    Object.entries(session.nodes).map(([key, node]) => [
      key,
      node.semanticId ?? semanticIdForTile(node.q, node.r),
    ])
  );
  const keyThemes = new Set(session.keyThemes ?? []);
  const nodes: SemanticNode[] = Object.entries(session.nodes).map(
    ([key, node]) => ({
      id: idByKey.get(key)!,
      text: node.text,
      description: node.description,
      contextInfo: node.contextInfo,
      type: node.type,
      depth: node.depth,
      hierarchyLevel: node.hierarchyLevel,
      parentId: node.parentId ? idByKey.get(node.parentId)! : null,
      isKeyTheme: !!node.isKeyTheme || keyThemes.has(key),
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
      compatibility: {
        tiles: {
          clarifyingQuestion: node.clarifyingQuestion,
          shouldAskClarifyingQuestion: node.shouldAskClarifyingQuestion,
          clarificationReasoning: node.clarificationReasoning,
          userInputCategory: node.userInputCategory,
          suggestedAnswers: node.suggestedAnswers,
          codeSnippet: node.codeSnippet,
          visualization: node.visualization,
          isBridge: node.isBridge,
          bridgeTargetCluster: node.bridgeTargetCluster,
          imageAttachment: node.imageAttachment,
        },
      },
    })
  );
  const edges: SemanticEdge[] = [];
  for (const [key, node] of Object.entries(session.nodes)) {
    const sourceId = idByKey.get(key)!;
    if (node.parentId) {
      edges.push({
        sourceId,
        targetId: idByKey.get(node.parentId)!,
        kind: "hierarchy",
      });
    }
    for (const linked of node.linkedContext ?? []) {
      edges.push({
        sourceId,
        targetId: idByKey.get(linked)!,
        kind: "linkedContext",
      });
    }
    for (const related of node.relatedNodeKeys ?? []) {
      edges.push({
        sourceId,
        targetId: idByKey.get(related)!,
        kind: "related",
      });
    }
  }
  const tilePositions = Object.fromEntries(
    Object.entries(session.nodes).map(([key, node]) => [
      idByKey.get(key)!,
      { q: node.q, r: node.r },
    ])
  );

  const workspaceWithoutId = {
    format: WORKSPACE_FORMAT,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeMode: "tiles" as const,
    graph: { nodes, edges: dedupeEdges(edges) },
    projections: {
      tiles: { nodes: tilePositions, viewport: session.viewState },
      sphere: emptySphereProjection(),
    },
    preferences: { creativity: session.creativity },
    metadata: {
      name: "declaredName" in session ? session.declaredName : undefined,
      createdAt: session.exportDate,
      source: "ideaTiles",
    },
  };
  const identityWorkspace = {
    ...workspaceWithoutId,
    graph: {
      nodes: [...workspaceWithoutId.graph.nodes].sort((left, right) =>
        compareCodeUnits(left.id, right.id)
      ),
      edges: [...workspaceWithoutId.graph.edges].sort((left, right) =>
        compareCodeUnits(
          `${left.kind}\0${left.sourceId}\0${left.targetId}`,
          `${right.kind}\0${right.sourceId}\0${right.targetId}`
        )
      ),
    },
  };
  return workspaceDocumentSchema.parse({
    ...workspaceWithoutId,
    id: session.boardId ?? stableTilesBoardId(identityWorkspace),
  });
}

function fallbackAxialPosition(ordinal: number): { q: number; r: number } {
  return { q: ordinal % 64, r: Math.floor(ordinal / 64) };
}

export function importBrainSphereSession(input: unknown): WorkspaceDocument {
  const session = brainSphereSessionSchema.parse(assertImportBudget(input));
  const entries = Object.entries(session.nodes).sort(
    ([, a], [, b]) => a.tileIndex - b.tileIndex
  );
  const idByIndex = new Map(
    entries.map(([, node]) => [
      node.tileIndex,
      semanticIdForSphere(node.tileIndex),
    ])
  );
  const nodes: SemanticNode[] = entries.map(([, node]) => ({
    id: idByIndex.get(node.tileIndex)!,
    text: node.text,
    description: node.description,
    contextInfo: node.contextInfo ?? node.contextPrompt,
    type: node.type,
    depth: node.depth,
    hierarchyLevel: node.hierarchyLevel,
    parentId:
      node.parentIndex === null || node.parentIndex === undefined
        ? null
        : idByIndex.get(node.parentIndex)!,
    isKeyTheme: !!node.isKeyTheme,
    pinned: node.pinned,
    wasInteracted: node.wasInteracted,
    clusterId: node.clusterId,
    isClusterRoot: node.isClusterRoot,
    artifactAttachments: [],
    compatibility: {
      sphere: {
        hasDeepDive: node.hasDeepDive,
        contextPrompt: node.contextPrompt,
        codeSnippet: node.codeSnippet,
        visualization: node.visualization,
      },
    },
  }));
  const edges: SemanticEdge[] = [];
  for (const [, node] of entries) {
    const sourceId = idByIndex.get(node.tileIndex)!;
    if (node.parentIndex !== null && node.parentIndex !== undefined) {
      edges.push({
        sourceId,
        targetId: idByIndex.get(node.parentIndex)!,
        kind: "hierarchy",
      });
    }
    for (const linked of node.linkedContext ?? []) {
      edges.push({
        sourceId,
        targetId: idByIndex.get(linked)!,
        kind: "linkedContext",
      });
    }
    for (const related of node.relatedNodeIndices ?? []) {
      edges.push({
        sourceId,
        targetId: idByIndex.get(related)!,
        kind: "related",
      });
    }
  }
  const sphereNodes = Object.fromEntries(
    entries.map(([, node]) => [
      idByIndex.get(node.tileIndex)!,
      { tileIndex: node.tileIndex, position: node.position },
    ])
  );
  const tileNodes = Object.fromEntries(
    entries.map(([, node], ordinal) => [
      idByIndex.get(node.tileIndex)!,
      fallbackAxialPosition(ordinal),
    ])
  );

  return workspaceDocumentSchema.parse({
    format: WORKSPACE_FORMAT,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    id: stableBrainSphereBoardId(session.metadata.id),
    activeMode: "sphere",
    graph: { nodes, edges: dedupeEdges(edges) },
    projections: {
      tiles: { nodes: tileNodes, viewport: { x: 0, y: 0, zoom: 0.8 } },
      sphere: {
        nodes: sphereNodes,
        alignments: session.alignments.map(alignment => ({
          sourceId: idByIndex.get(alignment.sourceIndex)!,
          targetId: idByIndex.get(alignment.targetIndex)!,
          score: alignment.score,
          reason: alignment.reason,
          category: alignment.category,
        })),
        camera: session.camera,
        subdivisions: session.sphereSubdivisions,
      },
    },
    preferences: { creativity: 0.5 },
    metadata: {
      name: session.metadata.name,
      createdAt: session.metadata.date,
      source: "brainSphere",
    },
  });
}

export function switchWorkspaceMode(
  workspace: WorkspaceDocument,
  mode: WorkspaceMode
): WorkspaceDocument {
  return workspaceDocumentSchema.parse({ ...workspace, activeMode: mode });
}

export function createWorkspaceTransportEnvelope(
  workspace: WorkspaceDocument
): WorkspaceTransportEnvelope {
  const envelope = workspaceTransportEnvelopeSchema.parse({
    format: WORKSPACE_ENVELOPE_FORMAT,
    envelopeVersion: WORKSPACE_ENVELOPE_VERSION,
    workspace,
  });
  assertImportBudget(envelope);
  return envelope;
}

export function workspaceEnvelopeForBoard(
  envelope: WorkspaceTransportEnvelope,
  boardId: string
): WorkspaceTransportEnvelope {
  const id = stableIdSchema.parse(boardId);
  return createWorkspaceTransportEnvelope(
    workspaceDocumentSchema.parse({ ...envelope.workspace, id })
  );
}

export function parseWorkspaceTransport(
  input: unknown
): WorkspaceTransportEnvelope {
  const raw = assertImportBudget(input);
  const envelope = workspaceTransportEnvelopeSchema.safeParse(raw);
  if (envelope.success) return envelope.data;
  const workspace = workspaceDocumentSchema.safeParse(raw);
  if (workspace.success)
    return createWorkspaceTransportEnvelope(workspace.data);
  const candidate = raw as Record<string, unknown> | null;
  if (
    candidate &&
    typeof candidate === "object" &&
    "sphereSubdivisions" in candidate &&
    "camera" in candidate &&
    "alignments" in candidate
  ) {
    return createWorkspaceTransportEnvelope(importBrainSphereSession(raw));
  }
  return createWorkspaceTransportEnvelope(migrateTilesSession(raw));
}

export function serializeWorkspaceBoardPayload(
  workspace: WorkspaceDocument
): string {
  return JSON.stringify(createWorkspaceTransportEnvelope(workspace));
}

export function parseWorkspaceBoardPayload(
  payload: string
): WorkspaceTransportEnvelope {
  return parseWorkspaceTransport(payload);
}

export interface LegacyTilesSession {
  boardId: string;
  nodes: Record<
    string,
    {
      semanticId: string;
      q: number;
      r: number;
      text: string;
      description?: string;
      contextInfo?: string;
      type: z.infer<typeof nodeTypeSchema>;
      depth: number;
      parentId: string | null;
      pinned: boolean;
      isKeyTheme: boolean;
      hierarchyLevel?: number;
      wasInteracted?: boolean;
      clusterId?: string;
      isClusterRoot?: boolean;
      linkedContext?: string[];
      relatedNodeKeys?: string[];
      clarifyingQuestion?: string;
      shouldAskClarifyingQuestion?: boolean;
      clarificationReasoning?: string;
      userInputCategory?: "preference" | "constraint" | "situation" | "goal";
      suggestedAnswers?: string[];
      codeSnippet?: { language: string; code: string };
      visualization?: {
        type: "chart" | "map" | "timeline" | "diagram";
        data: unknown;
        config?: unknown;
      };
      isBridge?: boolean;
      bridgeTargetCluster?: string;
      imageAttachment?: z.infer<typeof compatibilityImageAttachmentSchema>;
    }
  >;
  viewState: { x: number; y: number; zoom: number };
  creativity: number;
  keyThemes: string[];
}

export function workspaceToLegacyTilesSession(
  input: WorkspaceDocument
): LegacyTilesSession {
  const workspace = workspaceDocumentSchema.parse(input);
  const keyById = new Map(
    Object.entries(workspace.projections.tiles.nodes).map(([id, position]) => [
      id,
      `${position.q},${position.r}`,
    ])
  );
  const edgesBySource = new Map<string, SemanticEdge[]>();
  for (const edge of workspace.graph.edges) {
    const existing = edgesBySource.get(edge.sourceId) ?? [];
    existing.push(edge);
    edgesBySource.set(edge.sourceId, existing);
  }
  const nodes: LegacyTilesSession["nodes"] = {};
  for (const node of workspace.graph.nodes) {
    const position = workspace.projections.tiles.nodes[node.id];
    const key = keyById.get(node.id);
    if (!position || !key) continue;
    const edges = edgesBySource.get(node.id) ?? [];
    const linkedContext = edges
      .filter(edge => edge.kind === "linkedContext")
      .map(edge => keyById.get(edge.targetId))
      .filter((value): value is string => !!value);
    const relatedNodeKeys = edges
      .filter(edge => edge.kind === "related")
      .map(edge => keyById.get(edge.targetId))
      .filter((value): value is string => !!value);
    nodes[key] = {
      ...(node.compatibility?.tiles ?? {}),
      semanticId: node.id,
      q: position.q,
      r: position.r,
      text: node.text,
      description: node.description,
      contextInfo: node.contextInfo,
      type: node.type,
      depth: node.depth,
      parentId: node.parentId ? (keyById.get(node.parentId) ?? null) : null,
      pinned: node.pinned,
      isKeyTheme: node.isKeyTheme,
      hierarchyLevel: node.hierarchyLevel,
      wasInteracted: node.wasInteracted,
      clusterId: node.clusterId,
      isClusterRoot: node.isClusterRoot,
      ...(linkedContext.length > 0 ? { linkedContext } : {}),
      ...(relatedNodeKeys.length > 0 ? { relatedNodeKeys } : {}),
    };
  }
  return {
    boardId: workspace.id,
    nodes,
    viewState: workspace.projections.tiles.viewport,
    creativity: workspace.preferences.creativity,
    keyThemes: Object.entries(nodes)
      .filter(([, node]) => node.isKeyTheme)
      .map(([key]) => key),
  };
}

export function workspaceTransportForCloud(
  workspace: WorkspaceDocument
): WorkspaceTransportEnvelope {
  return createWorkspaceTransportEnvelope(workspace);
}

/**
 * Apply edits from the current tile renderer without discarding an existing
 * sphere layout. Projection entries for deleted semantic nodes are pruned;
 * unchanged IDs keep their original 3D placement and alignments.
 */
export function mergeTilesSessionIntoWorkspace(
  previous: WorkspaceDocument,
  tilesSession: unknown
): WorkspaceDocument {
  const prior = workspaceDocumentSchema.parse(previous);
  const migrated = migrateTilesSession(tilesSession);
  const currentIds = new Set(migrated.graph.nodes.map(node => node.id));
  const sphereNodes = Object.fromEntries(
    Object.entries(prior.projections.sphere.nodes).filter(([id]) =>
      currentIds.has(id)
    )
  );
  const alignments = prior.projections.sphere.alignments.filter(
    alignment =>
      currentIds.has(alignment.sourceId) && currentIds.has(alignment.targetId)
  );
  return workspaceDocumentSchema.parse({
    ...migrated,
    id: prior.id,
    activeMode: prior.activeMode,
    projections: {
      tiles: migrated.projections.tiles,
      sphere: {
        ...prior.projections.sphere,
        nodes: sphereNodes,
        alignments,
      },
    },
    metadata: { ...prior.metadata, ...migrated.metadata },
  });
}
