const STABLE_BOARD_ID = /^[A-Za-z0-9][A-Za-z0-9._:,-]{0,127}$/;

function storedBoardId(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "boardId" in value &&
    typeof value.boardId === "string" &&
    STABLE_BOARD_ID.test(value.boardId)
  ) {
    return value.boardId;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === "app.ideatiles.workspace-envelope" &&
    "workspace" in value &&
    typeof value.workspace === "object" &&
    value.workspace !== null &&
    "id" in value.workspace &&
    typeof value.workspace.id === "string" &&
    STABLE_BOARD_ID.test(value.workspace.id)
  ) {
    return value.workspace.id;
  }
  return null;
}

export function createLocalBoardId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `board:local:${crypto.randomUUID()}`;
  }
  return `board:local:${Date.now()}`;
}

export function readAutosaveBoardId(
  serializedAutosave: string | null,
  create: () => string = createLocalBoardId
): string {
  if (serializedAutosave) {
    try {
      const parsed: unknown = JSON.parse(serializedAutosave);
      const existing = storedBoardId(parsed);
      if (existing) return existing;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "timestamp" in parsed &&
        typeof parsed.timestamp === "number" &&
        Number.isSafeInteger(parsed.timestamp) &&
        parsed.timestamp >= 0
      ) {
        return `board:autosave:${parsed.timestamp}`;
      }
    } catch {
      // Fall through to a fresh local identity.
    }
  }
  return create();
}

export function boardIdForLocalSession(
  sessionId: string,
  sessionData: unknown
): string {
  const existing = storedBoardId(sessionData);
  if (existing) return existing;

  const fallback = `board:session:${sessionId}`;
  return STABLE_BOARD_ID.test(fallback)
    ? fallback
    : `board:session:${encodeURIComponent(sessionId).replaceAll("%", "-")}`;
}
