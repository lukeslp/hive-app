/**
 * useTemplates - Template selection and contextual generation
 * Extracted from HiveMindApp.tsx monolith
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { buildApiUrl } from "@/lib/api";
import { GEMINI_TEXT_MODEL } from "@/lib/hexConstants";
import { isIos } from "@/lib/platform";
import {
  tryOnDeviceFirst,
  isFoundationModelsAvailable,
} from "@/lib/foundationModelsPlugin";
import { getNodeKey } from "@/types/hexmind";
import type { HexNode, ViewState } from "@/types/hivemind";
import type { Template } from "@/lib/templates";
import type { UseHistoryReturn } from "@/hooks/useHistory";

export interface GeneratedTemplateNode {
  q: number;
  r: number;
  text: string;
  description?: string;
  type?: string;
}

/**
 * Parse a model response (on-device or cloud) into template nodes.
 * Strips markdown code fences — the on-device model isn't grammar-
 * constrained on this path, so fenced output is common. Returns null
 * when the payload isn't a non-empty array of valid nodes.
 */
export function parseGeneratedTemplateNodes(
  raw: string
): GeneratedTemplateNode[] | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Free-form on-device output often wraps the array in prose
    // ("Here's your JSON: …" / trailing "Let me know!"). Extract the
    // outermost bracketed span and retry — on iOS a parse failure is a
    // dead end (no cloud retry), so leniency matters there.
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  try {
    if (!Array.isArray(parsed)) return null;
    const nodes = parsed.filter(
      (n): n is GeneratedTemplateNode =>
        typeof n?.text === "string" &&
        n.text.trim() !== "" &&
        Number.isFinite(n?.q) &&
        Number.isFinite(n?.r)
    );
    return nodes.length > 0 ? nodes : null;
  } catch {
    return null;
  }
}

interface UseTemplatesProps {
  commitNodes: UseHistoryReturn<Record<string, HexNode>>["push"];
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
      template.nodes.forEach(tNode => {
        const key = getNodeKey(tNode.q, tNode.r);
        newNodes[key] = {
          q: tNode.q,
          r: tNode.r,
          text: tNode.text,
          description: tNode.description,
          type:
            tNode.type === "concept" && tNode.depth === 0 ? "root" : tNode.type,
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
    [
      commitNodes,
      setViewState,
      setSelectedNodeId,
      setShowWelcome,
      announceTemplateLoaded,
    ]
  );

  const generateContextualTemplate = useCallback(async () => {
    if (!pendingTemplate || !templateContext.trim()) return;

    setIsGeneratingTemplate(true);

    const prompt = `You are helping create a brainstorming map. The user selected the "${pendingTemplate.name}" template and wants to apply it to: "${templateContext}"

Based on this template structure, generate customized content:
- Center node: The main topic adapted to their context
- Surrounding nodes: Specific subtopics relevant to their context

Template structure:
${pendingTemplate.nodes.map(n => `- ${n.text}: ${n.description} (type: ${n.type})`).join("\n")}

Respond with a JSON array of nodes, each with: text, description, type (concept/action/technical/question/risk), q, r coordinates (matching template positions).
Keep descriptions concise (1-2 sentences). Make content specific to "${templateContext}", not generic.

Example format:
[{"q":0,"r":0,"text":"Dog Walker App","description":"Mobile platform connecting busy professionals with reliable dog walkers","type":"concept"},...]`;

    const applyGeneratedNodes = (generatedNodes: GeneratedTemplateNode[]) => {
      const newNodes: Record<string, HexNode> = {};
      generatedNodes.forEach(gNode => {
        const key = getNodeKey(gNode.q, gNode.r);
        // Root is the node AT the center coordinate, not whichever entry
        // happens to be first — the parser may have filtered entries, so
        // array order no longer implies position.
        const isCenter = gNode.q === 0 && gNode.r === 0;
        newNodes[key] = {
          q: gNode.q,
          r: gNode.r,
          text: gNode.text,
          description: gNode.description ?? "",
          type: isCenter
            ? "root"
            : (gNode.type as HexNode["type"]) || "concept",
          depth: isCenter ? 0 : 1,
          pinned: isCenter,
        };
      });

      commitNodes(newNodes);
      setViewState({ x: 0, y: 0, zoom: 1 });
      setSelectedNodeId("0,0");
      setInspectedNodeId("0,0");
      setShowWelcome(false);
      // Success: close the modal and clear the typed context. On
      // failure these stay put so the user can retry without retyping
      // (the finally block only resets the spinner).
      setPendingTemplate(null);
      setTemplateContext("");
    };

    try {
      // ── On-device first (iOS 26+ Apple Intelligence) ──
      // Same privacy contract as every other generation path: on iOS
      // the user's template context NEVER goes to /api/generate
      // (privacy.html promises "no prompts leave your device").
      // Web falls through to the cloud proxy as before. Android also
      // goes to cloud — the Gemma path isn't wired here (it's stalled
      // platform-wide), and Android makes no on-device-only promise.
      const fm = await tryOnDeviceFirst({
        prompt,
        temperature: 0.7,
        maxTokens: 2048,
      });
      if (fm) {
        const nodes = parseGeneratedTemplateNodes(fm.text);
        if (nodes) {
          applyGeneratedNodes(nodes);
          return;
        }
      }

      // iOS is Apple-Intelligence-only: no cloud fallback. Distinguish
      // "device can't run it" from "it didn't respond this time" — after
      // a timeout the availability cache was just invalidated, so this
      // re-probe is accurate, and telling an eligible-device user that
      // Apple Intelligence "isn't available" would be wrong.
      if (isIos()) {
        if (fm) {
          toast.error("On-device returned unparseable output");
        } else if (await isFoundationModelsAvailable()) {
          toast.error("On-device generation didn't respond — please try again");
        } else {
          toast.error("Apple Intelligence isn't available on this device");
        }
        return;
      }

      if (fm) {
        toast.warning("On-device returned unparseable output — using cloud", {
          duration: 2500,
        });
      }

      const response = await fetch(buildApiUrl("generate"), {
        method: "POST",
        headers: getRequestHeaders
          ? getRequestHeaders()
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GEMINI_TEXT_MODEL,
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });

      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const nodes = parseGeneratedTemplateNodes(generatedText ?? "");
      if (nodes) {
        applyGeneratedNodes(nodes);
      } else {
        toast.error("Failed to generate template. Please try again.");
      }
    } catch (error) {
      console.error("Template generation error:", error);
      toast.error("Failed to generate template. Please try again.");
    } finally {
      // Only the spinner resets unconditionally — pendingTemplate and
      // templateContext are cleared on success (applyGeneratedNodes) so
      // a transient failure doesn't destroy the user's typed context.
      setIsGeneratingTemplate(false);
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
