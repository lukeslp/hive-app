export interface RindLabelCandidate {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  facing: number;
  priority: number;
  centerDistance: number;
}

export interface RindLabelLayoutOptions {
  minFacing: number;
  collisionPadding: number;
  maxVisible: number;
}

function overlaps(
  left: RindLabelCandidate,
  right: RindLabelCandidate,
  padding: number
): boolean {
  return !(
    left.right + padding <= right.left ||
    left.left >= right.right + padding ||
    left.bottom + padding <= right.top ||
    left.top >= right.bottom + padding
  );
}

/**
 * Choose a readable subset of camera-facing Rind labels. Selected, hovered,
 * and key-theme cards supply higher priorities; the remaining ties favor the
 * center of the viewport, where a billboard is least distorted by the limb.
 */
export function selectRindLabelIds(
  candidates: RindLabelCandidate[],
  options: RindLabelLayoutOptions
): string[] {
  const accepted: RindLabelCandidate[] = [];
  const ordered = candidates
    .filter(
      candidate =>
        candidate.facing >= options.minFacing &&
        Number.isFinite(candidate.left) &&
        Number.isFinite(candidate.top) &&
        Number.isFinite(candidate.right) &&
        Number.isFinite(candidate.bottom)
    )
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.centerDistance - right.centerDistance ||
        right.facing - left.facing ||
        left.id.localeCompare(right.id)
    );

  for (const candidate of ordered) {
    if (accepted.length >= options.maxVisible) break;
    if (
      accepted.some(existing =>
        overlaps(candidate, existing, options.collisionPadding)
      )
    ) {
      continue;
    }
    accepted.push(candidate);
  }

  return accepted.map(candidate => candidate.id);
}
