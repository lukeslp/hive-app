declare global {
  interface Window {
    __checkpoint?: (msg: string) => void;
    __lastCheckpoint?: string;
  }
}
const cp = (msg: string) => window.__checkpoint?.(msg);
cp("main.tsx: start");

import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { getTrpcUrl, isCapacitor } from "@/lib/platform";
import { BootErrorBoundary } from "@/lib/BootErrorBoundary";
import "./index.css";

// Analytics (web only): inject at runtime so missing env never loads a bogus URL as script (404 HTML → SyntaxError).
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (
  !isCapacitor() &&
  typeof analyticsEndpoint === "string" &&
  analyticsEndpoint.length > 0 &&
  typeof analyticsWebsiteId === "string" &&
  analyticsWebsiteId.length > 0
) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = `${analyticsEndpoint.replace(/\/+$/, "")}/umami`;
  s.dataset.websiteId = analyticsWebsiteId;
  document.head.appendChild(s);
}

// ── Universal Links + custom URL scheme handler (Capacitor only) ────
// When iOS hands the app a URL from outside (deep link from Safari,
// Mail, Messages, etc.), strip scheme/host and route the wouter app
// to the path+query.
if (isCapacitor()) {
  void import("@capacitor/app")
    .then(({ App: CapacitorApp }) => {
      // Re-probe Foundation Models availability on every foreground:
      // Apple Intelligence can be toggled in Settings while we're
      // backgrounded, and a transient modelNotReady at launch resolves
      // itself once model assets finish hydrating.
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          void import("@/lib/foundationModelsPlugin").then(
            ({ invalidateFoundationModelsCache }) =>
              invalidateFoundationModelsCache()
          );
        }
      });
      CapacitorApp.addListener("appUrlOpen", event => {
        try {
          const url = new URL(event.url);
          const target = (url.pathname || "/") + url.search + url.hash;
          const current =
            window.location.pathname +
            window.location.search +
            window.location.hash;
          if (current === target) return;
          window.history.pushState(null, "", target);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch (e) {
          console.warn("appUrlOpen: failed to parse URL", event.url, e);
        }
      });
    })
    .catch(e => {
      console.warn("Could not load @capacitor/app for URL handling", e);
    });
}

cp("main.tsx: bootstrap");

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  const target = getLoginUrl();
  if (!target) return; // No OAuth portal configured (Capacitor build) — don't reload onto "".
  window.location.href = target;
};

// Capacitor bridge JSON-stringifies errors poorly — normalize before console.error.
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const anyErr = error as Error & {
      data?: unknown;
      cause?: unknown;
      stack?: string;
    };
    if (anyErr.stack)
      out.stack = String(anyErr.stack).split("\n").slice(0, 5).join("\n");
    if (anyErr.data !== undefined) out.data = anyErr.data;
    if (anyErr.cause !== undefined) out.cause = String(anyErr.cause);
    return out;
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      /* fall through */
    }
  }
  return { value: String(error) };
}

// Global errors not surfaced through React Query (e.g. commit-phase throws on native).
if (typeof window !== "undefined") {
  window.addEventListener("error", event => {
    console.error(
      "[Window Error]",
      JSON.stringify({
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        ...describeError(event.error),
      })
    );
  });
  window.addEventListener("unhandledrejection", event => {
    console.error(
      "[Unhandled Promise]",
      JSON.stringify(describeError(event.reason))
    );
  });
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error(
      "[API Query Error]",
      JSON.stringify({
        queryKey: event.query.queryKey,
        ...describeError(error),
      })
    );
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error(
      "[API Mutation Error]",
      JSON.stringify({
        mutationKey: event.mutation.options.mutationKey,
        ...describeError(error),
      })
    );
  }
});

const trpcUrl = getTrpcUrl();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: trpcUrl,
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});
cp("main.tsx: trpc");

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.appendChild(
    Object.assign(document.createElement("div"), {
      textContent: "FATAL: #root element not found",
      style: "color:red;font:18px monospace;padding:20px",
    })
  );
  throw new Error("#root element not found");
}

createRoot(rootEl).render(
  <BootErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </BootErrorBoundary>
);
cp("main.tsx: mounted");

// Hide the native splash once React has rendered its first frame. The
// double-rAF waits for the React commit + browser paint to land so the
// user never sees a blank frame between splash and app. No-op on web.
//
// capacitor.config.ts pins `launchAutoHide: false`, so if the primary
// path silently fails (dynamic-import rejection, OOM during JS init,
// stale WebView profile) the splash never goes away and the tester
// sees a forever loading screen. A 4 s setTimeout fallback re-attempts
// the hide so the worst case is a four-second delay, not a permanent
// freeze. `splashHidden` deduplicates so the user never sees a fade
// happen twice.
if (isCapacitor()) {
  let splashHidden = false;
  const hideSplash = (origin: "primary" | "fallback") =>
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => {
        if (splashHidden) return;
        splashHidden = true;
        void SplashScreen.hide({ fadeOutDuration: 200 });
        cp(`main.tsx: splash hidden (${origin})`);
      })
      .catch(e => {
        console.warn(`Could not hide splash (${origin})`, e);
      });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void hideSplash("primary");
    });
  });

  setTimeout(() => {
    void hideSplash("fallback");
  }, 4000);
}

// Web only: satisfies Chrome/Android pairing of manifest icons + HTTPS origin install UX.
// The worker does not cache assets for offline use — fetch always proxies to network.
function registerMinimalServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  if (isCapacitor()) return;
  window.addEventListener("load", () => {
    const baseRaw = import.meta.env.BASE_URL;
    const baseNorm =
      baseRaw === "./" ? "./" : baseRaw.endsWith("/") ? baseRaw : `${baseRaw}/`;
    const swUrl = `${baseNorm}sw.js`;
    void navigator.serviceWorker.register(swUrl).then(
      () => {
        cp("main.tsx: service worker registered");
      },
      err => {
        console.warn("Service worker registration failed", err);
      }
    );
  });
}
registerMinimalServiceWorker();
