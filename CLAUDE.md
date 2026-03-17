# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Hexpand

Hexpand is a spatial brainstorming tool built on a hexagonal grid. Users place an idea at the center, then expand it outward — each hex tile can be AI-expanded into 6 contextual neighbors. The app supports multi-provider LLM generation, real-time collaboration via WebSocket, session persistence to MySQL, and S3-backed thumbnails.

Design language: "Cyber-Hive Dark Mode" — deep dark backgrounds, glassmorphic panels, hex geometry as visual foundation, electric accent colors per node type.

## Commands

```bash
pnpm dev              # Start dev server (Express + Vite HMR, auto-finds port from 3000)
pnpm build            # Build client (Vite) + server (esbuild) to dist/
pnpm start            # Run production build from dist/
pnpm check            # TypeScript type-check (noEmit)
pnpm test             # Run all tests (vitest)
pnpm format           # Prettier format entire project
pnpm db:push          # Generate + apply Drizzle migrations (requires DATABASE_URL)
```

Run a single test file:
```bash
npx vitest run server/llmProxy.test.ts
npx vitest run client/src/hooks/useCanvasInteraction.test.ts
```

## Architecture

Monorepo with three top-level source directories sharing a single `package.json`:

```
client/          React 19 + Vite frontend (SPA)
server/          Express backend (tRPC + WebSocket + LLM proxy)
shared/          Constants and types shared between client and server
```

### Path Aliases

| Alias | Resolves To | Used In |
|-------|-------------|---------|
| `@/*` | `client/src/*` | Client code |
| `@shared/*` | `shared/*` | Both client and server |
| `@assets/*` | `attached_assets/*` | Client code |

Configured in `tsconfig.json` (paths), `vite.config.ts` (resolve.alias), and `vitest.config.ts`.

### Server Entry Point

`server/_core/index.ts` — Express app that:
1. Registers OAuth routes
2. Mounts LLM proxy at `/api` (generate, providers, share)
3. Mounts OG image route at `/api`
4. Mounts tRPC at `/api/trpc`
5. Sets up WebSocket collab server with manual upgrade routing (critical: must intercept `/ws/collab` before Vite HMR gets it)
6. In dev: Vite middleware; in prod: static file serving from `dist/public`

### The `_core/` Convention

Files under `_core/` directories are Manus platform scaffold code (auth, OAuth, SDK, env, LLM invocation). They provide:
- `server/_core/`: OAuth, JWT auth, tRPC setup, built-in LLM (`invokeLLM`), storage proxy, env config
- `client/src/_core/hooks/useAuth.ts`: Authentication hook via tRPC
- `shared/_core/errors.ts`: Shared error types

**Do not modify `_core/` files** unless specifically required — they are platform infrastructure.

### tRPC API

Router defined in `server/routers.ts`:
- `auth.me` / `auth.logout` — public procedures
- `sessions.*` (list, get, create, update, delete) — protected procedures (require auth)
- `system.*` — scaffold system router

Client creates the typed client in `client/src/lib/trpc.ts` using `createTRPCReact<AppRouter>()`.

### LLM Proxy (`server/llmProxy.ts`)

Express routes (not tRPC) at `/api/generate`, `/api/providers`, `/api/share`. Supports 7 providers: Manus (built-in default), Gemini, Anthropic, OpenAI, Grok, Mistral, Ollama. Provider selection via `X-Provider` header; API keys via `X-Api-Key` header or env vars. Auto-fallback to Manus on provider failure.

The response format wraps all providers into Gemini's `{ candidates: [{ content: { parts: [{ text }] } }] }` shape — the client always parses this format regardless of which provider was used.

### Collaboration (`server/collab.ts`)

WebSocket server at `/ws/collab` using `noServer` mode (mandatory — Vite HMR shares the same HTTP server). Room-based: host's state is authoritative, late joiners receive a full state-sync. Message types: join, state-sync, node-update, node-delete, nodes-batch, cursor, node-presence, ping/pong.

### Database

