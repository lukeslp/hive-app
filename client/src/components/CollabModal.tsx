/**
 * CollabModal - Create or join a collaborative editing session
 *
 * Uses invite links instead of room codes. Users create a room and share
 * a link — no manual code entry needed. Shows the invite link immediately
 * after clicking Start, with connection status feedback.
 */

import { useState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Copy, LogOut, Check, Link, Share2, AlertCircle } from "@/lib/icons";
import type { CollabParticipant } from "@/hooks/useCollaboration";
import { haptics } from "@/lib/haptics";

interface CollabModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  roomId: string | null;
  pendingRoomId: string | null;
  participants: CollabParticipant[];
  onCreateRoom: (userName?: string) => string;
  onJoinRoom: (roomId: string, userName?: string) => void;
  onLeaveRoom: () => void;
}

/** Build a shareable invite link for a room */
function getInviteLink(roomId: string): string {
  const url = new URL(window.location.href);
  // Clean any existing params
  url.search = "";
  url.searchParams.set("collab", roomId);
  return url.toString();
}

/** Check URL for a collab room code on mount */
export function getCollabRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("collab") || null;
}

/** Remove collab param from URL without reload */
export function clearCollabParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("collab");
  window.history.replaceState({}, "", url.toString());
}

export const CollabModal = ({
  isOpen,
  onClose,
  isConnected,
  isConnecting,
  connectionError,
  roomId,
  pendingRoomId,
  participants,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}: CollabModalProps) => {
  const [userName, setUserName] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  /** Track the roomId we created so we can show the link immediately */
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);

  // The effective room ID to show in the link (connected > pending > created)
  const effectiveRoomId = roomId || pendingRoomId || createdRoomId;

  // Reset created room when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCreatedRoomId(null);
      setCopiedLink(false);
    }
  }, [isOpen]);

  const handleCreate = () => {
    haptics.tap();
    const newRoomId = onCreateRoom(userName || undefined);
    setCreatedRoomId(newRoomId);
  };

  const handleRetry = () => {
    haptics.tap();
    if (createdRoomId) {
      onJoinRoom(createdRoomId, userName || undefined);
    }
  };

  const copyInviteLink = async () => {
    if (!effectiveRoomId) return;
    const link = getInviteLink(effectiveRoomId);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      haptics.success();
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedLink(true);
      haptics.success();
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const shareInviteLink = async () => {
    if (!effectiveRoomId) return;
    const link = getInviteLink(effectiveRoomId);
    haptics.tap();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Hexmind board",
          text: "Collaborate on this brainstorm with me!",
          url: link,
        });
      } catch {
        // User cancelled share — no-op
      }
    } else {
      copyInviteLink();
    }
  };

  // Show the connected/active state when connected OR when we have a pending room
  const showActiveState = isConnected && roomId;
  const showPendingState = !showActiveState && (isConnecting || effectiveRoomId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Collaborate">
      <div className="flex flex-col gap-4">
        {showActiveState ? (
          <>
            {/* ── Connected state ─────────────────────────────────── */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-medium text-green-300">
                  Live session
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {participants.length} {participants.length === 1 ? "person" : "people"}
                </span>
              </div>

              {/* Invite link — primary action */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInviteLink}
                  className="flex-1 h-9 text-sm border-green-500/30 text-green-300 hover:bg-green-500/10"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 mr-1.5 text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Link className="w-4 h-4 mr-1.5" />
                      Copy invite link
                    </>
                  )}
                </Button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={shareInviteLink}
                    className="h-9 px-3 border-green-500/30 text-green-300 hover:bg-green-500/10"
                    title="Share invite"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Participants */}
            <div>
              <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Participants
              </p>
              <div className="space-y-1.5">
                {participants.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center gap-2 px-3 py-2 bg-accent/50 rounded-lg"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm text-foreground">{p.userName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leave button */}
            <Button
              onClick={() => {
                haptics.tap();
                onLeaveRoom();
              }}
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4 mr-2" /> Leave Session
            </Button>
          </>
        ) : showPendingState ? (
          <>
            {/* ── Connecting / pending state with link already visible ── */}
            {effectiveRoomId && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  {connectionError ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-300">
                        Connection issue
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-sm font-medium text-amber-300">
                        Connecting...
                      </span>
                    </>
                  )}
                </div>

                {connectionError && (
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    {connectionError}
                  </p>
                )}

                {/* Show the invite link immediately so user can share while connecting */}
                <p className="text-xs text-muted-foreground mb-2">
                  Share this link — others can join when the session connects:
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyInviteLink}
                    className="flex-1 h-9 text-sm border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4 mr-1.5 text-amber-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Link className="w-4 h-4 mr-1.5" />
                        Copy invite link
                      </>
                    )}
                  </Button>
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={shareInviteLink}
                      className="h-9 px-3 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                      title="Share invite"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {connectionError && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={handleRetry}
                      size="sm"
                      className="flex-1 bg-amber-600 hover:bg-amber-500 text-sm"
                    >
                      Retry connection
                    </Button>
                    <Button
                      onClick={() => {
                        onLeaveRoom();
                        setCreatedRoomId(null);
                      }}
                      variant="outline"
                      size="sm"
                      className="border-border text-muted-foreground text-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Not connected state ─────────────────────────────── */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start a live session and share the invite link with others to brainstorm together in real time.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Your display name
                </label>
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Anonymous"
                  className="bg-secondary border-border"
                />
              </div>
            </div>

            {/* Create new session */}
            <Button
              onClick={handleCreate}
              disabled={isConnecting}
              className="w-full bg-indigo-600 hover:bg-indigo-500"
            >
              <Users className="w-4 h-4 mr-2" />
              {isConnecting ? "Starting session..." : "Start Live Session"}
            </Button>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Once started, you'll get an invite link to share with collaborators.
              Anyone with the link can join instantly.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};
