# Rind Workspace Mode

Idea Tiles now has a renderer-independent workspace document in
`shared/workspaceDocument.ts`. It is the source of truth for semantic content;
Tiles and Rind are layout projections of the same graph, not separate boards.
The stored mode identifier remains `sphere` so existing BrainSphere/Rind files
continue to round-trip.

## Document model

The versioned semantic graph assigns every node a stable ID and stores text,
description, type, depth, hierarchy, parent and relationship edges, key-theme
and pin state, and artifact attachment metadata. Layout data is separate:

- `projections.tiles` stores axial coordinates and viewport state.
- `projections.sphere` stores Rind tile indices, 3D positions, topical
  alignments, camera state, and subdivision count.

The `tiles | sphere` mode registry records renderer availability. Switching the
active mode changes only `activeMode`; it preserves the graph and both
projections.

## Compatibility and transport

Strict, bounded Zod schemas migrate both current Idea Tiles session shapes and
the actual `lukeslp/brainsphere` `SessionData` shape. Imports reject unknown
fields, invalid references, duplicate coordinates or indices, oversized text,
node floods, edge floods, JSON nesting beyond 64 levels, and payloads over
16,000,000 UTF-8 bytes. BrainSphere
`contextPrompt` becomes canonical generation context when `contextInfo` is
absent. Renderer-specific fields that cannot yet be canonicalized are retained
in an explicit compatibility section.

Local autosave, explicit local saves, and new cloud writes store one canonical
workspace envelope. Legacy Tiles and BrainSphere session objects remain
migration-on-read inputs, but are not duplicated beside the envelope. Deploy
the `sessions.data` TEXT-to-MEDIUMTEXT migration before updated clients write
the new form, and coordinate the client rollout: older builds may not read
sessions saved by a canonical-only client.

On macOS, the envelope is rekeyed to the native artifact board ID and saved as
the board payload. Artifact Studio awaits that serialized save immediately
before export. `IdeaTilesPackageCodec` requires and validates that canonical
payload, including its embedded board ID, before placing it at
`boards/{boardId}/board.json` inside an `.ideatiles` package.

Artifact Studio builds context from the canonical semantic graph internally.
Its existing `HexNode` API and coordinate-based scopes remain compatible.

## Native Mac renderer

Rind is an available workspace mode only in the dedicated native macOS build.
Files and Settings can switch between Tiles and Rind. Web, iOS, and Android
keep Tiles active and do not include the Three.js renderer chunk.

The renderer ports Rind's geodesic hexasphere geometry, orbit camera, labeled
idea tiles, selection, and inspection interaction. New placements are stable,
collision-free, and parent-adjacent when topology allows. Imported placements
win over derived positions. Camera, subdivision count, and placements write
back through `projections.sphere`; all generation, history, artifacts, board
identity, and save/export behavior remains owned by Idea Tiles.

The 3D canvas has a DOM-accessible list of the same ideas, and renderer startup
failure leaves a readable error rather than a blank canvas. BrainSphere/Rind
local storage, provider, and credential code is intentionally absent. Imported
sphere boards still receive deterministic fallback axial coordinates so Tiles
can display and edit them immediately.