MySQL via Drizzle ORM. Schema in `drizzle/schema.ts`:
- `users` — Manus OAuth users (openId, name, email, role)
- `sessions` — Brainstorm sessions (userId, name, data JSON blob, nodeCount, thumbnailUrl)

DB connection is lazy (`server/db.ts`) — app runs without DATABASE_URL (features degrade gracefully).

### Storage

S3-compatible storage via Manus Forge proxy (`server/storage.ts`). Used for session thumbnail uploads. Requires `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` env vars.

## Client Architecture

### Key Types

- `HexNode` (`client/src/types/hivemind.d.ts`) — Core node: axial coords (q,r), text, type, depth, cluster info, bridge flags
- Node types: root, concept, action, technical, question, risk, default — each with distinct colors
- Node keys are `"q,r"` strings (e.g., `"0,0"`, `"1,-1"`)
- `ViewState` — Canvas pan (x,y) and zoom level

### Main Page (`client/src/pages/HexpandApp.tsx`)

Large orchestrator component (~1600 lines) that wires together all hooks and UI components. All business logic is in hooks; HexpandApp coordinates state flow.

### Hook System

| Hook | Purpose |
|------|---------|
| `useAIGeneration` | LLM calls, generation tracking, creativity/bridging sliders, rate limiting |
| `useCanvasInteraction` | Pan, zoom, click/tap handling, touch discrimination (12px/350ms thresholds) |
| `useCollaboration` | WebSocket room management, remote cursors, node sync |
| `useMergeSuggestions` | Detect nearby clusters, find thematic overlap, suggest connections |
| `useHistory` | Undo/redo stack for node state |
| `useSessionManagement` | Local + cloud save/load/export/import |
| `useTemplates` | Pre-built brainstorm templates |
| `useProviderSettings` | LLM provider selection, API key management (localStorage) |
| `useTouchDrag` | Long-press drag to combine tiles on mobile |
| `useSearch` | Node text search |
| `useOGImage` | Dynamic OG meta tags for social sharing |
| `useAnnouncer` | Screen reader live announcements |

### Hex Grid Math

Pointy-top hexagonal grid using axial coordinates. Constants in `client/src/lib/hexConstants.ts`:
- `HEX_SIZE = 80`, width = `sqrt(3) * 80`, height = `160`
- 6 neighbor directions defined as `DIRECTIONS`
- Pixel-to-hex and hex-to-pixel conversions in `client/src/lib/hexGrid.ts`
- Cluster colors cycle through 6 palettes in `CLUSTER_COLORS`

### UI Components

shadcn/ui (New York style) with Radix UI primitives. Component config in `components.json`. Tailwind CSS 4 for styling. Routing via `wouter` (patched — see `patches/wouter@3.7.1.patch`).

## Environment Variables

Server-side (via `.env`):
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET` — Cookie signing
- `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `VITE_APP_ID` — Manus OAuth
- `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` — Storage + built-in LLM
- Optional provider keys: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`
- `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_API_KEY` — Local Ollama

Client-side (via Vite env):
- `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`

## Testing

Vitest with node environment. Tests live alongside source files:
- `server/*.test.ts` — LLM proxy (7 tests), collab WebSocket, sessions, auth logout
- `client/src/hooks/*.test.ts` — Canvas interaction (13 tests), AI generation, merge suggestions
- `client/src/lib/haptics.test.ts` — Haptic feedback

No browser/DOM test environment — client tests use direct function testing or mock React hooks.

## Notable Patterns

- **Weighted board context**: Starred/pinned nodes and user-interacted nodes are weighted higher in AI generation prompts, so new tiles are influenced by the broader board state
- **Cross-cluster bridging**: AI can generate "bridge" tiles that connect thematically related but spatially distant clusters, controlled by a bridging intensity slider
- **Touch discrimination**: Mobile taps must be < 12px movement and < 350ms duration to count as intentional (vs. pan/zoom gestures)
- **In-memory share store**: `/api/share` uses a `Map<string, string>` — ephemeral, does not survive server restarts
