/**
 * TemplatesModal - Browse and select templates
 * Extracted from HiveMindApp.tsx monolith
 */

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { TEMPLATES, TEMPLATE_CATEGORIES, Template } from "@/lib/templates";

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  onSelectTemplate: (template: Template) => void;
}

export const TemplatesModal = ({
  isOpen,
  onClose,
  selectedCategory,
  setSelectedCategory,
  onSelectTemplate,
}: TemplatesModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a Template" maxWidth="max-w-4xl">
      <div className="space-y-6">
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <Button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              className={
                selectedCategory === cat.id
                  ? "bg-yellow-500 text-black"
                  : "border-border text-neutral-300"
              }
              size="sm"
            >
              <cat.icon className="w-4 h-4 mr-2" />
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto scrollbar-none pr-1">
            {TEMPLATES.filter(
              (t) => selectedCategory === "all" || t.category === selectedCategory
            ).map((template) => (
              <div
                key={template.id}
                className="bg-accent/50 border border-border rounded-xl p-5 hover:border-yellow-500/50 hover:bg-accent transition-all cursor-pointer group"
                onClick={() => onSelectTemplate(template)}
              >
                <div className="flex items-start gap-4">
                  <template.icon className="w-10 h-10 text-muted-foreground group-hover:text-yellow-400 transition-colors flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-yellow-400 transition-colors">
                      {template.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{template.nodes.length} nodes</span>
                      <span>•</span>
                      <span className="capitalize">{template.category.replace("-", " ")}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Scroll fade indicator */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-neutral-900 to-transparent pointer-events-none" />
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Templates provide a structured starting point. You can expand and customize them freely.
          </p>
          <Button onClick={onClose} variant="ghost" className="text-muted-foreground">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};
