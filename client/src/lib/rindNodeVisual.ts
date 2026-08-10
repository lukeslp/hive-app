import type { HexNode } from "@/types/hivemind";

export type RindNodeIcon =
  | "hexagon"
  | "lightbulb"
  | "activity"
  | "terminal"
  | "question"
  | "target"
  | "box"
  | "spinner"
  | "ellipsis";

export interface RindNodeVisualState {
  dark: boolean;
  selected: boolean;
  hovered: boolean;
  loading: boolean;
  generating: boolean;
}

export interface RindNodeVisualSpec {
  faceFill: number;
  borderColor: number;
  iconColor: number;
  textColor: number;
  icon: RindNodeIcon;
  lines: string[];
  dashed: boolean;
  badge: "sparkles" | null;
  emphasis: "ordinary" | "hovered" | "selected" | "key-theme";
  scale: number;
}

const TYPE_VISUALS: Record<
  string,
  { color: number; lightFill: number; darkFill: number; icon: RindNodeIcon }
> = {
  root: {
    color: 0xfacc15,
    lightFill: 0xfff7d1,
    darkFill: 0x55470c,
    icon: "hexagon",
  },
  concept: {
    color: 0xf59e0b,
    lightFill: 0xfcedcf,
    darkFill: 0x4f3409,
    icon: "lightbulb",
  },
  action: {
    color: 0xf43f5e,
    lightFill: 0xfbd5dc,
    darkFill: 0x551522,
    icon: "activity",
  },
  technical: {
    color: 0x22d3ee,
    lightFill: 0xd2f3f7,
    darkFill: 0x0c4650,
    icon: "terminal",
  },
  question: {
    color: 0xa78bfa,
    lightFill: 0xe9e2ff,
    darkFill: 0x35265d,
    icon: "question",
  },
  risk: {
    color: 0xef4444,
    lightFill: 0xfbdada,
    darkFill: 0x561b1b,
    icon: "target",
  },
  default: {
    color: 0x64748b,
    lightFill: 0xe2e8f0,
    darkFill: 0x334155,
    icon: "box",
  },
};

export function wrapRindTitle(text: string, maxCharacters = 18): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  const second = lines.slice(1).join(" ");
  return [
    lines[0],
    second.length > maxCharacters
      ? `${second.slice(0, maxCharacters - 1).trimEnd()}…`
      : second,
  ];
}

export function rindNodeVisualSpec(
  node: HexNode,
  state: RindNodeVisualState
): RindNodeVisualSpec {
  const type = TYPE_VISUALS[node.type] ?? TYPE_VISUALS.default;
  const emphasis = state.selected
    ? "selected"
    : node.isKeyTheme
      ? "key-theme"
      : state.hovered
        ? "hovered"
        : "ordinary";
  const selectedFill = state.dark ? 0x111827 : 0xffffff;

  return {
    faceFill: state.generating
      ? state.dark
        ? 0x18213a
        : 0xf8fafc
      : state.selected
        ? selectedFill
        : state.dark
          ? type.darkFill
          : type.lightFill,
    borderColor: state.generating
      ? 0xa5b4fc
      : node.isKeyTheme && !state.selected
        ? 0xfacc15
        : type.color,
    iconColor: type.color,
    textColor: state.dark ? 0xf8fafc : 0x111827,
    icon: state.generating ? "ellipsis" : state.loading ? "spinner" : type.icon,
    lines: state.generating
      ? []
      : state.loading
        ? ["Generating"]
        : wrapRindTitle(node.text),
    dashed: state.generating,
    badge: node.isKeyTheme ? "sparkles" : null,
    emphasis,
    scale:
      state.selected || node.type === "root"
        ? 1.08
        : node.isKeyTheme || state.hovered
          ? 1.04
          : 1,
  };
}
