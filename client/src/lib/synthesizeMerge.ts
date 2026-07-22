/**
 * Async helper: synthesize two hex tiles into one new tile via LLM.
 *
 * Behavior by platform:
 *   - Web: hosted /api/generate directly
 *   - Mac: selected native local, BYOK, or Dreamer engine
 *   - iOS: Apple Foundation Models on-device only — no cloud fallback
 *   - Android: Apple Foundation Models (always returns null) → cloud /api/generate
 *
 * The merge itself commits synchronously before this runs, so latency
 * never blocks the UI. If no path produces a synthesis in time, returns
 * null and the caller's literal string-concat stands.
 */

import { isCapacitor, isIos } from "./platform";
import { tryOnDeviceFirst } from "./foundationModelsPlugin";
import { generateTextForCurrentPlatform } from "./macGeneration";

export interface MergeInput {
  text: string;
  description?: string;
  type?: string;
}

export interface MergeSynthesis {
  title: string;
  description: string;
  type: string;
}

const MERGE_SYSTEM_PROMPT = `You are consolidating two related ideas on a hex mind-map into a single fused tile.

Given a source and a target tile, synthesize ONE new tile that captures the essential combined idea. Reclassify the type based on the merged concept, not by inheriting either input's type.

RULES:
- title: 2-4 words MAXIMUM. Short, punchy, scannable. The merged title should feel like a natural label for both source and target combined, not a literal "X + Y" concat.
- type: one of concept | action | technical | question | risk — pick the type that best fits the combined idea
- description: ONE sentence (under 30 words) explaining how the two ideas come together
- Return ONLY valid JSON. No commentary, no markdown.

JSON schema:
{ "title": "Merged Label", "type": "concept", "description": "One-sentence synthesis." }`;

// Cloud round-trips routinely exceed 1.5s; since the concat tile is already
// committed and this only upgrades it in place, a longer budget just means
// more merges get the good title.
const TIMEOUT_MS = 4000;

function buildUserPrompt(source: MergeInput, target: MergeInput): string {
  return (
    `SOURCE tile: "${source.text}"${source.type ? ` [${source.type}]` : ""}` +
    (source.description ? `\nSource description: ${source.description}` : "") +
    `\n\n` +
    `TARGET tile: "${target.text}"${target.type ? ` [${target.type}]` : ""}` +
    (target.description ? `\nTarget description: ${target.description}` : "") +
    `\n\n` +
    `Synthesize ONE merged tile.`
  );
}

function parseSynthJson(raw: string): MergeSynthesis | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.title !== "string" || parsed.title.trim() === "")
      return null;
    const allowedTypes = ["concept", "action", "technical", "question", "risk"];
    const type = allowedTypes.includes(parsed?.type) ? parsed.type : "concept";
    return {
      title: parsed.title.trim(),
      description:
        typeof parsed.description === "string" ? parsed.description.trim() : "",
      type,
    };
  } catch {
    return null;
  }
}

async function tryFoundationModels(
  source: MergeInput,
  target: MergeInput
): Promise<MergeSynthesis | null> {
  // Silent diagnostics: drag-merge has its own UX (the viaOnDevice flag
  // surfaces in synthesizeMerge's caller), so the shared helper's toasts
  // would be redundant here.
  const fm = await tryOnDeviceFirst({
    prompt: buildUserPrompt(source, target),
    systemPrompt: MERGE_SYSTEM_PROMPT,
    temperature: 0.6,
    maxTokens: 256,
    // Synthesis is short — a 5s budget is plenty even on cold-start.
    timeoutMs: 5000,
    silentDiagnostics: true,
  });
  return fm ? parseSynthJson(fm.text) : null;
}

async function tryCloudFallback(
  source: MergeInput,
  target: MergeInput,
  extraHeaders: Record<string, string>
): Promise<{ synth: MergeSynthesis; viaOnDevice: boolean } | null> {
  const cloudPayload = {
    contents: [{ parts: [{ text: buildUserPrompt(source, target) }] }],
    systemInstruction: { parts: [{ text: MERGE_SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.6,
      maxOutputTokens: 256,
    },
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const generation = await generateTextForCurrentPlatform({
      prompt: buildUserPrompt(source, target),
      systemPrompt: MERGE_SYSTEM_PROMPT,
      cloudPayload,
      headers: { "Content-Type": "application/json", ...extraHeaders },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const synth = parseSynthJson(generation.text);
    return synth
      ? {
          synth,
          viaOnDevice:
            generation.viaNativeMac && generation.provider === "apple",
        }
      : null;
  } catch {
    return null;
  }
}

export interface SynthesizedMergeResult {
  synth: MergeSynthesis;
  /** True iff the synthesis came from Apple Foundation Models on-device. */
  viaOnDevice: boolean;
}

/**
 * Returns a synthesized merged tile (with a flag for whether it came
 * from on-device Apple Intelligence vs the cloud fallback), or null if
 * every applicable path failed. Caller should fall back to literal
 * concat when null.
 */
export async function synthesizeMerge(
  source: MergeInput,
  target: MergeInput,
  extraHeaders: Record<string, string> = {}
): Promise<SynthesizedMergeResult | null> {
  if (!isCapacitor()) {
    // Web and native Mac do not use the Capacitor model path. The shared
    // transport selects hosted generation for web and the native engine on Mac.
    const cloud = await tryCloudFallback(source, target, extraHeaders);
    return cloud;
  }

  const onDevice = await tryFoundationModels(source, target);
  if (onDevice) return { synth: onDevice, viaOnDevice: true };

  // iOS is Apple-Intelligence-only — if FM didn't synthesize, fall
  // back to the caller's literal-concat (returning null). No cloud.
  if (isIos()) return null;

  const cloud = await tryCloudFallback(source, target, extraHeaders);
  if (cloud) return cloud;

  return null;
}
