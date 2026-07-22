/**
 * File Purpose: Type the Capacitor bridge to Android LiteRT-LM Gemma.
 * Primary Components: Model status/download and verified local generation APIs.
 * I/O: Sends prompts to Android; returns model state, download state, or text.
 */

import { registerPlugin } from "@capacitor/core";

export interface GemmaGenerateOptions {
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export interface GemmaPlugin {
  /** Download and checksum-verify the configured Gemma 3n model. */
  downloadModel(): Promise<GemmaDownloadResult>;

  /** Check if the expected model is verified in private, no-backup storage. */
  isModelReady(): Promise<GemmaModelStatus>;

  /** Run inference and return the full response text. */
  generate(opts: GemmaGenerateOptions): Promise<{ text: string }>;
}

export interface GemmaModelStatus {
  ready: boolean;
  verified: boolean;
  model: string;
  downloadAvailable: boolean;
  cloudFallback: boolean;
  reason?: string;
}

export interface GemmaDownloadResult {
  success: boolean;
  verified: boolean;
  model?: string;
  cloudFallback?: boolean;
  reason?: string;
}

export const Gemma = registerPlugin<GemmaPlugin>("GemmaPlugin");
