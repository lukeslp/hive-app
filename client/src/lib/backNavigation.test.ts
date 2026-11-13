// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACK_PRIORITY,
  handleBack,
  registerBackHandler,
} from "@/lib/backNavigation";

const cleanups: Array<() => void> = [];
const register = (priority: number, handler: () => boolean) => {
  cleanups.push(registerBackHandler(priority, handler));
};

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.innerHTML = "";
});

function openDialog() {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-state", "open");
  document.body.appendChild(dialog);
  const onEscape = vi.fn();
  // Radix listens for Escape on the document in the capture phase.
  const listener = (event: KeyboardEvent) => {
    if (event.key === "Escape") onEscape();
  };
  document.addEventListener("keydown", listener, { capture: true });
  cleanups.push(() =>
    document.removeEventListener("keydown", listener, { capture: true })
  );
  return onEscape;
}

describe("handleBack", () => {
  it("reports false when nothing is open, so the app can be minimized", () => {
    expect(handleBack()).toBe(false);
  });

  it("closes the most recently opened layer of the highest priority", () => {
    const calls: string[] = [];
    register(BACK_PRIORITY.toolbar, () => (calls.push("toolbar"), true));
    register(BACK_PRIORITY.prompt, () => (calls.push("first prompt"), true));
    register(BACK_PRIORITY.prompt, () => (calls.push("second prompt"), true));
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(["second prompt"]);
  });

  it("closes an open dialog before the toolbar or the detail panel", () => {
    const toolbar = vi.fn(() => true);
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);
    cleanups.push(() => window.removeEventListener("keydown", windowEscape));
    register(BACK_PRIORITY.toolbar, toolbar);
    const onEscape = openDialog();

    expect(handleBack()).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(toolbar).not.toHaveBeenCalled();
    // The toolbar listens for Escape on window; it must not close as well.
    expect(windowEscape).not.toHaveBeenCalled();
  });

  it("lets the prompt close before a dialog underneath it", () => {
    const prompt = vi.fn(() => true);
    register(BACK_PRIORITY.prompt, prompt);
    const onEscape = openDialog();
    expect(handleBack()).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("moves on when a layer has nothing to close", () => {
    const panel = vi.fn(() => true);
    register(BACK_PRIORITY.toolbar, () => false);
    register(BACK_PRIORITY.panel, panel);
    expect(handleBack()).toBe(true);
    expect(panel).toHaveBeenCalledTimes(1);
  });

  it("forgets a layer once it is unregistered", () => {
    const handler = vi.fn(() => true);
    const unregister = registerBackHandler(BACK_PRIORITY.panel, handler);
    unregister();
    expect(handleBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
