/**
 * OnboardingTour — Minimal, non-blocking onboarding
 *
 * Flow:
 * 1. "waiting" — Board is empty or has 1 node; no overlay, the hex tiles
 *    themselves serve as the entry point (context prompt on click).
 * 2. "tutorial" — Tutorial cards (only for first-time users).
 * 3. "done" — Hidden.
 *
 * CRITICAL: No phase blocks touch events on the canvas. The overlay uses
 * pointer-events: none except on interactive elements.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { TOUR_COMPLETED_KEY } from "@/lib/hexConstants";

interface OnboardingTourProps {
  showTutorial: boolean;
  onTutorialComplete: () => void;
  onStartBrainstorm: (idea: string) => void;
  onStartDualBrainstorm?: (idea1: string, idea2: string) => void;
  nodeCount: number;
  /**
   * True while a generation is in flight. The tour waits for
   * `nodeCount > 1 && !isGenerating` so the user sees a settled
   * canvas with all 6 neighbors before the dim + cards appear —
   * not a half-populated grid mid-generation.
   */
  isGenerating: boolean;
}

/** Detect touch-primary device */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function useOnboardingTour() {
  const [tutorialCompleted, setTutorialCompleted] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "1") {
      localStorage.removeItem(TOUR_COMPLETED_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState({}, "", url.toString());
      return false;
    }
    return !!localStorage.getItem(TOUR_COMPLETED_KEY);
  });

  const completeTutorial = useCallback(() => {
    localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    setTutorialCompleted(true);
  }, []);

  const resetTutorial = useCallback(() => {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    setTutorialCompleted(false);
  }, []);

  return {
    tourActive: !tutorialCompleted,
    completeTour: completeTutorial,
    resetTour: resetTutorial,
  };
}

/**
 * Each tutorial step optionally accepts a `media` URL — drop a short GIF
 * or muted-loop video into `client/public/tour/` named after the step
 * (e.g. `tap-expand.gif`) and the card will render it above the body
 * text. Missing media → text-only card, no broken-image placeholder.
 */
interface TutorialStep {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Path under client/public/. Renders <img> if .gif/.png, <video> if .mp4/.webm. */
  media?: string;
}

