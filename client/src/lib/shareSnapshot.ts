import type { ArtifactKind } from "@shared/macArtifacts";

export type ShareArtifactSummary = {
  id: string;
  title: string;
  kind: ArtifactKind;
};

/**
 * Shares are canvas-only unless the caller passes an explicit artifact
 * selection. Payload files are never included in a public snapshot.
 */
export function buildShareSnapshot<Canvas extends object>(
  canvas: Canvas,
  selectedArtifacts: ShareArtifactSummary[]
): Canvas & { artifacts?: ShareArtifactSummary[] } {
  if (selectedArtifacts.length === 0) return canvas;
  return { ...canvas, artifacts: selectedArtifacts.map(item => ({ ...item })) };
}
