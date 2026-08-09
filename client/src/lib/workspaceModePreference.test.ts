import { describe, expect, it } from "vitest";
import {
  initialWorkspaceMode,
  readWorkspaceModePreference,
  shouldOfferWorkspaceChoice,
  writeWorkspaceModePreference,
} from "@/lib/workspaceModePreference";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("workspace mode preference", () => {
  it("offers a first choice only on supported native Mac launches", () => {
    const storage = memoryStorage();
    expect(shouldOfferWorkspaceChoice(true, false, storage)).toBe(true);
    expect(shouldOfferWorkspaceChoice(false, false, storage)).toBe(false);
    expect(shouldOfferWorkspaceChoice(true, true, storage)).toBe(false);
  });

  it("persists Rind as the default for new boards", () => {
    const storage = memoryStorage();
    writeWorkspaceModePreference("sphere", storage);

    expect(readWorkspaceModePreference(storage)).toBe("sphere");
    expect(initialWorkspaceMode(true, storage)).toBe("sphere");
    expect(initialWorkspaceMode(false, storage)).toBe("tiles");
    expect(shouldOfferWorkspaceChoice(true, false, storage)).toBe(false);
  });

  it("ignores invalid stored values", () => {
    const storage = memoryStorage("legacy");
    expect(readWorkspaceModePreference(storage)).toBe(null);
    expect(initialWorkspaceMode(true, storage)).toBe("tiles");
  });
});
