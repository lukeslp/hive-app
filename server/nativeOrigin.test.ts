import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { nativeOriginMiddleware } from "./nativeOrigin";

function response() {
  const headers = new Map<string, string>();
  return {
    headers,
    statusCode: 200,
    setHeader: (key: string, value: string) => headers.set(key, value),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end: vi.fn(),
  };
}

describe("Mac bundled-origin API access", () => {
  it("allows credentialed API preflights only from the private app origin", () => {
    const res = response();
    const next = vi.fn() as NextFunction;
    nativeOriginMiddleware(
      {
        method: "OPTIONS",
        path: "/api/trpc/artifacts.upsert",
        headers: { origin: "ideatiles://app" },
      } as unknown as Request,
      res as unknown as Response,
      next
    );

    expect(res.statusCode).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "ideatiles://app"
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not grant cross-origin access to untrusted origins", () => {
    const res = response();
    const next = vi.fn() as NextFunction;
    nativeOriginMiddleware(
      {
        method: "GET",
        path: "/api/trpc/auth.me",
        headers: { origin: "https://attacker.example" },
      } as unknown as Request,
      res as unknown as Response,
      next
    );

    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });
});
