/**
 * canvasSnapshot.ts
 *
 * Captures the current hex canvas as a small PNG thumbnail.
 * Renders a simplified version of the hex grid to an offscreen canvas.
 */

import type { HexNode, ViewState } from "@/types/hivemind";
import { hexToPixel } from "@/lib/hexGrid";
import { HEX_SIZE, CLUSTER_COLORS } from "@/lib/hexConstants";
import { APP_DISPLAY_NAME } from "@shared/appBrand";

const THUMB_WIDTH = 600;
const THUMB_HEIGHT = 400;

/** Map Tailwind stroke class to a hex color for canvas rendering */
const STROKE_TO_HEX: Record<string, string> = {
  "stroke-yellow-500": "#eab308",
  "stroke-cyan-400": "#22d3ee",
  "stroke-pink-400": "#f472b6",
  "stroke-emerald-400": "#34d399",
  "stroke-orange-400": "#fb923c",
  "stroke-violet-400": "#a78bfa",
};

function getClusterHexColor(node: HexNode, allNodes: Record<string, HexNode>): string {
  // Find cluster index by matching clusterId to the cluster root order
  const clusterRoots = Object.values(allNodes)
    .filter((n) => n.isClusterRoot)
    .sort((a, b) => `${a.q},${a.r}`.localeCompare(`${b.q},${b.r}`));

  let idx = 0;
  if (node.clusterId) {
    const rootIdx = clusterRoots.findIndex(
      (r) => `${r.q},${r.r}` === node.clusterId || r.clusterId === node.clusterId
    );
    if (rootIdx >= 0) idx = rootIdx;
  }

  const clusterObj = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
  return STROKE_TO_HEX[clusterObj.stroke] ?? "#eab308";
}

/**
 * Generate a thumbnail data URL from the current board state.
 */
