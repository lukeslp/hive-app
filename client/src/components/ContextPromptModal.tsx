/**
 * ContextPromptModal - Transparent, minimalist fullscreen input overlay
 *
 * Design philosophy: dimmed backdrop with a single clean text entry bar.
 * The first-click variant shows "What are you thinking?" as a gentle prompt.
 * Subsequent prompts show the contextual question.
 *
 * Features:
 * - Frosted glass backdrop that lets the canvas show through
 * - Minimal UI: just a heading and an input bar
 * - Skip (expand without context) and Cancel (dismiss) via keyboard or subtle buttons
 * - Tap/click anywhere outside the input area to dismiss
 * - Enter to submit, Escape to cancel
 */

import { useRef, useEffect, useCallback } from "react";
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
}: ContextPromptModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the animation has started
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

        {/* Input bar */}
        <div className="relative group">
          <input
            ref={inputRef}
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
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
