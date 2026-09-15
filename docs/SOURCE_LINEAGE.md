# Source lineage

Idea Tiles is maintained in `lukeslp/hive-app`. Its older package and storage
names remain for compatibility. It combines a hexagonal board with native
platform hosts. The related projects below remain separately maintained source trees.

## Rind / BrainSphere

The separate [BrainSphere repository](https://github.com/lukeslp/brainsphere)
contains the standalone Rind sphere app. Idea Tiles adapted its geodesic
geometry and sphere interactions in commit `03ffed9`. The adapted geometry
is `client/src/lib/hexasphere.ts`, and `client/src/components/RindCanvas.tsx`
is the Mac renderer. The two geometry files are not byte-identical.

The shared document in `shared/workspaceDocument.ts` imports the standalone
BrainSphere `SessionData` shape and validates its references and size limits.
The native Mac app owns generation, credentials, history, and persistence;
those services were not copied into the renderer. Rind and Tiles are two
views of the same Idea Tiles board. Web, iOS, and Android do not load Rind's
renderer. See [Rind workspace mode](BRAINSPHERE_MODE.md) for the document and
compatibility details.

Both TypeScript geometry implementations credit Robert Scanlon's
hexasphere.js as inspiration. Its MIT notice is preserved in
[third-party notices](../THIRD_PARTY_NOTICES.md).

## HiveMind

[HiveMind](https://github.com/actually-useful-ai/hivemind) is an older web
hexagonal brainstorming app. It has its own `HiveMindApp.tsx`, `HexCanvas.tsx`,
API paths, and repository history. Idea Tiles retains related `hivemind`
type names and older brand aliases, but its canonical workspace, native hosts,
platform generation rules, and Rind renderer live here.

This note covers the maintained projects and the Rind adaptation visible in
the source. A complete file-by-file ancestry analysis remains outside this
review. Standalone Rind and HiveMind need their own review before a separate
release.
