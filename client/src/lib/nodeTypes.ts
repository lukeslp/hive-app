/**
 * Node Type Definitions
 *
 * Single source of truth for node type styling configuration.
 * Extracted from HiveMindApp.tsx and HexCanvas.tsx to eliminate duplication.
 *
 * For `default.bgSolid`, the HiveMindApp.tsx value (#64748b) is canonical.
 */

import type { NodeTypeStyle } from '@/types/hexmind';
import {
  Zap,
  Lightbulb,
  Activity,
  Terminal,
  HelpCircle,
  Target,
  Box,
} from '@/lib/icons';

export const NODE_TYPES: Record<string, NodeTypeStyle> = {
  root: {
    id: "root",
    label: "Core",
    color: "text-yellow-400",
    border: "stroke-yellow-500",
    bg: "fill-yellow-500/20",
    bgSolid: "#facc15",
    icon: Zap,
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
