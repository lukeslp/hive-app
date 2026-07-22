/**
 * useSessionManagement - Manages session save/load/export/import/share
 *
 * When the user is authenticated, sessions are persisted to the database
 * via tRPC. When not authenticated, falls back to localStorage.
 *
 * Features:
 * - Auto-save to cloud (debounced, for authenticated users with an active session)
 * - Session rename / overwrite (update existing cloud sessions in-place)
 * - Local + cloud session listing with unified interface
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { buildApiUrl } from "@/lib/api";
import { getPublicWebAppOrigin, isCapacitor } from "@/lib/platform";
import { STORAGE_KEY, AUTOSAVE_KEY } from "@/lib/hexConstants";
import { generateThumbnail } from "@/lib/canvasSnapshot";
import { saveBlob } from "@/lib/saveBlob";
import {
  boardIdForLocalSession,
  createLocalBoardId,
  readAutosaveBoardId,
} from "@/lib/boardIdentity";
import type { HexNode, ViewState } from "@/types/hivemind";
import {
  APP_DISPLAY_NAME,
  APP_EXPORT_FILE_PREFIX,
  APP_PUBLIC_WEB_ORIGIN,
} from "@shared/appBrand";

interface SavedSession {
  id: string | number;
  name: string;
  date: string;
  nodeCount: number;
  /** true if stored in database, false if localStorage only */
  isCloud?: boolean;
  /** CDN URL for the session thumbnail */
  thumbnailUrl?: string | null;
}

export interface UseSessionManagementProps {
  nodes: Record<string, HexNode>;
  viewState: ViewState;
  creativity: number;
  setCreativity: (value: number) => void;
  resetHistory: (nodes: Record<string, HexNode>) => void;
  setViewState: (state: ViewState | ((prev: ViewState) => ViewState)) => void;
  setShowWelcome: (value: boolean) => void;
  enableAutoSave: boolean;
  isAuthenticated: boolean;
}

/** Debounce interval for cloud auto-save (ms) */
const CLOUD_AUTOSAVE_INTERVAL = 30_000;

