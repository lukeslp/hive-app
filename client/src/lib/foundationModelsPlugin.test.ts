/**
 * File Purpose: Verify Android prompt construction and ordered local dispatch.
 * Primary Components: Android prompt building and AICore routing tests.
 * I/O: Supplies generation options and asserts native bridge invocation order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({})),
}));

vi.mock("./platform", () => ({
  getPlatform: vi.fn(() => "android"),
}));

vi.mock("./aicorePlugin", () => ({
  AICore: {
    getStatus: vi.fn(),
    generate: vi.fn(),
    cancel: vi.fn(),
  },
}));

import { buildAndroidPrompt, tryOnDeviceFirst } from "./foundationModelsPlugin";
import { AICore } from "./aicorePlugin";

describe("buildAndroidPrompt", () => {
  it("keeps system instructions distinct from the user request", () => {
    expect(
      buildAndroidPrompt({
        prompt: "  Generate six ideas. ",
        systemPrompt: " Return JSON only. ",
        temperature: 0.7,
        maxTokens: 512,
      })
    ).toBe("Instructions:\nReturn JSON only.\n\nRequest:\nGenerate six ideas.");
  });

  it("uses the trimmed user prompt when no system prompt exists", () => {
    expect(
      buildAndroidPrompt({
        prompt: "  Summarize this tile.  ",
        temperature: 0.7,
        maxTokens: 256,
      })
    ).toBe("Summarize this tile.");
  });
});

describe("Android local generation dispatch", () => {
  const options = {
    prompt: "Generate six ideas.",
    systemPrompt: "Return JSON only.",
    temperature: 0.7,
    maxTokens: 512,
    silentDiagnostics: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses AICore when Gemini Nano is available", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "available",
      available: true,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });
    vi.mocked(AICore.generate).mockResolvedValue({
      text: "AICore result",
      requestId: "test",
    });

    await expect(tryOnDeviceFirst(options)).resolves.toEqual({
      text: "AICore result",
    });
    expect(AICore.generate).toHaveBeenCalledOnce();
  });

  it("returns null when AICore is unavailable, so the caller uses the server", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "unavailable",
      available: false,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });

    await expect(tryOnDeviceFirst(options)).resolves.toBeNull();
    expect(AICore.generate).not.toHaveBeenCalled();
  });

  it("returns null when AICore generation fails", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "available",
      available: true,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });
    vi.mocked(AICore.generate).mockRejectedValue(new Error("busy"));

    await expect(tryOnDeviceFirst(options)).resolves.toBeNull();
  });
});
