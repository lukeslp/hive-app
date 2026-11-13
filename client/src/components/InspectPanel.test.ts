// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectPanel } from "@/components/InspectPanel";
import type { HexNode } from "@/types/hivemind";

afterEach(cleanup);

const node = {
  q: 1,
  r: 0,
  text: "Membership Model",
  description: "Charge every member $500 a week.",
  type: "action",
  depth: 1,
  parentId: "0,0",
  pinned: false,
} as HexNode;

const renderPanel = (props: Record<string, unknown> = {}) =>
  render(
    React.createElement(InspectPanel, {
      node,
      nodeId: "1,0",
      isLoading: false,
      onClose: () => {},
      onEdit: () => {},
      onRefresh: () => {},
      onAddContextInfo: () => {},
      onToggleKeyTheme: () => {},
      ...props,
    })
  );

describe("InspectPanel reporting", () => {
  it("offers Report on a generated tile", () => {
    const onReport = vi.fn();
    renderPanel({ onReport });
    fireEvent.click(screen.getByRole("button", { name: "Report this tile" }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("has no Report control when the caller gives none", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: "Report this tile" })
    ).toBeNull();
  });

  it("hides a reported tile's text and can show it again", () => {
    const onShowText = vi.fn();
    renderPanel({ onReport: () => {}, isTextHidden: true, onShowText });
    expect(screen.queryByText("Membership Model")).toBeNull();
    expect(screen.queryByText(/Charge every member/)).toBeNull();
    expect(screen.getByText("Reported tile")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Report this tile" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show text" }));
    expect(onShowText).toHaveBeenCalledTimes(1);
  });
});