export function generateThumbnail(
  nodes: Record<string, HexNode>,
  _viewState: ViewState
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const nodeList = Object.values(nodes);
      if (nodeList.length === 0) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = THUMB_WIDTH;
      canvas.height = THUMB_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Calculate bounding box of all nodes
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      const positions = nodeList.map((node) => {
        const { x, y } = hexToPixel(node.q, node.r);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return { node, x, y };
      });

      // Add padding
      const pad = HEX_SIZE * 2;
      minX -= pad;
      maxX += pad;
      minY -= pad;
      maxY += pad;

      const worldW = maxX - minX || 1;
      const worldH = maxY - minY || 1;
      const scale = Math.min(THUMB_WIDTH / worldW, THUMB_HEIGHT / worldH);
      const offsetX = (THUMB_WIDTH - worldW * scale) / 2 - minX * scale;
      const offsetY = (THUMB_HEIGHT - worldH * scale) / 2 - minY * scale;

      // Dark background
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

      // Draw connection lines first
      ctx.lineWidth = 1.5 * scale;
      ctx.globalAlpha = 0.3;
      for (const { node, x, y } of positions) {
        if (node.parentId && nodes[node.parentId]) {
          const parent = nodes[node.parentId];
          const pp = hexToPixel(parent.q, parent.r);
          ctx.strokeStyle = "#6366f1";
          ctx.beginPath();
          ctx.moveTo(x * scale + offsetX, y * scale + offsetY);
          ctx.lineTo(pp.x * scale + offsetX, pp.y * scale + offsetY);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Draw hex nodes
      const hexR = HEX_SIZE * scale * 0.8;
      for (const { node, x, y } of positions) {
        const sx = x * scale + offsetX;
        const sy = y * scale + offsetY;
        const color = getClusterHexColor(node, nodes);

        // Hex shape
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = sx + hexR * Math.cos(angle);
          const hy = sy + hexR * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        // Fill with cluster color at 25% opacity
        ctx.fillStyle = color + "40";
        ctx.fill();

        // Stroke
        ctx.strokeStyle = node.isKeyTheme ? "#fbbf24" : color + "80";
        ctx.lineWidth = node.isKeyTheme ? 2 : 1;
        ctx.stroke();

        // Starred glow
        if (node.isKeyTheme) {
          ctx.shadowColor = "#fbbf24";
          ctx.shadowBlur = 6;
          ctx.strokeStyle = "#fbbf24";
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Small text label (truncated)
        if (hexR > 8) {
          const label =
            node.text.length > 12
              ? node.text.slice(0, 11) + "\u2026"
              : node.text;
          ctx.fillStyle = "#e2e8f0";
          ctx.font = `${Math.max(7, hexR * 0.35)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, sx, sy);
        }
      }

      resolve(canvas.toDataURL("image/png", 0.85));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Generate a larger OG-sized image (1200x630) for social sharing.
 */
export function generateOGImage(
  nodes: Record<string, HexNode>,
  _viewState: ViewState,
  title?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const nodeList = Object.values(nodes);
      if (nodeList.length === 0) {
        resolve(null);
        return;
      }

      const OG_WIDTH = 1200;
      const OG_HEIGHT = 630;

      const canvas = document.createElement("canvas");
      canvas.width = OG_WIDTH;
      canvas.height = OG_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Dark gradient background
      const grad = ctx.createLinearGradient(0, 0, OG_WIDTH, OG_HEIGHT);
      grad.addColorStop(0, "#0a0a1a");
      grad.addColorStop(1, "#1a0a2e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

      // Calculate bounding box
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      const positions = nodeList.map((node) => {
        const { x, y } = hexToPixel(node.q, node.r);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return { node, x, y };
      });

      const pad = HEX_SIZE * 3;
      minX -= pad;
      maxX += pad;
      minY -= pad;
      maxY += pad;

      const worldW = maxX - minX || 1;
      const worldH = maxY - minY || 1;
      const drawH = title ? OG_HEIGHT - 100 : OG_HEIGHT;
      const scale = Math.min(OG_WIDTH / worldW, drawH / worldH);
      const offsetX = (OG_WIDTH - worldW * scale) / 2 - minX * scale;
      const offsetY = (drawH - worldH * scale) / 2 - minY * scale;

      // Connection lines
      ctx.lineWidth = 1.5 * scale;
      ctx.globalAlpha = 0.25;
      for (const { node, x, y } of positions) {
        if (node.parentId && nodes[node.parentId]) {
          const parent = nodes[node.parentId];
          const pp = hexToPixel(parent.q, parent.r);
          ctx.strokeStyle = "#818cf8";
          ctx.beginPath();
          ctx.moveTo(x * scale + offsetX, y * scale + offsetY);
          ctx.lineTo(pp.x * scale + offsetX, pp.y * scale + offsetY);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Hex nodes with glow
      const hexR = HEX_SIZE * scale * 0.8;
      for (const { node, x, y } of positions) {
        const sx = x * scale + offsetX;
        const sy = y * scale + offsetY;
        const color = getClusterHexColor(node, nodes);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = sx + hexR * Math.cos(angle);
          const hy = sy + hexR * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        ctx.fillStyle = color + "30";
        ctx.fill();

        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = node.isKeyTheme ? 12 : 4;
        ctx.strokeStyle = node.isKeyTheme ? "#fbbf24" : color + "90";
        ctx.lineWidth = node.isKeyTheme ? 2.5 : 1.2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label
        if (hexR > 10) {
          const label =
            node.text.length > 16
              ? node.text.slice(0, 15) + "\u2026"
              : node.text;
          ctx.fillStyle = "#f1f5f9";
          ctx.font = `${Math.max(9, hexR * 0.35)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, sx, sy);
        }
      }

      // Title bar at bottom
      if (title) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, OG_HEIGHT - 80, OG_WIDTH, 80);

        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(title, 40, OG_HEIGHT - 40);

        ctx.fillStyle = "#818cf8";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(APP_DISPLAY_NAME, OG_WIDTH - 40, OG_HEIGHT - 40);
      }

      resolve(canvas.toDataURL("image/png", 0.9));
    } catch {
      resolve(null);
    }
  });
}
