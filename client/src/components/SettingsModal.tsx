/**
 * SettingsModal - User preferences and API key management
 * Extracted from HiveMindApp.tsx monolith, extended with provider settings
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Moon, Sun, Type, Sparkles, Activity, Save, Zap,
  Key, Eye, EyeOff, Shield, Check, AlertTriangle, Server,
} from "@/lib/icons";
import type { Provider, ApiKeys, ServerProviderInfo, ProviderConfig } from "@/hooks/useProviderSettings";
import { isIos } from "@/lib/platform";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  toggleTheme?: () => void;
  creativity: number;
  setCreativity: (value: number) => void;
  fontSizeMultiplier: number;
  setFontSizeMultiplier: (value: number) => void;
  enableAnimations: boolean;
  setEnableAnimations: (value: boolean) => void;
  enableAutoSave: boolean;
  setEnableAutoSave: (value: boolean) => void;
  enableSmartExpansion: boolean;
  setEnableSmartExpansion: (value: boolean) => void;
  bridgingIntensity: number;
  setBridgingIntensity: (value: number) => void;
  // Provider settings
  provider: Provider;
  setProvider: (p: Provider) => void;
  apiKeys: ApiKeys;
  setApiKey: (key: keyof ApiKeys, value: string) => void;
  isProviderConfigured: boolean;
  clearKeys: () => void;
  serverProviders: ServerProviderInfo | null;
  appleIntelligenceAvailable: boolean;
  visibleProviders: ProviderConfig[];
}

export const SettingsModal = ({
  isOpen,
  onClose,
  theme,
  toggleTheme,
  creativity,
  setCreativity,
  fontSizeMultiplier,
  setFontSizeMultiplier,
  enableAnimations,
  setEnableAnimations,
  enableAutoSave,
  setEnableAutoSave,
  enableSmartExpansion,
  setEnableSmartExpansion,
  bridgingIntensity,
  setBridgingIntensity,
  provider,
  setProvider,
  apiKeys,
  setApiKey,
  isProviderConfigured,
  clearKeys,
  serverProviders,
  appleIntelligenceAvailable,
  visibleProviders,
}: SettingsModalProps) => {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"general" | "ai">("ai");
  const iosOnly = isIos();

  const fontSizeOptions = [
    { value: 0.85, label: "Small" },
    { value: 1.0, label: "Medium" },
    { value: 1.15, label: "Large" },
    { value: 1.3, label: "Extra Large" },
  ];

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const maskKey = (key: string | undefined) => {
    if (!key) return "";
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••" + key.slice(-4);
  };

  const currentProviderConfig = visibleProviders.find((p) => p.id === provider);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground">Settings</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Customize your Hexmind experience
          </DialogDescription>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "ai"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Key className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
            AI Provider
          </button>
          <button
            onClick={() => setActiveTab("general")}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "general"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            General
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 space-y-6 py-4">
          {activeTab === "ai" ? (
            <>
              {iosOnly ? (
                /* iOS: Apple-Intelligence-only — no provider picker, no API key fields. */
                <div className={`flex items-start gap-2 text-xs rounded-lg p-3 ${
                  appleIntelligenceAvailable
                    ? "text-muted-foreground bg-emerald-500/5 border border-emerald-500/20"
                    : "text-muted-foreground bg-amber-500/5 border border-amber-500/20"
                }`}>
                  <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${appleIntelligenceAvailable ? "text-emerald-400" : "text-amber-400"}`} />
                  <span>
                    {appleIntelligenceAvailable
                      ? "Apple Intelligence is active on this device. Generation runs entirely on-device — no network, no API key, no data leaves the device."
                      : "Apple Intelligence isn't available here. Needs iPhone 15 Pro / 16+ / iPad with M-series, iOS 26+, and Apple Intelligence enabled in Settings → Apple Intelligence & Siri."}
                  </span>
                </div>
              ) : (
                <>
                  {/* Provider Status */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isProviderConfigured
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    {isProviderConfigured ? (
                      <>
                        <Check className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {currentProviderConfig?.name} is ready
                          {serverProviders?.available?.[provider] && !(apiKeys[provider as keyof ApiKeys] as string)?.trim()
                            ? " (server-provided)"
                            : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>Add your API key to enable AI expansion</span>
                      </>
                    )}
                  </div>

                  {/* Provider Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      AI Provider
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {visibleProviders.map((p) => {
                        const isApple = p.id === "apple";
                        const hasClientKey = p.requiresKey
                          ? !!(apiKeys[p.id as keyof ApiKeys] as string)?.trim()
                          : !!(apiKeys.ollamaModel || apiKeys.ollamaHost);
                        const hasServerKey = !!serverProviders?.available?.[p.id];
                        const isReady = isApple
                          ? appleIntelligenceAvailable
                          : hasClientKey || hasServerKey;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setProvider(p.id)}
                            className={`relative flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                              provider === p.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border hover:border-muted-foreground/30"
                            } ${isApple && !appleIntelligenceAvailable ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="text-sm font-medium text-foreground">{p.name}</span>
                              <span className="ml-auto flex items-center gap-1">
                                {isApple && appleIntelligenceAvailable && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">on-device</span>
                                )}
                                {isApple && !appleIntelligenceAvailable && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">unavailable</span>
                                )}
                                {!isApple && hasServerKey && !hasClientKey && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">hosted</span>
                                )}
                                {isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                )}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground leading-tight">
                              {p.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* API Key Input */}
                  {currentProviderConfig && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        {currentProviderConfig.requiresKey ? "API Key" : "Configuration"}
                      </Label>

                      {provider === "apple" ? (
                        <div className={`flex items-start gap-2 text-xs rounded-lg p-3 ${
                          appleIntelligenceAvailable
                            ? "text-muted-foreground bg-emerald-500/5 border border-emerald-500/20"
                            : "text-muted-foreground bg-amber-500/5 border border-amber-500/20"
                        }`}>
                          <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${appleIntelligenceAvailable ? "text-emerald-400" : "text-amber-400"}`} />
                          <span>
                            {appleIntelligenceAvailable
                              ? "Apple Intelligence is active on this device. Generation runs entirely on-device — no network, no API key, no data leaves the device."
                              : "Apple Intelligence isn't available here. Needs iPhone 15 Pro / 16+ / iPad with M-series, iOS 26+, and Apple Intelligence enabled in Settings → Apple Intelligence & Siri. Pick a cloud provider below to fall back."}
                          </span>
                        </div>
                      ) : currentProviderConfig.requiresKey ? (
                        <div className="relative">
                          <Input
                            type={showKeys[provider] ? "text" : "password"}
                            value={apiKeys[provider as keyof ApiKeys] as string || ""}
                            onChange={(e) => setApiKey(provider as keyof ApiKeys, e.target.value)}
                            placeholder={currentProviderConfig.keyPlaceholder}
                            className="pr-10 font-mono text-sm bg-background"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(provider)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showKeys[provider] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ) : null}

                      {/* Ollama extra fields */}
                      {currentProviderConfig.extraFields?.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{field.label}</Label>
                          <Input
                            type="text"
                            value={(apiKeys as any)[field.key] || ""}
                            onChange={(e) => setApiKey(field.key as keyof ApiKeys, e.target.value)}
                            placeholder={field.placeholder}
                            className="font-mono text-sm bg-background"
                          />
                        </div>
                      ))}

                      {/* Security note */}
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          Keys are stored locally in your browser and sent only to the Hexmind server
                          for proxying. They are never logged or shared with third parties.
                        </span>
                      </div>

                      {/* Clear all keys */}
                      {Object.values(apiKeys).some((v) => v && v.trim()) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearKeys}
                          className="text-destructive hover:text-destructive"
                        >
                          Clear all saved keys
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Creativity slider (fits better in AI tab) */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Creativity
                </Label>
                <div className="space-y-2">
                  <Slider
                    value={[creativity]}
                    onValueChange={(val) => setCreativity(val[0])}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Focused</span>
                    <span>{(creativity * 100).toFixed(0)}%</span>
                    <span>Creative</span>
                  </div>
                </div>
              </div>

              {/* Bridging Intensity */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Cross-Pollination
                </Label>
                <div className="space-y-2">
                  <Slider
                    value={[bridgingIntensity]}
                    onValueChange={(val) => setBridgingIntensity(val[0])}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Focused</span>
                    <span>{(bridgingIntensity * 100).toFixed(0)}%</span>
                    <span>Bridge</span>
                  </div>
                  <p className="text-xs text-muted-foreground/60">
                    How aggressively the AI connects ideas across distant clusters
                  </p>
                </div>
              </div>

              {/* Smart Expansion */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Smart Expansion
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-expand nodes with context
                  </p>
                </div>
                <Switch
                  checked={enableSmartExpansion}
                  onCheckedChange={setEnableSmartExpansion}
                />
              </div>
            </>
          ) : (
            <>
              {/* Theme */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  Theme
                </Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {theme === "dark" ? "Dark Mode" : "Light Mode"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleTheme}
                    className="gap-2"
                  >
                    {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    Switch to {theme === "dark" ? "Light" : "Dark"}
                  </Button>
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Font Size
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {fontSizeOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={fontSizeMultiplier === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFontSizeMultiplier(option.value)}
                      className="text-xs"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {(fontSizeMultiplier * 100).toFixed(0)}%
                </p>
              </div>

              {/* Animations */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Animations
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable smooth transitions
                  </p>
                </div>
                <Switch
                  checked={enableAnimations}
                  onCheckedChange={setEnableAnimations}
                />
              </div>

              {/* Auto-Save */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Auto-Save
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically save your work
                  </p>
                </div>
                <Switch
                  checked={enableAutoSave}
                  onCheckedChange={setEnableAutoSave}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
