/**
 * User-facing product strings. Bundle id, domains, URL schemes, and
 * localStorage keys may still use legacy "hexmind"/"hexpand" identifiers.
 */
export const APP_DISPLAY_NAME = "Idea Tiles";
export const APP_TAGLINE = "Brainstorm with local AI";

/** Kebab-case prefix for user-exported filenames (localStorage keys stay `hexpand_*`). */
export const APP_EXPORT_FILE_PREFIX = "idea-tiles";

/** Default HTML / Open Graph title (session-specific pages may append). */
export const APP_OG_TITLE = `${APP_DISPLAY_NAME} — ${APP_TAGLINE}`;

/** Default social / crawler description. */
export const APP_OG_DESCRIPTION =
  "Brainstorm on a hex tile canvas. On supported iPhones, expansions use on-device AI; on web, bring your own API keys.";
