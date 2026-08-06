/**
 * File Purpose: get a generated artifact out of the app and into the user's
 *   hands on web, iOS, and Android — the role FilePanelService plays on macOS.
 * I/O: browser download via object URL, or Capacitor Filesystem write followed
 *   by the native share sheet.
 *
 * iOS has no download concept, so a blob link silently does nothing there.
 * Writing to Filesystem.Directory.Cache and handing the resulting URI to
 * Share.share is the path that produces a real, savable file. Cache rather
 * than Documents: the file is a transfer buffer, not app state, and the OS is
 * free to reclaim it once the share completes.
 */
import { isCapacitor } from "./platform";

export interface ArtifactExportInput {
  fileName: string;
  mimeType: string;
  content: string;
  encoding: "utf8" | "base64";
  title: string;
}

/** Filesystem plugin wants base64 for binary and accepts it for text too. */
function toBase64(input: ArtifactExportInput): string {
  if (input.encoding === "base64") return input.content;
  const bytes = new TextEncoder().encode(input.content);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function toBlob(input: ArtifactExportInput): Blob {
  if (input.encoding === "base64") {
    const binary = atob(input.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: input.mimeType });
  }
  return new Blob([input.content], { type: `${input.mimeType};charset=utf-8` });
}

async function exportViaCapacitor(input: ArtifactExportInput): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const written = await Filesystem.writeFile({
    path: input.fileName,
    data: toBase64(input),
    directory: Directory.Cache,
  });
  await Share.share({
    title: input.title,
    // `files` is what produces a real attachment; `url` alone shares a link.
    files: [written.uri],
    dialogTitle: `Export ${input.title}`,
  });
}

function exportViaDownload(input: ArtifactExportInput): void {
  const url = URL.createObjectURL(toBlob(input));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = input.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoking synchronously can cancel the download in some browsers; a task
    // tick is enough for the navigation to take hold.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function exportArtifactFile(
  input: ArtifactExportInput
): Promise<void> {
  if (isCapacitor()) {
    await exportViaCapacitor(input);
    return;
  }
  exportViaDownload(input);
}
