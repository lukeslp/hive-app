# Artifact Studio across platforms

Artifact Studio has always lived in the shared web client — the UI, the twelve
recipes, board context extraction, and the preview all ship on every platform.
Until now only macOS could use it, because `HexmindApp` could only supply
`services` from `window.ideaTilesMac`, and `ArtifactStudio` shows
*"Artifact generation is available in the Idea Tiles Mac app"* when `services`
is absent.

`client/src/lib/webArtifactServices.ts` supplies that missing object for web,
iOS, and Android. macOS is unaffected: the call site is
`macArtifactHost?.artifactStudioServices ?? webArtifactServices`, so a Mac shell
always wins.

## What works where

| Recipe kind | Recipes | Web / iOS / Android | macOS |
|---|---|---|---|
| `markdown` | brief, report, action-plan, narrative, custom-markdown, deep-dive, implementation-plan | Yes | Yes |
| `mermaid` | mermaid-diagram | Yes | Yes |
| `svg` | svg-asset | Yes | Yes |
| `staticWeb` | static-web-prototype | Yes | Yes |
| `codeBundle` | code-scaffold | Yes | Yes |
| `image` | image-playground-artwork | **No** — fails with a message naming what does work | Yes, via Image Playground |

Eleven of twelve recipes are text-shaped, and text generation already ran on
every platform through `generateTextForCurrentPlatform`. Those eleven therefore
need no API key, no new endpoint, and no server work.

## Why image generation is not here yet

Image Playground is an Apple framework with no web equivalent. The substitute is
the dreamer gateway's `POST /v1/llm/images/generate`, which needs:

1. A server-side proxy route, so the gateway key never reaches the client —
   mirroring how `server/llmProxy.ts` fronts the text providers.
2. A `DREAMER_API_KEY` in the server environment. The app has no gateway
   credential today: `llmProxy.ts` calls Google, Anthropic, Mistral, and OpenAI
   directly, and `BUILT_IN_FORGE_API_URL` / `_KEY` point at a different service
   (`server/_core/imageGeneration.ts`, kernel scaffold, imported nowhere).
3. A rate limit. Image Playground is on-device and free; every gateway image is
   a paid DALL·E or Aurora call.

Until then the recipe fails loudly. It never produces an empty artifact.

## Decisions taken, and how to reverse them

These were settled to keep Phase 1 unblocked. Each is cheap to revisit.

| Decision | Why | To change |
|---|---|---|
| Gateway images would record `provenance.generator.kind: "dreamer"` | The enum is `onDevice \| directProvider \| dreamer \| imagePlayground` and is `.strict()`. Reusing `dreamer` avoids editing `shared/`, the Mac `RPCRequestValidator`, and both platforms. | Add an enum member and a matching validator arm |
| Local storage is IndexedDB | `artifactPolicy` permits 8MB per image; localStorage caps near 5MB for the whole origin and holds strings only | `client/src/lib/artifactStore.ts` |
| Export writes the raw file | Keeps `reportlab` and `/v1/documents/generate` off the critical path | Route Markdown through `POST /v1/documents/generate` for DOCX/PDF |
| Anonymous users can generate, save, and export | Local work needs no account; only cloud sync is `protectedProcedure` | — |

## Constraints any future artifact code must respect

Learned by reading the enforcement, not by assumption:

- **Checksums cover decoded bytes.** `server/artifactPolicy.ts` recomputes
  `sha256` over the decoded payload and rejects the sync on mismatch. Hashing
  the base64 text instead is the easy mistake; `artifactManifest.test.ts` pins
  the correct behaviour against `node:crypto`.
- **`sizeBytes` is the decoded length**, not the string length.
- **Text declares `utf8`, raster images declare `base64`.** The server rejects
  the reverse, and checks PNG magic bytes.
- **`previewFile` only renders files whose `content` is a string**, wants
  `index.html` for `staticWeb`, and wants raw base64 with no `data:` prefix for
  images.
- **`artifactImageAttachmentSchema` pins `mimeType` to the literal
  `"image/png"`** and the `dataURL` to a matching prefix, so only PNG can be
  attached to a board.
- **Models fence structured output regardless of instructions.** A leading
  ``` makes an SVG fail to render and feeds the preview iframe invalid HTML, so
  non-markdown kinds are unwrapped. Markdown keeps its fences.

## Cancellation

Generation POSTs are cross-origin under Capacitor, where `CapacitorHttp`
silently drops `options.signal` and iOS falls back to a 600-second timeout — so
an `AbortController` alone passes every browser test and does nothing on device.
All API requests go through `fetchApi` in `client/src/lib/api.ts`, which races
the request against the caller's signal and an explicit deadline. Do not call
`fetch` directly for a cross-origin POST.
