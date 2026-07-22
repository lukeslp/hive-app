import { describe, expect, it } from "vitest";
import {
  MAX_WORKSPACE_NODES,
  MAX_WORKSPACE_TRANSPORT_BYTES,
  createWorkspaceTransportEnvelope,
  importBrainSphereSession,
  mergeTilesSessionIntoWorkspace,
  migrateTilesSession,
  parseWorkspaceBoardPayload,
  parseWorkspaceTransport,
  serializeWorkspaceBoardPayload,
  switchWorkspaceMode,
  workspaceDocumentSchema,
  workspaceModeRegistry,
  workspaceEnvelopeForBoard,
  workspaceImportFileSizeAllowed,
  workspaceTransportForCloud,
  workspaceToLegacyTilesSession,
} from "@shared/workspaceDocument";
import {
  extractArtifactContext,
  extractArtifactContextFromGraph,
} from "@/lib/artifactContext";
import { canonicalGraphFromHexNodes } from "@/lib/workspaceCompatibility";
import type { NodeMap } from "@/types/hexmind";

const tileNodes: NodeMap = {
  "0,0": {
    q: 0,
    r: 0,
    text: "Board root",
    description: "The starting point.",
    type: "root",
    depth: 0,
    parentId: null,
    pinned: true,
    isKeyTheme: true,
  },
  "-1,0": {
    q: -1,
    r: 0,
    text: "Child idea",
    description: "A useful branch.",
    contextInfo: "Keep the constraint visible.",
    type: "concept",
    depth: 1,
    parentId: "0,0",
    pinned: false,
    linkedContext: ["0,0"],
    relatedNodeKeys: ["0,0"],
  },
};

const tilesSession = {
  boardId: "board:tiles:test",
  nodes: tileNodes,
  viewState: { x: 12, y: -8, zoom: 0.9 },
  creativity: 0.6,
  keyThemes: ["0,0"],
};

const brainSphereSession = {
  nodes: {
    "0": {
      tileIndex: 0,
      position: [0, 4, 0],
      text: "Sphere root",
      description: "North pole idea.",
      type: "root",
      depth: 0,
      parentIndex: null,
      pinned: true,
      isKeyTheme: true,
    },
    "7": {
      tileIndex: 7,
      position: [1, 3.5, -1],
      text: "Orbiting thought",
      contextPrompt: "Use the orbital constraint for generation.",
      type: "technical",
      depth: 1,
      parentIndex: 0,
      pinned: false,
      relatedNodeIndices: [0],
    },
  },
  alignments: [
    {
      sourceIndex: 0,
      targetIndex: 7,
      score: 0.82,
      reason: "Shared system boundary",
      category: "thematic",
    },
  ],
  camera: {
    position: [0, 0, 15],
    target: [0, 0, 0],
    fov: 60,
    zoom: 1,
  },
  metadata: {
    id: "sphere-session",
    name: "Imported sphere",
    date: "2026-07-21T20:00:00.000Z",
    nodeCount: 2,
    alignmentCount: 1,
  },
  sphereSubdivisions: 4,
};

