/**
 * File Purpose: Provide bounded cloud-generation and share routes for Idea Tiles.
 * Primary Functions: Normalize requests, select providers, enforce limits, and proxy generation.
 * Inputs/Outputs (I/O): Accepts JSON/headers and returns Gemini-shaped JSON or structured errors.
 *
 * Provides /api/generate, /api/providers, /api/share endpoints.
 * Routes generation requests to the configured provider based on either
 * a client-supplied x-provider header + x-api-key, or server-side env
 * keys (GEMINI_API_KEY, ANTHROPIC_API_KEY, etc.).
 *
 * There is no vendor “built-in” cloud model here — on-device Apple Intelligence
 * is handled in the client (foundationModelsPlugin), not this router.
 */

import { Router, Request, Response, NextFunction, json } from "express";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────────

type Provider =
  | "gemini"
  | "anthropic"
  | "openai"
  | "grok"
  | "mistral"
  | "ollama";

interface NormalizedRequest {
  system: string;
  userText: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
  /**
   * OpenAPI-3.0-subset response schema for grammar-constrained decoding.
   * Currently honored only by Gemini (other providers ignore it). Sent
   * by the tile-generation client to enforce the BranchSet shape.
   */
  responseSchema?: unknown;
}

// ─── Public-facing safety limits ────────────────────────────────────────────
//
// The proxy serves six brand domains over a single Node process and falls
// back to server-side env API keys when a tester hasn't pasted their own.
// Without guardrails, anyone who finds the URL can drain the configured key.
// These caps close the no-effort abuse vector; a determined adversary can
// rotate IPs, but the casual / accidental misuse cases are covered.

/** Per-IP requests per minute on /api/generate. */
const GENERATE_RATE_PER_MINUTE = 12;
/** Per-IP requests per hour on /api/generate. */
const GENERATE_RATE_PER_HOUR = 120;
/** Hard cap on request body bytes for /api/generate. */
const GENERATE_MAX_BODY_BYTES = 64 * 1024;
/** Hard server-side ceiling on per-call output tokens. */
const GENERATE_MAX_OUTPUT_TOKENS = 4096;

// ─── In-memory share store (persists across requests, not across deploys) ───
// For a permanent solution, this should use the database, but for now
// in-memory is fine for the share feature.
const shares = new Map<string, string>();

// ─── Provider Functions ─────────────────────────────────────────────────────

function extractRequest(body: any): NormalizedRequest {
  const requestedMax = body.generationConfig?.maxOutputTokens ?? 2048;
  return {
    system: body.systemInstruction?.parts?.[0]?.text ?? "",
    userText: body.contents?.[0]?.parts?.[0]?.text ?? "",
    temperature: body.generationConfig?.temperature ?? 0.7,
    // Clamp server-side so a malicious client can't drain the configured
    // env key with a single fat request (e.g. maxOutputTokens: 1_000_000).
    maxTokens: Math.min(
      Math.max(1, Number(requestedMax) || 2048),
      GENERATE_MAX_OUTPUT_TOKENS
    ),
    jsonMode: body.generationConfig?.responseMimeType === "application/json",
    responseSchema: body.generationConfig?.responseSchema,
  };
}

