import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifactManifestSchema } from "@shared/macArtifacts";

const generateTextForCurrentPlatform = vi.fn();
vi.mock("./macGeneration", () => ({
  generateTextForCurrentPlatform: (...args: unknown[]) =>
    generateTextForCurrentPlatform(...args),
}));

import {
  createWebArtifactStudioServices,
  deriveTitle,
  stripCodeFence,
} from "./webArtifactServices";

const deps = () => ({
  getRequestHeaders: () => ({ "Content-Type": "application/json" }),
  getProvider: () => "gemini",
  save: vi.fn(async () => true),
  exportFile: vi.fn(async () => undefined),
});

const request = (recipeId: string) => ({
  requestId: "req.1",
  sourceBoardId: "board.1",
  sourceNodeIds: ["node.1", "node.2"],
  includedNodeCount: 2,
  originalNodeCount: 2,
  contextTruncated: false,
  recipeId,
  scope: { kind: "board" as const },
  context: "Tile one. Tile two.",
});

const run = (services: ReturnType<typeof createWebArtifactStudioServices>, recipeId: string) => {
  const onProgress = vi.fn();
  const controller = new AbortController();
  return {
    onProgress,
    controller,
    promise: services.generator.generate(request(recipeId), {
      signal: controller.signal,
      onProgress,
    }),
  };
};

beforeEach(() => {
  generateTextForCurrentPlatform.mockReset();
});

describe("stripCodeFence", () => {
  it("keeps fences in markdown, where they are real content", () => {
    const md = "# Title\n\n```js\nconst a = 1;\n```";
    expect(stripCodeFence(md, "markdown")).toBe(md);
  });

  it.each([
    ["svg", "```xml\n<svg></svg>\n```", "<svg></svg>"],
    ["mermaid", "```mermaid\ngraph TD;\n```", "graph TD;"],
    ["staticWeb", "```html\n<!doctype html>\n```", "<!doctype html>"],
  ])("unwraps a fenced %s document", (kind, input, expected) => {
    // A leading ``` makes an SVG fail to render and hands the preview iframe
    // invalid HTML, so this is correctness, not tidiness.
    expect(stripCodeFence(input, kind as "svg")).toBe(expected);
  });

  it("leaves unfenced content untouched", () => {
    expect(stripCodeFence("  <svg/>  ", "svg")).toBe("<svg/>");
  });
});

describe("deriveTitle", () => {
  it("prefers a markdown heading", () => {
    expect(deriveTitle("# Quarterly Report\n\nbody", "Report")).toBe(
      "Quarterly Report"
    );
  });
  it("falls back to an HTML title", () => {
    expect(deriveTitle("<html><title>Proto</title>", "Prototype")).toBe("Proto");
  });
  it("falls back to the recipe label when the content has neither", () => {
    expect(deriveTitle("just text", "Brief")).toBe("Brief");
  });
});

