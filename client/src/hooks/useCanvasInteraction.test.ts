/**
 * Tests for touch discrimination logic in useCanvasInteraction
 *
 * Since the hook uses React state, we test the discrimination constants
 * and logic patterns directly. The key invariants:
 * - TAP_DISTANCE_THRESHOLD = 12px — finger drift below this counts as tap
 * - TAP_MAX_DURATION = 350ms — touches longer than this are pans
 * - Pinch-zoom (2+ fingers) should never trigger tap
 */

import { describe, it, expect } from "vitest";

// Extract the constants we're testing against
const TAP_DISTANCE_THRESHOLD = 12;
const TAP_MAX_DURATION = 350;

/**
 * Pure function that mirrors the tap detection logic in handleTouchEnd.
 * This lets us test the discrimination without React rendering.
 */
function isTap(params: {
  wasPinching: boolean;
  hasTouchStart: boolean;
  maxDrift: number;
  duration: number;
}): boolean {
  return (
    !params.wasPinching &&
    params.hasTouchStart &&
    params.maxDrift < TAP_DISTANCE_THRESHOLD &&
    params.duration < TAP_MAX_DURATION
  );
}

function computeDrift(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): number {
  const dx = currentX - startX;
  const dy = currentY - startY;
  return Math.sqrt(dx * dx + dy * dy);
}

describe("Touch discrimination — tap vs pan", () => {
  it("quick stationary touch is a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: 0,
        duration: 50,
      })
    ).toBe(true);
  });

  it("small drift within threshold is still a tap", () => {
    const drift = computeDrift(500, 400, 503, 404);
    expect(drift).toBeLessThan(TAP_DISTANCE_THRESHOLD);
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: drift,
        duration: 80,
      })
    ).toBe(true);
  });

  it("drift exactly at threshold is NOT a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: TAP_DISTANCE_THRESHOLD,
        duration: 50,
      })
    ).toBe(false);
  });

  it("large finger movement is NOT a tap (panning)", () => {
    const drift = computeDrift(500, 400, 530, 400);
    expect(drift).toBeGreaterThan(TAP_DISTANCE_THRESHOLD);
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: drift,
        duration: 100,
      })
    ).toBe(false);
  });

  it("long-duration touch is NOT a tap (even if stationary)", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: 0,
        duration: 400,
      })
    ).toBe(false);
  });

  it("duration exactly at threshold is NOT a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: 0,
        duration: TAP_MAX_DURATION,
      })
    ).toBe(false);
  });

  it("pinch-zoom gesture is NOT a tap", () => {
    expect(
      isTap({
        wasPinching: true,
        hasTouchStart: true,
        maxDrift: 0,
        duration: 50,
      })
    ).toBe(false);
  });

  it("no touch start position means NOT a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: false,
        maxDrift: 0,
        duration: 50,
      })
    ).toBe(false);
  });

  it("drift computation is correct for diagonal movement", () => {
    // 3-4-5 triangle
    const drift = computeDrift(0, 0, 3, 4);
    expect(drift).toBe(5);
  });

  it("drift computation is correct for horizontal movement", () => {
    const drift = computeDrift(100, 200, 115, 200);
    expect(drift).toBe(15);
    expect(drift).toBeGreaterThan(TAP_DISTANCE_THRESHOLD);
  });

  it("drift computation is correct for zero movement", () => {
    const drift = computeDrift(500, 400, 500, 400);
    expect(drift).toBe(0);
  });

  it("borderline case: 11px drift + 300ms duration IS a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: 11,
        duration: 300,
      })
    ).toBe(true);
  });

  it("borderline case: 11px drift + 400ms duration is NOT a tap", () => {
    expect(
      isTap({
        wasPinching: false,
        hasTouchStart: true,
        maxDrift: 11,
        duration: 400,
      })
    ).toBe(false);
  });
});
