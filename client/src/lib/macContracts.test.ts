import { describe, expect, it } from "vitest";
import {
  ARTIFACT_SCHEMA_VERSION,
  artifactGenerationRequestSchema,
  artifactManifestSchema,
  credentialStatusSchema,
  generationSettingsSchema,
  macRpcRequestSchema,
  macRpcResponseSchema,
  hasMacArtifactStudioCapability,
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

  it.each([
    "/index.html",
    "../index.html",
    "assets/./app.js",
    "assets/../app.js",
    "assets//app.js",
    "assets/",
    "C:/index.html",
    "assets\\app.js",
    "assets/\u0000app.js",
  ])("rejects unsafe artifact file path %s", path => {
    const result = artifactManifestSchema.safeParse({
      ...manifest,
      files: [{ ...manifest.files[0], path }],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a normalized relative artifact file path", () => {
    const result = artifactManifestSchema.safeParse({
      ...manifest,
      files: [{ ...manifest.files[0], path: "assets/styles/app.css" }],
    });

    expect(result.success).toBe(true);
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
        sourceNodeIds: ["0,0", "1,0"],
        includedNodeCount: 2,
        originalNodeCount: 3,
        contextTruncated: true,
        recipeId: "brief",
        scope: { kind: "board" },
        context: "[ROOT] Launch plan",
        capabilities,
      },
    };

    expect(macRpcRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects generation provenance whose included count disagrees with its node IDs", () => {
    const result = artifactGenerationRequestSchema.safeParse({
      requestId: "generation:2",
      sourceBoardId: "board-1",
      sourceNodeIds: ["0,0"],
      includedNodeCount: 2,
      originalNodeCount: 2,
      contextTruncated: false,
      recipeId: "brief",
      scope: { kind: "board" },
      context: "Board context",
    });

    expect(result.success).toBe(false);
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

  it("validates generation settings RPC requests and responses", () => {
    const settings = {
      provider: "ollama",
      model: "gemma3:4b",
      ollamaBaseURL: "http://127.0.0.1:11434",
    } as const;
    const request = {
      id: "rpc:settings:set",
      method: "generation.settings.set",
      params: { settings },
    };
    const response = {
      id: request.id,
      method: request.method,
      ok: true,
      result: settings,
    };

    expect(generationSettingsSchema.parse(settings)).toEqual(settings);
    expect(macRpcRequestSchema.parse(request)).toEqual(request);
    expect(macRpcResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    {
      provider: "ollama",
      model: "gemma3:4b",
      ollamaBaseURL: "https://example.com",
    },
    {
      provider: "ollama",
      model: "gemma3:4b",
      ollamaBaseURL: "http://127.0.0.1:11434/path",
    },
    { provider: "gemini", model: "org/model" },
    { provider: "openai", model: "é".repeat(65) },
    { provider: "apple", model: "not-the-system-model" },
    {
      provider: "ollama",
      model: "user\u0000name/model",
      ollamaBaseURL: "http://127.0.0.1:11434",
    },
  ])("rejects native-incompatible generation settings %#", settings => {
    expect(generationSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("accepts provider-specific model identifiers and root loopback Ollama settings", () => {
    expect(
      generationSettingsSchema.safeParse({
        provider: "ollama",
        model: "gemma3:4b",
        ollamaBaseURL: "http://[::1]:11434/",
      }).success
    ).toBe(true);
    expect(
      generationSettingsSchema.safeParse({
        provider: "apple",
        model: "system-language-model",
      }).success
    ).toBe(true);
    expect(
      generationSettingsSchema.safeParse({
        provider: "ollama",
        model: "username/model:latest",
        ollamaBaseURL: "http://127.0.0.1:11434",
      }).success
    ).toBe(true);
    expect(
      generationSettingsSchema.safeParse({
        provider: "ollama",
        model: "hf.co/username/repository:Q4_K_M",
        ollamaBaseURL: "http://127.0.0.1:11434",
      }).success
    ).toBe(true);
    expect(
      generationSettingsSchema.safeParse({
        provider: "openai",
        model: "organization/model:release",
      }).success
    ).toBe(true);
    expect(
      generationSettingsSchema.safeParse({
        provider: "ollama",
        model: "username/../model",
        ollamaBaseURL: "http://127.0.0.1:11434",
      }).success
    ).toBe(false);
  });

  it("never throws safeParse when an Ollama URL is malformed", () => {
    const parse = () =>
      generationSettingsSchema.safeParse({
        provider: "ollama",
        model: "gemma3:4b",
        ollamaBaseURL: "http://[invalid",
      });

    expect(parse).not.toThrow();
    expect(parse().success).toBe(false);
  });

  it("validates a semantic image-to-tile attachment response", () => {
    const response = {
      id: "rpc:attach:1",
      method: "artifact.attachImage",
      ok: true,
      result: {
        artifactId: "artifact:test:1",
        targetNodeId: "0,0",
        fileId: "file:test:1",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,iVBORw0KGgo=",
        checksum: { algorithm: "sha256", value: "a".repeat(64) },
      },
    };

    expect(macRpcResponseSchema.parse(response)).toEqual(response);
  });

  it("keeps provider credentials request-only", () => {
    const request = {
      id: "rpc:credential:set",
      method: "credentials.set",
      params: { provider: "anthropic", credential: "secret-value" },
    } as const;
    const response = {
      id: request.id,
      method: request.method,
      ok: true,
      result: { provider: "anthropic", configured: true },
    } as const;

    expect(macRpcRequestSchema.parse(request)).toEqual(request);
    expect(macRpcResponseSchema.parse(response)).toEqual(response);
    expect(
      macRpcResponseSchema.safeParse({
        ...response,
        result: { ...response.result, credential: "secret-value" },
      }).success
    ).toBe(false);
  });

  it("returns only fixed credential configuration statuses", () => {
    const result = {
      configured: {
        gemini: true,
        anthropic: false,
        openai: true,
        xai: false,
        mistral: false,
      },
    };

    expect(credentialStatusSchema.parse(result)).toEqual(result);
    expect(
      credentialStatusSchema.safeParse({
        ...result,
        configured: { ...result.configured, apple: true },
      }).success
    ).toBe(false);
  });

  it("enables Artifact Studio only for a capable native Mac host", () => {
    const capableMac: MacPlatformCapabilities = {
      bridgeVersion: 1,
      nativeMac: true,
      features: {
        artifactGeneration: true,
        artifactPersistence: true,
        artifactExport: true,
        imagePlayground: false,
        keychain: true,
        staticPreview: true,
      },
    };

    expect(hasMacArtifactStudioCapability(capableMac)).toBe(true);
    expect(
      hasMacArtifactStudioCapability({ ...capableMac, nativeMac: false })
    ).toBe(false);
    expect(
      hasMacArtifactStudioCapability({
        ...capableMac,
        features: { ...capableMac.features, artifactGeneration: false },
      })
    ).toBe(false);
    expect(hasMacArtifactStudioCapability({ nativeMac: true })).toBe(false);
  });
});
