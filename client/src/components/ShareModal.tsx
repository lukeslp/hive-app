/**
 * ShareModal - Share brainstorm via URL
 * Extracted from HiveMindApp.tsx monolith
 */

import { Modal } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Check, Lightbulb, Eye, Zap } from "@/lib/icons";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
}

export const ShareModal = ({
  isOpen,
  onClose,
  shareUrl,
  copied,
  onCopy,
}: ShareModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Brainstorm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Share this link with others to let them view and continue your brainstorm:
        </p>
        <div className="flex gap-2">
          <Input
            value={shareUrl}
            readOnly
            className="flex-1 bg-secondary border-border text-foreground font-mono text-sm"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button
            onClick={onCopy}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </>
            )}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-2">
          <p className="flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" /> The link contains your entire
            brainstorm encoded in the URL
          </p>
          <p className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 flex-shrink-0" /> No server storage - everything is
            client-side
          </p>
          <p className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" /> Recipients can view and expand your ideas
          </p>
        </div>
      </div>
    </Modal>
  );
};
