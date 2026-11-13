/**
 * File Purpose: Let a person report generated text: a tile or an artifact.
 * Primary Components: ReportDialog (reason form, email handoff, confirmation).
 * I/O: Takes the reported title and text; opens the system email app with a
 *   prefilled report and calls onReported so the caller can hide the text.
 *
 * The dialog stays mounted by its caller after onReported fires, so the
 * confirmation step is not lost when the reported text is hidden.
 */

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import {
  buildContentReport,
  REPORT_EMAIL,
  REPORT_LIMITS,
  REPORT_REASONS,
  reportClientLabel,
  reportMailto,
  reportText,
  type ContentReport,
  type ReportedKind,
  type ReportReasonId,
} from "@/lib/contentReport";
import { getPlatform, isNativeMac } from "@/lib/platform";

export interface ReportDialogProps {
  isOpen: boolean;
  kind: ReportedKind;
  title: string;
  body: string;
  onClose: () => void;
  /** Called once the report has been handed to the email app. */
  onReported: () => void;
  /** Injected in tests; the app opens the link in the system email app. */
  openLink?: (url: string) => void;
}

const NOUN: Record<ReportedKind, string> = {
  tile: "tile",
  artifact: "artifact",
};

export function ReportDialog({
  isOpen,
  kind,
  title,
  body,
  onClose,
  onReported,
  openLink = url => {
    window.location.href = url;
  },
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<ContentReport | null>(null);
  const [copied, setCopied] = useState(false);
  const noun = NOUN[kind];

  // Start from an empty form each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setReason(null);
    setNote("");
    setSent(null);
    setCopied(false);
  }, [isOpen]);

  const send = () => {
    if (!reason) return;
    const report = buildContentReport({
      kind,
      reason,
      note,
      title,
      body,
      client: reportClientLabel(isNativeMac() ? "mac" : getPlatform()),
    });
    openLink(reportMailto(report));
    setSent(report);
    onReported();
  };

  const copyReport = async (report: ContentReport) => {
    try {
      await navigator.clipboard.writeText(
        `To: ${REPORT_EMAIL}\n\n${reportText(report)}`
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={sent ? "Finish in your email app" : `Report this ${noun}`}
      description={
        sent
          ? `The report is ready as an email to ${REPORT_EMAIL}. Send it from your email app. The ${noun}'s text is now hidden on this device.`
          : `Say what is wrong with it. After you send the report, the ${noun}'s text is hidden on this device.`
      }
      maxWidth="max-w-md"
    >
      {sent ? (
        <div className="grid gap-4 p-1">
          <p className="text-sm text-muted-foreground">
            If no email app opened, copy the report and send it to that address
            yourself.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void copyReport(sent)}
            >
              {copied ? "Copied" : "Copy report"}
            </Button>
            <Button type="button" className="min-h-11" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4 p-1"
          onSubmit={event => {
            event.preventDefault();
            send();
          }}
        >
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Reason</legend>
            {REPORT_REASONS.map(row => (
              <label
                key={row.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-accent/50"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={row.id}
                  checked={reason === row.id}
                  onChange={() => setReason(row.id)}
                  className="h-5 w-5 accent-[var(--primary)]"
                />
                {row.label}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1.5 text-sm font-semibold">
            Note (optional)
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              maxLength={REPORT_LIMITS.note}
              rows={3}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-normal"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Sending opens your email app with a report addressed to{" "}
            {REPORT_EMAIL}. It contains this {noun}&apos;s text, your reason and
            your note. Nothing is sent until you send that email.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={!reason}>
              Send report
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
