// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceModeControl } from "@/components/WorkspaceModeControl";

afterEach(cleanup);

describe("WorkspaceModeControl", () => {
  it("uses one keyboard tab stop and exposes the selected mode", () => {
    render(
      React.createElement(WorkspaceModeControl, {
        value: "tiles",
        onChange: vi.fn(),
      })
    );

    expect(
      screen.getByRole("radio", { name: "Tiles" }).getAttribute("tabindex")
    ).toBe("0");
    expect(
      screen.getByRole("radio", { name: "Rind" }).getAttribute("tabindex")
    ).toBe("-1");
  });

  it("switches with arrow keys and keeps the event inside the control", () => {
    const onChange = vi.fn();
    render(
      React.createElement(WorkspaceModeControl, {
        value: "tiles",
        onChange,
      })
    );

    const group = screen.getByRole("radiogroup", { name: "Workspace mode" });
    fireEvent.keyDown(group, { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith("sphere");
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Rind" })
    );
  });
});
