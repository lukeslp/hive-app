/**
 * FloatingActionBar - Contextual actions on node hover
 * Extracted from HiveMindApp.tsx monolith
 */

import { Loader2, RefreshCw, Sparkles } from "@/lib/icons";
import { NODE_TYPES } from "@/lib/nodeTypes";
import type { HexNode } from "@/types/hivemind";

interface FloatingActionBarProps {
  node: HexNode;
  position: { x: number; y: number };
  onRefresh: () => void;
  onToggleKeyTheme: () => void;
  isLoading: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const FloatingActionBar = ({
  node,
  position,
  onRefresh,
  onToggleKeyTheme,
  isLoading,
  onMouseEnter,
  onMouseLeave,
}: FloatingActionBarProps) => {
  return (
    <div
      className="absolute z-50 pointer-events-auto interactive-ui animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: position.x,
        top: position.y - 60,
        transform: "translateX(-50%)",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl px-2 py-1.5 flex items-center gap-1">
        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={`p-2 rounded-lg transition-colors ${isLoading ? "opacity-50" : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/20"}`}
          title="Refresh node"
          aria-label="Refresh node"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {/* Mark as Key Theme */}
        <button
          onClick={onToggleKeyTheme}
          className={`p-2 rounded-lg transition-colors ${
            node.isKeyTheme
              ? "text-amber-400 bg-amber-500/20"
              : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/20"
          }`}
          title={node.isKeyTheme ? "Remove key theme" : "Mark as key theme"}
          aria-label={node.isKeyTheme ? "Remove key theme" : "Mark as key theme"}
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
