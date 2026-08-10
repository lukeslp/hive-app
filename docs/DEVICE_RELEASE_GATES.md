# Device release gates — Idea Tiles (iOS)

Run on **real hardware** after production DNS/Caddy/deploy pass [`scripts/check-aasa.sh`](../scripts/check-aasa.sh) and [`scripts/verify-canonical-endpoints.sh`](../scripts/verify-canonical-endpoints.sh).

## Pre-archive (local)

- [ ] `pnpm check` && `pnpm test` && `pnpm cap:sync:ios`
- [ ] Xcode: destination **Any iOS Device (arm64)** — not simulator for Archive
- [ ] Confirm `pnpm versions:check` reports Apple 1.3.2 build 8
- [ ] Confirm **Associated Domains** in signed settings include `applinks:ideatiles.app` (see [`ios/App/App/App.entitlements`](../ios/App/App/App.entitlements))
- [ ] **Product → Archive** → Validate → Distribute to App Store Connect

## Universal Links

- [ ] From **Messages** or **Notes**, tap `https://ideatiles.app/` (path your app handles) — opens **Idea Tiles** (not Safari), or expected handoff for excluded paths
- [ ] Tap `https://ideatiles.app/privacy` — opens in **Safari** with Idea Tiles policy HTML (AASA excludes `/privacy*`)
- [ ] Repeat on at least one **legacy** domain (`hexmind.app`, …) still in entitlements

## On-device generation

- [ ] **Eligible** device (15 Pro / 16+ / M iPad, iOS 26+, Apple Intelligence on): tap tile → expansion succeeds **10×** without hang
- [ ] **Ineligible** device: tap tile → **clear** “not available” message, no crash, no silent cloud send
- [ ] Artifact Studio is absent and no iOS request reaches `/api/generate`

## Share + export

- [ ] Confirm there is no native **Share link** creation action
- [ ] Open a web-created `https://ideatiles.app/?s=…` link and confirm the board loads
- [ ] Export **PNG** / **JPG** / **SVG** / **JSON** → share sheet / Files.app path **On My iPhone → Idea Tiles**

## Appearance

- [ ] **Light** system appearance: icon + splash look correct on cold launch
- [ ] **Dark** system appearance: same (splash `backgroundColor` in Capacitor may flash light briefly — note if polish needed)

## Sign-off

- [ ] No Sev1 crashes in first 30 minutes of dogfood after install from TestFlight/App Store build
