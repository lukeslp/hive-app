// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactStudio } from "@/components/ArtifactStudio";
import type {
  ArtifactManifest,
  ArtifactStudioServices,
} from "@shared/macArtifacts";
import type { NodeMap } from "@/types/hexmind";

const nodes: NodeMap = {
  "0,0": {
    q: 0,
    r: 0,
    text: "Prototype launch",
    description: "Plan a careful release.",
    type: "root",
    depth: 0,
    parentId: null,
    pinned: true,
  },
};

const artifact: ArtifactManifest = {
  schemaVersion: 1,
  id: "artifact:test:1",
  title: "Prototype brief",
  kind: "markdown",
  recipeId: "brief",
  scope: { kind: "board" },
  files: [
    {
      id: "file:test:1",
      path: "brief.md",
      mimeType: "text/markdown",
      sizeBytes: 7,
      checksum: { algorithm: "sha256", value: "b".repeat(64) },
      createdAt: "2026-07-21T12:00:00.000Z",
      updatedAt: "2026-07-21T12:00:00.000Z",
      content: "# Brief",
    },
  ],
  provenance: {
    sourceBoardId: "board:test",
    sourceNodeIds: ["0,0"],
    recipeId: "brief",
    generatedAt: "2026-07-21T12:00:00.000Z",
    generator: { kind: "onDevice", name: "Test generator" },
  },
  sync: {
    status: "localOnly",
    includeImages: false,
    updatedAt: "2026-07-21T12:00:00.000Z",
  },
  createdAt: "2026-07-21T12:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

afterEach(cleanup);

describe("Artifact Studio", () => {
  it("requires confirmation, reports progress, previews, and delegates actions", async () => {
    const save = vi.fn(async (value: ArtifactManifest) => value);
    const generate = vi.fn<ArtifactStudioServices["generator"]["generate"]>(
      async (request, options) => {
        options.onProgress({
          requestId: request.requestId,
          phase: "generating",
          completed: 0.5,
          message: "Drafting",
        });
        return artifact;
      }
    );
    const services: ArtifactStudioServices = {
      generator: { generate },
      persistence: {
        save,
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => undefined),
    };

    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:test",
        nodes,
        selectedNodeIds: ["0,0"],
        branchRootNodeId: "0,0",
        services,
      })
    );

    expect(screen.getByText("Suggested for this context")).toBeTruthy();
    expect(screen.getByText("Writing")).toBeTruthy();
    expect(screen.getByText("Software")).toBeTruthy();
    expect(screen.getByText("Design")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm generation")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));

    await waitFor(() =>
      expect(screen.getByText("Prototype brief")).toBeTruthy()
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("# Brief")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(artifact));
  });

  it("moves to a cancelled state immediately when generation is cancelled", async () => {
    const services: ArtifactStudioServices = {
      generator: {
        generate: vi.fn(() => new Promise<ArtifactManifest>(() => undefined)),
      },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => undefined),
    };

    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:test",
        nodes,
        services,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel generation" })
    );

    expect(screen.getByText("Generation cancelled")).toBeTruthy();
    expect(
      screen.getByText("Generation cancelled. Nothing was saved.")
    ).toBeTruthy();
  });
});
