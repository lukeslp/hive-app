// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactStudio } from "@/components/ArtifactStudio";
import { createWebArtifactStudioServices } from "@/lib/webArtifactServices";
import type { NodeMap } from "@/types/hexmind";

const generateTextForCurrentPlatform = vi.fn();
vi.mock("@/lib/macGeneration", () => ({
  generateTextForCurrentPlatform: (...args: unknown[]) =>
    generateTextForCurrentPlatform(...args),
  subscribeToNativeWorkspaceImports: () => () => {},
}));

const nodes: NodeMap = {
  "0,0": {
    q: 0,
    r: 0,
    text: "Prototype launch",
    description: "Plan a careful release.",
    type: "root",
    depth: 0,
    parentId: null,
    pinned: true,
  },
};

const webServices = () =>
  createWebArtifactStudioServices({
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    getProvider: () => "gemini",
    save: vi.fn(async () => true),
    exportFile: vi.fn(async () => undefined),
  });

const renderStudio = (services?: ReturnType<typeof webServices>) =>
  render(
    React.createElement(ArtifactStudio, {
      isOpen: true,
      onClose: () => {},
      boardId: "board.test",
      nodes,
      services,
    })
  );

/** The Studio gates generation behind a review step. */
function startGeneration() {
  fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate artifact" }));
}

beforeEach(() => {
  generateTextForCurrentPlatform.mockReset();
});
afterEach(cleanup);

/**
 * The regression this guards is the whole point of the feature: before the web
 * services existed, web and Android got "Artifact generation is available in
 * the Idea Tiles Mac app" instead of an artifact. iOS intentionally does not
 * expose the Studio because its release contract prohibits hosted generation.
 * Unit-testing the services alone would not catch a supported platform that
 * never received them.
 */
describe("Artifact Studio without a Mac shell", () => {
  it("still refuses when no services are supplied at all", async () => {
    renderStudio(undefined);
    startGeneration();
    expect(await screen.findByText(/Idea Tiles Mac app/i)).toBeTruthy();
  });

  it("generates instead of showing the Mac-only message when given web services", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# Launch brief\n\nShip carefully.",
      provider: "gemini",
      viaNativeMac: false,
    });

    renderStudio(webServices());
    startGeneration();

    await waitFor(() =>
      expect(generateTextForCurrentPlatform).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByText(/Idea Tiles Mac app/i)).toBeNull();
    // Save and Export only exist once a manifest reached the result stage, so
    // their presence proves the artifact was built, not merely requested.
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("surfaces a generation failure as a message rather than a blank result", async () => {
    generateTextForCurrentPlatform.mockRejectedValue(
      new Error("Provider unavailable")
    );
    renderStudio(webServices());
    startGeneration();
    expect(await screen.findByText(/Provider unavailable/i)).toBeTruthy();
  });
});
