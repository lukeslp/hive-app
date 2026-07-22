# App Store Connect — canonical `ideatiles.app` checklist

Paste URLs exactly as below after production passes [`scripts/verify-canonical-endpoints.sh`](../scripts/verify-canonical-endpoints.sh).

| Field                        | Value                           |
| ---------------------------- | ------------------------------- |
| **Privacy Policy URL**       | `https://ideatiles.app/privacy` |
| **Support URL**              | `https://ideatiles.app/`        |
| **Marketing URL** (optional) | `https://ideatiles.app/`        |

## App Information (copy from pack)

- **Name:** Idea Tiles (fallback: `Idea Tiles: Brainstorm` if rejected)
- **Subtitle:** Brainstorm with local AI
- **Primary category:** Productivity
- **Secondary:** Graphics & Design

Full promo text, description, keywords, What’s New, and screenshot captions: [`docs/APP_STORE_PACK.md`](./APP_STORE_PACK.md).

## Review notes

Use **§11 Review notes** verbatim from [`docs/APP_STORE_PACK.md`](./APP_STORE_PACK.md). Before submit, replace any stale “hexmind-only” phrasing if you edited locally — the pack’s snapshot section should mention **`ideatiles.app`** for hosted snapshot URLs.

## Privacy nutrition label

Match [`docs/APP_STORE_PACK.md`](./APP_STORE_PACK.md) §10 and actual binary behavior (iOS: no analytics SDK in Capacitor build).

For the separate Mac listing, follow **Mac App Privacy answers** in
[`docs/MAC_DISTRIBUTION.md`](./MAC_DISTRIBUTION.md): Name, Email Address, User
ID, and Other User Content are linked to the user, used for App Functionality,
and not used for tracking when optional sign-in/cloud sync is used.
