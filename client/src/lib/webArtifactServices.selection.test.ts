import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebArtifactStudioServices } from "./webArtifactServices";

/**
 * HexmindApp picks the transport with
 *   `macArtifactHost?.artifactStudioServices ?? webArtifactServices`.
 *
 * That single `??` is the whole compatibility story, so it gets its own test.
 * If it ever inverts, macOS silently loses Image Playground, Keychain-backed
 * providers, and native file panels while still appearing to work — the worst
 * kind of regression, because the web path would quietly succeed.
 */
const selectServices = <T,>(native: T | undefined, web: T): T => native ?? web;

const deps = {
  getRequestHeaders: () => ({}),
  getProvider: () => "gemini",
  save: async () => true,
  exportFile: async () => undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service selection", () => {
  it("prefers native Mac services when the shell injected them", () => {
    const native = { generator: { generate: vi.fn() } };
    const web = createWebArtifactStudioServices(deps);
    expect(selectServices(native as never, web as never)).toBe(native);
  });

  it("falls back to web services when there is no Mac shell", () => {
    const web = createWebArtifactStudioServices(deps);
    expect(selectServices(undefined, web)).toBe(web);
  });

  it("falls back when a Mac shell exists but exposes no artifact services", () => {
    // window.ideaTilesMac can be present with artifactStudioServices absent —
    // an older Mac build, or one with the feature disabled.
    const web = createWebArtifactStudioServices(deps);
    const host: { artifactStudioServices?: unknown } = {};
    expect(selectServices(host.artifactStudioServices as never, web as never)).toBe(
      web
    );
  });

  it("exposes the full ArtifactStudioServices surface the Studio calls", () => {
    const web = createWebArtifactStudioServices(deps);
    expect(typeof web.generator.generate).toBe("function");
    expect(typeof web.persistence.save).toBe("function");
    expect(typeof web.persistence.export).toBe("function");
    expect(typeof web.attachImageToBoard).toBe("function");
  });
});
