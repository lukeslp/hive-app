/**
 * HexMind Type Definitions
 *
 * Comprehensive TypeScript types for the HiveMind spatial brainstorming application.
 * These types support hexagonal grid navigation, LLM-assisted node expansion,
 * and session management.
 *
 * @module types/hexmind
 */

import type { ElementType } from 'react';

// ============================================================================
// Node Types
// ============================================================================

/**
 * Valid node type identifiers
 *
 * - `root`: Central starting node (yellow)
 * - `concept`: Conceptual ideas (amber)
 * - `action`: Actionable items (rose)
 * - `technical`: Technical details (cyan)
 * - `question`: Questions to explore (purple)
 * - `risk`: Risks and concerns (red)
 * - `default`: Fallback type (slate)
 */
export type NodeType = 'root' | 'concept' | 'action' | 'technical' | 'question' | 'risk' | 'default';

/**
 * Core hexagonal node in the brainstorming grid
 *
 * Uses axial coordinate system (q, r) for hexagonal positioning.
 * Nodes can be expanded via AI to generate 6 contextual neighbors.
 */
export interface HexNode {
  /** Axial coordinate: column position */
  q: number;

  /** Axial coordinate: row position */
  r: number;

  /** Primary node title (2-4 words) */
  text: string;

  /** Detailed description (1-2 sentences, optional) */
  description?: string;

  /** Visual and semantic node type */
  type: NodeType;

  /** Depth in expansion tree (0 = root, increments with each expansion) */
  depth: number;

  /** Parent node key (format: "q,r") or null for root */
  parentId?: string | null;

  /** Whether node is pinned to prevent auto-pruning */
  pinned: boolean;

  /** User marked as key theme (prioritized in expansions) */
  isKeyTheme?: boolean;

  /** User clicked/touched this node */
  wasInteracted?: boolean;

  /**
   * Hierarchy level for visual priority:
   * - 1: Key theme
   * - 2: User interacted
   * - 3: Hovered
   * - 4: Untouched
   */
  hierarchyLevel?: number;

  /** Cluster identifier for grouped nodes */
  clusterId?: string;

  /** Whether this node is the root of a cluster */
  isClusterRoot?: boolean;

  /**
   * Question to ask user before expanding
   * (e.g., "What kind of cafe?")
   */
  contextPrompt?: string;

  /** User-provided contextual notes for LLM expansion */
  contextInfo?: string;

  /** Code snippet artifact (Sprint 3) */
  codeSnippet?: {
    language: string;
    code: string;
  };

  /** Data visualization artifact (Sprint 3) */
  visualization?: {
    type: 'chart' | 'map' | 'timeline' | 'diagram';
    data: unknown;
    config?: unknown;
  };

  /** Array of node keys for context transfer (Sprint 4) */
  linkedContext?: string[];

  /** LLM-suggested distant node connections */
  relatedNodeKeys?: string[];
}

/**
 * Partial node update for state modifications
 */
export type PartialHexNode = Partial<HexNode> & Pick<HexNode, 'q' | 'r'>;

/**
 * Node collection keyed by "q,r" coordinate string
 */
export type NodeMap = Record<string, HexNode>;

// ============================================================================
// Node Styling
// ============================================================================

/**
 * Visual styling configuration for node types
 */
export interface NodeTypeStyle {
  id: string;
  label: string;
  /** Tailwind text color class */
  color: string;
  /** Tailwind stroke color class */
  border: string;
  /** Tailwind fill color class (with opacity) */
  bg: string;
  /** Solid hex color for backgrounds */
  bgSolid: string;
  /** Lucide icon component */
  icon: ElementType;
}

/**
 * Complete node type styling map
 */
export type NodeTypeStyleMap = Record<NodeType, NodeTypeStyle>;

// ============================================================================
// Canvas & View State
// ============================================================================

/**
 * Canvas viewport state (pan and zoom)
 */
export interface ViewState {
  /** X-axis pan offset in pixels */
  x: number;

  /** Y-axis pan offset in pixels */
  y: number;

  /** Zoom level (0.5 = 50%, 1.0 = 100%, 2.0 = 200%) */
  zoom: number;
}

