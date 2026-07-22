/**
 * File Purpose: Render Idea Tiles preferences and generation-path status.
 * Primary Components: Accessibility controls, local model delivery, privacy copy.
 * I/O: Receives settings state/callbacks and emits accessible user actions.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Moon,
  Sun,
  Type,
  Sparkles,
  Activity,
  Save,
  Zap,
  Shield,
  Check,
  Trash2,
} from "@/lib/icons";
import type {
  Provider,
  ApiKeys,
  ServerProviderInfo,
  ProviderConfig,
} from "@/hooks/useProviderSettings";
import type {
  GemmaDownloadResult,
  GemmaModelStatus,
} from "@/lib/gemmaPlugin";
import type { AICoreStatus } from "@/lib/aicorePlugin";
import { getPlatform, isCapacitor, isIos } from "@/lib/platform";
import { APP_DISPLAY_NAME } from "@shared/appBrand";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  toggleTheme?: () => void;
  creativity: number;
  setCreativity: (value: number) => void;
  fontSizeMultiplier: number;
  setFontSizeMultiplier: (value: number) => void;
  fontFamily: string;
  setFontFamily: (value: string) => void;
  enableHighContrast: boolean;
  setEnableHighContrast: (value: boolean) => void;
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
  androidGemmaStatus: GemmaModelStatus | null;
  androidAICoreStatus: AICoreStatus | null;
  androidGemmaDownload: GemmaDownloadResult | null;
  isDownloadingAndroidModel: boolean;
  downloadAndroidModel: () => Promise<void>;
  onDeleteBoard: () => void;
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
  fontFamily,
  setFontFamily,
  enableHighContrast,
  setEnableHighContrast,
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
  androidGemmaStatus,
  androidAICoreStatus,
  androidGemmaDownload,
  isDownloadingAndroidModel,
  downloadAndroidModel,
  onDeleteBoard,
}: SettingsModalProps) => {
  const iosOnly = isIos();
  const androidNative = isCapacitor() && getPlatform() === "android";

  const aiControlsAvailable = iosOnly
    ? appleIntelligenceAvailable
    : isProviderConfigured;
  const accessibilityFonts = [
    { id: "system", label: "System" },
    { id: "atkinson", label: "Atkinson" },
    { id: "lexend", label: "Lexend" },
    { id: "open-dyslexic", label: "OpenDyslexic" },
    { id: "aptos", label: "Aptos" },
  ];
  const currentFontIndex = Math.max(
    0,
    accessibilityFonts.findIndex(f => f.id === fontFamily)
  );
  const currentFontLabel =
    accessibilityFonts[currentFontIndex]?.label ?? accessibilityFonts[0].label;
  const cycleFontFamily = () => {
    const next =
      accessibilityFonts[(currentFontIndex + 1) % accessibilityFonts.length];
    setFontFamily(next.id);
  };
  const increaseFontSize = () => {
    setFontSizeMultiplier(
      Math.min(1.5, Math.round((fontSizeMultiplier + 0.05) * 100) / 100)
    );
  };
  const decreaseFontSize = () => {
    setFontSizeMultiplier(
      Math.max(0.8, Math.round((fontSizeMultiplier - 0.05) * 100) / 100)
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-background/95 backdrop-blur-xl border-border/70 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-3xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Settings</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto custom-scrollbar flex-1 space-y-6 py-4">
          {/* Quick controls */}
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="h-11 min-w-11 gap-2"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
                {theme === "dark" ? "Light" : "Dark"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cycleFontFamily}
                className="h-11 gap-2"
                aria-label={`Cycle accessibility font family. Current ${currentFontLabel}`}
              >
                <Type className="w-4 h-4" />
                {currentFontLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={increaseFontSize}
                className="h-11 min-w-11"
                aria-label="Increase font size"
              >
                +
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={decreaseFontSize}
                className="h-11 min-w-11"
                aria-label="Decrease font size"
              >
                -
              </Button>
              <Button
                variant={enableAnimations ? "default" : "outline"}
                size="sm"
                onClick={() => setEnableAnimations(!enableAnimations)}
                className="h-11 gap-2"
                aria-pressed={enableAnimations}
              >
                <Activity className="w-4 h-4" />
                Animations
              </Button>
              <Button
                variant={enableHighContrast ? "default" : "outline"}
                size="sm"
                onClick={() => setEnableHighContrast(!enableHighContrast)}
                className="h-11 gap-2"
                aria-pressed={enableHighContrast}
              >
                <Shield className="w-4 h-4" />
                High Contrast
              </Button>
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

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Font size: {(fontSizeMultiplier * 100).toFixed(0)}%
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteBoard}
                className="w-full h-11 gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Current Board
              </Button>
            </div>
          </section>

          {/* AI setup/status */}
          <section className="space-y-4 border-t border-border/60 pt-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">AI</h3>
              <p className="text-xs text-muted-foreground">Managed AI path</p>
            </div>

            {androidNative && (androidAICoreStatus || androidGemmaStatus) && (
              <div
                className={`space-y-3 rounded-lg border p-3 text-xs ${
                  androidAICoreStatus?.available || androidGemmaStatus?.ready
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-amber-500/20 bg-amber-500/5"
                }`}
                role="status"
                aria-live="polite"
              >
                <p className="text-muted-foreground">
                  {androidAICoreStatus?.available
                    ? "Gemini Nano is ready through Android AICore. Generation tries it first, then the verified Gemma model when installed, before the managed cloud service."
                    : androidGemmaStatus?.ready
                      ? "The verified Gemma model is installed in private device storage. Gemini Nano through Android AICore is checked first; if neither local path can run, the request uses the managed cloud service."
                      : `${androidAICoreStatus?.reason || androidGemmaStatus?.reason || "No local Android model is ready."} Generation tries AICore, then Gemma, then the managed cloud service. Prompts leave the device only for the cloud fallback.`}
                </p>
                {!androidAICoreStatus?.available &&
                  !androidGemmaStatus?.ready &&
                  (androidAICoreStatus?.downloadable ||
                    androidGemmaStatus?.downloadAvailable) && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-11"
                      disabled={isDownloadingAndroidModel}
                      onClick={() => void downloadAndroidModel()}
                    >
                      {isDownloadingAndroidModel
                        ? "Downloading…"
                        : androidAICoreStatus?.downloadable
                          ? "Download Gemini Nano"
                          : "Download local Gemma model"}
                    </Button>
                  )}
                {androidGemmaDownload?.reason && (
                  <p className="text-muted-foreground">
                    {androidGemmaDownload.reason}
                  </p>
                )}
              </div>
            )}

            {iosOnly ? (
              <div
                className={`flex items-start gap-2 text-xs rounded-lg p-3 ${
                  appleIntelligenceAvailable
                    ? "text-muted-foreground bg-emerald-500/5 border border-emerald-500/20"
                    : "text-muted-foreground bg-amber-500/5 border border-amber-500/20"
                }`}
              >
                <Zap
                  className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${appleIntelligenceAvailable ? "text-emerald-400" : "text-amber-400"}`}
                />
                <span>
                  {appleIntelligenceAvailable
                    ? "Apple Intelligence is active on this device. Generation runs entirely on-device — no network, no API key, no data leaves the device."
                    : "Apple Intelligence isn't reachable right now. If it's enabled in iOS Settings → Apple Intelligence & Siri, it may still be warming up — this updates automatically once it's ready."}
                </span>
              </div>
            ) : (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  isProviderConfigured
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {isProviderConfigured ? (
                  <>
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>Generation is ready (managed)</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 flex-shrink-0" />
                    <span>Generation is temporarily unavailable</span>
                  </>
                )}
              </div>
            )}

            {/* AI controls: only when AI path is actually usable on this device. */}
            {aiControlsAvailable ? (
              <div className="space-y-5 border-t border-border/70 pt-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI Creativity
                  </Label>
                  <div className="space-y-2">
                    <Slider
                      value={[creativity]}
                      onValueChange={val => setCreativity(val[0])}
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

                <div className="space-y-3">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Cross-Pollination
                  </Label>
                  <div className="space-y-2">
                    <Slider
                      value={[bridgingIntensity]}
                      onValueChange={val => setBridgingIntensity(val[0])}
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
                      How aggressively the AI connects ideas across distant
                      clusters
                    </p>
                  </div>
                </div>

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
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                AI controls are hidden until an AI path is available on this
                device.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
