/**
 * ConfirmationModal - Confirm/cancel dialog
 * Extracted from HiveMindApp.tsx monolith
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">{message}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
