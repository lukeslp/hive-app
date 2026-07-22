/**
 * File Purpose: Verify Idea Tiles provider routing and public generation limits.
 * Primary Functions: Exercise provider selection, request caps, SSRF containment, and shares.
 * Inputs/Outputs (I/O): Uses mocked Express requests/fetch and asserts structured responses.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createLlmProxyRouter } from "./llmProxy";
import type { Request, Response } from "express";

// Mock fetch globally — provider calls use fetch. Configure per test via mockFetch.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
  };
  return res;
}

function geminiSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"subtopics": [{"label": "Test Topic", "type": "concept"}]}',
              },
            ],
          },
        },
      ],
    }),
    text: async () => "",
  };
}

function ollamaSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      message: { content: '{"subtopics":[{"label":"Safe Topic"}]}' },
    }),
    text: async () => "",
  };
}

describe("LLM Proxy Router", () => {
  let router: ReturnType<typeof createLlmProxyRouter>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of [
      "GEMINI_API_KEY",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "XAI_API_KEY",
      "MISTRAL_API_KEY",
      "OLLAMA_HOST",
      "OLLAMA_MODEL",
      "OLLAMA_API_KEY",
    ]) {
      delete process.env[key];
    }
    router = createLlmProxyRouter();
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("POST /generate", () => {
    it("returns 400 when contents field is missing", async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      expect(layer).toBeDefined();

      // /generate is wrapped in rate-limit middlewares — invoke the
      // actual handler entry (always the last in the route stack)
      // rather than stack[0] (which is now a limiter).
      const handler = layer!.route!.stack.at(-1);
      await handler!.handle(req, res, () => {});

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: "Missing required field: contents" });
    });

    it("uses the first server-configured provider when no x-provider header is sent", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      mockFetch.mockResolvedValueOnce(geminiSuccessResponse());

      const req = mockReq({
        headers: {},
        body: {
          contents: [{ parts: [{ text: "What are subtopics of AI?" }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
          systemInstruction: {
            parts: [{ text: "You are a brainstorming assistant." }],
          },
        },
      });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );

      const handler = layer!.route!.stack.at(-1);
      await handler!.handle(req, res, () => {});

      expect(res._status).toBe(200);
      expect(
        res._json?.candidates?.[0]?.content?.parts?.[0]?.text
      ).toBeTruthy();
      // Confirms it called the Gemini API.
      const calledUrl = mockFetch.mock.calls[0]?.[0];
      expect(String(calledUrl)).toContain("generativelanguage.googleapis.com");
    });

    it("returns 413 when body exceeds the 64KB safety cap", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";

      // Build a payload that's clearly over 64 KB (a 200KB user-text blob).
      const fatText = "x".repeat(200_000);
      const req = mockReq({
        headers: {},
        body: {
          contents: [{ parts: [{ text: fatText }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        },
      });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      const handler = layer!.route!.stack.at(-1);
      await handler!.handle(req, res, () => {});

      expect(res._status).toBe(413);
      expect(res._json?.error?.message).toMatch(/too large/i);
      // Crucially, no upstream provider was contacted.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an oversized body at parse time via the Content-Length guard", async () => {
      // The first middleware on /generate is a Content-Length pre-check that
      // fires before the body is parsed, so an honest oversized request never
      // makes the 50 MB global parser buffer it. This complements the
      // in-handler byte cap above (defense in depth).
      process.env.GEMINI_API_KEY = "test-gemini-key";

      const req = mockReq({
        headers: { "content-length": String(200_000) },
        body: {},
      });
      const res = mockRes();
      let nextCalled = false;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      // stack[0] is the Content-Length guard (head of the route stack).
      const guard = layer!.route!.stack[0];
      await guard.handle(req, res, () => {
        nextCalled = true;
      });

      expect(res._status).toBe(413);
      expect(res._json?.error?.message).toMatch(/too large/i);
      // The guard short-circuits — it must not call next() down the stack.
      expect(nextCalled).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("lets a normally-sized Content-Length pass the parse-time guard", async () => {
      // A small declared length must fall through to the rest of the stack.
      const req = mockReq({
        headers: { "content-length": String(128) },
        body: {},
      });
      const res = mockRes();
      let nextCalled = false;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      const guard = layer!.route!.stack[0];
      await guard.handle(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res._status).toBe(200);
    });

    it("clamps oversized maxOutputTokens server-side so a single call can't drain the env key", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      mockFetch.mockResolvedValueOnce(geminiSuccessResponse());

      const req = mockReq({
        headers: {},
        body: {
          contents: [{ parts: [{ text: "hello" }] }],
          // Pathological: client asks for a million output tokens.
          generationConfig: { temperature: 0.7, maxOutputTokens: 1_000_000 },
        },
      });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      const handler = layer!.route!.stack.at(-1);
      await handler!.handle(req, res, () => {});

      // The upstream call body must have been clamped to the 4096 ceiling.
      expect(mockFetch).toHaveBeenCalled();
      const fetchInit = mockFetch.mock.calls[0]?.[1];
      const upstreamBody = JSON.parse(fetchInit.body);
      expect(upstreamBody.generationConfig.maxOutputTokens).toBe(4096);
      expect(upstreamBody.generationConfig).not.toHaveProperty("temperature");
    });

    it("ignores client-supplied Ollama hosts, models, and credentials", async () => {
      process.env.OLLAMA_HOST = "https://trusted-ollama.example";
      process.env.OLLAMA_MODEL = "trusted-model";
      process.env.OLLAMA_API_KEY = "server-ollama-key";
      mockFetch.mockResolvedValueOnce(ollamaSuccessResponse());

      const req = mockReq({
        headers: {
          "x-provider": "ollama",
          "x-ollama-host": "http://127.0.0.1:3306",
          "x-ollama-model": "untrusted-model",
          "x-ollama-api-key": "client-ollama-key",
        },
        body: {
          contents: [{ parts: [{ text: "hello" }] }],
          generationConfig: { maxOutputTokens: 512 },
        },
      });
      const res = mockRes();
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );

      await layer!.route!.stack.at(-1)!.handle(req, res, () => {});

      expect(res._status).toBe(200);
      expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
        "https://trusted-ollama.example/api/chat"
      );
      const fetchInit = mockFetch.mock.calls[0]?.[1];
      expect(fetchInit.redirect).toBe("error");
      expect(fetchInit.headers.Authorization).toBe("Bearer server-ollama-key");
      expect(fetchInit.headers.Authorization).not.toContain(
        "client-ollama-key"
      );
      expect(JSON.parse(fetchInit.body).model).toBe("trusted-model");
    });

    it("does not treat client Ollama headers as server configuration", async () => {
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;
      delete process.env.OLLAMA_API_KEY;

      const req = mockReq({
        headers: {
          "x-provider": "ollama",
          "x-ollama-host": "http://169.254.169.254",
          "x-ollama-model": "anything",
        },
        body: {
          contents: [{ parts: [{ text: "hello" }] }],
          generationConfig: { maxOutputTokens: 512 },
        },
      });
      const res = mockRes();
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );

      await layer!.route!.stack.at(-1)!.handle(req, res, () => {});

      expect(res._status).toBe(500);
      expect(res._json?.error?.message).toMatch(/Ollama is not configured/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns 500 when no provider is configured anywhere", async () => {
      // Strip every provider env key.
      delete process.env.GEMINI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.XAI_API_KEY;
      delete process.env.MISTRAL_API_KEY;
      delete process.env.OLLAMA_API_KEY;
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;

      const req = mockReq({
        headers: {},
        body: {
          contents: [{ parts: [{ text: "Test" }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        },
      });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );

      const handler = layer!.route!.stack.at(-1);
      await handler!.handle(req, res, () => {});

      expect(res._status).toBe(500);
      expect(res._json?.error?.message).toMatch(/No LLM provider configured/);
    });
  });

  describe("GET /providers", () => {
    it("prefers OpenAI when multiple server providers are configured", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
      process.env.OPENAI_API_KEY = "test-openai-key";

      const req = mockReq();
      const res = mockRes();
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/providers" && l.route?.methods?.get
      );

      layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._json.default).toBe("openai");
    });

    it("lists only standard providers and picks first env-configured key as default", () => {
      delete process.env.GEMINI_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

      const req = mockReq();
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/providers" && l.route?.methods?.get
      );
      expect(layer).toBeDefined();

      layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._json).toBeDefined();
      expect(res._json.default).toBe("anthropic");
      expect(res._json.available.anthropic).toBe(true);
      expect(new Set(Object.keys(res._json.available))).toEqual(
        new Set(["gemini", "anthropic", "openai", "grok", "mistral", "ollama"])
      );
    });

    it("returns null default when no provider env keys are configured", () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.XAI_API_KEY;
      delete process.env.MISTRAL_API_KEY;
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;

      const req = mockReq();
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/providers" && l.route?.methods?.get
      );

      layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._json.default).toBeNull();
    });
  });

  describe("POST /share & GET /share/:id", () => {
    it("creates a share and retrieves it", () => {
      const shareData = { nodes: { "0,0": { label: "Test", q: 0, r: 0 } } };

      const postReq = mockReq({ body: shareData });
      const postRes = mockRes();

      const postLayer = router.stack.find(
        (l: any) => l.route?.path === "/share" && l.route?.methods?.post
      );
      expect(postLayer).toBeDefined();
      postLayer!.route!.stack[0].handle(postReq, postRes, () => {});

      expect(postRes._status).toBe(200);
      expect(postRes._json.id).toBeDefined();
      expect(typeof postRes._json.id).toBe("string");

      const getReq = mockReq({ params: { id: postRes._json.id } });
      const getRes = mockRes();

      const getLayer = router.stack.find(
        (l: any) => l.route?.path === "/share/:id" && l.route?.methods?.get
      );
      expect(getLayer).toBeDefined();
      getLayer!.route!.stack[0].handle(getReq, getRes, () => {});

      expect(getRes._status).toBe(200);
      expect(getRes._json).toEqual(shareData);
    });

    it("returns 404 for non-existent share", () => {
      const req = mockReq({ params: { id: "nonexistent" } });
      const res = mockRes();

      const getLayer = router.stack.find(
        (l: any) => l.route?.path === "/share/:id" && l.route?.methods?.get
      );
      getLayer!.route!.stack[0].handle(req, res, () => {});

      expect(res._status).toBe(404);
    });
  });
});
