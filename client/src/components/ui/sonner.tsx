import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Top-center keeps the toast clear of the bottom InspectPanel,
      // bottom-right Minimap, and the bottom-anchored OnboardingTour
      // cards. Was overlapping all three at the previous bottom-right
      // default. Top-center reads naturally in landscape AND portrait.
      position="top-center"
      // Slightly inset from the toolbar — measured at 56px (toolbar
      // height ~44 + 12 breathing room).
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
