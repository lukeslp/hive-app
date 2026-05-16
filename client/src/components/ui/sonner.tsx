import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

const Toaster = ({ ...props }: ToasterProps) => {
  // Use the app's own ThemeContext rather than next-themes, which is
  // never mounted in this app — the previous import silently fell back
  // to "system" and toasts inherited whatever the OS preferred, ignoring
  // an in-app theme toggle. ThemeContext's `theme` is already
  // "light" | "dark", which Sonner accepts directly.
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      // Top-center keeps the toast clear of the bottom InspectPanel,
      // bottom-right Minimap, and the bottom-anchored OnboardingTour
      // cards. Was overlapping all three at the previous bottom-right
      // default. Top-center reads naturally in landscape AND portrait.
      position="top-center"
      // Slightly inset from the top toolbar (upper-left hex pill) —
      // measured at 56px (toolbar height ~44 + 12 breathing room).
      offset={{ top: 56 }}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
