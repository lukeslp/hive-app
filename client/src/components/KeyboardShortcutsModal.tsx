/**
 * Keyboard Shortcuts Help Modal
 *
 * Displays all available keyboard shortcuts for HiveMind accessibility.
 * WCAG 2.1 Level AA - provides discoverable keyboard navigation reference.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { APP_DISPLAY_NAME } from "@shared/appBrand";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  description: string;
  category: string;
}

const shortcuts: ShortcutItem[] = [
  // Navigation
  {
    category: "Navigation",
    keys: "↑ ↓ ← →",
    description: "Navigate between adjacent hexagons in the grid",
  },
  {
    category: "Navigation",
    keys: "Tab",
    description: "Move focus to next hexagon or UI element",
  },
  {
    category: "Navigation",
    keys: "Shift + Tab",
    description: "Move focus to previous hexagon or UI element",
  },
  {
    category: "Navigation",
    keys: "Home",
    description: "Jump to root hexagon and center view",
  },
  {
    category: "Navigation",
    keys: "Enter / Space",
    description: "Activate focused hexagon (select and generate)",
  },
  {
    category: "Navigation",
    keys: "Shift + Enter",
    description: "Open deep dive for focused hexagon",
  },
  {
    category: "Navigation",
    keys: "Escape",
    description: "Close modal, deselect node, or exit edit mode",
  },

  // Actions
  {
    category: "Actions",
    keys: "Delete / Backspace",
    description: "Prune selected hexagon and its children (except root)",
  },
  {
    category: "Actions",
    keys: "Ctrl/Cmd + Z",
    description: "Undo last action",
  },
  {
    category: "Actions",
    keys: "Ctrl/Cmd + Shift + Z",
    description: "Redo last action",
  },
  {
    category: "Actions",
    keys: "Ctrl/Cmd + F",
    description: "Open search panel",
  },
  {
    category: "Actions",
    keys: "?",
    description: "Show this keyboard shortcuts help",
  },
];

const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <DialogTitle className="text-foreground">
              Keyboard Shortcuts
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            {APP_DISPLAY_NAME} can be fully controlled via keyboard for accessibility
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors"
                    >
                      <span className="text-foreground text-sm">
                        {shortcut.description}
                      </span>
                      <kbd className="px-3 py-1.5 text-xs font-mono font-bold bg-card border border-border rounded shadow-sm text-muted-foreground whitespace-nowrap">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          {/* Additional Tips */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Tips
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>
                  All hexagons can be navigated using Tab key in a logical spiral order (center outward)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>
                  Focus indicators show a glowing outline around the active element
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>
                  Screen readers will announce node content, type, and state changes
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>
                  All functionality available via mouse is also available via keyboard
                </span>
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsModal;
