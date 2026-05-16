/**
 * useMergeSuggestions - Detects when clusters grow close and suggests thematic connections
 *
 * Monitors cluster proximity on the hex grid. When two clusters have tiles
 * within a threshold distance, it finds the best pair of tiles to connect
 * based on thematic overlap (shared words, bridge tiles, starred nodes).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { HexNode } from "@/types/hivemind";
import { hexToPixel } from "@/lib/hexGrid";

// ── Types ────────────────────────────────────────────────────────────────

export interface MergeSuggestion {
  id: string;
  clusterA: string;
  clusterB: string;
  nodeKeyA: string;
  nodeKeyB: string;
  nodeA: HexNode;
  nodeB: HexNode;
  reason: string;
  score: number;
  midpoint: { x: number; y: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Hex distance between two axial coords */
function hexDistance(
  a: { q: number; r: number },
  b: { q: number; r: number }
): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

/** Extract significant words from text (3+ chars, lowercased, no stop words) */
function extractWords(text: string): Set<string> {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "had",
    "her",
    "was",
    "one",
    "our",
    "out",
    "has",
    "his",
    "how",
    "its",
    "may",
    "new",
    "now",
    "old",
    "see",
    "way",
    "who",
    "did",
    "get",
    "let",
    "say",
    "she",
    "too",
    "use",
    "with",
    "this",
    "that",
    "from",
    "they",
    "been",
    "have",
    "many",
    "some",
    "them",
    "than",
    "each",
    "make",
    "like",
    "into",
    "just",
    "over",
    "such",
    "take",
    "also",
    "more",
    "what",
    "when",
    "will",
    "about",
    "could",
    "other",
    "their",
    "which",
    "would",
    "these",
    "being",
    "there",
    "where",
    "should",
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w))
  );
}

/** Score thematic overlap between two nodes */
function overlapScore(
  a: HexNode,
  b: HexNode
): { score: number; reason: string } {
  const wordsA = extractWords(`${a.text} ${a.description || ""}`);
  const wordsB = extractWords(`${b.text} ${b.description || ""}`);

  let shared = 0;
  const sharedWords: string[] = [];
  for (const w of Array.from(wordsA)) {
    if (wordsB.has(w)) {
      shared++;
      if (sharedWords.length < 3) sharedWords.push(w);
    }
  }

  let score = shared * 2;
  let reason = "";

  // Bonus for bridge tiles
  if (a.isBridge && a.bridgeTargetCluster === b.clusterId) {
    score += 5;
    reason = `"${a.text}" was generated as a bridge toward this cluster`;
  } else if (b.isBridge && b.bridgeTargetCluster === a.clusterId) {
    score += 5;
    reason = `"${b.text}" was generated as a bridge toward this cluster`;
  }

  // Bonus for starred/key theme nodes
  if (a.isKeyTheme) score += 2;
  if (b.isKeyTheme) score += 2;

  // Bonus for same type
  if (a.type === b.type && a.type !== "concept") score += 1;

  if (!reason && sharedWords.length > 0) {
    reason = `Share themes: ${sharedWords.join(", ")}`;
  } else if (!reason) {
    reason = `Related ${a.type} and ${b.type} concepts`;
  }

  return { score, reason };
}

// ── Hook ─────────────────────────────────────────────────────────────────

interface UseMergeSuggestionsOptions {
  /** Maximum hex distance between clusters to trigger a suggestion */
  proximityThreshold?: number;
  /** Minimum overlap score to show a suggestion */
  minScore?: number;
  /** Maximum number of suggestions to show at once */
  maxSuggestions?: number;
}

