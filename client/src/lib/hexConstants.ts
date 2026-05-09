/**
 * Hex Grid Constants
 *
 * Shared constants for the hexagonal grid system.
 * Extracted from HexmindApp.tsx and useAIGeneration.ts to eliminate duplication.
 */

// --- Gemini Model ---

export const GEMINI_TEXT_MODEL = "gemini-3-flash-preview";

// --- Hex Geometry ---

export const HEX_SIZE = 80;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// --- Hex Directions (pointy-top hexagon neighbors) ---

export const DIRECTIONS = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // Northeast
  { q: 0, r: -1 },  // Northwest
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // Southwest
  { q: 0, r: 1 },   // Southeast
] as const;

// --- Cluster Color Palette ---

export const CLUSTER_COLORS: Array<{ stroke: string; glow: string; accent: string }> = [
  { stroke: "stroke-yellow-500", glow: "shadow-yellow-500/30", accent: "bg-yellow-500" },   // main cluster
  { stroke: "stroke-cyan-400",   glow: "shadow-cyan-400/30",   accent: "bg-cyan-400" },     // cluster 2
  { stroke: "stroke-pink-400",   glow: "shadow-pink-400/30",   accent: "bg-pink-400" },     // cluster 3
  { stroke: "stroke-emerald-400",glow: "shadow-emerald-400/30",accent: "bg-emerald-400" },  // cluster 4
  { stroke: "stroke-orange-400", glow: "shadow-orange-400/30", accent: "bg-orange-400" },   // cluster 5
  { stroke: "stroke-violet-400", glow: "shadow-violet-400/30", accent: "bg-violet-400" },   // cluster 6
];

// --- Storage Keys ---
//
// Keys retain the `hexpand_` prefix from the pre-rename era (Hexpand →
// Hexmind, 2026-05-08). DO NOT rename these — TestFlight tester data
// (saved sessions, autosaves, API keys, provider selection) lives under
// the old prefix in localStorage and would be lost on a key rename.
// A migration shim is the only safe rename path; not worth the effort
// at this scale.

export const STORAGE_KEY = "hexpand_sessions";
export const AUTOSAVE_KEY = "hexpand_autosave";
export const API_KEYS_STORAGE_KEY = "hexpand_api_keys";
export const PROVIDER_STORAGE_KEY = "hexpand_provider";
