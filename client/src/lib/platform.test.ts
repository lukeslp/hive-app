import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApiBaseUrl,
  getCollaborationWebSocketUrl,
  getPublicWebAppOrigin,
  getPublicWebAppUrl,
  getTrpcUrl,
  isNativeMac,
  supportsArtifactStudio,
  supportsHostedShareCreation,
  supportsLiveCollaboration,
  supportsRindMode,
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

  it.each(["ios", "android"])(
    "preserves the existing %s Capacitor socket origin",
    platform => {
      vi.stubGlobal("window", {
        location: {
          protocol: "capacitor:",
          host: "localhost",
          origin: "capacitor://localhost",
        },
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => platform,
        },
      });

      const socket = getCollaborationWebSocketUrl();
      expect(socket).toBe("ws://localhost/ws/collab");
      expect(socket).not.toContain("ideatiles.app");
    }
  );
});

describe("platform capability policy", () => {
  it.each([
    {
      name: "web",
      windowValue: {
        location: { protocol: "https:", host: "ideatiles.app" },
      },
      artifactStudio: true,
      hostedShare: true,
      liveCollaboration: true,
      rindMode: false,
    },
    {
      name: "native Mac",
      windowValue: {
        location: { protocol: "ideatiles:", host: "app" },
        ideaTilesMac: { capabilities: { nativeMac: true } },
      },
      artifactStudio: true,
      hostedShare: true,
      liveCollaboration: true,
      rindMode: true,
    },
    {
      name: "iOS",
      windowValue: {
        location: { protocol: "capacitor:", host: "localhost" },
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "ios",
        },
      },
      artifactStudio: false,
      hostedShare: false,
      liveCollaboration: false,
      rindMode: false,
    },
    {
      name: "Android",
      windowValue: {
        location: { protocol: "capacitor:", host: "localhost" },
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "android",
        },
      },
      artifactStudio: true,
      hostedShare: false,
      liveCollaboration: false,
      rindMode: false,
    },
  ])(
    "applies the $name capability contract",
    ({
      windowValue,
      artifactStudio,
      hostedShare,
      liveCollaboration,
      rindMode,
    }) => {
      vi.stubGlobal("window", windowValue);

      expect(supportsArtifactStudio()).toBe(artifactStudio);
      expect(supportsHostedShareCreation()).toBe(hostedShare);
      expect(supportsLiveCollaboration()).toBe(liveCollaboration);
      expect(supportsRindMode()).toBe(rindMode);
    }
  );
});
