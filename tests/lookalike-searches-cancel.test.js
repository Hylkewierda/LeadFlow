import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = { row: { id: "s1", status: "scraping" }, updateMatched: 1 };
const updateCalls = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== "lookalike_searches") throw new Error(`unexpected table ${table}`);
      return {
        // Used by the idempotent no-op follow-up: .select().eq().single()
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: mockState.row, error: null }),
          }),
        }),
        update: (patch) => {
          const eqs = [];
          const nots = [];
          const chain = {
            eq: (c, v) => {
              eqs.push([c, v]);
              return chain;
            },
            not: (c, op, v) => {
              nots.push([c, op, v]);
              return chain;
            },
            select: () => ({
              then: (res) => {
                updateCalls.push({ patch, eqs, nots });
                res({
                  data: mockState.updateMatched ? [mockState.row] : [],
                  error: null,
                });
              },
            }),
          };
          return chain;
        },
      };
    },
  }),
}));

beforeEach(() => {
  updateCalls.length = 0;
  mockState.row = { id: "s1", status: "scraping" };
  mockState.updateMatched = 1;
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
});

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

describe("DELETE /api/lookalike-searches (cancel)", () => {
  it("400 when search_id is missing", async () => {
    const handler = (await import("../api/lookalike-searches.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("flags cancel_requested for a non-terminal row and returns cancelling", async () => {
    mockState.updateMatched = 1;
    const handler = (await import("../api/lookalike-searches.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: { search_id: "s1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("cancelling");
    const call = updateCalls.at(-1);
    expect(call.patch.cancel_requested).toBe(true);
    expect(call.eqs).toContainEqual(["id", "s1"]);
    expect(call.nots).toContainEqual(["status", "in", "(completed,failed,cancelled)"]);
  });

  it("is an idempotent no-op for a terminal row, returning its current status", async () => {
    mockState.updateMatched = 0;
    mockState.row = { id: "s1", status: "completed" };
    const handler = (await import("../api/lookalike-searches.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: { search_id: "s1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("completed");
  });
});
