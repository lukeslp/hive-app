/**
 * File Purpose: Type the Capacitor bridge to Android AICore through ML Kit Prompt API.
 * Primary Components: AICore availability, model download, cancellable generation APIs.
 * I/O: Sends prompts and request IDs to Android; receives model state, progress, or text.
 */

import { registerPlugin } from "@capacitor/core";

export interface AICoreStatus {
  state: "available" | "downloadable" | "downloading" | "unavailable" | "unknown";
  available: boolean;
  downloadable: boolean;
  downloading: boolean;
  model: string;
  reason?: string;
}

export interface AICorePlugin {
  getStatus(): Promise<AICoreStatus>;
  download(): Promise<AICoreStatus>;
  generate(options: AICoreGenerateOptions): Promise<{ text: string; requestId: string }>;
  cancel(options: { requestId: string }): Promise<{ cancelled: boolean }>;
}

export interface AICoreGenerateOptions {
  prompt: string;
  requestId: string;
}

export const AICore = registerPlugin<AICorePlugin>("AICorePlugin");