describe("canonical workspace document", () => {
  it("migrates the current tile session into semantic graph and tile projection", () => {
    const workspace = migrateTilesSession(tilesSession);

    expect(workspace.schemaVersion).toBe(1);
    expect(workspace.activeMode).toBe("tiles");
    expect(workspace.graph.nodes.map(node => node.id)).toEqual([
      "tile:0:0",
      "tile:-1:0",
    ]);
    expect(workspace.graph.nodes[1].parentId).toBe("tile:0:0");
    expect(workspace.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "tile:-1:0",
          targetId: "tile:0:0",
          kind: "related",
        }),
      ])
    );
    expect(workspace.projections.tiles.nodes["tile:-1:0"]).toEqual({
      q: -1,
      r: 0,
    });
    expect(workspace.projections.tiles.viewport).toEqual(
      tilesSession.viewState
    );
    expect(workspace.projections.sphere.nodes).toEqual({});
  });

  it("derives stable distinct board IDs when legacy imports omit boardId", () => {
    const { boardId: _boardId, ...withoutId } = tilesSession;
    const first = migrateTilesSession(withoutId);
    const repeated = migrateTilesSession(withoutId);
    const changed = migrateTilesSession({
      ...withoutId,
      nodes: {
        ...withoutId.nodes,
        "0,0": { ...withoutId.nodes["0,0"], text: "Different root" },
      },
    });

    expect(first.id).toMatch(/^board:tiles:[a-f0-9]{16}$/);
    expect(repeated.id).toBe(first.id);
    expect(changed.id).not.toBe(first.id);

    const unmarkedNodes = {
      ...withoutId.nodes,
      "0,0": { ...withoutId.nodes["0,0"], isKeyTheme: false },
    };
    const withoutTheme = migrateTilesSession({
      ...withoutId,
      nodes: unmarkedNodes,
      keyThemes: [],
    });
    const withTheme = migrateTilesSession({
      ...withoutId,
      nodes: unmarkedNodes,
      keyThemes: ["0,0"],
    });
    expect(withTheme.graph.nodes[0].isKeyTheme).toBe(true);
    expect(withTheme.id).not.toBe(withoutTheme.id);
  });

  it("derives missing tile IDs from normalized canonical semantics", () => {
    const root = {
      q: 0,
      r: 0,
      text: "Equivalent root",
      type: "root" as const,
      depth: 0,
      pinned: false,
    };
    const common = {
      viewState: { x: 0, y: 0, zoom: 0.8 },
      creativity: 0.5,
    };
    const nodeTheme = migrateTilesSession({
      ...common,
      nodes: { "0,0": { ...root, isKeyTheme: true } },
    });
    const topLevelTheme = migrateTilesSession({
      ...common,
      nodes: { "0,0": root },
      keyThemes: ["0,0"],
    });
    const omittedOptionals = migrateTilesSession({
      ...common,
      nodes: { "0,0": root },
    });
    const explicitFalseAndNull = migrateTilesSession({
      ...common,
      nodes: {
        "0,0": { ...root, isKeyTheme: false, parentId: null },
      },
    });

    expect(nodeTheme).toEqual(topLevelTheme);
    expect(omittedOptionals).toEqual(explicitFalseAndNull);
  });

  it("uses locale-independent key ordering for content-derived IDs", () => {
    const { boardId: _boardId, ...withoutId } = tilesSession;
    const reversedNodes = Object.fromEntries(
      Object.entries(withoutId.nodes).reverse()
    );
    const originalLocaleCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => 0;
    try {
      expect(
        migrateTilesSession({ ...withoutId, nodes: reversedNodes }).id
      ).toBe(migrateTilesSession(withoutId).id);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  });

  it("requires canonical text, names, and alignment reasons to be trimmed", () => {
    const workspace = importBrainSphereSession(brainSphereSession);
    expect(() =>
      workspaceDocumentSchema.parse({
        ...workspace,
        graph: {
          ...workspace.graph,
          nodes: workspace.graph.nodes.map((node, index) =>
            index === 0 ? { ...node, text: " padded " } : node
          ),
        },
      })
    ).toThrow();
    expect(() =>
      workspaceDocumentSchema.parse({
        ...workspace,
        graph: {
          ...workspace.graph,
          nodes: workspace.graph.nodes.map((node, index) =>
            index === 0 ? { ...node, text: ` ${"x".repeat(512)} ` } : node
          ),
        },
      })
    ).toThrow();
    expect(() =>
      workspaceDocumentSchema.parse({
        ...workspace,
        metadata: { ...workspace.metadata, name: " padded " },
      })
    ).toThrow();
    expect(() =>
      workspaceDocumentSchema.parse({
        ...workspace,
        projections: {
          ...workspace.projections,
          sphere: {
            ...workspace.projections.sphere,
            alignments: workspace.projections.sphere.alignments.map(
              alignment => ({ ...alignment, reason: " padded " })
            ),
          },
        },
      })
    ).toThrow();

    for (const text of ["\uFEFFRoot", "Root\uFEFF"]) {
      expect(
        workspaceDocumentSchema.safeParse({
          ...workspace,
          graph: {
            ...workspace.graph,
            nodes: workspace.graph.nodes.map((node, index) =>
              index === 0 ? { ...node, text } : node
            ),
          },
        }).success
      ).toBe(false);
    }
    for (const edgeCharacter of ["\u0085", "\u200B"]) {
      expect(
        workspaceDocumentSchema.safeParse({
          ...workspace,
          graph: {
            ...workspace.graph,
            nodes: workspace.graph.nodes.map((node, index) =>
              index === 0
                ? { ...node, text: `${edgeCharacter}Root${edgeCharacter}` }
                : node
            ),
          },
        }).success
      ).toBe(true);
    }
  });

  it("accepts only real offset datetimes in canonical metadata", () => {
    const workspace = migrateTilesSession(tilesSession);
    for (const createdAt of [
      "0000-01-01T00:00Z",
      "0000-02-29T00:00Z",
      "2026-01-01T00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00.123+05:30",
      "0400-02-29T00:00Z",
    ]) {
      expect(
        workspaceDocumentSchema.safeParse({
          ...workspace,
          metadata: { ...workspace.metadata, createdAt },
        }).success
      ).toBe(true);
    }
    for (const createdAt of [
      "0100-02-29T00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-01-01T00:00+0100",
      "2026-01-01T00:00:00+99:99",
    ]) {
      expect(
        workspaceDocumentSchema.safeParse({
          ...workspace,
          metadata: { ...workspace.metadata, createdAt },
        }).success
      ).toBe(false);
    }
  });

  it("normalizes legacy strings before canonical validation", () => {
    const tiles = migrateTilesSession({
      ...tilesSession,
      nodes: {
        ...tilesSession.nodes,
        "0,0": { ...tilesSession.nodes["0,0"], text: "  Board root  " },
      },
    });
    expect(tiles.graph.nodes[0].text).toBe("Board root");

    const sphere = importBrainSphereSession({
      ...brainSphereSession,
      nodes: {
        ...brainSphereSession.nodes,
        "0": { ...brainSphereSession.nodes["0"], text: "  Sphere root  " },
      },
      alignments: brainSphereSession.alignments.map(alignment => ({
        ...alignment,
        reason: "  Shared system boundary  ",
      })),
      metadata: {
        ...brainSphereSession.metadata,
        name: "  Imported sphere  ",
      },
    });
    expect(sphere.graph.nodes[0].text).toBe("Sphere root");
    expect(sphere.projections.sphere.alignments[0].reason).toBe(
      "Shared system boundary"
    );
    expect(sphere.metadata.name).toBe("Imported sphere");
  });

  it("migrates the declared Tiles SessionData shape with view and metadata", () => {
    const workspace = migrateTilesSession({
      nodes: tileNodes,
      view: { x: 4, y: 6, zoom: 1.1 },
      metadata: {
        id: "declared-session",
        name: "Declared session",
        date: "2026-07-21T20:00:00.000Z",
        nodeCount: 2,
      },
    });

    expect(workspace.id).toBe("declared-session");
    expect(workspace.metadata.name).toBe("Declared session");
    expect(workspace.projections.tiles.viewport).toEqual({
      x: 4,
      y: 6,
      zoom: 1.1,
    });
  });

  it("imports BrainSphere SessionData without importing its storage/provider layer", () => {
    const workspace = importBrainSphereSession(brainSphereSession);

    expect(workspace.activeMode).toBe("sphere");
    expect(workspace.graph.nodes.map(node => node.id)).toEqual([
      "sphere:0",
      "sphere:7",
    ]);
    expect(workspace.graph.nodes[1].parentId).toBe("sphere:0");
    expect(workspace.graph.nodes[1].contextInfo).toBe(
      "Use the orbital constraint for generation."
    );
    expect(workspace.projections.sphere.nodes["sphere:7"]).toEqual({
      tileIndex: 7,
      position: [1, 3.5, -1],
    });
    expect(workspace.projections.sphere.alignments[0]).toEqual({
      sourceId: "sphere:0",
      targetId: "sphere:7",
      score: 0.82,
      reason: "Shared system boundary",
      category: "thematic",
    });
    expect(workspace.projections.sphere.subdivisions).toBe(4);
    expect(Object.keys(workspace.projections.tiles.nodes)).toHaveLength(2);

    const sanitized = importBrainSphereSession({
      ...brainSphereSession,
      metadata: { ...brainSphereSession.metadata, id: "../../Sphere board 🚀" },
    });
    expect(sanitized.id).toMatch(/^board:brainsphere:[a-f0-9]{8}$/);
  });

  it("switches modes without changing either projection or the semantic graph", () => {
    const original = importBrainSphereSession(brainSphereSession);
    const tiles = switchWorkspaceMode(original, "tiles");
    const sphere = switchWorkspaceMode(tiles, "sphere");

    expect(workspaceModeRegistry.map(mode => mode.id)).toEqual([
      "tiles",
      "sphere",
    ]);
    expect(sphere.graph).toEqual(original.graph);
    expect(sphere.projections).toEqual(original.projections);
    expect(sphere.activeMode).toBe("sphere");
  });

  it("round-trips canonical package and cloud envelopes", () => {
    const workspace = migrateTilesSession(tilesSession);
    const envelope = createWorkspaceTransportEnvelope(workspace);
    const parsedEnvelope = parseWorkspaceTransport(envelope);
    const boardPayload = serializeWorkspaceBoardPayload(workspace);
    const parsedBoard = parseWorkspaceBoardPayload(boardPayload);
    const legacy = workspaceToLegacyTilesSession(parsedBoard.workspace);
    const cloud = workspaceTransportForCloud(workspace);

    expect(parsedEnvelope).toEqual(envelope);
    expect(parsedBoard).toEqual(envelope);
    expect(legacy.nodes["-1,0"].semanticId).toBe("tile:-1:0");
    expect(legacy.nodes["-1,0"].parentId).toBe("0,0");
    expect(legacy.viewState).toEqual(tilesSession.viewState);
    expect(legacy.keyThemes).toEqual(["0,0"]);
    expect(cloud).toEqual(envelope);
    expect(cloud).not.toHaveProperty("nodes");
    const native = workspaceEnvelopeForBoard(envelope, "board:cloud:42");
    expect(native.workspace.id).toBe("board:cloud:42");
    expect(native.workspace.graph).toEqual(envelope.workspace.graph);
    expect(native.workspace.projections).toEqual(
      envelope.workspace.projections
    );
  });

  it("enforces one UTF-8 byte budget across persisted workspace transports", () => {
    const envelope = createWorkspaceTransportEnvelope(
      migrateTilesSession(tilesSession)
    );
    const encoded = new TextEncoder().encode(JSON.stringify(envelope));

    expect(encoded.byteLength).toBeLessThan(MAX_WORKSPACE_TRANSPORT_BYTES);
    expect(workspaceImportFileSizeAllowed(encoded.byteLength)).toBe(true);
    expect(
      workspaceImportFileSizeAllowed(MAX_WORKSPACE_TRANSPORT_BYTES + 1)
    ).toBe(false);

    const nearLimit = {
      ...envelope,
      workspace: {
        ...envelope.workspace,
        graph: {
          ...envelope.workspace.graph,
          nodes: envelope.workspace.graph.nodes.map((node, index) =>
            index === 0
              ? {
                  ...node,
                  compatibility: {
                    tiles: {
                      imageAttachment: {
                        artifactId: "artifact:large",
                        targetNodeId: "0,0",
                        fileId: "file:large",
                        mimeType: "image/png",
                        dataURL: `data:image/png;base64,${"A".repeat(
                          MAX_WORKSPACE_TRANSPORT_BYTES - 20_000
                        )}`,
                        checksum: {
                          algorithm: "sha256",
                          value: "a".repeat(64),
                        },
                      },
                    },
                  },
                }
              : node
          ),
        },
      },
    };
    expect(() =>
      parseWorkspaceTransport(JSON.stringify(nearLimit))
    ).not.toThrow();
    expect(() =>
      parseWorkspaceTransport(
        JSON.stringify({ ...nearLimit, padding: "A".repeat(20_000) })
      )
    ).toThrow(/size limit|exceeds/i);
  });

  it("rejects excessive JSON nesting before schema traversal", () => {
    const deeplyNested = `${"[".repeat(80)}0${"]".repeat(80)}`;
    expect(() => parseWorkspaceTransport(deeplyNested)).toThrow(/nesting/i);
  });

  it("uses JavaScript UTF-16 code units for text bounds", () => {
    const withinLimit = String.fromCodePoint(0x1f9e0).repeat(256);
    expect(() =>
      migrateTilesSession({
        ...tilesSession,
        nodes: {
          ...tilesSession.nodes,
          "0,0": { ...tilesSession.nodes["0,0"], text: withinLimit },
        },
      })
    ).not.toThrow();
    expect(() =>
      migrateTilesSession({
        ...tilesSession,
        nodes: {
          ...tilesSession.nodes,
          "0,0": {
            ...tilesSession.nodes["0,0"],
            text: `${withinLimit}x`,
          },
        },
      })
    ).toThrow();
  });

  it("preserves noncanonical tile fields and an existing sphere projection", () => {
    const sphere = importBrainSphereSession(brainSphereSession);
    const legacy = workspaceToLegacyTilesSession(sphere);
    legacy.nodes["1,0"] = {
      ...legacy.nodes["1,0"],
      text: "Edited orbit",
      clarifyingQuestion: "Which orbit?",
      shouldAskClarifyingQuestion: true,
      codeSnippet: { language: "swift", code: "let orbit = true" },
      visualization: { type: "diagram", data: { nodes: 2 } },
    };

    const merged = mergeTilesSessionIntoWorkspace(sphere, legacy);
    const roundTrip = workspaceToLegacyTilesSession(merged);

    expect(merged.projections.sphere).toEqual(sphere.projections.sphere);
    expect(roundTrip.nodes["1,0"]).toEqual(
      expect.objectContaining({
        text: "Edited orbit",
        clarifyingQuestion: "Which orbit?",
        shouldAskClarifyingQuestion: true,
        codeSnippet: { language: "swift", code: "let orbit = true" },
        visualization: { type: "diagram", data: { nodes: 2 } },
      })
    );
  });

  it("rejects unknown fields, dangling references, oversized text, and node floods", () => {
    const workspace = migrateTilesSession(tilesSession);
    expect(() =>
      workspaceDocumentSchema.parse({ ...workspace, surprise: true })
    ).toThrow();
    expect(() =>
      workspaceDocumentSchema.parse({
        ...workspace,
        graph: {
          ...workspace.graph,
          nodes: workspace.graph.nodes.map((node, index) =>
            index === 1 ? { ...node, parentId: "tile:missing:0" } : node
          ),
        },
      })
    ).toThrow();
    expect(() =>
      importBrainSphereSession({
        ...brainSphereSession,
        nodes: {
          ...brainSphereSession.nodes,
          "7": {
            ...brainSphereSession.nodes["7"],
            text: "x".repeat(513),
          },
        },
      })
    ).toThrow();

    const floodedNodes = Object.fromEntries(
      Array.from({ length: MAX_WORKSPACE_NODES + 1 }, (_, index) => [
        String(index),
        {
          tileIndex: index,
          position: [0, 0, 0],
          text: `Node ${index}`,
          type: "concept",
          depth: 0,
          parentIndex: null,
          pinned: false,
        },
      ])
    );
    expect(() =>
      importBrainSphereSession({
        ...brainSphereSession,
        nodes: floodedNodes,
        alignments: [],
        metadata: {
          ...brainSphereSession.metadata,
          nodeCount: MAX_WORKSPACE_NODES + 1,
          alignmentCount: 0,
        },
      })
    ).toThrow();
  });

  it("keeps Artifact Studio context identical through the canonical graph", () => {
    const legacy = extractArtifactContext(tileNodes, { kind: "board" });
    const canonical = extractArtifactContextFromGraph(
      canonicalGraphFromHexNodes(tileNodes),
      { kind: "board" }
    );

    expect(canonical.nodes.map(node => node.text)).toEqual(
      legacy.nodes.map(node => node.text)
    );
    expect(canonical.nodes.map(node => node.description)).toEqual(
      legacy.nodes.map(node => node.description)
    );
    expect(canonical.originalNodeCount).toBe(legacy.originalNodeCount);
    expect(canonical.truncated).toBe(legacy.truncated);
    expect(legacy.nodeIds).toEqual(["tile:0:0", "tile:-1:0"]);
    expect(legacy.nodes[1].parentId).toBe("tile:0:0");
    expect(canonical.text).toContain("Keep the constraint visible.");
  });
});
