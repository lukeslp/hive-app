/**
 * File Purpose: Compose the Idea Tiles canvas, workflows, and platform services.
 * Primary Components: Canvas interaction, generation, sessions, sharing, settings.
 * I/O: Handles user gestures/native services and renders the complete application.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { Loader2 } from "@/lib/icons";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useHiveMindAnnouncer } from "@/hooks/useAnnouncer";
import { useAIGeneration } from "@/hooks/useAIGeneration";
import { useHistory, type UseHistoryReturn } from "@/hooks/useHistory";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { useSearch } from "@/hooks/useSearch";
import { useSessionManagement } from "@/hooks/useSessionManagement";
import { useTemplates } from "@/hooks/useTemplates";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import { createWebArtifactStudioServices } from "@/lib/webArtifactServices";
import { useTouchDrag } from "@/hooks/useTouchDrag";
import { haptics } from "@/lib/haptics";
import { synthesizeMerge } from "@/lib/synthesizeMerge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useMergeSuggestions } from "@/hooks/useMergeSuggestions";
import { useOGImage } from "@/hooks/useOGImage";
import { trpc } from "@/lib/trpc";
import type { MergeSuggestion } from "@/hooks/useMergeSuggestions";

import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";

import { HexCanvas } from "@/components/HexCanvas";
import { Toolbar } from "@/components/Toolbar";
import { Minimap } from "@/components/Minimap";
import { FloatingActionBar } from "@/components/FloatingActionBar";
import { InspectPanel } from "@/components/InspectPanel";
import { OnboardingTour, useOnboardingTour } from "@/components/OnboardingTour";
import { EditModal } from "@/components/EditModal";
import { SessionsModal } from "@/components/SessionsModal";
import { TemplatesModal } from "@/components/TemplatesModal";
import { TemplateContextModal } from "@/components/TemplateContextModal";
import { ContextPromptModal } from "@/components/ContextPromptModal";
import { ShareModal } from "@/components/ShareModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import {
  ArtifactCloudSyncError,
  ArtifactStudio,
} from "@/components/ArtifactStudio";
import {
  CollabModal,
  getCollabRoomFromUrl,
  clearCollabParam,
} from "@/components/CollabModal";
import { RemoteCursors } from "@/components/RemoteCursors";
import { MergeSuggestionIndicator } from "@/components/MergeSuggestionIndicator";

import { generateTextForCurrentPlatform } from "@/lib/macGeneration";
import { isCapacitor, getPlatform, isIos } from "@/lib/platform";
import {
  tryOnDeviceFirst,
  tryOnDeviceBranchesFirst,
} from "@/lib/foundationModelsPlugin";
import { sanitizeJson } from "@/lib/sanitize";
import { saveBlob } from "@/lib/saveBlob";
import { validateBranches } from "@/lib/clarificationValidator";
import { BRANCH_SET_SCHEMA } from "@/lib/branchSchema";
import {
  BRANCH_TYPE_DISTRIBUTION_RULE,
  CLARIFICATION_RULES,
  JSON_OUTPUT_EXAMPLE,
} from "@/lib/branchPrompt";
import type { HexNode, ViewState, ConfirmModalState } from "@/types/hivemind";
import { getNodeKey } from "@/types/hexmind";
import { APP_DISPLAY_NAME, APP_EXPORT_FILE_PREFIX } from "@shared/appBrand";
import {
  hasMacArtifactStudioCapability,
  type ArtifactImageAttachment,
  type ArtifactManifest,
} from "@shared/macArtifacts";
import {
  HEX_SIZE,
  HEX_WIDTH,
  HEX_HEIGHT,
  GEMINI_TEXT_MODEL,
  DIRECTIONS,
  STORAGE_KEY,
  AUTOSAVE_KEY,
  AUTOSAVE_ENABLED_KEY,
  FONT_SIZE_KEY,
  ACCESSIBILITY_FONT_KEY,
  HIGH_CONTRAST_KEY,
  ANIMATIONS_KEY,
  KEY_THEMES_KEY,
} from "@/lib/hexConstants";
import { hexToPixel, pixelToHex, hexDistance } from "@/lib/hexGrid";
import { NODE_TYPES } from "@/lib/nodeTypes";
import {
  APP_STORE_SHOWCASE_NODES,
  getAppStoreShowcase,
} from "@/lib/appStoreShowcase";

// --- Pure helpers (no React state) ---

const getNearestNodes = (
  centerNode: HexNode,
  allNodes: Record<string, HexNode>,
  maxNodes = 10
): string => {
  const centerPos = { q: centerNode.q, r: centerNode.r };
  const centerKey = `${centerNode.q},${centerNode.r}`;

  const keyThemes = Object.entries(allNodes)
    .filter(([key, node]) => node.isKeyTheme && key !== centerKey)
    .map(([key, node]) => ({
      key,
      node,
      distance: hexDistance(centerPos, { q: node.q, r: node.r }),
    }));

  const nearbyNodes = Object.entries(allNodes)
    .filter(([key, node]) => !node.isKeyTheme && key !== centerKey)
    .map(([key, node]) => ({
      key,
      node,
      distance: hexDistance(centerPos, { q: node.q, r: node.r }),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(0, maxNodes - keyThemes.length));

  const combined = [...keyThemes, ...nearbyNodes];
  if (combined.length === 0) return "No nearby nodes yet.";

  return combined
    .map(({ node }) => {
      const label = node.isKeyTheme ? " [KEY THEME]" : "";
      return `- [${node.type.toUpperCase()}] ${node.text}${label}: ${node.description || "No description"}`;
    })
    .join("\n");
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function HexmindApp() {
  const appStoreShowcase = getAppStoreShowcase();
  const macArtifactHost =
    typeof window !== "undefined" ? window.ideaTilesMac : undefined;
  // Artifact Studio now has an implementation on every platform: the native
  // Mac services when the shell injects them, the web services otherwise.
  // The Mac capability check is still consulted so a Mac build that reports
  // the feature off keeps it off.
  const macArtifactStudioAvailable =
    appStoreShowcase === "artifact" ||
    (macArtifactHost
      ? hasMacArtifactStudioCapability(macArtifactHost.capabilities)
      : true);
  const spherePreviewEnabled =
    import.meta.env.VITE_ENABLE_SPHERE_MODE_PREVIEW === "true";
  const requestSpherePreview = () => {
    toast.info(
      "Sphere workspace data is ready. The 3D renderer is planned for a later preview."
    );
  };
  // ── Core state ──────────────────────────────────────────────────────────
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [generatingNeighbors, setGeneratingNeighbors] = useState<Set<string>>(
    new Set()
  );
  const [rootInput, setRootInput] = useState("");

  // Settings.
  //
  // NOTE: this preference key intentionally differs from `AUTOSAVE_KEY`
  // ("hexpand_autosave") which stores the autosave JSON BLOB. Earlier
  // builds reused the same key for both the boolean preference and the
  // serialized state, so this useEffect's `localStorage.setItem(...,
  // enableAutoSave.toString())` would overwrite the blob with the literal
  // string "true"/"false" on every cold launch — every tester lost their
  // in-progress board. The blob still lives at `hexpand_autosave`; the
  // boolean now lives at `hexpand_autosave_enabled`.
  const [enableAutoSave, setEnableAutoSave] = useState(() => {
    const saved = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
    return saved !== "false";
  });
  const [enableSmartExpansion, setEnableSmartExpansion] = useState(true);
  const [autoExpandingNodes, setAutoExpandingNodes] = useState<Set<string>>(
    new Set()
  );
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return saved ? parseFloat(saved) : 1.0;
  });
  const [fontFamily, setFontFamily] = useState(() => {
    return localStorage.getItem(ACCESSIBILITY_FONT_KEY) || "system";
  });
  const [enableHighContrast, setEnableHighContrast] = useState(() => {
    return localStorage.getItem(HIGH_CONTRAST_KEY) === "true";
  });
  const [enableAnimations, setEnableAnimations] = useState(() => {
    const saved = localStorage.getItem(ANIMATIONS_KEY);
    if (saved) return saved === "true";
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [showSettingsModal, setShowSettingsModal] = useState(
    appStoreShowcase === "settings"
  );
  const [lastAutoExpandTime, setLastAutoExpandTime] = useState(0);

  // Undo/Redo
  const {
    present: nodes,
    canUndo,
    canRedo,
    push: pushHistory,
    replace: replaceNodes,
    undo: performUndo,
    redo: performRedo,
    resetHistory,
  } = useHistory<Record<string, HexNode>>(
    appStoreShowcase ? APP_STORE_SHOWCASE_NODES : {},
    50
  );

  /** Alias for `pushHistory` — accepts snapshot or `(prev) => next` (race-safe). */
  const commitNodes: UseHistoryReturn<Record<string, HexNode>>["push"] =
    pushHistory;

  // AI Generation hook
  const aiGeneration = useAIGeneration({
    nodes,
    NODE_TYPES,
    maxGenerationsPerSession: 100,
    enableSmartExpansion: true,
  });

  // Provider settings (API keys, provider selection)
  const providerSettings = useProviderSettings();
  // Depend on the stable pieces, not the hook result: useProviderSettings
  // returns a fresh object every render, so depending on it would rebuild the
  // services on each render and defeat the memo. getRequestHeaders is a
  // useCallback, and provider is a string, so this rebuilds only on a real
  // provider change — which is what provenance should follow anyway.
  const { getRequestHeaders: getProviderHeaders, provider: activeProvider } =
    providerSettings;
  const webArtifactServices = useMemo(
    () =>
      createWebArtifactStudioServices({
        getRequestHeaders: getProviderHeaders,
        getProvider: () => activeProvider,
      }),
    [getProviderHeaders, activeProvider]
  );

  // Collaboration
  const collab = useCollaboration(nodes, commitNodes);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showArtifactStudio, setShowArtifactStudio] = useState(
    appStoreShowcase === "artifact"
  );
  const attachArtifactImage = useCallback(
    async (attachment: ArtifactImageAttachment) => {
      let attached = false;
      flushSync(() => {
        commitNodes(previous => {
          const target = previous[attachment.targetNodeId];
          if (!target) return previous;
          attached = true;
          return {
            ...previous,
            [attachment.targetNodeId]: {
              ...target,
              imageAttachment: attachment,
            },
          };
        });
      });
      if (!attached) throw new Error("The target tile no longer exists.");
    },
    [commitNodes]
  );

  // Build nodePresenceMap from collab.nodePresence for HexCanvas
  const nodePresenceMap = useMemo(() => {
    const map: Record<string, { color: string; name: string }[]> = {};
    for (const p of collab.nodePresence) {
      if (!map[p.nodeKey]) map[p.nodeKey] = [];
      map[p.nodeKey].push({ color: p.color, name: p.userName });
    }
    return map;
  }, [collab.nodePresence]);

  // Smart merge suggestions
  const mergeSuggestions = useMergeSuggestions(nodes, {
    proximityThreshold: 4,
    minScore: 2,
    maxSuggestions: 3,
  });

  const handleConnectSuggestion = useCallback(
    (suggestion: MergeSuggestion) => {
      const nodeA = nodes[suggestion.nodeKeyA];
      const nodeB = nodes[suggestion.nodeKeyB];
      if (!nodeA || !nodeB) return;
      const labelA = nodeA.text;
      const labelB = nodeB.text;

      flushSync(() => {
        commitNodes(prev => {
          const a = prev[suggestion.nodeKeyA];
          const b = prev[suggestion.nodeKeyB];
          if (!a || !b) return prev;

          return {
            ...prev,
            [suggestion.nodeKeyA]: {
              ...a,
              relatedNodeKeys: [
                ...(a.relatedNodeKeys || []),
                suggestion.nodeKeyB,
              ],
              linkedContext: [...(a.linkedContext || []), suggestion.nodeKeyB],
            },
            [suggestion.nodeKeyB]: {
              ...b,
              relatedNodeKeys: [
                ...(b.relatedNodeKeys || []),
                suggestion.nodeKeyA,
              ],
              linkedContext: [...(b.linkedContext || []), suggestion.nodeKeyA],
            },
          };
        });
      });
      mergeSuggestions.dismissSuggestion(suggestion.id);
      haptics.success();
      toast.success(`Connected "${labelA}" and "${labelB}"`, {
        action: {
          label: "Undo",
          onClick: () => {
            performUndo();
            haptics.tap();
            toast.info("Connection undone");
          },
        },
        duration: 5000,
      });
    },
    [commitNodes, mergeSuggestions, performUndo, nodes]
  );

  // ── Interaction state ───────────────────────────────────────────────────
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(
    appStoreShowcase === "detail" ? "0,0" : null
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const isTouchDevice =
    typeof window !== "undefined" && "ontouchstart" in window;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    appStoreShowcase === "detail" || appStoreShowcase === "artifact"
      ? "0,0"
      : null
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const { tourActive, completeTour, resetTour } = useOnboardingTour();
  const justDropped = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);

  // Clusters
  const [clusters, setClusters] = useState<string[]>(["main"]);
  const [pendingClusterCoords, setPendingClusterCoords] = useState<{
    q: number;
    r: number;
  } | null>(null);
  const [newClusterResponse, setNewClusterResponse] = useState("");
  const [contextInfoNodeId, setContextInfoNodeId] = useState<string | null>(
    null
  );
  const [contextInfoResponse, setContextInfoResponse] = useState("");

  // Modals
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  // showMinimap state removed — Minimap now collapses inline via its
  // own button (4ef72c0). Kept rendered unconditionally below; the user
  // controls visibility via the inline collapse, not a parent toggle.
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [mergeAnimationKey, setMergeAnimationKey] = useState<string | null>(
    null
  );
  // Tiles that were just produced (generate / regenerate / merge). HexCanvas
  // applies a one-shot outer-glow pulse to each, then the key is removed
  // ~700ms later. Replaces the per-action "Generated on-device" toasts —
  // the new tile IS the success signal, so a confirmation toast on top
  // was redundant. Reduced-motion users get no animation; the
  // announcer (useHiveMindAnnouncer) covers VoiceOver semantics.
  const [freshlyGeneratedNodes, setFreshlyGeneratedNodes] = useState<
    Set<string>
  >(() => new Set());
  const markFreshlyGenerated = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setFreshlyGeneratedNodes(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      return next;
    });
    setTimeout(() => {
      setFreshlyGeneratedNodes(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
    }, 700);
  }, []);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showOnlyKeyThemes, setShowOnlyKeyThemes] = useState(
    appStoreShowcase === "themes"
  );

  // Context prompts
  const [showContextPrompt, setShowContextPrompt] = useState(false);
  const [clarifyingNode, setClarifyingNode] = useState<HexNode | null>(null);
  const [clarifyingPromptText, setClarifyingPromptText] = useState("");
  const [contextResponse, setContextResponse] = useState("");
  const [contextHistory, setContextHistory] = useState<Record<string, string>>(
    {}
  );

  // Set of node keys whose clarification has already been answered.
  // Computed from contextHistory so HexCanvas can hide the ask-state
  // visuals once the user has supplied input. Memoized so HexCanvas's
  // memoized child rows don't churn on every render.
  const answeredAskNodes = useMemo(
    () => new Set(Object.keys(contextHistory)),
    [contextHistory]
  );

  // Onboarding prompt (reuses ContextPromptModal for initial brainstorm)
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const [onboardingResponse, setOnboardingResponse] = useState("");
  // Once-per-session dismissal flag. Set when the user closes the
  // prompt via Escape / backdrop / Dismiss without submitting. Without
  // this, the effect below re-opened the modal 600ms after every
  // dismissal while nodes was empty — a HIG-prohibited "user cannot
  // dismiss this dialog" pattern. Ref (not state) so dismissal doesn't
  // trigger a re-render. Resets on page reload, which is the right
  // semantic — the modal helps first-time-in-session users, annoys
  // anyone who just closed it.
  const dismissedOnboardingRef = useRef(false);

  // Auto-show the onboarding prompt when the board is empty
  useEffect(() => {
    if (appStoreShowcase) return;
    if (dismissedOnboardingRef.current) return;
    if (Object.keys(nodes).length === 0 && !showOnboardingPrompt) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const timer = setTimeout(
        () => setShowOnboardingPrompt(true),
        reduced ? 100 : 600
      );
      return () => clearTimeout(timer);
    }
  }, [nodes, showOnboardingPrompt]);

  // Theme & accessibility
  const { theme, toggleTheme } = useTheme();
  const announcer = useHiveMindAnnouncer();

  // ── Canvas interaction ──────────────────────────────────────────────────
  const createNewClusterCallback = useCallback(
    (coords: { q: number; r: number }) => {
      setPendingClusterCoords(coords);
      setNewClusterResponse("");
    },
    []
  );

  // Shared ref: true when a touch-drag (long-press tile drag) is active
  // Defined before both hooks so useCanvasInteraction can skip panning during tile drags
  const touchDragActiveRef = useRef(false);

  const {
    viewState,
    setViewState,
    isDragging: canvasIsDragging,
    setIsDragging: setCanvasIsDragging,
    hasDragged,
    handlers: canvasHandlers,
  } = useCanvasInteraction({
    containerRef,
    pixelToHex,
    getNodeKey,
    nodes,
    onEmptySpaceClick: createNewClusterCallback,
    justDropped,
    touchDragActiveRef,
  });

  // mergeRef for touch drag (defined before mergeNodes, updated via ref)
  const mergeRef = useRef<(src: string, tgt: string) => void>(() => {});

  // Track recent regenerations per node so a 2nd / 3rd refresh avoids
  // earlier outputs and produces meaningfully different angles. Bounded
  // to last 3 per node so the AVOID clause doesn't bloat the prompt.
  const refreshHistoryRef = useRef<
    Map<string, Array<{ title: string; description?: string }>>
  >(new Map());

  // ── Touch drag (mobile drag-to-combine) ────────────────────────────────
  const {
    touchDragState,
    handleTouchStart: touchDragStart,
    handleTouchMove: touchDragMove,
    handleTouchEnd: touchDragEnd,
  } = useTouchDrag({
    nodes,
    viewState,
    canvasRef: containerRef,
    onMerge: (sourceKey, targetKey) => mergeRef.current(sourceKey, targetKey),
    touchDragActiveRef,
    onDragStateChange: (dragKey, dropKey) => {
      setDraggedNodeId(dragKey);
      setDropTargetId(dropKey);
    },
    hexToPixel,
  });

  // ── Search ──────────────────────────────────────────────────────────────
  const search = useSearch({ nodes });

  // ── Auth (for cloud session persistence) ────────────────────────────────
  const { isAuthenticated, login } = useAuth();

  // ── Session management ──────────────────────────────────────────────────
  const sessions = useSessionManagement({
    nodes,
    viewState,
    creativity: aiGeneration.creativity,
    setCreativity: aiGeneration.setCreativity,
    resetHistory,
    setViewState,
    setShowWelcome: () => {},
    enableAutoSave,
    isAuthenticated,
  });
  const cloudArtifactMutation = trpc.artifacts.upsert.useMutation();
  const syncArtifactToCloud = useCallback(
    async (artifact: ArtifactManifest, imageFileIds: string[]) => {
      if (!sessions.activeCloudSessionId) {
        throw new ArtifactCloudSyncError(
          "cloudSessionRequired",
          "Save this board as a cloud session before syncing."
        );
      }
      const result = await cloudArtifactMutation.mutateAsync({
        sessionId: sessions.activeCloudSessionId,
        artifact,
        imageFileIds,
      });
      return { remoteId: result.id };
    },
    [cloudArtifactMutation, sessions.activeCloudSessionId]
  );

  // ── OG Image for social sharing ─────────────────────────────────────────
  useOGImage(null, sessions.activeCloudSessionName || undefined);

  // ── Templates ───────────────────────────────────────────────────────────
  const templates = useTemplates({
    commitNodes,
    setViewState,
    setSelectedNodeId,
    setInspectedNodeId,
    setShowWelcome: () => {},
    announceTemplateLoaded: announcer.announceTemplateLoaded,
    getRequestHeaders: providerSettings.getRequestHeaders,
  });

  useEffect(() => {
    if (!appStoreShowcase) return;
    setViewState({
      x: 0,
      y: appStoreShowcase === "detail" ? 40 : 0,
      zoom: window.innerWidth < 700 ? 0.46 : 1,
    });
    if (appStoreShowcase === "templates") {
      templates.setShowTemplates(true);
    }
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Load from URL on mount
  useEffect(() => {
    sessions.loadFromUrl();
  }, []);

  // Auto-join collab room from URL (e.g. ?collab=ABC123)
  useEffect(() => {
    const roomCode = getCollabRoomFromUrl();
    if (roomCode && !collab.isConnected && !collab.isConnecting) {
      clearCollabParam();
      toast.info(`Joining collaborative room ${roomCode}...`);
      collab.joinRoom(roomCode);
    }
  }, []);

  // Load key themes from localStorage on mount
  useEffect(() => {
    try {
      const keyThemesJson = localStorage.getItem(KEY_THEMES_KEY);
      if (keyThemesJson) {
        const keyThemeKeys: string[] = JSON.parse(keyThemesJson);
        const updated = { ...nodes };
        keyThemeKeys.forEach(key => {
          if (updated[key]) {
            updated[key] = {
              ...updated[key],
              isKeyTheme: true,
              hierarchyLevel: 1,
            };
          }
        });
        if (keyThemeKeys.some(key => updated[key])) {
          resetHistory(updated);
        }
      }
    } catch (error) {
      console.error("Failed to load key themes:", error);
    }
  }, []);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, fontSizeMultiplier.toString());
  }, [fontSizeMultiplier]);
  useEffect(() => {
    localStorage.setItem(ANIMATIONS_KEY, enableAnimations.toString());
  }, [enableAnimations]);
  useEffect(() => {
    localStorage.setItem(ACCESSIBILITY_FONT_KEY, fontFamily);
  }, [fontFamily]);
  useEffect(() => {
    localStorage.setItem(HIGH_CONTRAST_KEY, enableHighContrast.toString());
  }, [enableHighContrast]);
  useEffect(() => {
    localStorage.setItem(AUTOSAVE_ENABLED_KEY, enableAutoSave.toString());
  }, [enableAutoSave]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-size-multiplier",
      fontSizeMultiplier.toString()
    );
  }, [fontSizeMultiplier]);
  useEffect(() => {
    const fontStacks: Record<string, string> = {
      system:
        "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      atkinson:
        "'Atkinson Hyperlegible', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      lexend:
        "'Lexend', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "open-dyslexic":
        "'OpenDyslexic', 'Atkinson Hyperlegible', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      aptos:
        "Aptos, Calibri, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    };
    const stack = fontStacks[fontFamily] || fontStacks.system;
    document.documentElement.style.setProperty("--app-font-family", stack);
  }, [fontFamily]);
  useEffect(() => {
    document.documentElement.classList.toggle(
      "manual-high-contrast",
      enableHighContrast
    );
  }, [enableHighContrast]);

  const resetBoard = useCallback(() => {
    sessions.beginNewBoard();
    resetHistory({});
    setSelectedNodeId(null);
    setInspectedNodeId(null);
    setRootInput("");
    resetTour();
  }, [resetHistory, resetTour, sessions.beginNewBoard]);

  const requestDeleteBoard = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: "Delete current board?",
      message:
        "This clears all nodes on the current board. This cannot be undone.",
      onConfirm: () => {
        resetBoard();
        setShowSettingsModal(false);
        toast.success("Board deleted");
      },
    });
  }, [resetBoard]);

  // ── Undo / Redo ─────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    performUndo();
    announcer.announceUndo();
  }, [performUndo, announcer]);

  const handleRedo = useCallback(() => {
    performRedo();
    announcer.announceRedo();
  }, [performRedo, announcer]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA" &&
          !target.isContentEditable
        ) {
          e.preventDefault();
          setShowKeyboardShortcuts(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        search.setIsSearchOpen(true);
        setTimeout(() => search.searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (!selectedNodeId) {
          setSelectedNodeId("0,0");
          return;
        }
        const currentNode = nodes[selectedNodeId];
        if (!currentNode) return;

        const ARROW_DIRECTIONS: Record<
          string,
          { q: number; r: number; name: string }
        > = {
          ArrowUp: { q: 0, r: -1, name: "up" },
          ArrowDown: { q: 0, r: 1, name: "down" },
          ArrowLeft: { q: -1, r: 0, name: "left" },
          ArrowRight: { q: 1, r: 0, name: "right" },
        };

        const dir = ARROW_DIRECTIONS[e.key];
        if (!dir) return;

        const nQ = currentNode.q + dir.q;
        const nR = currentNode.r + dir.r;
        const neighborKey = getNodeKey(nQ, nR);

        if (nodes[neighborKey]) {
          setSelectedNodeId(neighborKey);
          announcer.announceNodeNavigated(nodes[neighborKey].text, dir.name);
          const { x, y } = hexToPixel(nQ, nR);
          setViewState(prev => ({ ...prev, x: -x, y: -y }));
        } else {
          announcer.announceNavigationBlocked(dir.name);
        }
      }

      if (e.key === "Home") {
        e.preventDefault();
        if (nodes["0,0"]) {
          setSelectedNodeId("0,0");
          announcer.announceNodeNavigated(nodes["0,0"].text, "home");
          setViewState({ x: 0, y: 0, zoom: viewState.zoom });
        }
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedNodeId &&
        selectedNodeId !== "0,0"
      ) {
        e.preventDefault();
        pruneNode(selectedNodeId);
      }

      if (e.key === "Enter" && selectedNodeId) {
        e.preventDefault();
        const node = nodes[selectedNodeId];
        if (node) handleNodeClick(selectedNodeId, node);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? handleRedo() : handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        search.setIsSearchOpen(true);
        setTimeout(() => search.searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setEditingNodeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    selectedNodeId,
    nodes,
    announcer,
    setViewState,
    viewState.zoom,
  ]);

  // ── Search cycling ──────────────────────────────────────────────────────
  const handleCycleSearch = () => {
    const target = search.handleCycleSearch();
    if (!target) return;
    const { x, y } = hexToPixel(target.q, target.r);
    setViewState(prev => ({ ...prev, x: -x * prev.zoom, y: -y * prev.zoom }));
    setSelectedNodeId(getNodeKey(target.q, target.r));
  };

  // ── AI: Generate Neighbors ──────────────────────────────────────────────
  const generateNeighbors = async (
    centerNode: HexNode,
    forceRefresh = false,
    additionalContext = ""
  ) => {
    const key = getNodeKey(centerNode.q, centerNode.r);
    if (loadingNodes.has(key)) return;

    setLoadingNodes(prev => new Set([...Array.from(prev), key]));

    const neighborPositions = DIRECTIONS.map(dir =>
      getNodeKey(centerNode.q + dir.q, centerNode.r + dir.r)
    ).filter(nKey => !nodes[nKey]);

    setGeneratingNeighbors(
      prev => new Set([...Array.from(prev), ...neighborPositions])
    );

    const tempDesc =
      aiGeneration.creativity < 0.3
        ? "Logical, concrete, and safe"
        : aiGeneration.creativity > 0.7
          ? "Wild, abstract, and out-of-the-box"
          : "Balanced and creative";

    const systemPrompt = `You are a brainstorming engine for a hexagonal mind map. Style: ${tempDesc}.

**CRITICAL - KEY THEME PRIORITIZATION:**
Nodes marked as **[KEY THEME]** are the most important concepts. When generating:
1. Consider how new concepts relate to or build upon key themes
2. Suggest connections to key themes when relevant (even if spatially distant)
3. Weight key themes more heavily when determining brainstorm direction
4. If central idea is adjacent to a key theme, explore angles aligning with that theme

Given a central idea, you MUST generate EXACTLY 6 distinct related nodes to fill all hexagonal neighbors.
Each node should explore a different angle or aspect of the central idea.

${BRANCH_TYPE_DISTRIBUTION_RULE}

You will also receive a list of existing nearby nodes in the map. If any of your generated branches
have a strong conceptual relationship with existing nodes (NOT the parent), suggest those connections.

IMPORTANT:
- You MUST return exactly 6 branches, no more, no less.
- For each branch, assess its COMPLEXITY (1-5 scale):
  1-2: Simple, specific concept (no expansion needed)
  3: Moderate complexity (could benefit from expansion)
  4-5: Rich, multi-faceted concept that SHOULD be expanded further
- Mark branches with complexity 4-5 as "autoExpand": true (max 2 per generation)

${CLARIFICATION_RULES}

${JSON_OUTPUT_EXAMPLE}`;

    const nearbyNodesContext = getNearestNodes(centerNode, nodes, 10);
    const keyThemeCount = Object.values(nodes).filter(n => n.isKeyTheme).length;

    const userQuery = `Central idea: "${centerNode.text}"
${keyThemeCount > 0 ? `\n**This brainstorm has ${keyThemeCount} key theme(s) - prioritize connections.**` : ""}
Context: ${centerNode.description || "No additional context"}
${centerNode.contextInfo ? `Additional context: ${centerNode.contextInfo}` : ""}
${additionalContext ? `User input: ${additionalContext}` : ""}

Existing nearby nodes in the map:
${nearbyNodesContext}

Generate 6 diverse related ideas. Connect to key themes when relevant.`;

    const requestPayload = {
      model: GEMINI_TEXT_MODEL,
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        // Grammar-constrained decoding via OpenAPI subset schema. Forces
        // enum membership (type, userInputCategory) at the token level so
        // the LLM can't drift to invalid categories across long sessions.
        responseSchema: BRANCH_SET_SCHEMA,
        temperature: 0.7 + aiGeneration.creativity * 0.6,
      },
    };

    const requestSize = JSON.stringify(requestPayload).length;
    if (requestSize > 50000) {
      toast.error("Context too large - try marking fewer key themes");
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    // ── Try Apple on-device first (iOS 26+ with Apple Intelligence) ──
    // This is THE primary user gesture (tile-tap). Prior to this fix the
    // hook's instrumented dispatcher was only reached by the regenerate +
    // merge paths; tile-tap went straight to cloud and on-device never
    // fired. tryOnDeviceBranchesFirst owns: cached availability, JS-side
    // timeout, diagnostic toasts, AND the @Generable schema enforcement
    // that landed in Part A.1 — the model literally can't emit invalid
    // enums or schema-placeholder text. Returns null on any failure.
    const fm = await tryOnDeviceBranchesFirst({
      prompt: userQuery,
      systemPrompt,
      temperature: 0.7 + aiGeneration.creativity * 0.6,
      maxTokens: 2048,
    });
    let preFetchedBranches: any[] | null = null;
    if (fm) {
      const fmText = fm.text
        .replace(/^```json\s*/, "")
        .replace(/\s*```$/, "")
        .trim();
      const sanitizedFmText = sanitizeJson(fmText);
      try {
        const parsed = sanitizedFmText ? JSON.parse(sanitizedFmText) : {};
        if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
          preFetchedBranches = parsed.branches;
        }
      } catch {
        // FM produced text but JSON.parse failed — fall through.
      }
      if (!preFetchedBranches && !isIos()) {
        // Other platforms continue through their configured transport; native
        // Mac uses the provider selected in its native settings.
        toast.warning("On-device returned unparseable output — using cloud", {
          duration: 2500,
        });
      }
    }

    // iOS: Apple Intelligence is the only inference path. If FM didn't
    // produce usable JSON, surface a clear error and let the loading state
    // clean up below — never call /api/generate.
    if (isIos() && !preFetchedBranches) {
      const errorMsg = fm
        ? "On-device returned unparseable output"
        : "Apple Intelligence isn't available on this device";
      toast.error(errorMsg);
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setGeneratingNeighbors(prev => {
        const next = new Set(prev);
        neighborPositions.forEach(p => next.delete(p));
        return next;
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      let branches: any[] = [];
      if (preFetchedBranches) {
        branches = preFetchedBranches;
        clearTimeout(timeoutId);
      } else {
        const generation = await generateTextForCurrentPlatform({
          prompt: userQuery,
          systemPrompt,
          cloudPayload: requestPayload,
          headers: providerSettings.getRequestHeaders(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        let text = generation.text;

        text = text
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
          .trim();
        const sanitizedText = sanitizeJson(text);

        try {
          const parsed = sanitizedText ? JSON.parse(sanitizedText) : {};
          branches = parsed.branches || [];
        } catch {
          // Regex fallback
          try {
            const branchMatches =
              sanitizedText.match(/"title"\s*:\s*"([^"]+)"/g) || [];
            const descMatches =
              sanitizedText.match(/"description"\s*:\s*"([^"]+)"/g) || [];
            const typeMatches =
              sanitizedText.match(/"type"\s*:\s*"([^"]+)"/g) || [];
            for (let i = 0; i < Math.min(6, branchMatches.length); i++) {
              branches.push({
                title:
                  branchMatches[i]?.match(/"title"\s*:\s*"([^"]+)"/)?.[1] ||
                  `Idea ${i + 1}`,
                description:
                  descMatches[i]?.match(/"description"\s*:\s*"([^"]+)"/)?.[1] ||
                  "",
                type:
                  typeMatches[i]?.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ||
                  "concept",
              });
            }
          } catch {
            branches = [];
          }
        }
      }

      // Validate clarification fields BEFORE rendering — drops factual
      // questions the LLM laundered as user-knowledge per the validator's
      // regex patterns.
      branches = validateBranches(branches);

      if (branches.length === 0) {
        toast.error("No neighbors generated. Empty slots were left untouched.");
        return;
      }

      const nodesToAutoExpand: HexNode[] = [];
      const freshKeys: string[] = [];
      const MAX_AUTO_EXPAND_DEPTH = 2;

      flushSync(() => {
        commitNodes(prev => {
          const next = { ...prev };
          DIRECTIONS.forEach((dir, i) => {
            const nQ = centerNode.q + dir.q;
            const nR = centerNode.r + dir.r;
            const neighborKey = getNodeKey(nQ, nR);
            const existing = next[neighborKey];
            const shouldUpdate =
              !existing ||
              (forceRefresh && !existing.pinned && existing.parentId === key);

            if (shouldUpdate && branches[i]) {
              const nodeType = branches[i].type?.toLowerCase() || "concept";
              const validType = NODE_TYPES[nodeType] ? nodeType : "concept";
              const newDepth = (centerNode.depth || 0) + 1;

              const relatedNodeKeys = (branches[i].relatedTo || []).filter(
                (relKey: string) =>
                  prev[relKey] && relKey !== key && relKey !== neighborKey
              );

              const newNode: HexNode = {
                q: nQ,
                r: nR,
                text: branches[i].title || `Idea ${i + 1}`,
                description: branches[i].description || "",
                type: validType,
                depth: newDepth,
                parentId: key,
                pinned: false,
                clusterId: centerNode.clusterId,
                clarifyingQuestion: branches[i].clarifyingQuestion || undefined,
                shouldAskClarifyingQuestion:
                  branches[i].shouldAskClarifyingQuestion || undefined,
                clarificationReasoning:
                  branches[i].clarificationReasoning || undefined,
                userInputCategory: branches[i].userInputCategory || undefined,
                suggestedAnswers:
                  branches[i].suggestedAnswers &&
                  branches[i].suggestedAnswers!.length > 0
                    ? branches[i].suggestedAnswers
                    : undefined,
                relatedNodeKeys:
                  relatedNodeKeys.length > 0 ? relatedNodeKeys : undefined,
              };

              next[neighborKey] = newNode;
              freshKeys.push(neighborKey);

              if (
                enableSmartExpansion &&
                branches[i].autoExpand &&
                branches[i].complexity >= 4 &&
                newDepth < MAX_AUTO_EXPAND_DEPTH &&
                nodesToAutoExpand.length < 2
              ) {
                nodesToAutoExpand.push(newNode);
              }
            }
          });
          return next;
        });
      });
      haptics.expand();
      markFreshlyGenerated(freshKeys);

      // Auto-expand
      if (nodesToAutoExpand.length > 0 && enableSmartExpansion) {
        const now = Date.now();
        const minCooldown = 2000;
        if (now - lastAutoExpandTime < minCooldown) {
          toast.info("Auto-expansion throttled", { duration: 2000 });
          return;
        }
        setLastAutoExpandTime(now);
        nodesToAutoExpand.forEach((expandNode, index) => {
          const expandKey = getNodeKey(expandNode.q, expandNode.r);
          setAutoExpandingNodes(
            prev => new Set([...Array.from(prev), expandKey])
          );
          setTimeout(
            () => {
              generateNeighbors(expandNode, false).finally(() => {
                setAutoExpandingNodes(prev => {
                  const next = new Set(prev);
                  next.delete(expandKey);
                  return next;
                });
              });
            },
            index * 300 + minCooldown
          );
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        toast.error("Request timeout - try again");
        setLoadingNodes(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }
      console.error("AI Error:", error);
      toast.error(
        "Could not generate neighbors. Empty slots were left untouched."
      );
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setGeneratingNeighbors(prev => {
        const next = new Set(prev);
        neighborPositions.forEach(pos => next.delete(pos));
        return next;
      });
    }
  };

  // ── AI: Refresh single node ─────────────────────────────────────────────
  const refreshSingleNode = async (node: HexNode) => {
    const key = getNodeKey(node.q, node.r);
    if (loadingNodes.has(key) || node.pinned) return;

    setLoadingNodes(prev => new Set([...Array.from(prev), key]));

    const tempDesc =
      aiGeneration.creativity < 0.3
        ? "Logical, concrete, and safe"
        : aiGeneration.creativity > 0.7
          ? "Wild, abstract, and out-of-the-box"
          : "Balanced and creative";

    const parent = node.parentId ? nodes[node.parentId] : null;
    const parentContext = parent
      ? `Related to: "${parent.text}"`
      : "Root concept";

    // Build AVOID clause from recent regenerations of this node so the
    // LLM produces a genuinely different angle on the 2nd / 3rd refresh.
    // First refresh has no prior history → empty AVOID → behavior unchanged.
    const history = refreshHistoryRef.current.get(key) ?? [];
    const seen = [
      { title: node.text, description: node.description },
      ...history,
    ];
    const avoidClause =
      seen.length > 0
        ? `\nAVOID these previous titles/descriptions (a paraphrase doesn't count — find a different angle):\n${seen
            .slice(0, 3)
            .map(
              (s, i) =>
                `  ${i + 1}. "${s.title}"${s.description ? ` — ${s.description}` : ""}`
            )
            .join("\n")}`
        : "";

    const userText = `Current title: "${node.text}"\nCurrent description: ${node.description || "None"}\n${parentContext}\nNode type: ${node.type}\nRegenerate with a fresh perspective.${avoidClause}`;
    const systemText = `You are a brainstorming engine. Style: ${tempDesc}.\nGiven context about a node in a mind map, regenerate a fresh title and description for it.\nKeep the same general theme but offer a new perspective or angle.\nReturn JSON: { "title": "Short Title (2-4 words)", "description": "Brief explanation (1-2 sentences)", "type": "concept|action|technical|question|risk" }`;

    const applyParsedRefresh = (parsed: {
      title?: string;
      description?: string;
      type?: string;
    }) => {
      const newTitle = parsed.title || node.text;
      const newDescription = parsed.description || node.description;
      commitNodes(prev => {
        const cur = prev[key];
        if (!cur) return prev;
        return {
          ...prev,
          [key]: {
            ...cur,
            text: newTitle,
            description: newDescription,
            type:
              parsed.type && NODE_TYPES[parsed.type] ? parsed.type : cur.type,
          },
        };
      });
      const updated = [
        { title: node.text, description: node.description },
        ...history,
      ].slice(0, 3);
      refreshHistoryRef.current.set(key, updated);
      haptics.expand();
      // Tile flash replaces the prior on-device "Regenerated" toast;
      // the visible content change is itself the confirmation. Flash
      // applies regardless of source (FM or cloud) so the UX is
      // consistent across paths.
      markFreshlyGenerated([key]);
    };

    try {
      // Try Apple Foundation Models first via the shared helper. Cached
      // availability + JS-side timeout + uniform diagnostic toasts.
      const fm = await tryOnDeviceFirst({
        prompt: userText,
        systemPrompt: systemText,
        temperature: 0.9 + aiGeneration.creativity * 0.4,
        maxTokens: 512,
      });
      if (fm) {
        try {
          const cleaned = fm.text
            .replace(/^```json\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
          const parsed = cleaned ? JSON.parse(cleaned) : null;
          if (parsed && (parsed.title || parsed.description)) {
            applyParsedRefresh(parsed);
            return;
          }
        } catch {
          // FM produced text but JSON.parse failed — fall through.
        }
      }

      // iOS: Apple-Intelligence-only — no cloud fallback for refresh.
      if (isIos()) {
        if (fm) toast.error("On-device returned unparseable output");
        else toast.error("Apple Intelligence isn't available on this device");
        return;
      }

      const cloudPayload = {
        model: GEMINI_TEXT_MODEL,
        contents: [{ parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: systemText }] },
        generationConfig: {
          responseMimeType: "application/json",
          // Slightly higher temperature for refresh than first-pass
          // generation, to encourage divergence from the existing tile.
          temperature: 0.9 + aiGeneration.creativity * 0.4,
        },
      };
      const generation = await generateTextForCurrentPlatform({
        prompt: userText,
        systemPrompt: systemText,
        cloudPayload,
        headers: providerSettings.getRequestHeaders(),
      });

      let text = generation.text;
      if (text)
        text = text
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
          .trim();

      const parsed = text ? JSON.parse(text) : {};
      applyParsedRefresh(parsed);
    } catch (error) {
      console.error("Refresh node error:", error);
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Graph management ────────────────────────────────────────────────────
  const pruneNode = (key: string) => {
    const node = nodes[key];
    if (!node || node.type === "root") return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Node?",
      message: `Delete "${node.text}" and all its children? This cannot be undone.`,
      onConfirm: () => {
        commitNodes(prev => {
          const nodesToDelete = new Set([key]);
          let sizeBefore = 0;
          do {
            sizeBefore = nodesToDelete.size;
            Object.entries(prev).forEach(([k, n]) => {
              if (n.parentId && nodesToDelete.has(n.parentId))
                nodesToDelete.add(k);
            });
          } while (nodesToDelete.size > sizeBefore);

          const newNodes = { ...prev };
          nodesToDelete.forEach(k => delete newNodes[k]);
          return newNodes;
        });
        setSelectedNodeId(null);
      },
    });
  };

  const mergeNodes = (sourceKey: string, targetKey: string) => {
    const sourceNode = nodes[sourceKey];
    const targetNode = nodes[targetKey];
    if (!sourceNode || !targetNode || sourceKey === targetKey) return;
    // Root and pinned tiles are never merge participants. Both input paths
    // (HTML5 drag + touch drag) filter these, but guard here too so every
    // future caller inherits the rule.
    if (sourceNode.type === "root" || sourceNode.pinned) return;
    if (targetNode.type === "root" || targetNode.pinned) return;

    // Release canvas grip so it doesn't pan after drop
    setCanvasIsDragging(false);
    hasDragged.current = false;

    const isContextTransfer = !!(
      sourceNode.contextInfo && !targetNode.contextInfo
    );

    flushSync(() => {
      commitNodes(prev => {
        const sn = prev[sourceKey];
        const tn = prev[targetKey];
        if (!sn || !tn || sourceKey === targetKey) return prev;

        if (sn.contextInfo && !tn.contextInfo) {
          return {
            ...prev,
            [targetKey]: {
              ...tn,
              contextInfo: sn.contextInfo,
              linkedContext: [...(tn.linkedContext || []), sourceKey],
            },
          };
        }

        const mergedNode: HexNode = {
          ...tn,
          text: `${tn.text} + ${sn.text}`,
          description: [
            tn.description,
            sn.description,
            `Merged from: ${sn.text}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
          pinned: tn.pinned || sn.pinned,
        };

        const next = { ...prev };
        Object.entries(next).forEach(([k, n]) => {
          if (n.parentId === sourceKey) next[k] = { ...n, parentId: targetKey };
        });
        delete next[sourceKey];
        next[targetKey] = mergedNode;
        return next;
      });
    });

    setSelectedNodeId(targetKey);
    setDraggedNodeId(null);
    setDropTargetId(null);
    setMergeAnimationKey(targetKey);
    setTimeout(() => setMergeAnimationKey(null), 600);
    haptics.success();

    if (isContextTransfer) {
      toast.success(`Context info transferred from "${sourceNode.text}"!`, {
        action: {
          label: "Undo",
          onClick: () => {
            performUndo();
            haptics.tap();
            toast.info("Transfer undone");
          },
        },
        duration: 5000,
      });
      return;
    }

    toast.success(`Merged "${sourceNode.text}" into "${targetNode.text}"`, {
      action: {
        label: "Undo",
        onClick: () => {
          performUndo();
          haptics.tap();
          toast.info("Merge undone");
        },
      },
      duration: 5000,
    });

    // The concat title we just committed. The async synthesis below only
    // upgrades a tile that still carries it — if the user undid the merge
    // (sourceKey back in the board) or edited the tile, the result is stale
    // and must be dropped, never applied.
    const mergedText = `${targetNode.text} + ${sourceNode.text}`;

    void synthesizeMerge(
      {
        text: sourceNode.text,
        description: sourceNode.description,
        type: sourceNode.type,
      },
      {
        text: targetNode.text,
        description: targetNode.description,
        type: targetNode.type,
      },
      providerSettings.getRequestHeaders()
    ).then(result => {
      if (!result) return;
      const latest = nodesRef.current;
      const current = latest[targetKey];
      if (!current || latest[sourceKey] || current.text !== mergedText) return;
      // replace (not push): the synthesis refines the merge commit in
      // place, so a single toast-Undo reverts the whole merge no matter
      // when this lands.
      replaceNodes(prev => {
        const tile = prev[targetKey];
        if (!tile || prev[sourceKey] || tile.text !== mergedText) return prev;
        return {
          ...prev,
          [targetKey]: {
            ...tile,
            text: result.synth.title,
            description: result.synth.description || tile.description,
            type: NODE_TYPES[result.synth.type] ? result.synth.type : tile.type,
          },
        };
      });
      markFreshlyGenerated([targetKey]);
    });
  };

  // Update mergeRef so touch drag can call mergeNodes
  mergeRef.current = mergeNodes;

  // ── Interaction handlers ────────────────────────────────────────────────
  const startBrainstorm = (initialIdea = rootInput) => {
    if (!initialIdea.trim()) return;
    haptics.success();
    const firstNode: HexNode = {
      q: 0,
      r: 0,
      text: initialIdea,
      description: "The central idea of this brainstorm",
      depth: 0,
      pinned: true,
      type: "root",
      clusterId: "main",
      isClusterRoot: true,
    };
    commitNodes({ "0,0": firstNode });
    setRootInput("");
    setViewState({ x: 0, y: 0, zoom: 1 });
    generateNeighbors(firstNode);
    setSelectedNodeId("0,0");
    // Tour handles its own completion after tutorial steps
  };

  const startDualBrainstorm = (idea1: string, idea2: string) => {
    const key1 = getNodeKey(-4, 0);
    const key2 = getNodeKey(4, 0);
    const node1: HexNode = {
      q: -4,
      r: 0,
      text: idea1,
      description: "Starting point",
      depth: 0,
      pinned: true,
      type: "root",
      clusterId: "left",
      isClusterRoot: true,
    };
    const node2: HexNode = {
      q: 4,
      r: 0,
      text: idea2,
      description: "Starting point",
      depth: 0,
      pinned: true,
      type: "root",
      clusterId: "right",
      isClusterRoot: true,
    };
    setClusters(["main", "left", "right"]);
    commitNodes({ [key1]: node1, [key2]: node2 });
    setRootInput("");
    setViewState({ x: 0, y: 0, zoom: 0.6 });
    generateNeighbors(node1);
    generateNeighbors(node2);
    // Tour handles its own completion after tutorial steps
  };

  const handleNewClusterConfirm = useCallback(
    (input: string) => {
      if (!pendingClusterCoords) return;
      const coords = pendingClusterCoords;
      setPendingClusterCoords(null);
      setNewClusterResponse("");

      const clusterId = `cluster_${Date.now()}`;
      const key = getNodeKey(coords.q, coords.r);

      const newNode: HexNode = {
        q: coords.q,
        r: coords.r,
        text: input,
        description: "",
        type: "root",
        depth: 0,
        pinned: true,
        clusterId,
        isClusterRoot: true,
      };

      commitNodes(prev => ({ ...prev, [key]: newNode }));
      setClusters([...clusters, clusterId]);
      setSelectedNodeId(key);
      setInspectedNodeId(key);

      setTimeout(() => generateNeighbors(newNode), 100);
      toast.success("New cluster created! Generating ideas...");
    },
    [pendingClusterCoords, clusters, commitNodes]
  );

  const handleNodeClick = (key: string, node: HexNode) => {
    haptics.tap();
    if (!node.wasInteracted) {
      commitNodes(prev => {
        const cur = prev[key];
        if (!cur || cur.wasInteracted) return prev;
        return { ...prev, [key]: { ...cur, wasInteracted: true } };
      });
    }
    setSelectedNodeId(key);
    announcer.announceNodeSelected(node.text);

    const hasEmptyNeighbors = DIRECTIONS.some(dir => {
      const neighborKey = getNodeKey(node.q + dir.q, node.r + dir.r);
      return nodes[neighborKey] === undefined;
    });

    if (
      hasEmptyNeighbors &&
      node.clarifyingQuestion &&
      !loadingNodes.has(key)
    ) {
      setClarifyingNode(node);
      setClarifyingPromptText(node.clarifyingQuestion);
      setContextResponse("");
      setShowContextPrompt(true);
      return;
    }

    if (hasEmptyNeighbors && !loadingNodes.has(key)) {
      toast.info(`Generating neighbors for "${node.text}"...`, {
        duration: 2000,
      });
      generateNeighbors(node);
    }
  };

  const handleNodeKeyDown = (
    e: React.KeyboardEvent,
    key: string,
    node: HexNode
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      haptics.tap();
      handleNodeClick(key, node);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────
  // All exports go through saveBlob: browsers download, Mac opens a native
  // save panel, and Capacitor writes to Documents before showing iOS sharing.
  const exportAsImage = async () => {
    haptics.medium();
    const svgContent = document.getElementById("hex-canvas-layer")?.innerHTML;
    if (!svgContent) return;
    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="-1000 -1000 2000 2000"><style>text { font-family: sans-serif; fill: white; } path { stroke: gray; fill: #222; }</style><g transform="translate(0,0)">${svgContent}</g></svg>`;
    const blob = new Blob([fullSvg], { type: "image/svg+xml" });
    try {
      await saveBlob(
        blob,
        `${APP_EXPORT_FILE_PREFIX}-export-${Date.now()}.svg`,
        {
          dialogTitle: `Share ${APP_DISPLAY_NAME} SVG`,
        }
      );
    } catch (err) {
      toast.error(
        `SVG export failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  };

  // PNG and JPG share one raster pipeline: render the SVG layer onto an
  // opaque dark canvas, then encode. The opaque background fill is what
  // makes JPEG (no alpha channel) safe here.
  const exportAsRaster = (format: "png" | "jpg") => {
    haptics.medium();
    const label = format.toUpperCase();
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const svgContent = document.getElementById("hex-canvas-layer")?.innerHTML;
    if (!svgContent) return;
    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="-1000 -1000 2000 2000"><style>text { font-family: sans-serif; fill: white; } path { stroke: gray; fill: #222; }</style><g transform="translate(0,0)">${svgContent}</g></svg>`;
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 2000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, 2000, 2000);
    const img = new Image();
    const svgBlob = new Blob([fullSvg], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        async blob => {
          if (!blob) {
            toast.error(`${label} export failed — couldn't encode the canvas.`);
            return;
          }
          try {
            await saveBlob(
              blob,
              `${APP_EXPORT_FILE_PREFIX}-export-${Date.now()}.${format}`,
              {
                dialogTitle: `Share ${APP_DISPLAY_NAME} ${label}`,
              }
            );
          } catch (err) {
            toast.error(
              `${label} export failed: ${err instanceof Error ? err.message : "unknown error"}`
            );
          }
        },
        mime,
        format === "jpg" ? 0.9 : undefined
      );
    };
    img.onerror = () => {
      // SVG-as-Image rasterization can silently fail on certain SVG features
      // (foreignObject, complex filters). Without this handler the user
      // taps Export and nothing happens.
      URL.revokeObjectURL(url);
      toast.error(`${label} export failed — SVG rasterization rejected.`);
    };
    img.src = url;
  };

  const exportAsPNG = () => exportAsRaster("png");
  const exportAsJPG = () => exportAsRaster("jpg");

  // ── Computed values ─────────────────────────────────────────────────────
  const hoveredNode = hoveredNodeId ? nodes[hoveredNodeId] : null;

  const getNodeScreenPosition = (node: HexNode) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const { width, height } = container.getBoundingClientRect();
    const { x, y } = hexToPixel(node.q, node.r);
    return {
      x: width / 2 + viewState.x + x * viewState.zoom,
      y: height / 2 + viewState.y + y * viewState.zoom,
    };
  };

  const backgroundHexGrid = useMemo(() => {
    const gridRadius = 15;
    const hexes: Array<{ q: number; r: number; key: string }> = [];
    for (let q = -gridRadius; q <= gridRadius; q++) {
      for (let r = -gridRadius; r <= gridRadius; r++) {
        const key = getNodeKey(q, r);
        if (!nodes[key]) hexes.push({ q, r, key });
      }
    }
    return hexes;
  }, [nodes]);

  const visibleNodes = useMemo(() => {
    const container = containerRef.current;
    if (!container) return {};
    const filteredNodes = showOnlyKeyThemes
      ? Object.fromEntries(
          Object.entries(nodes).filter(([, n]) => n.isKeyTheme)
        )
      : nodes;
    const newVisibleNodes: Record<string, HexNode> = {};
    const { width, height } = container.getBoundingClientRect();
    const padding = HEX_WIDTH * 2;
    for (const key in filteredNodes) {
      const node = filteredNodes[key];
      const { x, y } = hexToPixel(node.q, node.r);
      const screenX = width / 2 + viewState.x + x * viewState.zoom;
      const screenY = height / 2 + viewState.y + y * viewState.zoom;
      if (
        screenX > -padding &&
        screenX < width + padding &&
        screenY > -padding &&
        screenY < height + padding
      ) {
        newVisibleNodes[key] = node;
      }
    }
    return newVisibleNodes;
  }, [nodes, viewState, showOnlyKeyThemes]);

  const connectionLines = useMemo(() => {
    const lines: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      isDashed: boolean;
    }> = [];

    Object.entries(visibleNodes)
      .filter(([, node]) => node.parentId && nodes[node.parentId])
      .forEach(([key, node]) => {
        const parent = nodes[node.parentId!];
        if (!parent) return;
        const childPos = hexToPixel(node.q, node.r);
        const parentPos = hexToPixel(parent.q, parent.r);
        const style = NODE_TYPES[node.type] || NODE_TYPES.default;
        lines.push({
          key: `parent-${key}`,
          x1: parentPos.x,
          y1: parentPos.y,
          x2: childPos.x,
          y2: childPos.y,
          color: style.bgSolid,
          isDashed: false,
        });
      });

    Object.entries(visibleNodes)
      .filter(([, node]) => node.relatedNodeKeys?.length)
      .forEach(([key, node]) => {
        node.relatedNodeKeys!.forEach(relatedKey => {
          const relatedNode = visibleNodes[relatedKey];
          if (relatedNode) {
            const nodePos = hexToPixel(node.q, node.r);
            const relatedPos = hexToPixel(relatedNode.q, relatedNode.r);
            lines.push({
              key: `distant-${key}-${relatedKey}`,
              x1: nodePos.x,
              y1: nodePos.y,
              x2: relatedPos.x,
              y2: relatedPos.y,
              color: "#64748b",
              isDashed: true,
            });
          }
        });
      });

    return lines;
  }, [visibleNodes, nodes]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col w-full h-screen bg-background text-foreground overflow-hidden font-sans select-none relative"
      style={{ height: "100dvh" }}
    >
      {/* Background Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Toolbar */}
      <Toolbar
        nodeCount={Object.keys(nodes).length}
        generationsThisSession={aiGeneration.generationsThisSession}
        canUndo={canUndo}
        canRedo={canRedo}
        isSearchOpen={search.isSearchOpen}
        searchQuery={search.searchQuery}
        searchResults={search.searchResults}
        currentSearchIndex={search.currentSearchIndex}
        searchInputRef={search.searchInputRef}
        showOnlyKeyThemes={showOnlyKeyThemes}
        filterType={filterType}
        onShowWelcome={() => {
          resetBoard();
        }}
        onExportPNG={exportAsPNG}
        onExportJPG={exportAsJPG}
        onExportSVG={exportAsImage}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleSearch={() => {
          search.setIsSearchOpen(!search.isSearchOpen);
          setTimeout(() => search.searchInputRef.current?.focus(), 50);
        }}
        onSearchChange={search.setSearchQuery}
        onCycleSearch={handleCycleSearch}
        onCloseSearch={() => {
          search.setIsSearchOpen(false);
          search.setSearchQuery("");
        }}
        onToggleKeyThemes={() => {
          setShowOnlyKeyThemes(!showOnlyKeyThemes);
          toast.info(
            showOnlyKeyThemes ? "Showing all" : "Showing key themes only"
          );
        }}
        onShowSessions={() => sessions.setShowSessionsModal(true)}
        onShowArtifactStudio={
          macArtifactStudioAvailable
            ? () => setShowArtifactStudio(true)
            : undefined
        }
        spherePreviewEnabled={spherePreviewEnabled}
        onRequestSpherePreview={requestSpherePreview}
        onExportSession={sessions.exportSession}
        onImportSession={sessions.importSession}
        // Cloud Share Link is web-only: it POSTs board JSON to /api/share.
        // The iOS bundle is on-device-only per privacy.html / APP_STORE_PACK.md §10;
        // leaving this wired on iOS would put board content on the server and break
        // the "No cloud" promise. iOS users still get the native share sheet via
        // Export PNG/SVG/JSON. See docs/RELEASE_SPEC.md §1.
        onShare={isIos() ? undefined : sessions.generateShareUrl}
        onShowSettings={() => setShowSettingsModal(true)}
        onSetFilterType={setFilterType}
        // MVP: Live collab is web-only. Native WebSocket URL + UX are not
        // production-complete for Capacitor — see docs/RELEASE_SPEC.md §1.
        onShowCollab={
          !isCapacitor() ? () => setShowCollabModal(true) : undefined
        }
        isCollabConnected={!isCapacitor() && collab.isConnected}
        collabParticipantCount={!isCapacitor() ? collab.participants.length : 0}
      />

      {/* Main Canvas */}
      <main
        ref={containerRef}
        onMouseDown={
          !isTouchDevice ? canvasHandlers.handleMouseDown : undefined
        }
        onMouseMove={
          !isTouchDevice
            ? (e: React.MouseEvent) => {
                canvasHandlers.handleMouseMove(e);
                // Broadcast cursor position for collaboration
                if (collab.isConnected && containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const canvasX =
                    (e.clientX - rect.left - viewState.x) / viewState.zoom;
                  const canvasY =
                    (e.clientY - rect.top - viewState.y) / viewState.zoom;
                  collab.broadcastCursor(canvasX, canvasY);
                }
              }
            : undefined
        }
        onMouseUp={
          !isTouchDevice ? () => canvasHandlers.handleMouseUp() : undefined
        }
        onMouseLeave={
          !isTouchDevice
            ? () => {
                canvasHandlers.handleMouseLeave();
                setHoveredNodeId(null);
              }
            : undefined
        }
        onClick={!isTouchDevice ? canvasHandlers.handleCanvasClick : undefined}
        onTouchStart={
          isTouchDevice ? canvasHandlers.handleTouchStart : undefined
        }
        onTouchMove={isTouchDevice ? canvasHandlers.handleTouchMove : undefined}
        onTouchEnd={isTouchDevice ? canvasHandlers.handleTouchEnd : undefined}
        className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 dark:from-[#12141a] dark:via-[#181b24] dark:to-[#1e222d]"
        style={{ touchAction: "none" }}
      >
        {/* Vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none dark:bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.2)_80%,rgba(0,0,0,0.4)_100%)]"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.08) 80%, rgba(0,0,0,0.15) 100%)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.zoom})`,
            transformOrigin: "center",
          }}
        >
          <div className="absolute top-1/2 left-1/2" id="hex-canvas-layer">
            {/* Background Hex Grid */}
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                overflow: "visible",
                width: 1,
                height: 1,
              }}
              aria-hidden="true"
            >
              {backgroundHexGrid.map(({ q, r, key }) => {
                const { x, y } = hexToPixel(q, r);
                return (
                  <path
                    key={`bg-${key}`}
                    d="M86.6 0L173.2 50V150L86.6 200L0 150V50L86.6 0Z"
                    transform={`translate(${x - HEX_WIDTH / 2}, ${y - HEX_HEIGHT / 2}) scale(${HEX_WIDTH / 173.2})`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={0.75}
                    className="text-border/30 dark:text-white/[0.06]"
                  />
                );
              })}
            </svg>

            {/* Connection Lines */}
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                overflow: "visible",
                width: 1,
                height: 1,
              }}
              aria-hidden="true"
            >
              {connectionLines.map(line => (
                <line
                  key={line.key}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={line.color}
                  strokeWidth={line.isDashed ? 1 : 1.5}
                  strokeOpacity={line.isDashed ? 0.3 : 0.15}
                  strokeDasharray={line.isDashed ? "6 4" : undefined}
                />
              ))}
            </svg>

            <HexCanvas
              nodes={visibleNodes}
              freshlyGeneratedNodes={freshlyGeneratedNodes}
              viewState={viewState}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              inspectedNodeId={inspectedNodeId}
              loadingNodes={loadingNodes}
              autoExpandingNodes={autoExpandingNodes}
              generatingNeighbors={generatingNeighbors}
              answeredAskNodes={answeredAskNodes}
              draggedNodeId={draggedNodeId}
              dropTargetId={dropTargetId}
              mergeAnimationKey={mergeAnimationKey}
              searchQuery={search.searchQuery}
              filterType={filterType}
              clusters={clusters}
              isTouchDevice={isTouchDevice}
              justDropped={justDropped}
              nodePresenceMap={nodePresenceMap}
              onNodeClick={handleNodeClick}
              onNodeKeyDown={handleNodeKeyDown}
              onNodeHover={key => {
                setHoveredNodeId(key);
                if (collab.isConnected) collab.broadcastNodePresence(key);
              }}
              onNodeInspect={setInspectedNodeId}
              onDragStart={setDraggedNodeId}
              onDragEnd={() => {
                setDraggedNodeId(null);
                setDropTargetId(null);
                // Release canvas grip after drag ends
                setCanvasIsDragging(false);
                hasDragged.current = false;
              }}
              onDragOver={(e, key) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (
                  dropTargetId !== key &&
                  draggedNodeId &&
                  draggedNodeId !== key
                ) {
                  haptics.dragHover();
                }
                setDropTargetId(key);
              }}
              onDragLeave={key => {
                if (dropTargetId === key) setDropTargetId(null);
              }}
              onDrop={(e, targetKey) => {
                e.preventDefault();
                e.stopPropagation();
                // Release canvas grip before merge
                setCanvasIsDragging(false);
                hasDragged.current = false;
                justDropped.current = true;
                setTimeout(() => {
                  justDropped.current = false;
                }, 200);
                if (draggedNodeId && draggedNodeId !== targetKey)
                  mergeNodes(draggedNodeId, targetKey);
              }}
              onTouchStart={(key, e) => {
                // Fire tap haptic on touch start (onClick may not fire reliably on mobile)
                haptics.tap();
                touchDragStart(key, e);
              }}
              onTouchEnd={e => {
                touchDragEnd();
              }}
              onTouchMove={e => {
                touchDragMove(e);
              }}
            />

            {/* Smart Merge Suggestions — MUST be inside the transform layer
                so each indicator's world coordinates (midpoint.x, midpoint.y)
                get mapped to screen via the same translate/scale that
                positions HexCanvas's nodes. See header comment in
                MergeSuggestionIndicator.tsx for the convention. */}
            {mergeSuggestions.suggestions.length > 0 && (
              <MergeSuggestionIndicator
                suggestions={mergeSuggestions.suggestions}
                viewState={viewState}
                onConnect={handleConnectSuggestion}
                onDismiss={mergeSuggestions.dismissSuggestion}
              />
            )}

            {/* Empty canvas intentionally has no helper text/icon.
                Users can tap anywhere to start without extra chrome. */}
          </div>
        </div>

        {/* Floating Action Bar */}
        {hoveredNode && hoveredNodeId && !editingNodeId && (
          <FloatingActionBar
            node={hoveredNode}
            position={getNodeScreenPosition(hoveredNode)}
            onRefresh={() => refreshSingleNode(hoveredNode)}
            onToggleKeyTheme={() => {
              const key = getNodeKey(hoveredNode.q, hoveredNode.r);
              const isNowKeyTheme = !hoveredNode.isKeyTheme;
              haptics.medium();
              flushSync(() => {
                commitNodes(prev => {
                  const cur = prev[key];
                  if (!cur) return prev;
                  const next = {
                    ...prev,
                    [key]: {
                      ...cur,
                      isKeyTheme: isNowKeyTheme,
                      hierarchyLevel: isNowKeyTheme ? 1 : undefined,
                    },
                  };
                  const keyThemes = Object.keys(next).filter(
                    k => next[k].isKeyTheme
                  );
                  localStorage.setItem(
                    KEY_THEMES_KEY,
                    JSON.stringify(keyThemes)
                  );
                  return next;
                });
              });
              toast.success(isNowKeyTheme ? "Marked as key theme" : "Unmarked");
            }}
            isLoading={loadingNodes.has(hoveredNodeId)}
            onMouseEnter={() => setHoveredNodeId(hoveredNodeId)}
            onMouseLeave={() => setHoveredNodeId(null)}
          />
        )}
      </main>

      {/* Touch Drag Ghost */}
      {touchDragState.isDragging &&
        touchDragState.ghostPos &&
        touchDragState.draggedKey &&
        nodes[touchDragState.draggedKey] && (
          <div
            className="fixed pointer-events-none z-[9999]"
            style={{
              left: touchDragState.ghostPos.x,
              top: touchDragState.ghostPos.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="bg-card/90 backdrop-blur-sm border-2 border-primary rounded-lg px-3 py-1.5 shadow-lg">
              <span className="text-sm font-bold text-foreground">
                {nodes[touchDragState.draggedKey].text}
              </span>
            </div>
          </div>
        )}

      {/* Inspect Panel */}
      {inspectedNodeId && nodes[inspectedNodeId] && (
        <InspectPanel
          node={nodes[inspectedNodeId]}
          nodeId={inspectedNodeId}
          isLoading={loadingNodes.has(inspectedNodeId)}
          onClose={() => setInspectedNodeId(null)}
          onEdit={() => {
            setEditingNodeId(inspectedNodeId);
            setEditTitle(nodes[inspectedNodeId].text);
            setEditDesc(nodes[inspectedNodeId].description || "");
          }}
          onRefresh={() => refreshSingleNode(nodes[inspectedNodeId])}
          onAddContextInfo={() => {
            setContextInfoNodeId(inspectedNodeId!);
            setContextInfoResponse(nodes[inspectedNodeId!]?.contextInfo || "");
          }}
          onToggleKeyTheme={() => {
            const id = inspectedNodeId;
            if (!id) return;
            const isNowKeyTheme = !nodes[id].isKeyTheme;
            haptics.medium();
            flushSync(() => {
              commitNodes(prev => {
                const cur = prev[id];
                if (!cur) return prev;
                return {
                  ...prev,
                  [id]: { ...cur, isKeyTheme: isNowKeyTheme },
                };
              });
            });
          }}
        />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      <EditModal
        isOpen={!!editingNodeId}
        onClose={() => setEditingNodeId(null)}
        node={editingNodeId ? nodes[editingNodeId] : null}
        nodeId={editingNodeId}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        editDesc={editDesc}
        setEditDesc={setEditDesc}
        onSave={regenerateNeighbors => {
          if (editingNodeId) {
            const id = editingNodeId;
            const updatedNode = {
              ...nodes[id],
              text: editTitle,
              description: editDesc,
            };
            commitNodes(prev => {
              const cur = prev[id];
              if (!cur) return prev;
              return {
                ...prev,
                [id]: {
                  ...cur,
                  text: editTitle,
                  description: editDesc,
                },
              };
            });
            if (regenerateNeighbors) {
              void generateNeighbors(updatedNode, true);
            }
          }
          setEditingNodeId(null);
        }}
        onChangeType={type => {
          if (editingNodeId) {
            const id = editingNodeId;
            commitNodes(prev => {
              const cur = prev[id];
              if (!cur) return prev;
              return { ...prev, [id]: { ...cur, type } };
            });
          }
        }}
      />

      <OnboardingTour
        showTutorial={!appStoreShowcase && tourActive}
        onTutorialComplete={completeTour}
        onStartBrainstorm={startBrainstorm}
        nodeCount={Object.keys(nodes).length}
        // True while ANY generation is in flight (loadingNodes set or
        // generatingNeighbors set non-empty). Tour waits for both to
        // settle before showing the dim + cards.
        isGenerating={loadingNodes.size > 0 || generatingNeighbors.size > 0}
      />

      {/* Onboarding prompt — reuses ContextPromptModal for initial brainstorm */}
      <ContextPromptModal
        isOpen={showOnboardingPrompt}
        question="What are you thinking about?"
        variant="onboarding"
        response={onboardingResponse}
        setResponse={setOnboardingResponse}
        onGenerate={() => {
          if (onboardingResponse.trim()) {
            setShowOnboardingPrompt(false);
            startBrainstorm(onboardingResponse.trim());
            setOnboardingResponse("");
          }
        }}
        onSkip={() => {
          setShowOnboardingPrompt(false);
          setOnboardingResponse("");
          startBrainstorm("brainstorm");
        }}
        onClose={() => {
          // Mark dismissed so the empty-board effect above doesn't
          // re-open this modal 600ms later. onGenerate and onSkip
          // don't set the flag because they seed nodes, which removes
          // the empty condition anyway.
          dismissedOnboardingRef.current = true;
          setShowOnboardingPrompt(false);
          setOnboardingResponse("");
        }}
      />

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
      />

      {macArtifactStudioAvailable && (
        <ArtifactStudio
          isOpen={showArtifactStudio}
          onClose={() => setShowArtifactStudio(false)}
          boardId={sessions.artifactBoardId}
          nodes={nodes}
          selectedNodeIds={selectedNodeId ? [selectedNodeId] : []}
          branchRootNodeId={selectedNodeId}
          services={
            macArtifactHost?.artifactStudioServices ?? webArtifactServices
          }
          beforeExport={sessions.flushNativeWorkspace}
          onAttachImage={attachArtifactImage}
          cloudSync={isAuthenticated ? syncArtifactToCloud : undefined}
          onCloudSignIn={!isAuthenticated ? login : undefined}
        />
      )}

      <SessionsModal
        isOpen={sessions.showSessionsModal}
        onClose={() => sessions.setShowSessionsModal(false)}
        savedSessions={sessions.savedSessions}
        sessionName={sessions.sessionName}
        setSessionName={sessions.setSessionName}
        nodeCount={Object.keys(nodes).length}
        onSave={sessions.saveSession}
        onLoad={sessions.loadSession}
        onLoadAutosave={sessions.loadAutosave}
        onDelete={sessions.deleteSession}
        onRename={sessions.renameSession}
        isSaving={sessions.isSaving}
        activeCloudSessionId={sessions.activeCloudSessionId}
        activeCloudSessionName={sessions.activeCloudSessionName}
      />

      <TemplatesModal
        isOpen={templates.showTemplates}
        onClose={() => templates.setShowTemplates(false)}
        selectedCategory={templates.selectedCategory}
        setSelectedCategory={templates.setSelectedCategory}
        onSelectTemplate={templates.selectTemplate}
      />

      <TemplateContextModal
        pendingTemplate={templates.pendingTemplate}
        templateContext={templates.templateContext}
        setTemplateContext={templates.setTemplateContext}
        isGenerating={templates.isGeneratingTemplate}
        onUseDefault={templates.handleUseDefault}
        onGenerate={templates.generateContextualTemplate}
        onClose={() => {
          templates.setPendingTemplate(null);
          templates.setTemplateContext("");
        }}
      />

      <ContextPromptModal
        isOpen={showContextPrompt}
        question={clarifyingPromptText}
        suggestedAnswers={clarifyingNode?.suggestedAnswers}
        response={contextResponse}
        setResponse={setContextResponse}
        onGenerate={() => {
          if (clarifyingNode) {
            const nodeKey = getNodeKey(clarifyingNode.q, clarifyingNode.r);
            setContextHistory({
              ...contextHistory,
              [nodeKey]: contextResponse,
            });
            setShowContextPrompt(false);
            generateNeighbors(clarifyingNode, false, contextResponse);
            setClarifyingNode(null);
            setContextResponse("");
          }
        }}
        onSkip={() => {
          if (clarifyingNode) {
            setShowContextPrompt(false);
            generateNeighbors(clarifyingNode, false, "");
            setClarifyingNode(null);
            setContextResponse("");
          }
        }}
        onClose={() => {
          setShowContextPrompt(false);
          setClarifyingNode(null);
          setContextResponse("");
        }}
      />

      {/* Share-link Modal — hidden on iOS (export-only sharing), matching
          the onShare gate above */}
      {!isIos() && (
        <ShareModal
          isOpen={sessions.showShareModal}
          onClose={() => sessions.setShowShareModal(false)}
          shareUrl={sessions.shareUrl}
          iosShareUrl={sessions.iosShareUrl}
          copied={sessions.copied}
          onCopy={sessions.copyShareUrl}
          onBringToIos={sessions.bringToIos}
        />
      )}

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        toggleTheme={toggleTheme}
        creativity={aiGeneration.creativity}
        setCreativity={aiGeneration.setCreativity}
        fontSizeMultiplier={fontSizeMultiplier}
        setFontSizeMultiplier={setFontSizeMultiplier}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        enableHighContrast={enableHighContrast}
        setEnableHighContrast={setEnableHighContrast}
        enableAnimations={enableAnimations}
        setEnableAnimations={setEnableAnimations}
        enableAutoSave={enableAutoSave}
        setEnableAutoSave={setEnableAutoSave}
        enableSmartExpansion={enableSmartExpansion}
        setEnableSmartExpansion={setEnableSmartExpansion}
        bridgingIntensity={aiGeneration.bridgingIntensity}
        setBridgingIntensity={aiGeneration.setBridgingIntensity}
        provider={providerSettings.provider}
        setProvider={providerSettings.setProvider}
        apiKeys={providerSettings.apiKeys}
        setApiKey={providerSettings.setApiKey}
        isProviderConfigured={providerSettings.isConfigured}
        clearKeys={providerSettings.clearKeys}
        serverProviders={providerSettings.serverProviders}
        appleIntelligenceAvailable={providerSettings.appleIntelligenceAvailable}
        visibleProviders={providerSettings.visibleProviders}
        androidGemmaStatus={providerSettings.androidGemmaStatus}
        androidAICoreStatus={providerSettings.androidAICoreStatus}
        androidGemmaDownload={providerSettings.androidGemmaDownload}
        isDownloadingAndroidModel={providerSettings.isDownloadingAndroidModel}
        downloadAndroidModel={providerSettings.downloadAndroidModel}
        spherePreviewEnabled={spherePreviewEnabled}
        onRequestSpherePreview={requestSpherePreview}
        onDeleteBoard={requestDeleteBoard}
      />

      {/* Minimap — always rendered when nodes exist; user collapses
          inline via the X button on the minimap itself. */}
      {Object.keys(nodes).length > 0 && containerRef.current && (
        <div className="absolute bottom-4 right-4 z-30 pointer-events-auto interactive-ui">
          <Minimap
            nodes={nodes}
            viewState={viewState}
            containerSize={{
              width: containerRef.current.clientWidth,
              height: containerRef.current.clientHeight,
            }}
            onNavigate={(x, y) => setViewState({ ...viewState, x, y })}
            selectedNodeId={selectedNodeId}
          />
        </div>
      )}

      {/* Screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only absolute w-px h-px p-0 -m-px overflow-hidden"
        style={{ clip: "rect(0, 0, 0, 0)" }}
      >
        {loadingNodes.size > 0 &&
          `Generating ideas for ${Array.from(loadingNodes)
            .map(k => nodes[k]?.text)
            .filter(Boolean)
            .join(", ")}`}
      </div>

      {/* New cluster prompt — reuses ContextPromptModal */}
      <ContextPromptModal
        isOpen={!!pendingClusterCoords}
        question="What's your new idea?"
        response={newClusterResponse}
        setResponse={setNewClusterResponse}
        onGenerate={() => {
          if (newClusterResponse.trim()) {
            handleNewClusterConfirm(newClusterResponse.trim());
          }
        }}
        onSkip={() => {
          handleNewClusterConfirm("new idea");
        }}
        onClose={() => {
          setPendingClusterCoords(null);
          setNewClusterResponse("");
        }}
      />
      {/* Context info editing — reuses ContextPromptModal */}
      <ContextPromptModal
        isOpen={!!contextInfoNodeId}
        question="Add context or notes for this node"
        response={contextInfoResponse}
        setResponse={setContextInfoResponse}
        onGenerate={() => {
          if (contextInfoNodeId) {
            const id = contextInfoNodeId;
            const val = contextInfoResponse.trim() || undefined;
            commitNodes(prev => {
              const cur = prev[id];
              if (!cur) return prev;
              return {
                ...prev,
                [id]: { ...cur, contextInfo: val },
              };
            });
            toast.success(
              contextInfoResponse.trim()
                ? "Context info added!"
                : "Context info cleared."
            );
            setContextInfoNodeId(null);
            setContextInfoResponse("");
          }
        }}
        onSkip={() => {
          setContextInfoNodeId(null);
          setContextInfoResponse("");
        }}
        onClose={() => {
          setContextInfoNodeId(null);
          setContextInfoResponse("");
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      {/* Collaboration Modal — hidden in Capacitor (offline) mode */}
      {!isCapacitor() && (
        <CollabModal
          isOpen={showCollabModal}
          onClose={() => setShowCollabModal(false)}
          isConnected={collab.isConnected}
          isConnecting={collab.isConnecting}
          connectionError={collab.connectionError}
          roomId={collab.roomId}
          pendingRoomId={collab.pendingRoomId}
          participants={collab.participants}
          onCreateRoom={collab.createRoom}
          onJoinRoom={collab.joinRoom}
          onLeaveRoom={collab.leaveRoom}
        />
      )}

      {/* Remote Cursors */}
      {collab.isConnected && collab.remoteCursors.length > 0 && (
        <RemoteCursors cursors={collab.remoteCursors} viewState={viewState} />
      )}
    </div>
  );
}
