// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { saveBlob } from "@/lib/saveBlob";

afterEach(() => {
  delete window.ideaTilesMac;
  Reflect.deleteProperty(URL, "createObjectURL");
});

describe("saveBlob on native Mac", () => {
  it("uses the bounded native save panel without blob URL navigation", async () => {
    const save = vi.fn(async () => ({ saved: true }));
    window.ideaTilesMac = {
      capabilities: { nativeMac: true },
      fileExports: { save },
    };
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });

    await saveBlob(
      new Blob(["{}"], { type: "application/json" }),
      "idea-tiles.json"
    );

    expect(save).toHaveBeenCalledWith({
      filename: "idea-tiles.json",
      mimeType: "application/json",
      data: "e30=",
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
