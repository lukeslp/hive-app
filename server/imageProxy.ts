/**
 * File Purpose: server-side proxy to the dreamer gateway's image generator, so
 *   the gateway key never reaches the client.
 * Inputs/Outputs: accepts { prompt, model?, provider?, size?, quality? } and
 *   returns the gateway's JSON verbatim.
 *
 * Mirrors createLlmProxyRouter: same reason (a credential that must stay
 * server-side), same shape (a small Router mounted under /api), same test
 * escape hatch for rate limits.
 *
 * The response is passed through unchanged on purpose. The gateway's OpenAPI
 * document declares an empty schema for this response, so its shape is
 * genuinely unknown here — reshaping it would mean inventing a contract. One
 * live call with a real key pins it down; until then the client adapter is the
 * right place to interpret whatever comes back, and this layer stays honest
 * about knowing only that it is JSON.
 *
 * Image generation is metered and paid, unlike the on-device Image Playground
 * path macOS uses, so the rate limit here is deliberately tight.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { ENV } from "./_core/env";

const MAX_PROMPT_LENGTH = 4_000;
const REQUEST_TIMEOUT_MS = 120_000;

const ALLOWED_PROVIDERS = new Set(["openai", "xai"]);
const ALLOWED_SIZES = new Set([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1792",
  "1792x1024",
]);
const ALLOWED_QUALITIES = new Set(["standard", "hd"]);

export interface ImageGenerationRequestBody {
  prompt?: unknown;
  model?: unknown;
  provider?: unknown;
  size?: unknown;
  quality?: unknown;
}

type Validated = {
  prompt: string;
  model?: string;
  provider?: string;
  size?: string;
  quality?: string;
};

/** Exported for tests: the request validation, separate from transport. */
export function validateImageRequest(
  body: ImageGenerationRequestBody
): { ok: true; value: Validated } | { ok: false; message: string } {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return { ok: false, message: "A prompt is required." };
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      ok: false,
      message: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
    };
  }

  const value: Validated = { prompt };

  // Allowlist rather than passthrough: these become part of a paid upstream
  // call, and an unbounded `model` string is a way to spend someone's money on
  // a model they did not choose.
  for (const [field, allowed] of [
    ["provider", ALLOWED_PROVIDERS],
    ["size", ALLOWED_SIZES],
    ["quality", ALLOWED_QUALITIES],
  ] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !allowed.has(raw)) {
      return { ok: false, message: `Unsupported ${field}.` };
    }
    value[field] = raw;
  }

  if (body.model !== undefined) {
    if (typeof body.model !== "string" || body.model.length > 128) {
      return { ok: false, message: "Unsupported model." };
    }
    value.model = body.model;
  }

  return { ok: true, value };
}

export function isImageGenerationConfigured(): boolean {
  return Boolean(ENV.dreamerApiUrl && ENV.dreamerApiKey);
}

export async function requestGatewayImage(
  value: Validated,
  signal?: AbortSignal
): Promise<{ status: number; body: unknown }> {
  const base = ENV.dreamerApiUrl.endsWith("/")
    ? ENV.dreamerApiUrl
    : `${ENV.dreamerApiUrl}/`;
  const url = new URL("v1/llm/images/generate", base).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": ENV.dreamerApiKey,
    },
    body: JSON.stringify(value),
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // A non-JSON body from the gateway is a gateway fault, not a client one.
    return {
      status: 502,
      body: { error: { message: "Image service returned a malformed response." } },
    };
  }
  return { status: response.status, body };
}

export function createImageProxyRouter(): Router {
  const router = Router();
  const skipForTest = () =>
    Boolean(process.env.VITEST || process.env.NODE_ENV === "test");

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForTest,
    message: {
      error: { message: "Too many image requests. Try again later." },
    },
  });

  // Mounted with app.use("/api", ...), so this resolves to /api/images/generate.
  router.post(
    "/images/generate",
    limiter,
    async (req: Request, res: Response) => {
      if (!isImageGenerationConfigured()) {
        // 503, not 500: the deployment is missing configuration, and the
        // message says which so it is actionable rather than mysterious.
        res.status(503).json({
          error: {
            message:
              "Image generation is not configured on this server. Set DREAMER_API_URL and DREAMER_API_KEY.",
          },
        });
        return;
      }

      const validated = validateImageRequest(
        (req.body ?? {}) as ImageGenerationRequestBody
      );
      if (!validated.ok) {
        res.status(400).json({ error: { message: validated.message } });
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const result = await requestGatewayImage(
          validated.value,
          controller.signal
        );
        res.status(result.status).json(result.body);
      } catch (error) {
        const aborted =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        res.status(aborted ? 504 : 502).json({
          error: {
            message: aborted
              ? "Image generation timed out."
              : "Image service is unavailable.",
          },
        });
      } finally {
        clearTimeout(timer);
      }
    }
  );

  return router;
}
