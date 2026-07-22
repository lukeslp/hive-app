import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  artifactManifestSchema,
  type ArtifactFile,
  type ArtifactManifest,
} from "../shared/macArtifacts";

export const MAX_ARTIFACTS_PER_SESSION = 100;
export const MAX_FILES_PER_ARTIFACT = 64;
export const MAX_TEXT_FILE_BYTES = 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SYNCED_BYTES_PER_ARTIFACT = 12 * 1024 * 1024;
export const MAX_ARTIFACT_METADATA_BYTES = 256 * 1024;

const rasterImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const textMimeTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/css",
  "text/javascript",
  "text/typescript",
  "text/csv",
  "application/json",
  "application/javascript",
  "application/xml",
  "image/svg+xml",
]);

export const artifactSyncInputSchema = z
  .object({
    sessionId: z.number().int().positive(),
    artifact: artifactManifestSchema,
    imageFileIds: z.array(z.string().min(1).max(128)).max(16).default([]),
  })
  .strict();

export type PreparedArtifactFile = {
  fileId: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  encoding: "utf8" | "base64" | null;
  content: string | null;
  contentSynced: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PreparedArtifactSync = {
  artifact: ArtifactManifest;
  files: PreparedArtifactFile[];
  syncedImageFileIds: string[];
};

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function payloadBytes(file: ArtifactFile): Buffer {
  if (file.content === undefined)
    badRequest(`Missing content for ${file.path}`);
  if (file.encoding === "base64") {
    if (
      file.content.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        file.content
      )
    ) {
      badRequest(`Invalid base64 content for ${file.path}`);
    }
    return Buffer.from(file.content, "base64");
  }
  return Buffer.from(file.content, "utf8");
}

function validateMime(file: ArtifactFile) {
  const isImage = file.mimeType.startsWith("image/");
  const allowed =
    rasterImageMimeTypes.has(file.mimeType) ||
    file.mimeType === "image/svg+xml" ||
    textMimeTypes.has(file.mimeType);
  if (!allowed) badRequest(`Unsupported MIME type for ${file.path}`);
  if (rasterImageMimeTypes.has(file.mimeType) && file.encoding !== "base64") {
    badRequest(`Image content for ${file.path} must use base64 encoding`);
  }
  if (!isImage && file.encoding === "base64") {
    badRequest(`Text content for ${file.path} must use UTF-8 encoding`);
  }
}

function hasExpectedImageSignature(mimeType: string, bytes: Buffer): boolean {
  switch (mimeType) {
    case "image/png":
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      );
    case "image/jpeg":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff &&
        bytes[bytes.length - 2] === 0xff &&
        bytes[bytes.length - 1] === 0xd9
      );
    case "image/webp":
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "image/svg+xml":
      return /^(?:\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(
        bytes.subarray(0, 4_096).toString("utf8")
      );
    default:
      return true;
  }
}

export function prepareArtifactSync(
  input: z.infer<typeof artifactSyncInputSchema>
): PreparedArtifactSync {
  const { artifact, sessionId } = input;
  if (artifact.files.length > MAX_FILES_PER_ARTIFACT) {
    badRequest(`Artifacts may contain at most ${MAX_FILES_PER_ARTIFACT} files`);
  }
  const metadataBytes = Buffer.byteLength(
    JSON.stringify({
      ...artifact,
      files: artifact.files.map(({ content: _content, ...file }) => file),
    })
  );
  if (metadataBytes > MAX_ARTIFACT_METADATA_BYTES) {
    badRequest("Artifact metadata exceeds the sync limit");
  }
  if (artifact.provenance.sourceBoardId !== `board:cloud:${sessionId}`) {
    badRequest("Artifact provenance does not match the cloud session");
  }
  if (artifact.recipeId !== artifact.provenance.recipeId) {
    badRequest("Artifact recipe provenance does not match");
  }

  const imageSelection = new Set(input.imageFileIds);
  if (imageSelection.size !== input.imageFileIds.length) {
    badRequest("Image file selection contains duplicates");
  }

  const fileIds = new Set<string>();
  const paths = new Set<string>();
  let syncedBytes = 0;
  const syncedImageFileIds: string[] = [];
  const files = artifact.files.map(file => {
    if (fileIds.has(file.id) || paths.has(file.path)) {
      badRequest("Artifact file ids and paths must be unique");
    }
    fileIds.add(file.id);
    paths.add(file.path);
    validateMime(file);

    const isImage = file.mimeType.startsWith("image/");
    const selected = imageSelection.has(file.id);
    const declaredLimit = isImage ? MAX_IMAGE_FILE_BYTES : MAX_TEXT_FILE_BYTES;
    if (file.sizeBytes > declaredLimit) {
      badRequest(`${file.path} exceeds its ${declaredLimit} byte sync limit`);
    }
    if (selected && !isImage) {
      badRequest(`Only image files may require image sync opt-in: ${file.id}`);
    }
    if (isImage && !selected) {
      if (file.content !== undefined) {
        badRequest(`Image content was sent without opt-in: ${file.id}`);
      }
      return {
        fileId: file.id,
        path: file.path,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum.value,
        encoding: file.encoding ?? null,
        content: null,
        contentSynced: false,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    }

    const bytes = payloadBytes(file);
    if (isImage && !hasExpectedImageSignature(file.mimeType, bytes)) {
      badRequest(`Image signature does not match ${file.mimeType}`);
    }
    const maxBytes = declaredLimit;
    if (bytes.byteLength > maxBytes) {
      badRequest(`${file.path} exceeds its ${maxBytes} byte sync limit`);
    }
    if (bytes.byteLength !== file.sizeBytes) {
      badRequest(`Size mismatch for ${file.path}`);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== file.checksum.value) {
      badRequest(`Checksum mismatch for ${file.path}`);
    }
    syncedBytes += bytes.byteLength;
    if (syncedBytes > MAX_SYNCED_BYTES_PER_ARTIFACT) {
      badRequest("Artifact exceeds the total sync payload limit");
    }
    if (isImage) syncedImageFileIds.push(file.id);
    return {
      fileId: file.id,
      path: file.path,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum.value,
      encoding: file.encoding ?? null,
      content: file.content ?? null,
      contentSynced: true,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  });

  for (const selectedId of input.imageFileIds) {
    if (!fileIds.has(selectedId))
      badRequest(`Unknown image file: ${selectedId}`);
  }

  return { artifact, files, syncedImageFileIds };
}
