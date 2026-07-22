import type { ArtifactKind, ArtifactScope } from "@shared/macArtifacts";
import type { ArtifactContext } from "@/lib/artifactContext";

export type ArtifactRecipeGroupId = "writing" | "software" | "design";
export type ArtifactScopeKind = ArtifactScope["kind"];

export interface ArtifactRecipe {
  id: string;
  label: string;
  group: ArtifactRecipeGroupId;
  kind: ArtifactKind;
  description: string;
  instructions: string;
  supportedScopes: readonly ArtifactScopeKind[];
}

export interface ArtifactRecipeGroup {
  id: ArtifactRecipeGroupId;
  label: string;
  recipes: readonly ArtifactRecipe[];
}

const ALL_SCOPES = ["board", "branch", "selection"] as const;

export const ARTIFACT_RECIPES: readonly ArtifactRecipe[] = [
  {
    id: "brief",
    label: "Brief",
    group: "writing",
    kind: "markdown",
    description: "A concise overview of the goal, context, and decisions.",
    instructions:
      "Write a compact Markdown brief grounded only in the supplied tiles.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "report",
    label: "Report",
    group: "writing",
    kind: "markdown",
    description:
      "A structured report with findings, evidence, and conclusions.",
    instructions:
      "Write a structured Markdown report and distinguish facts from open questions.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "action-plan",
    label: "Action plan",
    group: "writing",
    kind: "markdown",
    description: "Prioritized next steps, dependencies, and completion checks.",
    instructions:
      "Turn actionable tiles into an ordered Markdown plan with clear outcomes.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "narrative",
    label: "Narrative",
    group: "writing",
    kind: "markdown",
    description: "A coherent story that connects the selected ideas.",
    instructions:
      "Create a clear Markdown narrative without inventing unsupported details.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "custom-markdown",
    label: "Custom Markdown",
    group: "writing",
    kind: "markdown",
    description: "A Markdown document shaped by your instructions.",
    instructions:
      "Follow the user's instructions and return well-structured Markdown.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "deep-dive",
    label: "Deep Dive",
    group: "writing",
    kind: "markdown",
    description: "A detailed exploration of a branch or focused selection.",
    instructions:
      "Examine the supplied context in depth, including risks and unresolved questions.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "implementation-plan",
    label: "Implementation plan",
    group: "software",
    kind: "markdown",
    description: "Technical phases, interfaces, risks, and verification steps.",
    instructions:
      "Produce an implementation plan; never claim generated software was built or run.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "code-scaffold",
    label: "Code scaffold",
    group: "software",
    kind: "codeBundle",
    description: "A file bundle that sketches the proposed implementation.",
    instructions:
      "Generate source files only. Do not install, build, or execute them.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "mermaid-diagram",
    label: "Mermaid diagram",
    group: "software",
    kind: "mermaid",
    description: "A Mermaid diagram of structure, flow, or relationships.",
    instructions:
      "Return valid Mermaid source based only on the supplied context.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "svg-asset",
    label: "SVG asset",
    group: "design",
    kind: "svg",
    description: "A standalone vector graphic or diagram.",
    instructions:
      "Return a self-contained SVG without scripts, links, or remote assets.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "static-web-prototype",
    label: "Static web prototype",
    group: "design",
    kind: "staticWeb",
    description: "A static HTML and CSS concept preview.",
    instructions:
      "Return static files only, with no forms, navigation, storage, scripts, or network use.",
    supportedScopes: ALL_SCOPES,
  },
  {
    id: "image-playground-artwork",
    label: "Image Playground artwork",
    group: "design",
    kind: "image",
    description: "Artwork generated through Apple Image Playground.",
    instructions:
      "Prepare a concise visual concept for Image Playground from the supplied tiles.",
    supportedScopes: ALL_SCOPES,
  },
];

export const ARTIFACT_RECIPE_GROUPS: readonly ArtifactRecipeGroup[] = (
  [
    ["writing", "Writing"],
    ["software", "Software"],
    ["design", "Design"],
  ] as const
).map(([id, label]) => ({
  id,
  label,
  recipes: ARTIFACT_RECIPES.filter(recipe => recipe.group === id),
}));

export function getArtifactRecipe(id: string): ArtifactRecipe | undefined {
  return ARTIFACT_RECIPES.find(recipe => recipe.id === id);
}

export interface ArtifactRecipeSuggestion {
  recipe: ArtifactRecipe;
  reason: string;
}

export function suggestArtifactRecipes(
  context: ArtifactContext,
  limit = 4
): ArtifactRecipeSuggestion[] {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const add = (id: string, score: number, reason: string) => {
    const current = scores.get(id) ?? { score: 0, reasons: [] };
    current.score += score;
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    scores.set(id, current);
  };

  if (context.scope.kind === "board") {
    add("brief", 50, "Summarizes the whole board");
    add("report", 40, "Organizes the board into findings");
    add("action-plan", 30, "Turns the board into next steps");
  } else if (context.scope.kind === "branch") {
    add("implementation-plan", 50, "Fits a focused branch");
    add("deep-dive", 40, "Explores the branch in detail");
  } else {
    add("custom-markdown", 50, "Uses the explicit tile selection");
    add("narrative", 40, "Connects the selected ideas");
    add("deep-dive", 20, "Examines the selection closely");
  }

  const nodeTypes = new Set(context.nodes.map(node => node.type));
  if (nodeTypes.has("technical")) {
    add(
      "implementation-plan",
      60,
      "Technical tiles suggest implementation detail"
    );
    add("code-scaffold", 50, "Technical tiles can seed a source scaffold");
    add(
      "mermaid-diagram",
      30,
      "Technical relationships benefit from a diagram"
    );
  }
  if (nodeTypes.has("question")) {
    add("deep-dive", 45, "Open questions merit deeper analysis");
  }
  if (nodeTypes.has("action")) {
    add("action-plan", 60, "Action tiles can become ordered steps");
  }

  const words = context.nodes
    .map(node => `${node.text} ${node.description ?? ""}`)
    .join(" ")
    .toLowerCase();
  if (/\b(flow|architecture|relationship|sequence|diagram)\b/.test(words)) {
    add("mermaid-diagram", 40, "The context describes structure or flow");
  }
  if (
    /\b(interface|screen|layout|prototype|visual|artwork|logo)\b/.test(words)
  ) {
    add(
      "static-web-prototype",
      35,
      "The context contains a visual interface concept"
    );
    add("svg-asset", 25, "The context may benefit from a vector asset");
  }

  return Array.from(scores.entries())
    .map(([id, result]) => ({
      recipe: getArtifactRecipe(id),
      score: result.score,
      reason: result.reasons.join("; "),
    }))
    .filter(
      (
        item
      ): item is { recipe: ArtifactRecipe; score: number; reason: string } =>
        !!item.recipe &&
        item.recipe.supportedScopes.includes(context.scope.kind)
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        ARTIFACT_RECIPES.indexOf(a.recipe) - ARTIFACT_RECIPES.indexOf(b.recipe)
    )
    .slice(0, Math.max(0, limit))
    .map(({ recipe, reason }) => ({ recipe, reason }));
}
