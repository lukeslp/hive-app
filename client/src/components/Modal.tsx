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
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          {description && <DialogDescription className="text-muted-foreground">{description}</DialogDescription>}
          {!description && <DialogDescription className="sr-only">{title} dialog</DialogDescription>}
        </DialogHeader>
        <div className="overflow-y-auto custom-scrollbar flex-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
};
