# Canonical Idea Tiles production route

`https://ideatiles.app` is the web, marketing, legal, and Universal Link origin.

## Current ownership

| Item | Canonical value |
|---|---|
| Service | `ideatiles` |
| Loopback port | `5065` |
| Server directory | `~/apps/ideatiles` on the production host (built `dist/`, not a Git checkout) |
| Public origin | `https://ideatiles.app` |
| Apple application identifier | `596T7J7FB6.app.hexmind.ios` |

The legacy `hexmind` service on port 5057 runs the separate HiveMind community
canvas from `~/projects/hivemind`. Never deploy the Idea Tiles bundle there.

## Deployment sequence

Deployment changes external state and must be explicitly authorized.

1. Build and test the exact commit intended for production.
2. Confirm the target with `systemctl show ideatiles` and `ss -ltnp`; the old
   `sm` registry is historical and not live state. Do not infer the target from
   a legacy domain or historical document.
3. Deploy to `~/apps/ideatiles` and restart only the `ideatiles` service.
4. Run `pnpm verify:canonical`.
5. Smoke `https://ideatiles.app`, `/privacy`, `/terms`,
   `/.well-known/apple-app-site-association`, snapshot sharing, and
   collaboration.

If Caddy routing needs a change, edit the declared source
`~/admin/Caddyfile` on the production host after backing it up, and apply it
with `~/admin/update_caddy.sh`, which validates before reloading. Keep
`/etc/caddy/Caddyfile` byte-identical with the declared source.

## Expected edge behavior

- AASA returns JSON and contains `596T7J7FB6.app.hexmind.ios`.
- `/privacy` and `/terms` return standalone HTML, not the SPA fallback.
- Unknown `/api/*` paths return JSON 404 responses.
- The Node service remains bound to loopback behind the trusted reverse proxy.

Installed apps may still rely on legacy associated domains. Retire those only
after confirming the release and migration impact; DNS cleanup is not part of a
normal web deploy.