/**
 * Point in 2D space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Hexagonal coordinate using axial system
 */
export interface HexCoordinate {
  q: number;
  r: number;
}

/**
 * Canvas drag state tracking
 */
export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startViewX: number;
  startViewY: number;
}

// ============================================================================
// History & Undo/Redo
// ============================================================================

/**
 * History entry for undo/redo functionality
 */
export type HistoryEntry = NodeMap;

/**
 * History stack state
 */
export interface HistoryState {
  /** Array of historical node states */
  entries: HistoryEntry[];

  /** Current position in history (0 = oldest) */
  index: number;

  /** Maximum history entries before pruning old states */
  maxEntries: number;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Saved session metadata
 */
export interface SessionMetadata {
  /** Unique session identifier */
  id: string;

  /** User-provided session name */
  name: string;

  /** ISO date string of creation */
  date: string;

  /** Number of nodes in session */
  nodeCount: number;
}

/**
 * Complete session data for persistence
 */
export interface SessionData {
  /** Current node map */
  nodes: NodeMap;

  /** Canvas view state */
  view: ViewState;

  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Auto-save session data (stored in localStorage)
 */
export interface AutoSaveData {
  /** Node map */
  nodes: NodeMap;

  /** View state */
  view: ViewState;

  /** Last modified timestamp */
  timestamp: number;
}

// ============================================================================
// Modals & Dialogs
// ============================================================================

/**
 * Confirmation modal state
 */
export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// ============================================================================
// AI Generation
// ============================================================================

/**
 * AI generation rate limiting and tracking
 */
export interface GenerationTracker {
  /** Maximum number of AI generations allowed per session */
  maxGenerationsPerSession: number;

  /** Cooldown in milliseconds between auto-expansions */
  generationCooldown: number;

  /** Current count of generations in this session */
  generationCount: number;

  /** Timestamp of last generation (for cooldown enforcement) */
  lastGenerationTime: number | null;
}

/**
 * AI-generated branch suggestion
 */
export interface BranchSuggestion {
  /** Short title (2-4 words) */
  title: string;

  /** Brief explanation (1-2 sentences) */
  description: string;

  /** Node type classification */
  type: NodeType;

  /** Complexity rating (1-5, higher = more complex) */
  complexity: number;

  /** Whether to auto-expand this node */
  autoExpand: boolean;

  /** Optional context prompt before expansion */
  contextPrompt?: string | null;

  /** Related node keys for cross-connections */
  relatedTo?: string[] | null;
}

/**
 * AI generation response format
 */
export interface GenerationResponse {
  branches: BranchSuggestion[];
}

/**
 * Context information for AI generation
 */
export interface GenerationContext {
  /** Node being expanded */
  parentNode: HexNode;

  /** User-provided context for expansion */
  userContext?: string;

  /** All existing nodes for relationship detection */
  existingNodes: NodeMap;

  /** Force regeneration (ignore cache) */
  forceRefresh?: boolean;
}

// ============================================================================
// Templates
// ============================================================================

/**
 * Node template for quick starts
 */
export interface TemplateNode {
  q: number;
  r: number;
  text: string;
  description: string;
  type: NodeType;
}

/**
 * Complete template definition
 */
export interface Template {
  /** Unique template identifier */
  id: string;

  /** Display name */
  name: string;

  /** Template description */
  description: string;

  /** Category for organization */
  category: string;

  /** Pre-defined nodes in template */
  nodes: TemplateNode[];

  /** Optional icon identifier */
  icon?: string;
}

/**
 * Template category grouping
 */
export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  templates: Template[];
}

// ============================================================================
// Settings & Preferences
// ============================================================================

/**
 * User preference settings
 */
export interface UserSettings {
  /** Theme mode */
  theme: 'light' | 'dark';

  /** AI creativity level (0.0 - 1.0) */
  creativity: number;

  /** Font size multiplier (0.8 - 1.2) */
  fontSizeMultiplier: number;

  /** Enable/disable animations */
  enableAnimations: boolean;

  /** Auto-save functionality */
  enableAutoSave: boolean;

