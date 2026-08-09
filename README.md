# Idea Tiles

**Idea Tiles** (_Brainstorm with local language models_) is a hexagonal tile brainstorming app built as a React SPA with an Express backend, plus Capacitor shells for iOS and Android. **Canonical marketing origin:** `https://ideatiles.app`. Bundle id and some legacy domains may still reference **hexmind**; user-facing copy uses Idea Tiles.

## What This Project Does

- Expands ideas into neighboring hex tiles with language-model-assisted brainstorming.
- Supports merge/combine workflows, clustering, key-theme marking, and visual linking.
- Saves sessions locally and can sync/share collaborative sessions through the server (web; cloud session list is disabled in the native shell today — see `docs/RELEASE_SPEC.md`).
- Runs as:
  - Web app (`pnpm dev` / `pnpm start`)
  - iOS app (Capacitor + Apple Foundation Models path)
  - Android app (AICore Gemini Nano, then checksum-verified Gemma, then cloud)
  - macOS app (native SwiftUI/WebKit shell with Artifact Studio and Rind spatial mode)

## Current Product State (August 2026)

- **Apple distribution:** version 1.3.1 is public for iPhone and iPad; the Mac App Store remains on 1.3. Native Mac build 5 is valid in TestFlight, and the signed/notarized universal 1.3.1 (5) ZIP is available from the [Idea Tiles downloads page](https://dr.eamer.dev/downloads/apps/idea-tiles/). It has not been submitted for App Store review. Listing metadata is managed as code in `ios/fastlane/` and `macos/fastlane/`.
- **Android:** signed version 1.3.0 is available as a direct download; the current 1.3.1 source still needs a separate signed device/store release pass.
- Brand display name is **Idea Tiles** while legacy storage keys intentionally remain `hexpand_*` for data continuity.
- **Rind mode:** the native Mac app can switch the same board between Tiles and a labeled, orbitable geodesic sphere. Placements and camera state persist in the canonical workspace; web, iOS, and Android remain Tiles-only.
- **Sharing MVP:** iOS and Android use **local exports only** — PNG / JPG / SVG / JSON through native sharing. **Share-link creation and live collaboration are web/native-Mac capabilities**; both mobile shells still open received `?s=` links. See [`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md).
- Share modal includes a dedicated **Bring to iOS** action that prefers the canonical universal-link origin (`APP_PUBLIC_WEB_ORIGIN`) so boards can be handed off to the iOS app flow more reliably.
- Settings modal now uses a compact, screen-space-first control row: theme toggle, accessibility font cycling (Atkinson/Lexend/OpenDyslexic/Aptos/System), font size +/- controls, animation toggle, high-contrast toggle, prominent Auto-Save, and a destructive "Delete Current Board" action.
- Hex tile title rendering now favors readability: removed forced uppercase in-node labels and switched to balanced wrapping with normal word breaking to reduce awkward mid-word splits on mobile.
- Hosted/web provider behavior is locked to OpenAI in-app; the provider picker remains hidden.
- Settings visual treatment now uses a softer glass/card style and removes dense provider-management controls for a cleaner, on-brand surface.
- iOS behavior is intentionally privacy-first: tile generation on iOS is on-device only (no cloud fallback).
- Artifact Studio is unavailable on iOS because its shared-client transport is hosted. Web, Android, and native Mac retain Artifact Studio; the transport also rejects hosted generation on iOS as defense in depth.
- The native Mac app defaults to Apple Foundation Models. Optional direct-provider keys stay in Keychain; Dreamer access is a single curated choice redeemed with a one-time invite. Request access at `https://dr.eamer.dev/api/docs/access.html`.
- On iOS, neighbor-generation failures no longer synthesize placeholder tiles or fall through to cloud — empty slots stay empty and the user gets an explicit availability/parse error toast. On web/Android the cloud path may still pad to six branches when the model returns fewer; see `client/src/hooks/useAIGeneration.ts` (`buildNeighborNodes`).
- Universal Links/AASA and server operations remain in [`NEXT_STEPS.md`](NEXT_STEPS.md).

## Quick Start

Prerequisites:

- Node 20+
- `pnpm` (required; lockfile and patched dependencies expect pnpm)
- Optional: MySQL + `DATABASE_URL` for session persistence paths

Install and run:

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm check        # TypeScript typecheck
pnpm test         # Vitest
pnpm build        # Vite client + esbuild server bundle
pnpm start        # Production server
pnpm cap:build    # Build + sync iOS
pnpm cap:sync:android
pnpm mac:generate # Regenerate macos/IdeaTiles.xcodeproj from macos/project.yml

# App Store listing metadata (no binary; copy in ios/fastlane/metadata/)
cd ios && bundle install && bundle exec fastlane upload_listing
```

## Native build environment

| Variable                      | Purpose                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CAPACITOR_API_BASE_URL` | Hosted `/api` root (required for device API calls). If unset, native fallback is `${APP_PUBLIC_WEB_ORIGIN}/api` (currently `https://ideatiles.app/api`).                      |
| `VITE_PUBLIC_WEB_APP_URL`     | Optional. Origin for **Share link** URLs on native; defaults to `https://ideatiles.app` (`APP_PUBLIC_WEB_ORIGIN` in `shared/appBrand.ts`) when unset so links open in Safari. |

### Android release milestone

- Package/application ID: `app.ideatiles.android`
- SDK: compile/target API 36; minimum API 26 (required by the AICore-first ML Kit Prompt API)
- Toolchain: JDK 21, Gradle 8.14.3, and Kotlin Gradle plugin 2.3.0
- Local runtime: LiteRT-LM Android (`com.google.ai.edge.litertlm:litertlm-android:0.14.0`)
- Model: Gemma 3n E2B instruction-tuned int4-compatible `.litertlm` artifact
- Preferred local runtime: ML Kit Prompt API `1.0.0-beta2` through Android AICore

Gemma weights are license-gated and are not bundled or fetched anonymously from
Hugging Face. An operator who has accepted the Gemma terms can host the exact
LiteRT-LM-compatible `.litertlm` artifact over HTTPS and provide both values at
build time:

```bash
export IDEA_TILES_GEMMA_MODEL_URL="https://models.example.com/gemma-3n-e2b-it-int4.litertlm"
export IDEA_TILES_GEMMA_MODEL_SHA256="<64 lowercase hex characters>"
pnpm cap:sync:android
```

Android checks the ML Kit Prompt API and installed Gemini Nano through Android
AICore first. When AICore reports a downloadable model, the user can explicitly
start the AICore download in Settings. The app then tries its separately
configured Gemma model, which writes to app-private, no-backup storage,
verifies SHA-256, and atomically activates the file. LiteRT-LM loads that
verified file using its CPU backend and a private cache directory. If neither
local model can run, the app uses `https://ideatiles.app/api` instead. Settings
states that prompts leave the device only for that cloud fallback.

Release signing reads credentials from the environment; no key or password is
stored in the repository:

```bash
export IDEA_TILES_KEYSTORE_FILE="/absolute/path/to/release.jks"
export IDEA_TILES_KEYSTORE_PASSWORD="..."
export IDEA_TILES_KEY_ALIAS="..."
export IDEA_TILES_KEY_PASSWORD="..."
pnpm android:release
pnpm android:stage
```

`pnpm android:stage` verifies APK/AAB signatures and writes versioned copies plus
`SHA256SUMS` under ignored `artifacts/android/v<name>-<code>/`. For local build
verification without release credentials, set
`IDEA_TILES_ALLOW_DEBUG_RELEASE_SIGNING=true`; those artifacts are explicitly
development-signed and must not be published.

**Canonical domain rollout:** [`docs/infra/IDEATILES_DOMAIN.md`](docs/infra/IDEATILES_DOMAIN.md) (DNS + Caddy). After deploy, run `pnpm verify:canonical` (AASA + `/privacy` / `/terms` on all brand hosts).

## Architecture At A Glance

- `client/`: React 19 SPA, canvas UX, hooks, UI components.
- `server/`: Express app, LLM proxy routes, tRPC routes, collab websocket.
- `shared/`: shared types/constants across client/server.
- `drizzle/`: schema + migrations.
- `ios/` and `android/`: Capacitor native shells and platform plugins.
- `macos/`: native Mac host, strict typed bridge, local artifact persistence, and generation settings.

The server entrypoint is `server/_core/index.ts` and mounts:

1. AASA endpoint for Universal Links
2. OAuth callback routes
3. `/api/generate` provider proxy routes
4. OG/meta routes
5. tRPC routes
6. collaboration websocket handling

In production the server binds a fixed loopback address and port. Unknown
`/api/*` paths return JSON 404 responses rather than the SPA document.

## Generation Dispatch Model

Client generation paths use on-device-first logic with platform-specific behavior:

- iOS: Apple Foundation Models first; if unavailable/unparseable, returns an error (no cloud fallback by design).
- Android: AICore Gemini Nano first when available, then checksum-verified
  Gemma when installed, otherwise cloud `/api/generate`. Settings discloses the
  ordered fallback.
- Web: hosted `/api/generate`.
- Native Mac: Apple Foundation Models first, then explicitly configured local or remote providers.

See `client/src/hooks/useAIGeneration.ts` and `client/src/lib/foundationModelsPlugin.ts`.

## Production Safety

- Client-supplied `X-Ollama-Host`, `X-Ollama-Model`, and
  `X-Ollama-API-Key` values are ignored. The public server may use only its
  operator-configured `OLLAMA_HOST`, `OLLAMA_MODEL`, and `OLLAMA_API_KEY`.
- `/api/generate` enforces request-body, output-token, per-minute, and
  per-hour limits.
- Production refuses to select another port when the configured port is busy.
- Deploy behind a single trusted reverse proxy and keep the Node listener on
  loopback.

## Documentation Map

- [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md): submission workflow, TestFlight copy, **sharing MVP policy**, post-launch.
- [`docs/RELEASE_REVIEW.md`](docs/RELEASE_REVIEW.md): prioritized ship risks (Critical / High / Medium).
- [`docs/APP_STORE_PACK.md`](docs/APP_STORE_PACK.md): App Store metadata + screenshot checklist.
- [`docs/APP_STORE_CONNECT_CANONICAL.md`](docs/APP_STORE_CONNECT_CANONICAL.md): one-page ASC URL/field checklist (canonical `ideatiles.app`).
- [`docs/DEVICE_RELEASE_GATES.md`](docs/DEVICE_RELEASE_GATES.md): real-hardware gates before each TestFlight/App Store push.
- [`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md): short pointer to sharing rules.
- [`docs/infra/IDEATILES_DOMAIN.md`](docs/infra/IDEATILES_DOMAIN.md): Porkbun DNS + Caddy + Node deploy for the canonical domain.
- `PROJECT_PLAN.md`: strategy and workstreams.
- `NEXT_STEPS.md`: deploy/AASA/hardware checklist (active pickup point).
- `MIGRATION_PLAN.md`: UIScene lifecycle adoption (partially landed — see status snapshot at the top of that file).
- `RENAME_PLAN.md`, `todo.md`: historical brand-rename and migration logs.

## `/team` Workflow (Cleaned Up)

Use `/team` for strategic decisions and cross-functional risk review, not for routine implementation details.

- Default: use `/team --full` only when you need product + technical + skeptic synthesis.
- Use `/team:technical` for architecture/reliability decisions.
- Use `/team:research` for fact gathering without verdicts.
- Prefer normal implementation/debug workflows for local code changes; reserve council runs for high-leverage choices.
