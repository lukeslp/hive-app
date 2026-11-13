/**
 * File Purpose: Build a report about generated text and keep track of what
 *   the person has reported on this device.
 * Primary Components: REPORT_REASONS, buildContentReport, reportText,
 *   reportMailto, and the reported-tile store.
 * I/O: Takes the reported text and a reason; returns plain text and a mailto
 *   link. Reads and writes one localStorage entry.
 *
 * There is no report endpoint on the server, so a report is an email the
 * person sends from their own email app. Nothing leaves the device until
 * they send it. The report carries the reason, the note, the reported text
 * and the app version. It carries no device or account identifier.
 */

import { APP_DISPLAY_NAME, APP_VERSION } from "@shared/appBrand";

/** The contact address published in the Idea Tiles privacy policy. */
export const REPORT_EMAIL = "luke@lukesteuber.com";

export const REPORT_REASONS = [
  { id: "offensive", label: "Offensive or hateful" },
  { id: "sexual", label: "Sexual content" },
  { id: "dangerous", label: "Dangerous or harmful" },
  { id: "false", label: "False or misleading" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

export const REPORT_LIMITS = {
  note: 500,
  title: 300,
  /** An email link has to fit in an Android intent, so the quote is short. */
  body: 3000,
} as const;

export type ReportedKind = "tile" | "artifact";

export interface ContentReport {
  kind: ReportedKind;
  reason: ReportReasonId;
  note: string;
  title: string;
  body: string;
  /** Platform and app version, such as "android 1.3.3". */
  client: string;
}

export function reportReasonLabel(reason: string): string {
  return REPORT_REASONS.find(row => row.id === reason)?.label ?? reason;
}

function clip(text: string, limit: number): string {
  return text.length > limit
    ? `${text.slice(0, limit - 14)}\n[shortened]`
    : text;
}

export function reportClientLabel(platform: string): string {
  return `${platform} ${APP_VERSION}`.slice(0, 80);
}

export function buildContentReport(input: {
  kind: ReportedKind;
  reason: ReportReasonId;
  note: string;
  title: string;
  body: string;
  client: string;
}): ContentReport {
  return {
    kind: input.kind,
    reason: input.reason,
    note: input.note.trim().slice(0, REPORT_LIMITS.note),
    title: clip(input.title.trim(), REPORT_LIMITS.title),
    body: clip(input.body.trim(), REPORT_LIMITS.body),
    client: input.client,
  };
}

/** Plain text used for the email body and for Copy report. */
export function reportText(report: ContentReport): string {
  const what = report.kind === "tile" ? "tile" : "artifact";
  return [
    `Reason: ${reportReasonLabel(report.reason)}`,
    ...(report.note ? [`Note: ${report.note}`] : []),
    `App: ${report.client}`,
    "",
    `Reported ${what}:`,
    report.title || "(no title)",
    "",
    report.body || "(no text)",
  ].join("\n");
}

export function reportMailto(report: ContentReport): string {
  const what = report.kind === "tile" ? "tile" : "artifact";
  const subject = `${APP_DISPLAY_NAME} ${what} report: ${reportReasonLabel(report.reason)}`;
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportText(report))}`;
}

// ── Reported tiles ──────────────────────────────────────────────────────
//
// A reported tile's text is hidden on this device until the person chooses
// to show it. The record lives in localStorage, not in the board: the saved
// board format is strict and shared with the other clients, and "I reported
// this" is about this device, not about the board.
//
// A tile is identified by its position and its text, so a tile that is
// refreshed or edited into different text is shown again.

export const REPORTED_TILES_KEY = "hexpand_reported_tiles";
const MAX_REPORTED_TILES = 500;

export function reportedTileId(
  boardId: string,
  nodeKey: string,
  node: { text: string; description?: string }
): string {
  const text = `${node.text}\n${node.description ?? ""}`;
  // Small stable hash (djb2); this is an identity, not a secret.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${boardId}|${nodeKey}|${(hash >>> 0).toString(36)}`;
}

type TileStorage = Pick<Storage, "getItem" | "setItem">;

export function readReportedTiles(
  storage: TileStorage = localStorage
): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(REPORTED_TILES_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeReportedTiles(
  ids: string[],
  storage: TileStorage = localStorage
): string[] {
  const unique = Array.from(new Set(ids)).slice(-MAX_REPORTED_TILES);
  try {
    storage.setItem(REPORTED_TILES_KEY, JSON.stringify(unique));
  } catch {
    // Storage full or blocked: the tile stays hidden for this session only.
  }
  return unique;
}
