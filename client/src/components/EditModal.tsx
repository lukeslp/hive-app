/**
 * EditModal - Edit node title, description, and type
 * Extracted from HiveMindApp.tsx monolith
 */

import { useState, useEffect } from "react";
import { Sparkles } from "@/lib/icons";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NODE_TYPES } from "@/lib/nodeTypes";
import type { HexNode } from "@/types/hivemind";

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: HexNode | null;
  nodeId: string | null;
  editTitle: string;
  setEditTitle: (value: string) => void;
  editDesc: string;
  setEditDesc: (value: string) => void;
  /**
   * Save handler. Receives whether the user wants the tile's existing
   * neighbors regenerated against the new content. Default false — pure
   * field edit; user opts in via the checkbox for the "edit + cascade"
   * flow described in plan Part D.
   */
  onSave: (regenerateNeighbors: boolean) => void;
  onChangeType: (type: string) => void;
}

export const EditModal = ({
  isOpen,
  onClose,
  node,
  nodeId,
  editTitle,
  setEditTitle,
  editDesc,
  setEditDesc,
  onSave,
  onChangeType,
}: EditModalProps) => {
  const [regenerateNeighbors, setRegenerateNeighbors] = useState(false);

  // Reset the toggle whenever the modal opens for a different node so it
  // doesn't carry over from a prior edit session.
  useEffect(() => {
    if (isOpen) setRegenerateNeighbors(false);
  }, [isOpen, nodeId]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Node" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Title
          </label>
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="bg-secondary border-border text-foreground"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Description
          </label>
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md p-3 text-sm text-neutral-300 h-24 resize-none outline-none focus:border-indigo-500"
          />
        </div>

        {/* Type Selector */}
        {node && nodeId && (
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(NODE_TYPES)
                .filter((t) => t.id !== "default")
                .map((type) => (
                  <button
                    key={type.id}
                    onClick={() => onChangeType(type.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                      node.type === type.id
                        ? "bg-accent border-white/30 text-foreground"
                        : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <type.icon className={`w-4 h-4 ${type.color}`} />
                    <span className="text-xs">{type.label}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Regenerate-on-edit toggle. When checked, save also triggers
            generateNeighbors with forceRefresh=true so the tile's six
            children get rebuilt against the new title/description/type. */}
        <label className="flex items-start gap-2 mt-1 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={regenerateNeighbors}
            onChange={(e) => setRegenerateNeighbors(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border bg-secondary text-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
          />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Re-generate this tile's branches
            </span>
            <span className="text-xs text-muted-foreground">
              Replace the six neighboring tiles with new ones based on the
              edited content. Existing pinned neighbors are preserved.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(regenerateNeighbors)} className="bg-indigo-600 hover:bg-indigo-500">
            {regenerateNeighbors ? "Save & Regenerate" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
