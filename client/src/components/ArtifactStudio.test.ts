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
import {
  ArtifactCloudSyncError,
  ArtifactStudio,
} from "@/components/ArtifactStudio";
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
    sourceNodeIds: ["tile:0:0"],
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
  targetNodeId: "tile:0:0",
  fileId: artifact.files[0].id,
  mimeType: "image/png" as const,
  dataURL: "data:image/png;base64,iVBORw0KGgo=",
  checksum: artifact.files[0].checksum,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe("Artifact Studio", () => {
  it("flushes the current workspace before native package export", async () => {
    const pendingFlush = deferred<void>();
    const beforeExport = vi.fn(() => pendingFlush.promise);
    const exportArtifact = vi.fn(async () => undefined);
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => artifact) },
      persistence: {
        save: vi.fn(async value => value),
        export: exportArtifact,
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
        beforeExport,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));

    expect(beforeExport).toHaveBeenCalledTimes(1);
    expect(exportArtifact).not.toHaveBeenCalled();
    await act(async () => pendingFlush.resolve());
    await waitFor(() => expect(exportArtifact).toHaveBeenCalledWith(artifact));
  });

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
    const cloudSync = vi.fn(async () => ({ remoteId: "artifact:remote" }));
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

  it("persists pending before upload and synced after cloud success", async () => {
    const events: string[] = [];
    const save = vi.fn(async (value: ArtifactManifest) => {
      events.push(`save:${value.sync.status}`);
      return value;
    });
    const cloudSync = vi.fn(async (value: ArtifactManifest) => {
      events.push(`cloud:${value.sync.status}`);
      return { remoteId: "artifact:remote:1" };
    });
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => artifact) },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
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
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Artifact saved locally and synced.")
    ).toBeTruthy();
    expect(events).toEqual(["save:pending", "cloud:pending", "save:synced"]);
    expect(save.mock.calls[1]?.[0].sync).toMatchObject({
      status: "synced",
      remoteId: "artifact:remote:1",
      includeImages: false,
    });
  });

  it("starts only one save and disables conflicting result controls", async () => {
    const pendingSave = deferred<ArtifactManifest>();
    const pendingCloud = deferred<{ remoteId: string }>();
    const imageArtifact: ArtifactManifest = {
      ...artifact,
      kind: "image",
      files: [
        {
          ...artifact.files[0],
          id: "file:image:single-flight",
          path: "single-flight.png",
          mimeType: "image/png",
          encoding: "base64",
          content: "iVBORw0KGgo=",
        },
      ],
    };
    const save = vi
      .fn<(value: ArtifactManifest) => Promise<ArtifactManifest>>()
      .mockImplementationOnce(() => pendingSave.promise)
      .mockImplementation(async value => value);
    const cloudSync = vi.fn(() => pendingCloud.promise);
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => imageArtifact) },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:cloud:single-flight",
        nodes,
        selectedNodeIds: ["0,0"],
        services,
        cloudSync,
        onAttachImage: vi.fn(),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    const saveButton = await screen.findByRole("button", { name: "Save" });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(save).toHaveBeenCalledTimes(1);
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "New artifact",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Export" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Attach image",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Sync image to cloud",
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);

    await act(async () => pendingSave.resolve(save.mock.calls[0][0]));
    await waitFor(() => expect(cloudSync).toHaveBeenCalledTimes(1));
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () =>
      pendingCloud.resolve({ remoteId: "artifact:remote:single-flight" })
    );
    expect(
      await screen.findByText("Artifact saved locally and synced.")
    ).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(2);
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not let a stale save completion replace a newly generated artifact", async () => {
    const staleSave = deferred<ArtifactManifest>();
    const replacementSave = deferred<ArtifactManifest>();
    const replacementArtifact: ArtifactManifest = {
      ...artifact,
      id: "artifact:test:replacement",
      title: "Replacement brief",
    };
    const generate = vi
      .fn<ArtifactStudioServices["generator"]["generate"]>()
      .mockResolvedValueOnce(artifact)
      .mockResolvedValueOnce(replacementArtifact);
    const save = vi
      .fn<(value: ArtifactManifest) => Promise<ArtifactManifest>>()
      .mockImplementationOnce(() => staleSave.promise)
      .mockImplementationOnce(() => replacementSave.promise)
      .mockImplementation(async value => value);
    const cloudSync = vi.fn(async () => ({
      remoteId: "artifact:remote:stale",
    }));
    const services: ArtifactStudioServices = {
      generator: { generate },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
    const props = {
      onClose: vi.fn(),
      boardId: "board:cloud:stale",
      nodes,
      services,
      cloudSync,
    };
    const rendered = render(
      React.createElement(ArtifactStudio, { ...props, isOpen: true })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);

    rendered.rerender(
      React.createElement(ArtifactStudio, { ...props, isOpen: false })
    );
    rendered.rerender(
      React.createElement(ArtifactStudio, { ...props, isOpen: true })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    expect(await screen.findByText("Replacement brief")).toBeTruthy();
    const replacementSaveButton = screen.getByRole("button", { name: "Save" });
    fireEvent.click(replacementSaveButton);
    expect(save).toHaveBeenCalledTimes(2);

    await act(async () => staleSave.resolve(save.mock.calls[0][0]));

    expect(screen.getByText("Replacement brief")).toBeTruthy();
    expect(screen.queryByText("Prototype brief")).toBeNull();
    expect(cloudSync).not.toHaveBeenCalled();
    expect((replacementSaveButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => replacementSave.resolve(save.mock.calls[1][0]));
    expect(
      await screen.findByText("Artifact saved locally and synced.")
    ).toBeTruthy();
    expect(cloudSync).toHaveBeenCalledTimes(1);
    expect(cloudSync.mock.calls[0][0].id).toBe(replacementArtifact.id);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("persists a bounded safe error after cloud failure", async () => {
    const save = vi.fn(async (value: ArtifactManifest) => value);
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => artifact) },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:cloud:41",
        nodes,
        services,
        cloudSync: vi.fn(async () => {
          throw new Error("server leaked secret-key-value");
        }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Artifact saved locally. Cloud sync failed.")
    ).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]?.[0].sync.status).toBe("pending");
    expect(save.mock.calls[1]?.[0].sync).toMatchObject({
      status: "error",
      includeImages: false,
      error: "Cloud sync failed. Try again.",
    });
    expect(JSON.stringify(save.mock.calls[1]?.[0])).not.toContain(
      "secret-key-value"
    );
  });

  it("reports cloud success accurately when the final local status save fails", async () => {
    const save = vi
      .fn<(value: ArtifactManifest) => Promise<ArtifactManifest>>()
      .mockImplementationOnce(async value => value)
      .mockRejectedValueOnce(new Error("disk full"));
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => artifact) },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:cloud:41",
        nodes,
        services,
        cloudSync: vi.fn(async () => ({ remoteId: "artifact:remote:2" })),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Artifact synced to cloud, but its local status remains pending."
      )
    ).toBeTruthy();
    expect(save.mock.calls[0]?.[0].sync.status).toBe("pending");
    expect(save.mock.calls[1]?.[0].sync.status).toBe("synced");
  });

  it("surfaces guidance for a signed-in board that is not a cloud session", async () => {
    const save = vi.fn(async (value: ArtifactManifest) => value);
    const services: ArtifactStudioServices = {
      generator: { generate: vi.fn(async () => artifact) },
      persistence: { save, export: vi.fn(async () => undefined) },
      attachImageToBoard: vi.fn(async () => attachment),
    };
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: vi.fn(),
        boardId: "board:local",
        nodes,
        services,
        cloudSync: vi.fn(async () => {
          throw new ArtifactCloudSyncError(
            "cloudSessionRequired",
            "Save this board as a cloud session before syncing."
          );
        }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Save this board as a cloud session before syncing."
      )
    ).toBeTruthy();
    expect(save.mock.calls[1]?.[0].sync).toMatchObject({
      status: "error",
      error: "Save this board as a cloud session before syncing.",
    });
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
      sourceNodeIds: ["tile:0:0"],
      includedNodeCount: 1,
      originalNodeCount: 1,
      contextTruncated: false,
    });
    expect(screen.getByText("# Brief")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(artifact));
  });

  it("sends semantic selection scope and source IDs for negative coordinates", async () => {
    const scopedNodes: NodeMap = {
      "-1,0": {
        q: -1,
        r: 0,
        semanticId: "idea:negative-root",
        text: "Negative root",
        type: "root",
        depth: 0,
        parentId: null,
        pinned: false,
      },
      "-2,0": {
        q: -2,
        r: 0,
        text: "Negative selection",
        type: "concept",
        depth: 1,
        parentId: "-1,0",
        pinned: false,
      },
    };
    const generate = vi.fn<ArtifactStudioServices["generator"]["generate"]>(
      async () => ({
        ...artifact,
        scope: { kind: "selection", nodeIds: ["tile:-2:0"] },
        provenance: {
          ...artifact.provenance,
          sourceNodeIds: ["tile:-2:0"],
        },
      })
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
        nodes: scopedNodes,
        selectedNodeIds: ["-2,0"],
        branchRootNodeId: "-1,0",
        services,
      })
    );

    fireEvent.change(screen.getByLabelText("Context scope"), {
      target: { value: "selection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][0]).toMatchObject({
      sourceNodeIds: ["tile:-2:0"],
      scope: { kind: "selection", nodeIds: ["tile:-2:0"] },
    });
    expect(generate.mock.calls[0][0].context).toContain("Tile: -2,0; depth: 1");
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
    const negativeNodes: NodeMap = {
      "-1,0": {
        q: -1,
        r: 0,
        text: "Negative tile",
        type: "root",
        depth: 0,
        parentId: null,
        pinned: false,
      },
    };
    const imageArtifact: ArtifactManifest = {
      ...artifact,
      kind: "image",
      recipeId: "image-playground-artwork",
      provenance: {
        ...artifact.provenance,
        sourceNodeIds: ["tile:-1:0"],
      },
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
      targetNodeId: "tile:-1:0",
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
        nodes: negativeNodes,
        selectedNodeIds: ["-1,0"],
        services,
        onAttachImage,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Attach image" })
    );
    await waitFor(() =>
      expect(onAttachImage).toHaveBeenCalledWith({
        ...handoff,
        targetNodeId: "-1,0",
      })
    );
    expect(screen.queryByText("Image attached to the board.")).toBeNull();

    await act(async () => acceptAttachment?.());
    expect(await screen.findByText("Image attached to tile.")).toBeTruthy();
    expect(prepare).toHaveBeenCalledWith(imageArtifact, "tile:-1:0");
  });
});
