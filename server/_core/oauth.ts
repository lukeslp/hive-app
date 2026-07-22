import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { APP_PUBLIC_WEB_ORIGIN } from "../../shared/appBrand";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/native-start", (_req: Request, res: Response) => {
    try {
      res.redirect(
        302,
        buildNativeOAuthStartURL(ENV.oAuthPortalUrl, ENV.appId)
      );
    } catch {
      res.status(503).json({ error: "Native sign-in is not configured" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

export function buildNativeOAuthStartURL(
  portalOrigin: string,
  appId: string
): string {
  if (!portalOrigin || !appId) throw new Error("OAuth is not configured");
  const portal = new URL(portalOrigin);
  if (
    portal.protocol !== "https:" ||
    portal.username ||
    portal.password ||
    portal.port ||
    portal.pathname !== "/" ||
    portal.search ||
    portal.hash
  ) {
    throw new Error("OAuth portal must be a clean HTTPS origin");
  }
  const redirectUri = `${APP_PUBLIC_WEB_ORIGIN}/api/oauth/callback`;
  const url = new URL("app-auth", `${portal.toString().replace(/\/+$/, "")}/`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", Buffer.from(redirectUri).toString("base64"));
  url.searchParams.set("type", "signIn");
  return url.toString();
}
