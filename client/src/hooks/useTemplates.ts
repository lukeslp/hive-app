/**
 * useTemplates - Template selection and contextual generation
 * Extracted from HiveMindApp.tsx monolith
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { buildApiUrl } from "@/lib/api";
import { GEMINI_TEXT_MODEL } from "@/lib/hexConstants";
import { getNodeKey } from "@/types/hexmind";
import type { HexNode, ViewState } from "@/types/hivemind";
import type { Template } from "@/lib/templates";

interface UseTemplatesProps {
  commitNodes: (nodes: Record<string, HexNode>) => void;
  setViewState: (state: ViewState | ((prev: ViewState) => ViewState)) => void;
  setSelectedNodeId: (id: string | null) => void;
  setInspectedNodeId: (id: string | null) => void;
  setShowWelcome: (value: boolean) => void;
  announceTemplateLoaded: (name: string) => void;
  getRequestHeaders?: () => Record<string, string>;
}

export function useTemplates({
  commitNodes,
  setViewState,
  setSelectedNodeId,
  setInspectedNodeId,
  setShowWelcome,
  announceTemplateLoaded,
  getRequestHeaders,
}: UseTemplatesProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [templateContext, setTemplateContext] = useState("");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const selectTemplate = useCallback((template: Template) => {
    setPendingTemplate(template);
    setTemplateContext("");
    setShowTemplates(false);
  }, []);

  const loadTemplate = useCallback(
    (template: Template) => {
      const newNodes: Record<string, HexNode> = {};
      template.nodes.forEach((tNode) => {
        const key = getNodeKey(tNode.q, tNode.r);
        newNodes[key] = {
          q: tNode.q,
          r: tNode.r,
          text: tNode.text,
          description: tNode.description,
          type: tNode.type === "concept" && tNode.depth === 0 ? "root" : tNode.type,
          depth: tNode.depth,
          pinned: tNode.isPinned || false,
        };
      });

      commitNodes(newNodes);
      setViewState({ x: 0, y: 0, zoom: 1 });
      setSelectedNodeId("0,0");
      setShowTemplates(false);
      setShowWelcome(false);
      announceTemplateLoaded(template.name);
    },
    [commitNodes, setViewState, setSelectedNodeId, setShowWelcome, announceTemplateLoaded]
  );

  const generateContextualTemplate = useCallback(async () => {
    if (!pendingTemplate || !templateContext.trim()) return;

    setIsGeneratingTemplate(true);

    const prompt = `You are helping create a brainstorming map. The user selected the "${pendingTemplate.name}" template and wants to apply it to: "${templateContext}"

Based on this template structure, generate customized content:
- Center node: The main topic adapted to their context
- Surrounding nodes: Specific subtopics relevant to their context

Template structure:
${pendingTemplate.nodes.map((n) => `- ${n.text}: ${n.description} (type: ${n.type})`).join("\n")}

Respond with a JSON array of nodes, each with: text, description, type (concept/action/technical/question/risk), q, r coordinates (matching template positions).
Keep descriptions concise (1-2 sentences). Make content specific to "${templateContext}", not generic.

Example format:
[{"q":0,"r":0,"text":"Dog Walker App","description":"Mobile platform connecting busy professionals with reliable dog walkers","type":"concept"},...]`;

    try {
      const response = await fetch(buildApiUrl("generate"), {
        method: "POST",
        headers: getRequestHeaders ? getRequestHeaders() : { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GEMINI_TEXT_MODEL,
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });

      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (generatedText) {
        const generatedNodes = JSON.parse(generatedText);
        const newNodes: Record<string, HexNode> = {};

        generatedNodes.forEach(
          (
            gNode: { q: number; r: number; text: string; description: string; type: string },
            index: number
          ) => {
            const key = getNodeKey(gNode.q, gNode.r);
            newNodes[key] = {
              q: gNode.q,
              r: gNode.r,
              text: gNode.text,
              description: gNode.description,
              type: index === 0 ? "root" : (gNode.type as HexNode["type"]) || "concept",
              depth: gNode.q === 0 && gNode.r === 0 ? 0 : 1,
              pinned: gNode.q === 0 && gNode.r === 0,
            };
          }
        );

        commitNodes(newNodes);
        setViewState({ x: 0, y: 0, zoom: 1 });
        setSelectedNodeId("0,0");
        setInspectedNodeId("0,0");
        setShowWelcome(false);
      }
    } catch (error) {
      console.error("Template generation error:", error);
      toast.error("Failed to generate template. Please try again.");
    } finally {
      setIsGeneratingTemplate(false);
      setPendingTemplate(null);
      setTemplateContext("");
    }
  }, [
    pendingTemplate,
    templateContext,
    commitNodes,
    setViewState,
    setSelectedNodeId,
    setInspectedNodeId,
    setShowWelcome,
    getRequestHeaders,
  ]);

  const handleUseDefault = useCallback(() => {
    if (pendingTemplate) {
      loadTemplate(pendingTemplate);
      setPendingTemplate(null);
      setTemplateContext("");
    }
  }, [pendingTemplate, loadTemplate]);

  return {
    showTemplates,
    setShowTemplates,
    selectedCategory,
    setSelectedCategory,
    pendingTemplate,
    setPendingTemplate,
    templateContext,
    setTemplateContext,
    isGeneratingTemplate,
    selectTemplate,
    loadTemplate,
    generateContextualTemplate,
    handleUseDefault,
  };
}
