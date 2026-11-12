/**
 * File Purpose: Draw a board as a standalone SVG picture for Export SVG, PNG
 *   and JPG.
 * Primary Components: buildBoardSvg (pure string builder), wrapTileTitle.
 * I/O: Reads the tile map; returns SVG markup plus the pixel size to
 *   rasterize it at. Touches no DOM, so it runs the same in a browser, a
 *   WebView and a test.
 *
 * Why this exists: the tiles on screen are HTML elements styled by Tailwind
 * classes. The old export copied that markup into an <svg> wrapper, where the
 * HTML is ignored and the classes mean nothing, so the picture came out as
 * blank dark shapes with no titles or colors. This builder draws the board
 * from the data instead: plain SVG shapes and <text>, with every color written
 * as an attribute.
 */

import { HEX_SIZE } from "@/lib/hexConstants";
import { hexToPixel } from "@/lib/hexGrid";

/** The tile fields the picture needs. HexNode satisfies this. */
export interface BoardExportNode {
  q: number;
  r: number;
  text: string;
  type: string;
  parentId?: string | null;
  isKeyTheme?: boolean;
  isClusterRoot?: boolean;
}

export interface BoardExportOptions {
  /** Longest side of the raster output in pixels. Default 2000. */
  maxPixels?: number;
}

export interface BoardExportResult {
  svg: string;
  /** Pixel size to rasterize at; matches the SVG width and height. */
  width: number;
  height: number;
  tileCount: number;
}

const BACKGROUND = "#12141a";
const TILE_BASE = "#1b1e27";
const LINE_COLOR = "#8b93a7";
const TITLE_COLOR = "#f1f5f9";
const KEY_IDEA_COLOR = "#fde047";

/** Solid colors per tile type; mirrors NODE_TYPES.bgSolid and its labels. */
const TYPE_STYLE: Record<string, { color: string; label: string }> = {
  root: { color: "#facc15", label: "Core" },
  concept: { color: "#f59e0b", label: "Concept" },
  action: { color: "#f43f5e", label: "Action" },
  technical: { color: "#22d3ee", label: "Technical" },
  question: { color: "#a78bfa", label: "Question" },
  risk: { color: "#ef4444", label: "Risk" },
  default: { color: "#64748b", label: "Tile" },
};

const TITLE_FONT_SIZE = 14;
const TITLE_LINE_HEIGHT = 17;
const LABEL_FONT_SIZE = 9;
const MAX_TITLE_LINES = 4;
/** Characters that fit on one title line inside a tile at TITLE_FONT_SIZE. */
const MAX_LINE_CHARS = 15;
const FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Remove characters XML 1.0 does not allow, and collapse whitespace. */
function cleanText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      // Unpaired surrogates are not valid in XML either.
      .replace(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
        ""
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Break a tile title into lines that fit the hexagon. Words longer than a
 * line are split; text past the last line ends with an ellipsis.
 */
export function wrapTileTitle(
  text: string,
  maxChars = MAX_LINE_CHARS,
  maxLines = MAX_TITLE_LINES
): string[] {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  const push = (line: string): boolean => {
    if (lines.length >= maxLines) {
      truncated = true;
      return false;
    }
    lines.push(line);
    return true;
  };

  outer: for (const word of words) {
    let rest = word;
    while (rest.length > maxChars) {
      if (current) {
        if (!push(current)) break outer;
        current = "";
      }
      if (!push(`${rest.slice(0, maxChars - 1)}-`)) break outer;
      rest = rest.slice(maxChars - 1);
    }
    const candidate = current ? `${current} ${rest}` : rest;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (!push(current)) break outer;
      current = rest;
    }
  }
  if (current && !truncated) push(current);

  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      `${last.slice(0, Math.max(1, maxChars - 1)).replace(/[\s-]+$/, "")}…`;
  }
  return lines;
}

function hexPoints(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(
      `${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))}`
    );
  }
  return points.join(" ");
}

/**
 * Build the picture. Returns null for an empty board so callers can tell the
 * user there is nothing to export.
 */
