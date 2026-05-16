/**
 * TemplateContextModal - Customize template with user context before generating
 * Extracted from HiveMindApp.tsx monolith
 */

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/lib/icons";
import type { Template } from "@/lib/templates";

interface TemplateContextModalProps {
  pendingTemplate: Template | null;
  templateContext: string;
  setTemplateContext: (value: string) => void;
  isGenerating: boolean;
  onUseDefault: () => void;
  onGenerate: () => void;
  onClose: () => void;
}

export const TemplateContextModal = ({
  pendingTemplate,
  templateContext,
  setTemplateContext,
  isGenerating,
  onUseDefault,
  onGenerate,
  onClose,
}: TemplateContextModalProps) => {
  if (!pendingTemplate) return null;

  const getPromptLabel = () => {
    switch (pendingTemplate.category) {
      case "product":
        return "What are you building?";
      case "creative":
        return "What's your creative vision?";
      case "business":
        return "What's your business idea?";
      case "research":
        return "What are you researching?";
      default:
        return "What problem are you solving?";
    }
  };

  const getPlaceholder = () => {
    switch (pendingTemplate.category) {
      case "product":
        return "e.g., A mobile app that connects busy professionals with local dog walkers. Key features: real-time GPS tracking, secure payments, and walker reviews.";
      case "creative":
        return "e.g., A sci-fi novel exploring AI consciousness through the eyes of a robot therapist in 2150. Themes: identity, empathy, what it means to be human.";
      case "business":
        return "e.g., A subscription coffee service delivering single-origin beans from small farms. Target: specialty coffee enthusiasts, $30-50/month price point.";
      case "research":
        return "e.g., Investigating the impact of remote work on employee mental health. Focus: tech workers in large companies, 2020-2024 timeframe.";
      default:
        return "Describe your idea in detail. Include goals, constraints, target audience, or any specific aspects you want to explore.";
    }
  };

  return (
    <Modal
      isOpen={!!pendingTemplate}
      onClose={onClose}
      title={pendingTemplate.name || "Customize Template"}
      maxWidth="max-w-[640px]"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <pendingTemplate.icon className="w-12 h-12 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-sm text-muted-foreground">
              {pendingTemplate.description}
            </p>
            <p className="text-xs text-indigo-400 mt-1">
              {pendingTemplate.nodes.length} brainstorming areas to explore
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-card-foreground">
            {getPromptLabel()}
          </label>
          <textarea
            value={templateContext}
            onChange={e => setTemplateContext(e.target.value)}
            placeholder={getPlaceholder()}
            rows={4}
            className="w-full bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            More detail = more relevant brainstorming nodes. Include goals,
            constraints, or specific angles to explore.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onUseDefault}
            variant="outline"
            className="border-border text-muted-foreground hover:text-foreground"
          >
            Use Default
          </Button>
          <Button
            onClick={onGenerate}
            disabled={!templateContext.trim() || isGenerating}
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              "Generate Personalized Map"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
