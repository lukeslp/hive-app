import { describe, expect, it, vi, beforeEach } from "vitest";

// We test the pure functions and route logic by importing the module
// and exercising the Express router with mock req/res objects.

// Mock the invokeLLM function
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"subtopics": [{"label": "Test Topic", "type": "concept"}]}' } }],
  }),
}));

// Mock global fetch to simulate provider failures for fallback testing
const originalFetch = globalThis.fetch;
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Simulated provider failure')));

import { createLlmProxyRouter } from "./llmProxy";
import type { Request, Response } from "express";

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

describe("LLM Proxy Router", () => {
  let router: ReturnType<typeof createLlmProxyRouter>;

  beforeEach(() => {
    router = createLlmProxyRouter();
  });

  describe("POST /generate", () => {
    it("returns 400 when contents field is missing", async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      // Find the POST /generate handler
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );
      expect(layer).toBeDefined();

      await layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: "Missing required field: contents" });
    });

    it("calls Manus (built-in) provider by default and returns wrapped response", async () => {
      const req = mockReq({
        headers: {},
        body: {
          contents: [{ parts: [{ text: "What are subtopics of AI?" }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: "application/json" },
          systemInstruction: { parts: [{ text: "You are a brainstorming assistant." }] },
        },
      });
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/generate" && l.route?.methods?.post
      );

      await layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._status).toBe(200);
      expect(res._json).toBeDefined();
      expect(res._json.candidates).toBeDefined();
      expect(res._json.candidates[0].content.parts[0].text).toBeTruthy();
    });

    it("falls back to manus when client requests unconfigured provider", async () => {
      const req = mockReq({
        headers: { "x-provider": "gemini" }, // No GEMINI_API_KEY set
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

      // Should succeed via manus fallback
      expect(res._status).toBe(200);
      expect(res._json.candidates).toBeDefined();
    });
  });

  describe("GET /providers", () => {
    it("returns manus as always available and default", () => {
      const req = mockReq();
      const res = mockRes();

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/providers" && l.route?.methods?.get
      );
      expect(layer).toBeDefined();

      layer!.route!.stack[0].handle(req, res, () => {});

      expect(res._json).toBeDefined();
      expect(res._json.default).toBe("manus");
      expect(res._json.available.manus).toBe(true);
    });
  });

  describe("POST /share & GET /share/:id", () => {
    it("creates a share and retrieves it", () => {
      const shareData = { nodes: { "0,0": { label: "Test", q: 0, r: 0 } } };

      // POST /share
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

      // GET /share/:id
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
