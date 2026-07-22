import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  STATIC_PREVIEW_CSP,
  StaticArtifactPreview,
  buildStaticPreviewDocument,
} from "@/components/StaticArtifactPreview";

describe("static artifact preview security", () => {
  it("uses a deny-by-default CSP with no network, forms, or navigation", () => {
    expect(STATIC_PREVIEW_CSP).toContain("default-src 'none'");
    expect(STATIC_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(STATIC_PREVIEW_CSP).toContain("script-src 'none'");
    expect(STATIC_PREVIEW_CSP).toContain("form-action 'none'");
    expect(STATIC_PREVIEW_CSP).toContain("navigate-to 'none'");
  });

  it("removes bridge access, scripts, forms, handlers, and external navigation", () => {
    const document = buildStaticPreviewDocument(`
      <h1 onclick="fetch('/private-board')">Prototype</h1>
      <script>window.webkit.messageHandlers.ideaTiles.postMessage(parent.localStorage)</script>
      <form action="https://example.com"><input name="secret"></form>
      <a href="https://example.com" target="_blank">Leave</a>
      <img src="https://example.com/tracker.png" onerror="alert(1)">
    `);

    expect(document).not.toMatch(/<script/i);
    expect(document).not.toContain("messageHandlers");
    expect(document).not.toMatch(/<form/i);
    expect(document).not.toMatch(/\sonclick=|\sonerror=/i);
    expect(document).not.toMatch(/<a\b|https:\/\/example\.com/i);
    expect(document).toContain("Prototype");
  });

  it("renders an opaque, scriptless iframe without bridge or board props", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StaticArtifactPreview, {
        title: "Prototype preview",
        html: "<main>Safe preview</main>",
      })
    );

    expect(markup).toContain('sandbox=""');
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).not.toContain("allow-scripts");
    expect(markup).not.toContain("allow-same-origin");
  });
});
