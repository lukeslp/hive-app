/**
 * File Purpose: build ArtifactManifest values in the browser that satisfy
 *   shared/macArtifacts.ts unmodified, so a web-generated artifact is
 *   indistinguishable from a Mac-generated one.
 * I/O: pure functions over strings/bytes; no network, no storage.
 *
 * Three constraints drive the shapes here, all of them enforced elsewhere and
 * none of them optional:
 *
 * 1. `server/artifactPolicy.ts:204` recomputes every checksum as
 *    `sha256(decoded bytes)` and rejects the sync on mismatch, so the checksum
 *    must cover the DECODED payload — not the base64 text that carries it.
 * 2. The same file requires text to declare `utf8` and raster images to declare
 *    `base64`, and it re-derives byte length from the decoded payload, so
 *    `sizeBytes` must be the decoded length too.
 * 3. `ArtifactStudio.previewFile` only renders files whose `content` is a
 *    string, expects `index.html` for staticWeb, and expects raw base64 with no
 *    `data:` prefix for images.
 */
import {
  artifactManifestSchema,
  type ArtifactFile,
  type ArtifactKind,
  type ArtifactManifest,
  type ArtifactProvenance,
  type ArtifactScope,
} from "@shared/macArtifacts";

/** `stableIdSchema` is `^[A-Za-z0-9][A-Za-z0-9._:,-]*$`; a UUID satisfies it. */
export function createStableId(prefix: string): string {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}.${unique}`;
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked to avoid blowing the argument limit on multi-megabyte images.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/**
 * SHA-256 as lowercase hex. `crypto.subtle` requires a secure context;
 * Capacitor's `capacitor://` origin qualifies, which the existing use of
 * `crypto.randomUUID` in boardIdentity.ts already relies on.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Artifact checksums need crypto.subtle, which needs a secure context."
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Default file name and MIME per artifact kind. */
export function artifactFileTarget(kind: ArtifactKind): {
  path: string;
  mimeType: string;
} {
  switch (kind) {
    case "markdown":
      return { path: "artifact.md", mimeType: "text/markdown" };
    case "mermaid":
      return { path: "diagram.mmd", mimeType: "text/vnd.mermaid" };
    case "svg":
      return { path: "asset.svg", mimeType: "image/svg+xml" };
    // previewFile looks for index.html first; anything else renders nothing.
    case "staticWeb":
      return { path: "index.html", mimeType: "text/html" };
    case "codeBundle":
      return { path: "scaffold.md", mimeType: "text/markdown" };
    case "image":
      return { path: "artwork.png", mimeType: "image/png" };
  }
}

export async function buildArtifactFile(input: {
  path: string;
  mimeType: string;
  content: string;
  encoding: "utf8" | "base64";
  timestamp: string;
}): Promise<ArtifactFile> {
  const bytes =
    input.encoding === "base64"
      ? base64ToBytes(input.content)
      : utf8Bytes(input.content);
  return {
    id: createStableId("file"),
    path: input.path,
    mimeType: input.mimeType,
    sizeBytes: bytes.byteLength,
    checksum: { algorithm: "sha256", value: await sha256Hex(bytes) },
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    encoding: input.encoding,
    content: input.content,
  };
}

export async function buildArtifactManifest(input: {
  title: string;
  kind: ArtifactKind;
  recipeId: string;
  scope: ArtifactScope;
  files: ArtifactFile[];
  provenance: Omit<ArtifactProvenance, "generatedAt"> & {
    generatedAt?: string;
  };
  timestamp?: string;
}): Promise<ArtifactManifest> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    id: createStableId("artifact"),
    title: input.title.slice(0, 256),
    kind: input.kind,
    recipeId: input.recipeId,
    scope: input.scope,
    files: input.files,
    provenance: {
      ...input.provenance,
      generatedAt: input.provenance.generatedAt ?? timestamp,
    },
    sync: { status: "localOnly", includeImages: false, updatedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  // Parse rather than cast: a manifest that fails here would be rejected later
  // by the Mac bridge or the sync endpoint, where the error is far less clear.
  return artifactManifestSchema.parse(manifest);
}
