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

  if (typeof window !== "undefined" && !isCapacitor()) {
    return trimTrailingSlashes(`${window.location.protocol}//${window.location.host}`);
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
