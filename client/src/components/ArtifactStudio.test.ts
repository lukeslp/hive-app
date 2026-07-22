// @vitest-environment jsdom

import React from "react";
import {
  act,
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

const attachment = {
  artifactId: artifact.id,
  targetNodeId: "0,0",
  fileId: artifact.files[0].id,
  mimeType: "image/png" as const,
  dataURL: "data:image/png;base64,iVBORw0KGgo=",
  checksum: artifact.files[0].checksum,
};

afterEach(cleanup);

describe("Artifact Studio", () => {
  it("strips embedded image payloads until each image is selected", async () => {
    const imageArtifact: ArtifactManifest = {
      ...artifact,
      kind: "staticWeb",
      files: [
        {
          ...artifact.files[0],
          id: "file:image:cloud",
          path: "artwork.png",
          mimeType: "image/png",
          encoding: "base64",
          content: "iVBORw0KGgo=",
        },
      ],
    };
    const cloudSync = vi.fn(async () => undefined);
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => imageArtifact) },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => attachment),
    };

    const rendered = render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:cloud:41",
        nodes,
        services,
        cloudSync,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(cloudSync).toHaveBeenCalledTimes(1));
    expect(cloudSync.mock.calls[0]?.[0].files[0]).not.toHaveProperty("content");
    expect(cloudSync.mock.calls[0]?.[1]).toEqual([]);

    rendered.unmount();
    cloudSync.mockClear();
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:cloud:41",
        nodes,
        services,
        cloudSync,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Sync image to cloud" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(cloudSync).toHaveBeenCalledTimes(1));
    expect(cloudSync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        files: [expect.objectContaining({ content: "iVBORw0KGgo=" })],
        sync: expect.objectContaining({
          includeImages: true,
          status: "pending",
        }),
      }),
      ["file:image:cloud"]
    );
  });

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
      attachImageToBoard: vi.fn(async () => attachment),
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
    expect(generate.mock.calls[0][0]).toMatchObject({
      sourceBoardId: "board:test",
      sourceNodeIds: ["0,0"],
      includedNodeCount: 1,
      originalNodeCount: 1,
      contextTruncated: false,
    });
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
      attachImageToBoard: vi.fn(async () => attachment),
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

  it("aborts active generation when the modal closes", async () => {
    let generationSignal: AbortSignal | undefined;
    const onClose = vi.fn();
    const services: ArtifactStudioServices = {
      generator: {
        generate: vi.fn((_request, options) => {
          generationSignal = options.signal;
          return new Promise<ArtifactManifest>(() => undefined);
        }),
      },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => attachment),
    };

    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose,
        boardId: "board:test",
        nodes,
        services,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    await screen.findByRole("button", { name: "Cancel generation" });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(generationSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not let an older request clear the active request controller", async () => {
    let resolveFirst: ((value: ArtifactManifest) => void) | undefined;
    const first = new Promise<ArtifactManifest>(resolve => {
      resolveFirst = resolve;
    });
    const second = new Promise<ArtifactManifest>(() => undefined);
    const signals: AbortSignal[] = [];
    const generate = vi
      .fn<ArtifactStudioServices["generator"]["generate"]>()
      .mockImplementationOnce((_request, options) => {
        signals.push(options.signal);
        return first;
      })
      .mockImplementationOnce((_request, options) => {
        signals.push(options.signal);
        return second;
      });
    const services: ArtifactStudioServices = {
      generator: { generate },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => attachment),
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
    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    await screen.findByRole("button", { name: "Cancel generation" });

    await act(async () => resolveFirst?.(artifact));
    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));

    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(true);
  });

  it("ignores queued progress from a cancelled request after its replacement starts", async () => {
    const calls: Array<{
      requestId: string;
      onProgress: Parameters<
        ArtifactStudioServices["generator"]["generate"]
      >[1]["onProgress"];
    }> = [];
    const generate = vi.fn<ArtifactStudioServices["generator"]["generate"]>(
      (request, options) => {
        calls.push({
          requestId: request.requestId,
          onProgress: options.onProgress,
        });
        return new Promise<ArtifactManifest>(() => undefined);
      }
    );
    const services: ArtifactStudioServices = {
      generator: { generate },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => attachment),
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
    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    await screen.findByRole("button", { name: "Cancel generation" });

    act(() => {
      calls[1].onProgress({
        requestId: calls[1].requestId,
        phase: "generating",
        completed: 0.4,
        message: "Fresh progress",
      });
      calls[0].onProgress({
        requestId: calls[0].requestId,
        phase: "packaging",
        completed: 0.9,
        message: "Stale progress",
      });
    });

    expect(screen.getByText("Fresh progress")).toBeTruthy();
    expect(screen.queryByText("Stale progress")).toBeNull();
  });

  it("reports the reduced included tile count", () => {
    const largeNodes: NodeMap = {
      "0,0": {
        ...nodes["0,0"],
        description: "x".repeat(13_000),
      },
      "1,0": {
        q: 1,
        r: 0,
        text: "Second tile",
        type: "concept",
        depth: 1,
        parentId: "0,0",
        pinned: false,
      },
    };

    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:test",
        nodes: largeNodes,
      })
    );

    expect(
      screen.getByText("1 of 2 tiles included within the context limit.")
    ).toBeTruthy();
  });

  it("previews the HTML entry file for a static web artifact", async () => {
    const staticArtifact: ArtifactManifest = {
      ...artifact,
      kind: "staticWeb",
      title: "Web prototype",
      files: [
        {
          ...artifact.files[0],
          id: "file:test:css",
          path: "styles.css",
          mimeType: "text/css",
          content: "body { color: red; }",
        },
        {
          ...artifact.files[0],
          id: "file:test:html",
          path: "index.html",
          mimeType: "text/html",
          content: "<main><h1>HTML entry</h1></main>",
        },
      ],
    };
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => staticArtifact) },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: vi.fn(async () => attachment),
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
    const preview = await screen.findByTitle("Web prototype preview");

    expect(preview.getAttribute("srcdoc")).toContain("HTML entry");
    expect(preview.getAttribute("srcdoc")).not.toContain("color: red");
  });

  it("reports attachment only after React board state accepts the typed image handoff", async () => {
    const imageArtifact: ArtifactManifest = {
      ...artifact,
      kind: "image",
      recipeId: "image-playground-artwork",
      files: [
        {
          ...artifact.files[0],
          id: "file:image:1",
          path: "artwork.png",
          mimeType: "image/png",
          encoding: "base64",
          content: "iVBORw0KGgo=",
        },
      ],
    };
    const handoff = {
      artifactId: imageArtifact.id,
      targetNodeId: "0,0",
      fileId: "file:image:1",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,iVBORw0KGgo=",
      checksum: imageArtifact.files[0].checksum,
    } as const;
    const prepare = vi.fn(async () => handoff);
    let acceptAttachment: (() => void) | undefined;
    const onAttachImage = vi.fn(
      () =>
        new Promise<void>(resolve => {
          acceptAttachment = resolve;
        })
    );
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => imageArtifact) },
      persistence: {
        save: vi.fn(async value => value),
        export: vi.fn(async () => undefined),
      },
      attachImageToBoard: prepare,
    };
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:test",
        nodes,
        selectedNodeIds: ["0,0"],
        services,
        onAttachImage,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Attach image" })
    );
    await waitFor(() => expect(onAttachImage).toHaveBeenCalledWith(handoff));
    expect(screen.queryByText("Image attached to the board.")).toBeNull();

    await act(async () => acceptAttachment?.());
    expect(await screen.findByText("Image attached to tile.")).toBeTruthy();
    expect(prepare).toHaveBeenCalledWith(imageArtifact, "0,0");
  });
});
