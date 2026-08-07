import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteArtifact,
  getArtifact,
  listArtifacts,
  putArtifact,
  resetArtifactStoreForTests,
} from "./artifactStore";
import { buildArtifactFile, buildArtifactManifest } from "./artifactManifest";

async function manifest() {
  const timestamp = new Date().toISOString();
  return buildArtifactManifest({
    title: "T",
    kind: "markdown",
    recipeId: "report",
    scope: { kind: "board" },
    files: [
      await buildArtifactFile({
        path: "artifact.md",
        mimeType: "text/markdown",
        content: "# T",
        encoding: "utf8",
        timestamp,
      }),
    ],
    provenance: {
      sourceBoardId: "board.1",
      sourceNodeIds: ["node.1"],
      recipeId: "report",
      generator: { kind: "directProvider", name: "gemini" },
    },
    timestamp,
  });
}

beforeEach(() => {
  resetArtifactStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetArtifactStoreForTests();
});

/**
 * The environment here has no IndexedDB, which is the same situation as a
 * private window or an older WKWebView. Losing local history is survivable;
 * throwing out of `save` and losing the artifact the user just waited on is
 * not, so every operation must degrade quietly.
 */
describe("without IndexedDB", () => {
  it("reports an unsuccessful save rather than throwing", async () => {
    await expect(putArtifact(await manifest())).resolves.toBe(false);
  });

  it("returns null and empty lists rather than throwing", async () => {
    await expect(getArtifact("artifact.missing")).resolves.toBeNull();
    await expect(listArtifacts()).resolves.toEqual([]);
    await expect(listArtifacts("board.1")).resolves.toEqual([]);
  });

  it("reports an unsuccessful delete rather than throwing", async () => {
    await expect(deleteArtifact("artifact.missing")).resolves.toBe(false);
  });

  it("survives an indexedDB.open that throws outright", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("SecurityError");
      },
    });
    resetArtifactStoreForTests();
    await expect(putArtifact(await manifest())).resolves.toBe(false);
  });

  it("treats an open that errors as unavailable", async () => {
    const request: Record<string, unknown> = { result: null };
    vi.stubGlobal("indexedDB", {
      open: () => {
        setTimeout(() => (request.onerror as () => void)?.(), 0);
        return request;
      },
    });
    resetArtifactStoreForTests();
    await expect(putArtifact(await manifest())).resolves.toBe(false);
  });
});
