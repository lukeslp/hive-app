/**
 * Toolbar - Header bar with all controls
 * Mobile-responsive: collapses secondary actions into overflow menu on small screens
 */

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap,
  Info,
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
  MoreHorizontal,
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
  onToggleFilter: () => void;
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
  onToggleFilter,
  onSetFilterType,
  onShowCollab,
  isCollabConnected,
  collabParticipantCount,
}: ToolbarProps) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [filesMenuOpen, setFilesMenuOpen] = useState(false);

  return (
    <header
      className="absolute top-0 left-0 right-0 z-20 px-2 sm:px-4 pb-2 sm:pb-4 flex items-center justify-between pointer-events-none gap-2"
      style={{
        // env(safe-area-inset-top) is 0 on browsers without notches, so
        // desktop web behavior is unchanged. On iPhone with Dynamic Island
        // the toolbar drops below it instead of being occluded.
        paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
      }}
    >
      {/* Left Actions */}
      <div
        aria-label="Main Controls"
        className="interactive-ui bg-card/90 backdrop-blur border border-border p-1.5 sm:p-2 px-2.5 sm:px-4 rounded-xl flex items-center gap-1.5 sm:gap-4 pointer-events-auto shadow-2xl min-w-0 flex-shrink"
      >
        {/* Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 fill-yellow-400" />
          <span className="font-bold hidden sm:inline text-sm">Hexmind</span>
        </div>
        <div className="h-5 sm:h-6 w-px bg-accent flex-shrink-0" />

        {nodeCount === 0 ? (
          <button
            onClick={onShowWelcome}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <span className="text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap">
              NEW BOARD
            </span>
            <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Generation counter — only show when generations have been used */}
            {generationsThisSession > 0 && (
              <span
                className="flex items-center gap-0.5 text-[10px] sm:text-xs text-muted-foreground tabular-nums flex-shrink-0"
                title={`${generationsThisSession} AI generation${generationsThisSession !== 1 ? 's' : ''} this session`}
              >
                <Zap className="w-3 h-3 text-amber-400/70" />
                {generationsThisSession}
              </span>
            )}

            {/* Undo/Redo — always visible */}
            <div className="flex items-center gap-0.5 border-l border-border pl-1 sm:pl-2">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                aria-label={`Undo last action${!canUndo ? " (unavailable)" : ""}`}
                className="p-2.5 hover:bg-accent text-muted-foreground rounded-lg disabled:opacity-30"
              >
                <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                aria-label={`Redo last action${!canRedo ? " (unavailable)" : ""}`}
                className="p-2.5 hover:bg-accent text-muted-foreground rounded-lg disabled:opacity-30"
              >
                <Redo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            {/* Desktop-only actions */}
            <div className="hidden sm:flex items-center gap-1">
              {/* Search Toggle */}
              <button
                onClick={onToggleSearch}
                aria-label={`${isSearchOpen ? "Close" : "Open"} search panel`}
                aria-pressed={isSearchOpen}
                className={`p-2.5 rounded-lg transition-colors ${
                  isSearchOpen
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent text-muted-foreground"
                }`}
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Key Theme Filter */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleKeyThemes}
                    className={`p-2.5 rounded-lg transition-colors ${
                      showOnlyKeyThemes
                        ? "bg-yellow-400/20 text-yellow-300"
                        : "hover:bg-accent text-foreground/80"
                    }`}
                    aria-label="Filter key themes"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {showOnlyKeyThemes ? "Show All" : "Filter Key Themes"}
                </TooltipContent>
              </Tooltip>

              {/* Files & Sharing — folder icon opens a dropdown that
                  consolidates Sessions, Export (PNG/SVG/JSON), Import,
                  and Share into one menu, freeing up four toolbar slots
                  on desktop. */}
              <div className="relative border-l border-border pl-2 ml-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setFilesMenuOpen((v) => !v)}
                      aria-label="Files and sharing"
                      aria-expanded={filesMenuOpen}
                      aria-haspopup="true"
                      className={`p-2.5 rounded-lg transition-colors ${
                        filesMenuOpen
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Files & Sharing</TooltipContent>
                </Tooltip>
                {filesMenuOpen && (
                  <>
                    {/* Backdrop captures outside-click for dismiss */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setFilesMenuOpen(false)}
                    />
                    <div
                      // No role="menu" — the ARIA menu pattern requires
                      // arrow-key nav, focus management, and home/end
                      // handling we don't implement. Plain buttons in a
                      // div are a11y-correct without breaking the menu
                      // contract. Escape-to-close added on the trigger.
                      onKeyDown={(e) => { if (e.key === "Escape") setFilesMenuOpen(false); }}
                      className="absolute top-full right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 min-w-[200px] py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                    >
                      <button
                        onClick={() => { onShowSessions(); setFilesMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                      >
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        Sessions
                      </button>
                      <div className="h-px bg-border my-1" />
                      <button
                        onClick={() => { onExportSession(); setFilesMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                      >
                        <Download className="w-4 h-4 text-muted-foreground" />
                        Save (JSON)
                      </button>
                      <label
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground cursor-pointer"
                      >
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
                        onClick={() => { onExportPNG(); setFilesMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                      >
                        <Download className="w-4 h-4 text-muted-foreground" />
                        Export PNG
                      </button>
                      <button
                        onClick={() => { onExportSVG(); setFilesMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                      >
                        <Download className="w-4 h-4 text-muted-foreground" />
                        Export SVG
                      </button>
                      <div className="h-px bg-border my-1" />
                      <button
                        onClick={() => { onShare(); setFilesMenuOpen(false); }}
                        disabled={nodeCount === 0}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Share2 className="w-4 h-4 text-muted-foreground" />
                        Share Link
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile overflow menu */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="p-2.5 hover:bg-accent text-muted-foreground rounded-lg"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {moreOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 min-w-[180px] py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button
                      onClick={() => { onToggleSearch(); setMoreOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                    >
                      <Search className="w-4 h-4 text-muted-foreground" />
                      Search
                    </button>
                    <button
                      onClick={() => { onToggleKeyThemes(); setMoreOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent ${
                        showOnlyKeyThemes ? "text-yellow-400" : "text-foreground"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      {showOnlyKeyThemes ? "Show All" : "Key Themes"}
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => { onExportPNG(); setMoreOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                      Export PNG
                    </button>
                    <button
                      onClick={() => { onExportSVG(); setMoreOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                      Export SVG
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => { onShowSessions(); setMoreOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                    >
                      <FolderOpen className="w-4 h-4 text-muted-foreground" />
                      Sessions
                    </button>
                    <button
                      onClick={() => { onExportSession(); setMoreOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                      Export JSON
                    </button>
                    <label className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground cursor-pointer">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      Import JSON
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) onImportSession(e.target.files[0]);
                          setMoreOpen(false);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => { onShare(); setMoreOpen(false); }}
                      disabled={nodeCount === 0}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent text-foreground disabled:opacity-50"
                    >
                      <Share2 className="w-4 h-4 text-muted-foreground" />
                      Share
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter Panel (Floating) */}
      {filterType && (
        <div className="interactive-ui pointer-events-auto absolute top-14 sm:top-20 right-2 sm:right-4 z-30 bg-card/90 backdrop-blur border border-border p-3 rounded-xl animate-in slide-in-from-top-2 shadow-xl max-w-[calc(100vw-1rem)]">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Filter by Type
          </p>
          <div className="space-y-1">
            <button
              onClick={() => onSetFilterType(null)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm transition-colors text-foreground"
            >
              All Types
            </button>
            {Object.entries(NODE_TYPES).map(([key, type]) => {
              if (key === "default") return null;
              const Icon = type.icon;
              return (
                <button
                  key={key}
                  onClick={() => onSetFilterType(key)}
                  className={`w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm transition-colors flex items-center gap-2 ${
                    filterType === key ? "bg-accent" : ""
                  }`}
                >
                  <Icon className={`w-4 h-4 ${type.color}`} />
                  <span className="text-foreground">{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar (Floating) */}
      {isSearchOpen && (
        <div className="interactive-ui pointer-events-auto absolute top-14 sm:top-20 left-2 sm:left-4 z-30 bg-card/90 backdrop-blur border border-border p-2 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2 w-[calc(100vw-1rem)] sm:w-64 max-w-[280px] shadow-xl">
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
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Right Controls */}
      <div
        aria-label="View Controls"
        className="flex items-center gap-1 sm:gap-2 pointer-events-auto interactive-ui flex-shrink-0"
      >
        {onShowCollab && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onShowCollab}
                className={`relative p-2 sm:p-3 bg-card/90 backdrop-blur border border-border rounded-lg sm:rounded-xl transition-colors ${
                  isCollabConnected ? "bg-green-500/10 border-green-500/30" : "hover:bg-accent"
                }`}
              >
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                {isCollabConnected && (collabParticipantCount ?? 0) > 1 && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {collabParticipantCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isCollabConnected ? "Collaborating" : "Collaborate"}</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowSettings}
              className="p-2 sm:p-3 bg-card/90 backdrop-blur border border-border rounded-lg sm:rounded-xl hover:bg-accent transition-colors"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleFilter}
              className={`p-2 sm:p-3 bg-card/90 border border-border rounded-lg sm:rounded-xl transition-colors ${
                filterType ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Filter by Type</TooltipContent>
        </Tooltip>

        {/* Minimap toggle and fullscreen reset removed — the minimap
            now collapses inline via its own button (frees one toolbar
            slot) and the reset-view affordance was rarely used. */}
      </div>
    </header>
  );
};
