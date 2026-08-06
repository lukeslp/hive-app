/**
 * File Purpose: the non-macOS implementation of ArtifactStudioServices, so
 *   Artifact Studio works on web, iOS, and Android instead of showing
 *   "available in the Idea Tiles Mac app".
 * I/O: generates through the existing LLM proxy, stores in IndexedDB, exports
 *   via download (web) or Filesystem + Share (Capacitor).
 *
 * macOS keeps its native services. HexmindApp prefers `window.ideaTilesMac`
 * and falls back here, so nothing about the Mac path changes.
 *
 * Phase 1 covers the eleven text-shaped recipes — every recipe except
 * `image-playground-artwork`. Those eleven need no key and no new endpoint,
 * because `generateTextForCurrentPlatform` already works on every platform.
 * Image generation needs a server-side proxy to the dreamer gateway
 * (`POST /v1/llm/images/generate`) and is deliberately left failing loudly
 * rather than silently producing an empty artifact.
 */
import {
  artifactImageAttachmentSchema,
  type ArtifactGenerationRequest,
  type ArtifactManifest,
  type ArtifactImageAttachment,
  type ArtifactKind,
  type ArtifactStudioServices,
} from "@shared/macArtifacts";

import {
  artifactFileTarget,
  buildArtifactFile,
  buildArtifactManifest,
} from "./artifactManifest";
import { putArtifact } from "./artifactStore";
import { getArtifactRecipe } from "./artifactRecipes";
import { generateTextForCurrentPlatform } from "./macGeneration";
import { exportArtifactFile } from "./artifactExport";

export interface WebArtifactServiceDeps {
  /** From useProviderSettings; supplies X-Provider and any BYO key header. */
  getRequestHeaders: () => Record<string, string>;
  /** Current provider id, for provenance. */
  getProvider: () => string;
  /** Injected so tests can substitute a store. */
  save?: (manifest: ArtifactManifest) => Promise<boolean>;
  exportFile?: typeof exportArtifactFile;
}

const SYSTEM_PROMPT =
  "You produce a single finished artifact from a brainstorming board. " +
  "Return only the artifact content, with no preamble, no explanation, and no " +
  "commentary about what you produced.";

/** Instruction appended per kind so the model returns raw content. */
function formatInstruction(kind: ArtifactKind): string {
  switch (kind) {
    case "markdown":
    case "codeBundle":
      return "Return Markdown.";
    case "mermaid":
      return "Return only Mermaid diagram source. Do not wrap it in a code fence.";
    case "svg":
      return "Return only a complete standalone <svg> document. Do not wrap it in a code fence.";
    case "staticWeb":
      return "Return only a complete standalone HTML document beginning with <!doctype html>. Inline all CSS and JS. Do not wrap it in a code fence.";
    case "image":
      return "";
  }
}

/**
 * Models wrap structured output in code fences regardless of instructions.
 * Markdown keeps its fences (they are legitimate content there); every other
 * kind is a raw document where a stray fence breaks rendering — an SVG that
 * starts with ``` does not display, and previewFile would hand the iframe
 * invalid HTML.
 */
export function stripCodeFence(text: string, kind: ArtifactKind): string {
  if (kind === "markdown" || kind === "codeBundle") return text.trim();
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

/** Prefer the document's own title; fall back to the recipe label. */
export function deriveTitle(content: string, fallback: string): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(content)?.[1]?.trim();
  const htmlTitle = /<title>([^<]{1,120})<\/title>/i.exec(content)?.[1]?.trim();
  const candidate = heading || htmlTitle || "";
  return (candidate || fallback).slice(0, 256);
}

