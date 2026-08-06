import { buildApiUrl, fetchApi } from "@/lib/api";
import { isNativeMac } from "@/lib/platform";
import type {
  ArtifactStudioServices,
  NativeAuthenticationService,
  NativeCredentialService,
  NativeDreamerAccessService,
  NativeFileSaveService,
  NativeGenerationSettingsService,
  NativeMacSettingsService,
  NativeTextGenerationInput,
  NativeTextGenerationResult,
  NativeTextGenerationService,
  NativeWorkspaceImportService,
  NativeWorkspacePersistenceService,
} from "@shared/macArtifacts";

declare global {
  interface Window {
    ideaTilesMac?: {
      capabilities?: unknown;
      artifactStudioServices?: ArtifactStudioServices;
      workspacePersistence?: NativeWorkspacePersistenceService;
      workspaceImports?: NativeWorkspaceImportService;
      fileExports?: NativeFileSaveService;
      settings?: NativeMacSettingsService;
      generation?: NativeTextGenerationService;
      generationSettings?: NativeGenerationSettingsService;
      credentials?: NativeCredentialService;
      dreamer?: NativeDreamerAccessService;
      auth?: NativeAuthenticationService;
    };
  }
}

interface GenerationTransportInput extends NativeTextGenerationInput {
  cloudPayload: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type GenerationTransportResult = {
  text: string;
  provider?: NativeTextGenerationResult["provider"];
  model?: string;
  viaNativeMac: boolean;
};

export async function generateTextForCurrentPlatform(
  input: GenerationTransportInput
): Promise<GenerationTransportResult> {
  if (isNativeMac()) {
    const generation = window.ideaTilesMac?.generation;
    if (!generation) throw new Error("Native Mac generation is unavailable.");
    return {
      ...(await generation.generate({
        prompt: input.prompt,
        ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      })),
      viaNativeMac: true,
    };
  }

  // fetchApi, not fetch: CapacitorHttp drops `signal` on cross-origin POSTs,
  // so on iOS a bare fetch here ignores cancellation and hangs for 600s.
  const response = await fetchApi(buildApiUrl("generate"), {
    method: "POST",
    headers: input.headers ?? { "Content-Type": "application/json" },
    body: JSON.stringify(input.cloudPayload),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const result = await response.json();
  const apiError =
    typeof result?.error?.message === "string" ? result.error.message : "";
  if (!response.ok || result?.error) {
    throw new Error(
      apiError ||
        (response.statusText
          ? `HTTP ${response.status}: ${response.statusText}`
          : `HTTP ${response.status}`)
    );
  }
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("API returned no content");
  }
  const providerHeader = Object.entries(input.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "x-provider"
  )?.[1];
  const provider =
    providerHeader === "grok"
      ? "xai"
      : ["gemini", "anthropic", "openai", "mistral", "ollama"].includes(
            providerHeader ?? ""
          )
        ? (providerHeader as NativeTextGenerationResult["provider"])
        : undefined;
  return { text, ...(provider ? { provider } : {}), viaNativeMac: false };
}

export function subscribeToNativeWorkspaceImports(
  listener: (envelope: unknown) => void
): () => void {
  return (
    window.ideaTilesMac?.workspaceImports?.subscribe(listener) ?? (() => {})
  );
}
