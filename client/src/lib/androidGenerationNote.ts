/**
 * File Purpose: Say, in plain words, where generation runs on this Android
 *   phone and what is sent to the server.
 * Primary Components: androidGenerationNote (Settings), androidServerNotice
 *   (shown where the text is typed), ARTIFACT_SERVER_NOTICE.
 * I/O: Reads the AICore and Gemma status objects; returns sentences.
 *
 * Every sentence here has to stay true of the build: Gemma is named only
 * when this build can install or run it, and Artifact Studio is called out
 * because it uses the server even when an on-device model is ready.
 */

import type { AICoreStatus } from "@/lib/aicorePlugin";
import type { GemmaModelStatus } from "@/lib/gemmaPlugin";

type AICore = Pick<AICoreStatus, "available" | "reason"> | null | undefined;
type Gemma =
  | Pick<GemmaModelStatus, "ready" | "downloadAvailable" | "reason">
  | null
  | undefined;

const ARTIFACT_SENTENCE = "Artifact Studio always uses the server.";

/** True when a tile request can be answered on the phone. */
export function androidLocalModelReady(aicore: AICore, gemma: Gemma): boolean {
  return aicore?.available === true || gemma?.ready === true;
}

/** The status paragraph in Settings. */
export function androidGenerationNote(aicore: AICore, gemma: Gemma): string {
  const gemmaPossible =
    gemma?.ready === true || gemma?.downloadAvailable === true;
  if (aicore?.available) {
    return `Gemini Nano is ready through Android AICore, so tiles are written on this device. ${
      gemmaPossible
        ? "If it cannot answer, the app tries the verified Gemma model, then the Idea Tiles server."
        : "If it cannot answer, the request goes to the Idea Tiles server."
    } ${ARTIFACT_SENTENCE}`;
  }
  if (gemma?.ready) {
    return `The verified Gemma model is installed in private storage, so tiles are written on this device. If it cannot answer, the request goes to the Idea Tiles server. ${ARTIFACT_SENTENCE}`;
  }
  const reason =
    aicore?.reason || gemma?.reason || "No on-device model is ready.";
  return `${reason} The text you type and the text of nearby tiles go to the Idea Tiles server at ideatiles.app, which passes them to a hosted language model. ${ARTIFACT_SENTENCE}`;
}

/**
 * One sentence for the place where the text is typed. Undefined when the
 * request will be answered on the phone.
 */
export function androidServerNotice(
  aicore: AICore,
  gemma: Gemma
): string | undefined {
  if (androidLocalModelReady(aicore, gemma)) return undefined;
  return "No on-device model is ready on this device. Your text is sent to the Idea Tiles server to write the tiles. Details are in Settings.";
}

/** Artifact Studio confirmation step, on every client that uses the server. */
export const ARTIFACT_SERVER_NOTICE =
  "Generating sends the text of the included tiles and your instructions to the Idea Tiles server, which passes them to a hosted language model. Nothing is sent until you choose Generate artifact.";
