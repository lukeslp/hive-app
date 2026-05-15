/**
 * Toolbar — single hex-anchored pill in the upper-right that expands
 * leftward into a topbar of all board controls. Replaces the prior
 * dual-cluster (left logo / right controls) layout.
 *
 * Collapsed: just the hex icon (visual brand + entry point).
 * Expanded: horizontal pill with undo/redo, search, filter, files,
 * collab, new board, and settings.
 */

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Zap,
  Hexagon,
  Download,
  Undo2,
  Redo2,
  Search,
  Sparkles,
  FolderOpen,
  Upload,
  Share2,
  X,
  Settings,
  Filter,
  Users,
} from "@/lib/icons";
import { NODE_TYPES } from "@/lib/nodeTypes";

interface ToolbarProps {
  nodeCount: number;
  generationsThisSession: number;
  canUndo: boolean;
  canRedo: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: Array<{ q: number; r: number }>;
  currentSearchIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  showOnlyKeyThemes: boolean;
  filterType: string | null;
  onShowWelcome: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSearch: () => void;
  onSearchChange: (value: string) => void;
  onCycleSearch: () => void;
  onCloseSearch: () => void;
  onToggleKeyThemes: () => void;
  onShowSessions: () => void;
  onExportSession: () => void;
  onImportSession: (file: File) => void;
  onShare: () => void;
  onShowSettings: () => void;
  onSetFilterType: (type: string | null) => void;
  onShowCollab?: () => void;
  isCollabConnected?: boolean;
  collabParticipantCount?: number;
}

