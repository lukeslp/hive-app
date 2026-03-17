/**
 * Hexpand Type Definitions
 */

export interface HexNode {
  q: number;
  r: number;
  text: string;
  description?: string;
  type: string;
  depth: number;
  parentId?: string | null;
  pinned: boolean;
  isKeyTheme?: boolean;
  wasInteracted?: boolean;     // User clicked/touched node
  hierarchyLevel?: number;     // 1=key, 2=interacted, 3=hover, 4=untouched
  clusterId?: string;          // Identifies which cluster this node belongs to
  isClusterRoot?: boolean;     // True for root nodes of each cluster
  contextPrompt?: string;      // Question to ask user before expanding
  contextInfo?: string;        // Generic user notes for LLM context
  codeSnippet?: {
    language: string;
    code: string;
  };
  visualization?: {
    type: 'chart' | 'map' | 'timeline' | 'diagram';
    data: any;
    config?: any;
  };
  linkedContext?: string[];    // Array of node keys for context transfer
  relatedNodeKeys?: string[];  // LLM-suggested distant connections
  isBridge?: boolean;           // True if this tile was generated as a cross-cluster bridge
  bridgeTargetCluster?: string; // The cluster ID this bridge tile connects toward
}

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface GenerationTracker {
  maxGenerationsPerSession: number;    // Maximum number of AI generations allowed per session
  generationCooldown: number;          // Cooldown in milliseconds between auto-expansions
  generationCount: number;             // Current count of generations in this session
  lastGenerationTime: number | null;   // Timestamp of last generation (for cooldown)
}
