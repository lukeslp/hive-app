// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openNativeMacGenerationSettings } from "@/components/SettingsModal";

afterEach(() => {
  delete window.ideaTilesMac;
});

describe("native Mac generation settings", () => {
  it("opens the native provider settings service", async () => {
    const open = vi.fn(async () => ({ opened: true as const }));
    window.ideaTilesMac = {
      capabilities: { nativeMac: true },
      settings: { open },
    };

    await expect(openNativeMacGenerationSettings()).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