export const Toolbar = ({
  nodeCount,
  generationsThisSession,
  canUndo,
  canRedo,
  isSearchOpen,
  searchQuery,
  searchResults,
  currentSearchIndex,
  searchInputRef,
  showOnlyKeyThemes,
  filterType,
  onShowWelcome,
  onExportPNG,
  onExportSVG,
  onUndo,
  onRedo,
  onToggleSearch,
  onSearchChange,
  onCycleSearch,
  onCloseSearch,
  onToggleKeyThemes,
  onShowSessions,
  onExportSession,
  onImportSession,
  onShare,
  onShowSettings,
  onSetFilterType,
  onShowCollab,
  isCollabConnected,
  collabParticipantCount,
}: ToolbarProps) => {
  // Single source of truth: is the topbar expanded?
  const [expanded, setExpanded] = useState(false);
  const [filesMenuOpen, setFilesMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  const hasFilterActive = !!filterType || showOnlyKeyThemes;

  const collapse = () => {
    setExpanded(false);
    setFilesMenuOpen(false);
    setFilterMenuOpen(false);
  };

  // Sub-popovers close when topbar collapses.
  useEffect(() => {
    if (!expanded) {
      setFilesMenuOpen(false);
      setFilterMenuOpen(false);
    }
  }, [expanded]);

  // Escape closes sub-popovers first, then the topbar itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filesMenuOpen || filterMenuOpen) {
        setFilesMenuOpen(false);
        setFilterMenuOpen(false);
        return;
      }
      if (expanded) collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, filesMenuOpen, filterMenuOpen]);

  // Click-away collapses the topbar (but never closes via canvas pan).
  useEffect(() => {
    if (!expanded) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target || !barRef.current) return;
      if (barRef.current.contains(target)) return;
      // Sub-menus render outside barRef; let their own backdrops handle close.
      if ((target as HTMLElement).closest?.("[data-toolbar-popover]")) return;
      collapse();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [expanded]);

  const iconBtn =
    "h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full text-foreground/80 hover:text-foreground hover:bg-accent/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <header
      className="absolute top-0 left-0 right-0 z-30 px-2 sm:px-4 pb-2 sm:pb-4 flex items-start justify-end pointer-events-none"
      style={{
        // env(safe-area-inset-top) is 0 on browsers without notches; on
        // iPhone the toolbar drops below the Dynamic Island instead of
        // sitting under it.
        paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
      }}
    >
      <div
        ref={barRef}
        aria-label="Board controls"
        className={`pointer-events-auto interactive-ui flex items-center gap-1 bg-card/85 backdrop-blur-xl border border-border/70 shadow-2xl rounded-full transition-all duration-200 ${
          expanded ? "px-1.5 sm:px-2" : "px-1"
        }`}
      >
        {/* Expanded controls slide in from the right (closer to hex). */}
        {expanded && (
          <div
            className="flex items-center gap-0.5 sm:gap-1 animate-in fade-in slide-in-from-right-2 duration-200"
            role="group"
            aria-label="Topbar actions"
          >
            {/* Generation counter — purely informational, when used. */}
            {nodeCount > 0 && generationsThisSession > 0 && (
              <span
                className="hidden sm:flex items-center gap-1 px-2 text-[11px] text-muted-foreground tabular-nums"
                title={`${generationsThisSession} AI generation${
                  generationsThisSession === 1 ? "" : "s"
                } this session`}
                aria-label={`${generationsThisSession} AI generations this session`}
              >
                <Zap className="w-3 h-3 text-yellow-400/80" />
                {generationsThisSession}
              </span>
            )}

            {/* Undo / Redo — only meaningful when there are nodes. */}
            {nodeCount > 0 && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onUndo}
                      disabled={!canUndo}
                      aria-label="Undo"
                      className={iconBtn}
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Undo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onRedo}
                      disabled={!canRedo}
                      aria-label="Redo"
                      className={iconBtn}
                    >
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Redo</TooltipContent>
                </Tooltip>
                <span className="w-px h-5 bg-border/70 mx-0.5" aria-hidden="true" />
              </>
            )}

            {/* Search */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleSearch}
                  aria-pressed={isSearchOpen}
                  aria-label={isSearchOpen ? "Close search" : "Open search"}
                  className={`${iconBtn} ${
                    isSearchOpen ? "bg-accent text-foreground" : ""
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Search</TooltipContent>
            </Tooltip>

            {/* Files & Sharing */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMenuOpen(false);
                      setFilesMenuOpen((v) => !v);
                    }}
                    aria-haspopup="true"
                    aria-expanded={filesMenuOpen}
                    aria-label="Files and sharing"
                    className={`${iconBtn} ${
                      filesMenuOpen ? "bg-accent text-foreground" : ""
                    }`}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Files &amp; sharing</TooltipContent>
              </Tooltip>
              {filesMenuOpen && (
                <div
                  data-toolbar-popover
                  className="absolute top-full right-0 mt-2 bg-card/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl z-40 min-w-[220px] py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setFilesMenuOpen(false);
                  }}
                >
                  <button
                    onClick={() => {
                      onShowSessions();
                      setFilesMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    Sessions
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      onExportSession();
                      setFilesMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" />
                    Save (JSON)
                  </button>
                  <label className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground cursor-pointer">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    Load (JSON)
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) onImportSession(e.target.files[0]);
                        setFilesMenuOpen(false);
                      }}
                    />
                  </label>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      onExportPNG();
                      setFilesMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" />
                    Export PNG
                  </button>
                  <button
                    onClick={() => {
                      onExportSVG();
                      setFilesMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" />
                    Export SVG
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      onShare();
                      setFilesMenuOpen(false);
                    }}
                    disabled={nodeCount === 0}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Share2 className="w-4 h-4 text-muted-foreground" />
                    Share link
                  </button>
                </div>
              )}
            </div>

            {/* Filter (per-type + key themes) */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setFilesMenuOpen(false);
                      setFilterMenuOpen((v) => !v);
                    }}
                    aria-haspopup="true"
                    aria-expanded={filterMenuOpen}
                    aria-label="Filter view"
                    className={`${iconBtn} ${
                      filterMenuOpen || hasFilterActive
                        ? "bg-accent text-foreground"
                        : ""
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Filter</TooltipContent>
              </Tooltip>
              {filterMenuOpen && (
                <div
                  data-toolbar-popover
                  className="absolute top-full right-0 mt-2 bg-card/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl z-40 min-w-[220px] py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setFilterMenuOpen(false);
                  }}
                >
                  <button
                    onClick={() => {
                      onToggleKeyThemes();
                      setFilterMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                  >
                    <Sparkles
                      className={`w-4 h-4 ${
                        showOnlyKeyThemes
                          ? "text-yellow-300"
                          : "text-muted-foreground"
                      }`}
                    />
                    <span className="flex-1 text-left">
                      {showOnlyKeyThemes
                        ? "Show all (key themes only ON)"
                        : "Show only key themes"}
                    </span>
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      onSetFilterType(null);
                      setFilterMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent ${
                      !filterType
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="w-4 h-4 inline-block" aria-hidden="true" />
                    All types
                  </button>
                  {Object.values(NODE_TYPES)
                    .filter((t) => t.id !== "default" && t.id !== "root")
                    .map((type) => {
                      const Icon = type.icon;
                      const isActive = filterType === type.id;
                      return (
                        <button
                          key={type.id}
                          onClick={() => {
                            onSetFilterType(type.id);
                            setFilterMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent ${
                            isActive
                              ? "text-foreground font-medium bg-accent/40"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${type.color}`} />
                          Only {type.label}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Collab — web only (parent omits onShowCollab on Capacitor) */}
            {onShowCollab && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onShowCollab}
                    aria-label={
                      isCollabConnected ? "Collaborating" : "Collaborate"
                    }
                    className={`relative ${iconBtn} ${
                      isCollabConnected
                        ? "text-emerald-400 hover:text-emerald-300"
                        : ""
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    {isCollabConnected &&
                      (collabParticipantCount ?? 0) > 1 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-emerald-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {collabParticipantCount}
                        </span>
                      )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {isCollabConnected ? "Collaborating" : "Collaborate"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* New board */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onShowWelcome();
                    collapse();
                  }}
                  aria-label="New board"
                  className={iconBtn}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>New board</TooltipContent>
            </Tooltip>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onShowSettings();
                    collapse();
                  }}
                  aria-label="Settings"
                  className={iconBtn}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>

            <span className="w-px h-5 bg-border/70 mx-0.5" aria-hidden="true" />
          </div>
        )}

        {/* Hex anchor — always visible. Toggles the topbar. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Close board controls" : "Open board controls"}
              aria-expanded={expanded}
              className={`h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center rounded-full transition-all duration-200 ${
                expanded
                  ? "bg-accent text-foreground"
                  : "hover:bg-accent/60 text-foreground"
              }`}
            >
              {expanded ? (
                <X className="w-5 h-5" />
              ) : (
                <Hexagon
                  className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400"
                  strokeWidth={2.5}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {expanded ? "Close" : "Board controls"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Search Bar (Floating) — appears under the topbar when search is open */}
      {isSearchOpen && (
        <div className="interactive-ui pointer-events-auto absolute top-14 sm:top-20 left-2 sm:left-4 z-30 bg-card/95 backdrop-blur-xl border border-border/70 p-2 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top-2 w-[calc(100vw-1rem)] sm:w-72 max-w-[320px] shadow-2xl">
          <Search className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCycleSearch()}
            placeholder="Find idea..."
            className="bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {searchResults.length > 0 && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap px-2">
              {currentSearchIndex + 1}/{searchResults.length}
            </span>
          )}
          <button
            onClick={onCloseSearch}
            className="p-1 hover:text-foreground text-muted-foreground flex-shrink-0"
            aria-label="Close search"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </header>
  );
};
