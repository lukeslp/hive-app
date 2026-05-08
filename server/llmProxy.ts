/**
 * LLM Proxy Routes for Hexpand
 *
 * Provides /api/generate, /api/providers, /api/share endpoints.
 * Routes generation requests to the configured provider based on either
 * a client-supplied x-provider header + x-api-key, or server-side env
 * keys (GEMINI_API_KEY, ANTHROPIC_API_KEY, etc.).
 *
 * No Manus / Manus Forge / built-in provider — that path was removed.
 * Apple Foundation Models on iOS handles "no key needed" via the
 * client-side foundationModelsPlugin, NOT through this server proxy.
 */

import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────────

type Provider = "gemini" | "anthropic" | "openai" | "grok" | "mistral" | "ollama";

interface NormalizedRequest {
  system: string;
  userText: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
}

// ─── In-memory share store (persists across requests, not across deploys) ───
// For a permanent solution, this should use the database, but for now
// in-memory is fine for the share feature.
const shares = new Map<string, string>();

// ─── Provider Functions ─────────────────────────────────────────────────────

function extractRequest(body: any): NormalizedRequest {
  return {
    system: body.systemInstruction?.parts?.[0]?.text ?? "",
    userText: body.contents?.[0]?.parts?.[0]?.text ?? "",
    temperature: body.generationConfig?.temperature ?? 0.7,
    maxTokens: body.generationConfig?.maxOutputTokens ?? 2048,
    jsonMode: body.generationConfig?.responseMimeType === "application/json",
  };
}

function wrapResponse(text: string): object {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function callGemini(req: NormalizedRequest, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("No Gemini API key provided. Add your key in Settings.");
  const model = "gemini-2.0-flash";

  const body: any = {
    contents: [{ parts: [{ text: req.userText }] }],
    generationConfig: { temperature: req.temperature, maxOutputTokens: req.maxTokens },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.jsonMode) body.generationConfig.responseMimeType = "application/json";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403) throw new Error("Gemini API key is invalid or has been revoked.");
    if (res.status === 429) throw new Error("Gemini rate limit reached. Please wait a moment.");
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callAnthropic(req: NormalizedRequest, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("No Anthropic API key provided. Add your key in Settings.");
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

async function callMistral(req: NormalizedRequest, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("No Mistral API key provided. Add your key in Settings.");
  const model = "mistral-small-latest";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: req.temperature, max_tokens: req.maxTokens }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error("Mistral API key is invalid.");
    throw new Error(`Mistral ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenAI(req: NormalizedRequest, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("No OpenAI API key provided. Add your key in Settings.");
  const model = "gpt-4o-mini";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const body: any = { model, messages, temperature: req.temperature, max_tokens: req.maxTokens };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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

async function callGrok(req: NormalizedRequest, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("No Grok/xAI API key provided. Add your key in Settings.");
  const model = "grok-3-mini-fast";

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const body: any = { model, messages, temperature: req.temperature, max_tokens: req.maxTokens };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
  const host = opts.host || "http://localhost:11434";
  const model = opts.model;
  if (!model) throw new Error("No Ollama model specified. Set the model name in Settings.");

  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.userText });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers,
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
  const ollamaHost = req.headers["x-ollama-host"] as string;
  const ollamaModel = req.headers["x-ollama-model"] as string;
  const ollamaApiKey = req.headers["x-ollama-api-key"] as string;

  const getEnvKey = (p: Provider): string | undefined => {
    switch (p) {
      case "gemini": return process.env.GEMINI_API_KEY;
      case "anthropic": return process.env.ANTHROPIC_API_KEY;
      case "openai": return process.env.OPENAI_API_KEY;
      case "grok": return process.env.XAI_API_KEY;
      case "mistral": return process.env.MISTRAL_API_KEY;
      case "ollama": return process.env.OLLAMA_API_KEY;
      default: return undefined;
    }
  };

  const validProviders: Provider[] = ["gemini", "anthropic", "openai", "grok", "mistral", "ollama"];
  let provider: Provider;
  let apiKey: string | undefined;

  if (validProviders.includes(clientProvider as Provider)) {
    provider = clientProvider as Provider;
    apiKey = clientApiKey || getEnvKey(provider);
  } else {
    // No valid provider chosen; fall back to whichever has a server env
    // key configured. No more Manus default.
    const fallback = validProviders.find((p) => {
      if (p === "ollama") return !!(ollamaModel || process.env.OLLAMA_MODEL);
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
    ollamaHost: ollamaHost || process.env.OLLAMA_HOST,
    ollamaModel: ollamaModel || process.env.OLLAMA_MODEL,
    ollamaApiKey: ollamaApiKey || process.env.OLLAMA_API_KEY,
  };
}

async function callProviderWithContext(
  body: any,
  resolved: ReturnType<typeof resolveProvider>
): Promise<string> {
  const req = extractRequest(body);
  switch (resolved.provider) {
    case "gemini":    return callGemini(req, resolved.apiKey || "");
    case "anthropic": return callAnthropic(req, resolved.apiKey || "");
    case "openai":    return callOpenAI(req, resolved.apiKey || "");
    case "grok":      return callGrok(req, resolved.apiKey || "");
    case "mistral":   return callMistral(req, resolved.apiKey || "");
    case "ollama":    return callOllama(req, {
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

  // Generate endpoint
  apiRouter.post("/generate", async (req: Request, res: Response) => {
    try {
      if (!req.body.contents) {
        return res.status(400).json({ error: "Missing required field: contents" });
      }
      const resolved = resolveProvider(req);
      // No fallback. If the chosen provider fails the error propagates and
      // the client gets a 500 — the client knows to try Apple Foundation
      // Models on iOS or surface an actionable error on web.
      const text = await callProviderWithContext(req.body, resolved);
      res.json(wrapResponse(text));
    } catch (error) {
      console.error("Error in /api/generate:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: { message } });
    }
  });

  // Provider info endpoint. The "default" is whichever provider has a
  // server env key configured (preference order matches the type list).
  // No Manus / built-in entry — Apple Foundation Models is the iOS
  // equivalent and it lives client-side, not here.
  apiRouter.get("/providers", (_req: Request, res: Response) => {
    const available: Record<string, boolean> = {
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      grok: !!process.env.XAI_API_KEY,
      mistral: !!process.env.MISTRAL_API_KEY,
      ollama: !!(process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL),
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
