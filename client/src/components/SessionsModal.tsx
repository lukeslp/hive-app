/**
 * SessionsModal - Save/load/rename/overwrite/delete sessions
 * Supports both local (localStorage) and cloud (database) sessions.
 * Shows thumbnails for cloud sessions and active session indicator.
 */

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Save,
  Trash2,
  Cloud,
  HardDrive,
  Edit3,
  Check,
  X,
  Upload,
} from "@/lib/icons";
import { AUTOSAVE_KEY } from "@/lib/hexConstants";
import { parseWorkspaceTransport } from "@shared/workspaceDocument";

interface SavedSession {
  id: string | number;
  name: string;
  date: string;
  nodeCount: number;
  isCloud?: boolean;
  thumbnailUrl?: string | null;
}

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedSessions: SavedSession[];
  sessionName: string;
  setSessionName: (value: string) => void;
  nodeCount: number;
  onSave: (name: string, overwriteId?: number) => void;
  onLoad: (sessionId: string | number, isCloud?: boolean) => void;
  onLoadAutosave: () => void;
  onDelete: (sessionId: string | number, isCloud?: boolean) => void;
  onRename?: (sessionId: number, newName: string) => void;
  isSaving?: boolean;
  activeCloudSessionId?: number | null;
  activeCloudSessionName?: string;
}

export const SessionsModal = ({
  isOpen,
  onClose,
  savedSessions,
  sessionName,
  setSessionName,
  nodeCount,
  onSave,
  onLoad,
  onLoadAutosave,
  onDelete,
  onRename,
  isSaving,
  activeCloudSessionId,
  activeCloudSessionName,
}: SessionsModalProps) => {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const getAutosaveInfo = () => {
    try {
      const autosave = localStorage.getItem(AUTOSAVE_KEY);
      if (autosave) {
        const data = JSON.parse(autosave);
        const envelope = parseWorkspaceTransport(data.workspaceEnvelope ?? data);
        if (envelope.workspace.graph.nodes.length > 0) {
          return {
            nodeCount: envelope.workspace.graph.nodes.length,
            timestamp: typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
              ? data.timestamp
              : null,
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const autosaveInfo = getAutosaveInfo();

  const startRename = (id: number, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const confirmRename = () => {
    if (renamingId !== null && renameValue.trim() && onRename) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Saved Sessions">
      <div className="flex flex-col gap-4">
        {/* Active cloud session indicator */}
        {activeCloudSessionId && activeCloudSessionName && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-blue-300">
                    Active: {activeCloudSessionName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Auto-saving to cloud every 30s
                  </p>
                </div>
              </div>
              <Button
                onClick={() =>
                  onSave(activeCloudSessionName, activeCloudSessionId)
                }
                disabled={isSaving || nodeCount === 0}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-foreground"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {isSaving ? "Saving..." : "Save Now"}
              </Button>
            </div>
          </div>
        )}

        {/* Load Autosave */}
        {autosaveInfo && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-amber-400">
                  Auto-saved Session
                </p>
                <p className="text-xs text-muted-foreground">
                  {autosaveInfo.nodeCount} nodes • {autosaveInfo.timestamp !== null
                    ? `Last saved: ${new Date(autosaveInfo.timestamp).toLocaleString()}`
                    : "Stored on this device"}
                </p>
              </div>
              <Button
                onClick={onLoadAutosave}
                className="bg-amber-600 hover:bg-amber-500 text-foreground"
                size="sm"
              >
                <Clock className="w-4 h-4 mr-2" /> Recover
              </Button>
            </div>
          </div>
        )}

        {/* Save Current (new session) */}
        <div className="flex gap-2">
          <Input
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            placeholder="New session name..."
            className="flex-1 bg-secondary border-border"
          />
          <Button
            onClick={() => {
              onSave(sessionName);
              setSessionName("");
            }}
            disabled={nodeCount === 0 || isSaving}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            <Save className="w-4 h-4 mr-2" />{" "}
            {isSaving ? "Saving..." : "Save New"}
          </Button>
        </div>

        {/* Sessions List — grid for thumbnail view */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {savedSessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No saved sessions yet
            </p>
          ) : (
            savedSessions.map(session => {
              const isActive =
                session.isCloud && session.id === activeCloudSessionId;
              const isRenaming = session.isCloud && renamingId === session.id;
              const hasThumbnail = session.isCloud && session.thumbnailUrl;

              return (
                <div
                  key={`${session.isCloud ? "cloud" : "local"}-${session.id}`}
                  className={`border rounded-lg transition-colors overflow-hidden ${
                    isActive
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-accent/50 border-border hover:bg-accent"
                  }`}
                >
                  {/* Thumbnail preview */}
                  {hasThumbnail && (
                    <div
                      className="w-full h-28 bg-cover bg-center cursor-pointer relative group"
                      style={{
                        backgroundImage: `url(${session.thumbnailUrl})`,
                      }}
                      onClick={() => onLoad(session.id, session.isCloud)}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Load session
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3">
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            className="h-7 text-sm bg-secondary border-border"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") confirmRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={confirmRename}
                            className="text-green-400 hover:text-green-300 h-7 w-7 p-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelRename}
                            className="text-muted-foreground hover:text-foreground h-7 w-7 p-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            {session.isCloud ? (
                              <Cloud className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                            <p className="font-medium text-foreground truncate">
                              {session.name}
                            </p>
                            {isActive && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full shrink-0">
                                active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground ml-5">
                            {new Date(session.date).toLocaleDateString()} •{" "}
                            {session.nodeCount} nodes
                            {session.isCloud ? " • synced" : " • local only"}
                          </p>
                        </>
                      )}
                    </div>
                    {!isRenaming && (
                      <div className="flex items-center gap-1">
                        {session.isCloud && onRename && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              startRename(session.id as number, session.name)
                            }
                            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                            title="Rename"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {session.isCloud && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onSave(session.name, session.id as number)
                            }
                            disabled={isSaving || nodeCount === 0}
                            className="text-blue-400 hover:text-blue-300 h-8 w-8 p-0"
                            title="Overwrite with current board"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!hasThumbnail && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onLoad(session.id, session.isCloud)}
                            className="text-indigo-400 hover:text-indigo-300"
                          >
                            Load
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(session.id, session.isCloud)}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
