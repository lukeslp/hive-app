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

export const generationProviderSchema = z.enum([
  "apple",
  "gemini",
  "anthropic",
  "openai",
  "xai",
  "mistral",
  "ollama",
]);
export type GenerationProvider = z.infer<typeof generationProviderSchema>;

export const generationSettingsSchema = z
  .object({
    provider: generationProviderSchema,
    model: z
      .string()
      .trim()
      .min(1)
      .refine(value => new TextEncoder().encode(value).byteLength <= 128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    ollamaBaseURL: z
      .string()
      .url()
      .refine(value => new TextEncoder().encode(value).byteLength <= 2_048)
      .optional(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.provider === "ollama" && !settings.ollamaBaseURL) {
      context.addIssue({
        code: "custom",
        path: ["ollamaBaseURL"],
        message: "Ollama requires a loopback base URL",
      });
    }
    if (settings.provider === "ollama" && settings.ollamaBaseURL) {
      const url = new URL(settings.ollamaBaseURL);
      const host = url.hostname.toLowerCase();
      const octets = host.split(".");
      const loopback =
        host === "localhost" ||
        host === "[::1]" ||
        (octets.length === 4 &&
          octets[0] === "127" &&
          octets.every(part => /^\d+$/.test(part) && Number(part) <= 255));
      if (
        !loopback ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        context.addIssue({
          code: "custom",
          path: ["ollamaBaseURL"],
          message: "Ollama requires a root loopback URL",
        });
      }
    }
    if (
      settings.provider === "apple" &&
      settings.model !== "system-language-model"
    ) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Apple uses the system language model",
      });
    }
  });
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export const credentialProviderSchema = z.enum([
  "gemini",
  "anthropic",
  "openai",
  "xai",
  "mistral",
]);
export type CredentialProvider = z.infer<typeof credentialProviderSchema>;

const configuredCredentialSchema = z
  .object({
    gemini: z.boolean(),
    anthropic: z.boolean(),
    openai: z.boolean(),
    xai: z.boolean(),
    mistral: z.boolean(),
  })
  .strict();
export const credentialStatusSchema = z
  .object({ configured: configuredCredentialSchema })
  .strict();
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;

export const artifactImageAttachmentSchema = z
  .object({
    artifactId: stableIdSchema,
    targetNodeId: stableIdSchema,
    fileId: stableIdSchema,
    mimeType: z.literal("image/png"),
    dataURL: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
    checksum: z
      .object({
        algorithm: z.literal("sha256"),
        value: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();
export type ArtifactImageAttachment = z.infer<
  typeof artifactImageAttachmentSchema
>;

const credentialSetResultSchema = z
  .object({
    provider: credentialProviderSchema,
    configured: z.literal(true),
  })
  .strict();
const credentialRemovalResultSchema = z
  .object({
    provider: credentialProviderSchema,
    configured: z.literal(false),
  })
  .strict();

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
        .object({
          artifactId: stableIdSchema,
          targetNodeId: stableIdSchema,
          file: artifactFileSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("generation.settings.get"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("generation.settings.set"),
      params: z.object({ settings: generationSettingsSchema }).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("credentials.status"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("credentials.set"),
      params: z
        .object({
          provider: credentialProviderSchema,
          credential: z
            .string()
            .trim()
            .min(1)
            .refine(
              value => new TextEncoder().encode(value).byteLength <= 16_384
            ),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: rpcIdSchema,
      method: z.literal("credentials.remove"),
      params: z.object({ provider: credentialProviderSchema }).strict(),
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
      result: artifactImageAttachmentSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("generation.settings.get"),
      result: generationSettingsSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("generation.settings.set"),
      result: generationSettingsSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("credentials.status"),
      result: credentialStatusSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("credentials.set"),
      result: credentialSetResultSchema,
    })
    .strict(),
  z
    .object({
      ...rpcSuccessBase,
      method: z.literal("credentials.remove"),
      result: credentialRemovalResultSchema,
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
  "artifact.attachImage": ArtifactImageAttachment;
  "generation.settings.get": GenerationSettings;
  "generation.settings.set": GenerationSettings;
  "credentials.status": CredentialStatus;
  "credentials.set": { provider: CredentialProvider; configured: true };
  "credentials.remove": { provider: CredentialProvider; configured: false };
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
  attachImageToBoard(
    manifest: ArtifactManifest,
    targetNodeId: string
  ): Promise<ArtifactImageAttachment>;
}

export interface NativeGenerationSettingsService {
  get(): Promise<GenerationSettings>;
  set(settings: GenerationSettings): Promise<GenerationSettings>;
}

export interface NativeCredentialService {
  status(): Promise<CredentialStatus>;
  set(
    provider: CredentialProvider,
    credential: string
  ): Promise<{ provider: CredentialProvider; configured: true }>;
  remove(
    provider: CredentialProvider
  ): Promise<{ provider: CredentialProvider; configured: false }>;
}

export interface MacRpcBridge {
  request<M extends MacRpcMethod>(
    request: Extract<MacRpcRequest, { method: M }>
  ): Promise<MacRpcResultMap[M]>;
}
