import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApiBaseUrl,
  getCollaborationWebSocketUrl,
  getPublicWebAppOrigin,
  getPublicWebAppUrl,
  getTrpcUrl,
  isNativeMac,
} from "./platform";
import { getLoginUrl } from "@/const";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWindow) vi.stubGlobal("window", originalWindow);
});

describe("native Mac URL resolution", () => {
  it("uses absolute hosted endpoints from the bundled private origin", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "ideatiles:",
        host: "app",
        origin: "null",
      },
      ideaTilesMac: { capabilities: { nativeMac: true } },
    });

    expect(isNativeMac()).toBe(true);
    expect(getApiBaseUrl()).toBe("https://ideatiles.app/api");
    expect(getTrpcUrl()).toBe("https://ideatiles.app/api/trpc");
    expect(getCollaborationWebSocketUrl()).toBe(
      "wss://ideatiles.app/ws/collab"
    );
    expect(getPublicWebAppOrigin()).toBe("https://ideatiles.app");
    expect(getPublicWebAppUrl({ collab: "ROOM01" })).toBe(
      "https://ideatiles.app/?collab=ROOM01"
    );
    expect(getLoginUrl()).toBe("https://ideatiles.app/api/oauth/native-start");
  });

  it("keeps browser API and WebSocket URLs same-origin", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "preview.example",
        origin: "https://preview.example",
      },
    });

    expect(isNativeMac()).toBe(false);
    expect(getApiBaseUrl()).toBe("/api");
    expect(getCollaborationWebSocketUrl()).toBe(
      "wss://preview.example/ws/collab"
    );
  });
});
