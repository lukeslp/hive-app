import React, { useRef, type KeyboardEvent } from "react";
import { Hexagon, Map } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@shared/workspaceDocument";

interface WorkspaceModeControlProps {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  ariaLabel?: string;
  className?: string;
}

const choices: Array<{
  mode: WorkspaceMode;
  label: string;
  Icon: typeof Hexagon;
}> = [
  { mode: "tiles", label: "Tiles", Icon: Hexagon },
  { mode: "sphere", label: "Rind", Icon: Map },
];

export function WorkspaceModeControl({
  value,
  onChange,
  ariaLabel = "Workspace mode",
  className,
}: WorkspaceModeControlProps) {
  const buttonRefs = useRef<Record<WorkspaceMode, HTMLButtonElement | null>>({
    tiles: null,
    sphere: null,
  });

  const select = (mode: WorkspaceMode) => {
    if (mode !== value) onChange(mode);
    buttonRefs.current[mode]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: WorkspaceMode | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = "tiles";
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = "sphere";
    } else if (event.key === "Home") {
      next = "tiles";
    } else if (event.key === "End") {
      next = "sphere";
    }
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex items-center gap-0.5 rounded-full bg-muted/70 p-1",
        className
      )}
    >
      {choices.map(({ mode, label, Icon }) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            ref={element => {
              buttonRefs.current[mode] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(mode)}
            className={cn(
              "flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
