/**
 * useProviderSettings Hook
 *
 * Manages LLM provider selection and API key storage. Apple Intelligence
 * is the on-device default on iOS Capacitor builds — it shows up as a
 * first-class provider option, marked as zero-network, and is auto-
 * selected when Foundation Models reports `available: true`. Cloud
 * providers (Gemini / Claude / GPT / Grok / Mistral / Ollama) are the
 * fallback for older devices and the only options on web.
 *
 * Keys are stored in localStorage (never sent to any third party except
 * the provider whose key it is).
 */

import { useState, useCallback, useEffect } from "react";
import { API_KEYS_STORAGE_KEY, PROVIDER_STORAGE_KEY } from "@/lib/hexConstants";
import { buildApiUrl } from "@/lib/api";
import { isCapacitor, getPlatform, isIos } from "@/lib/platform";
import { FoundationModels } from "@/lib/foundationModelsPlugin";

export type Provider =
  | "apple"
  | "gemini"
  | "anthropic"
  | "openai"
  | "grok"
  | "mistral"
  | "ollama";

export interface ProviderConfig {
  id: Provider;
  name: string;
  description: string;
  keyPlaceholder: string;
  keyPrefix: string;
  requiresKey: boolean;
  /** True for providers that aren't applicable on the current platform. Hidden in the picker. */
  iosOnly?: boolean;
  extraFields?: { key: string; label: string; placeholder: string }[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "apple",
    name: "Apple Intelligence",
    description: "On-device. No network, no API key. Requires iPhone 15 Pro / 16+ / iPad with M-series, iOS 26+, Apple Intelligence enabled.",
    keyPlaceholder: "",
    keyPrefix: "",
    requiresKey: false,
    iosOnly: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Fast, capable, free tier available",
    keyPlaceholder: "AIzaSy...",
    keyPrefix: "AIza",
    requiresKey: true,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Excellent reasoning and instruction following",
    keyPlaceholder: "sk-ant-...",
    keyPrefix: "sk-ant",
    requiresKey: true,
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    description: "Versatile and widely used",
    keyPlaceholder: "sk-...",
    keyPrefix: "sk-",
    requiresKey: true,
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    description: "Fast reasoning from xAI",
    keyPlaceholder: "xai-...",
    keyPrefix: "xai-",
    requiresKey: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "European AI, fast and efficient",
    keyPlaceholder: "your-mistral-key",
    keyPrefix: "",
    requiresKey: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally, no API key needed",
    keyPlaceholder: "",
    keyPrefix: "",
    requiresKey: false,
    extraFields: [
      { key: "ollamaHost", label: "Ollama Host", placeholder: "http://localhost:11434" },
      { key: "ollamaModel", label: "Model Name", placeholder: "llama3.2" },
    ],
  },
];

export interface ApiKeys {
  gemini?: string;
  anthropic?: string;
  openai?: string;
  grok?: string;
  mistral?: string;
  ollamaHost?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
}

export interface ServerProviderInfo {
  default: string | null;
  available: Record<string, boolean>;
}

export interface UseProviderSettingsReturn {
  provider: Provider;
  setProvider: (p: Provider) => void;
  apiKeys: ApiKeys;
  setApiKey: (key: keyof ApiKeys, value: string) => void;
  isConfigured: boolean;
  clearKeys: () => void;
  getRequestHeaders: () => Record<string, string>;
  serverProviders: ServerProviderInfo | null;
  /** Apple Intelligence available on this device. Cached per-session. */
  appleIntelligenceAvailable: boolean;
  /** Filtered provider list — drops `iosOnly: true` entries on non-Capacitor builds. */
  visibleProviders: ProviderConfig[];
}

