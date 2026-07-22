/**
 * File Purpose: Dispatch native generation to Apple Foundation Models, Android AICore, or Gemma.
 * Primary Components: Availability checks, timeout envelope, platform bridge routing.
 * I/O: Accepts prompts and returns local text or null so callers can apply policy.
 *
 * Android only reports local success after the native layer confirms a
 * checksum-verified Gemma model. A missing model returns null, and Android
 * callers explicitly continue to the existing cloud proxy.
 *
 * On non-iOS platforms (including web) these methods exist as no-ops that
 * always report unavailable — the caller should guard with `getPlatform()`.
 */

import { registerPlugin } from "@capacitor/core";
import { toast } from "sonner";
import { getPlatform } from "./platform";
import { AICore } from "./aicorePlugin";
import { Gemma } from "./gemmaPlugin";

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
  /**
   * True when the unavailability is expected to self-resolve
   * (modelNotReady: assets rehydrating after reboot/OS update).
   * Callers must not latch "unavailable" UI state on a transient reason.
   */
  transient?: boolean;
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
// they'll both write the same value back. Idempotent. Invalidated on app
// foreground (listener in main.tsx) — Apple Intelligence can be toggled
// in Settings while the app is backgrounded — and whenever a generation
// call times out or rejects as unavailable.
let availabilityCache: boolean | null = null;

/**
 * Cached availability check. Returns false fast on non-iOS platforms.
 *
 * Caching rules: a positive result and *permanent* negatives
 * (deviceNotEligible, appleIntelligenceNotEnabled, iOS < 26) are cached.
 * Transient negatives (modelNotReady — assets rehydrating after a
 * reboot/OS update) and bridge errors are NOT cached, so the next call
 * re-probes instead of locking the whole session to cloud-only.
 */
export async function isFoundationModelsAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  if (getPlatform() !== "ios") {
    availabilityCache = false;
    return false;
  }
  try {
    const { available, transient } = await FoundationModels.isAvailable();
    if (available || !transient) {
      availabilityCache = available;
    }
    return available;
  } catch {
    // Bridge hiccup (e.g. probe raced plugin registration at launch).
    // Report unavailable for THIS call but don't latch it.
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
  if (getPlatform() === "android") {
    return runAndroidOnDevice(opts);
  }

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
    // Timeout is a strong signal that the native side wedged, and an
    // "unavailable" rejection means availability flipped after the
    // cached probe (Apple Intelligence toggled mid-session, or a
    // transient modelNotReady). Either way, drop the cache so the next
    // call re-probes instead of trusting stale state.
    if (msg.startsWith("FM timeout") || msg.includes("unavailable")) {
      invalidateFoundationModelsCache();
    }
    return null;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

/** Build a single text prompt for the Android local runtime, which has no separate system field. */
export function buildGemmaPrompt(opts: FMGenerateOptions): string {
  return opts.systemPrompt?.trim()
    ? `Instructions:\n${opts.systemPrompt.trim()}\n\nRequest:\n${opts.prompt.trim()}`
    : opts.prompt.trim();
}

/**
 * Android has an explicit ordered local path: AICore (Gemini Nano) first,
 * then the separately configured checksum-verified Gemma runtime. Returning
 * null deliberately leaves the existing caller-owned cloud fallback unchanged.
 */
async function runAndroidOnDevice(
  opts: OnDeviceFirstOptions
): Promise<{ text: string } | null> {
  const aicore = await runAndroidAICore(opts);
  return aicore ?? runAndroidGemma(opts);
}

/**
 * Prefer ML Kit Prompt API when Android AICore has a downloaded Gemini Nano
 * model. A timeout explicitly signals the native bridge to cancel its coroutine
 * so a stale request cannot later resolve after cloud fallback has begun.
 */
async function runAndroidAICore(
  opts: OnDeviceFirstOptions
): Promise<{ text: string } | null> {
  try {
    const status = await AICore.getStatus();
    if (!status.available) {
      console.info(`[AICore] ${status.reason || status.state}; trying Gemma.`);
      return null;
    }
  } catch (error) {
    console.warn("[AICore] Status probe failed; trying Gemma:", error);
    return null;
  }

  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `aicore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = opts.timeoutMs ?? 30000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      void AICore.cancel({ requestId }).catch(() => undefined);
      reject(new Error(`AICore timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  if (!opts.silentDiagnostics) {
    toast.info("✦ Trying Gemini Nano on-device…", { duration: 800 });
  }

  try {
    const result = await Promise.race([
      AICore.generate({ prompt: buildGemmaPrompt(opts), requestId }),
      timeoutPromise,
    ]);
    return result.text.trim() ? { text: result.text } : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[AICore] Local inference failed; trying Gemma:", message);
    return null;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

/**
 * Run Android Gemma only when the native plugin confirms the expected model
 * was checksum-verified in private storage. Absence is normal: return null so
 * Android callers use cloud, without claiming on-device processing occurred.
 */
async function runAndroidGemma(
  opts: OnDeviceFirstOptions
): Promise<{ text: string } | null> {
  try {
    const status = await Gemma.isModelReady();
    if (!status.ready || !status.verified) {
      console.info(
        `[Gemma] ${status.reason || "Verified model absent"} Using cloud fallback.`
      );
      return null;
    }
  } catch (error) {
    console.warn("[Gemma] Status probe failed; using cloud fallback:", error);
    return null;
  }

  const timeoutMs = opts.timeoutMs ?? 60000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Gemma timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  if (!opts.silentDiagnostics) {
    toast.info("✦ Trying verified on-device model…", { duration: 800 });
  }

  try {
    const result = await Promise.race([
      Gemma.generate({
        prompt: buildGemmaPrompt(opts),
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      }),
      timeoutPromise,
    ]);
    return result.text.trim() ? { text: result.text } : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[Gemma] Local inference failed; using cloud fallback:", message);
    if (!opts.silentDiagnostics) {
      toast.warning("On-device unavailable — using cloud", { duration: 2500 });
    }
    return null;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
