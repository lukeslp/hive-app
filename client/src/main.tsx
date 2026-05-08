import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { getTrpcUrl, isCapacitor } from "@/lib/platform";
import { BootErrorBoundary } from "@/lib/BootErrorBoundary";
import "./index.css";

// ── Analytics: web only, only when env vars are set ─────────────────
// Previously this was a static <script> tag with %VITE_ANALYTICS_*%
// placeholders. When the env vars weren't defined the literal
// "%VITE_ANALYTICS_ENDPOINT%/umami" URL got fetched, the 404 HTML
// response was parsed as JS, and startup crashed with
// "SyntaxError: Unexpected token '<'". Capacitor builds also tried
// to load it and broke. Inject at runtime instead, conditionally.
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (
    !isCapacitor() &&
    typeof analyticsEndpoint === "string" && analyticsEndpoint.length > 0 &&
    typeof analyticsWebsiteId === "string" && analyticsWebsiteId.length > 0
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
    void import("@capacitor/app").then(({ App: CapacitorApp }) => {
        CapacitorApp.addListener("appUrlOpen", (event) => {
            try {
                const url = new URL(event.url);
                const target = (url.pathname || "/") + url.search + url.hash;
                const current = window.location.pathname + window.location.search + window.location.hash;
                if (current === target) return;
                window.history.pushState(null, "", target);
                window.dispatchEvent(new PopStateEvent("popstate"));
            } catch (e) {
                console.warn("appUrlOpen: failed to parse URL", event.url, e);
            }
        });
    }).catch((e) => {
        console.warn("Could not load @capacitor/app for URL handling", e);
    });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

// Capacitor's JS-to-native log bridge serializes objects via JSON.stringify,
// which renders Error instances as "{}" and loses the message+stack. Build
// a plain object of the useful fields before logging so the native side
// (and remote logs) actually show something useful.
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const anyErr = error as Error & { data?: unknown; cause?: unknown; stack?: string };
    if (anyErr.stack) out.stack = String(anyErr.stack).split("\n").slice(0, 5).join("\n");
    if (anyErr.data !== undefined) out.data = anyErr.data;
    if (anyErr.cause !== undefined) out.cause = String(anyErr.cause);
    return out;
  }
  if (typeof error === "object" && error !== null) {
    try { return JSON.parse(JSON.stringify(error)); } catch { /* fall through */ }
  }
  return { value: String(error) };
}

// Catch render-time and async-unhandled errors that the React Query
// handlers below don't see. Without this, exceptions during React
// commit phase show up as anonymous stack frames in the Capacitor log
// with no message attached.
if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
        console.error("[Window Error]", JSON.stringify({
            message: event.message,
            source: event.filename,
            line: event.lineno,
            col: event.colno,
            ...describeError(event.error),
        }));
    });
    window.addEventListener("unhandledrejection", (event) => {
        console.error("[Unhandled Promise]", JSON.stringify(describeError(event.reason)));
    });
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", JSON.stringify({
      queryKey: event.query.queryKey,
      ...describeError(error),
    }));
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", JSON.stringify({
      mutationKey: event.mutation.options.mutationKey,
      ...describeError(error),
    }));
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: getTrpcUrl(),
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

createRoot(document.getElementById("root")!).render(
  <BootErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </BootErrorBoundary>
);
