/**
 * ContextPromptModal - Transparent, minimalist fullscreen input overlay
 *
 * Design philosophy: dimmed backdrop with a single clean text entry bar.
 * The first-click variant shows "What are you thinking?" as a gentle prompt.
 * Subsequent prompts show the contextual question.
 *
 * Features:
 * - Frosted glass backdrop that lets the canvas show through
 * - Minimal UI: heading, optional suggestion chips, input bar
 * - Suggestion chips POPULATE the textbox on tap (don't submit). User can
 *   edit before pressing Enter. Editing the textbox clears chip selection.
 * - Skip (expand without context) and Cancel (dismiss) via keyboard or subtle buttons
 * - Tap/click anywhere outside the input area to dismiss
 * - Enter to submit, Escape to cancel
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Sparkles, Zap, X } from "@/lib/icons";
import { haptics } from "@/lib/haptics";

interface ContextPromptModalProps {
  isOpen: boolean;
  question: string;
  response: string;
  setResponse: (value: string) => void;
  onGenerate: () => void;
  onSkip: () => void;
  onClose: () => void;
  /** Optional variant for first-click onboarding style */
  variant?: "onboarding" | "context";
  /**
   * 0–5 suggested answers shown as tappable chips above the textbox.
   * Tapping a chip POPULATES the textbox with the chip's text — user can
   * then edit before submitting. If undefined or empty, no chips render.
   */
  suggestedAnswers?: string[];
}

export const ContextPromptModal = ({
  isOpen,
  question,
  response,
  setResponse,
  onGenerate,
  onSkip,
  onClose,
  variant = "context",
  suggestedAnswers,
}: ContextPromptModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the animation has started
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
    // Modal closed — reset chip selection so re-opening starts fresh.
    setSelectedChip(null);
  }, [isOpen]);

  // Clear chip selection when the textbox no longer matches the picked chip.
  // Lets the user tap "Weight loss" then edit to "Weight loss but slowly"
  // without leaving a stale highlight.
  useEffect(() => {
    if (selectedChip && response !== selectedChip) {
      setSelectedChip(null);
    }
  }, [response, selectedChip]);

  const handleChipTap = useCallback(
    (chip: string) => {
      haptics.tap();
      setResponse(chip);
      setSelectedChip(chip);
      // Move cursor to end so the user can append/edit naturally.
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(chip.length, chip.length);
        }
      });
    },
    [setResponse]
  );

  const hasChips = !!(suggestedAnswers && suggestedAnswers.length > 0);

  // Dismiss when clicking outside the content area
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // If the click/tap landed inside the content area, ignore it
      if (contentRef.current?.contains(e.target as Node)) return;
      haptics.tap();
      onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  const isOnboarding = variant === "onboarding";
  const heading = isOnboarding ? "What are you thinking?" : question;
  const placeholder = isOnboarding
    ? "Type an idea, question, or topic..."
    : "Add context to guide the expansion...";

  const handleSubmit = () => {
    if (response.trim()) {
      haptics.tap();
      onGenerate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && response.trim()) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      haptics.tap();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      onTouchEnd={handleBackdropClick}
      // Keyboard-aware padding: --kb-h is set by the visualViewport
      // listener in index.html. When iOS's keyboard slides up, the flex
      // container's effective height shrinks by the keyboard height, so
      // items-center re-centers the prompt in the remaining viewport
      // (above the keyboard) instead of behind it. 0 on web/desktop.
      style={{ paddingBottom: "var(--kb-h, 0px)" }}
    >
      {/* Dimmed frosted backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none" />

      {/* Content — centered, minimal */}
      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-xl px-6 animate-in slide-in-from-bottom-4 fade-in duration-300"
      >
        {/* Heading */}
        <h2
          className={`text-center mb-6 font-light tracking-wide ${
            isOnboarding
              ? "text-white/70 text-2xl sm:text-3xl"
              : "text-white/60 text-lg sm:text-xl"
          }`}
        >
          {heading}
        </h2>

        {/* Suggestion chips (when LLM provided likely answers) */}
        {hasChips && (
          <div
            className="flex flex-wrap justify-center gap-2 mb-4"
            role="group"
            aria-label="Suggested answers — tap to use as a starting point, then edit"
          >
            {suggestedAnswers!.map((chip) => {
              const isSelected = selectedChip === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipTap(chip)}
                  className={`px-3 py-1.5 rounded-full text-sm font-light
                              transition-all duration-150 backdrop-blur-md
                              ${isSelected
                                ? "bg-purple-500/70 text-white border border-purple-400/60"
                                : "bg-white/[0.06] text-white/75 border border-white/[0.12] hover:bg-white/[0.1] hover:border-white/[0.2]"}`}
                  aria-pressed={isSelected}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}

        {/* Input bar */}
        <div className="relative group">
          <input
            ref={inputRef}
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasChips ? "Or type your own answer..." : placeholder}
            className="w-full px-5 py-4 bg-white/[0.08] border border-white/[0.12] rounded-2xl
                       text-white/90 text-base sm:text-lg placeholder:text-white/25
                       focus:outline-none focus:border-white/25 focus:bg-white/[0.1]
                       transition-all duration-200 backdrop-blur-md"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {/* Submit button — appears when there's text */}
          <button
            onClick={handleSubmit}
            disabled={!response.trim()}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl
                       transition-all duration-200 ${
              response.trim()
                ? "bg-purple-500/80 text-white hover:bg-purple-500 scale-100"
                : "bg-white/5 text-white/20 scale-95 pointer-events-none"
            }`}
            aria-label="Generate"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Subtle action hints */}
        <div className="flex items-center justify-center gap-4 mt-4">
          {!isOnboarding && (
            <button
              onClick={() => { haptics.tap(); onSkip(); }}
              className="flex items-center gap-1.5 text-white/25 text-xs font-light
                         hover:text-white/40 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Skip
            </button>
          )}
          <button
            onClick={() => { haptics.tap(); onClose(); }}
            className="flex items-center gap-1.5 text-white/25 text-xs font-light
                       hover:text-white/40 transition-colors"
          >
            <X className="w-3 h-3" />
            {isOnboarding ? "Dismiss" : "Cancel"}
          </button>
          <span className="text-white/15 text-xs font-light">
            Enter to submit · Esc to close
          </span>
        </div>
      </div>
    </div>
  );
};
