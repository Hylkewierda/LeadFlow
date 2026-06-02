import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));

import handler, { buildLookalikeRow } from "../export-lookalike-to-sheet.js";

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

describe("buildLookalikeRow", () => {
  it("emits the full lookalike-row shape with 11 fields in stable order", () => {
    const candidate = {
      linkedin_url: "https://linkedin.com/in/sam",
      linkedin_profile: { name: "Sam Jones", company: "ShopCo", role: "Head of Finance" },
      llm_score: 78,
      llm_reasoning: "Goede ICP-fit op rol + bedrijfstype.",
      llm_qualified_at: "2026-06-01T13:00:00Z",
      lookalike_search_id: "search-1",
      lookalike_sim: 0.6234,
      signal_type: "lookalike",
      signal_context: { query_name: "CFO Amsterdam scale-ups" },
    };
    const searchNameById = new Map([["search-1", "Inno Huizing look-alikes"]]);
    const row = buildLookalikeRow(candidate, searchNameById);
    expect(Object.keys(row)).toEqual([
      "naam",
      "bedrijf",
      "rol",
      "ai_score",
      "lookalike_sim",
      "search_name",
      "reasoning",
      "disqualifier",
      "linkedin_url",
      "exported_at",
    ]);
    expect(row.naam).toBe("Sam Jones");
    expect(row.bedrijf).toBe("ShopCo");
    expect(row.ai_score).toBe("78");
    expect(row.lookalike_sim).toBe("0.62");
    expect(row.search_name).toBe("Inno Huizing look-alikes");
    expect(row.reasoning).toBe("Goede ICP-fit op rol + bedrijfstype.");
    expect(row.disqualifier).toBe("");
  });

  it("falls back to empty fields when llm + sim are missing", () => {
    const candidate = {
      linkedin_url: "u",
      linkedin_profile: { name: "X" },
      llm_score: null,
      llm_qualified_at: null,
      lookalike_search_id: "search-9",
      lookalike_sim: null,
      signal_type: "lookalike",
      signal_context: {},
    };
    const row = buildLookalikeRow(candidate, new Map());
    expect(row.ai_score).toBe("");
    expect(row.lookalike_sim).toBe("");
    expect(row.search_name).toBe("");
    expect(row.reasoning).toBe(""); // formatReasoning returns "" for unknown shapes
  });

  it("flags Actuals-employee disqualifier even on lookalike candidates", () => {
    const candidate = {
      linkedin_url: "u",
      linkedin_profile: { name: "Mole", company: "Actuals" },
      llm_score: 75,
      llm_qualified_at: "2026-06-01T13:00:00Z",
      llm_reasoning: "...",
      lookalike_search_id: "s",
      lookalike_sim: 0.7,
      signal_type: "lookalike",
      signal_context: {},
    };
    const row = buildLookalikeRow(candidate, new Map());
    expect(row.disqualifier).toBe("employee_actuals");
  });
});

describe("POST /api/export-lookalike-to-sheet guards", () => {
  it("returns 405 on non-POST", async () => {
    const res = makeRes();
    await handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when no scope is provided", async () => {
    const res = makeRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/candidateIds|backfillAll|lookalikeSearchId/);
  });

  it("returns 204 on OPTIONS preflight", async () => {
    const res = makeRes();
    await handler({ method: "OPTIONS" }, res);
    expect(res.statusCode).toBe(204);
  });
});