describe("generator", () => {
  it("produces a schema-valid manifest for a text recipe", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# Findings\n\nBody.",
      provider: "gemini",
      model: "gemini-2.0",
      viaNativeMac: false,
    });
    const services = createWebArtifactStudioServices(deps());
    const { promise, onProgress } = run(services, "report");
    const manifest = await promise;

    expect(() => artifactManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.kind).toBe("markdown");
    expect(manifest.title).toBe("Findings");
    expect(manifest.files[0]?.content).toContain("Body.");
    expect(manifest.provenance.generator).toMatchObject({
      kind: "directProvider",
      name: "gemini",
    });
    // The Studio drives its progress bar off these.
    const phases = onProgress.mock.calls.map(c => c[0].phase);
    expect(phases).toEqual(["preparing", "generating", "packaging", "complete"]);
    expect(onProgress.mock.calls.at(-1)?.[0].completed).toBe(1);
  });

  it("maps apple to onDevice and dreamer to dreamer provenance", async () => {
    for (const [provider, kind] of [
      ["apple", "onDevice"],
      ["dreamer", "dreamer"],
      ["openai", "directProvider"],
    ] as const) {
      generateTextForCurrentPlatform.mockResolvedValue({
        text: "# T\n\nb",
        provider,
        viaNativeMac: false,
      });
      const manifest = await run(
        createWebArtifactStudioServices(deps()),
        "report"
      ).promise;
      expect(manifest.provenance.generator.kind).toBe(kind);
    }
  });

  it("refuses image recipes with a message naming what does work", async () => {
    const services = createWebArtifactStudioServices(deps());
    await expect(run(services, "image-playground-artwork").promise).rejects.toThrow(
      /Mac app/
    );
    expect(generateTextForCurrentPlatform).not.toHaveBeenCalled();
  });

  it("rejects an empty model response instead of saving a blank artifact", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "   ",
      viaNativeMac: false,
    });
    await expect(
      run(createWebArtifactStudioServices(deps()), "report").promise
    ).rejects.toThrow(/empty artifact/);
  });

  it("aborts before calling the model when already cancelled", async () => {
    const services = createWebArtifactStudioServices(deps());
    const controller = new AbortController();
    controller.abort();
    await expect(
      services.generator.generate(request("report"), {
        signal: controller.signal,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow(/Aborted/);
    expect(generateTextForCurrentPlatform).not.toHaveBeenCalled();
  });

  it("unwraps fenced SVG so the artifact renders", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "```xml\n<svg viewBox='0 0 1 1'></svg>\n```",
      viaNativeMac: false,
    });
    const manifest = await run(
      createWebArtifactStudioServices(deps()),
      "svg-asset"
    ).promise;
    expect(manifest.files[0]?.content?.startsWith("<svg")).toBe(true);
    expect(manifest.files[0]?.path).toBe("asset.svg");
  });

  it("names the staticWeb file index.html, which previewFile requires", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "<!doctype html><title>P</title>",
      viaNativeMac: false,
    });
    const manifest = await run(
      createWebArtifactStudioServices(deps()),
      "static-web-prototype"
    ).promise;
    expect(manifest.files[0]?.path).toBe("index.html");
    expect(manifest.files[0]?.mimeType).toBe("text/html");
  });
});

describe("persistence", () => {
  it("saves and returns the manifest", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# T\n\nb",
      viaNativeMac: false,
    });
    const d = deps();
    const services = createWebArtifactStudioServices(d);
    const manifest = await run(services, "report").promise;
    await services.persistence.save(manifest);
    expect(d.save).toHaveBeenCalledWith(manifest);
  });

  it("fails loudly when local storage rejected the artifact", async () => {
    // A silent success here would show the artifact as saved and let the user
    // close the Studio on nothing.
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# T\n\nb",
      viaNativeMac: false,
    });
    const d = { ...deps(), save: vi.fn(async () => false) };
    const services = createWebArtifactStudioServices(d);
    const manifest = await run(services, "report").promise;
    await expect(services.persistence.save(manifest)).rejects.toThrow(
      /could not be stored locally/
    );
  });

  it("exports the first file with content, using its own name and mime", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# T\n\nb",
      viaNativeMac: false,
    });
    const d = deps();
    const services = createWebArtifactStudioServices(d);
    const manifest = await run(services, "report").promise;
    await services.persistence.export(manifest);
    expect(d.exportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "artifact.md",
        mimeType: "text/markdown",
        encoding: "utf8",
      })
    );
  });
});

describe("attachImageToBoard", () => {
  it("rejects an artifact with no PNG", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# T\n\nb",
      viaNativeMac: false,
    });
    const services = createWebArtifactStudioServices(deps());
    const manifest = await run(services, "report").promise;
    await expect(
      services.attachImageToBoard(manifest, "node.1")
    ).rejects.toThrow(/no PNG/);
  });
});
