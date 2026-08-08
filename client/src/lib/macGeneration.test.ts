// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTextForCurrentPlatform,
  subscribeToNativeWorkspaceImports,
} from "@/lib/macGeneration";

afterEach(() => {
  delete window.ideaTilesMac;
  vi.unstubAllGlobals();
});

describe("native Mac generation transport", () => {
  it("uses the selected native provider and never contacts the hosted proxy", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const generate = vi.fn(async () => ({
      text: '{"branches":[]}',
      provider: "apple" as const,
      model: "system-language-model",
    }));
    window.ideaTilesMac = {
      capabilities: { nativeMac: true },
      generation: { generate },
    };

    await expect(
      generateTextForCurrentPlatform({
        prompt: "Generate branches",
        systemPrompt: "Return JSON only",
        cloudPayload: { contents: [] },
      })
    ).resolves.toEqual({
      text: '{"branches":[]}',
      viaNativeMac: true,
      provider: "apple",
      model: "system-language-model",
    });
    expect(generate).toHaveBeenCalledWith({
      prompt: "Generate branches",
      systemPrompt: "Return JSON only",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a native failure without silently falling through to hosted generation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    window.ideaTilesMac = {
      capabilities: { nativeMac: true },
      generation: {
        generate: vi.fn(async () => {
          throw new Error("Model unavailable");
        }),
      },
    };

    await expect(
      generateTextForCurrentPlatform({
        prompt: "Generate branches",
        cloudPayload: { contents: [] },
      })
    ).rejects.toThrow("Model unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("attributes a hosted result only when the selected provider is explicit", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "result" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      generateTextForCurrentPlatform({
        prompt: "Generate",
        cloudPayload: {},
        headers: { "Content-Type": "application/json", "X-Provider": "grok" },
      })
    ).resolves.toEqual({ text: "result", provider: "xai", viaNativeMac: false });
  });

  it("rejects hosted generation on iOS before any request can leave the device", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: {
        isNativePlatform: () => true,
        getPlatform: () => "ios",
      },
    });

    await expect(
      generateTextForCurrentPlatform({
        prompt: "Generate an artifact from private board context",
        cloudPayload: { contents: [] },
      })
    ).rejects.toThrow("Hosted generation is disabled on iOS");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("native workspace import handoff", () => {
  it("subscribes the active canvas and removes the listener on cleanup", () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((listener: (envelope: unknown) => void) => {
      listener({ format: "app.ideatiles.workspace-envelope" });
      return unsubscribe;
    });
    window.ideaTilesMac = {
      capabilities: { nativeMac: true },
      workspaceImports: { subscribe },
    };
    const listener = vi.fn();

    const cleanup = subscribeToNativeWorkspaceImports(listener);

    expect(listener).toHaveBeenCalledWith({
      format: "app.ideatiles.workspace-envelope",
    });
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
