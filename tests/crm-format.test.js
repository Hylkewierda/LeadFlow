import { describe, it, expect } from "vitest";
import { barSegments } from "../src/lib/crm/format.js";

describe("barSegments", () => {
  it("splits proportionally", () => {
    expect(barSegments(2, 1, 1)).toEqual({ won: 50, lost: 25, open: 25 });
  });
  it("is all zero when empty", () => {
    expect(barSegments(0, 0, 0)).toEqual({ won: 0, lost: 0, open: 0 });
  });
  it("handles a single segment", () => {
    expect(barSegments(1, 0, 0)).toEqual({ won: 100, lost: 0, open: 0 });
  });
});
