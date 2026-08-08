/**
 * Platform detection and API helpers for Capacitor native builds.
 */

import { APP_PUBLIC_WEB_ORIGIN } from "@shared/appBrand";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
  }
}

/** True inside the dedicated WKWebView-based macOS app. */
export function isNativeMac(): boolean {
  if (typeof window === "undefined") return false;
  const candidate = window as Window & {
    ideaTilesMac?: { capabilities?: { nativeMac?: boolean } };
  };
  return candidate.ideaTilesMac?.capabilities?.nativeMac === true;
}

/** True when running inside a Capacitor native shell (Android/iOS). */
export function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.()
  );
}

/** Returns the Capacitor platform string ("android", "ios", "web"). */
export function getPlatform(): string {
  return window.Capacitor?.getPlatform?.() ?? "web";
}

/**
 * True when running inside the iOS Capacitor shell.
 *
 * The iOS bundle is Apple-Intelligence-only by product decision: no provider
 * picker, no API keys, no cloud fallback. Web and Android keep the full
 * multi-provider machinery. Gate any cloud-fetch path with `if (!isIos())`
 * so iOS stays on FoundationModels exclusively.
 */
export function isIos(): boolean {
  return isCapacitor() && getPlatform() === "ios";
}

/**
 * Artifact Studio may use hosted generation outside the native Mac shell.
 * Keep it unavailable on iOS until an on-device implementation can satisfy
 * the App Store promise that board context never leaves the device.
 */
export function supportsArtifactStudio(): boolean {
  return !isIos();
}

/** Hosted snapshot creation stays in browser-class clients for this release. */
export function supportsHostedShareCreation(): boolean {
  return !isCapacitor();
}

/** Live collaboration is enabled for web and the dedicated native Mac shell. */
export function supportsLiveCollaboration(): boolean {
  return !isCapacitor();
}

/** True when the device has no network connectivity. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Origin for **browser-openable** links (e.g. `?s=` snapshot shares).
 * In the Capacitor shell `window.location.origin` is `capacitor://localhost`,
 * which recipients cannot open — use an env override or the canonical web app.
 *
 * Set `VITE_PUBLIC_WEB_APP_URL` at build time to override the default
 * canonical origin; on native when unset, uses `APP_PUBLIC_WEB_ORIGIN`
 * from `shared/appBrand.ts` (currently `https://ideatiles.app`).
 */
export function getPublicWebAppOrigin(): string {
  const fromEnv =
    typeof import.meta.env.VITE_PUBLIC_WEB_APP_URL === "string"
      ? import.meta.env.VITE_PUBLIC_WEB_APP_URL.trim()
      : "";
  if (fromEnv) return trimTrailingSlashes(fromEnv);

  if (typeof window !== "undefined" && !isCapacitor() && !isNativeMac()) {
    return trimTrailingSlashes(
      `${window.location.protocol}//${window.location.host}`
    );
  }

  return trimTrailingSlashes(APP_PUBLIC_WEB_ORIGIN);
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
  if (isCapacitor() || isNativeMac()) {
    return getConfiguredNativeApiBaseUrl() ?? `${APP_PUBLIC_WEB_ORIGIN}/api`;
  }

  return "/api";
}

/**
 * Returns the tRPC endpoint URL for both web and Capacitor shells.
 */
export function getTrpcUrl(): string {
  return `${trimTrailingSlashes(getApiBaseUrl())}/trpc`;
}

/** Hosted collaboration is enabled only for the dedicated Mac shell. */
export function getCollaborationWebSocketUrl(): string {
  if (isNativeMac()) {
    const origin = new URL(APP_PUBLIC_WEB_ORIGIN);
    const protocol = origin.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${origin.host}/ws/collab`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/collab`;
}

/** Build a browser-openable hosted app URL, never a private native URL. */
export function getPublicWebAppUrl(parameters: Record<string, string>): string {
  const url = new URL(getPublicWebAppOrigin());
  if (!isCapacitor() && !isNativeMac() && typeof window !== "undefined") {
    url.pathname = window.location.pathname || "/";
  }
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
