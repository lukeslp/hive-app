export interface RindSurfaceStyle {
  background: number;
  shell: number;
  shellEmissive: number;
  seam: number;
  seamOpacity: number;
  ambientIntensity: number;
  keyIntensity: number;
}

/**
 * Rind follows Hexsweeper's surface grammar: face fill and seam ink are
 * separate decisions. This keeps the honeycomb legible in both app themes
 * without relying on specular lighting to reveal the topology.
 */
export const RIND_SURFACE_STYLES: Record<"dark" | "light", RindSurfaceStyle> = {
  dark: {
    background: 0x0b1220,
    shell: 0x2b3b50,
    shellEmissive: 0x172033,
    seam: 0x718096,
    seamOpacity: 0.68,
    ambientIntensity: 0.82,
    keyIntensity: 1.08,
  },
  light: {
    background: 0xf1f5f9,
    shell: 0xd4dde8,
    shellEmissive: 0xb9c5d3,
    seam: 0x8796a8,
    seamOpacity: 0.72,
    ambientIntensity: 1.02,
    keyIntensity: 1.18,
  },
};

export const RIND_NODE_INDICATOR_SEGMENTS = 8;

export const RIND_TILE_CONTENT_OPTIONS = {
  minFacing: 0.5,
  showAllFrontFacing: true,
} as const;
