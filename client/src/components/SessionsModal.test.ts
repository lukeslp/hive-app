// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsModal } from "./SessionsModal";
import { AUTOSAVE_KEY } from "@/lib/hexConstants";
import { parseWorkspaceTransport } from "@shared/workspaceDocument";

const legacy = {
  nodes: {
    "0,0": { q: 0, r: 0, text: "Garden", description: "", type: "root", depth: 0, parentId: null, pinned: true },
  },
  viewState: { x: 0, y: 0, zoom: 1 },
  creativity: 0.5,
  timestamp: 1700000000000,
};

function openModal(saved: unknown) {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saved));
  const recover = vi.fn();
  render(React.createElement(SessionsModal, {
    isOpen: true, onClose: vi.fn(), savedSessions: [], sessionName: "",
    setSessionName: vi.fn(), nodeCount: 0, onSave: vi.fn(), onLoad: vi.fn(),
    onLoadAutosave: recover, onDelete: vi.fn(),
  }));
  return recover;
}

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("React", React);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("autosave recovery", () => {
  it("offers recovery for the canonical envelope written by autosave", () => {
    const recover = openModal(parseWorkspaceTransport(legacy));
    fireEvent.click(screen.getByRole("button", { name: "Recover" }));
    expect(recover).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
  it("keeps legacy autosaves recoverable", () => {
    const recover = openModal(legacy);
    fireEvent.click(screen.getByRole("button", { name: "Recover" }));
    expect(recover).toHaveBeenCalledOnce();
  });
  it("does not offer recovery for invalid stored data", () => {
    openModal({ nodes: { broken: {} } });
    expect(screen.queryByRole("button", { name: "Recover" })).toBeNull();
  });
});
