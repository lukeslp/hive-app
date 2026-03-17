/**
 * EditModal - Edit node title, description, and type
 * Extracted from HiveMindApp.tsx monolith
 */

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
  onSave: () => void;
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

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} className="bg-indigo-600 hover:bg-indigo-500">
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
};
