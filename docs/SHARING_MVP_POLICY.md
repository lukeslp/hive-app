# Sharing — MVP policy (Thought Tiles)

**Single source of detail:** [`RELEASE_SPEC.md`](./RELEASE_SPEC.md) section **1. Sharing MVP policy**.

**Summary**

- **iOS / Capacitor:** Snapshot share links (`?s=`) are in scope; links MUST use a public `https` web origin (see `getPublicWebAppOrigin()` in `client/src/lib/platform.ts` and optional `VITE_PUBLIC_WEB_APP_URL`).
- **iOS / Capacitor:** Live collaboration entry points are **off** until a full native collab ship is ready.
- **Web:** Snapshot share + live collaboration remain available.

Do not re-enable native collab without updating WebSocket routing, tests, and ASC copy.
