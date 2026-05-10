/**
 * HexCanvas Component
 *
 * Renders the hexagonal node grid with SVG visualization.
 * Optimized with React.memo and useMemo for performance.
 * Fully accessible with ARIA labels and keyboard navigation support.
 */

import React, { useMemo, useRef } from 'react';
import {
  Loader2,
  Zap,
  HelpCircle,
  Sparkles,
  Info,
} from '@/lib/icons';
import { HEX_SIZE, HEX_WIDTH, HEX_HEIGHT, CLUSTER_COLORS } from '@/lib/hexConstants';
import { NODE_TYPES, ASK_INDICATOR } from '@/lib/nodeTypes';
import type { HexNode, ViewState } from '@/types/hivemind';
import { haptics } from '@/lib/haptics';

interface ConnectionLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  isDashed: boolean;
  isBridge?: boolean;
}

interface HexCanvasProps {
  nodes: Record<string, HexNode>;
  viewState: ViewState;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  inspectedNodeId: string | null;
  loadingNodes: Set<string>;
  autoExpandingNodes: Set<string>;
  generatingNeighbors: Set<string>;
  /**
   * Set of node keys whose clarification question has been answered.
   * Tiles in this set lose the dashed-border + corner badge + "Ask" pill
   * treatment and revert to normal expand-on-tap visuals. Computed by
   * the parent from the contextHistory map.
   */
  answeredAskNodes: Set<string>;
  draggedNodeId: string | null;
  dropTargetId: string | null;
  mergeAnimationKey: string | null;
  searchQuery: string;
  filterType: string | null;
  clusters: string[];
  isTouchDevice: boolean;
  justDropped: React.MutableRefObject<boolean>;
  /** Node presence from collaborators: map of nodeKey -> [{color, name}] */
  nodePresenceMap: Record<string, { color: string; name: string }[]>;

