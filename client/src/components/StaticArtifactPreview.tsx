import React, { useMemo } from "react";

export const STATIC_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "img-src data: blob:",
  "style-src 'unsafe-inline'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "navigate-to 'none'",
].join("; ");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Defense in depth for the Task 1 web preview. The iframe CSP and empty
 * sandbox are the primary boundary; sanitizing also keeps inert controls and
 * navigation out of the preview document itself.
 */
function sanitizeStaticMarkup(markup: string): string {
  return markup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(iframe|object|embed|base|meta|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/<form\b[^>]*>/gi, '<div data-preview-form-disabled="true">')
    .replace(/<\/form\s*>/gi, "</div>")
    .replace(/<a\b[^>]*>/gi, '<span data-preview-link-disabled="true">')
    .replace(/<\/a\s*>/gi, "</span>")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(?:src|href|action|formaction)\s*=\s*(?:"(?:https?:|\/\/)[^"]*"|'(?:https?:|\/\/)[^']*'|(?:https?:|\/\/)[^\s>]*)/gi,
      ""
    )
    .replace(/@import\s+(?:url\()?[^;]+;?/gi, "")
    .replace(/url\(\s*(['"]?)(?:https?:|\/\/)[^)]+\)/gi, "none");
}

export function buildStaticPreviewDocument(markup: string): string {
  const content = sanitizeStaticMarkup(markup);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(STATIC_PREVIEW_CSP)}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Artifact preview</title>
  <style>html { color-scheme: light dark; } body { margin: 0; min-height: 100vh; }</style>
</head>
<body>${content}</body>
</html>`;
}

export interface StaticArtifactPreviewProps {
  html: string;
  title: string;
  className?: string;
}

export function StaticArtifactPreview({
  html,
  title,
  className,
}: StaticArtifactPreviewProps) {
  const source = useMemo(() => buildStaticPreviewDocument(html), [html]);

  return (
    <iframe
      title={title}
      srcDoc={source}
      sandbox=""
      referrerPolicy="no-referrer"
      loading="lazy"
      className={
        className ?? "h-80 w-full rounded-lg border border-border bg-white"
      }
    />
  );
}
