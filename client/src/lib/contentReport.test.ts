import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildContentReport,
  readReportedTiles,
  REPORT_EMAIL,
  REPORT_LIMITS,
  reportClientLabel,
  reportedTileId,
  reportMailto,
  reportText,
  writeReportedTiles,
} from "@/lib/contentReport";
import { APP_VERSION } from "@shared/appBrand";

const root = path.resolve(import.meta.dirname, "../../..");

const report = buildContentReport({
  kind: "tile",
  reason: "false",
  note: "  The fee is wrong.  ",
  title: "Membership Model",
  body: "Charge every member $500 a week.",
  client: reportClientLabel("android"),
});

describe("a content report", () => {
  it("carries the reason, note, text and app version, and nothing else", () => {
    expect(reportText(report)).toBe(
      [
        "Reason: False or misleading",
        "Note: The fee is wrong.",
        `App: android ${APP_VERSION}`,
        "",
        "Reported tile:",
        "Membership Model",
        "",
        "Charge every member $500 a week.",
      ].join("\n")
    );
  });

  it("leaves the note line out when there is no note", () => {
    const plain = buildContentReport({ ...report, note: "   " });
    expect(reportText(plain)).not.toContain("Note:");
  });

  it("is addressed to the contact in the privacy policy", () => {
    const privacy = fs.readFileSync(
      path.join(root, "client/public/privacy.html"),
      "utf8"
    );
    expect(privacy).toContain(`mailto:${REPORT_EMAIL}`);
    const link = reportMailto(report);
    expect(link.startsWith(`mailto:${REPORT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(link)).toContain(
      "Idea Tiles tile report: False or misleading"
    );
    expect(decodeURIComponent(link)).toContain("Charge every member $500");
  });

  it("shortens long text so the email link stays usable", () => {
    const long = buildContentReport({
      ...report,
      kind: "artifact",
      note: "n".repeat(900),
      body: "x".repeat(20_000),
    });
    expect(long.note).toHaveLength(REPORT_LIMITS.note);
    expect(long.body.length).toBeLessThanOrEqual(REPORT_LIMITS.body);
    expect(long.body.endsWith("[shortened]")).toBe(true);
    expect(reportMailto(long).length).toBeLessThan(16_000);
    expect(reportText(long)).toContain("Reported artifact:");
  });

  it("uses the same version as package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    );
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe("reported tiles", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  };

  it("identifies a tile by board, position and text", () => {
    const tile = { text: "Membership Model", description: "Who can borrow." };
    const id = reportedTileId("board.a", "1,0", tile);
    expect(reportedTileId("board.a", "1,0", { ...tile })).toBe(id);
    expect(reportedTileId("board.b", "1,0", tile)).not.toBe(id);
    expect(reportedTileId("board.a", "0,1", tile)).not.toBe(id);
    // A refreshed tile has new text, so it is no longer the reported one.
    expect(
      reportedTileId("board.a", "1,0", { ...tile, text: "Lending Rules" })
    ).not.toBe(id);
  });

  it("stores ids once each and reads them back", () => {
    const storage = memory();
    expect(readReportedTiles(storage)).toEqual([]);
    writeReportedTiles(["a", "b", "a"], storage);
    expect(readReportedTiles(storage)).toEqual(["a", "b"]);
  });

  it("treats unreadable storage as nothing reported", () => {
    expect(
      readReportedTiles({ getItem: () => "{bad", setItem: () => {} })
    ).toEqual([]);
    expect(
      readReportedTiles({ getItem: () => '{"a":1}', setItem: () => {} })
    ).toEqual([]);
  });
});
