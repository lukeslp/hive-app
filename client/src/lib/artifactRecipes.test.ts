import { describe, expect, it } from "vitest";
import {
  ARTIFACT_RECIPE_GROUPS,
  ARTIFACT_RECIPES,
  getArtifactRecipe,
  suggestArtifactRecipes,
} from "@/lib/artifactRecipes";
import type { ArtifactContext } from "@/lib/artifactContext";

describe("artifact recipes", () => {
  it("defines every required recipe in writing, software, or design", () => {
    expect(ARTIFACT_RECIPE_GROUPS.map(group => group.id)).toEqual([
      "writing",
      "software",
      "design",
    ]);
    expect(ARTIFACT_RECIPES.map(recipe => recipe.label)).toEqual([
      "Brief",
      "Report",
      "Action plan",
      "Narrative",
      "Custom Markdown",
      "Deep Dive",
      "Implementation plan",
      "Code scaffold",
      "Mermaid diagram",
      "SVG asset",
      "Static web prototype",
      "Image Playground artwork",
    ]);
  });

  it("maps recipes to the artifact kind their generator must return", () => {
    expect(getArtifactRecipe("brief")?.kind).toBe("markdown");
    expect(getArtifactRecipe("code-scaffold")?.kind).toBe("codeBundle");
    expect(getArtifactRecipe("mermaid-diagram")?.kind).toBe("mermaid");
    expect(getArtifactRecipe("svg-asset")?.kind).toBe("svg");
    expect(getArtifactRecipe("static-web-prototype")?.kind).toBe("staticWeb");
    expect(getArtifactRecipe("image-playground-artwork")?.kind).toBe("image");
  });

  it("prioritizes implementation recipes for a technical branch", () => {
    const context: ArtifactContext = {
      scope: { kind: "branch", rootNodeId: "0,1" },
      nodeIds: ["0,1", "1,1"],
      includedNodeIds: ["0,1", "1,1"],
      nodes: [
        {
          id: "0,1",
          text: "Sync architecture",
          type: "technical",
          depth: 1,
          parentId: "0,0",
          isKeyTheme: true,
        },
        {
          id: "1,1",
          text: "Retry behavior",
          type: "question",
          depth: 2,
          parentId: "0,1",
          isKeyTheme: false,
        },
      ],
      text: "Sync architecture\nRetry behavior",
      originalNodeCount: 2,
      includedNodeCount: 2,
      truncated: false,
    };

    const suggestions = suggestArtifactRecipes(context, 3);

    expect(suggestions[0].recipe.id).toBe("implementation-plan");
    expect(suggestions.map(item => item.recipe.id)).toContain("deep-dive");
    expect(suggestions.every(item => item.reason.length > 0)).toBe(true);
  });
});
