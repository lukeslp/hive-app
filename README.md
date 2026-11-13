# Idea Tiles

[![Web](https://img.shields.io/badge/web-ideatiles.app-4ad7d1?style=flat-square)](https://ideatiles.app/)
[![App Store](https://img.shields.io/badge/App_Store-iPhone_and_iPad-blue?style=flat-square)](https://apps.apple.com/us/app/idea-tiles/id6767775306)
[![Mac App Store](https://img.shields.io/badge/App_Store-Mac-blue?style=flat-square)](https://apps.apple.com/us/app/idea-tiles/id6767775306?platform=mac)
[![Android download](https://img.shields.io/badge/Android-direct_download-34A853?style=flat-square)](https://dr.eamer.dev/downloads/apps/idea-tiles/)
[![F-Droid repository](https://img.shields.io/badge/F--Droid-LocalType_releases_repo-1976D2?style=flat-square)](https://dr.eamer.dev/downloads/fdroid/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Turn an idea into a board you can explore. Add neighboring hexagonal tiles,
combine ideas, arrange clusters, and mark the themes worth keeping.

[Try Idea Tiles](https://ideatiles.app).

Boards save locally. Web and native Mac builds also support shared snapshots
and live collaboration. On Mac, the experimental **Rind** workspace places the
same board on an orbitable sphere and remembers its layout and camera position.

## Platforms

| Platform | Idea generation | Sharing and workspaces |
| --- | --- | --- |
| Web | Operator-configured OpenAI service | Tiles, Artifact Studio, snapshot links, collaboration, local exports |
| iPhone and iPad | Apple Foundation Models on supported devices; no hosted fallback | Tiles and local exports; can open received snapshot links |
| Android | AICore Gemini Nano, then the hosted service | Tiles, Artifact Studio, local exports; can open received snapshot links |
| Native Mac | Apple Foundation Models by default; optional configured providers | Tiles, experimental Rind, Artifact Studio, snapshot links, collaboration, local exports |

Model availability depends on the device and its configuration. An unavailable
iOS model produces an error rather than sending the prompt to a hosted service.
Artifact Studio is disabled on iOS. The Mac app stores optional provider keys
in Keychain.

Snapshot links are stored in server memory and disappear when that process
restarts. Export JSON to keep a portable copy of a board. PNG, JPG, and SVG
exports are also available.

## Run the web app

Use Node 24 or newer and the pinned pnpm version in `package.json`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000/`. Without provider credentials, the board opens but
hosted generation is unavailable. Set `OPENAI_API_KEY` in the server's `.env`
to enable the current web client's generation path. Keep that key out of
browser-prefixed variables and Git.

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

The production server listens on loopback by default. See
[setup and configuration](docs/SETUP.md) for native builds, optional services,
and the configuration that must change for your own deployment.

## Source map

- `client/`: React interface, board state, exports, and platform dispatch.
- `server/`: Express and tRPC routes, generation proxy, and collaboration.
- `shared/`: workspace contracts, types, and branding.
- `drizzle/`: database schema and migrations.
- `ios/` and `android/`: Capacitor shells and native model plugins.
- `macos/`: SwiftUI/WebKit host, native generation, and artifact storage.

The product name is Idea Tiles. The repository name `hive-app`, package name
`hexmind-app`, Apple bundle identifier, and `hexpand_*` storage keys retain
older names for compatibility. Rind in this repository is the Mac workspace;
the older standalone BrainSphere/Rind and HiveMind repositories have separate
histories. See [source lineage](docs/SOURCE_LINEAGE.md).

## Development and release notes

[Setup](docs/SETUP.md) describes the source build. [Sharing policy](docs/SHARING_MVP_POLICY.md)
describes the platform boundaries. Historical store plans and reviews under
`docs/` are dated records, not a current listing status or proof that this
checkout has passed physical-device checks.

Native release procedures remain in [the release specification](docs/RELEASE_SPEC.md)
and [device checks](docs/DEVICE_RELEASE_GATES.md). Source publication, a local
build, a signed installer, and a store release are separate results.

## License

Code and documentation are under the [MIT license](LICENSE), copyright Luke
Steuber / Bridge City Lab LLC. Dependencies retain their own licenses; [third-party notices](THIRD_PARTY_NOTICES.md) preserve the hexasphere credit.
The source does not
include access to hosted services, provider accounts, or release-signing keys.
