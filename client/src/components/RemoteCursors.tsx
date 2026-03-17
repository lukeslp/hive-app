/**
 * RemoteCursors - Renders other participants' cursor positions on the canvas
 */

import React from "react";
import type { RemoteCursor } from "@/hooks/useCollaboration";

interface RemoteCursorsProps {
  cursors: RemoteCursor[];
  viewState: { x: number; y: number; zoom: number };
}

export const RemoteCursors = React.memo(({ cursors, viewState }: RemoteCursorsProps) => {
  if (cursors.length === 0) return null;

  return (
    <>
      {cursors.map((cursor) => {
        // Convert canvas coordinates to screen coordinates
        const screenX = cursor.x * viewState.zoom + viewState.x;
        const screenY = cursor.y * viewState.zoom + viewState.y;

        return (
          <div
            key={cursor.userId}
            className="fixed pointer-events-none z-50 transition-all duration-75"
            style={{
              left: screenX,
              top: screenY,
              transform: "translate(-2px, -2px)",
            }}
          >
            {/* Cursor arrow */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.5))` }}
            >
              <path
                d="M1 1L1 15L5.5 11L10 19L13 17.5L8.5 9.5L14 8L1 1Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-4 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}
    </>
  );
});

RemoteCursors.displayName = "RemoteCursors";
