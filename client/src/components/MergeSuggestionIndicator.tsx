/**
 * MergeSuggestionIndicator - Shows merge suggestions as floating indicators on the canvas
 *
 * Renders a subtle pulsing indicator at the midpoint between two clusters,
 * with a tooltip showing the suggestion reason and action buttons.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ArrowRight } from "@/lib/icons";
import { haptics } from "@/lib/haptics";
import type { MergeSuggestion } from "@/hooks/useMergeSuggestions";
import type { ViewState } from "@/types/hivemind";

interface MergeSuggestionIndicatorProps {
  suggestions: MergeSuggestion[];
  viewState: ViewState;
  onConnect: (suggestion: MergeSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const MergeSuggestionIndicator = ({
  suggestions,
  viewState,
  onConnect,
  onDismiss,
}: MergeSuggestionIndicatorProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  return (
    <>
      {suggestions.map(suggestion => {
        const screenX = suggestion.midpoint.x * viewState.zoom + viewState.x;
        const screenY = suggestion.midpoint.y * viewState.zoom + viewState.y;
        const isExpanded = expandedId === suggestion.id;

        return (
          <div
            key={suggestion.id}
            className="absolute pointer-events-auto"
            style={{
              left: screenX,
              top: screenY,
              transform: "translate(-50%, -50%)",
              zIndex: 40,
            }}
          >
            {/* Pulsing dot indicator */}
            {!isExpanded && (
              <button
                onClick={() => {
                  haptics.tap();
                  setExpandedId(suggestion.id);
                }}
                className="relative group cursor-pointer"
                title="Merge suggestion"
              >
                {/* Outer pulse ring */}
                <div className="absolute inset-0 -m-3 rounded-full bg-amber-400/20 animate-ping" />
                <div className="absolute inset-0 -m-2 rounded-full bg-amber-400/10" />
                {/* Inner dot */}
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30 border border-amber-300/50 flex items-center justify-center">
                  <ArrowRight className="w-2.5 h-2.5 text-white" />
                </div>
                {/* Hover label */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 backdrop-blur-sm text-amber-200 text-xs px-2 py-1 rounded-md border border-amber-500/20">
                  Connection found
                </div>
              </button>
            )}

            {/* Expanded suggestion card */}
            {isExpanded && (
              <div className="bg-black/85 backdrop-blur-md border border-amber-500/30 rounded-xl p-3 shadow-xl shadow-amber-500/10 min-w-[220px] max-w-[280px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-amber-300 uppercase tracking-wider">
                    Connection
                  </span>
                  <button
                    onClick={() => {
                      setExpandedId(null);
                      haptics.tap();
                    }}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Node pair */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 bg-white/5 rounded-lg px-2 py-1.5">
                    <p className="text-xs text-foreground font-medium truncate">
                      {suggestion.nodeA.text}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="flex-1 bg-white/5 rounded-lg px-2 py-1.5">
                    <p className="text-xs text-foreground font-medium truncate">
                      {suggestion.nodeB.text}
                    </p>
                  </div>
                </div>

                {/* Reason */}
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  {suggestion.reason}
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      haptics.success();
                      onConnect(suggestion);
                      setExpandedId(null);
                    }}
                    className="flex-1 h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    Connect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      haptics.tap();
                      onDismiss(suggestion.id);
                      setExpandedId(null);
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
