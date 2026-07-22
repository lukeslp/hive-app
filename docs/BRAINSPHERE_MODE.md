# BrainSphere Workspace Mode

Idea Tiles now has a renderer-independent workspace document in
`shared/workspaceDocument.ts`. It is the source of truth for semantic content;
Tiles and Sphere are layout projections of the same graph, not separate boards.

## Document model

The versioned semantic graph assigns every node a stable ID and stores text,
description, type, depth, hierarchy, parent and relationship edges, key-theme
and pin state, and artifact attachment metadata. Layout data is separate:

- `projections.tiles` stores axial coordinates and viewport state.
- `projections.sphere` stores BrainSphere tile indices, 3D positions, topical
  alignments, camera state, and subdivision count.

The `tiles | sphere` mode registry records renderer availability. Switching the
active mode changes only `activeMode`; it preserves the graph and both
projections.

## Compatibility and transport

Strict, bounded Zod schemas migrate both current Idea Tiles session shapes and
the actual `lukeslp/brainsphere` `SessionData` shape. Imports reject unknown
fields, invalid references, duplicate coordinates or indices, oversized text,
node floods, edge floods, and payloads over 16 MiB. BrainSphere
`contextPrompt` becomes canonical generation context when `contextInfo` is
absent. Renderer-specific fields that cannot yet be canonicalized are retained
in an explicit compatibility section.

Cloud sessions keep their current Tiles fields and add `workspaceEnvelope`, so
older clients can still read them. On macOS, the envelope is rekeyed to the
native artifact board ID and saved as the board payload. Artifact Studio awaits
that serialized save immediately before export, so a package cannot use stale
or placeholder board data. Existing `IdeaTilesPackageCodec` integrity checks
then place it in `boards/{boardId}/board.json` inside an `.ideatiles` package;
Swift persistence and the package format remain unchanged.

Artifact Studio builds context from the canonical semantic graph internally.
Its existing `HexNode` API and coordinate-based scopes remain compatible.

## Preview status and renderer handoff

Sphere appears as a disabled Preview entry in Files and Settings. Setting
`VITE_ENABLE_SPHERE_MODE_PREVIEW=true` enables the entry, but it deliberately
shows an informational message because no 3D renderer ships yet.

A future renderer should port only BrainSphere's sphere geometry, camera, and
interaction code. It should consume semantic IDs and `projections.sphere`, then
write interaction changes back through the workspace mode boundary. Do not
import BrainSphere local-storage, provider, or credential code. Imported sphere
boards currently receive deterministic fallback axial coordinates so the Tiles
renderer can display and edit them immediately.
