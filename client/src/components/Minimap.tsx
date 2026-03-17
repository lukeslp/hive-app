/**
 * Minimap - Overview navigation for the hex grid
 * Responsive: smaller on mobile to avoid overlapping InspectPanel
 */

import React, { useRef } from "react";
import { HEX_SIZE, HEX_WIDTH, HEX_HEIGHT } from "@/lib/hexConstants";
import { NODE_TYPES } from "@/lib/nodeTypes";
import type { HexNode, ViewState } from "@/types/hivemind";

interface MinimapProps {
  nodes: Record<string, HexNode>;
  viewState: ViewState;
  containerSize: { width: number; height: number };
  onNavigate: (x: number, y: number) => void;
  selectedNodeId: string | null;
}

export const Minimap = ({
  nodes,
  viewState,
  containerSize,
  onNavigate,
  selectedNodeId,
}: MinimapProps) => {
  const minimapRef = useRef<HTMLDivElement>(null);
  // Responsive size: smaller on mobile
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const MINIMAP_SIZE = isMobile ? 100 : 160;
  const MINIMAP_PADDING = isMobile ? 6 : 10;

  const nodeKeys = Object.keys(nodes);
  if (nodeKeys.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodeKeys.forEach(key => {
    const node = nodes[key];
    const x = HEX_SIZE * (Math.sqrt(3) * node.q + (Math.sqrt(3) / 2) * node.r);
    const y = HEX_SIZE * ((3 / 2) * node.r);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  const graphWidth = maxX - minX + HEX_WIDTH * 2;
  const graphHeight = maxY - minY + HEX_HEIGHT * 2;
  const scale = Math.min(
    (MINIMAP_SIZE - MINIMAP_PADDING * 2) / graphWidth,
    (MINIMAP_SIZE - MINIMAP_PADDING * 2) / graphHeight,
    0.15
  );

  const vpWidth = (containerSize.width / viewState.zoom) * scale;
  const vpHeight = (containerSize.height / viewState.zoom) * scale;
  const vpX = MINIMAP_SIZE / 2 - (viewState.x / viewState.zoom) * scale - vpWidth / 2;
  const vpY = MINIMAP_SIZE / 2 - (viewState.y / viewState.zoom) * scale - vpHeight / 2;

  const handleMinimapClick = (e: React.MouseEvent) => {
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left - MINIMAP_SIZE / 2;
    const clickY = e.clientY - rect.top - MINIMAP_SIZE / 2;
    const worldX = -clickX / scale * viewState.zoom;
    const worldY = -clickY / scale * viewState.zoom;
    onNavigate(worldX, worldY);
  };

  return (
    <div
      ref={minimapRef}
      className="bg-card/90 backdrop-blur border border-border rounded-xl overflow-hidden cursor-crosshair shadow-xl"
      style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
      onClick={handleMinimapClick}
      role="navigation"
      aria-label="Mind map overview"
    >
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE}>
        {nodeKeys.map(key => {
          const node = nodes[key];
          const x = HEX_SIZE * (Math.sqrt(3) * node.q + (Math.sqrt(3) / 2) * node.r);
          const y = HEX_SIZE * ((3 / 2) * node.r);
          const screenX = MINIMAP_SIZE / 2 + x * scale;
          const screenY = MINIMAP_SIZE / 2 + y * scale;
          const style = NODE_TYPES[node.type] || NODE_TYPES.default;
          const isSelected = key === selectedNodeId;

          return (
            <circle
              key={key}
              cx={screenX}
              cy={screenY}
              r={isSelected ? (isMobile ? 3 : 4) : (isMobile ? 1.5 : 2.5)}
              className={`${isSelected ? 'fill-white' : style.color.replace('text-', 'fill-')}`}
              style={{ opacity: isSelected ? 1 : 0.7 }}
            />
          );
        })}

        <rect
          x={vpX}
          y={vpY}
          width={vpWidth}
          height={vpHeight}
          fill="none"
          stroke="white"
          strokeWidth="1"
          strokeOpacity="0.5"
          rx="2"
        />
      </svg>
    </div>
  );
};
