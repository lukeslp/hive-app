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
          Share this link so others can open the same brainstorm in a browser (snapshot).
          They can explore and expand from there on web; iOS stays on-device for new
          generation in the app.
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
            <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" /> A short id in the URL loads your
            board from the server (best-effort; links may expire after a restart or deploy).
          </p>
          <p className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 flex-shrink-0" /> Live multi-user editing from the iOS app
            is not part of this release — use the web app for &quot;Collaborate&quot; sessions.
          </p>
          <p className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" /> Recipients with the link can open the
            snapshot and continue in the browser where cloud generation is available.
          </p>
        </div>
      </div>
    </Modal>
  );
};
