import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = { row: { id: "r1", status: "running" }, updateMatched: 1 };
const updateCalls = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== "runs") throw new Error(`unexpected table ${table}`);
      return {
        // Used by the idempotent no-op follow-up select
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: mockState.row, error: null }),
          }),
        }),
        update: (patch) => {
          const eqs = [];
          const chain = {
            eq: (c, v) => {
              eqs.push([c, v]);
              return chain;
            },
            select: () => ({
              then: (res) => {
                updateCalls.push({ patch, eqs });
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
  mockState.row = { id: "r1", status: "running" };
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
  };
}

describe("DELETE /api/runs (cancel)", () => {
  it("400 when run_id is missing", async () => {
    const handler = (await import("../api/runs.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("flags cancel_requested where status=running and returns cancelling", async () => {
    mockState.updateMatched = 1;
    const handler = (await import("../api/runs.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: { run_id: "r1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("cancelling");
    const call = updateCalls.at(-1);
    expect(call.patch.cancel_requested).toBe(true);
    expect(call.eqs).toContainEqual(["id", "r1"]);
    expect(call.eqs).toContainEqual(["status", "running"]);
  });

  it("is an idempotent no-op for a non-running run, returning its current status", async () => {
    mockState.updateMatched = 0;
    mockState.row = { id: "r1", status: "completed" };
    const handler = (await import("../api/runs.js")).default;
    const res = makeRes();
    await handler({ method: "DELETE", query: { run_id: "r1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("completed");
  });
});
