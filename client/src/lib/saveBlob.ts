/**
 * Platform-aware blob save. Browsers get the `<a download>` pattern;
 * Capacitor (iOS) writes the blob to Documents and invokes the iOS
 * share sheet on the saved URI. Without the iOS branch, `<a download>`
 * is a silent no-op in WKWebView — taps appear to do nothing.
 *
 * On iOS the file lands in the app's Documents directory (visible in
 * Files.app under "On My iPhone → Hexmind" because Info.plist sets
 * `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`).
 * The share sheet is then offered for AirDrop / Mail / Save Image.
 * If the user cancels the sheet, the file is still saved — no error
 * is surfaced for that case.
 */
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isCapacitor } from "@/lib/platform";

interface SaveBlobOptions {
  /** Title shown in the iOS share sheet header. Ignored on web. */
  dialogTitle?: string;
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  options: SaveBlobOptions = {}
): Promise<void> {
  if (!isCapacitor()) {
    saveBlobWeb(blob, filename);
    return;
  }
  await saveBlobNative(blob, filename, options.dialogTitle);
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
      title: dialogTitle ?? "Hexmind export",
      url: result.uri,
      dialogTitle: dialogTitle ?? "Share Hexmind export",
    });
  } catch {
    // User cancelled the share sheet. The file is already in
    // Documents — they can find it in Files.app. No error surface.
  }
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
