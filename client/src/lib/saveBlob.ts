/**
 * Platform-aware blob save. Browsers get the `<a download>` pattern;
 * Capacitor (iOS) writes the blob to Documents and invokes the iOS
 * share sheet on the saved URI. Without the iOS branch, `<a download>`
 * is a silent no-op in WKWebView — taps appear to do nothing.
 *
 * On iOS the file lands in the app's Documents directory (visible in
 * Files.app under "On My iPhone → Idea Tiles" because Info.plist sets
 * `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`).
 * The share sheet is then offered for AirDrop / Mail / Save Image.
 * If the user cancels the sheet, the file is still saved — no error
 * is surfaced for that case.
 */
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { APP_DISPLAY_NAME } from "@shared/appBrand";
import { isCapacitor, isNativeMac } from "@/lib/platform";
import { noteExportAndMaybeRequestReview } from "@/lib/reviewPrompt";

const MAX_NATIVE_MAC_EXPORT_BYTES = 12_000_000;
const MAC_EXPORT_MIME_TYPES = new Set([
  "application/json",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

interface SaveBlobOptions {
  /** Title shown in the iOS share sheet header. Ignored on web. */
  dialogTitle?: string;
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  options: SaveBlobOptions = {}
): Promise<void> {
  if (isNativeMac()) {
    await saveBlobMac(blob, filename);
    return;
  }
  if (!isCapacitor()) {
    saveBlobWeb(blob, filename);
    return;
  }
  await saveBlobNative(blob, filename, options.dialogTitle);
}

async function saveBlobMac(blob: Blob, filename: string): Promise<void> {
  const fileExports = window.ideaTilesMac?.fileExports;
  if (!fileExports) throw new Error("Native Mac file export is unavailable.");
  if (
    blob.size > MAX_NATIVE_MAC_EXPORT_BYTES ||
    !MAC_EXPORT_MIME_TYPES.has(blob.type)
  ) {
    throw new Error("This file type or size cannot be exported on Mac.");
  }
  await fileExports.save({
    filename,
    mimeType: blob.type as
      | "application/json"
      | "image/png"
      | "image/jpeg"
      | "image/svg+xml",
    data: await blobToBase64(blob),
  });
}

function saveBlobWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveBlobNative(
  blob: Blob,
  filename: string,
  dialogTitle: string | undefined
): Promise<void> {
  const base64 = await blobToBase64(blob);
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
  });

  try {
    await Share.share({
      title: dialogTitle ?? `${APP_DISPLAY_NAME} export`,
      url: result.uri,
      dialogTitle: dialogTitle ?? `Share ${APP_DISPLAY_NAME} export`,
    });
  } catch {
    // User cancelled the share sheet. The file is already in
    // Documents — they can find it in Files.app. No error surface.
  }
  // File is on disk either way — that counts as a completed export.
  void noteExportAndMaybeRequestReview();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",", 2)[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
