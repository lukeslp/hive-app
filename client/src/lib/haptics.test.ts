import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { haptics } from "./haptics";

describe("Haptics utility", () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tap() triggers a short vibration", () => {
    haptics.tap();
    expect(vibrateMock).toHaveBeenCalledWith(8);
  });

  it("medium() triggers a medium vibration", () => {
    haptics.medium();
    expect(vibrateMock).toHaveBeenCalledWith(20);
  });

  it("longPress() triggers a longer vibration", () => {
    haptics.longPress();
    expect(vibrateMock).toHaveBeenCalledWith(40);
  });

  it("success() triggers a patterned vibration", () => {
    haptics.success();
    expect(vibrateMock).toHaveBeenCalledWith([15, 40, 15]);
  });

  it("error() triggers a multi-pulse vibration", () => {
    haptics.error();
    expect(vibrateMock).toHaveBeenCalledWith([30, 20, 30, 20, 30]);
  });

  it("expand() triggers expansion vibration pattern", () => {
    haptics.expand();
    expect(vibrateMock).toHaveBeenCalledWith([10, 30, 10]);
  });

  it("dragHover() triggers a very light vibration", () => {
    haptics.dragHover();
    expect(vibrateMock).toHaveBeenCalledWith(5);
  });

  it("notify() triggers a notification vibration", () => {
    haptics.notify();
    expect(vibrateMock).toHaveBeenCalledWith(12);
  });

  it("does not throw when navigator.vibrate is undefined", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => haptics.tap()).not.toThrow();
    expect(() => haptics.success()).not.toThrow();
    expect(() => haptics.longPress()).not.toThrow();
  });
});
