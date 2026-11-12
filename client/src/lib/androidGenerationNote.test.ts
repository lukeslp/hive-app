import { describe, expect, it } from "vitest";
import {
  androidGenerationNote,
  androidLocalModelReady,
  androidServerNotice,
} from "@/lib/androidGenerationNote";

const noGemma = {
  ready: false,
  downloadAvailable: false,
  reason: "Local Gemma delivery is not configured in this build.",
};

describe("androidGenerationNote", () => {
  it("says tiles go to the server when no model is ready", () => {
    const note = androidGenerationNote(
      {
        available: false,
        reason: "Gemini Nano is unavailable on this Android device.",
      },
      noGemma
    );
    expect(note).toContain(
      "Gemini Nano is unavailable on this Android device."
    );
    expect(note).toContain("go to the Idea Tiles server at ideatiles.app");
    expect(note).toContain("Artifact Studio always uses the server.");
    // This build cannot install Gemma, so it must not be offered as a step.
    expect(note).not.toContain("Gemma");
    expect(note).not.toMatch(/only for the cloud fallback/);
  });

  it("names Gemma as a step only when this build can install it", () => {
    const ready = { available: true };
    expect(androidGenerationNote(ready, noGemma)).not.toContain("Gemma");
    expect(
      androidGenerationNote(ready, { ready: false, downloadAvailable: true })
    ).toContain("verified Gemma model");
  });

  it("says Artifact Studio uses the server even with a model ready", () => {
    expect(androidGenerationNote({ available: true }, noGemma)).toContain(
      "Artifact Studio always uses the server."
    );
    expect(
      androidGenerationNote(
        { available: false },
        { ready: true, downloadAvailable: true }
      )
    ).toContain("Artifact Studio always uses the server.");
  });
});

describe("androidServerNotice", () => {
  it("is shown only when the request will leave the phone", () => {
    expect(androidServerNotice({ available: false }, noGemma)).toContain(
      "sent to the Idea Tiles server"
    );
    expect(androidServerNotice(null, null)).toContain("Idea Tiles server");
    expect(androidServerNotice({ available: true }, noGemma)).toBeUndefined();
    expect(androidLocalModelReady(null, { ready: true })).toBe(true);
  });
});