export function useSessionManagement({
  nodes,
  viewState,
  creativity,
  setCreativity,
  resetHistory,
  setViewState,
  setShowWelcome,
  enableAutoSave,
  isAuthenticated,
}: UseSessionManagementProps) {
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [iosShareUrl, setIosShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [localBoardId, setLocalBoardId] = useState(() =>
    readAutosaveBoardId(
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(AUTOSAVE_KEY)
    )
  );

  /** The cloud session currently being worked on (for auto-save & overwrite) */
  const [activeCloudSessionId, setActiveCloudSessionId] = useState<
    number | null
  >(null);
  const [activeCloudSessionName, setActiveCloudSessionName] =
    useState<string>("");

  // Refs for cloud auto-save debounce
  const cloudAutoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastCloudSaveRef = useRef<number>(0);

  // ── tRPC hooks (only fire when authenticated) ──────────────────────────
  const utils = trpc.useUtils();
  const dbSessions = trpc.sessions.list.useQuery(undefined, {
    enabled: isAuthenticated && !isCapacitor(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });
  const updateMutation = trpc.sessions.update.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });
  const deleteMutation = trpc.sessions.delete.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });

  // ── Merge local + cloud sessions into a unified list ───────────────────
  useEffect(() => {
    const localSessions: SavedSession[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{
          id: string;
          name: string;
          date: string;
          nodeCount: number;
        }>;
        parsed.forEach(s => localSessions.push({ ...s, isCloud: false }));
      }
    } catch {
      // ignore
    }

    const cloudSessions: SavedSession[] = (dbSessions.data ?? []).map(s => ({
      id: s.id,
      name: s.name,
      date: (s.updatedAt ?? s.createdAt).toISOString(),
      nodeCount: s.nodeCount,
      isCloud: true,
      thumbnailUrl: s.thumbnailUrl,
    }));

    // Cloud sessions first, then local-only
    setSavedSessions([...cloudSessions, ...localSessions]);
  }, [dbSessions.data]);

  // ── Auto-save (localStorage — cheap, instant) ─────────────────────────
  useEffect(() => {
    if (Object.keys(nodes).length > 0 && enableAutoSave) {
      try {
        const autosave = {
          boardId: localBoardId,
          nodes,
          viewState,
          creativity,
          timestamp: Date.now(),
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosave));
      } catch {
        // ignore
      }
    }
  }, [nodes, viewState, creativity, enableAutoSave, localBoardId]);

  // ── Auto-save to cloud (debounced) ────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !enableAutoSave || !activeCloudSessionId) return;
    if (Object.keys(nodes).length === 0) return;

    // Clear any pending timer
    if (cloudAutoSaveTimer.current) {
      clearTimeout(cloudAutoSaveTimer.current);
    }

    cloudAutoSaveTimer.current = setTimeout(() => {
      const now = Date.now();
      // Don't save more often than the interval
      if (now - lastCloudSaveRef.current < CLOUD_AUTOSAVE_INTERVAL * 0.8)
        return;

      const sessionData = {
        boardId: localBoardId,
        nodes,
        viewState,
        creativity,
        keyThemes: Object.keys(nodes).filter(k => nodes[k].isKeyTheme),
      };

      updateMutation.mutate(
        {
          id: activeCloudSessionId,
          data: sessionData,
          nodeCount: Object.keys(nodes).length,
        },
        {
          onSuccess: () => {
            lastCloudSaveRef.current = Date.now();
          },
          onError: err => {
            console.warn("Cloud auto-save failed:", err);
          },
        }
      );
    }, CLOUD_AUTOSAVE_INTERVAL);

    return () => {
      if (cloudAutoSaveTimer.current) {
        clearTimeout(cloudAutoSaveTimer.current);
      }
    };
  }, [
    nodes,
    viewState,
    creativity,
    isAuthenticated,
    enableAutoSave,
    activeCloudSessionId,
    localBoardId,
  ]);

  // ── Save (create new or overwrite existing) ───────────────────────────
  const saveSession = useCallback(
    async (name: string, overwriteId?: number) => {
      const sessionData = {
        boardId: localBoardId,
        nodes,
        viewState,
        creativity,
        keyThemes: Object.keys(nodes).filter(k => nodes[k].isKeyTheme),
      };
      const nodeCount = Object.keys(nodes).length;
      const displayName = name || `Session ${savedSessions.length + 1}`;

      // Generate thumbnail (non-blocking)
      let thumbnailDataUrl: string | undefined;
      try {
        const thumb = await generateThumbnail(nodes, viewState);
        if (thumb) thumbnailDataUrl = thumb;
      } catch {
        // Non-critical
      }

      // Overwrite existing cloud session
      if (isAuthenticated && overwriteId) {
        try {
          await updateMutation.mutateAsync({
            id: overwriteId,
            name: displayName,
            data: sessionData,
            nodeCount,
            thumbnailDataUrl,
          });
          setActiveCloudSessionId(overwriteId);
          setActiveCloudSessionName(displayName);
          lastCloudSaveRef.current = Date.now();
          toast.success("Session updated!");
          return;
        } catch (err) {
          console.error("Cloud update failed:", err);
          toast.error("Failed to update session");
          return;
        }
      }

      // Create new cloud session
      if (isAuthenticated) {
        try {
          const result = await createMutation.mutateAsync({
            name: displayName,
            data: sessionData,
            nodeCount,
            thumbnailDataUrl,
          });
          setActiveCloudSessionId(result.id);
          setActiveCloudSessionName(displayName);
          lastCloudSaveRef.current = Date.now();
          toast.success("Session saved to cloud!");
          return;
        } catch (err) {
          console.error("Cloud save failed, falling back to local:", err);
        }
      }

      // Fallback: localStorage
      const sessionId = `session_${Date.now()}`;
      const session: SavedSession = {
        id: sessionId,
        name: displayName,
        date: new Date().toISOString(),
        nodeCount,
        isCloud: false,
      };
      try {
        localStorage.setItem(sessionId, JSON.stringify(sessionData));
        const newSessions = [...savedSessions.filter(s => !s.isCloud), session];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
        setSavedSessions(prev => [
          ...prev.filter(s => s.isCloud),
          ...newSessions,
        ]);
        toast.success("Session saved locally!");
      } catch {
        toast.error("Failed to save session");
      }
    },
    [
      nodes,
      viewState,
      creativity,
      savedSessions,
      isAuthenticated,
      createMutation,
      updateMutation,
      localBoardId,
    ]
  );

  // ── Rename a cloud session ────────────────────────────────────────────
  const renameSession = useCallback(
    async (sessionId: number, newName: string) => {
      try {
        await updateMutation.mutateAsync({ id: sessionId, name: newName });
        if (activeCloudSessionId === sessionId) {
          setActiveCloudSessionName(newName);
        }
        toast.success("Session renamed!");
      } catch {
        toast.error("Failed to rename session");
      }
    },
    [updateMutation, activeCloudSessionId]
  );

  // ── Load ───────────────────────────────────────────────────────────────
  const loadSession = useCallback(
    async (sessionId: string | number, isCloud?: boolean) => {
      try {
        if (isCloud && typeof sessionId === "number") {
          const session = await utils.sessions.get.fetch({ id: sessionId });
          if (session?.data) {
            resetHistory(session.data.nodes);
            setViewState(session.data.viewState || { x: 0, y: 0, zoom: 0.8 });
            setCreativity(session.data.creativity || 0.5);
            setShowWelcome(false);
            setShowSessionsModal(false);
            // Track as active cloud session for auto-save
            setActiveCloudSessionId(sessionId);
            setActiveCloudSessionName(session.name);
            lastCloudSaveRef.current = Date.now();
            toast.success("Session loaded from cloud!");
            return;
          }
        }

        // Fallback: localStorage
        const data = localStorage.getItem(String(sessionId));
        if (data) {
          const parsed = JSON.parse(data);
          resetHistory(parsed.nodes);
          setViewState(parsed.viewState || { x: 0, y: 0, zoom: 0.8 });
          setCreativity(parsed.creativity || 0.5);
          setShowWelcome(false);
          setShowSessionsModal(false);
          // Clear active cloud session when loading a local session
          setActiveCloudSessionId(null);
          setActiveCloudSessionName("");
          setLocalBoardId(boardIdForLocalSession(String(sessionId), parsed));
        }
      } catch (e) {
        console.error("Failed to load session:", e);
        toast.error("Failed to load session");
      }
    },
    [resetHistory, setViewState, setCreativity, setShowWelcome, utils]
  );

  const loadAutosave = useCallback(() => {
    try {
      const autosave = localStorage.getItem(AUTOSAVE_KEY);
      if (autosave) {
        const data = JSON.parse(autosave);
        if (data.nodes && Object.keys(data.nodes).length > 0) {
          resetHistory(data.nodes);
          setViewState(data.viewState || { x: 0, y: 0, zoom: 0.8 });
          setCreativity(data.creativity || 0.5);
          setShowWelcome(false);
          setShowSessionsModal(false);
          // Not a cloud session
          setActiveCloudSessionId(null);
          setActiveCloudSessionName("");
          setLocalBoardId(
            readAutosaveBoardId(JSON.stringify(data), createLocalBoardId)
          );
        }
      }
    } catch {
      // ignore
    }
  }, [resetHistory, setViewState, setCreativity, setShowWelcome]);

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteSession = useCallback(
    async (sessionId: string | number, isCloud?: boolean) => {
      try {
        if (isCloud && typeof sessionId === "number") {
          await deleteMutation.mutateAsync({ id: sessionId });
          // If deleting the active session, clear the active reference
          if (activeCloudSessionId === sessionId) {
            setActiveCloudSessionId(null);
            setActiveCloudSessionName("");
          }
          toast.success("Session deleted");
          return;
        }

        // localStorage
        localStorage.removeItem(String(sessionId));
        const newSessions = savedSessions.filter(s => s.id !== sessionId);
        setSavedSessions(newSessions);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(newSessions.filter(s => !s.isCloud))
        );
      } catch {
        toast.error("Failed to delete session");
      }
    },
    [savedSessions, deleteMutation, activeCloudSessionId]
  );

  // ── Export / Import ────────────────────────────────────────────────────
  const exportSession = useCallback(async () => {
    const data = {
      boardId: localBoardId,
      nodes,
      viewState,
      creativity,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    try {
      await saveBlob(blob, `${APP_EXPORT_FILE_PREFIX}_${Date.now()}.json`, {
        dialogTitle: `Share ${APP_DISPLAY_NAME} session`,
      });
    } catch (err) {
      toast.error(
        `Session export failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }, [nodes, viewState, creativity, localBoardId]);

  const importSession = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.nodes) {
            setLocalBoardId(
              typeof data.boardId === "string"
                ? boardIdForLocalSession("imported", data)
                : createLocalBoardId()
            );
            resetHistory(data.nodes);
            setViewState(data.viewState || { x: 0, y: 0, zoom: 0.8 });
            setCreativity(data.creativity || 0.5);
            setShowWelcome(false);
          }
        } catch {
          toast.error("Failed to import session");
        }
      };
      reader.readAsText(file);
    },
    [resetHistory, setViewState, setCreativity, setShowWelcome]
  );

  // ── Share ──────────────────────────────────────────────────────────────
  const generateShareUrl = useCallback(async () => {
    const data = { nodes, viewState, creativity };
    try {
      const res = await fetch(buildApiUrl("share"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Failed to save (HTTP ${res.status})`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(
          `Unexpected response type: ${contentType || "unknown"}`
        );
      }
      const { id } = await res.json();
      const path = window.location.pathname || "/";
      const url = `${getPublicWebAppOrigin()}${path}?s=${id}`;
      const iosUrl = `${APP_PUBLIC_WEB_ORIGIN}${path}?s=${id}`;
      setShareUrl(url);
      setIosShareUrl(iosUrl);
      setShowShareModal(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      toast.error(`Failed to create share link: ${detail}`);
    }
  }, [nodes, viewState, creativity]);

  const copyShareUrl = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const bringToIos = useCallback(async () => {
    const targetUrl = iosShareUrl || shareUrl;
    if (!targetUrl) {
      toast.error("No share link available yet");
      return;
    }

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `${APP_DISPLAY_NAME} board`,
          text: `Open this board in ${APP_DISPLAY_NAME} on iOS`,
          url: targetUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(targetUrl);
      toast.success("iOS link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast.error("Could not open iOS share options");
    }
  }, [iosShareUrl, shareUrl]);

  const loadFromUrl = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);

    const shareId = params.get("s");
    if (shareId) {
      try {
        const res = await fetch(buildApiUrl(`share/${shareId}`));
        if (!res.ok) throw new Error("Share not found");
        const decoded = await res.json();
        if (decoded.nodes && Object.keys(decoded.nodes).length > 0) {
          setLocalBoardId(createLocalBoardId());
          resetHistory(decoded.nodes);
          if (decoded.viewState) setViewState(decoded.viewState);
          if (decoded.creativity !== undefined)
            setCreativity(decoded.creativity);
          setShowWelcome(false);
        }
      } catch {
        toast.error("Failed to load shared brainstorm");
      }
      return;
    }

    const shareData = params.get("share");
    if (shareData) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(shareData)));
        if (decoded.nodes && Object.keys(decoded.nodes).length > 0) {
          setLocalBoardId(createLocalBoardId());
          resetHistory(decoded.nodes);
          if (decoded.viewState) setViewState(decoded.viewState);
          if (decoded.creativity !== undefined)
            setCreativity(decoded.creativity);
          setShowWelcome(false);
        }
      } catch {
        // ignore
      }
    }
  }, [resetHistory, setViewState, setCreativity, setShowWelcome]);

  const beginNewBoard = useCallback(() => {
    setActiveCloudSessionId(null);
    setActiveCloudSessionName("");
    setLocalBoardId(createLocalBoardId());
  }, []);

  const artifactBoardId = activeCloudSessionId
    ? `board:cloud:${activeCloudSessionId}`
    : localBoardId;

  return {
    savedSessions,
    showSessionsModal,
    setShowSessionsModal,
    sessionName,
    setSessionName,
    showShareModal,
    setShowShareModal,
    shareUrl,
    iosShareUrl,
    copied,
    saveSession,
    renameSession,
    loadSession,
    loadAutosave,
    deleteSession,
    exportSession,
    importSession,
    generateShareUrl,
    copyShareUrl,
    bringToIos,
    loadFromUrl,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    activeCloudSessionId,
    activeCloudSessionName,
    artifactBoardId,
    beginNewBoard,
  };
}
