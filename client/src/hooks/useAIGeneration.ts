/**
 * useAIGeneration Hook
 *
 * Encapsulates all AI generation logic for HiveMind:
 * - Neighbor generation via Gemini API
 * - Rate limiting and error handling
 * - Loading state management
 * - Weighted board context: starred/user-expanded nodes influence all generations
 */

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/api';
import { sanitizeJson } from '@/lib/sanitize';
import { GEMINI_TEXT_MODEL, DIRECTIONS } from '@/lib/hexConstants';
import type { HexNode } from '@/types/hivemind';
import { haptics } from '@/lib/haptics';
import { getNodeKey } from '@/types/hexmind';
import type { NodeTypeStyle } from '@/types/hexmind';
import { tryOnDeviceFirst } from '@/lib/foundationModelsPlugin';
import { isIos } from '@/lib/platform';

// Constants
const MAX_REQUEST_SIZE = 50000; // 50KB limit
const REQUEST_TIMEOUT = 30000; // 30 seconds

export interface UseAIGenerationOptions {
  nodes: Record<string, HexNode>;
  NODE_TYPES: Record<string, NodeTypeStyle>;
  maxGenerationsPerSession?: number;
  enableSmartExpansion?: boolean;
}

export interface UseAIGenerationReturn {
  // State
  isGenerating: boolean;
  error: string | null;
  creativity: number;
  bridgingIntensity: number;
  generationsThisSession: number;
  isThrottled: boolean;

  // Actions
  setCreativity: (value: number) => void;
  setBridgingIntensity: (value: number) => void;
  generateNeighbors: (
    centerNode: HexNode,
    forceRefresh?: boolean,
    additionalContext?: string
  ) => Promise<Record<string, HexNode> | null>;
  resetGenerationCount: () => void;
  clearError: () => void;
}

// Helper: Calculate distance between two hex nodes
const hexDistance = (a: { q: number; r: number }, b: { q: number; r: number }) => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

/**
 * Build weighted board context from the entire node graph.
 * 
 * Scoring weights:
 *   - isKeyTheme (starred):     +5
 *   - wasInteracted (expanded):  +3
 *   - isClusterRoot:             +2
 *   - has contextInfo:           +1
 *   - has relatedNodeKeys:       +1
 * 
 * Nodes are sorted by weight descending, then by distance to the center node.
 * The top N are included as "board-wide themes" in the prompt, giving the LLM
 * awareness of distant clusters so new tiles can bridge between them.
 */
interface WeightedNode {
  key: string;
  node: HexNode;
  weight: number;
  distance: number;
  clusterId?: string;
}

function buildBoardContext(
  centerNode: HexNode,
  allNodes: Record<string, HexNode>,
  maxItems: number = 15
): { nearbyContext: string; boardThemes: string; clusterSummaries: string } {
  const centerKey = getNodeKey(centerNode.q, centerNode.r);
  const centerPos = { q: centerNode.q, r: centerNode.r };

  const weighted: WeightedNode[] = [];

  for (const [key, node] of Object.entries(allNodes)) {
    if (key === centerKey) continue;

    let weight = 0;
    if (node.isKeyTheme) weight += 5;
    if (node.wasInteracted) weight += 3;
    if (node.isClusterRoot) weight += 2;
    if (node.contextInfo) weight += 1;
    if (node.relatedNodeKeys && node.relatedNodeKeys.length > 0) weight += 1;

    const distance = hexDistance(centerPos, { q: node.q, r: node.r });

    weighted.push({ key, node, weight, distance, clusterId: node.clusterId });
  }

  // --- Nearby context (same cluster or close distance) ---
  const nearby = weighted
    .filter(w => w.distance <= 4 || w.node.clusterId === centerNode.clusterId)
    .sort((a, b) => b.weight - a.weight || a.distance - b.distance)
    .slice(0, 10);

  const nearbyContext = nearby.length > 0
    ? nearby.map(({ node }) => {
        const tags: string[] = [];
        if (node.isKeyTheme) tags.push("★");
        if (node.wasInteracted) tags.push("expanded");
        return `- [${node.type.toUpperCase()}] ${node.text}${tags.length ? ` (${tags.join(", ")})` : ""}`;
      }).join("\n")
    : "No nearby nodes yet.";

  // --- Board-wide important themes (from OTHER clusters, high weight) ---
  const otherClusterThemes = weighted
    .filter(w => {
      // Must be from a different cluster (or no cluster) and have meaningful weight
      const differentCluster = w.node.clusterId !== centerNode.clusterId;
      const isImportant = w.weight >= 3; // starred or user-expanded
      return differentCluster && isImportant;
    })
    .sort((a, b) => b.weight - a.weight || a.distance - b.distance)
    .slice(0, maxItems);

  const boardThemes = otherClusterThemes.length > 0
    ? otherClusterThemes.map(({ node, distance }) => {
        const tags: string[] = [];
        if (node.isKeyTheme) tags.push("★ starred");
        if (node.wasInteracted) tags.push("user-explored");
        if (node.contextInfo) tags.push(`context: "${node.contextInfo.slice(0, 60)}"`);
        return `- "${node.text}" [${node.type}] (dist: ${distance})${tags.length ? ` — ${tags.join(", ")}` : ""}`;
      }).join("\n")
    : "";

  // --- Cluster summaries (one-line per distinct cluster) ---
  const clusterMap = new Map<string, { roots: string[]; count: number; starredCount: number }>();
  for (const [, node] of Object.entries(allNodes)) {
    const cid = node.clusterId || "unclustered";
    if (cid === centerNode.clusterId) continue;
    if (!clusterMap.has(cid)) {
      clusterMap.set(cid, { roots: [], count: 0, starredCount: 0 });
    }
    const entry = clusterMap.get(cid)!;
    entry.count++;
    if (node.isClusterRoot) entry.roots.push(node.text);
    if (node.isKeyTheme) entry.starredCount++;
  }

  const clusterSummaries = clusterMap.size > 0
    ? Array.from(clusterMap.entries())
        .filter(([, v]) => v.count >= 2) // only meaningful clusters
        .sort((a, b) => b[1].starredCount - a[1].starredCount || b[1].count - a[1].count)
        .slice(0, 6)
        .map(([, v]) => {
          const root = v.roots[0] || "unnamed";
          return `- Cluster "${root}" (${v.count} nodes, ${v.starredCount} starred)`;
        })
        .join("\n")
    : "";

  return { nearbyContext, boardThemes, clusterSummaries };
}

