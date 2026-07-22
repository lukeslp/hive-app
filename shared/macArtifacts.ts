import { z } from "zod";

export const ARTIFACT_SCHEMA_VERSION = 1 as const;
export const MAC_BRIDGE_VERSION = 1 as const;

const stableIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:,-]*$/);
const timestampSchema = z.string().datetime({ offset: true });

export const artifactFilePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(path => {
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) return false;
    if (path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) {
      return false;
    }
    return path
      .split("/")
      .every(
        segment => segment.length > 0 && segment !== "." && segment !== ".."
      );
  }, "Artifact paths must be normalized relative paths");

export const artifactKindSchema = z.enum([
  "markdown",
  "codeBundle",
  "mermaid",
  "svg",
  "staticWeb",
  "image",
]);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const artifactScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("board") }).strict(),
  z.object({ kind: z.literal("branch"), rootNodeId: stableIdSchema }).strict(),
  z
    .object({
      kind: z.literal("selection"),
      nodeIds: z.array(stableIdSchema).min(1),
    })
    .strict(),
]);
export type ArtifactScope = z.infer<typeof artifactScopeSchema>;

export const artifactFileSchema = z
  .object({
    id: stableIdSchema,
    path: artifactFilePathSchema,
    mimeType: z.string().min(1).max(128),
    sizeBytes: z.number().int().nonnegative(),
    checksum: z
      .object({
        algorithm: z.literal("sha256"),
        value: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    encoding: z.enum(["utf8", "base64"]).optional(),
    content: z.string().optional(),
  })
  .strict();
export type ArtifactFile = z.infer<typeof artifactFileSchema>;

export const artifactProvenanceSchema = z
  .object({
    sourceBoardId: stableIdSchema,
    sourceNodeIds: z.array(stableIdSchema),
    recipeId: stableIdSchema,
    generatedAt: timestampSchema,
    generator: z
      .object({
        kind: z.enum([
          "onDevice",
          "directProvider",
          "dreamer",
          "imagePlayground",
        ]),
        name: z.string().min(1).max(128),
        model: z.string().min(1).max(128).optional(),
      })
      .strict(),
  })
  .strict();
export type ArtifactProvenance = z.infer<typeof artifactProvenanceSchema>;

export const artifactSyncStateSchema = z
  .object({
    status: z.enum(["localOnly", "pending", "synced", "error"]),
    includeImages: z.boolean(),
    updatedAt: timestampSchema,
    remoteId: stableIdSchema.optional(),
    error: z.string().max(1_000).optional(),
  })
  .strict();
export type ArtifactSyncState = z.infer<typeof artifactSyncStateSchema>;

export const artifactManifestSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
    id: stableIdSchema,
    title: z.string().min(1).max(256),
    kind: artifactKindSchema,
    recipeId: stableIdSchema,
    scope: artifactScopeSchema,
    files: z.array(artifactFileSchema).min(1),
    provenance: artifactProvenanceSchema,
    sync: artifactSyncStateSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const macPlatformCapabilitiesSchema = z
  .object({
    bridgeVersion: z.literal(MAC_BRIDGE_VERSION),
    nativeMac: z.boolean(),
    features: z
      .object({
        artifactGeneration: z.boolean(),
        artifactPersistence: z.boolean(),
        artifactExport: z.boolean(),
        imagePlayground: z.boolean(),
        keychain: z.boolean(),
        staticPreview: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type MacPlatformCapabilities = z.infer<
  typeof macPlatformCapabilitiesSchema
>;

export function hasMacArtifactStudioCapability(
  candidate: unknown
): candidate is MacPlatformCapabilities {
  const parsed = macPlatformCapabilitiesSchema.safeParse(candidate);
  if (!parsed.success) return false;
  const { nativeMac, features } = parsed.data;
  return (
    nativeMac &&
    features.artifactGeneration &&
    features.artifactPersistence &&
    features.artifactExport
  );
}

export const artifactGenerationRequestSchema = z
  .object({
    requestId: stableIdSchema,
    sourceBoardId: stableIdSchema,
    sourceNodeIds: z.array(stableIdSchema).min(1),
    includedNodeCount: z.number().int().positive(),
    originalNodeCount: z.number().int().positive(),
    contextTruncated: z.boolean(),
    recipeId: stableIdSchema,
    scope: artifactScopeSchema,
    context: z.string().min(1),
    instructions: z.string().max(8_000).optional(),
    capabilities: macPlatformCapabilitiesSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.includedNodeCount !== request.sourceNodeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["includedNodeCount"],
        message: "Included node count must match source node IDs",
      });
    }
    if (request.includedNodeCount > request.originalNodeCount) {
      context.addIssue({
        code: "custom",
        path: ["originalNodeCount"],
        message: "Original node count cannot be smaller than included count",
      });
    }
    if (
      !request.contextTruncated &&
      request.includedNodeCount !== request.originalNodeCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["contextTruncated"],
        message: "A reduced node set must be marked as truncated",
      });
    }
  });
export type ArtifactGenerationRequest = z.infer<
  typeof artifactGenerationRequestSchema
>;

export const artifactGenerationProgressSchema = z
  .object({
    requestId: stableIdSchema,
    phase: z.enum(["preparing", "generating", "packaging", "complete"]),
    completed: z.number().min(0).max(1),
    message: z.string().max(256).optional(),
  })
  .strict();
export type ArtifactGenerationProgress = z.infer<
  typeof artifactGenerationProgressSchema
>;

const rpcIdSchema = stableIdSchema;
export const macRpcRequestSchema = z.discriminatedUnion("method", [
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("platform.getCapabilities"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("artifact.generate"),
      params: artifactGenerationRequestSchema,
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("artifact.cancel"),
      params: z.object({ requestId: stableIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("artifact.save"),
      params: z.object({ manifest: artifactManifestSchema }).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("artifact.export"),
      params: z.object({ manifest: artifactManifestSchema }).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("artifact.attachImage"),
      params: z
        .object({ artifactId: stableIdSchema, file: artifactFileSchema })
        .strict(),
    })
    .strict(),
]);
export type MacRpcRequest = z.infer<typeof macRpcRequestSchema>;

const rpcSuccessBase = {
  id: rpcIdSchema,
  ok: z.literal(true),
} as const;
export const macRpcResponseSchema = z.union([
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("platform.getCapabilities"),
      result: macPlatformCapabilitiesSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("artifact.generate"),
      result: artifactManifestSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("artifact.cancel"),
      result: z.object({ cancelled: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("artifact.save"),
      result: artifactManifestSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("artifact.export"),
      result: z.object({ exported: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("artifact.attachImage"),
      result: artifactManifestSchema,
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      ok: z.literal(false),
      error: z
        .object({
          code: stableIdSchema,
          message: z.string().min(1).max(1_000),
          retryable: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);
export type MacRpcResponse = z.infer<typeof macRpcResponseSchema>;
export type MacRpcMethod = MacRpcRequest["method"];

export interface MacRpcResultMap {
  "platform.getCapabilities": MacPlatformCapabilities;
  "artifact.generate": ArtifactManifest;
  "artifact.cancel": { cancelled: boolean };
  "artifact.save": ArtifactManifest;
  "artifact.export": { exported: boolean };
  "artifact.attachImage": ArtifactManifest;
}

export interface ArtifactGenerator {
  generate(
    request: ArtifactGenerationRequest,
    options: {
      signal: AbortSignal;
      onProgress: (progress: ArtifactGenerationProgress) => void;
    }
  ): Promise<ArtifactManifest>;
}

export interface ArtifactPersistence {
  save(manifest: ArtifactManifest): Promise<ArtifactManifest>;
  export(manifest: ArtifactManifest): Promise<void>;
}

export interface ArtifactStudioServices {
  generator: ArtifactGenerator;
  persistence: ArtifactPersistence;
  attachImageToBoard(manifest: ArtifactManifest): Promise<void>;
}

export interface MacRpcBridge {
  request<M extends MacRpcMethod>(
    request: Extract<MacRpcRequest, { method: M }>
  ): Promise<MacRpcResultMap[M]>;
}