export function useMergeSuggestions(
  nodes: Record<string, HexNode>,
  options: UseMergeSuggestionsOptions = {}
) {
  const { proximityThreshold = 4, minScore = 2, maxSuggestions = 3 } = options;

  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  const computeTimer = useRef<NodeJS.Timeout | null>(null);

  // ── Group nodes by cluster ──────────────────────────────────────────────
  const clusterMap = useMemo(() => {
    const map: Record<string, { key: string; node: HexNode }[]> = {};
    for (const [key, node] of Object.entries(nodes)) {
      const cid = node.clusterId || "main";
      if (!map[cid]) map[cid] = [];
      map[cid].push({ key, node });
    }
    return map;
  }, [nodes]);

  // ── Compute suggestions (debounced) ─────────────────────────────────────
  const computeSuggestions = useCallback(() => {
    const clusterIds = Object.keys(clusterMap);
    if (clusterIds.length < 2) {
      setSuggestions([]);
      return;
    }

    const candidates: MergeSuggestion[] = [];

    // Compare each pair of clusters
    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        const cidA = clusterIds[i];
        const cidB = clusterIds[j];
        const nodesA = clusterMap[cidA];
        const nodesB = clusterMap[cidB];

        // Find the closest pair of nodes between the two clusters
        let minDist = Infinity;
        let closestA: { key: string; node: HexNode } | null = null;
        let closestB: { key: string; node: HexNode } | null = null;

        for (const a of nodesA) {
          for (const b of nodesB) {
            const d = hexDistance(a.node, b.node);
            if (d < minDist) {
              minDist = d;
              closestA = a;
              closestB = b;
            }
          }
        }

        // Only suggest if clusters are within proximity threshold
        if (minDist > proximityThreshold || !closestA || !closestB) continue;

        // Now find the best thematic pair (not necessarily the closest physically)
        let bestPair: {
          a: typeof closestA;
          b: typeof closestB;
          score: number;
          reason: string;
        } | null = null;

        // Check top candidates from each cluster (limit to avoid O(n^2) explosion)
        const topA = nodesA
          .filter(
            n => n.node.isKeyTheme || n.node.isBridge || n.node.wasInteracted
          )
          .slice(0, 5);
        const topB = nodesB
          .filter(
            n => n.node.isKeyTheme || n.node.isBridge || n.node.wasInteracted
          )
          .slice(0, 5);

        // Fall back to closest nodes if no interesting ones
        const candidatesA = topA.length > 0 ? topA : [closestA];
        const candidatesB = topB.length > 0 ? topB : [closestB];

        for (const a of candidatesA) {
          for (const b of candidatesB) {
            const { score, reason } = overlapScore(a.node, b.node);
            if (!bestPair || score > bestPair.score) {
              bestPair = { a, b, score, reason };
            }
          }
        }

        if (!bestPair || bestPair.score < minScore) continue;

        const pairId = [cidA, cidB].sort().join("::");
        if (dismissedPairs.has(pairId)) continue;

        // Compute midpoint for positioning the suggestion indicator
        const pixA = hexToPixel(bestPair.a.node.q, bestPair.a.node.r);
        const pixB = hexToPixel(bestPair.b.node.q, bestPair.b.node.r);

        candidates.push({
          id: pairId,
          clusterA: cidA,
          clusterB: cidB,
          nodeKeyA: bestPair.a.key,
          nodeKeyB: bestPair.b.key,
          nodeA: bestPair.a.node,
          nodeB: bestPair.b.node,
          reason: bestPair.reason,
          score: bestPair.score,
          midpoint: {
            x: (pixA.x + pixB.x) / 2,
            y: (pixA.y + pixB.y) / 2,
          },
        });
      }
    }

    // Sort by score descending and limit
    candidates.sort((a, b) => b.score - a.score);
    setSuggestions(candidates.slice(0, maxSuggestions));
  }, [
    clusterMap,
    proximityThreshold,
    minScore,
    maxSuggestions,
    dismissedPairs,
  ]);

  // Debounce computation — recalculate 1s after nodes change
  useEffect(() => {
    if (computeTimer.current) clearTimeout(computeTimer.current);
    computeTimer.current = setTimeout(computeSuggestions, 1000);
    return () => {
      if (computeTimer.current) clearTimeout(computeTimer.current);
    };
  }, [computeSuggestions]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const dismissSuggestion = useCallback((suggestionId: string) => {
    setDismissedPairs(prev => new Set([...Array.from(prev), suggestionId]));
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  }, []);

  const clearDismissed = useCallback(() => {
    setDismissedPairs(new Set());
  }, []);

  return {
    suggestions,
    dismissSuggestion,
    clearDismissed,
  };
}
