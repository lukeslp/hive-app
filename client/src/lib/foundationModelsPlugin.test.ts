/**
 * File Purpose: Verify Android prompt construction and ordered local dispatch.
 * Primary Components: Gemma prompt building and AICore-to-Gemma routing tests.
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

vi.mock("./gemmaPlugin", () => ({
  Gemma: {
    isModelReady: vi.fn(),
    generate: vi.fn(),
  },
}));

import { buildGemmaPrompt, tryOnDeviceFirst } from "./foundationModelsPlugin";
import { AICore } from "./aicorePlugin";
import { Gemma } from "./gemmaPlugin";

describe("buildGemmaPrompt", () => {
  it("keeps system instructions distinct from the user request", () => {
    expect(
      buildGemmaPrompt({
        prompt: "  Generate six ideas. ",
        systemPrompt: " Return JSON only. ",
        temperature: 0.7,
        maxTokens: 512,
      })
    ).toBe("Instructions:\nReturn JSON only.\n\nRequest:\nGenerate six ideas.");
  });

  it("uses the trimmed user prompt when no system prompt exists", () => {
    expect(
      buildGemmaPrompt({
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

  it("uses AICore before Gemma when Gemini Nano is available", async () => {
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
    expect(Gemma.isModelReady).not.toHaveBeenCalled();
  });

  it("uses verified Gemma only after AICore is unavailable", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "unavailable",
      available: false,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });
    vi.mocked(Gemma.isModelReady).mockResolvedValue({
      ready: true,
      verified: true,
      model: "gemma-3n-e2b-it-int4",
      downloadAvailable: false,
      cloudFallback: false,
    });
    vi.mocked(Gemma.generate).mockResolvedValue({ text: "Gemma result" });

    await expect(tryOnDeviceFirst(options)).resolves.toEqual({
      text: "Gemma result",
    });
    expect(Gemma.isModelReady).toHaveBeenCalledOnce();
    expect(Gemma.generate).toHaveBeenCalledOnce();
  });

  it("falls back to verified Gemma when AICore generation fails", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "available",
      available: true,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });
    vi.mocked(AICore.generate).mockRejectedValue(new Error("AICore failed"));
    vi.mocked(Gemma.isModelReady).mockResolvedValue({
      ready: true,
      verified: true,
      model: "gemma-3n-e2b-it-int4",
      downloadAvailable: false,
      cloudFallback: false,
    });
    vi.mocked(Gemma.generate).mockResolvedValue({ text: "Gemma fallback" });

    await expect(tryOnDeviceFirst(options)).resolves.toEqual({
      text: "Gemma fallback",
    });
    expect(AICore.generate).toHaveBeenCalledOnce();
    expect(Gemma.generate).toHaveBeenCalledOnce();
  });

  it("returns null when neither Android local runtime is usable", async () => {
    vi.mocked(AICore.getStatus).mockResolvedValue({
      state: "unavailable",
      available: false,
      downloadable: false,
      downloading: false,
      model: "Gemini Nano via Android AICore",
    });
    vi.mocked(Gemma.isModelReady).mockResolvedValue({
      ready: true,
      verified: false,
      model: "gemma-3n-e2b-it-int4",
      downloadAvailable: false,
      cloudFallback: true,
    });

    await expect(tryOnDeviceFirst(options)).resolves.toBeNull();
    expect(AICore.generate).not.toHaveBeenCalled();
    expect(Gemma.generate).not.toHaveBeenCalled();
  });
});
