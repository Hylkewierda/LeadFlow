import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("googleapis", () => ({
  google: { auth: { GoogleAuth: vi.fn() }, sheets: vi.fn() },
}));

import handler, { buildRow, formatReasoning, disqualifierFlag } from "../export-to-sheet.js";

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("disqualifierFlag", () => {
  it("returns empty string for ICP-fit company", () => {
    expect(disqualifierFlag({ company: "ShopCo" })).toBe("");
  });
  it("flags Actuals employees", () => {
    expect(disqualifierFlag({ company: "Actuals" })).toBe("employee_actuals");
  });
  it("flags accountancy firms", () => {
    expect(disqualifierFlag({ company: "AccountancyPlus" })).toBe("finance_dienstverlener");
  });
  it("joins multiple reasons", () => {
    expect(disqualifierFlag({ company: "Actuals Accountancy" })).toBe(
      "employee_actuals; finance_dienstverlener",
    );
  });
  it("handles missing company", () => {
    expect(disqualifierFlag({})).toBe("");
    expect(disqualifierFlag(null)).toBe("");
  });
});

describe("formatReasoning", () => {
  it("formats content signal", () => {
    const c = {
      signal_type: "content",
      signal_context: { posts: [{ title: "Month-end close", author: "Sarah", likes: 87, comments: 23 }] },
    };
    expect(formatReasoning(c)).toContain('Reageerde op post "Month-end close" van Sarah');
    expect(formatReasoning(c)).toContain("87 likes");
  });
  it("formats competitor engagement signal", () => {
    const c = {
      signal_type: "competitor_engagement",
      signal_context: { engagements: [{ engaged_at: "2026-04-18" }] },
    };
    expect(formatReasoning(c)).toContain("Engaged met competitor-content op 2026-04-18");
  });
  it("returns empty when no signal context", () => {
    expect(formatReasoning({ signal_type: "content", signal_context: {} })).toBe("");
  });
});

describe("buildRow", () => {
  it("maps a candidate to the 8-column sheet row", () => {
    const c = {
      linkedin_url: "https://linkedin.com/in/jane",
      linkedin_profile: { name: "Jane Doe", company: "ShopCo", role: "Controller" },
      pre_score: 0.78,
      signal_type: "content",
      signal_context: { posts: [{ title: "X", author: "Y", likes: 5, comments: 1 }] },
    };
    const row = buildRow(c);
    expect(row).toHaveLength(8);
    expect(row[0]).toBe("Jane Doe");
    expect(row[1]).toBe("ShopCo");
    expect(row[2]).toBe("Controller");
    expect(row[3]).toBe("0.78");
    expect(row[5]).toBe(""); // no disqualifier
    expect(row[6]).toBe("https://linkedin.com/in/jane");
  });
  it("falls back to headline when role missing, and flags disqualifier", () => {
    const c = {
      linkedin_url: "u",
      linkedin_profile: { name: "Marc", company: "AccountancyPlus", headline: "Financial Controller" },
      pre_score: null,
      signal_type: "content",
      signal_context: {},
    };
    const row = buildRow(c);
    expect(row[2]).toBe("Financial Controller");
    expect(row[3]).toBe("");
    expect(row[5]).toBe("finance_dienstverlener");
  });
});

describe("POST /api/export-to-sheet guards", () => {
  it("returns 405 on non-POST", async () => {
    const res = makeRes();
    await handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(405);
  });
  it("returns 400 when neither candidateIds nor backfillAll provided", async () => {
    const res = makeRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});
