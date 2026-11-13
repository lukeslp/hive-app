/**
 * File Purpose: Say, in plain words, where generation runs on this Android
 *   device and what is sent to the server.
 * Primary Components: androidGenerationNote (Settings), androidServerNotice
 *   (shown where the text is typed), ARTIFACT_SERVER_NOTICE.
 * I/O: Reads the AICore status object; returns sentences.
 *
 * Every sentence here has to stay true of the build. The only on-device
 * path is Gemini Nano through Android AICore; the bundled Gemma runtime was
 * removed because no build could install a model for it. Artifact Studio is
 * called out because it uses the server even when an on-device model is
 * ready.
 */

import type { AICoreStatus } from "@/lib/aicorePlugin";

type AICore = Pick<AICoreStatus, "available" | "reason"> | null | undefined;

const ARTIFACT_SENTENCE = "Artifact Studio always uses the server.";

/** True when a tile request can be answered on the device. */
export function androidLocalModelReady(aicore: AICore): boolean {
  return aicore?.available === true;
}

/** The status paragraph in Settings. */
export function androidGenerationNote(aicore: AICore): string {
  if (aicore?.available) {
    return `Gemini Nano is ready through Android AICore, so tiles are written on this device. If it cannot answer, the request goes to the Idea Tiles server. ${ARTIFACT_SENTENCE}`;
  }
  const reason = aicore?.reason || "No on-device model is ready.";
  return `${reason} The text you type and the text of nearby tiles go to the Idea Tiles server at ideatiles.app, which passes them to a hosted language model. ${ARTIFACT_SENTENCE}`;
}

/**
 * One sentence for the place where the text is typed. Undefined when the
 * request will be answered on the device.
 */
export function androidServerNotice(aicore: AICore): string | undefined {
  if (androidLocalModelReady(aicore)) return undefined;
  return "No on-device model is ready on this device. Your text is sent to the Idea Tiles server to write the tiles. Details are in Settings.";
}

/** Artifact Studio confirmation step, on every client that uses the server. */
export const ARTIFACT_SERVER_NOTICE =
  "Generating sends the text of the included tiles and your instructions to the Idea Tiles server, which passes them to a hosted language model. Nothing is sent until you choose Generate artifact.";
