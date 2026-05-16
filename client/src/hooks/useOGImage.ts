/**
 * useOGImage - Dynamically updates Open Graph meta tags
 *
 * When a session has a thumbnail URL (from cloud save), it sets that as the OG image.
 * This enables rich social share previews when users share their boards.
 */

import { useEffect } from "react";
import { APP_DISPLAY_NAME } from "@shared/appBrand";

export function useOGImage(
  thumbnailUrl: string | null | undefined,
  sessionName?: string
) {
  useEffect(() => {
    if (!thumbnailUrl) return;

    // Update OG image meta tags
    const ogImage = document.getElementById(
      "og-image"
    ) as HTMLMetaElement | null;
    const twitterImage = document.getElementById(
      "twitter-image"
    ) as HTMLMetaElement | null;

    if (ogImage) ogImage.content = thumbnailUrl;
    if (twitterImage) twitterImage.content = thumbnailUrl;

    // Update title if session name provided
    if (sessionName) {
      const ogTitle = document.querySelector(
        'meta[property="og:title"]'
      ) as HTMLMetaElement | null;
      const twitterTitle = document.querySelector(
        'meta[name="twitter:title"]'
      ) as HTMLMetaElement | null;

      const title = `${sessionName} — ${APP_DISPLAY_NAME}`;
      if (ogTitle) ogTitle.content = title;
      if (twitterTitle) twitterTitle.content = title;
    }

    // Set current URL
    const ogUrl = document.querySelector(
      'meta[property="og:url"]'
    ) as HTMLMetaElement | null;
    if (ogUrl) ogUrl.content = window.location.href;
  }, [thumbnailUrl, sessionName]);
}
