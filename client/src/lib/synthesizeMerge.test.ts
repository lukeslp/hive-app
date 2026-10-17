/**
 * File Purpose: Verify merge synthesis routing and its time budget.
 * Primary Components: synthesizeMerge across web, Android, and iOS shells.
 * I/O: Stubs platform detection, the on-device helper, and global fetch.
 *
 * The Android stub fetch ignores the abort signal on purpose: CapacitorHttp
 * drops `signal` on cross-origin POSTs, so a fetch that honoured it would let
 * these tests pass even if the merge budget stopped holding on device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  getApiBaseUrl: vi.fn(() => "https://ideatiles.app/api"),
  getPlatform: vi.fn(() => "web"),
  isCapacitor: vi.fn(() => false),
  isIos: vi.fn(() => false),
  isNativeMac: vi.fn(() => false),
}));

vi.mock("./foundationModelsPlugin", () => ({
  tryOnDeviceFirst: vi.fn(async () => null),
}));

import { synthesizeMerge } from "./synthesizeMerge";
import { isCapacitor, isIos } from "./platform";
import { tryOnDeviceFirst } from "./foundationModelsPlugin";

const source = { text: "Morning pages", type: "action" };
const target = { text: "Writer's block", type: "risk" };

function useShell(shell: "web" | "android" | "ios") {
  vi.mocked(isCapacitor).mockReturnValue(shell !== "web");
  vi.mocked(isIos).mockReturnValue(shell === "ios");
}

function generationResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tryOnDeviceFirst).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("synthesizeMerge", () => {
  it("stops waiting on Android at the merge budget even when the native layer ignores the signal", async () => {
    vi.useFakeTimers();
    useShell("android");
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);

    const pending = synthesizeMerge(source, target);
    await vi.advanceTimersByTimeAsync(4_001);

    await expect(pending).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]).toEqual([
      "https://ideatiles.app/api/generate",
      expect.objectContaining({ method: "POST" }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no merge timer behind when the hosted request fails", async () => {
    vi.useFakeTimers();
    useShell("android");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => generationResponse("", 500))
    );

    await expect(synthesizeMerge(source, target)).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never sends an iOS merge to the hosted endpoint", async () => {
    useShell("ios");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(synthesizeMerge(source, target)).resolves.toBeNull();
    expect(tryOnDeviceFirst).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the on-device result when the local model answers", async () => {
    useShell("android");
    vi.mocked(tryOnDeviceFirst).mockResolvedValue({
      text: '{"title":"Unblocking ritual","type":"action","description":"A daily page loosens the block."}',
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(synthesizeMerge(source, target)).resolves.toEqual({
      synth: {
        title: "Unblocking ritual",
        type: "action",
        description: "A daily page loosens the block.",
      },
      viaOnDevice: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses a hosted synthesis on the web", async () => {
    useShell("web");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        generationResponse(
          '```json\n{"title":"Unblocking ritual","type":"nonsense","description":"A daily page."}\n```'
        )
      )
    );

    await expect(synthesizeMerge(source, target)).resolves.toEqual({
      synth: {
        title: "Unblocking ritual",
        type: "concept",
        description: "A daily page.",
      },
      viaOnDevice: false,
    });
    expect(tryOnDeviceFirst).not.toHaveBeenCalled();
  });
});
