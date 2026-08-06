import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { artifactManifestSchema } from "@shared/macArtifacts";

import {
  base64ToBytes,
  buildArtifactFile,
  buildArtifactManifest,
  bytesToBase64,
  createStableId,
  sha256Hex,
  utf8Bytes,
} from "./artifactManifest";

const provenance = {
  sourceBoardId: "board.1",
  sourceNodeIds: ["node.1"],
  recipeId: "report",
  generator: { kind: "directProvider" as const, name: "gemini", model: "x" },
};

describe("checksums", () => {
  it("matches what the server recomputes for utf8 payloads", async () => {
    // server/artifactPolicy.ts:204 does sha256 over the DECODED bytes and
    // rejects the sync on mismatch, so this equality is the contract.
    const content = "# Report\n\nBody with unicode: café 🌍";
    const ours = await sha256Hex(utf8Bytes(content));
    const theirs = createHash("sha256")
      .update(Buffer.from(content, "utf8"))
      .digest("hex");
    expect(ours).toBe(theirs);
  });

  it("matches for base64 payloads, hashing decoded bytes not the base64 text", async () => {
    const raw = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const b64 = bytesToBase64(raw);
    const ours = await sha256Hex(base64ToBytes(b64));
    const theirs = createHash("sha256")
      .update(Buffer.from(b64, "base64"))
      .digest("hex");
    expect(ours).toBe(theirs);
    // Hashing the base64 *text* would be the easy mistake; prove we don't.
    expect(ours).not.toBe(createHash("sha256").update(b64).digest("hex"));
  });

  it("round-trips bytes through base64 without corruption", () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes)
    );
  });
});

describe("buildArtifactFile", () => {
  it("reports decoded byte length for utf8, not character count", async () => {
    const content = "café 🌍"; // 6 chars, more bytes
    const file = await buildArtifactFile({
      path: "artifact.md",
      mimeType: "text/markdown",
      content,
      encoding: "utf8",
      timestamp: new Date().toISOString(),
    });
    expect(file.sizeBytes).toBe(Buffer.byteLength(content, "utf8"));
    expect(file.sizeBytes).toBeGreaterThan(content.length);
  });

  it("reports decoded byte length for base64, not the encoded length", async () => {
    const raw = new Uint8Array(300).fill(7);
    const b64 = bytesToBase64(raw);
    const file = await buildArtifactFile({
      path: "artwork.png",
      mimeType: "image/png",
      content: b64,
      encoding: "base64",
      timestamp: new Date().toISOString(),
    });
    expect(file.sizeBytes).toBe(300);
    expect(file.sizeBytes).toBeLessThan(b64.length);
  });
});

describe("buildArtifactManifest", () => {
  it("produces a manifest the shared schema accepts unmodified", async () => {
    const timestamp = new Date().toISOString();
    const file = await buildArtifactFile({
      path: "artifact.md",
      mimeType: "text/markdown",
      content: "# Hello",
      encoding: "utf8",
      timestamp,
    });
    const manifest = await buildArtifactManifest({
      title: "A report",
      kind: "markdown",
      recipeId: "report",
      scope: { kind: "board" },
      files: [file],
      provenance,
    });
    expect(() => artifactManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.sync.status).toBe("localOnly");
    expect(manifest.schemaVersion).toBe(1);
  });

  it("accepts toISOString output as a datetime with offset", async () => {
    // zod uses .datetime({ offset: true }); a trailing Z must satisfy it or
    // every manifest we build fails to parse.
    const manifest = await buildArtifactManifest({
      title: "t",
      kind: "markdown",
      recipeId: "report",
      scope: { kind: "board" },
      files: [
        await buildArtifactFile({
          path: "a.md",
          mimeType: "text/markdown",
          content: "x",
          encoding: "utf8",
          timestamp: new Date().toISOString(),
        }),
      ],
      provenance,
    });
    expect(manifest.createdAt.endsWith("Z")).toBe(true);
  });

  it("rejects an invalid manifest loudly instead of returning it", async () => {
    await expect(
      buildArtifactManifest({
        title: "t",
        kind: "markdown",
        recipeId: "report",
        scope: { kind: "board" },
        files: [], // schema requires at least one file
        provenance,
      })
    ).rejects.toThrow();
  });

  it("generates ids that satisfy stableIdSchema", () => {
    const pattern = /^[A-Za-z0-9][A-Za-z0-9._:,-]*$/;
    for (let i = 0; i < 50; i += 1) {
      const id = createStableId("artifact");
      expect(id).toMatch(pattern);
      expect(id.length).toBeLessThanOrEqual(128);
    }
  });
});
