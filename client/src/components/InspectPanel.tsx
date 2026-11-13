/**
 * InspectPanel - Compact node detail panel (bottom-left overlay)
 * Minimalist design: title, type icon, description, and action row
 */

import React from "react";
import { Edit3, RefreshCw, Info, Star, X, Loader2, Flag } from "@/lib/icons";
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
  /** Opens the report form. Omitted for tiles the person wrote. */
  onReport?: () => void;
  /** True when the person reported this tile and its text is hidden. */
  isTextHidden?: boolean;
  /** Shows a reported tile's text again. */
  onShowText?: () => void;
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
  onReport,
  isTextHidden = false,
  onShowText,
}: InspectPanelProps) => {
  const style = NODE_TYPES[node.type] || NODE_TYPES.default;
  const Icon = style.icon;

  return (
    <div
      className="fixed bottom-3 left-3 right-3 sm:right-auto z-50 sm:w-[320px] pointer-events-auto animate-in slide-in-from-bottom-2 duration-200"
      role="complementary"
      aria-label={
        isTextHidden
          ? "Details for a reported tile"
          : `Details for ${node.text}`
      }
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
            {isTextHidden ? "Reported tile" : node.text}
          </h2>
          {/* Star toggle — filled when key theme */}
          <button
            onClick={onToggleKeyTheme}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ${
              node.isKeyTheme
                ? "text-amber-400"
                : "text-muted-foreground hover:text-amber-400"
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
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title="Close"
            aria-label="Close panel"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {isTextHidden && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground leading-snug">
              You reported this tile. Its text is hidden on this device.
            </p>
            {onShowText && (
              <button
                onClick={onShowText}
                className="min-h-11 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Show text
              </button>
            )}
          </div>
        )}

        {/* Description — compact, max 3 lines */}
        {!isTextHidden && node.description && (
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
        {!isTextHidden && node.contextInfo && (
          <p className="text-xs text-blue-400/80 mb-3 line-clamp-2">
            <Info className="w-3 h-3 inline mr-1 -mt-0.5" />
            {node.contextInfo}
          </p>
        )}

        {/* Action row — small icon buttons */}
        <div className="flex items-center gap-0.5 border-t border-border/50 pt-1">
          <button
            onClick={onEdit}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
            aria-label="Edit node"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
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
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-md transition-colors ${
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
          {onReport && !isTextHidden && (
            <button
              onClick={onReport}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Report"
              aria-label="Report this tile"
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto uppercase tracking-wider">
            {node.type}
          </span>
        </div>
      </div>
    </div>
  );
};