/**
 * Parse raw LLM text into branch objects. Handles JSON parsing with
 * sanitizeJson fallback and regex extraction as last resort.
 */
function parseBranches(rawText: string): Array<{
  title: string;
  description?: string;
  type?: string;
  complexity?: number;
  autoExpand?: boolean;
  contextPrompt?: string;
  relatedTo?: string[];
}> {
  // Strip markdown code fences
  const text = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

  const sanitizedText = sanitizeJson(text);
  let branches: Array<Record<string, unknown>> = [];

  try {
    const parsed = sanitizedText ? JSON.parse(sanitizedText) : {};
    branches = parsed.branches || [];
  } catch {
    // Regex fallback
    try {
      const branchMatches = sanitizedText.match(/"title"\s*:\s*"([^"]+)"/g) || [];
      const descMatches = sanitizedText.match(/"description"\s*:\s*"([^"]+)"/g) || [];
      const typeMatches = sanitizedText.match(/"type"\s*:\s*"([^"]+)"/g) || [];

      for (let i = 0; i < Math.min(6, branchMatches.length); i++) {
        branches.push({
          title: branchMatches[i]?.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || `Idea ${i + 1}`,
          description: descMatches[i]?.match(/"description"\s*:\s*"([^"]+)"/)?.[1] || "",
          type: typeMatches[i]?.match(/"type"\s*:\s*"([^"]+)"/)?.[1] || "concept",
        });
      }
    } catch {
      branches = [];
    }
  }

  return branches as Array<{
    title: string;
    description?: string;
    type?: string;
    complexity?: number;
    autoExpand?: boolean;
    contextPrompt?: string;
    relatedTo?: string[];
  }>;
}

/**
 * Build HexNode records from parsed branches for 6 hex directions.
 */
