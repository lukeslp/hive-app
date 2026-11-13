// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportDialog } from "@/components/ReportDialog";
import { handleBack } from "@/lib/backNavigation";
import { REPORT_EMAIL } from "@/lib/contentReport";

afterEach(cleanup);

function renderDialog(overrides: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    kind: "tile" as const,
    title: "Membership Model",
    body: "Charge every member $500 a week.",
    onClose: vi.fn(),
    onReported: vi.fn(),
    openLink: vi.fn(),
    ...overrides,
  };
  render(React.createElement(ReportDialog, props));
  return props;
}

describe("ReportDialog", () => {
  it("will not send without a reason", () => {
    const props = renderDialog();
    const send = screen.getByRole("button", { name: "Send report" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(send);
    expect(props.openLink).not.toHaveBeenCalled();
    expect(props.onReported).not.toHaveBeenCalled();
  });

  it("says where the report goes before anything is sent", () => {
    renderDialog();
    expect(
      screen.getByText(/Nothing is sent until you send that email/)
    ).toBeTruthy();
    expect(screen.getByText(new RegExp(REPORT_EMAIL))).toBeTruthy();
  });

  it("hands a prefilled email to the email app and confirms", () => {
    const props = renderDialog();
    fireEvent.click(screen.getByLabelText("False or misleading"));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "The fee is wrong." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(props.openLink).toHaveBeenCalledTimes(1);
    const link = decodeURIComponent(props.openLink.mock.calls[0][0]);
    expect(link.startsWith(`mailto:${REPORT_EMAIL}?subject=`)).toBe(true);
    expect(link).toContain("Reason: False or misleading");
    expect(link).toContain("Note: The fee is wrong.");
    expect(link).toContain("Membership Model");
    expect(link).toContain("Charge every member $500 a week.");
    expect(props.onReported).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Finish in your email app")).toBeTruthy();
    expect(screen.getByText(/now hidden on this device/)).toBeTruthy();
  });

  it("offers Copy report for a device with no email app", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderDialog({ kind: "artifact", title: "Brief" });
    fireEvent.click(screen.getByLabelText("Something else"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy report" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.startsWith(`To: ${REPORT_EMAIL}\n\n`)).toBe(true);
    expect(copied).toContain("Reported artifact:");
  });

  it("closes on Android Back", () => {
    const props = renderDialog();
    // Radix closes the dialog when Escape reaches it; handleBack sends one.
    expect(handleBack()).toBe(true);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("starts from an empty form when opened again", () => {
    const props = renderDialog();
    fireEvent.click(screen.getByLabelText("Sexual content"));
    cleanup();
    renderDialog({ ...props, isOpen: true });
    expect(
      (screen.getByLabelText("Sexual content") as HTMLInputElement).checked
    ).toBe(false);
  });
});
