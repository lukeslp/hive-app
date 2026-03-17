/**
 * useProviderSettings Hook
 *
 * Manages LLM provider selection and API key storage.
 * "Manus" (built-in) is the default provider and always works without any key.
 * Users can optionally switch to other providers and supply their own API keys.
 * Keys are stored in localStorage (never sent to any third party).
 */

import { useState, useCallback, useEffect } from "react";
import { API_KEYS_STORAGE_KEY, PROVIDER_STORAGE_KEY } from "@/lib/hexConstants";
import { buildApiUrl } from "@/lib/api";

export type Provider = "manus" | "gemini" | "anthropic" | "openai" | "grok" | "mistral" | "ollama";

export interface ProviderConfig {
  id: Provider;
  name: string;
  description: string;
  keyPlaceholder: string;
  keyPrefix: string;
  requiresKey: boolean;
  extraFields?: { key: string; label: string; placeholder: string }[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "manus",
    name: "Built-in AI",
    description: "Works out of the box, no API key needed",
    keyPlaceholder: "",
    keyPrefix: "",
    requiresKey: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Fast, capable, and free tier available",
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
  default: string;
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
}

export function useProviderSettings(): UseProviderSettingsReturn {
  const [provider, setProviderState] = useState<Provider>(() => {
    try {
      const saved = localStorage.getItem(PROVIDER_STORAGE_KEY);
      if (saved && PROVIDERS.some((p) => p.id === saved)) {
        return saved as Provider;
      }
    } catch {}
    return "manus"; // Default to built-in
  });

  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => {
    try {
      const saved = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [serverProviders, setServerProviders] = useState<ServerProviderInfo | null>(null);

  // Fetch server-side provider availability on mount
  useEffect(() => {
    fetch(buildApiUrl("providers"))
      .then((res) => res.json())
      .then((data: ServerProviderInfo) => {
        setServerProviders(data);
      })
      .catch(() => {
        // Server unavailable — manus built-in still works
      });
  }, []);

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

    // Manus built-in is always configured
    if (provider === "manus") return true;

    // Server has a key for this provider? Then it's configured.
    if (serverProviders?.available?.[provider]) return true;

    if (!config.requiresKey) {
      // Ollama needs at least a model name
      return !!(apiKeys.ollamaModel || apiKeys.ollamaHost);
    }
    return !!(apiKeys[provider as keyof ApiKeys] && (apiKeys[provider as keyof ApiKeys] as string).trim().length > 0);
  })();

  // Build headers to send with API requests
  const getRequestHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Provider": provider,
    };

    // Only send client key if user has explicitly set one
    if (provider !== "manus") {
      const key = apiKeys[provider as keyof ApiKeys] as string | undefined;
      if (key && key.trim()) {
        headers["X-API-Key"] = key;
      }
    }

    // Ollama extra fields
    if (provider === "ollama") {
      if (apiKeys.ollamaHost) headers["X-Ollama-Host"] = apiKeys.ollamaHost;
      if (apiKeys.ollamaModel) headers["X-Ollama-Model"] = apiKeys.ollamaModel;
      if (apiKeys.ollamaApiKey) headers["X-Ollama-API-Key"] = apiKeys.ollamaApiKey;
    }

    return headers;
  }, [provider, apiKeys]);

  return {
    provider,
    setProvider,
    apiKeys,
    setApiKey,
    isConfigured,
    clearKeys,
    getRequestHeaders,
    serverProviders,
  };
}
