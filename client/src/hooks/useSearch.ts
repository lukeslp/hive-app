import { useState, useEffect, useRef } from 'react';
import type { HexNode } from '@/types/hivemind';

interface UseSearchOptions {
  nodes: Record<string, HexNode>;
}

interface UseSearchReturn {
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: HexNode[];
  currentSearchIndex: number;
  setCurrentSearchIndex: (index: number) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  cycleSearch: () => HexNode | null;
  handleCycleSearch: () => HexNode | null;
}

/**
 * Hook for managing search functionality
 *
 * Handles:
 * - Search query state
 * - Search results filtering
 * - Current search index
 * - Cycling through results
 */
export function useSearch({ nodes }: UseSearchOptions): UseSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HexNode[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter nodes based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results = Object.values(nodes).filter(
      (node) =>
        node.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  }, [searchQuery, nodes]);

  // Cycle to next search result
  const cycleSearch = (): HexNode | null => {
    if (searchResults.length === 0) return null;

    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);

    return searchResults[nextIndex];
  };

  return {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    searchInputRef,
    cycleSearch,
    handleCycleSearch: cycleSearch, // Alias for backward compatibility
  };
}
