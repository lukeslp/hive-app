import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hexagon, Map } from "@/lib/icons";
import type { WorkspaceMode } from "@shared/workspaceDocument";

interface WorkspaceLaunchDialogProps {
  isOpen: boolean;
  onChoose: (mode: WorkspaceMode) => void;
  onDismiss: () => void;
}

const choiceClass =
  "group min-h-40 rounded-2xl border border-border/70 bg-card/70 p-5 text-left transition-colors hover:border-primary/60 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function WorkspaceLaunchDialog({
  isOpen,
  onChoose,
  onDismiss,
}: WorkspaceLaunchDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="max-w-2xl rounded-3xl border-border/70 bg-background/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl leading-tight">
            Choose how ideas take shape
          </DialogTitle>
          <DialogDescription className="max-w-xl text-sm leading-relaxed">
            Tiles and Sphere are two views of the same board. Start with one
            now, then switch anytime from the workspace control in the toolbar.
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Choose a workspace"
        >
          <button
            type="button"
            className={choiceClass}
            onClick={() => onChoose("tiles")}
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Hexagon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="block text-lg font-semibold text-foreground">
              Tiles
            </span>
            <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
              Build outward on the familiar hex canvas. Arrange, branch, and
              merge ideas freely.
            </span>
          </button>

          <button
            type="button"
            className={choiceClass}
            onClick={() => onChoose("sphere")}
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Map className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="block text-lg font-semibold text-foreground">
              Sphere
            </span>
            <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
              Explore ideas across a spatial sphere. Drag to orbit and scroll to
              zoom.
            </span>
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          This choice becomes the default for new boards. Saved boards reopen in
          their saved workspace.
        </p>
      </DialogContent>
    </Dialog>
  );
}
