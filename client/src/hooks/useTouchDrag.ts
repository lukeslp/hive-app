/**
 * useTouchDrag - Touch-based drag-and-drop for hex tiles
 * 
 * Long-press a tile to pick it up, drag across the canvas,
 * drop on another tile to combine/merge ideas.
 * 
 * Uses refs for drag state to avoid stale closures in touch
 * event callbacks (critical for Chrome mobile).
 */

import { useRef, useCallback, useState } from 'react';
import { HEX_WIDTH } from '@/lib/hexConstants';
import type { HexNode, ViewState } from '@/types/hivemind';
import { haptics } from '@/lib/haptics';

const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD = 10; // px before cancelling long-press

interface TouchDragState {
  isDragging: boolean;
  draggedKey: string | null;
  ghostPos: { x: number; y: number } | null;
  dropTargetKey: string | null;
}

interface UseTouchDragOptions {
  nodes: Record<string, HexNode>;
  viewState: ViewState;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onMerge: (sourceKey: string, targetKey: string) => void;
  onDragStateChange: (draggedKey: string | null, dropTargetKey: string | null) => void;
  hexToPixel: (q: number, r: number) => { x: number; y: number };
  /** External ref that this hook sets to true/false to signal active drag to other hooks */
  touchDragActiveRef: React.MutableRefObject<boolean>;
}

const EMPTY_STATE: TouchDragState = {
  isDragging: false,
  draggedKey: null,
  ghostPos: null,
  dropTargetKey: null,
};

export function useTouchDrag({
  nodes,
  viewState,
  canvasRef,
  onMerge,
  onDragStateChange,
  hexToPixel,
  touchDragActiveRef,
}: UseTouchDragOptions) {
  // Render state — drives the UI (ghost tile, drop target highlight)
  const [state, setState] = useState<TouchDragState>(EMPTY_STATE);

  // Use the external ref so useCanvasInteraction can read it synchronously
  const isDraggingRef = touchDragActiveRef;
  const draggedKeyRef = useRef<string | null>(null);
  const dropTargetKeyRef = useRef<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  // Keep refs to latest props to avoid stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const hexToPixelRef = useRef(hexToPixel);
  hexToPixelRef.current = hexToPixel;

  // Convert screen position to canvas-space position
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const vs = viewStateRef.current;
    const x = (clientX - rect.left - rect.width / 2) / vs.zoom - vs.x;
    const y = (clientY - rect.top - rect.height / 2) / vs.zoom - vs.y;
    return { x, y };
  }, [canvasRef]);

  // Find which node is under a canvas-space position
  const findNodeAt = useCallback((canvasX: number, canvasY: number): string | null => {
    let closest: string | null = null;
    let closestDist = Infinity;
    const currentNodes = nodesRef.current;
    const currentDraggedKey = draggedKeyRef.current;

    for (const [key, node] of Object.entries(currentNodes)) {
      if (key === currentDraggedKey) continue;
      if (node.pinned) continue;
      const pos = hexToPixelRef.current(node.q, node.r);
      const dx = canvasX - pos.x;
      const dy = canvasY - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HEX_WIDTH * 0.6 && dist < closestDist) {
        closest = key;
        closestDist = dist;
      }
    }
    return closest;
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const resetDrag = useCallback(() => {
    cancelLongPress();
    touchDragActiveRef.current = false;
    draggedKeyRef.current = null;
    dropTargetKeyRef.current = null;
    touchStartPos.current = null;
    setState(EMPTY_STATE);
    onDragStateChangeRef.current(null, null);
  }, [cancelLongPress, touchDragActiveRef]);

  const handleTouchStart = useCallback((key: string, e: React.TouchEvent) => {
    const currentNodes = nodesRef.current;
    const node = currentNodes[key];
    if (!node || node.pinned || node.type === 'root') return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    draggedKeyRef.current = key;

    // Start long-press timer
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      isDraggingRef.current = true;
      draggedKeyRef.current = key;

      haptics.longPress();

      setState({
        isDragging: true,
        draggedKey: key,
        ghostPos: { x: touch.clientX, y: touch.clientY },
        dropTargetKey: null,
      });
      onDragStateChangeRef.current(key, null);
    }, LONG_PRESS_MS);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];

    // If not yet dragging, check if finger moved too far (cancel long-press)
    if (!isDraggingRef.current && longPressTimer.current && touchStartPos.current) {
      const dx = touch.clientX - touchStartPos.current.x;
      const dy = touch.clientY - touchStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        cancelLongPress();
        draggedKeyRef.current = null;
        touchStartPos.current = null;
        return;
      }
    }

    if (!isDraggingRef.current || !draggedKeyRef.current) return;

    // Prevent canvas pan while dragging a tile
    e.preventDefault();
    e.stopPropagation();

    // Find drop target
    const canvasPos = screenToCanvas(touch.clientX, touch.clientY);
    const dropTarget = canvasPos ? findNodeAt(canvasPos.x, canvasPos.y) : null;

    // Haptic feedback when entering a new drop target
    if (dropTarget && dropTarget !== dropTargetKeyRef.current) {
      haptics.dragHover();
    }

    dropTargetKeyRef.current = dropTarget;

    setState({
      isDragging: true,
      draggedKey: draggedKeyRef.current,
      ghostPos: { x: touch.clientX, y: touch.clientY },
      dropTargetKey: dropTarget,
    });
    onDragStateChangeRef.current(draggedKeyRef.current, dropTarget);
  }, [screenToCanvas, findNodeAt, cancelLongPress]);

  const handleTouchEnd = useCallback(() => {
    cancelLongPress();

    if (isDraggingRef.current && draggedKeyRef.current && dropTargetKeyRef.current) {
      haptics.success();
      onMergeRef.current(draggedKeyRef.current, dropTargetKeyRef.current);
    }

    resetDrag();
  }, [cancelLongPress, resetDrag]);

  return {
    touchDragState: state,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
