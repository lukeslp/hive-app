import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { ArtifactManifest } from "../shared/macArtifacts";

const store = vi.hoisted(() => ({
  getSession: vi.fn(),
  getArtifactOwnership: vi.fn(),
  countArtifactsForSession: vi.fn(),
  upsertArtifact: vi.fn(),
  listArtifacts: vi.fn(),
  getArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  ArtifactQuotaError: class ArtifactQuotaError extends Error {},
}));

vi.mock("./db", () => store);

import { artifactsRouter } from "./routers/artifacts";

const user = {
  id: 7,
  openId: "artifact-owner",
  name: "Owner",
  email: "owner@example.com",
  loginMethod: "oauth",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller(authenticated = true) {
  return artifactsRouter.createCaller({
    user: authenticated ? user : null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}

function sha256(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function manifest(files?: ArtifactManifest["files"]): ArtifactManifest {
  const now = "2026-07-21T12:00:00.000Z";
  const text = "# A concise report";
  return {
    schemaVersion: 1,
    id: "artifact:cloud-test",
    title: "Cloud test",
    kind: "markdown",
    recipeId: "executive-brief",
    scope: { kind: "board" },
    files: files ?? [
      {
        id: "file:report",
        path: "report.md",
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(text),
        checksum: { algorithm: "sha256", value: sha256(text) },
        createdAt: now,
        updatedAt: now,
        encoding: "utf8",
        content: text,
      },
    ],
    provenance: {
      sourceBoardId: "board:cloud:41",
      sourceNodeIds: ["0,0"],
      recipeId: "executive-brief",
      generatedAt: now,
      generator: { kind: "onDevice", name: "Foundation Models" },
    },
    sync: { status: "pending", includeImages: false, updatedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

describe("artifacts router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.getSession.mockResolvedValue({ id: 41, userId: user.id });
    store.getArtifactOwnership.mockResolvedValue(null);
    store.countArtifactsForSession.mockResolvedValue(0);
    store.upsertArtifact.mockResolvedValue(undefined);
    store.listArtifacts.mockResolvedValue([]);
    store.getArtifact.mockResolvedValue(null);
    store.deleteArtifact.mockResolvedValue(false);
  });

  it("requires authentication", async () => {
    await expect(caller(false).list({ sessionId: 41 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("syncs text content by default after verifying session ownership", async () => {
    const artifact = manifest();

    const result = await caller().upsert({
      sessionId: 41,
      artifact,
      imageFileIds: [],
    });

    expect(store.getSession).toHaveBeenCalledWith(41, user.id);
    expect(store.upsertArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        sessionId: 41,
        artifact: expect.objectContaining({ id: artifact.id }),
        files: [
          expect.objectContaining({
            fileId: "file:report",
            content: "# A concise report",
            contentSynced: true,
          }),
        ],
      })
    );
    expect(result).toEqual({ id: artifact.id, syncedImageFileIds: [] });
  });

  it("rejects a session owned by another user", async () => {
    store.getSession.mockResolvedValue(null);

    await expect(
      caller().upsert({ sessionId: 41, artifact: manifest(), imageFileIds: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.upsertArtifact).not.toHaveBeenCalled();
  });

  it("rejects an artifact id already owned by another user", async () => {
    store.getArtifactOwnership.mockResolvedValue({ userId: 99, sessionId: 41 });

    await expect(
      caller().upsert({ sessionId: 41, artifact: manifest(), imageFileIds: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires explicit opt-in for each image payload", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const artifact = manifest([
      {
        id: "file:image",
        path: "image.png",
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        checksum: { algorithm: "sha256", value: sha256(png) },
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:00:00.000Z",
        encoding: "base64",
        content: png.toString("base64"),
      },
    ]);
    artifact.kind = "image";

    await caller().upsert({
      sessionId: 41,
      artifact: {
        ...artifact,
        files: artifact.files.map(file => ({ ...file, content: undefined })),
      },
      imageFileIds: [],
    });
    expect(store.upsertArtifact).toHaveBeenLastCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({ content: null, contentSynced: false }),
        ],
      })
    );

    await caller().upsert({
      sessionId: 41,
      artifact,
      imageFileIds: ["file:image"],
    });
    expect(store.upsertArtifact).toHaveBeenLastCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            content: png.toString("base64"),
            contentSynced: true,
          }),
        ],
      })
    );
  });

  it("supports mixed bundles while requiring consent for embedded images", async () => {
    const html = "<main>Prototype</main>";
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const bundle = manifest([
      {
        id: "file:index",
        path: "index.html",
        mimeType: "text/html",
        sizeBytes: Buffer.byteLength(html),
        checksum: { algorithm: "sha256", value: sha256(html) },
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:00:00.000Z",
        encoding: "utf8",
        content: html,
      },
      {
        id: "file:hero",
        path: "hero.png",
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        checksum: { algorithm: "sha256", value: sha256(png) },
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:00:00.000Z",
        encoding: "base64",
        content: png.toString("base64"),
      },
    ]);
    bundle.kind = "staticWeb";

    await expect(
      caller().upsert({
        sessionId: 41,
        artifact: bundle,
        imageFileIds: ["file:hero"],
      })
    ).resolves.toMatchObject({ syncedImageFileIds: ["file:hero"] });
  });

  it("rejects MIME mismatches, corrupt checksums, oversized files, and quotas", async () => {
    const cases = [
      manifest([
        {
          ...manifest().files[0],
          mimeType: "application/x-executable",
        },
      ]),
      manifest([
        {
          ...manifest().files[0],
          checksum: { algorithm: "sha256", value: "0".repeat(64) },
        },
      ]),
      manifest([
        {
          ...manifest().files[0],
          sizeBytes: 1_048_577,
          content: "x".repeat(1_048_577),
          checksum: {
            algorithm: "sha256",
            value: sha256("x".repeat(1_048_577)),
          },
        },
      ]),
    ];

    for (const artifact of cases) {
      await expect(
        caller().upsert({ sessionId: 41, artifact, imageFileIds: [] })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    const fakePng = Buffer.from("not really a png");
    const disguisedImage = manifest([
      {
        id: "file:fake-image",
        path: "fake.png",
        mimeType: "image/png",
        sizeBytes: fakePng.byteLength,
        checksum: { algorithm: "sha256", value: sha256(fakePng) },
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:00:00.000Z",
        encoding: "base64",
        content: fakePng.toString("base64"),
      },
    ]);
    disguisedImage.kind = "image";
    await expect(
      caller().upsert({
        sessionId: 41,
        artifact: disguisedImage,
        imageFileIds: ["file:fake-image"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const tooManyFiles = manifest(
      Array.from({ length: 65 }, (_, index) => {
        const content = String(index);
        return {
          ...manifest().files[0],
          id: `file:${index}`,
          path: `file-${index}.txt`,
          mimeType: "text/plain",
          sizeBytes: Buffer.byteLength(content),
          checksum: { algorithm: "sha256" as const, value: sha256(content) },
          content,
        };
      })
    );
    await expect(
      caller().upsert({
        sessionId: 41,
        artifact: tooManyFiles,
        imageFileIds: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    store.countArtifactsForSession.mockResolvedValue(100);
    await expect(
      caller().upsert({ sessionId: 41, artifact: manifest(), imageFileIds: [] })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("deletes only an owned artifact and its file rows", async () => {
    store.deleteArtifact.mockResolvedValue(true);
    const result = await caller().delete({ id: "artifact:cloud-test" });

    expect(store.deleteArtifact).toHaveBeenCalledWith(
      "artifact:cloud-test",
      user.id
    );
    expect(result).toEqual({ success: true });
  });

  it("maps a transaction-time quota race to a typed response", async () => {
    store.upsertArtifact.mockRejectedValueOnce(new store.ArtifactQuotaError());

    await expect(
      caller().upsert({ sessionId: 41, artifact: manifest(), imageFileIds: [] })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
