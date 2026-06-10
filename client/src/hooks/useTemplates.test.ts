/**
 * Tests for parseGeneratedTemplateNodes — the shared parser for the
 * contextual-template generation path (on-device Foundation Models or
 * cloud). This path is part of the iOS privacy contract: the on-device
 * branch must be able to handle fenced/imperfect model output, because
 * on iOS there is no cloud retry.
 */
import { describe, it, expect } from "vitest";
import { parseGeneratedTemplateNodes } from "./useTemplates";

const VALID = JSON.stringify([
  {
    q: 0,
    r: 0,
    text: "Dog Walker App",
    description: "Center",
    type: "concept",
  },
  {
    q: 1,
    r: 0,
    text: "Marketing",
    description: "Reach owners",
    type: "action",
  },
]);

describe("parseGeneratedTemplateNodes", () => {
  it("parses a plain JSON array", () => {
    const nodes = parseGeneratedTemplateNodes(VALID);
    expect(nodes).toHaveLength(2);
    expect(nodes![0].text).toBe("Dog Walker App");
  });

  it("strips ```json code fences (on-device output is not grammar-constrained)", () => {
    const fenced = "```json\n" + VALID + "\n```";
    expect(parseGeneratedTemplateNodes(fenced)).toHaveLength(2);
  });

  it("strips bare ``` fences", () => {
    const fenced = "```\n" + VALID + "\n```";
    expect(parseGeneratedTemplateNodes(fenced)).toHaveLength(2);
  });

  it("returns null for empty input", () => {
    expect(parseGeneratedTemplateNodes("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseGeneratedTemplateNodes("Here are your nodes: ...")).toBeNull();
  });

  it("returns null for a non-array payload", () => {
    expect(parseGeneratedTemplateNodes('{"nodes": []}')).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(parseGeneratedTemplateNodes("[]")).toBeNull();
  });

  it("drops malformed entries and returns null if none survive", () => {
    const junk = JSON.stringify([{ text: "" }, { q: "a", r: 0, text: "x" }]);
    expect(parseGeneratedTemplateNodes(junk)).toBeNull();
  });

  it("keeps valid entries while dropping malformed ones", () => {
    const mixed = JSON.stringify([
      { q: 0, r: 0, text: "Good" },
      { q: null, r: 0, text: "Bad coords" },
      { q: 1, r: -1, text: "Also good", type: "risk" },
    ]);
    const nodes = parseGeneratedTemplateNodes(mixed);
    expect(nodes).toHaveLength(2);
    expect(nodes!.map(n => n.text)).toEqual(["Good", "Also good"]);
  });

  it("tolerates missing optional fields (description, type)", () => {
    const minimal = JSON.stringify([{ q: 0, r: 0, text: "Just text" }]);
    const nodes = parseGeneratedTemplateNodes(minimal);
    expect(nodes).toHaveLength(1);
    expect(nodes![0].description).toBeUndefined();
  });
});
