# Idea Tiles

**Idea Tiles** (_Brainstorm with local AI_) is a hexagonal tile brainstorming app built as a React SPA with an Express backend, plus Capacitor shells for iOS and Android. **Canonical marketing origin:** `https://ideatiles.app`. Bundle id and some legacy domains may still reference **hexmind**; user-facing copy uses Idea Tiles.

## What This Project Does

- Expands ideas into neighboring hex tiles with AI-assisted brainstorming.
- Supports merge/combine workflows, clustering, key-theme marking, and visual linking.
- Saves sessions locally and can sync/share collaborative sessions through the server (web; cloud session list is disabled in the native shell today — see `docs/RELEASE_SPEC.md`).
- Runs as:
  - Web app (`pnpm dev` / `pnpm start`)
  - iOS app (Capacitor + Apple Foundation Models path)
  - Android app (Capacitor + Gemma/on-device path when available)

## Current Product State (May 2026)

- **App Store:** Live; canonical ASC / marketing URLs use **ideatiles.app**.
- Brand display name is **Idea Tiles** while legacy storage keys intentionally remain `hexpand_*` for data continuity.
- **Sharing MVP:** iOS uses **snapshot** share links only (public `https` origin, not `capacitor://`). **Live collaboration** is **web-only** for this proof-of-concept — see [`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md).
- Share modal includes a dedicated **Bring to iOS** action that prefers the canonical universal-link origin (`APP_PUBLIC_WEB_ORIGIN`) so boards can be handed off to the iOS app flow more reliably.
- Settings modal now uses a compact, screen-space-first control row: theme toggle, accessibility font cycling (Atkinson/Lexend/OpenDyslexic/Aptos/System), font size +/- controls, animation toggle, high-contrast toggle, prominent Auto-Save, and a destructive "Delete Current Board" action.
- Hex tile title rendering now favors readability: removed forced uppercase in-node labels and switched to balanced wrapping with normal word breaking to reduce awkward mid-word splits on mobile.
- Hosted/web provider behavior is locked to Anthropic in-app (no provider picker exposed), matching ideatiles.app's managed default path.
- Settings visual treatment now uses a softer glass/card style and removes dense provider-management controls for a cleaner, on-brand surface.
- iOS behavior is intentionally privacy-first: tile generation on iOS is on-device only (no cloud fallback).
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
```

## Native build env (iOS)

| Variable                      | Purpose                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CAPACITOR_API_BASE_URL` | Hosted `/api` root (required for device API calls). If unset, native fallback is `${APP_PUBLIC_WEB_ORIGIN}/api` (currently `https://ideatiles.app/api`).                      |
| `VITE_PUBLIC_WEB_APP_URL`     | Optional. Origin for **Share link** URLs on native; defaults to `https://ideatiles.app` (`APP_PUBLIC_WEB_ORIGIN` in `shared/appBrand.ts`) when unset so links open in Safari. |

**Canonical domain rollout:** [`docs/infra/IDEATILES_DOMAIN.md`](docs/infra/IDEATILES_DOMAIN.md) (DNS + Caddy). After deploy, run `pnpm verify:canonical` (AASA + `/privacy` / `/terms` on all brand hosts).

## Architecture At A Glance

- `client/`: React 19 SPA, canvas UX, hooks, UI components.
- `server/`: Express app, LLM proxy routes, tRPC routes, collab websocket.
- `shared/`: shared types/constants across client/server.
- `drizzle/`: schema + migrations.
- `ios/` and `android/`: Capacitor native shells and platform plugins.

The server entrypoint is `server/_core/index.ts` and mounts:

1. AASA endpoint for Universal Links
2. OAuth callback routes
3. `/api/generate` provider proxy routes
4. OG/meta routes
5. tRPC routes
6. collaboration websocket handling

## AI Dispatch Model

Client generation paths use on-device-first logic with platform-specific behavior:

- iOS: Apple Foundation Models first; if unavailable/unparseable, returns an error (no cloud fallback by design).
- Web/Android: on-device attempt when available, otherwise cloud `/api/generate` fallback.

See `client/src/hooks/useAIGeneration.ts` and `client/src/lib/foundationModelsPlugin.ts`.

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
