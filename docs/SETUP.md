# Build and configure Idea Tiles

## Web development

Use Node 24 or newer and pnpm 10.34.5, pinned in `package.json`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The board runs at `http://localhost:3000/`. Local board storage and exports do
not require an account or database. Without a configured provider, requests
for new generated ideas fail with an availability message.

Autosave is enabled by default. To restore the previous board after reopening
the web app, dismiss the new-idea prompt, open board controls, then choose
**Files and sharing → Sessions → Recover**. Use **Save (JSON)** for a portable
backup.

The current web interface selects OpenAI. Set `OPENAI_API_KEY` on the server
to enable it. Other adapters exist in `server/llmProxy.ts`, but setting a key
for one of those adapters does not switch the current web interface to it.
Provider requests may incur charges. No provider credentials belong in a
`VITE_*` variable: those values can enter the browser bundle.

## Optional services

| Feature | Configuration and boundary |
| --- | --- |
| Account-backed sessions | `DATABASE_URL` for MySQL, the OAuth application/server/portal values, and a private `JWT_SECRET` |
| Snapshot links | In-memory server storage; no database required, but links are lost on restart |
| Live collaboration | The `/ws/collab` WebSocket route; configure the reverse proxy to forward upgrades |
| Image generation | Operator credentials for the image services used by `server/imageProxy.ts`; not supplied by this source release |
| Ollama adapter | Server-side `OLLAMA_HOST`, `OLLAMA_MODEL`, and optional `OLLAMA_API_KEY`; the public relay ignores client-supplied Ollama hosts and credentials |

OAuth uses the protocol implemented in `server/_core/sdk.ts`; it is not a
generic drop-in OAuth configuration. The example leaves account and image
services disabled. Review their adapters before connecting your own services.
After configuring MySQL, `pnpm db:push` generates and applies migrations;
review the changes before using it against an existing database.

## Production web build

```bash
pnpm build
pnpm start
```

`HOST` defaults to `127.0.0.1` and `PORT` to `3000`. Production refuses to pick
another port when the configured port is occupied. Deploy behind one trusted
reverse proxy; generation routes apply per-IP and request-size limits.

Before using your own domain, update `shared/appBrand.ts`, the native
associated-domain settings, and the Apple app association response in
`server/_core/index.ts`. The repository contains Idea Tiles' existing domains
and bundle identities. Native API fallback and shared links otherwise point
to `https://ideatiles.app`. These defaults are not credentials or a grant to
use the hosted service.

The web page requests Inter from Google Fonts and uses system fonts as a
fallback. Offline use may therefore display a different font.

## Native builds

The iOS and Android apps use Capacitor. The Mac app is a separate SwiftUI and
WebKit host. An unsigned build does not establish App Store readiness or
physical-device behavior.

```bash
pnpm cap:build              # Build the client and sync iOS
pnpm cap:sync:android       # Build the client and sync Android
pnpm mac:generate          # Regenerate the Mac Xcode project
pnpm mac:build:native      # Build the native Mac app
```

Apple development requires Xcode and the platform SDKs used by the projects;
Mac project generation also requires XcodeGen. See `macos/project.yml` and the
checked-in workspace for targets and deployment versions.

`VITE_CAPACITOR_API_BASE_URL` sets a native build's hosted API root.
`VITE_PUBLIC_WEB_APP_URL` sets its share-link origin. They are public URLs,
not places for secrets. An iOS build still rejects hosted generation.

### Android models and signing

Android uses JDK 21, Gradle 8.14.3, and compile/target API 36. Its minimum API
is 26. AICore checks Gemini Nano availability first; a model download starts
only after the user requests it in Settings.

The separate Gemma path expects a LiteRT-LM-compatible Gemma 3n E2B int4
`.litertlm` artifact. Weights are not bundled or fetched anonymously from
Hugging Face. An operator who has accepted the model's terms supplies an HTTPS
URL and SHA-256 at build time:

```bash
export IDEA_TILES_GEMMA_MODEL_URL="https://models.example.com/gemma-3n-e2b-it-int4.litertlm"
export IDEA_TILES_GEMMA_MODEL_SHA256="<64 lowercase hex characters>"
pnpm cap:sync:android
```

The app downloads into private no-backup storage, verifies the checksum, and
activates the file atomically. If neither local model can run, Android uses
the hosted generation service. Settings explains this fallback.

Release signing uses `IDEA_TILES_KEYSTORE_FILE`,
`IDEA_TILES_KEYSTORE_PASSWORD`, `IDEA_TILES_KEY_ALIAS`, and
`IDEA_TILES_KEY_PASSWORD` from the environment. `pnpm android:release` builds
APK/AAB files; `pnpm android:stage` verifies signatures and stages versioned
artifacts with checksums. `IDEA_TILES_ALLOW_DEBUG_RELEASE_SIGNING=true` is
available only for development verification; its artifacts must not be
published as release-signed builds.

## Checks

```bash
pnpm check
pnpm test
pnpm build
pnpm release:tools:test
```

Native checks include `pnpm mac:test` and `pnpm android:test`; those require
the corresponding toolchains. Live provider calls, account flows, camera or
model availability, signing, and store distribution need their own evidence.
