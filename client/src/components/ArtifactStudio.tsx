import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { StaticArtifactPreview } from "@/components/StaticArtifactPreview";
import { extractArtifactContext } from "@/lib/artifactContext";
import type { ArtifactContextSourceNode } from "@/lib/artifactContext";
import {
  ARTIFACT_RECIPE_GROUPS,
  ARTIFACT_RECIPES,
  getArtifactRecipe,
  suggestArtifactRecipes,
} from "@/lib/artifactRecipes";
import type {
  ArtifactGenerationProgress,
  ArtifactImageAttachment,
  ArtifactManifest,
  ArtifactScope,
  ArtifactStudioServices,
} from "@shared/macArtifacts";

type StudioStage =
  | "configure"
  | "confirm"
  | "generating"
  | "result"
  | "cancelled"
  | "error";

export interface ArtifactStudioProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  nodes: Record<string, ArtifactContextSourceNode>;
  selectedNodeIds?: string[];
  branchRootNodeId?: string | null;
  services?: ArtifactStudioServices;
  onAttachImage?: (attachment: ArtifactImageAttachment) => Promise<void> | void;
  cloudSync?: (
    artifact: ArtifactManifest,
    imageFileIds: string[]
  ) => Promise<void>;
  onCloudSignIn?: () => Promise<void>;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `generation:${crypto.randomUUID()}`;
  }
  return `generation:${Date.now()}`;
}

function previewFile(artifact: ArtifactManifest) {
  if (artifact.kind === "staticWeb") {
    const contentFiles = artifact.files.filter(
      file => typeof file.content === "string"
    );
    return (
      contentFiles.find(file => /(^|\/)index\.html?$/i.test(file.path)) ??
      contentFiles.find(
        file =>
          file.mimeType.toLowerCase().split(";", 1)[0] === "text/html" ||
          /\.html?$/i.test(file.path)
      )
    );
  }
  return artifact.files.find(file => typeof file.content === "string");
}

