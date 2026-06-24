import { describe, it, expect } from "vitest";
import { barSegments } from "../src/lib/crm/format.js";
import { todayISO, addDaysISO, isDue, isOverdue, formatDateNL } from "../src/lib/crm/format.js";

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

describe("follow-up date helpers", () => {
  it("isDue is true for yesterday and today, false for the future", () => {
    expect(isDue(addDaysISO(-1))).toBe(true);
    expect(isDue(todayISO())).toBe(true);
    expect(isDue(addDaysISO(3))).toBe(false);
    expect(isDue(null)).toBe(false);
  });
  it("isOverdue is true only for the past", () => {
    expect(isOverdue(addDaysISO(-1))).toBe(true);
    expect(isOverdue(todayISO())).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });
  it("addDaysISO returns a YYYY-MM-DD string after today", () => {
    expect(addDaysISO(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(addDaysISO(1) > todayISO()).toBe(true);
  });
  it("formatDateNL renders a readable Dutch date", () => {
    expect(formatDateNL("2026-07-01")).toBe("1 jul 2026");
    expect(formatDateNL(null)).toBe("—");
  });
});
