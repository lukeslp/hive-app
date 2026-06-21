import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createLlmProxyRouter } from "../llmProxy";
import { setupCollabWebSocket } from "../collab";
import { createOGRouter } from "../ogRoute";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads.
  // /api/generate is deliberately excluded: it parses its own body under a
  // tight 64 KB cap inside createLlmProxyRouter, so an unauthenticated LLM
  // request can't make this 50 MB parser buffer a giant payload into memory
  // before the route ever runs. /api/share and everything else still need
  // the large limit (board uploads).
  const largeJsonParser = express.json({ limit: "50mb" });
  app.use((req, res, next) => {
    if (req.path === "/api/generate") return next();
    return largeJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Trust proxy for rate limiting behind reverse proxies
  app.set("trust proxy", 1);

  // Apple App-Site Association for Universal Links into the iOS app.
  // Apple wants the bare filename (no .json extension) served as
  // application/json. The same content resolves at every brand domain
  // because Caddy reverse-proxies all seven (hivemind.cx, hive-mind.pro,
  // hexmind.app/io, hexpand.app, hexpander.app, ideatiles.app) into this
  // Node process.
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    res.type("application/json").json({
      applinks: {
        details: [
          {
            appIDs: ["596T7J7FB6.app.hexmind.ios"],
            components: [
              { "/": "/", comment: "main entry — opens app" },
              { "/": "/?*", comment: "preserve query strings" },
              {
                "/": "/privacy*",
                exclude: true,
                comment: "legal stays in browser",
              },
              { "/": "/terms*", exclude: true },
            ],
          },
        ],
      },
      webcredentials: {
        apps: ["596T7J7FB6.app.hexmind.ios"],
      },
    });
  });

  // Legal pages — must resolve to real HTML, not the SPA catchall. App
  // Store Connect's Privacy Policy URL field is reviewed by humans who
  // click it and expect a real document. Without these routes,
  // /privacy and /terms get caught by the SPA fallback below and
  // serve the React app (title "Idea Tiles"), which fails review.
  app.get(["/privacy", "/privacy.html"], (_req, res) => {
    res.sendFile("privacy.html", {
      root:
        process.env.NODE_ENV === "production" ? "dist/public" : "client/public",
    });
  });
  app.get(["/terms", "/terms.html"], (_req, res) => {
    res.sendFile("terms.html", {
      root:
        process.env.NODE_ENV === "production" ? "dist/public" : "client/public",
    });
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Hexpand LLM proxy routes
  app.use("/api", createLlmProxyRouter());
  // OG meta tags for social crawlers
  app.use("/api", createOGRouter());
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Set up WebSocket for collaborative editing BEFORE Vite
  // This is critical: Vite's HMR also uses WebSocket on the same server,
  // so we need to intercept the upgrade for /ws/collab before Vite gets it.
  const collabWss = setupCollabWebSocket(server);

  // Manually handle the HTTP upgrade event to route /ws/collab to our WSS
  // and let everything else (Vite HMR) go through the default path.
  server.removeAllListeners("upgrade");
  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    if (url.startsWith("/ws/collab")) {
      collabWss.handleUpgrade(request, socket, head, ws => {
        collabWss.emit("connection", ws, request);
      });
    } else {
      // Let Vite HMR handle its own WebSocket upgrades
      // Vite attaches its own upgrade listener, so we need to re-emit
      // We store Vite's upgrade handler and call it for non-collab paths
      if ((server as any).__viteUpgradeHandler) {
        (server as any).__viteUpgradeHandler(request, socket, head);
      } else {
        // If no Vite handler yet (production mode), destroy the socket
        // for unknown WS paths
        socket.destroy();
      }
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Store the current upgrade listeners before Vite adds its own
    await setupVite(app, server);

    // After Vite setup, capture its upgrade handler so we can delegate to it
    // Vite adds an upgrade listener to the server; we need to capture and remove it
    // so our manual handler above can delegate properly
    const listeners = server.listeners("upgrade");
    if (listeners.length > 0) {
      // The last listener added is Vite's
      const viteHandler = listeners[listeners.length - 1] as Function;
      (server as any).__viteUpgradeHandler = viteHandler;
      // Remove all upgrade listeners and re-add our manual one
      server.removeAllListeners("upgrade");
      server.on("upgrade", (request, socket, head) => {
        const url = request.url || "";
        if (url.startsWith("/ws/collab")) {
          collabWss.handleUpgrade(request, socket, head, ws => {
            collabWss.emit("connection", ws, request);
          });
        } else {
          // Delegate to Vite's HMR WebSocket handler
          viteHandler(request, socket, head);
        }
      });
    }
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
