import { describe, expect, it } from "vitest";
import { duoSpreadFor, type DuoFoldState } from "./duoSpread";

// The Duo simulator's book pose: inner screen 951 x 669 pt, fold 455.5-495.5.
const book: DuoFoldState = {
  hinge: true,
  pose: "book",
  axis: "vertical",
  fold: { x: 455.5, y: 0, width: 40, height: 669 },
};

describe("duoSpreadFor", () => {
  it("splits the board and the pane at a vertical fold", () => {
    expect(duoSpreadFor(book, 951)).toEqual({
      foldLeft: 455.5,
      foldRight: 495.5,
    });
  });

  it("keeps the same split while a sideways inner screen lies flat", () => {
    expect(
      duoSpreadFor(
        { hinge: true, pose: "flat", axis: "vertical", fold: null },
        951
      )
    ).toEqual({ foldLeft: 455.5, foldRight: 495.5 });
  });

  it("leaves devices without a hinge alone", () => {
    for (const width of [402, 951, 1024, 1280]) {
      expect(duoSpreadFor(undefined, width)).toBeNull();
      expect(
        duoSpreadFor({ hinge: false, pose: null, fold: null }, width)
      ).toBeNull();
    }
  });

  it("leaves the outer screen and the upright inner screen alone", () => {
    expect(
      duoSpreadFor({ hinge: true, pose: "flat", axis: null, fold: null }, 466)
    ).toBeNull();
    expect(
      duoSpreadFor(
        {
          hinge: true,
          pose: "laptop",
          axis: "horizontal",
          fold: { x: 0, y: 455.5, width: 669, height: 40 },
        },
        669
      )
    ).toBeNull();
    expect(
      duoSpreadFor(
        { hinge: true, pose: "flat", axis: "horizontal", fold: null },
        669
      )
    ).toBeNull();
  });

  it("refuses a page too narrow for the board or the pane", () => {
    expect(
      duoSpreadFor(
        { ...book, fold: { x: 300, y: 0, width: 40, height: 669 } },
        951
      )
    ).toBeNull();
  });
});
