# Artifact Studio across platforms

Artifact Studio lives in the shared client, but availability follows an explicit
platform capability contract. Web and Android use `webArtifactServices`; native
Mac uses `window.ideaTilesMac`; iOS does not render or open the studio. The text
transport also rejects hosted generation on iOS before any network request, so
a future missed UI gate cannot violate the iOS on-device-only promise.

## What works where

| Recipe kind | Recipes | Web / Android | iOS | macOS |
|---|---|---|---|
| `markdown` | brief, report, action-plan, narrative, custom-markdown, deep-dive, implementation-plan | Yes | No | Yes |
| `mermaid` | mermaid-diagram | Yes | No | Yes |
| `svg` | svg-asset | Yes | No | Yes |
| `staticWeb` | static-web-prototype | Yes | No | Yes |
| `codeBundle` | code-scaffold | Yes | No | Yes |
| `image` | image-playground-artwork | **No** — fails with a message naming what does work | No | Yes, via Image Playground |

Eleven of twelve recipes are text-shaped and use the established hosted
generation route on web and Android. They require no client-side provider key.

## Why image generation is not here yet

Image Playground is an Apple framework with no web equivalent. The substitute is
the dreamer gateway's `POST /v1/llm/images/generate`, which needs:

1. A server-side proxy route, so the gateway key never reaches the client —
   mirroring how `server/llmProxy.ts` fronts the text providers.
2. A `DREAMER_API_KEY` in the server environment. The app has no client-side
   gateway credential; provider secrets remain server-side.
3. A rate limit. Image Playground is on-device and free; every gateway image is
   a paid DALL·E or Aurora call.

Until then the recipe fails loudly. It never produces an empty artifact.

## The gateway image contract (confirmed 2026-08-07)

`POST /v1/llm/images/generate` was returning 500 on every call with a `size`.
Two separate bugs in `/home/coolhand/shared/llm_providers/xai_provider.py`, both
now fixed: `aspect_ratio` was passed as a top-level kwarg to the OpenAI SDK,
which validates its signature and raised `TypeError` before sending; and the
account is Zero Data Retention, which xAI refuses to serve URL-format images to,
so the response format is now `b64_json`.

Verified live. The response the OpenAPI document leaves unspecified is:

```json
{
  "image_data": "<base64, no data: prefix>",
  "model": "grok-imagine-image-quality",
  "provider": "xai",
  "revised_prompt": null
}
```

**`image_data` is JPEG, not PNG** — magic bytes `ffd8ff`. That matters twice:

- `artifactImageAttachmentSchema` pins `mimeType` to the literal `"image/png"`
  and the dataURL to a matching prefix, so a generated image **cannot be
  attached to a board** without transcoding to PNG first.
- `server/artifactPolicy.ts` checks PNG magic bytes for raster files, so a
  JPEG stored under `image/png` is rejected on sync.

So the image recipe needs a canvas transcode to PNG before it can produce an
`ArtifactFile`, or the schema needs to admit `image/jpeg` on both platforms.
Transcoding is the smaller change and keeps the Mac bridge untouched.

A dedicated gateway key exists ("Idea Tiles artifacts", 10k req/day). Set it as
`DREAMER_API_KEY` in the server environment; `server/imageProxy.ts` reads it and
answers 503 naming the variable until it is present.

Document export now has PDF as well: `reportlab` is installed on the gateway, so
`/v1/documents/formats` reports `markdown`, `pdf`, `docx`.

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

## iOS intentionally has no Artifact Studio

macOS runs artifact generation through `GenerationEngine`, which tries Apple
Foundation Models on device first. The shared web service posts to the hosted
LLM proxy, so exposing it on iOS would contradict the published no-cloud-fallback
promise. iOS remains gated until a measured, on-device artifact path exists or
the product deliberately changes its privacy contract and store disclosures.

## Cancellation

Generation POSTs are cross-origin under Capacitor, where `CapacitorHttp`
silently drops `options.signal` and iOS falls back to a 600-second timeout — so
an `AbortController` alone passes every browser test and does nothing on device.
All API requests go through `fetchApi` in `client/src/lib/api.ts`, which races
the request against the caller's signal and an explicit deadline. Do not call
`fetch` directly for a cross-origin POST.
