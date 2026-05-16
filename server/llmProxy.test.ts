import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Provider routing tests for the LLM proxy.
// Generation requires a configured provider (server env key or client x-api-key).
// Apple Foundation Models is iOS on-device only (client), not this router.

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

describe("LLM Proxy Router", () => {
  let router: ReturnType<typeof createLlmProxyRouter>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
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

      await layer!.route!.stack[0].handle(req, res, () => {});

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

      await layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._status).toBe(200);
      expect(
        res._json?.candidates?.[0]?.content?.parts?.[0]?.text
      ).toBeTruthy();
      // Confirms it called the Gemini API.
      const calledUrl = mockFetch.mock.calls[0]?.[0];
      expect(String(calledUrl)).toContain("generativelanguage.googleapis.com");
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

      await layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._status).toBe(500);
      expect(res._json?.error?.message).toMatch(/No LLM provider configured/);
    });
  });

  describe("GET /providers", () => {
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
