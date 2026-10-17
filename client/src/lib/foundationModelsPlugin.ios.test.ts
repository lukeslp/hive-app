/**
 * File Purpose: Verify the iOS failure message after on-device generation.
 * Primary Components: describeIosOnDeviceFailure with the Foundation Models bridge.
 * I/O: Stubs the native bridge's availability and generation results.
 *
 * iOS has no hosted fallback, so this message is the whole story the user
 * gets. An eligible device whose request timed out must not be told that
 * Apple Intelligence "isn't available on this device".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  generate: vi.fn(),
  generateBranches: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => bridge),
}));

vi.mock("./platform", () => ({
  getPlatform: vi.fn(() => "ios"),
}));

vi.mock("./aicorePlugin", () => ({ AICore: {} }));
vi.mock("./gemmaPlugin", () => ({ Gemma: {} }));

import {
  describeIosOnDeviceFailure,
  invalidateFoundationModelsCache,
  tryOnDeviceBranchesFirst,
} from "./foundationModelsPlugin";

const options = {
  prompt: "Generate six ideas.",
  systemPrompt: "Return JSON only.",
  temperature: 0.7,
  maxTokens: 2048,
  silentDiagnostics: true,
};

describe("describeIosOnDeviceFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateFoundationModelsCache();
  });

  it("asks an eligible device to retry after a request times out", async () => {
    bridge.isAvailable.mockResolvedValue({ available: true });
    bridge.generateBranches.mockReturnValue(new Promise(() => {}));

    const fm = await tryOnDeviceBranchesFirst({ ...options, timeoutMs: 5 });

    expect(fm).toBeNull();
    expect(await describeIosOnDeviceFailure(Boolean(fm))).toBe(
      "On-device generation didn't respond — please try again"
    );
  });

  it("asks an eligible device to retry after the framework rejects a request", async () => {
    bridge.isAvailable.mockResolvedValue({ available: true });
    bridge.generateBranches.mockRejectedValue(
      new Error("FoundationModels generation failed: guardrail violation")
    );

    const fm = await tryOnDeviceBranchesFirst(options);

    expect(fm).toBeNull();
    expect(await describeIosOnDeviceFailure(Boolean(fm))).toBe(
      "On-device generation didn't respond — please try again"
    );
  });

  it("reports unavailability when the device cannot run the model", async () => {
    bridge.isAvailable.mockResolvedValue({
      available: false,
      reason: "deviceNotEligible",
      transient: false,
    });

    const fm = await tryOnDeviceBranchesFirst(options);

    expect(fm).toBeNull();
    expect(bridge.generateBranches).not.toHaveBeenCalled();
    expect(await describeIosOnDeviceFailure(Boolean(fm))).toBe(
      "Apple Intelligence isn't available on this device"
    );
  });

  it("reports unusable output when the model answered", async () => {
    expect(await describeIosOnDeviceFailure(true)).toBe(
      "On-device returned unparseable output"
    );
    expect(bridge.isAvailable).not.toHaveBeenCalled();
  });
});
