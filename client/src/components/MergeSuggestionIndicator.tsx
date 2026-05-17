/**
 * MergeSuggestionIndicator - Shows merge suggestions as floating indicators on the canvas
 *
 * Renders a subtle pulsing indicator at the midpoint between two clusters,
 * with a tooltip showing the suggestion reason and action buttons.
 *
 * Positioning convention (IMPORTANT — see HexmindApp.tsx for the canvas layout):
 *   This component MUST be rendered as a child of the `#hex-canvas-layer` div,
 *   inside the transform layer that applies
 *     `translate(viewState.x, viewState.y) scale(viewState.zoom)`.
 *   Each indicator is positioned with raw world (hex-pixel) coordinates
 *   `left: midpoint.x, top: midpoint.y` so the canvas transform handles
 *   world→screen mapping automatically (matching how `HexCanvas` positions
 *   nodes). The counter-scale `scale(1 / viewState.zoom)` keeps the popup
 *   at a fixed visual size regardless of how zoomed-in the canvas is.
 *
 *   Do NOT render this component outside the canvas transform layer and try
 *   to do `midpoint.x * zoom + viewState.x` math manually — the canvas world
 *   origin is the *center* of `<main>` (see `getNodeScreenPosition` in
 *   HexmindApp.tsx), not the top-left of the page, so that approach silently
 *   off-positions the popup by `mainWidth/2, mainHeight/2 + toolbarHeight`.
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

  // Avoid division by zero / tiny zooms blowing up the counter-scale.
  const inverseZoom = 1 / Math.max(viewState.zoom, 0.05);

  return (
    <>
      {suggestions.map(suggestion => {
        const isExpanded = expandedId === suggestion.id;

        return (
          <div
            key={suggestion.id}
            // Wrapper is pointer-events-none so its bounding box (which the
            // pulse rings and hover label inflate well beyond the visible 16px
            // dot) does NOT block tile drag-and-drop on the canvas underneath.
            // Only the visible interactive children opt back in with
            // `pointer-events-auto` below.
            className="absolute pointer-events-none"
            style={{
              // World coordinates — the parent transform layer maps them to
              // screen coordinates. See positioning convention in the file header.
              left: suggestion.midpoint.x,
              top: suggestion.midpoint.y,
              transform: `translate(-50%, -50%) scale(${inverseZoom})`,
              transformOrigin: "center",
              // Above hovered (40) and selected (50) hex tiles, so clicks on
              // the dot/card don't route to a tile sitting beneath.
              zIndex: 60,
            }}
          >
            {/* Pulsing dot indicator */}
            {!isExpanded && (
              <button
                onClick={() => {
                  haptics.tap();
                  setExpandedId(suggestion.id);
                }}
                // `pointer-events-auto` makes only the 16px dot clickable;
                // `interactive-ui` keeps canvas pan/empty-click handlers from
                // firing when the user taps it (see useCanvasInteraction.ts).
                className="relative group cursor-pointer pointer-events-auto interactive-ui"
                title="Merge suggestion"
              >
                {/* Outer pulse rings — purely decorative, must not catch
                    pointer events or they'd block tile drag in a ~40px halo
                    around the dot. */}
                <div className="absolute inset-0 -m-3 rounded-full bg-amber-400/20 animate-ping pointer-events-none" />
                <div className="absolute inset-0 -m-2 rounded-full bg-amber-400/10 pointer-events-none" />
                {/* Inner dot */}
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30 border border-amber-300/50 flex items-center justify-center">
                  <ArrowRight className="w-2.5 h-2.5 text-white" />
                </div>
                {/* Hover label — also decorative; even at opacity-0 it would
                    sit ~32px above the dot and silently block tile drag. */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 backdrop-blur-sm text-amber-200 text-xs px-2 py-1 rounded-md border border-amber-500/20 pointer-events-none">
                  Connection found
                </div>
              </button>
            )}

            {/* Expanded suggestion card */}
            {isExpanded && (
              <div className="bg-black/85 backdrop-blur-md border border-amber-500/30 rounded-xl p-3 shadow-xl shadow-amber-500/10 min-w-[220px] max-w-[280px] pointer-events-auto interactive-ui">
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
