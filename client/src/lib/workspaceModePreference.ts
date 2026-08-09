import type { WorkspaceMode } from "@shared/workspaceDocument";
import { WORKSPACE_MODE_PREFERENCE_KEY } from "@/lib/hexConstants";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function readWorkspaceModePreference(
  storage: ReadableStorage = localStorage
): WorkspaceMode | null {
  try {
    const value = storage.getItem(WORKSPACE_MODE_PREFERENCE_KEY);
    return value === "tiles" || value === "sphere" ? value : null;
  } catch {
    return null;
  }
}

export function initialWorkspaceMode(
  rindModeAvailable: boolean,
  storage: ReadableStorage = localStorage
): WorkspaceMode {
  const preference = readWorkspaceModePreference(storage);
  return rindModeAvailable && preference === "sphere" ? "sphere" : "tiles";
}

export function shouldOfferWorkspaceChoice(
  rindModeAvailable: boolean,
  isShowcase: boolean,
  storage: ReadableStorage = localStorage
): boolean {
  return (
    rindModeAvailable &&
    !isShowcase &&
    readWorkspaceModePreference(storage) === null
  );
}

export function writeWorkspaceModePreference(
  mode: WorkspaceMode,
  storage: WritableStorage = localStorage
): void {
  try {
    storage.setItem(WORKSPACE_MODE_PREFERENCE_KEY, mode);
  } catch {
    // The active board can still switch modes when storage is unavailable.
  }
}
