import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

const Toaster = ({ ...props }: ToasterProps) => {
  // Read theme from the app's own ThemeContext. shadcn ships this
  // component pre-wired to `next-themes`, which would only work if a
  // <NextThemesProvider> were mounted — we never mounted one, so the
  // original import silently fell back to "system" and toasts ignored
  // the in-app theme toggle. `next-themes` has been removed from
  // package.json; ThemeContext's `theme` is "light" | "dark", which
  // Sonner accepts directly.
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
