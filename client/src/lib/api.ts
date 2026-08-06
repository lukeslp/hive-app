import { getApiBaseUrl } from "./platform";

export const buildApiUrl = (path: string) => {
  const cleanPath = path.replace(/^\/+/, "");
  return `${getApiBaseUrl()}/${cleanPath}`;
};

/**
 * Default ceiling for an API request. Generation is the slow case; anything
 * past this is a hung request, not a slow one.
 */
export const DEFAULT_API_TIMEOUT_MS = 120_000;

const abortError = () => new DOMException("Aborted", "AbortError");

/**
 * `fetch` with a deadline that holds on native.
 *
 * `capacitor.config.ts` enables `CapacitorHttp`, which replaces `fetch` on
 * iOS and Android. The replacement forwards only `{url, method, data,
 * dataType, headers}` to the native layer, so `options.signal` is silently
 * dropped for cross-origin non-GET requests — and `getApiBaseUrl()` returns an
 * absolute origin on Capacitor, which makes every API POST exactly that shape.
 * iOS then applies its own 600-second default. An `AbortController` alone
 * therefore passes every browser test and is a no-op in the shipped app: the
 * cancel button appears to do nothing and a hung generation blocks for ten
 * minutes.
 *
 * Racing the request against the caller's signal and an explicit deadline
 * fixes the caller's side on every platform. The signal is still forwarded, so
 * web and same-origin requests cancel the underlying request for real; on
 * native the request may keep running until the native layer gives up. What
 * this guarantees is that the caller stops waiting and sees a normal
 * `AbortError` — the same `DOMException` a real `AbortController` produces, so
 * existing `instanceof DOMException` and `name === "AbortError"` handling in
 * useAIGeneration, useSessionManagement, and HexmindApp keeps working.
 */
export async function fetchApi(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal, ...rest } = init;
  if (signal?.aborted) throw abortError();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    return await Promise.race([
      fetch(url, { ...rest, ...(signal ? { signal } : {}) }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
            ),
          timeoutMs
        );
        if (signal) {
          onAbort = () => reject(abortError());
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
