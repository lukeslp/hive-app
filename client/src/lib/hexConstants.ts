/**
 * Hex Grid Constants
 *
 * Shared constants for the hexagonal grid system.
 * Extracted from HexmindApp.tsx (main shell) and useAIGeneration.ts to eliminate duplication.
 */

// --- Gemini Model ---

export const GEMINI_TEXT_MODEL = "gemini-3-flash-preview";

// --- Hex Geometry ---

export const HEX_SIZE = 80;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// --- Hex Directions (pointy-top hexagon neighbors) ---

export const DIRECTIONS = [
  { q: 1, r: 0 }, // East
  { q: 1, r: -1 }, // Northeast
  { q: 0, r: -1 }, // Northwest
  { q: -1, r: 0 }, // West
  { q: -1, r: 1 }, // Southwest
  { q: 0, r: 1 }, // Southeast
] as const;

// --- Cluster Color Palette ---

export const CLUSTER_COLORS: Array<{
  stroke: string;
  glow: string;
  accent: string;
}> = [
  {
    stroke: "stroke-yellow-500",
    glow: "shadow-yellow-500/30",
    accent: "bg-yellow-500",
  }, // main cluster
  {
    stroke: "stroke-cyan-400",
    glow: "shadow-cyan-400/30",
    accent: "bg-cyan-400",
  }, // cluster 2
  {
    stroke: "stroke-pink-400",
    glow: "shadow-pink-400/30",
    accent: "bg-pink-400",
  }, // cluster 3
  {
    stroke: "stroke-emerald-400",
    glow: "shadow-emerald-400/30",
    accent: "bg-emerald-400",
  }, // cluster 4
  {
    stroke: "stroke-orange-400",
    glow: "shadow-orange-400/30",
    accent: "bg-orange-400",
  }, // cluster 5
  {
    stroke: "stroke-violet-400",
    glow: "shadow-violet-400/30",
    accent: "bg-violet-400",
  }, // cluster 6
];

// --- Storage Keys ---
//
// Keys retain the `hexpand_` prefix from the pre-rename era (Hexpand →
// Thought Tiles, 2026-05-08 → Idea Tiles, 2026-05-13). DO NOT rename
// these — TestFlight tester data
// (saved sessions, autosaves, API keys, provider selection) lives under
// the old prefix in localStorage and would be lost on a key rename.
// A migration shim is the only safe rename path; not worth the effort
// at this scale.

export const STORAGE_KEY = "hexpand_sessions";
export const AUTOSAVE_KEY = "hexpand_autosave";
export const API_KEYS_STORAGE_KEY = "hexpand_api_keys";
export const PROVIDER_STORAGE_KEY = "hexpand_provider";

// Boolean preference for whether autosave is enabled. Distinct from
// `AUTOSAVE_KEY` (the serialized board blob) — see the comment in
// `pages/HexmindApp.tsx` for why these are intentionally split.
export const AUTOSAVE_ENABLED_KEY = "hexpand_autosave_enabled";

// First-launch tutorial completion flag (consumed by
// `components/OnboardingTour.tsx`'s `useOnboardingTour`).
export const TOUR_COMPLETED_KEY = "hexpand_tour_completed";

// Device-local default for newly created native Mac boards. Saved workspace
// documents keep their own active mode and override this preference on load.
export const WORKSPACE_MODE_PREFERENCE_KEY =
  "hexpand_workspace_mode_preference";

// User-facing accessibility preferences. Persisted across launches so
// the UI matches the user's last choice without re-applying defaults.
export const FONT_SIZE_KEY = "hexpand_font_size"; // number, default 1.0
export const ACCESSIBILITY_FONT_KEY = "hexpand_accessibility_font"; // string family id
export const HIGH_CONTRAST_KEY = "hexpand_high_contrast"; // boolean
export const ANIMATIONS_KEY = "hexpand_animations"; // boolean

// Snapshot of which node keys were marked as Key Themes — restored on
// mount so the highlight survives reloads even if the full board isn't
// loaded from a saved session.
export const KEY_THEMES_KEY = "hexpand_key_themes"; // JSON string[]
