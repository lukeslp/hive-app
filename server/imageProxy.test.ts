import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isImageGenerationConfigured,
  requestGatewayImage,
  validateImageRequest,
} from "./imageProxy";
import { ENV } from "./_core/env";

const originalUrl = ENV.dreamerApiUrl;
const originalKey = ENV.dreamerApiKey;

afterEach(() => {
  (ENV as { dreamerApiUrl: string }).dreamerApiUrl = originalUrl;
  (ENV as { dreamerApiKey: string }).dreamerApiKey = originalKey;
  vi.unstubAllGlobals();
});

describe("validateImageRequest", () => {
  it("requires a non-empty prompt", () => {
    expect(validateImageRequest({}).ok).toBe(false);
    expect(validateImageRequest({ prompt: "   " }).ok).toBe(false);
    expect(validateImageRequest({ prompt: 42 }).ok).toBe(false);
  });

  it("accepts a bare prompt and trims it", () => {
    const result = validateImageRequest({ prompt: "  a cat  " });
    expect(result).toEqual({ ok: true, value: { prompt: "a cat" } });
  });

  it("rejects an over-long prompt", () => {
    const result = validateImageRequest({ prompt: "x".repeat(4_001) });
    expect(result.ok).toBe(false);
  });

  it("allowlists provider, size and quality rather than passing them through", () => {
    // These become part of a paid upstream call; an arbitrary value is a way
    // to spend money on something the user did not choose.
    expect(validateImageRequest({ prompt: "a", provider: "openai" }).ok).toBe(
      true
    );
    expect(validateImageRequest({ prompt: "a", provider: "evil" }).ok).toBe(
      false
    );
    expect(validateImageRequest({ prompt: "a", size: "1024x1024" }).ok).toBe(
      true
    );
    expect(validateImageRequest({ prompt: "a", size: "99999x99999" }).ok).toBe(
      false
    );
    expect(validateImageRequest({ prompt: "a", quality: "hd" }).ok).toBe(true);
    expect(validateImageRequest({ prompt: "a", quality: "ultra" }).ok).toBe(
      false
    );
  });

  it("bounds the model string", () => {
    expect(validateImageRequest({ prompt: "a", model: "x".repeat(129) }).ok).toBe(
      false
    );
    expect(validateImageRequest({ prompt: "a", model: "dall-e-3" }).ok).toBe(
      true
    );
  });

  it("omits absent optional fields instead of sending undefined upstream", () => {
    const result = validateImageRequest({ prompt: "a" });
    expect(result.ok && Object.keys(result.value)).toEqual(["prompt"]);
  });
});

describe("isImageGenerationConfigured", () => {
  it("is false without a key, even though the URL has a default", () => {
    (ENV as { dreamerApiKey: string }).dreamerApiKey = "";
    expect(isImageGenerationConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    (ENV as { dreamerApiUrl: string }).dreamerApiUrl = "https://api.example";
    (ENV as { dreamerApiKey: string }).dreamerApiKey = "sk_test";
    expect(isImageGenerationConfigured()).toBe(true);
  });
});

describe("requestGatewayImage", () => {
  beforeEach(() => {
    (ENV as { dreamerApiUrl: string }).dreamerApiUrl = "https://api.example";
    (ENV as { dreamerApiKey: string }).dreamerApiKey = "sk_test";
  });

  it("sends the key as X-API-Key and never in the body", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await requestGatewayImage({ prompt: "a cat" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/llm/images/generate");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
      "sk_test"
    );
    expect(String(init.body)).not.toContain("sk_test");
  });

  it("builds a correct URL when the base has a trailing slash", async () => {
    (ENV as { dreamerApiUrl: string }).dreamerApiUrl = "https://api.example/";
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await requestGatewayImage({ prompt: "a" });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://api.example/v1/llm/images/generate"
    );
  });

  it("passes the gateway response through verbatim", async () => {
    // The gateway documents no response schema, so reshaping would be
    // inventing a contract. Passthrough is the honest behaviour.
    const payload = { data: [{ url: "https://cdn/x.png" }], anything: 1 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
    await expect(requestGatewayImage({ prompt: "a" })).resolves.toEqual({
      status: 200,
      body: payload,
    });
  });

  it("preserves an upstream error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "no" } }), {
            status: 429,
          })
      )
    );
    const result = await requestGatewayImage({ prompt: "a" });
    expect(result.status).toBe(429);
  });

  it("turns a non-JSON gateway body into a 502 rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>gateway down</html>", { status: 200 }))
    );
    const result = await requestGatewayImage({ prompt: "a" });
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("malformed") },
    });
  });

  it("treats an empty body as an empty object rather than failing to parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    await expect(requestGatewayImage({ prompt: "a" })).resolves.toEqual({
      status: 200,
      body: {},
    });
  });
});