export function useProviderSettings(): UseProviderSettingsReturn {
  const [appleIntelligenceAvailable, setAppleIntelligenceAvailable] = useState(false);

  const [provider, setProviderState] = useState<Provider>(() => {
    // iOS is Apple-Intelligence-only: never read localStorage, never let
    // a stale "gemini" value bleed through from a pre-strip install.
    if (isIos()) return "apple";
    try {
      const saved = localStorage.getItem(PROVIDER_STORAGE_KEY);
      if (saved && PROVIDERS.some((p) => p.id === saved)) {
        return saved as Provider;
      }
    } catch {}
    return "gemini";
  });

  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => {
    try {
      const saved = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [serverProviders, setServerProviders] = useState<ServerProviderInfo | null>(null);

  // Probe Foundation Models availability once on mount. The result is
  // cached for the session in component state and used for both the
  // visible-providers filter and the auto-default fallback.
  useEffect(() => {
    if (!isCapacitor() || getPlatform() !== "ios") return;
    let cancelled = false;
    FoundationModels.isAvailable()
      .then(({ available }) => {
        if (!cancelled) setAppleIntelligenceAvailable(available);
      })
      .catch(() => {
        if (!cancelled) setAppleIntelligenceAvailable(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch server-side provider availability on mount.
  // iOS skips this — there's no provider picker and no cloud calls.
  useEffect(() => {
    if (isIos()) return;
    fetch(buildApiUrl("providers"))
      .then((res) => res.json())
      .then((data: ServerProviderInfo) => {
        setServerProviders(data);
      })
      .catch(() => {
        // Server unavailable — silent. The picker shows what client knows.
      });
  }, []);

  // If the user picked "apple" on a build where Foundation Models isn't
  // available (older iPhone, simulator without AI, web), drop them onto
  // the first server-configured provider so they don't get stuck.
  useEffect(() => {
    if (provider !== "apple") return;
    if (appleIntelligenceAvailable) return;
    if (!serverProviders) return; // Wait for the probe.
    const fallback = (serverProviders.default || "gemini") as Provider;
    setProviderState(fallback);
  }, [provider, appleIntelligenceAvailable, serverProviders]);

  // Persist provider selection
  useEffect(() => {
    try {
      localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    } catch {}
  }, [provider]);

  // Persist API keys
  useEffect(() => {
    try {
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(apiKeys));
    } catch {}
  }, [apiKeys]);

  const setProvider = useCallback((p: Provider) => {
    // iOS is locked to "apple" — ignore any setProvider call (the UI on
    // iOS doesn't expose the picker, but tests/callers might still try).
    if (isIos()) return;
    setProviderState(p);
  }, []);

  const setApiKey = useCallback((key: keyof ApiKeys, value: string) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearKeys = useCallback(() => {
    setApiKeys({});
    try {
      localStorage.removeItem(API_KEYS_STORAGE_KEY);
    } catch {}
  }, []);

  // Check if the current provider is configured
  const isConfigured = (() => {
    const config = PROVIDERS.find((p) => p.id === provider);
    if (!config) return false;

    // Apple Intelligence is configured iff Foundation Models reports available.
    if (provider === "apple") return appleIntelligenceAvailable;

    // Server has a key for this provider? Then it's configured.
    if (serverProviders?.available?.[provider]) return true;

    if (!config.requiresKey) {
      // Ollama needs at least a model name
      return !!(apiKeys.ollamaModel || apiKeys.ollamaHost);
    }
    return !!(
      apiKeys[provider as keyof ApiKeys] &&
      (apiKeys[provider as keyof ApiKeys] as string).trim().length > 0
    );
  })();

  // Build headers to send with API requests. Apple Intelligence never
  // calls the server, so we don't include x-provider:apple — those calls
  // are handled client-side via FoundationModels.generate.
  const getRequestHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (provider === "apple") {
      // No server call should be reaching this point with provider="apple".
      // If it does (e.g. a fallback path), don't send x-provider — let the
      // server pick its own default.
      return headers;
    }

    headers["X-Provider"] = provider;

    const key = apiKeys[provider as keyof ApiKeys] as string | undefined;
    if (key && key.trim()) {
      headers["X-API-Key"] = key;
    }

    // Ollama extra fields
    if (provider === "ollama") {
      if (apiKeys.ollamaHost) headers["X-Ollama-Host"] = apiKeys.ollamaHost;
      if (apiKeys.ollamaModel) headers["X-Ollama-Model"] = apiKeys.ollamaModel;
      if (apiKeys.ollamaApiKey) headers["X-Ollama-API-Key"] = apiKeys.ollamaApiKey;
    }

    return headers;
  }, [provider, apiKeys]);

  // Filter providers shown in the picker:
  // - On non-Capacitor / non-iOS: hide iosOnly entries (so web users
  //   don't see "Apple Intelligence" they can't use).
  // - On iOS: keep "apple" in the list; let isConfigured + the Settings
  //   UI surface whether it's actually available.
  const visibleProviders = PROVIDERS.filter((p) => {
    if (p.iosOnly && (!isCapacitor() || getPlatform() !== "ios")) return false;
    return true;
  });

  return {
    provider,
    setProvider,
    apiKeys,
    setApiKey,
    isConfigured,
    clearKeys,
    getRequestHeaders,
    serverProviders,
    appleIntelligenceAvailable,
    visibleProviders,
  };
}