  /** Smart expansion suggestions */
  enableSmartExpansion: boolean;
}

// ============================================================================
// Events & Interactions
// ============================================================================

/**
 * Canvas mouse/touch event with node context
 */
export interface NodeInteractionEvent {
  nodeKey: string;
  node: HexNode;
  originalEvent: React.MouseEvent | React.TouchEvent;
}

/**
 * Keyboard shortcut action types
 */
export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'save'
  | 'export'
  | 'settings'
  | 'help'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'pin-node'
  | 'mark-key-theme';

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  action: ShortcutAction;
  keys: string[];
  description: string;
  category: 'navigation' | 'editing' | 'view' | 'help';
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard: Check if object is a valid HexNode
 */
export function isHexNode(obj: unknown): obj is HexNode {
  if (typeof obj !== 'object' || obj === null) return false;

  const node = obj as Partial<HexNode>;

  return (
    typeof node.q === 'number' &&
    typeof node.r === 'number' &&
    typeof node.text === 'string' &&
    typeof node.type === 'string' &&
    typeof node.depth === 'number' &&
    typeof node.pinned === 'boolean'
  );
}

/**
 * Type guard: Check if object is a valid NodeMap
 */
export function isNodeMap(obj: unknown): obj is NodeMap {
  if (typeof obj !== 'object' || obj === null) return false;

  return Object.values(obj).every(isHexNode);
}

/**
 * Type guard: Check if object is a valid ViewState
 */
export function isViewState(obj: unknown): obj is ViewState {
  if (typeof obj !== 'object' || obj === null) return false;

  const view = obj as Partial<ViewState>;

  return (
    typeof view.x === 'number' &&
    typeof view.y === 'number' &&
    typeof view.zoom === 'number'
  );
}

/**
 * Type guard: Check if object is a valid SessionData
 */
export function isSessionData(obj: unknown): obj is SessionData {
  if (typeof obj !== 'object' || obj === null) return false;

  const session = obj as Partial<SessionData>;

  return (
    isNodeMap(session.nodes) &&
    isViewState(session.view) &&
    typeof session.metadata === 'object' &&
    session.metadata !== null
  );
}

/**
 * Type guard: Check if string is a valid NodeType
 */
export function isNodeType(value: string): value is NodeType {
  return ['root', 'concept', 'action', 'technical', 'question', 'risk', 'default'].includes(value);
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Node key string format: "q,r"
 */
export type NodeKey = string;

/**
 * Extract node key from coordinates
 */
export function getNodeKey(q: number, r: number): NodeKey {
  return `${q},${r}`;
}

/**
 * Parse node key into coordinates
 */
export function parseNodeKey(key: NodeKey): HexCoordinate | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;

  const q = parseInt(parts[0], 10);
  const r = parseInt(parts[1], 10);

  if (isNaN(q) || isNaN(r)) return null;

  return { q, r };
}

/**
 * Readonly node for display purposes
 */
export type ReadonlyHexNode = Readonly<HexNode>;

/**
 * Node without coordinate information (for updates)
 */
export type NodeContent = Omit<HexNode, 'q' | 'r'>;

/**
 * Minimal node creation data
 */
export type CreateNodeData = Pick<HexNode, 'q' | 'r' | 'text' | 'type'> & {
  description?: string;
  parentId?: string | null;
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Hexagonal grid constants
 */
export const HEX_CONSTANTS = {
  /** Hexagon size in pixels */
  SIZE: 50,

  /** Gap between hexagons in pixels */
  GAP: 16,

  /** Hexagon aspect ratio */
  ASPECT: Math.sqrt(3),

  /** Number of neighbors per hexagon */
  NEIGHBOR_COUNT: 6,
} as const;

/**
 * Default view state values
 */
export const DEFAULT_VIEW_STATE: ViewState = {
  x: 0,
  y: 0,
  zoom: 0.8,
} as const;

/**
 * Default generation tracker values
 */
export const DEFAULT_GENERATION_TRACKER: GenerationTracker = {
  maxGenerationsPerSession: 100,
  generationCooldown: 2000,
  generationCount: 0,
  lastGenerationTime: null,
} as const;

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
  SESSIONS: 'hivemind_sessions',
  AUTOSAVE: 'hivemind_autosave',
  SETTINGS: 'hivemind_settings',
} as const;
