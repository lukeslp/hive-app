/**
 * Platform detection and offline utilities for Capacitor Android builds.
 */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
  }
}

/** True when running inside a Capacitor native shell (Android/iOS). */
export function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.Capacitor?.isNativePlatform?.()
  );
}

/** Returns the Capacitor platform string ("android", "ios", "web"). */
export function getPlatform(): string {
  return window.Capacitor?.getPlatform?.() ?? "web";
}

/** True when the device has no network connectivity. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/**
 * Returns the base URL for API calls.
 * - In Capacitor (native): absolute URL to the cloud server.
 * - On web: relative path (same-origin proxy).
 */
export function getApiBaseUrl(): string {
  if (isCapacitor()) {
    return "https://dr.eamer.dev/hexpand/api";
  }
  return "/api";
}
