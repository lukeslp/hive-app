/**
 * File Purpose: Keep tile titles inside their hexagons when the system font
 *   size is large.
 * Primary Components: measureTextZoom, hexTextCompensation,
 *   applyHexTextCompensation.
 * I/O: Measures how much the WebView enlarges text and writes one CSS
 *   variable, --hex-text-comp, that .text-hex-node multiplies by.
 *
 * Android applies the system font size to every font size in the WebView,
 * whatever the unit. Dialogs and panels reflow, but a tile is a fixed-size
 * hexagon: at the largest system setting its title doubled and ran over the
 * neighboring tiles. Tile titles now follow the system setting up to
 * MAX_TILE_TEXT_ZOOM and stop there. Everything else scales in full, and the
 * tile detail panel shows the whole title at the full size.
 */

/** The largest enlargement at which a two-word title still fits a tile. */
export const MAX_TILE_TEXT_ZOOM = 1.3;

/** How much the WebView enlarges text: 1 at the default system setting. */
export function measureTextZoom(doc: Document = document): number {
  if (!doc.body) return 1;
  const probe = doc.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;font-size:16px;line-height:1";
  doc.body.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(size) && size > 0 ? size / 16 : 1;
}

/** The factor tile titles are multiplied by for a given enlargement. */
export function hexTextCompensation(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= MAX_TILE_TEXT_ZOOM) return 1;
  return Math.round((MAX_TILE_TEXT_ZOOM / zoom) * 1000) / 1000;
}

export function applyHexTextCompensation(doc: Document = document): void {
  doc.documentElement.style.setProperty(
    "--hex-text-comp",
    String(hexTextCompensation(measureTextZoom(doc)))
  );
}
