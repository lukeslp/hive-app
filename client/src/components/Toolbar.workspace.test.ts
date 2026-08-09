// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "@/components/Toolbar";

afterEach(cleanup);

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof Toolbar>> = {}
) {
  const props: React.ComponentProps<typeof Toolbar> = {
    nodeCount: 1,
    generationsThisSession: 0,
    canUndo: false,
    canRedo: false,
    isSearchOpen: false,
    searchQuery: "",
    searchResults: [],
    currentSearchIndex: 0,
    searchInputRef: React.createRef<HTMLInputElement>(),
    showOnlyKeyThemes: false,
    filterType: null,
    onShowWelcome: vi.fn(),
    onExportPNG: vi.fn(),
    onExportJPG: vi.fn(),
    onExportSVG: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onToggleSearch: vi.fn(),
    onSearchChange: vi.fn(),
    onCycleSearch: vi.fn(),
    onCloseSearch: vi.fn(),
    onToggleKeyThemes: vi.fn(),
    onShowSessions: vi.fn(),
    workspaceMode: "tiles",
    rindModeAvailable: true,
    onWorkspaceModeChange: vi.fn(),
    onExportSession: vi.fn(),
    onImportSession: vi.fn(),
    onShowSettings: vi.fn(),
    onSetFilterType: vi.fn(),
    ...overrides,
  };
  render(React.createElement(Toolbar, props));
  fireEvent.click(screen.getByRole("button", { name: "Open board controls" }));
  return props;
}

describe("Toolbar workspace switch", () => {
  it("opens Rind on supported native Mac builds", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("radio", { name: "Rind" }));
    expect(props.onWorkspaceModeChange).toHaveBeenCalledWith("sphere");
  });

  it("offers a return to Tiles while Rind is active", () => {
    const props = renderToolbar({ workspaceMode: "sphere" });
    fireEvent.click(screen.getByRole("radio", { name: "Tiles" }));
    expect(props.onWorkspaceModeChange).toHaveBeenCalledWith("tiles");
  });

  it("does not expose the workspace switch outside native macOS", () => {
    renderToolbar({ rindModeAvailable: false });
    expect(screen.queryByRole("radiogroup", { name: "Workspace mode" })).toBe(
      null
    );
  });

  it("exposes the current workspace without opening Files and sharing", () => {
    renderToolbar({ workspaceMode: "sphere" });
    expect(
      screen.getByRole("radio", { name: "Rind" }).getAttribute("aria-checked")
    ).toBe("true");
  });
});