function buildNeighborNodes(
  branches: ReturnType<typeof parseBranches>,
  centerNode: HexNode,
  allNodes: Record<string, HexNode>,
  NODE_TYPES: Record<string, NodeTypeStyle>,
  forceRefresh: boolean,
): Record<string, HexNode> {
  const key = getNodeKey(centerNode.q, centerNode.r);
  const defaultTypes = ["concept", "action", "technical", "question", "risk", "concept"];

  // Pad to 6
  while (branches.length < 6) {
    branches.push({
      title: `Idea ${branches.length + 1}`,
      description: `Related aspect of "${centerNode.text}"`,
      type: defaultTypes[branches.length % defaultTypes.length],
    });
  }

  const newNodes: Record<string, HexNode> = {};

  DIRECTIONS.forEach((dir, i) => {
    const nQ = centerNode.q + dir.q;
    const nR = centerNode.r + dir.r;
    const neighborKey = getNodeKey(nQ, nR);
    const existing = allNodes[neighborKey];
    const shouldUpdate =
      !existing || (forceRefresh && !existing.pinned && existing.parentId === key);

    if (shouldUpdate && branches[i]) {
      const nodeType = (branches[i].type ?? "concept").toLowerCase();
      const validType = NODE_TYPES[nodeType] ? nodeType : "concept";
      const newDepth = (centerNode.depth || 0) + 1;

      const relatedNodeKeys = (branches[i].relatedTo || [])
        .filter((relKey: string) =>
          allNodes[relKey] && relKey !== key && relKey !== neighborKey
        );

      const isBridgeTile = relatedNodeKeys.length > 0 && relatedNodeKeys.some((rk: string) => {
        const relNode = allNodes[rk];
        return relNode && relNode.clusterId && relNode.clusterId !== centerNode.clusterId;
      });

      const newNode: HexNode = {
        q: nQ,
        r: nR,
        text: branches[i].title || `Idea ${i + 1}`,
        description: branches[i].description || "",
        type: validType,
        depth: newDepth,
        parentId: key,
        pinned: false,
        clusterId: centerNode.clusterId,
        contextPrompt: branches[i].contextPrompt || undefined,
        relatedNodeKeys: relatedNodeKeys.length > 0 ? relatedNodeKeys : undefined,
        isBridge: isBridgeTile || undefined,
        bridgeTargetCluster: isBridgeTile
          ? allNodes[relatedNodeKeys.find((rk: string) => allNodes[rk]?.clusterId !== centerNode.clusterId) || '']?.clusterId
          : undefined,
      };

      newNodes[neighborKey] = newNode;
    }
  });

  return newNodes;
}

