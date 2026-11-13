/**
 * File Purpose: Read what the local autosave holds without loading it.
 * Primary Components: readAutosaveInfo.
 * I/O: Reads the autosave entry from localStorage; returns the tile count
 *   and save time, or null when there is no usable autosave.
 */

import { AUTOSAVE_KEY } from "@/lib/hexConstants";
import { parseWorkspaceTransport } from "@shared/workspaceDocument";

export interface AutosaveInfo {
  nodeCount: number;
  timestamp: number | null;
}

export function readAutosaveInfo(
  storage: Pick<Storage, "getItem"> = localStorage
): AutosaveInfo | null {
  try {
    const autosave = storage.getItem(AUTOSAVE_KEY);
    if (!autosave) return null;
    const data = JSON.parse(autosave);
    const envelope = parseWorkspaceTransport(data.workspaceEnvelope ?? data);
    const nodeCount = envelope.workspace.graph.nodes.length;
    if (nodeCount === 0) return null;
    return {
      nodeCount,
      timestamp:
        typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
          ? data.timestamp
          : null,
    };
  } catch {
    return null;
  }
}
