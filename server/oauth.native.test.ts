import { describe, expect, it } from "vitest";
import { buildNativeOAuthStartURL } from "./_core/oauth";

describe("native Mac OAuth start", () => {
  it("builds a hosted callback URL without exposing session material", () => {
    const url = new URL(
      buildNativeOAuthStartURL("https://accounts.example", "idea-tiles")
    );
    expect(url.origin).toBe("https://accounts.example");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("appId")).toBe("idea-tiles");
    expect(url.searchParams.get("redirectUri")).toBe(
      "https://ideatiles.app/api/oauth/callback"
    );
    expect(url.searchParams.has("token")).toBe(false);
  });

  it("rejects non-HTTPS or decorated portal origins", () => {
    for (const portal of [
      "http://accounts.example",
      "https://user:pass@accounts.example",
      "https://accounts.example?next=evil",
      "https://accounts.example/unexpected/path",
    ]) {
      expect(() => buildNativeOAuthStartURL(portal, "idea-tiles")).toThrow();
    }
  });
});