function generatorKindFor(
  provider: string
): "onDevice" | "directProvider" | "dreamer" {
  if (provider === "apple") return "onDevice";
  if (provider === "dreamer") return "dreamer";
  return "directProvider";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

export function createWebArtifactStudioServices(
  deps: WebArtifactServiceDeps
): ArtifactStudioServices {
  const save = deps.save ?? putArtifact;
  const exportFile = deps.exportFile ?? exportArtifactFile;

  return {
    generator: {
      async generate(
        request: ArtifactGenerationRequest,
        { signal, onProgress }
      ): Promise<ArtifactManifest> {
        const recipe = getArtifactRecipe(request.recipeId);
        if (!recipe) {
          throw new Error(`Unknown artifact recipe: ${request.recipeId}`);
        }
        if (recipe.kind === "image") {
          throw new Error(
            "Image artifacts need the Idea Tiles Mac app for now. Every other artifact type works here."
          );
        }

        throwIfAborted(signal);
        onProgress({
          requestId: request.requestId,
          phase: "preparing",
          completed: 0.05,
          message: "Preparing board context",
        });

        const prompt = [
          recipe.instructions,
          formatInstruction(recipe.kind),
          request.instructions ? `Additional direction: ${request.instructions}` : "",
          "",
          "Board context:",
          request.context,
        ]
          .filter(Boolean)
          .join("\n");

        onProgress({
          requestId: request.requestId,
          phase: "generating",
          completed: 0.2,
          message: `Generating ${recipe.label.toLowerCase()}`,
        });

        const generation = await generateTextForCurrentPlatform({
          prompt,
          systemPrompt: SYSTEM_PROMPT,
          cloudPayload: {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          },
          headers: deps.getRequestHeaders(),
          signal,
        });

        throwIfAborted(signal);
        onProgress({
          requestId: request.requestId,
          phase: "packaging",
          completed: 0.8,
          message: "Packaging artifact",
        });

        const content = stripCodeFence(generation.text, recipe.kind);
        if (!content) throw new Error("The model returned an empty artifact.");

        const target = artifactFileTarget(recipe.kind);
        const timestamp = new Date().toISOString();
        const manifest = await buildArtifactManifest({
          title: deriveTitle(content, recipe.label),
          kind: recipe.kind,
          recipeId: recipe.id,
          scope: request.scope,
          files: [
            await buildArtifactFile({
              ...target,
              content,
              encoding: "utf8",
              timestamp,
            }),
          ],
          provenance: {
            sourceBoardId: request.sourceBoardId,
            sourceNodeIds: request.sourceNodeIds,
            recipeId: request.recipeId,
            generator: {
              kind: generatorKindFor(generation.provider ?? deps.getProvider()),
              name: generation.provider ?? deps.getProvider() ?? "unknown",
              ...(generation.model ? { model: generation.model } : {}),
            },
          },
          timestamp,
        });

        throwIfAborted(signal);
        onProgress({
          requestId: request.requestId,
          phase: "complete",
          completed: 1,
          message: "Artifact ready",
        });
        return manifest;
      },
    },

    persistence: {
      async save(manifest: ArtifactManifest): Promise<ArtifactManifest> {
        await save(manifest);
        return manifest;
      },
      async export(manifest: ArtifactManifest): Promise<void> {
        const file = manifest.files.find(
          candidate => typeof candidate.content === "string"
        );
        if (!file?.content) {
          throw new Error("This artifact has no exportable file content.");
        }
        await exportFile({
          fileName: file.path.split("/").pop() || "artifact",
          mimeType: file.mimeType,
          content: file.content,
          encoding: file.encoding === "base64" ? "base64" : "utf8",
          title: manifest.title,
        });
      },
    },

    async attachImageToBoard(
      manifest: ArtifactManifest,
      targetNodeId: string
    ): Promise<ArtifactImageAttachment> {
      // The schema pins mimeType to the literal "image/png" and the dataURL to
      // a matching prefix, so only PNG can be attached — not "any image/*".
      const file = manifest.files.find(
        candidate =>
          candidate.mimeType === "image/png" &&
          candidate.encoding === "base64" &&
          typeof candidate.content === "string"
      );
      if (!file?.content) {
        throw new Error("This artifact has no PNG image to attach.");
      }
      // The Mac bridge validator pins this exact shape. Board payloads are
      // cross-platform, so a web attachment must be byte-compatible with a Mac
      // one; parsing here fails loudly rather than at the bridge.
      return artifactImageAttachmentSchema.parse({
        artifactId: manifest.id,
        targetNodeId,
        fileId: file.id,
        mimeType: "image/png",
        dataURL: `data:image/png;base64,${file.content}`,
        checksum: file.checksum,
      });
    },
  };
}