export function buildBoardSvg(
  nodes: Record<string, BoardExportNode>,
  options: BoardExportOptions = {}
): BoardExportResult | null {
  const entries = Object.entries(nodes).filter(
    ([, node]) => Number.isFinite(node.q) && Number.isFinite(node.r)
  );
  if (entries.length === 0) return null;

  const maxPixels = options.maxPixels ?? 2000;
  const placed = entries.map(([key, node]) => ({
    key,
    node,
    ...hexToPixel(node.q, node.r),
  }));
  const positionByKey = new Map(placed.map(item => [item.key, item]));

  const pad = HEX_SIZE * 1.6;
  const minX = Math.min(...placed.map(p => p.x)) - pad;
  const maxX = Math.max(...placed.map(p => p.x)) + pad;
  const minY = Math.min(...placed.map(p => p.y)) - pad;
  const maxY = Math.max(...placed.map(p => p.y)) + pad;
  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const scale = maxPixels / Math.max(worldW, worldH);
  const width = Math.max(1, Math.round(worldW * scale));
  const height = Math.max(1, Math.round(worldH * scale));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${round(minX)} ${round(minY)} ${round(worldW)} ${round(worldH)}" font-family="${FONT_FAMILY}">`
  );
  parts.push(
    `<rect x="${round(minX)}" y="${round(minY)}" width="${round(worldW)}" height="${round(worldH)}" fill="${BACKGROUND}"/>`
  );

  // Lines from each tile to its parent, under the tiles.
  parts.push(
    `<g stroke="${LINE_COLOR}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round">`
  );
  for (const item of placed) {
    const parent = item.node.parentId
      ? positionByKey.get(item.node.parentId)
      : undefined;
    if (!parent) continue;
    parts.push(
      `<line x1="${round(item.x)}" y1="${round(item.y)}" x2="${round(parent.x)}" y2="${round(parent.y)}"/>`
    );
  }
  parts.push("</g>");

  const radius = HEX_SIZE * 0.95;
  for (const { node, x, y } of placed) {
    const style = TYPE_STYLE[node.type] ?? TYPE_STYLE.default;
    const emphasized =
      node.isKeyTheme || node.type === "root" || node.isClusterRoot;
    const stroke = node.isKeyTheme ? KEY_IDEA_COLOR : style.color;
    const points = hexPoints(x, y, radius);
    const lines = wrapTileTitle(node.text || "Untitled");
    const label = node.isKeyTheme ? `${style.label} · Key idea` : style.label;

    parts.push("<g>");
    // Opaque base first so the connection lines do not show through the tint.
    parts.push(`<polygon points="${points}" fill="${TILE_BASE}"/>`);
    parts.push(
      `<polygon points="${points}" fill="${style.color}" fill-opacity="0.2" stroke="${stroke}" stroke-opacity="${emphasized ? 1 : 0.7}" stroke-width="${emphasized ? 3 : 1.5}" stroke-linejoin="round"/>`
    );

    const blockHeight = lines.length * TITLE_LINE_HEIGHT;
    const labelY = y - blockHeight / 2 - 6;
    parts.push(
      `<text x="${round(x)}" y="${round(labelY)}" text-anchor="middle" font-size="${LABEL_FONT_SIZE}" font-weight="700" letter-spacing="0.8" fill="${node.isKeyTheme ? KEY_IDEA_COLOR : style.color}">${escapeXml(label.toUpperCase())}</text>`
    );
    const firstBaseline = y - blockHeight / 2 + TITLE_LINE_HEIGHT * 0.75 + 4;
    parts.push(
      `<text text-anchor="middle" font-size="${TITLE_FONT_SIZE}" font-weight="700" fill="${TITLE_COLOR}">`
    );
    lines.forEach((line, index) => {
      parts.push(
        `<tspan x="${round(x)}" y="${round(firstBaseline + index * TITLE_LINE_HEIGHT)}">${escapeXml(line)}</tspan>`
      );
    });
    parts.push("</text>");
    parts.push("</g>");
  }

  parts.push("</svg>");
  return { svg: parts.join(""), width, height, tileCount: placed.length };
}