function ArtifactResultPreview({ artifact }: { artifact: ArtifactManifest }) {
  const file = previewFile(artifact);
  if (!file?.content) {
    return (
      <p className="text-sm text-muted-foreground">
        Preview unavailable for this artifact payload.
      </p>
    );
  }

  if (artifact.kind === "staticWeb") {
    return (
      <StaticArtifactPreview
        title={`${artifact.title} preview`}
        html={file.content}
      />
    );
  }

  if (artifact.kind === "image" && /^(?:data:|blob:)/.test(file.content)) {
    return (
      <img
        src={file.content}
        alt={artifact.title}
        className="max-h-80 w-full rounded-lg object-contain"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-xs text-foreground">
      {file.content}
    </pre>
  );
}

export function ArtifactStudio({
  isOpen,
  onClose,
  boardId,
  nodes,
  selectedNodeIds = [],
  branchRootNodeId,
  services,
  onAttachImage,
  cloudSync,
  onCloudSignIn,
}: ArtifactStudioProps) {
  const [scopeKind, setScopeKind] = useState<ArtifactScope["kind"]>("board");
  const [recipeId, setRecipeId] = useState("brief");
  const [instructions, setInstructions] = useState("");
  const [stage, setStage] = useState<StudioStage>("configure");
  const [progress, setProgress] = useState<ArtifactGenerationProgress | null>(
    null
  );
  const [artifact, setArtifact] = useState<ArtifactManifest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudImageFileIds, setCloudImageFileIds] = useState<Set<string>>(
    () => new Set()
  );
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStage("configure");
    setProgress(null);
    setArtifact(null);
    setMessage(null);
    setCloudImageFileIds(new Set());
  }, [isOpen]);

  const scope = useMemo<ArtifactScope>(() => {
    if (scopeKind === "branch" && branchRootNodeId) {
      return { kind: "branch", rootNodeId: branchRootNodeId };
    }
    if (scopeKind === "selection" && selectedNodeIds.length > 0) {
      return { kind: "selection", nodeIds: selectedNodeIds };
    }
    return { kind: "board" };
  }, [branchRootNodeId, scopeKind, selectedNodeIds]);

  const context = useMemo(
    () => extractArtifactContext(nodes, scope),
    [nodes, scope]
  );
  const suggestions = useMemo(() => suggestArtifactRecipes(context), [context]);
  const recipe = getArtifactRecipe(recipeId) ?? ARTIFACT_RECIPES[0];

  const closeStudio = () => {
    const controller = abortController.current;
    controller?.abort();
    if (abortController.current === controller) abortController.current = null;
    onClose();
  };

  const beginGeneration = async () => {
    if (!services) {
      setMessage("Artifact generation is available in the Idea Tiles Mac app.");
      setStage("error");
      return;
    }

    const requestId = createRequestId();
    const controller = new AbortController();
    abortController.current = controller;
    setStage("generating");
    setMessage(null);
    setProgress({
      requestId,
      phase: "preparing",
      completed: 0,
      message: "Preparing board context",
    });
    const handleProgress = (next: ArtifactGenerationProgress) => {
      if (
        abortController.current !== controller ||
        controller.signal.aborted ||
        next.requestId !== requestId
      ) {
        return;
      }
      setProgress(next);
    };

    try {
      const result = await services.generator.generate(
        {
          requestId,
          sourceBoardId: boardId,
          sourceNodeIds: context.includedNodeIds,
          includedNodeCount: context.includedNodeCount,
          originalNodeCount: context.originalNodeCount,
          contextTruncated: context.truncated,
          recipeId: recipe.id,
          scope,
          context: context.text,
          instructions: instructions.trim() || undefined,
        },
        { signal: controller.signal, onProgress: handleProgress }
      );
      if (controller.signal.aborted || abortController.current !== controller) {
        return;
      }
      setArtifact(result);
      setCloudImageFileIds(new Set());
      setProgress(null);
      setStage("result");
    } catch (error) {
      if (abortController.current !== controller) return;
      if (controller.signal.aborted) {
        setMessage("Generation cancelled. Nothing was saved.");
        setStage("cancelled");
      } else {
        setMessage(
          error instanceof Error ? error.message : "Artifact generation failed."
        );
        setStage("error");
      }
    } finally {
      if (abortController.current === controller) {
        abortController.current = null;
      }
    }
  };

  const runAction = async (action: "save" | "export" | "attachImage") => {
    if (!artifact || !services) return;
    setMessage(null);
    try {
      if (action === "save") {
        const saved = await services.persistence.save(artifact);
        setArtifact(saved);
        if (cloudSync) {
          const imageFileIds = saved.files
            .filter(
              file =>
                file.mimeType.startsWith("image/") &&
                cloudImageFileIds.has(file.id)
            )
            .map(file => file.id);
          const artifactForSync: ArtifactManifest = {
            ...saved,
            files: saved.files.map(file => {
              if (
                file.mimeType.startsWith("image/") &&
                !cloudImageFileIds.has(file.id)
              ) {
                const { content: _content, ...metadata } = file;
                return metadata;
              }
              return file;
            }),
            sync: {
              status: "pending",
              includeImages: imageFileIds.length > 0,
              updatedAt: new Date().toISOString(),
            },
          };
          try {
            await cloudSync(artifactForSync, imageFileIds);
            setMessage("Artifact saved locally and synced.");
          } catch (error) {
            setMessage(
              `Artifact saved locally. Cloud sync failed: ${
                error instanceof Error ? error.message : "unknown error"
              }`
            );
          }
        } else {
          setMessage("Artifact saved.");
        }
      } else if (action === "export") {
        await services.persistence.export(artifact);
        setMessage("Export started.");
      } else {
        const targetNodeId =
          selectedNodeIds[0] ?? artifact.provenance.sourceNodeIds[0];
        if (!targetNodeId || !nodes[targetNodeId] || !onAttachImage) {
          throw new Error("Select a source tile before attaching the image.");
        }
        const attachment = await services.attachImageToBoard(
          artifact,
          targetNodeId
        );
        await onAttachImage(attachment);
        setMessage("Image attached to tile.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    }
  };

  const cancelGeneration = () => {
    abortController.current?.abort();
    abortController.current = null;
    setMessage("Generation cancelled. Nothing was saved.");
    setStage("cancelled");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeStudio}
      title="Artifact Studio"
      description="Turn board context into a reviewable artifact. Generation begins only after confirmation."
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5 p-1">
        {stage === "configure" && (
          <>
            <section className="space-y-2">
              <label htmlFor="artifact-scope" className="text-sm font-medium">
                Context scope
              </label>
              <select
                id="artifact-scope"
                value={scopeKind}
                onChange={event => {
                  setScopeKind(event.target.value as ArtifactScope["kind"]);
                  setMessage(null);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="board">Whole board</option>
                <option value="branch" disabled={!branchRootNodeId}>
                  Current branch
                </option>
                <option
                  value="selection"
                  disabled={selectedNodeIds.length === 0}
                >
                  Explicit selection ({selectedNodeIds.length})
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                {context.truncated
                  ? `${context.includedNodeCount} of ${context.originalNodeCount} tile${context.originalNodeCount === 1 ? "" : "s"} included within the context limit.`
                  : `${context.originalNodeCount} tile${context.originalNodeCount === 1 ? "" : "s"} included.`}
              </p>
            </section>

            {suggestions.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  Suggested for this context
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion.recipe.id}
                      type="button"
                      onClick={() => setRecipeId(suggestion.recipe.id)}
                      className="rounded-lg border border-border p-3 text-left hover:bg-accent"
                    >
                      <span className="block text-sm font-medium">
                        {suggestion.recipe.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {suggestion.reason}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              {ARTIFACT_RECIPE_GROUPS.map(group => (
                <div key={group.id}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.recipes.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={recipe.id === item.id}
                        onClick={() => setRecipeId(item.id)}
                        className={`rounded-lg border p-3 text-left ${
                          recipe.id === item.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        <span className="block text-sm font-medium">
                          {item.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <label
                htmlFor="artifact-instructions"
                className="text-sm font-medium"
              >
                Additional instructions (optional)
              </label>
              <textarea
                id="artifact-instructions"
                value={instructions}
                onChange={event => setInstructions(event.target.value)}
                maxLength={8_000}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </section>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeStudio}>
                Cancel
              </Button>
              <Button
                onClick={() => setStage("confirm")}
                disabled={context.originalNodeCount === 0}
              >
                Review generation
              </Button>
            </div>
          </>
        )}

        {stage === "confirm" && (
          <section className="space-y-4">
            <div>
              <h3 className="font-semibold">Confirm generation</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate {recipe.label} from {context.includedNodeCount} tile
                {context.includedNodeCount === 1 ? "" : "s"} in the {scope.kind}{" "}
                scope? Review the result before saving or exporting it.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStage("configure")}>
                Back
              </Button>
              <Button onClick={() => void beginGeneration()}>
                Generate artifact
              </Button>
            </div>
          </section>
        )}

        {stage === "generating" && progress && (
          <section className="space-y-4" aria-live="polite">
            <div>
              <h3 className="font-semibold">Generating {recipe.label}</h3>
              <p className="text-sm text-muted-foreground">
                {progress.message ?? progress.phase}
              </p>
            </div>
            <progress
              value={progress.completed}
              max={1}
              className="h-2 w-full"
              aria-label="Artifact generation progress"
            />
            <Button variant="outline" onClick={cancelGeneration}>
              Cancel generation
            </Button>
          </section>
        )}

        {(stage === "error" || stage === "cancelled") && (
          <section className="space-y-4" role="status">
            <h3 className="font-semibold">
              {stage === "cancelled"
                ? "Generation cancelled"
                : "Unable to generate"}
            </h3>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" onClick={() => setStage("configure")}>
              Back to setup
            </Button>
          </section>
        )}

        {stage === "result" && artifact && (
          <section className="space-y-4">
            <div>
              <h3 className="font-semibold">{artifact.title}</h3>
              <p className="text-xs text-muted-foreground">
                {artifact.kind} · {artifact.files.length} file
                {artifact.files.length === 1 ? "" : "s"}
              </p>
            </div>
            <ArtifactResultPreview artifact={artifact} />
            {cloudSync &&
              artifact.files.some(file =>
                file.mimeType.startsWith("image/")
              ) && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {artifact.files
                    .filter(file => file.mimeType.startsWith("image/"))
                    .map(file => (
                      <label
                        key={file.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          aria-label="Sync image to cloud"
                          checked={cloudImageFileIds.has(file.id)}
                          onChange={event => {
                            setCloudImageFileIds(current => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(file.id);
                              else next.delete(file.id);
                              return next;
                            });
                          }}
                        />
                        <span>
                          Sync {file.path} to cloud
                          <span className="block text-xs text-muted-foreground">
                            Image files stay only on this Mac unless selected.
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              )}
            {!cloudSync && onCloudSignIn && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <p className="text-sm text-muted-foreground">
                  Sign in to sync text artifacts. Images remain local unless
                  selected individually.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMessage(null);
                    void onCloudSignIn().catch(error =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Sign-in failed."
                      )
                    );
                  }}
                >
                  Sign in for cloud sync
                </Button>
              </div>
            )}
            {message && (
              <p className="text-sm text-muted-foreground" role="status">
                {message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setStage("configure")}>
                New artifact
              </Button>
              {artifact.kind === "image" && (
                <Button
                  variant="outline"
                  onClick={() => void runAction("attachImage")}
                >
                  Attach image
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void runAction("export")}
              >
                Export
              </Button>
              <Button onClick={() => void runAction("save")}>Save</Button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
