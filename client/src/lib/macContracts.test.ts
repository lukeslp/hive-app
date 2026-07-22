import { describe, expect, it } from "vitest";
import {
  ARTIFACT_SCHEMA_VERSION,
  artifactManifestSchema,
  macRpcRequestSchema,
  macRpcResponseSchema,
  type ArtifactManifest,
  type MacPlatformCapabilities,
} from "@shared/macArtifacts";

const manifest: ArtifactManifest = {
  schemaVersion: ARTIFACT_SCHEMA_VERSION,
  id: "artifact:board-1:brief-1",
  title: "Launch brief",
  kind: "markdown",
  recipeId: "brief",
  scope: { kind: "board" },
  files: [
    {
      id: "file:artifact-1:main",
      path: "brief.md",
      mimeType: "text/markdown",
      sizeBytes: 12,
      checksum: {
        algorithm: "sha256",
        value: "a".repeat(64),
      },
      createdAt: "2026-07-21T12:00:00.000Z",
      updatedAt: "2026-07-21T12:00:00.000Z",
      content: "# A brief\n",
    },
  ],
  provenance: {
    sourceBoardId: "board-1",
    sourceNodeIds: ["0,0", "1,0"],
    recipeId: "brief",
    generatedAt: "2026-07-21T12:00:00.000Z",
    generator: {
      kind: "onDevice",
      name: "Apple Foundation Models",
    },
  },
  sync: {
    status: "localOnly",
    includeImages: false,
    updatedAt: "2026-07-21T12:00:00.000Z",
  },
  createdAt: "2026-07-21T12:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

describe("Mac artifact contracts", () => {
  it("parses a complete versioned artifact manifest", () => {
    expect(artifactManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects invalid stable IDs and file checksums", () => {
    const result = artifactManifestSchema.safeParse({
      ...manifest,
      id: "contains spaces",
      files: [
        {
          ...manifest.files[0],
          checksum: { algorithm: "sha256", value: "bad" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("validates a typed artifact generation RPC envelope", () => {
    const capabilities: MacPlatformCapabilities = {
      bridgeVersion: 1,
      nativeMac: true,
      features: {
        artifactGeneration: true,
        artifactPersistence: true,
        artifactExport: true,
        imagePlayground: true,
        keychain: true,
        staticPreview: true,
      },
    };

    const request = {
      id: "rpc:generate:1",
      method: "artifact.generate",
      params: {
        requestId: "generation:1",
        sourceBoardId: "board-1",
        recipeId: "brief",
        scope: { kind: "board" },
        context: "[ROOT] Launch plan",
        capabilities,
      },
    };

    expect(macRpcRequestSchema.parse(request)).toEqual(request);
  });

  it("validates method-specific success and structured error responses", () => {
    const success = {
      id: "rpc:capabilities:1",
      method: "platform.getCapabilities",
      ok: true,
      result: {
        bridgeVersion: 1,
        nativeMac: true,
        features: {
          artifactGeneration: true,
          artifactPersistence: true,
          artifactExport: true,
          imagePlayground: true,
          keychain: true,
          staticPreview: true,
        },
      },
    };
    const failure = {
      id: "rpc:generate:2",
      ok: false,
      error: {
        code: "modelUnavailable",
        message: "The on-device model is unavailable.",
        retryable: true,
      },
    };

    expect(macRpcResponseSchema.parse(success)).toEqual(success);
    expect(macRpcResponseSchema.parse(failure)).toEqual(failure);
  });
});
