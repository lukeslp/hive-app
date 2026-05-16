/**
 * Capacitor bridge to Apple's on-device LLM (FoundationModels, iOS 26+).
 *
 * Mirrors the Android GemmaPlugin shape so the AI generation hook can branch
 * by platform and fall back to the cloud LLM proxy when the device or OS
 * doesn't support on-device inference.
 *
 * On non-iOS platforms (including web) these methods exist as no-ops that
 * always report unavailable — the caller should guard with `getPlatform()`.
 */

import { registerPlugin } from "@capacitor/core";
import { toast } from "sonner";
import { getPlatform } from "./platform";

export interface FMGenerateOptions {
  /** User prompt. */
  prompt: string;
  /** Optional system instructions handed to LanguageModelSession. */
  systemPrompt?: string;
  /** 0.0 (deterministic) to 1.5+ (creative). Default 0.7. */
  temperature: number;
  /** Maximum tokens to generate. Default 1024. */
  maxTokens: number;
}

export interface FMResponse {
  text: string;
}

export interface FMAvailability {
  available: boolean;
  /** Reason string when unavailable (iOS<26, no Apple Intelligence, framework missing, etc.). */
  reason?: string;
}

export interface FoundationModelsPlugin {
  /** Reports whether on-device generation can run on this device + OS. */
  isAvailable(): Promise<FMAvailability>;

  /** Run inference and return the full response text. */
  generate(opts: FMGenerateOptions): Promise<FMResponse>;

  /**
   * Run inference under a @Generable BranchSet schema (iOS 26+ only).
   * The framework grammar-constrains decoding so the model literally
   * cannot emit invalid enums, wrong array length, or schema-shape
   * placeholder text. Returns JSON-encoded BranchSet in the `text`
   * field — same shape as `generate` so caller parsing is uniform.
   *
   * Use for tile generation. Use `generate` for shapes the schema
   * doesn't cover (currently: merge synthesis, which has its own
   * lighter contract).
   */
  generateBranches(opts: FMGenerateOptions): Promise<FMResponse>;
}

export const FoundationModels =
  registerPlugin<FoundationModelsPlugin>("FoundationModels");

// Per-session cache. JS is single-threaded so the only "race" is two
// concurrent first-callers both seeing null and both probing isAvailable;
// they'll both write the same value back. Idempotent. Cache is invalidated
// on app foreground via the `App` listener wired in main.tsx — Apple
// Intelligence can be toggled in Settings while the app is backgrounded.
let availabilityCache: boolean | null = null;

/**
 * Cached availability check. Returns false fast on non-iOS platforms.
 * The cache survives until invalidateFoundationModelsCache() is called.
 */
export async function isFoundationModelsAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  if (getPlatform() !== "ios") {
    availabilityCache = false;
    return false;
  }
  try {
    const { available } = await FoundationModels.isAvailable();
    availabilityCache = available;
    return available;
  } catch {
    availabilityCache = false;
    return false;
  }
}

/** Drop the cached availability so the next caller re-probes the bridge. */
export function invalidateFoundationModelsCache(): void {
  availabilityCache = null;
}

export interface OnDeviceFirstOptions extends FMGenerateOptions {
  /**
   * Per-call timeout in milliseconds. Defaults to 20 seconds — the Swift
   * side has its own 15s budget per call, and the JS race must run
   * longer so native errors propagate instead of getting masked by an
   * earlier JS abort. Apple Intelligence cold-start asset hydration plus
   * a transient ANE retry can legitimately push past 12s on real
   * hardware (verified in the post-strip TestFlight trace 2026-05-09).
   */
  timeoutMs?: number;
  /**
   * Suppress diagnostic toasts. Off by default — the toasts are useful
   * during the on-device verification phase. Pass true for paths where
   * the caller has its own UX (e.g. drag-merge synthesis, which surfaces
   * its own viaOnDevice flag).
   */
  silentDiagnostics?: boolean;
}

/**
 * Try the on-device path first, with a hard timeout and uniform diagnostics.
 * Returns the FM text on success, or null when:
 *   - Apple Intelligence isn't available on this device
 *   - The bridge call timed out
 *   - The native plugin rejected
 *   - The cache says no
 *
 * The caller falls back to its own cloud path on null. The helper does NOT
 * attempt any cloud call — it owns ONE concern: did on-device produce text?
 *
 * Diagnostic toasts (when not silent):
 *   - info "✦ Trying on-device…" before the bridge call
 *   - error "On-device timed out" / "On-device threw: <message>" on failure
 * Success is intentionally NOT toasted here — callers decide whether to
 * advertise viaOnDevice (which depends on whether the returned text was
 * actually usable, e.g. parsed to non-empty branches).
 */
export async function tryOnDeviceFirst(
  opts: OnDeviceFirstOptions
): Promise<{ text: string } | null> {
  return runWithBridge(opts, (fm, payload) => fm.generate(payload));
}

/**
 * Like `tryOnDeviceFirst` but routes through `generateBranches` — the
 * @Generable-backed plugin method that grammar-constrains the output
 * to BranchSet shape. The model can't emit invalid enums, wrong-count
 * arrays, or copy schema-placeholder text into the output.
 *
 * Returns `{text: string}` containing the JSON-encoded BranchSet so the
 * caller's existing parser path stays unchanged. Falls through to the
 * caller's cloud fallback (or iOS error toast) on null, exactly like
 * `tryOnDeviceFirst`.
 */
export async function tryOnDeviceBranchesFirst(
  opts: OnDeviceFirstOptions
): Promise<{ text: string } | null> {
  return runWithBridge(opts, (fm, payload) => fm.generateBranches(payload));
}

/**
 * Shared bridge invocation: cache check + timeout race + diagnostic
 * toasts + cache-invalidation-on-timeout. Both tryOnDeviceFirst and
 * tryOnDeviceBranchesFirst funnel through here so the operational
 * envelope (timeouts, error surfacing, retry signaling) stays
 * identical regardless of which plugin method runs.
 */
async function runWithBridge(
  opts: OnDeviceFirstOptions,
  invoke: (
    fm: FoundationModelsPlugin,
    payload: FMGenerateOptions
  ) => Promise<FMResponse>
): Promise<{ text: string } | null> {
  const available = await isFoundationModelsAvailable();
  if (!available) return null;

  const timeoutMs = opts.timeoutMs ?? 20000;
  const silent = opts.silentDiagnostics ?? false;

  if (!silent) {
    toast.info("✦ Trying on-device…", { duration: 800 });
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`FM timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    const fmCall = invoke(FoundationModels, {
      prompt: opts.prompt,
      systemPrompt: opts.systemPrompt,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    const result = await Promise.race([fmCall, timeoutPromise]);
    return { text: result.text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[FM] on-device failed, caller will fall back:", msg);
    if (!silent) {
      toast.error("On-device threw: " + msg, { duration: 4000 });
    }
    // Timeout is a strong signal that the native side wedged. Drop the
    // cache so the next call re-probes — covers the case where Apple
    // Intelligence was disabled mid-session or the framework hit a
    // recoverable transient.
    if (msg.startsWith("FM timeout")) {
      invalidateFoundationModelsCache();
    }
    return null;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
