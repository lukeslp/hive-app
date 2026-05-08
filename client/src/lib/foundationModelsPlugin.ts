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
}

export const FoundationModels = registerPlugin<FoundationModelsPlugin>(
    "FoundationModels"
);
