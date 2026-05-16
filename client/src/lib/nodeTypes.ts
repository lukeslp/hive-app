/**
 * Node Type Definitions
 *
 * Single source of truth for node type styling configuration.
 * Extracted from HiveMindApp.tsx and HexCanvas.tsx to eliminate duplication.
 *
 * For `default.bgSolid`, the HiveMindApp.tsx value (#64748b) is canonical.
 */

import type { NodeTypeStyle } from "@/types/hexmind";
import {
  Hexagon,
  Lightbulb,
  Activity,
  Terminal,
  HelpCircle,
  Target,
  Box,
} from "@/lib/icons";

export const NODE_TYPES: Record<string, NodeTypeStyle> = {
  root: {
    id: "root",
    label: "Core",
    color: "text-yellow-400",
    border: "stroke-yellow-500",
    bg: "fill-yellow-500/20",
    bgSolid: "#facc15",
    icon: Hexagon,
  },
  concept: {
    id: "concept",
    label: "Concept",
    color: "text-amber-400",
    border: "stroke-amber-500",
    bg: "fill-amber-500/20",
    bgSolid: "#f59e0b",
    icon: Lightbulb,
  },
  action: {
    id: "action",
    label: "Action",
    color: "text-rose-400",
    border: "stroke-rose-500",
    bg: "fill-rose-500/20",
    bgSolid: "#f43f5e",
    icon: Activity,
  },
  technical: {
    id: "technical",
    label: "Technical",
    color: "text-cyan-400",
    border: "stroke-cyan-500",
    bg: "fill-cyan-500/20",
    bgSolid: "#22d3ee",
    icon: Terminal,
  },
  question: {
    id: "question",
    label: "Question",
    color: "text-purple-400",
    border: "stroke-purple-500",
    bg: "fill-purple-500/20",
    bgSolid: "#a78bfa",
    icon: HelpCircle,
  },
  risk: {
    id: "risk",
    label: "Risk",
    color: "text-red-500",
    border: "stroke-red-600",
    bg: "fill-red-500/20",
    bgSolid: "#ef4444",
    icon: Target,
  },
  default: {
    id: "default",
    label: "Node",
    color: "text-slate-400",
    border: "stroke-slate-500",
    bg: "fill-slate-500/20",
    bgSolid: "#64748b",
    icon: Box,
  },
};

/**
 * Visual signal for tiles that will OPEN A CLARIFICATION MODAL on tap
 * instead of expanding into 6 sub-branches. WCAG 1.4.1 requires color
 * to never be the SOLE indicator — these tokens give three independent
 * channels (geometry, icon, text) plus the parent component lifts the
 * aria-label to "needs clarification" / "answered" so screen readers
 * also get the state.
 *
 * Why not full background color: conscience's WCAG 1.4.3 audit showed
 * solid tints from NODE_TYPES.bgSolid fail contrast on 3+ of 6 colors
 * with no text color that passes AA across the palette. Geometry +
 * iconography + text label survives all three color-blindness
 * simulators (deuteranopia, protanopia, tritanopia).
 */
export const ASK_INDICATOR = {
  /** SVG stroke-dasharray on the hex path. Universal "awaiting input" cue. */
  borderDash: "4 3",
  /** Lucide icon for the corner badge (top-right of the hex). */
  badgeIcon: HelpCircle,
  /** Background class for the badge — owns its own contrast via tokens. */
  badgeBg: "bg-popover",
  /** Foreground class for the badge icon. */
  badgeFg: "text-popover-foreground",
  /** Visible pill text — the third non-color channel. */
  pillText: "Ask",
};
