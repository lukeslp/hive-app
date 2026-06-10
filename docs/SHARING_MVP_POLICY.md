# Sharing — MVP policy (Idea Tiles)

**Single source of detail:** [`RELEASE_SPEC.md`](./RELEASE_SPEC.md) section **1. Sharing MVP policy**.

**Summary**

- **Web:** Snapshot share links (`?s=` via `POST /api/share`) + live collaboration remain available.
- **iOS / Capacitor:** Share-link **creation is off** — the "Share link" entry is hidden (`onShare` passed as `undefined` in `HexmindApp.tsx`, same pattern as collab). Sharing from iOS is local exports: PNG / SVG / JSON through the native share sheet.
- **iOS / Capacitor:** **Opening** received `?s=` links via Universal Links still works; the `?s=` loader in `useSessionManagement.ts` is platform-agnostic.
- **iOS / Capacitor:** Live collaboration entry points are **off** until a full native collab ship is ready.

**Why creation is web-only:** share links route recipients to the web app where cloud generation bills the operator's API keys, and the in-memory share store expires links on every deploy. Exports are the reliable native path.

Do not re-enable native share-link creation or collab without updating `RELEASE_SPEC.md` §1, tests, and ASC copy.