function wrapResponse(text: string): object {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function callGemini(
  req: NormalizedRequest,
  apiKey: string
): Promise<string> {
  if (!apiKey)
    throw new Error("No Gemini API key provided. Add your key in Settings.");
  const model = "gemini-2.0-flash";

  const body: any = {
    contents: [{ parts: [{ text: req.userText }] }],
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens,
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.jsonMode) body.generationConfig.responseMimeType = "application/json";
  if (req.responseSchema)
    body.generationConfig.responseSchema = req.responseSchema;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403)
      throw new Error("Gemini API key is invalid or has been revoked.");
    if (res.status === 429)
      throw new Error("Gemini rate limit reached. Please wait a moment.");
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callAnthropic(
  req: NormalizedRequest,
  apiKey: string
): Promise<string> {
  if (!apiKey)
    throw new Error("No Anthropic API key provided. Add your key in Settings.");
  const model = "claude-haiku-4-5-20251001";

  const body: any = {
    model,
    messages: [{ role: "user", content: req.userText }],
    max_tokens: req.maxTokens,
    temperature: req.temperature,
  };
  if (req.system) body.system = req.system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error("Anthropic API key is invalid.");
    if (res.status === 429) throw new Error("Anthropic rate limit reached.");
    throw new Error(`Anthropic ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callMistral(
  req: NormalizedRequest,
  apiKey: string
): Promise<string> {
  if (!apiKey)
    throw new Error("No Mistral API key provided. Add your key in Settings.");
  const model = "mistral-small-latest";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error("Mistral API key is invalid.");
    throw new Error(`Mistral ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenAI(
  req: NormalizedRequest,
  apiKey: string
): Promise<string> {
  if (!apiKey)
    throw new Error("No OpenAI API key provided. Add your key in Settings.");
  const model = "gpt-5.6-luna";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const body: any = {
    model,
    messages,
    // GPT-5.6 Luna only accepts its default temperature (1). Sending the
    // normalized 0.7 value makes the API reject otherwise valid requests.
    max_completion_tokens: req.maxTokens,
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error("OpenAI API key is invalid.");
    if (res.status === 429) throw new Error("OpenAI rate limit reached.");
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGrok(
  req: NormalizedRequest,
  apiKey: string
): Promise<string> {
  if (!apiKey)
    throw new Error("No Grok/xAI API key provided. Add your key in Settings.");
  const model = "grok-3-mini-fast";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const body: any = {
    model,
    messages,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error("Grok API key is invalid.");
    if (res.status === 429) throw new Error("Grok rate limit reached.");
    throw new Error(`Grok ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOllama(
  req: NormalizedRequest,
  opts: { host?: string; model?: string; apiKey?: string }
): Promise<string> {
  const host = opts.host;
  const model = opts.model;
  if (!host)
    throw new Error(
      "Ollama is not configured on this server. Set OLLAMA_HOST."
    );
  if (!model)
    throw new Error(
      "Ollama is not configured on this server. Set OLLAMA_MODEL."
    );

  let endpoint: URL;
  try {
    const base = new URL(host);
    if (!["http:", "https:"].includes(base.protocol)) {
      throw new Error("unsupported protocol");
    }
    if (base.username || base.password) {
      throw new Error("credentials in URL are not allowed");
    }
    endpoint = new URL("/api/chat", base);
  } catch {
    throw new Error("OLLAMA_HOST must be a valid HTTP or HTTPS URL.");
  }

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    redirect: "error",
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: req.temperature, num_predict: req.maxTokens },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data.message?.content ?? "";
}

// ─── Provider Resolution ────────────────────────────────────────────────────

function resolveProvider(req: Request): {
  provider: Provider;
  apiKey: string | undefined;
  ollamaHost?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
} {
  const clientProvider = (req.headers["x-provider"] as string) || "";
  const clientApiKey = req.headers["x-api-key"] as string;

  const getEnvKey = (p: Provider): string | undefined => {
    switch (p) {
      case "gemini":
        return process.env.GEMINI_API_KEY;
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      case "grok":
        return process.env.XAI_API_KEY;
      case "mistral":
        return process.env.MISTRAL_API_KEY;
      case "ollama":
        return process.env.OLLAMA_API_KEY;
      default:
        return undefined;
    }
  };

  const validProviders: Provider[] = [
    "openai",
    "gemini",
    "anthropic",
    "grok",
    "mistral",
    "ollama",
  ];
  let provider: Provider;
  let apiKey: string | undefined;

  if (validProviders.includes(clientProvider as Provider)) {
    provider = clientProvider as Provider;
    apiKey = clientApiKey || getEnvKey(provider);
  } else {
    // No valid provider chosen; fall back to whichever has a server env key configured.
    const fallback = validProviders.find(p => {
      if (p === "ollama")
        return !!(process.env.OLLAMA_HOST && process.env.OLLAMA_MODEL);
      return !!getEnvKey(p);
    });
    if (!fallback) {
      throw new Error(
        "No LLM provider configured. Set one of GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, MISTRAL_API_KEY, or OLLAMA_HOST/OLLAMA_MODEL."
      );
    }
    provider = fallback;
    apiKey = getEnvKey(provider);
  }

  return {
    provider,
    apiKey,
    // Never accept client-supplied Ollama routing or credentials. A public
    // relay cannot safely infer the client's localhost, and arbitrary hosts
    // create an SSRF/credential-forwarding boundary. Operators configure one
    // trusted upstream through the service environment.
    ollamaHost: process.env.OLLAMA_HOST,
    ollamaModel: process.env.OLLAMA_MODEL,
    ollamaApiKey: process.env.OLLAMA_API_KEY,
  };
}

async function callProviderWithContext(
  body: any,
  resolved: ReturnType<typeof resolveProvider>
): Promise<string> {
  const req = extractRequest(body);
  switch (resolved.provider) {
    case "gemini":
      return callGemini(req, resolved.apiKey || "");
    case "anthropic":
      return callAnthropic(req, resolved.apiKey || "");
    case "openai":
      return callOpenAI(req, resolved.apiKey || "");
    case "grok":
      return callGrok(req, resolved.apiKey || "");
    case "mistral":
      return callMistral(req, resolved.apiKey || "");
    case "ollama":
      return callOllama(req, {
        host: resolved.ollamaHost,
        model: resolved.ollamaModel,
        apiKey: resolved.ollamaApiKey,
      });
    default:
      throw new Error(`Unknown provider "${resolved.provider}"`);
  }
}

// ─── Express Router ─────────────────────────────────────────────────────────

export function createLlmProxyRouter(): Router {
  const apiRouter = Router();

  // Skip rate limits in test runs so the suite can fire bursts at /generate
  // without tripping a real limiter. Production traffic always passes
  // through the limiters below; vitest sets VITEST=true on every worker.
  const skipForTest = () =>
    Boolean(process.env.VITEST || process.env.NODE_ENV === "test");

  // Reject oversized /generate bodies at the door, before they are buffered.
  // The app-wide express.json parser is mounted with a 50 MB limit (it has to
  // be — /api/share legitimately uploads large boards), but AI prompts never
  // approach that. Mounting these guards at the head of the route means a
  // pathological payload is rejected at parse time rather than after the
  // global parser has already buffered up to 50 MB into memory.
  //
  // Two layers, both pre-handler:
  //   1. contentLengthGuard — fast 413 on a declared Content-Length over cap,
  //      so an honest oversized request never streams a byte.
  //   2. generateBodyParser — a 64 KB-capped JSON parser; if the body lies
  //      about its length (or omits Content-Length), the parser aborts once
  //      it has read past the cap and hands a PayloadTooLargeError to the
  //      error guard below. Skipped under test, where the suite invokes the
  //      handler directly with an already-parsed body.
  const contentLengthGuard = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > GENERATE_MAX_BODY_BYTES) {
      console.warn(
        `[generate] 413 Content-Length ${declared} > ${GENERATE_MAX_BODY_BYTES} cap ip=${req.ip}`
      );
      return res.status(413).json({
        error: {
          message: `Request too large (${declared} bytes > ${GENERATE_MAX_BODY_BYTES} byte cap).`,
        },
      });
    }
    next();
  };

  const generateBodyParser = json({ limit: GENERATE_MAX_BODY_BYTES });

  const generateParseErrorGuard = (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (err && (err as { type?: string }).type === "entity.too.large") {
      console.warn(
        `[generate] 413 body exceeded ${GENERATE_MAX_BODY_BYTES} byte parse cap ip=${req.ip}`
      );
      return res.status(413).json({
        error: {
          message: `Request too large (exceeds ${GENERATE_MAX_BODY_BYTES} byte cap).`,
        },
      });
    }
    if (err) return next(err);
    next();
  };

  const generateMinuteLimiter = rateLimit({
    windowMs: 60_000,
    limit: GENERATE_RATE_PER_MINUTE,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipForTest,
    message: {
      error: {
        message: `Too many AI requests — try again in a moment. (Limit: ${GENERATE_RATE_PER_MINUTE}/min per IP.)`,
      },
    },
    // Log every trip so the control is observable in prod logs without
    // having to reproduce the abuse. The body is never touched here.
    handler: (req, res, _next, options) => {
      console.warn(
        `[generate] 429 per-minute limit hit ip=${req.ip} (${GENERATE_RATE_PER_MINUTE}/min)`
      );
      res.status(options.statusCode).json(options.message);
    },
  });

  const generateHourLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: GENERATE_RATE_PER_HOUR,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipForTest,
    message: {
      error: {
        message: `Hourly AI rate limit reached — please try again later. (Limit: ${GENERATE_RATE_PER_HOUR}/hour per IP.)`,
      },
    },
    handler: (req, res, _next, options) => {
      console.warn(
        `[generate] 429 per-hour limit hit ip=${req.ip} (${GENERATE_RATE_PER_HOUR}/hour)`
      );
      res.status(options.statusCode).json(options.message);
    },
  });

  // Generate endpoint
  apiRouter.post(
    "/generate",
    contentLengthGuard,
    generateBodyParser,
    generateParseErrorGuard,
    generateMinuteLimiter,
    generateHourLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!req.body.contents) {
          return res
            .status(400)
            .json({ error: "Missing required field: contents" });
        }
        // Pathological payloads get rejected before we ever resolve a
        // provider or burn a token. The global 50 MB body parser exists
        // for /api/share which legitimately needs it; AI generation never
        // does. 64 KB is roughly 16k tokens of prompt — comfortably above
        // any real tester usage.
        const bodyBytes = JSON.stringify(req.body).length;
        if (bodyBytes > GENERATE_MAX_BODY_BYTES) {
          console.warn(
            `[generate] 413 in-handler cap ${bodyBytes} > ${GENERATE_MAX_BODY_BYTES} bytes ip=${req.ip}`
          );
          return res.status(413).json({
            error: {
              message: `Request too large (${bodyBytes} bytes > ${GENERATE_MAX_BODY_BYTES} byte cap).`,
            },
          });
        }
        const resolved = resolveProvider(req);
        // No fallback. If the chosen provider fails the error propagates and
        // the client gets a 500 — the client knows to try Apple Foundation
        // Models on iOS or surface an actionable error on web.
        const text = await callProviderWithContext(req.body, resolved);
        res.json(wrapResponse(text));
      } catch (error) {
        console.error("Error in /api/generate:", error);
        const message =
          error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: { message } });
      }
    }
  );

  // Provider info endpoint. The "default" is whichever provider has a
  // server env key configured (preference order matches the type list).
  // Apple Foundation Models is iOS-only and lives client-side, not here.
  apiRouter.get("/providers", (_req: Request, res: Response) => {
    const available: Record<string, boolean> = {
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      grok: !!process.env.XAI_API_KEY,
      mistral: !!process.env.MISTRAL_API_KEY,
      ollama: !!(process.env.OLLAMA_HOST && process.env.OLLAMA_MODEL),
    };
    const defaultProvider =
      Object.entries(available).find(([, v]) => v)?.[0] ?? null;
    res.json({
      default: defaultProvider,
      available,
    });
  });

  // Share endpoints (in-memory store)
  apiRouter.post("/share", (req: Request, res: Response) => {
    try {
      const json = JSON.stringify(req.body);
      if (json.length > 500_000) {
        return res.status(413).json({ error: "Session too large" });
      }
      const id = nanoid(8);
      shares.set(id, json);
      res.json({ id });
    } catch (error) {
      console.error("Error saving share:", error);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  apiRouter.get("/share/:id", (req: Request, res: Response) => {
    const data = shares.get(req.params.id);
    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      res.json(JSON.parse(data));
    } catch {
      res.status(500).json({ error: "Failed to read" });
    }
  });

  return apiRouter;
}
