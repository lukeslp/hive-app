import { describe, expect, it } from "vitest";
import {
  androidGenerationNote,
  androidLocalModelReady,
  androidServerNotice,
} from "@/lib/androidGenerationNote";

describe("androidGenerationNote", () => {
  it("says tiles go to the server when no model is ready", () => {
    const note = androidGenerationNote({
      available: false,
      reason: "Gemini Nano is unavailable on this Android device.",
    });
    expect(note).toContain(
      "Gemini Nano is unavailable on this Android device."
    );
    expect(note).toContain("go to the Idea Tiles server at ideatiles.app");
    expect(note).toContain("Artifact Studio always uses the server.");
    expect(note).not.toMatch(/only for the cloud fallback/);
  });

  it("never offers Gemma: no build ships a runtime for it", () => {
    expect(androidGenerationNote({ available: true })).not.toContain("Gemma");
    expect(androidGenerationNote({ available: false })).not.toContain("Gemma");
    expect(androidGenerationNote(null)).not.toContain("Gemma");
  });

  it("says Artifact Studio uses the server even with a model ready", () => {
    const note = androidGenerationNote({ available: true });
    expect(note).toContain("tiles are written on this device");
    expect(note).toContain("Artifact Studio always uses the server.");
  });
});

describe("androidServerNotice", () => {
  it("is shown only when the request will leave the device", () => {
    expect(androidServerNotice({ available: false })).toContain(
      "sent to the Idea Tiles server"
    );
    expect(androidServerNotice(null)).toContain("Idea Tiles server");
    expect(androidServerNotice({ available: true })).toBeUndefined();
    expect(androidLocalModelReady({ available: true })).toBe(true);
    expect(androidLocalModelReady(null)).toBe(false);
  });
});
