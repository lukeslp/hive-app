/**
 * InspectPanel - Compact node detail panel (bottom-left overlay)
 * Minimalist design: title, type icon, description, and action row
 */

import { Edit3, RefreshCw, Info, Star, X, Loader2 } from "@/lib/icons";
import { NODE_TYPES } from "@/lib/nodeTypes";
import type { HexNode } from "@/types/hivemind";

interface InspectPanelProps {
  node: HexNode;
  nodeId: string;
  isLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  onAddContextInfo: (e: React.MouseEvent) => void;
  onToggleKeyTheme: () => void;
}

export const InspectPanel = ({
  node,
  nodeId,
  isLoading,
  onClose,
  onEdit,
  onRefresh,
  onAddContextInfo,
  onToggleKeyTheme,
}: InspectPanelProps) => {
  const style = NODE_TYPES[node.type] || NODE_TYPES.default;
  const Icon = style.icon;

  return (
    <div
      className="fixed bottom-3 left-3 right-3 sm:right-auto z-50 sm:w-[320px] pointer-events-auto animate-in slide-in-from-bottom-2 duration-200"
      role="complementary"
      aria-label={`Details for ${node.text}`}
    >
      <div className="bg-card/95 backdrop-blur-lg border border-border rounded-xl shadow-lg p-4 pointer-events-auto">
        {/* Compact header: icon + title + star + close */}
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className={`p-1.5 rounded-lg ${style.bg} ${style.border} border flex-shrink-0`}
          >
            <Icon className={`w-4 h-4 ${style.color}`} />
          </div>
          <h2 className="text-base font-semibold text-foreground flex-1 min-w-0 truncate">
            {node.text}
          </h2>
          {/* Star toggle — filled when key theme */}
          <button
            onClick={onToggleKeyTheme}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
              node.isKeyTheme
                ? "text-amber-400"
                : "text-muted-foreground/40 hover:text-amber-400"
            }`}
            title={node.isKeyTheme ? "Remove key idea" : "Mark as key idea"}
            aria-label={
              node.isKeyTheme ? "Remove key idea" : "Mark as key idea"
            }
          >
            <Star
              className="w-4 h-4"
              fill={node.isKeyTheme ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors flex-shrink-0"
            title="Close"
            aria-label="Close panel"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Description — compact, max 3 lines */}
        {node.description && (
          <p className="text-sm text-muted-foreground leading-snug line-clamp-3 mb-3">
            {node.description}
          </p>
        )}

        {node.imageAttachment && (
          <img
            src={node.imageAttachment.dataURL}
            alt={`Attached artwork for ${node.text}`}
            className="mb-3 max-h-48 w-full rounded-lg object-contain"
          />
        )}

        {/* Context info — subtle inline */}
        {node.contextInfo && (
          <p className="text-xs text-blue-400/80 mb-3 line-clamp-2">
            <Info className="w-3 h-3 inline mr-1 -mt-0.5" />
            {node.contextInfo}
          </p>
        )}

        {/* Action row — small icon buttons */}
        <div className="flex items-center gap-1 border-t border-border/50 pt-2.5">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
            aria-label="Edit node"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-md text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
            title="Regenerate"
            aria-label="Refresh node"
          >
            {isLoading ? (
              <Loader2
                className="w-3.5 h-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            onClick={onAddContextInfo}
            className={`p-1.5 rounded-md transition-colors ${
              node.contextInfo
                ? "text-blue-400"
                : "text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10"
            }`}
            title={node.contextInfo ? "Edit context" : "Add context"}
            aria-label={
              node.contextInfo ? "Update context info" : "Add context info"
            }
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="text-[10px] text-muted-foreground/50 ml-auto uppercase tracking-wider">
            {node.type}
          </span>
        </div>
      </div>
    </div>
  );
};
