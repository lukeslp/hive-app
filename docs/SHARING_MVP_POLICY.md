# Sharing — MVP policy (Idea Tiles)

**Single source of detail:** [`RELEASE_SPEC.md`](./RELEASE_SPEC.md) section **1. Sharing MVP policy**.

**Summary**

- **Web and native Mac:** Snapshot share links (`?s=` via `POST /api/share`) and live collaboration remain available.
- **iOS and Android:** Share-link **creation is off**. Sharing uses PNG / JPG / SVG / JSON exports through each platform's native share flow.
- **iOS and Android:** **Opening** received `?s=` links still works; the loader in `useSessionManagement.ts` is platform-agnostic.
- **iOS and Android:** Live collaboration entry points remain off until the native transport and UX are deliberately shipped.

**Why creation is web-only:** share links route recipients to the web app where cloud generation bills the operator's API keys, and the in-memory share store expires links on every deploy. Exports are the reliable native path.

Do not re-enable native share-link creation or collab without updating `RELEASE_SPEC.md` §1, tests, and ASC copy.
