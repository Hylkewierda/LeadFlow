import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));

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
  it("maps a candidate to the row object (keys match the n8n -> Sheet mapping)", () => {
    const c = {
      linkedin_url: "https://linkedin.com/in/jane",
      linkedin_profile: { name: "Jane Doe", company: "ShopCo", role: "Controller" },
      pre_score: 0.78,
      signal_type: "content",
      signal_context: { posts: [{ title: "X", author: "Y", likes: 5, comments: 1 }] },
    };
    const row = buildRow(c);
    expect(Object.keys(row)).toEqual([
      "naam",
      "bedrijf",
      "rol",
      "pre_score",
      "ai_score",
      "reasoning",
      "disqualifier",
      "linkedin_url",
      "exported_at",
    ]);
    expect(row.naam).toBe("Jane Doe");
    expect(row.bedrijf).toBe("ShopCo");
    expect(row.rol).toBe("Controller");
    expect(row.pre_score).toBe("0.78");
    expect(row.disqualifier).toBe(""); // no disqualifier
    expect(row.linkedin_url).toBe("https://linkedin.com/in/jane");
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
    expect(row.rol).toBe("Financial Controller");
    expect(row.pre_score).toBe("");
    expect(row.disqualifier).toBe("finance_dienstverlener");
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

describe("buildRow with LLM fields", () => {
  it("emits ai_score from llm_score (rounded) and uses llm_reasoning when llm_qualified_at is set", () => {
    const candidate = {
      linkedin_url: "https://linkedin.com/in/x",
      linkedin_profile: { name: "Jane Doe", headline: "Controller @ ShopCo" },
      signal_type: "content",
      signal_context: {
        posts: [{ title: "Month-end", author: "Sarah", likes: 10, comments: 2 }],
      },
      pre_score: 0.72,
      llm_score: 82.4,
      llm_reasoning:
        "Fits ICP — recente engagement met Recharge-post over month-end automation.",
      llm_qualified_at: "2026-05-24T12:00:00Z",
    };
    const row = buildRow(candidate);
    expect(row.ai_score).toBe("82");
    expect(row.reasoning).toBe(
      "Fits ICP — recente engagement met Recharge-post over month-end automation.",
    );
  });

  it("falls back to factual signal-context reasoning when llm_qualified_at is null", () => {
    const candidate = {
      linkedin_url: "https://linkedin.com/in/x",
      linkedin_profile: { name: "Jane Doe", headline: "Controller @ ShopCo" },
      signal_type: "content",
      signal_context: {
        posts: [
          {
            title: "Month-end",
            author: "Sarah",
            posted_at: "2026-05-15",
            likes: 10,
            comments: 2,
          },
        ],
      },
      pre_score: 0.72,
      llm_score: null,
      llm_reasoning: null,
      llm_qualified_at: null,
    };
    const row = buildRow(candidate);
    expect(row.ai_score).toBe("");
    // formatReasoning includes the post title in its output for content signals.
    expect(row.reasoning).toContain("Month-end");
  });

  it("leaves ai_score empty and falls back when only llm_score is present (no qualified_at)", () => {
    const candidate = {
      linkedin_url: "https://linkedin.com/in/x",
      linkedin_profile: { name: "Jane Doe", headline: "Controller @ ShopCo" },
      signal_type: "content",
      signal_context: { posts: [] },
      pre_score: 0.5,
      llm_score: 50,
      llm_reasoning: "partial",
      llm_qualified_at: null,
    };
    const row = buildRow(candidate);
    expect(row.ai_score).toBe("");
    // Reasoning falls back when qualified_at is missing — even if reasoning is present.
    expect(row.reasoning).not.toBe("partial");
  });
});
