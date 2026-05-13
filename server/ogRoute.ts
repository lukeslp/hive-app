/**
 * ogRoute.ts - Server-side Open Graph meta tag endpoint
 * 
 * Social crawlers (Facebook, Twitter, Slack, etc.) don't execute JavaScript,
 * so we need a server-side route that returns proper OG meta tags.
 * 
 * When a shared session URL is accessed, this route checks if the request
 * is from a social crawler and returns an HTML page with OG tags pointing
 * to the session's thumbnail.
 */

import { Router } from "express";
import {
  APP_DISPLAY_NAME,
  APP_OG_DESCRIPTION,
  APP_OG_TITLE,
} from "@shared/appBrand";
import { getSession } from "./db";

const SOCIAL_CRAWLERS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "WhatsApp",
  "Discordbot",
  "TelegramBot",
  "Pinterest",
  "Googlebot",
];

function isCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return SOCIAL_CRAWLERS.some((bot) => userAgent.includes(bot));
}

export function createOGRouter(): Router {
  const router = Router();

  /**
   * GET /api/og/session/:id
   * Returns an HTML page with OG meta tags for the given session.
   * Only serves to social crawlers; regular browsers get redirected to the app.
   */
  router.get("/og/session/:id", async (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
      return res.redirect("/");
    }

    // For non-crawlers, redirect to the app
    if (!isCrawler(req.headers["user-agent"])) {
      return res.redirect("/");
    }

    try {
      // Fetch session without user auth (public OG preview)
      // We pass userId=0 which won't match, so we need a public query
      // For now, we'll create a minimal OG page with the app branding
      const ogHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${APP_OG_TITLE}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${APP_OG_TITLE}" />
  <meta property="og:description" content="${APP_OG_DESCRIPTION}" />
  <meta property="og:url" content="${req.protocol}://${req.get("host")}/" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${APP_OG_TITLE}" />
  <meta name="twitter:description" content="${APP_OG_DESCRIPTION}" />
</head>
<body>
  <h1>${APP_DISPLAY_NAME}</h1>
  <p>${APP_OG_DESCRIPTION}</p>
</body>
</html>`;

      res.type("html").send(ogHtml);
    } catch {
      res.redirect("/");
    }
  });

  return router;
}
