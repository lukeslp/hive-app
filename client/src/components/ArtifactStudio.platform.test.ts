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

/**
 * What a phone must not be offered: an Apple-only recipe that can only fail,
 * and a sign-in button with no sign-in behind it. Both were visible in the
 * Android 1.3.3 build.
 */
describe("Artifact Studio options that depend on the host", () => {
  const renderWith = (props: Record<string, unknown>) =>
    render(
      React.createElement(ArtifactStudio, {
        isOpen: true,
        onClose: () => {},
        boardId: "board.test",
        nodes,
        services: webServices(),
        ...props,
      })
    );

  it("lists Image Playground artwork by default, as the Mac app expects", () => {
    renderWith({});
    expect(screen.getByText("Image Playground artwork")).toBeTruthy();
  });

  it("leaves image recipes out when the host cannot make images", () => {
    renderWith({ imageRecipesAvailable: false });
    expect(screen.queryByText("Image Playground artwork")).toBeNull();
    expect(screen.queryByText(/Apple Image Playground/)).toBeNull();
    // The rest of the Design group is still offered.
    expect(screen.getByText("SVG asset")).toBeTruthy();
  });

  it("says where the board text goes before generation is confirmed", () => {
    renderWith({ generationNotice: "Sends the tiles to the server." });
    expect(screen.queryByText("Sends the tiles to the server.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review generation" }));
    expect(screen.getByText("Sends the tiles to the server.")).toBeTruthy();
  });

  it("shows no sign-in button unless a sign-in handler is supplied", async () => {
    generateTextForCurrentPlatform.mockResolvedValue({
      text: "# Brief",
      provider: "gemini",
      viaNativeMac: false,
    });
    renderWith({});
    startGeneration();
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Sign in for cloud sync" })
    ).toBeNull();
  });
});
