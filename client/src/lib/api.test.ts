import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchApi } from "./api";

/**
 * These tests model the native failure, not the browser one. CapacitorHttp
 * replaces `fetch` on iOS and drops `options.signal` for cross-origin non-GET
 * requests, so the stub below deliberately ignores the signal it is handed —
 * exactly like the shipped native layer. A `fetch` that honoured the signal
 * would pass these tests even with the bug present, which is why the stub must
 * ignore it.
 */
const nativeFetchThatIgnoresSignal = (delayMs: number) =>
  vi.fn(
    () =>
      new Promise<Response>(resolve => {
        setTimeout(() => resolve(new Response("late")), delayMs);
      })
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchApi", () => {
  it("rejects with AbortError when the caller aborts, even though the native layer ignored the signal", async () => {
    vi.stubGlobal("fetch", nativeFetchThatIgnoresSignal(600_000));
    const controller = new AbortController();

    const pending = fetchApi("https://ideatiles.app/api/generate", {
      method: "POST",
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError"
    );
  });

  it("produces an abort the existing handlers recognise", async () => {
    vi.stubGlobal("fetch", nativeFetchThatIgnoresSignal(600_000));
    const controller = new AbortController();
    const pending = fetchApi("https://ideatiles.app/api/generate", {
      method: "POST",
      signal: controller.signal,
    });
    controller.abort();

    const error = await pending.catch((e: unknown) => e);
    // useSessionManagement checks instanceof DOMException; useAIGeneration and
    // HexmindApp check instanceof Error with name AbortError. All must hold.
    expect(error).toBeInstanceOf(DOMException);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });

  it("rejects when the deadline passes rather than waiting on the native 600s default", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", nativeFetchThatIgnoresSignal(600_000));

    const pending = fetchApi("https://ideatiles.app/api/generate", {
      method: "POST",
      timeoutMs: 1_000,
    });
    const settled = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_001);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out after 1s/);
  });

  it("rejects immediately when handed an already-aborted signal", async () => {
    const fetchSpy = nativeFetchThatIgnoresSignal(0);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fetchApi("https://ideatiles.app/api/generate", {
        method: "POST",
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(DOMException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves normally and cleans up when the request beats the deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("ok")))
    );
    const controller = new AbortController();

    const response = await fetchApi("https://ideatiles.app/api/generate", {
      method: "POST",
      signal: controller.signal,
      timeoutMs: 5_000,
    });

    expect(await response.text()).toBe("ok");
    // A leaked abort listener would keep the controller alive after settle.
    expect(controller.signal.aborted).toBe(false);
  });

  it("still forwards the signal so web and same-origin requests cancel for real", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("ok")));
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new AbortController();

    await fetchApi("/api/generate", {
      method: "POST",
      signal: controller.signal,
    });

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      signal: controller.signal,
    });
  });
});
