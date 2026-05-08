/**
 * Async helper: synthesize two hex tiles into one new tile via LLM.
 *
 * Gated on isCapacitor() — web users at hivemind.cx never call this and
 * keep getting the existing string-concat behavior. iOS Capacitor builds
 * try in this order:
 *
 *   1. Apple Foundation Models (on-device, iOS 26+ with Apple Intelligence)
 *   2. Cloud /api/generate with a merge-specific system prompt (existing endpoint)
 *   3. Return null → caller falls back to literal "source + target" concat
 *
 * 1500 ms total time budget. If the chain doesn't produce a synthesis in
 * time, returns null and the caller's existing string-concat path runs.
 *
 * The prompt is lifted from geepers's /api/brainstorm/merge with the
 * explicit "not a literal X+Y concat" rule that hexpand currently violates.
 */

import { isCapacitor } from "./platform";
import { buildApiUrl } from "./api";
import { tryOnDeviceFirst } from "./foundationModelsPlugin";

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

const TIMEOUT_MS = 1500;

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
        if (typeof parsed?.title !== "string" || parsed.title.trim() === "") return null;
        const allowedTypes = ["concept", "action", "technical", "question", "risk"];
        const type = allowedTypes.includes(parsed?.type) ? parsed.type : "concept";
        return {
            title: parsed.title.trim(),
            description: typeof parsed.description === "string" ? parsed.description.trim() : "",
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
): Promise<MergeSynthesis | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const response = await fetch(buildApiUrl("generate"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...extraHeaders },
            body: JSON.stringify({
                contents: [{ parts: [{ text: buildUserPrompt(source, target) }] }],
                systemInstruction: { parts: [{ text: MERGE_SYSTEM_PROMPT }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.6,
                    maxOutputTokens: 256,
                },
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) return null;
        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        return parseSynthJson(text ?? "");
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
 * synthesis isn't applicable (web build) or both paths failed. Caller
 * should fall back to literal concat when null.
 */
export async function synthesizeMerge(
    source: MergeInput,
    target: MergeInput,
    extraHeaders: Record<string, string> = {}
): Promise<SynthesizedMergeResult | null> {
    if (!isCapacitor()) {
        return null; // Web: keep the existing literal-concat behavior.
    }

    const onDevice = await tryFoundationModels(source, target);
    if (onDevice) return { synth: onDevice, viaOnDevice: true };

    const cloud = await tryCloudFallback(source, target, extraHeaders);
    if (cloud) return { synth: cloud, viaOnDevice: false };

    return null;
}
