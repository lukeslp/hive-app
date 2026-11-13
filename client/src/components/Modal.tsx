/**
 * Modal - Reusable dialog wrapper
 * Extracted from HiveMindApp.tsx monolith
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`bg-card border-border ${maxWidth} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        {/* shrink-0: in a short viewport the header must keep its height.
            Without it the flex column squeezed the header and the scrolling
            content drew over the description. */}
        <DialogHeader className="shrink-0 border-b border-border/60 pb-3">
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-muted-foreground">
              {description}
            </DialogDescription>
          )}
          {!description && (
            <DialogDescription className="sr-only">
              {title} dialog
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
