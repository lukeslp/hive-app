/**
 * Platform detection and API helpers for Capacitor native builds.
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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function getConfiguredNativeApiBaseUrl(): string | null {
  const configured =
    import.meta.env.VITE_CAPACITOR_API_BASE_URL ||
    import.meta.env.VITE_MOBILE_API_BASE_URL;

  if (!configured || typeof configured !== "string") {
    return null;
  }

  const normalized = trimTrailingSlashes(configured.trim());
  return normalized.length > 0 ? normalized : null;
}

/**
 * Returns the base URL for REST-like API calls.
 * - In Capacitor (native): absolute URL to the hosted backend.
 * - On web: relative path (same-origin proxy).
 */
export function getApiBaseUrl(): string {
  if (isCapacitor()) {
    return getConfiguredNativeApiBaseUrl() ?? "https://dr.eamer.dev/hexpand/api";
  }

  return "/api";
}

/**
 * Returns the tRPC endpoint URL for both web and Capacitor shells.
 */
export function getTrpcUrl(): string {
  return `${trimTrailingSlashes(getApiBaseUrl())}/trpc`;
}
