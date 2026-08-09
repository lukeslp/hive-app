// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "@/components/Toolbar";

describe("Toolbar Artifact Studio entry", () => {
  it("opens Artifact Studio from the files experience", () => {
    const onShowArtifactStudio = vi.fn();
    render(
      React.createElement(Toolbar, {
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
        rindModeAvailable: false,
        onWorkspaceModeChange: vi.fn(),
        onExportSession: vi.fn(),
        onImportSession: vi.fn(),
        onShowArtifactStudio,
        onShowSettings: vi.fn(),
        onSetFilterType: vi.fn(),
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open board controls" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Files and sharing" }));
    fireEvent.click(screen.getByRole("button", { name: "Artifact Studio" }));

    expect(onShowArtifactStudio).toHaveBeenCalledTimes(1);
  });
});
