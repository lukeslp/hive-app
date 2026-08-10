import type { HexNode } from "@/types/hivemind";

export type AppStoreShowcase =
  | "canvas"
  | "detail"
  | "themes"
  | "templates"
  | "settings"
  | "artifact"
  | "sphere";

const SHOWCASE_MODES = new Set<AppStoreShowcase>([
  "canvas",
  "detail",
  "themes",
  "templates",
  "settings",
  "artifact",
  "sphere",
]);

export function getAppStoreShowcase(): AppStoreShowcase | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("showcase");
  return SHOWCASE_MODES.has(value as AppStoreShowcase)
    ? (value as AppStoreShowcase)
    : null;
}

const tile = (
  q: number,
  r: number,
  text: string,
  description: string,
  type: string,
  parentId: string | null,
  options: Partial<HexNode> = {}
): HexNode => ({
  semanticId: `showcase:${q}:${r}`,
  q,
  r,
  text,
  description,
  type,
  depth: parentId ? 1 : 0,
  parentId,
  pinned: !parentId,
  clusterId: "main",
  ...options,
});

export const APP_STORE_SHOWCASE_NODES: Record<string, HexNode> = {
  "0,0": tile(
    0,
    0,
    "Launch a creative studio",
    "Shape a focused space for workshops, writing, and visual planning.",
    "root",
    null,
    { isClusterRoot: true, isKeyTheme: true, hierarchyLevel: 1 }
  ),
  "1,0": tile(
    1,
    0,
    "Audience",
    "Independent creators and small teams who need clarity before execution.",
    "concept",
    "0,0",
    { isKeyTheme: true, hierarchyLevel: 1 }
  ),
  "1,-1": tile(
    1,
    -1,
    "Workshop format",
    "A guided 90-minute session that turns loose notes into a shared map.",
    "action",
    "0,0"
  ),
  "0,-1": tile(
    0,
    -1,
    "Core promise",
    "Move from scattered thoughts to a useful direction without losing nuance.",
    "concept",
    "0,0",
    { isKeyTheme: true, hierarchyLevel: 1 }
  ),
  "-1,0": tile(
    -1,
    0,
    "Pricing",
    "Compare memberships, project packages, and community-supported events.",
    "question",
    "0,0"
  ),
  "-1,1": tile(
    -1,
    1,
    "First milestone",
    "Run a small pilot, collect feedback, and refine the repeatable format.",
    "action",
    "0,0",
    { isKeyTheme: true, hierarchyLevel: 1 }
  ),
  "0,1": tile(
    0,
    1,
    "Constraints",
    "Keep the experience welcoming, affordable, and easy to facilitate.",
    "risk",
    "0,0"
  ),
  "2,0": tile(
    2,
    0,
    "Writer circles",
    "Recurring sessions for outlining, critique, and project momentum.",
    "concept",
    "1,0"
  ),
  "2,-1": tile(
    2,
    -1,
    "Design partners",
    "Invite facilitators and educators to shape the pilot experience.",
    "concept",
    "1,0"
  ),
  "2,-2": tile(
    2,
    -2,
    "Session kit",
    "Prepare prompts, timing cards, examples, and a take-home action plan.",
    "technical",
    "1,-1"
  ),
  "1,-2": tile(
    1,
    -2,
    "Venue test",
    "Compare a neighborhood studio with a lightweight online session.",
    "question",
    "1,-1"
  ),
  "0,-2": tile(
    0,
    -2,
    "Clear outcomes",
    "Every participant leaves with priorities and one concrete next step.",
    "concept",
    "0,-1"
  ),
  "-1,-1": tile(
    -1,
    -1,
    "Trust",
    "Private drafts stay private while participants decide what to share.",
    "concept",
    "0,-1"
  ),
  "-2,0": tile(
    -2,
    0,
    "Pilot package",
    "Bundle the session, summary, and a follow-up review.",
    "action",
    "-1,0"
  ),
  "-2,1": tile(
    -2,
    1,
    "Access",
    "Reserve supported seats and publish a clear accessibility guide.",
    "risk",
    "-1,0"
  ),
  "-2,2": tile(
    -2,
    2,
    "Pilot date",
    "Choose a six-week window and recruit eight participants.",
    "action",
    "-1,1"
  ),
  "-1,2": tile(
    -1,
    2,
    "Feedback loop",
    "Use a short reflection after each workshop to improve the next one.",
    "technical",
    "-1,1"
  ),
  "0,2": tile(
    0,
    2,
    "Facilitation load",
    "Create reusable materials so quality does not depend on one person.",
    "risk",
    "0,1"
  ),
  "1,1": tile(
    1,
    1,
    "Success signal",
    "Participants can explain their direction and begin within 48 hours.",
    "concept",
    "0,1"
  ),
};