export function useAIGeneration({
  nodes,
  NODE_TYPES,
  maxGenerationsPerSession = 100,
  enableSmartExpansion = true,
}: UseAIGenerationOptions): UseAIGenerationReturn {
  // State
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creativity, setCreativity] = useState(0.5);
  const [generationsThisSession, setGenerationsThisSession] = useState(0);
  const [isThrottled, setIsThrottled] = useState(false);
  const [bridgingIntensity, setBridgingIntensity] = useState(0.5);

  // Refs for abort control
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Generate 6 neighboring nodes for a center node using Gemini API
   */
  const generateNeighbors = useCallback(async (
    centerNode: HexNode,
    forceRefresh = false,
    additionalContext = ""
  ): Promise<Record<string, HexNode> | null> => {
    const key = getNodeKey(centerNode.q, centerNode.r);

    // Check generation limit
    if (generationsThisSession >= maxGenerationsPerSession) {
      setIsThrottled(true);
      toast.error("Generation limit reached for this session. Start a new session to continue.");
      return null;
    }

    // Increment generation counter
    setGenerationsThisSession(prev => prev + 1);
    setIsGenerating(true);
    setError(null);

    const tempDesc =
      creativity < 0.3
        ? "Logical, concrete, and safe"
        : creativity > 0.7
          ? "Wild, abstract, and out-of-the-box"
          : "Balanced and creative";

    // Build weighted board context — scale maxItems by bridging intensity
    const bridgeMaxItems = Math.round(3 + bridgingIntensity * 17); // 3-20 items
    const { nearbyContext, boardThemes, clusterSummaries } = buildBoardContext(centerNode, nodes, bridgeMaxItems);

    // Build system prompt with board awareness
    const systemPrompt = `You are a spatial brainstorming engine for a hex mind map. Style: ${tempDesc}.

Given a central idea, generate EXACTLY 6 distinct related concepts as hex neighbors.
Each concept explores a different angle: operational, conceptual, risk, action, technical, or question.

RULES:
- Title: 2-4 words MAXIMUM. Short, punchy, scannable. Never write a full sentence.
- NO description field. Title only. No explanation.
- Type: concept | action | technical | question | risk
- Complexity 1-5: how much this idea could branch further
- autoExpand: true only for complexity 4-5 (max 2 per generation)
- Return ONLY valid JSON. No commentary.
${boardThemes ? `
BOARD AWARENESS:
The user has starred or explored these themes elsewhere on the board:
${boardThemes}
${clusterSummaries ? `\nOther active clusters:\n${clusterSummaries}` : ""}

IMPORTANT: Generate ${bridgingIntensity < 0.3 ? '0-1' : bridgingIntensity > 0.7 ? '2-3' : '1-2'} tiles that BRIDGE toward these distant themes.
${bridgingIntensity > 0.7 ? 'Aggressively seek cross-pollination — find surprising connections between seemingly unrelated ideas.' : bridgingIntensity < 0.3 ? 'Only bridge if there is a very natural, obvious connection. Stay focused on the immediate topic.' : 'Create conceptual connections — find angles that link the current idea to those broader interests.'}
This helps clusters grow toward each other organically.` : ""}

JSON schema:
{ "branches": [{ "title": "Short Label", "type": "concept", "complexity": 3, "autoExpand": false }] }

Example:
{ "branches": [
  { "title": "Revenue Model", "type": "action", "complexity": 3, "autoExpand": false },
  { "title": "Legal Risk", "type": "risk", "complexity": 2, "autoExpand": false }
]}`;

    const userQuery = `Central idea: "${centerNode.text}"
${centerNode.contextInfo ? `Context: ${centerNode.contextInfo}` : ""}
${additionalContext ? `Additional: ${additionalContext}` : ""}

Nearby nodes in this cluster:
${nearbyContext}

Generate 6 neighbor nodes.`;

    const temperature = 0.7 + (creativity * 0.6); // 0.7-1.3

    // ── Cloud path for both web and native mobile shells ───────────────────
    const requestPayload = {
      model: GEMINI_TEXT_MODEL,
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        temperature,
        maxOutputTokens: 2048,
      },
    };

    // Validate request size
    const requestSize = JSON.stringify(requestPayload).length;
    if (requestSize > MAX_REQUEST_SIZE) {
      const errorMsg = "Context too large - try marking fewer key themes";
      setError(errorMsg);
      toast.error(errorMsg);
      setIsGenerating(false);
      return null;
    }

    // ── Try Apple on-device inference first (iOS 26+ with Apple Intelligence) ──
    // On iOS this is the ONLY path — no cloud fallback. Web/Android still
    // fall through to /api/generate when FM isn't available.
    const fm = await tryOnDeviceFirst({
      prompt: userQuery,
      systemPrompt,
      temperature,
      maxTokens: 2048,
    });
    if (fm) {
      const branches = parseBranches(fm.text);
      if (branches.length > 0) {
        const newNodes = buildNeighborNodes(branches, centerNode, nodes, NODE_TYPES, forceRefresh);
        setIsGenerating(false);
        haptics.expand();
        toast("✦ Apple Intelligence", {
          description: "Generated on-device",
          duration: 1500,
        });
        return newNodes;
      }
    }

    // iOS is Apple-Intelligence-only: no cloud fallback. If FM didn't
    // return usable text, surface a clear error and emit placeholder
    // neighbors so the UI doesn't deadlock.
    if (isIos()) {
      const errorMsg = fm
        ? "On-device returned unparseable output"
        : "Apple Intelligence isn't available on this device";
      setError(errorMsg);
      toast.error(errorMsg);
      setIsGenerating(false);
      const placeholderNodes = buildNeighborNodes([], centerNode, nodes, NODE_TYPES, forceRefresh);
      return placeholderNodes;
    }

    if (fm) {
      // Web/Android: FM produced text but parseBranches found nothing
      // usable. Distinguish this from "FM didn't run" before falling through.
      toast.warning("On-device returned unparseable output — using cloud", { duration: 2500 });
    }

    // Create abort controller with timeout
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const fetchUrl = buildApiUrl("generate");
    console.log("[AI] cloud fetch starting:", fetchUrl, "payload bytes:", requestSize);

    try {
      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log("[AI] cloud fetch response:", response.status, response.statusText);

      const result = await response.json();

      if (!response.ok) {
        console.error("[AI] HTTP Error:", JSON.stringify({ status: response.status, statusText: response.statusText, body: result }));
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (result.error) {
        console.error("[AI] API Error:", JSON.stringify(result.error));
        throw new Error(result.error.message || "API request failed");
      }

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error("[AI] No text in API response. Top-level keys:", JSON.stringify(Object.keys(result ?? {})));
        throw new Error("API returned no content");
      }

      console.log("[AI] cloud text length:", text.length);
      const branches = parseBranches(text);
      console.log("[AI] parsed branches:", branches.length);
      const newNodes = buildNeighborNodes(branches, centerNode, nodes, NODE_TYPES, forceRefresh);

      setIsGenerating(false);
      haptics.expand();
      return newNodes;

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const errorMsg = "Request timeout - try again";
        setError(errorMsg);
        toast.error(errorMsg);
        setIsGenerating(false);
        return null;
      }

      console.error("[AI] generate failed:", JSON.stringify({
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      }));
      const errorMsg = err instanceof Error ? err.message : "Failed to generate ideas";
      setError(errorMsg);
      setIsGenerating(false);

      // Placeholder fallback
      const newNodes = buildNeighborNodes([], centerNode, nodes, NODE_TYPES, forceRefresh);
      return newNodes;
    } finally {
      abortControllerRef.current = null;
    }
  }, [creativity, nodes, NODE_TYPES, generationsThisSession, maxGenerationsPerSession, enableSmartExpansion]);

  /**
   * Reset generation counter (e.g., on new session)
   */
  const resetGenerationCount = useCallback(() => {
    setGenerationsThisSession(0);
    setIsThrottled(false);
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isGenerating,
    error,
    creativity,
    bridgingIntensity,
    generationsThisSession,
    isThrottled,

    // Actions
    setCreativity,
    setBridgingIntensity,
    generateNeighbors,
    resetGenerationCount,
    clearError,
  };
}
