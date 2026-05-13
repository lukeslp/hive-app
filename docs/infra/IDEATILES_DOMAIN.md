# Canonical domain: `ideatiles.app` (Porkbun + Caddy)

This app’s Node process already serves `/.well-known/apple-app-site-association`, `/privacy`, and `/terms` correctly when traffic reaches it (see [`server/_core/index.ts`](../../server/_core/index.ts)). **What you must do outside the repo** is point **ideatiles.app** at the same reverse proxy and upstream as the legacy brand domains (`hexmind.app`, `hivemind.cx`, …).

## 1. Porkbun DNS

1. Log into Porkbun → **DNS** for `ideatiles.app`.
2. Match the **same routing pattern** you use for `hexmind.app`:
   - If legacy domains use an **A record** to the VPS IP → add the same **A** for `@` and `www` (or only `@ if www unused).
   - If they use **CNAME** to a CDN/hostname → add the same **CNAME** for `@` (and `www` if needed).
3. Remove or disable **parking** / **URL redirect** records that override the apex.
4. Wait for propagation (often minutes; TTL-dependent).

## 2. TLS

- Caddy will obtain Let’s Encrypt certs automatically once DNS resolves to this server and port **443** is reachable.
- If you terminate TLS elsewhere (Cloudflare “Full”), ensure the origin still receives correct `Host` and that `/.well-known` is not blocked.

## 3. Caddy (same site block as other brand domains)

Add a **server block** for `ideatiles.app` (and `www.ideatiles.app` if you use it) that is **byte-for-byte equivalent** to your existing `hexmind.app` block: same `reverse_proxy` upstream, same headers, **no** special rule that rewrites `/.well-known/*` to the SPA.

Example shape (adjust upstream/socket to match your real config):

```caddy
ideatiles.app, www.ideatiles.app {
    reverse_proxy 127.0.0.1:PORT
}
```

Reload Caddy (`caddy reload` or your process manager).

## 4. Post-change verification (from any machine)

```bash
cd /path/to/hexmind
./scripts/check-aasa.sh
./scripts/verify-canonical-endpoints.sh
```

Expect **7/7** AASA passes and privacy/terms checks green on `ideatiles.app` and legacy domains.

## 5. Deploy the Node app

If the server is still on an older build (SPA at AASA, wrong `/privacy`), redeploy from the repo root that matches `main`:

```bash
# Example — adjust paths/service name per CLAUDE.md / your host
git pull && pnpm install && pnpm build && cp -r dist/* ~/servers/hexpand/dist/ && sm restart hexpand
```

## 6. iOS Associated Domains

After Caddy + DNS are live, ship a **new** iOS build: [`ios/App/App/App.entitlements`](../../ios/App/App/App.entitlements) already includes `applinks:ideatiles.app`. Apple only trusts Universal Links for hosts that resolve AASA successfully at install/update time.
