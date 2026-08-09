// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLaunchDialog } from "@/components/WorkspaceLaunchDialog";

afterEach(cleanup);

describe("WorkspaceLaunchDialog", () => {
  it("explains that both choices share one board and opens Rind", () => {
    const onChoose = vi.fn();
    render(
      React.createElement(WorkspaceLaunchDialog, {
        isOpen: true,
        onChoose,
        onDismiss: vi.fn(),
      })
    );

    expect(screen.getByText(/two views of the same board/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Rind.*Explore/i }));
    expect(onChoose).toHaveBeenCalledWith("sphere");
  });

  it("can be dismissed without trapping the launch path", () => {
    const onDismiss = vi.fn();
    render(
      React.createElement(WorkspaceLaunchDialog, {
        isOpen: true,
        onChoose: vi.fn(),
        onDismiss,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
