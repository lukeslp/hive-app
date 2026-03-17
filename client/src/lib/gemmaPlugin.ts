/**
 * Capacitor bridge to native GemmaPlugin (Kotlin/MediaPipe).
 * On web, these methods are no-ops that throw — guarded by isCapacitor().
 */

import { registerPlugin } from "@capacitor/core";

export interface GemmaGenerateOptions {
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export interface GemmaPlugin {
  /** Download the Gemma 3n E4B model to device storage. */
  downloadModel(): Promise<{ success: boolean }>;

  /** Check if the model file is present locally. */
  isModelReady(): Promise<{ ready: boolean }>;

  /** Run inference and return the full response text. */
  generate(opts: GemmaGenerateOptions): Promise<{ text: string }>;
}

export const Gemma = registerPlugin<GemmaPlugin>("GemmaPlugin");