  // Event handlers
  onNodeClick: (key: string, node: HexNode) => void;
  onNodeKeyDown: (e: React.KeyboardEvent, key: string, node: HexNode) => void;
  onNodeHover: (key: string | null) => void;
  onNodeInspect: (key: string | null) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDragLeave: (key: string) => void;
  onDrop: (e: React.DragEvent, targetKey: string) => void;
  onTouchStart: (key: string, e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

/**
 * Individual Hexagon Node Component
 * Memoized to prevent unnecessary re-renders
 */
const HexNode = React.memo<{
  nodeKey: string;
  node: HexNode;
  x: number;
  y: number;
  isSelected: boolean;
  isHovered: boolean;
  isInspected: boolean;
  isLoading: boolean;
  isAutoExpanding: boolean;
  /** True when this tile asks a clarifying question that hasn't been answered. */
  isAsking: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  isDimmed: boolean;
  isMergeAnimating: boolean;
  scale: number;
  strokeWidth: number;
  zIndex: number;
  shadowClass: string;
  clusterColor: typeof CLUSTER_COLORS[0];
  isTouchDevice: boolean;
  /** Array of presence colors for collaborators on this node */
  presenceColors: string[];
  presenceNames: string[];
  onNodeClick: (key: string, node: HexNode) => void;
  onNodeKeyDown: (e: React.KeyboardEvent, key: string, node: HexNode) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}>(({
  nodeKey,
  node,
  x,
  y,
  isSelected,
  isHovered,
  isInspected,
  isLoading,
  isAutoExpanding,
  isAsking,
  isDragged,
  isDropTarget,
  isDimmed,
  isMergeAnimating,
  scale,
  strokeWidth,
  zIndex,
  shadowClass,
  clusterColor,
  isTouchDevice,
  presenceColors,
  presenceNames,
  onNodeClick,
  onNodeKeyDown,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
}) => {
  const style = NODE_TYPES[node.type] || NODE_TYPES.default;
  const Icon = style.icon;

  // Determine icon to display based on node state. isAsking trumps the
  // legacy clarifyingQuestion check — once a tile is answered it loses
  // the question icon even though clarifyingQuestion still has a value.
  const IconComponent = isAsking
    ? HelpCircle
    : isAutoExpanding
      ? Zap
      : Icon;

  const iconClasses = `w-5 h-5 sm:w-6 sm:h-6 ${style.color} opacity-90 shrink-0 ${
    isAutoExpanding ? 'animate-pulse' : ''
  }`;

  return (
    <div
      key={nodeKey}
      data-hierarchy={node.hierarchyLevel}
      data-key-theme={node.isKeyTheme ? 'true' : undefined}
      style={{
        left: x,
        top: y,
        width: HEX_WIDTH,
        height: HEX_HEIGHT,
        transform: `translate(-50%, -50%) scale(${scale})`,
        zIndex,
      }}
      className={`absolute group transition-all duration-300 overflow-visible ${isDimmed ? 'opacity-20 grayscale' : 'opacity-100'} ${isMergeAnimating ? 'animate-merge-pulse' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        tabIndex={0}
        role="button"
        aria-label={`${node.text}, ${node.type} node, level ${node.depth}${node.pinned ? ', pinned' : ''}${node.isKeyTheme ? ', key theme' : ''}${isAsking ? ', needs clarification' : node.shouldAskClarifyingQuestion ? ', answered' : ''}. ${isTouchDevice ? 'Tap' : 'Click'} to ${isAsking ? 'answer a question before expanding' : 'expand'}. ${isTouchDevice ? 'Long press' : 'Right-click'} for actions.`}
        onKeyDown={(e) => onNodeKeyDown(e, nodeKey, node)}
        draggable={!node.pinned && node.type !== 'root'}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => {
          e.stopPropagation();
          haptics.tap();
          onNodeClick(nodeKey, node);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        className={`
          hex-node relative w-full h-full cursor-pointer flex items-center justify-center p-4 text-center overflow-visible
          transition-transform duration-200
          ${isLoading || isAutoExpanding ? 'animate-pulse' : ''}
          ${isDragged ? 'opacity-50' : ''}
          ${isDropTarget ? 'ring-4 ring-indigo-500 ring-opacity-75' : ''}
        `}
        style={{
          // iOS Safari / Capacitor WKWebView fires its own long-press menu
          // (Copy/Define/Look Up) on tiles before our 400 ms long-press
          // timer in useTouchDrag fires — that's why drag-to-merge has been
          // dead on iPhone/iPad. These three rules prevent the system's
          // touch-handling from intercepting:
          //   touchAction: none           — disables browser scroll/zoom on the tile
          //   WebkitTouchCallout: 'none'  — disables the iOS "Copy/Define" menu
          //   WebkitUserSelect: 'none'    — prevents text selection on long-press
          // No effect on desktop browsers (the WebKit-prefixed properties
          // are no-ops there). Adapted from geepers-chat-demo's HexTile.
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        <svg
          className={`absolute inset-0 w-full h-full transition-all duration-200 ${shadowClass}`}
          viewBox="-4 -4 181.2 208"
          overflow="visible"
        >
          {/* Pattern definition for context info */}
          {node.contextInfo && (
            <defs>
              <pattern
                id={`context-pattern-${nodeKey}`}
                patternUnits="userSpaceOnUse"
                width="8"
                height="8"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth="1.5"
                  strokeOpacity="0.15"
                />
              </pattern>
            </defs>
          )}

          {/* Main hexagon path */}
          <path
            d="M86.6 0L173.2 50V150L86.6 200L0 150V50L86.6 0Z"
            className={`
              transition-all duration-200
              ${
                isAsking
                  ? 'fill-card stroke-amber-400'
                  : isAutoExpanding
                    ? 'fill-card stroke-purple-400'
                    : node.isKeyTheme
                      ? 'fill-card stroke-yellow-300'
                      : node.isClusterRoot
                        ? `fill-card ${clusterColor.stroke}`
                        : isSelected
                          ? `fill-card ${style.border}`
                          : isHovered
                            ? `fill-secondary ${style.border}`
                            : 'fill-background stroke-border/80'
              }
            `}
            style={{
              strokeWidth: strokeWidth,
              paintOrder: 'stroke fill', // Fill renders over stroke to prevent overlap bleeding
              ...(node.isKeyTheme ? { filter: 'drop-shadow(0 0 4px rgba(253, 224, 71, 0.4))' } : {}),
            }}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={isAsking ? ASK_INDICATOR.borderDash : undefined}
          />

          {/* Inner glow for selected/hovered */}
          {(isSelected || isHovered) && (
            <path
              d="M86.6 10L163.2 55V145L86.6 190L10 145V55L86.6 10Z"
              className={`${style.bg} stroke-none`}
            />
          )}

          {/* Context info stripe overlay */}
          {node.contextInfo && (
            <path
              d="M86.6 0L173.2 50V150L86.6 200L0 150V50L86.6 0Z"
              fill={`url(#context-pattern-${nodeKey})`}
            />
          )}

          {/* Collaborator presence rings */}
          {presenceColors.length > 0 && presenceColors.map((color, i) => (
            <path
              key={`presence-${i}`}
              d="M86.6 0L173.2 50V150L86.6 200L0 150V50L86.6 0Z"
              fill="none"
              stroke={color}
              strokeWidth={4 + i * 2}
              strokeLinejoin="round"
              strokeOpacity={0.7}
              className="animate-pulse"
              style={{
                transform: `scale(${1 + 0.04 * (i + 1)})`,
                transformOrigin: '86.6px 100px',
              }}
            />
          ))}

          {/* Merge animation glow */}
          {isMergeAnimating && (
            <path
              d="M86.6 0L173.2 50V150L86.6 200L0 150V50L86.6 0Z"
              className="animate-merge-glow"
              fill="none"
              stroke="rgb(129, 140, 248)"
              strokeWidth="6"
              strokeLinejoin="round"
            />
          )}
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-1 pointer-events-none px-2.5 max-w-[150px]">
          {isLoading ? (
            <Loader2 className={`w-6 h-6 animate-spin ${style.color}`} />
          ) : (
            <>
              <div className="relative inline-block">
                <IconComponent className={iconClasses} />
                {/* Key theme sparkle overlay */}
                {node.isKeyTheme && (
                  <Sparkles
                    className="absolute -top-1 -right-1 w-3 h-3 text-yellow-300"
                    strokeWidth={2.5}
                  />
                )}
              </div>
              <span
                className={`text-hex-node font-bold line-clamp-4 uppercase text-center ${
                  node.isKeyTheme ? 'text-foreground' : 'text-card-foreground'
                }`}
                style={{ wordBreak: 'break-word' }}
              >
                {node.text}
              </span>
              {/* "Ask" pill — third non-color channel per WCAG 1.4.1. Only
                  renders when the tile is genuinely asking; cleared on
                  answer (parent computes via answeredAskNodes). */}
              {isAsking && (
                <span
                  className="text-[7px] sm:text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30"
                  aria-hidden="true"
                >
                  {ASK_INDICATOR.pillText}
                </span>
              )}
            </>
          )}

          {/* Context info mini-icon */}
          {node.contextInfo && (
            <div className="absolute bottom-0 right-0 opacity-60">
              <Info className="w-3 h-3 text-blue-400" />
            </div>
          )}
        </div>

        {/* Corner ask badge — second non-color channel per WCAG 1.4.1.
            Positioned top-right inside the hex. aria-hidden because the
            parent's aria-label already announces "needs clarification". */}
        {isAsking && (
          <div
            className={`absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full ${ASK_INDICATOR.badgeBg} ${ASK_INDICATOR.badgeFg} shadow-md pointer-events-none`}
            aria-hidden="true"
          >
            <ASK_INDICATOR.badgeIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        )}

        {/* Presence name badges */}
        {presenceNames.length > 0 && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex gap-0.5 z-20 pointer-events-none">
            {presenceNames.map((name, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white whitespace-nowrap"
                style={{ backgroundColor: presenceColors[i] }}
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimized re-renders
  return (
    prevProps.node === nextProps.node &&
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.isInspected === nextProps.isInspected &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isAutoExpanding === nextProps.isAutoExpanding &&
    prevProps.isAsking === nextProps.isAsking &&
    prevProps.isDragged === nextProps.isDragged &&
    prevProps.isDropTarget === nextProps.isDropTarget &&
    prevProps.isDimmed === nextProps.isDimmed &&
    prevProps.isMergeAnimating === nextProps.isMergeAnimating &&
    prevProps.scale === nextProps.scale &&
    prevProps.strokeWidth === nextProps.strokeWidth &&
    prevProps.zIndex === nextProps.zIndex &&
    prevProps.shadowClass === nextProps.shadowClass &&
    prevProps.presenceColors.length === nextProps.presenceColors.length &&
    prevProps.presenceColors.every((c, i) => c === nextProps.presenceColors[i])
  );
});

HexNode.displayName = 'HexNode';

/**
 * Compute z-index based on node state and properties.
 */
function getNodeZIndex(
  node: HexNode,
  isSelected: boolean,
  isHovered: boolean,
  isLoading: boolean
): number {
  if (isSelected) return 50;
  if (isHovered) return 40;
  if (node.isKeyTheme) return 30;
  if (node.wasInteracted) return 20;
  if (isLoading) return 15;
  return 10;
}

/**
 * Compute shadow CSS class based on node state.
 */
function getShadowClass(
  node: HexNode,
  isSelected: boolean,
  isHovered: boolean
): string {
  if (isSelected) return 'hex-shadow-selected';
  if (isHovered) return 'hex-shadow-hover';
  if (node.isKeyTheme) return 'hex-shadow-keytheme';
  if (node.wasInteracted) return 'hex-shadow-interacted';
  return 'hex-shadow-default';
}

/**
 * Main HexCanvas Component
 * Renders the complete hexagonal grid with connection lines
 */
export const HexCanvas = React.memo<HexCanvasProps>(({
  nodes,
  viewState,
  selectedNodeId,
  hoveredNodeId,
  inspectedNodeId,
  loadingNodes,
  autoExpandingNodes,
  generatingNeighbors,
  answeredAskNodes,
  draggedNodeId,
  dropTargetId,
  mergeAnimationKey,
  searchQuery,
  filterType,
  clusters,
  isTouchDevice,
  justDropped,
  nodePresenceMap,
  onNodeClick,
  onNodeKeyDown,
  onNodeHover,
  onNodeInspect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
}) => {
  // Single shared timer ref for hover delay — must not be inside the render loop
  const hoverDelayTimer = useRef<NodeJS.Timeout | null>(null);

  // Coordinate conversion
  const hexToPixel = useMemo(() => (q: number, r: number) => {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * ((3 / 2) * r);
    return { x, y };
  }, []);

  // Visual hierarchy helpers
  const getNodeHierarchyLevel = useMemo(() => (node: HexNode, isHovered: boolean): number => {
    if (node.isKeyTheme) return 1;
    if (node.wasInteracted) return 2;
    if (isHovered) return 4;
    return 5;
  }, []);

  const getHierarchyScale = useMemo(() => (level: number): number => {
    const scales = [1.15, 1.1, 1.05, 1.0, 0.9];
    return scales[level - 1] || 1.0;
  }, []);

  const getHierarchyStrokeWidth = useMemo(() => (level: number): number => {
    const widths = [5, 4, 3, 3, 2];
    return widths[level - 1] || 2;
  }, []);

  const getClusterColor = useMemo(() => (clusterId: string | undefined) => {
    if (!clusterId) return CLUSTER_COLORS[0];
    const index = clusters.indexOf(clusterId);
    if (index < 0) return CLUSTER_COLORS[0];
    return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
  }, [clusters]);

  // Calculate connection lines between nodes
  const connectionLines = useMemo<ConnectionLine[]>(() => {
    const lines: ConnectionLine[] = [];

    Object.entries(nodes).forEach(([key, node]) => {
      // Parent-child connections
      if (node.parentId && nodes[node.parentId]) {
        const parent = nodes[node.parentId];
        const from = hexToPixel(parent.q, parent.r);
        const to = hexToPixel(node.q, node.r);

        lines.push({
          key: `${node.parentId}-${key}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          color: 'rgb(148, 163, 184)', // slate-400
          isDashed: false,
        });
      }

      // Related node connections (suggestions from AI)
      if (node.relatedNodeKeys && node.relatedNodeKeys.length > 0) {
        node.relatedNodeKeys.forEach((relatedKey) => {
          if (nodes[relatedKey]) {
            const related = nodes[relatedKey];
            const from = hexToPixel(node.q, node.r);
            const to = hexToPixel(related.q, related.r);
            const isCrossCluster = node.clusterId !== related.clusterId;

            lines.push({
              key: `related-${key}-${relatedKey}`,
              x1: from.x,
              y1: from.y,
              x2: to.x,
              y2: to.y,
              color: isCrossCluster ? 'rgb(168, 85, 247)' : 'rgb(96, 165, 250)', // purple-500 for bridges, blue-400 for related
              isDashed: true,
              isBridge: isCrossCluster || node.isBridge || related.isBridge,
            });
          }
        });
      }

      // Bridge tile connections — draw dotted lines to the nearest node in the target cluster
      if (node.isBridge && node.bridgeTargetCluster) {
        // Find the closest node in the target cluster
        let closestKey = '';
        let closestDist = Infinity;
        Object.entries(nodes).forEach(([nk, n]) => {
          if (n.clusterId === node.bridgeTargetCluster && nk !== key) {
            const dx = n.q - node.q;
            const dr = n.r - node.r;
            const dist = Math.sqrt(dx * dx + dr * dr);
            if (dist < closestDist) {
              closestDist = dist;
              closestKey = nk;
            }
          }
        });
        if (closestKey && nodes[closestKey]) {
          const target = nodes[closestKey];
          const from = hexToPixel(node.q, node.r);
          const to = hexToPixel(target.q, target.r);
          // Avoid duplicate lines
          const lineKey = `bridge-${key}-${closestKey}`;
          const reverseKey = `bridge-${closestKey}-${key}`;
          if (!lines.some(l => l.key === lineKey || l.key === reverseKey)) {
            lines.push({
              key: lineKey,
              x1: from.x,
              y1: from.y,
              x2: to.x,
              y2: to.y,
              color: 'rgb(168, 85, 247)', // purple-500
              isDashed: true,
              isBridge: true,
            });
          }
        }
      }
    });

    return lines;
  }, [nodes, hexToPixel]);

  return (
    <>
      {/* Connection Lines Layer */}
      <svg
        className="absolute pointer-events-none"
        style={{
          left: 0,
          top: 0,
          overflow: 'visible',
          width: 1,
          height: 1,
        }}
        aria-hidden="true"
      >
        {/* SVG defs for bridge gradient */}
        <defs>
          <linearGradient id="bridge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="0.6" />
            <stop offset="50%" stopColor="rgb(236, 72, 153)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {connectionLines.map((line) => (
          <line
            key={line.key}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.isBridge ? 'url(#bridge-gradient)' : line.color}
            strokeWidth={line.isBridge ? 2.5 : 2}
            strokeOpacity={line.isBridge ? 0.5 : line.isDashed ? 0.25 : 0.3}
            strokeLinecap="round"
            strokeDasharray={line.isBridge ? '6 8' : line.isDashed ? '8 4' : undefined}
            className={line.isBridge ? 'animate-bridge-pulse' : undefined}
          />
        ))}
      </svg>

      {/* Generating Placeholder Hexes */}
      {Array.from(generatingNeighbors).map((key) => {
        const [qStr, rStr] = key.split(',');
        const q = parseInt(qStr, 10);
        const r = parseInt(rStr, 10);
        const { x, y } = hexToPixel(q, r);

        return (
          <div
            key={`placeholder-${key}`}
            style={{
              left: x,
              top: y,
              width: HEX_WIDTH,
              height: HEX_HEIGHT,
              transform: 'translate(-50%, -50%) scale(0.85)',
              zIndex: 5,
            }}
            className="absolute pointer-events-none"
          >
            <svg viewBox="0 0 100 100" className="w-full h-full animate-pulse">
              <polygon
                points="50,2 95,25 95,75 50,98 5,75 5,25"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="8 4"
                className="text-indigo-400/40"
              />
              <text
                x="50"
                y="54"
                textAnchor="middle"
                className="text-[10px] fill-indigo-400/60 font-medium"
              >
                •••
              </text>
            </svg>
          </div>
        );
      })}

      {/* Nodes Layer */}
      {Object.entries(nodes).map(([key, node]) => {
        const { x, y } = hexToPixel(node.q, node.r);
        const isSelected = selectedNodeId === key;
        // isHovered drives visual state: uses inspectedNodeId to match inline behavior
        const isHovered = inspectedNodeId === key;
        const isInspected = inspectedNodeId === key;
        const isLoading = loadingNodes.has(key);
        const isAutoExpanding = autoExpandingNodes.has(key);
        // True when the LLM emitted shouldAskClarifyingQuestion AND the
        // user hasn't answered yet. Drives dashed border + corner badge +
        // "Ask" pill + the "needs clarification" aria-label suffix.
        const isAsking = !!node.shouldAskClarifyingQuestion && !answeredAskNodes.has(key);
        const isDragged = draggedNodeId === key;
        const isDropTarget = dropTargetId === key;

        // Visual hierarchy calculations
        const hoveredForHierarchy = hoveredNodeId === key;
        const hierarchyLevel = getNodeHierarchyLevel(node, hoveredForHierarchy);
        const scale = getHierarchyScale(hierarchyLevel);
        const strokeWidth = getHierarchyStrokeWidth(hierarchyLevel);
        const clusterColor = getClusterColor(node.clusterId);
        const zIndex = getNodeZIndex(node, isSelected, isHovered, isLoading);
        const shadowClass = getShadowClass(node, isSelected, isHovered);

        // Search and Filter Dimming
        const isDimmed = Boolean(
          (searchQuery &&
            !node.text.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (filterType && filterType !== 'all' && node.type !== filterType)
        );

        return (
          <HexNode
            key={key}
            nodeKey={key}
            node={node}
            x={x}
            y={y}
            isSelected={isSelected}
            isHovered={isHovered}
            isInspected={isInspected}
            isLoading={isLoading}
            isAutoExpanding={isAutoExpanding}
            isAsking={isAsking}
            isDragged={isDragged}
            isDropTarget={isDropTarget}
            isDimmed={isDimmed}
            isMergeAnimating={mergeAnimationKey === key}
            scale={scale}
            strokeWidth={strokeWidth}
            zIndex={zIndex}
            shadowClass={shadowClass}
            clusterColor={clusterColor}
            isTouchDevice={isTouchDevice}
            presenceColors={(nodePresenceMap[key] || []).map(p => p.color)}
            presenceNames={(nodePresenceMap[key] || []).map(p => p.name)}
            onNodeClick={onNodeClick}
            onNodeKeyDown={onNodeKeyDown}
            onMouseEnter={() => {
              if (hoverDelayTimer.current) clearTimeout(hoverDelayTimer.current);
              hoverDelayTimer.current = setTimeout(() => {
                onNodeHover(key);
                onNodeInspect(key);
              }, 300);
            }}
            onMouseLeave={() => {
              if (hoverDelayTimer.current) clearTimeout(hoverDelayTimer.current);
              onNodeHover(null);
            }}
            onDragStart={(e) => {
              if (node.pinned || node.type === 'root') {
                e.preventDefault();
                return;
              }
              onDragStart(key);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={onDragEnd}
            onDragOver={(e) => {
              if (draggedNodeId && draggedNodeId !== key) {
                onDragOver(e, key);
              }
            }}
            onDragLeave={() => {
              if (dropTargetId === key) onDragLeave(key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (draggedNodeId && draggedNodeId !== key) {
                justDropped.current = true;
                onDrop(e, key);
                setTimeout(() => { justDropped.current = false; }, 100);
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              onTouchStart(key, e);
            }}
            onTouchEnd={(e) => onTouchEnd(e)}
            onTouchMove={(e) => onTouchMove(e)}
          />
        );
      })}
    </>
  );
}, (prevProps, nextProps) => {
  // Performance optimization: only re-render if these props change
  return (
    prevProps.nodes === nextProps.nodes &&
    prevProps.viewState === nextProps.viewState &&
    prevProps.selectedNodeId === nextProps.selectedNodeId &&
    prevProps.hoveredNodeId === nextProps.hoveredNodeId &&
    prevProps.inspectedNodeId === nextProps.inspectedNodeId &&
    prevProps.loadingNodes === nextProps.loadingNodes &&
    prevProps.autoExpandingNodes === nextProps.autoExpandingNodes &&
    prevProps.generatingNeighbors === nextProps.generatingNeighbors &&
    prevProps.draggedNodeId === nextProps.draggedNodeId &&
    prevProps.dropTargetId === nextProps.dropTargetId &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.filterType === nextProps.filterType &&
    prevProps.mergeAnimationKey === nextProps.mergeAnimationKey &&
    prevProps.nodePresenceMap === nextProps.nodePresenceMap
  );
});

HexCanvas.displayName = 'HexCanvas';

export default HexCanvas;