/** Render the optional media (gif/png → img, mp4/webm → autoplay loop video). */
function TutorialMedia({ src }: { src: string }) {
  const isVideo = /\.(mp4|webm|mov)$/i.test(src);
  if (isVideo) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="w-full rounded-lg mb-3 bg-black/40"
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full rounded-lg mb-3 bg-black/40"
      aria-hidden="true"
      onError={e => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// Tutorial step content — platform-aware text
function getTutorialSteps(isTouch: boolean): TutorialStep[] {
  const tap = isTouch ? "Tap" : "Click";
  const drag = isTouch ? "Long-press and drag" : "Drag";
  const doubleTap = isTouch ? "Double-tap" : "Double-click";
  const panAction = isTouch
    ? "Drag to pan, pinch to zoom"
    : "Drag to pan, scroll to zoom";

  return [
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ),
      title: `${tap} to expand`,
      body: `${tap} any hex to branch into related ideas. Each node spawns up to 6 neighbors.`,
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      ),
      title: "Combine tiles",
      body: `${drag} one hex onto another to merge them. The AI synthesizes both ideas into something new.`,
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="4" />
          <circle cx="18" cy="16" r="4" />
          <path d="M12 4h4" />
          <path d="M14 20h-4" />
        </svg>
      ),
      title: "Start new threads",
      body: `${doubleTap} empty space to plant a fresh idea anywhere \u2014 no need to connect everything.`,
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 9l2-2 2 2" />
          <path d="M15 15l2 2 2-2" />
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <path d="M12 2v20" />
          <path d="M2 12h20" />
        </svg>
      ),
      title: "Navigate freely",
      body: `${panAction}. Star key ideas to guide the AI. ${isTouch ? "" : "Press H for shortcuts."}`.trim(),
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
      title: "Smart expansion",
      body: `Some tiles are rich enough that the AI auto-expands them on its own — watch for the pulse animation. You can turn this off in Settings.`,
    },
  ];
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  showTutorial,
  onTutorialComplete,
  nodeCount,
  isGenerating,
}) => {
  /**
   * Phase machine:
   * "waiting"   — board is empty or has ≤1 node; no overlay shown
   * "tutorial"  — feature cards (first-time only)
   * "done"      — hidden
   */
  const [phase, setPhase] = useState<"waiting" | "tutorial" | "done">(
    nodeCount <= 1 ? "waiting" : "done"
  );
  const [fadeOut, setFadeOut] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [stepVisible, setStepVisible] = useState(false);

  const isTouch = useMemo(() => isTouchDevice(), []);
  const tutorialSteps = useMemo(() => getTutorialSteps(isTouch), [isTouch]);

  // When nodeCount drops to 0, reset to waiting
  useEffect(() => {
    if (nodeCount === 0 && phase === "done") {
      setPhase("waiting");
      setFadeOut(false);
      setTutorialStep(0);
      setStepVisible(false);
    }
  }, [nodeCount, phase]);

  // Defer the tutorial until the FIRST generation has fully settled —
  // not just "any neighbor exists" (nodeCount > 1) but "all 6 neighbors
  // are in AND no further generation is in flight." That gives the user
  // a populated, motionless canvas as the backdrop for the dim + cards
  // instead of a half-rendered grid mid-spinner.
  useEffect(() => {
    if (phase === "waiting" && nodeCount > 1 && !isGenerating) {
      if (showTutorial) {
        setPhase("tutorial");
      } else {
        setPhase("done");
      }
    }
  }, [phase, nodeCount, isGenerating, showTutorial]);

  // Animate tutorial step entrance
  useEffect(() => {
    if (phase === "tutorial") {
      setStepVisible(false);
      const timer = setTimeout(() => setStepVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [phase, tutorialStep]);

  const handleTutorialNext = useCallback(() => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(s => s + 1);
    } else {
      setFadeOut(true);
      setTimeout(() => {
        onTutorialComplete();
        setPhase("done");
      }, 500);
    }
  }, [tutorialStep, tutorialSteps.length, onTutorialComplete]);

  const handleTutorialSkip = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => {
      onTutorialComplete();
      setPhase("done");
    }, 500);
  }, [onTutorialComplete]);

  // Nothing to render in waiting or done phases
  if (phase === "done" || phase === "waiting") return null;

  const currentTutorial = tutorialSteps[tutorialStep];
  const isLastTutorial = tutorialStep === tutorialSteps.length - 1;

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{ pointerEvents: "none" }}
    >
      {/* Dimmed backdrop during the tutorial. pointer-events-auto so the
          user can't accidentally tap a hex underneath while reading; tap
          on the backdrop itself does nothing (no dismiss-on-backdrop —
          dismissal goes through Skip / Let's go). */}
      {phase === "tutorial" && (
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-500 ${
            stepVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ pointerEvents: "auto" }}
          aria-hidden="true"
        />
      )}

      {/* Tutorial phase: feature card centered. Was bottom-anchored when
          there was no backdrop dim and the canvas needed to stay visible
          through the card; now that we dim + blur the whole canvas, the
          card belongs at the focal centre of the screen. */}
      {phase === "tutorial" && currentTutorial && (
        <div
          className="absolute inset-0 flex items-center justify-center px-4"
          style={{ pointerEvents: "none" }}
        >
          <div
            className={`max-w-sm w-[90vw] transition-all duration-400 ${
              stepVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
            style={{ pointerEvents: "auto" }}
          >
            <div className="bg-zinc-900/85 backdrop-blur-lg rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden">
              {/* Optional media (GIF / muted video) above the text */}
              {currentTutorial.media && (
                <div className="px-5 pt-5">
                  <TutorialMedia src={currentTutorial.media} />
                </div>
              )}
              <div
                className={`px-5 pb-4 ${currentTutorial.media ? "pt-0" : "pt-5"}`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="text-amber-400/80 mt-0.5 flex-shrink-0">
                    {currentTutorial.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white/90 text-base font-medium mb-1.5">
                      {currentTutorial.title}
                    </h3>
                    <p className="text-white/45 text-sm font-light leading-relaxed">
                      {currentTutorial.body}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.04]">
                <div className="flex gap-1.5">
                  {tutorialSteps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === tutorialStep
                          ? "bg-amber-400/80 w-4"
                          : i < tutorialStep
                            ? "bg-amber-400/30 w-1.5"
                            : "bg-white/10 w-1.5"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {/* Skip is ALWAYS visible now (was step-0-only). The
                      tour shouldn't trap people who get the gist after
                      one card — they've already seen the gesture work
                      via the prompt → generate flow that ran moments ago. */}
                  <button
                    onClick={handleTutorialSkip}
                    className="text-white/25 text-xs font-light hover:text-white/40 transition-colors"
                  >
                    Skip rest
                  </button>
                  <button
                    onClick={handleTutorialNext}
                    className="text-amber-400/80 text-sm font-medium hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    {isLastTutorial ? "Let's go" : "Next"}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
