import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { workspaces: [{ id: "ws-1", slug: "actuals" }], exemplars: [] };
const calls = { updates: [], deletes: [] };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: (_c, slug) => ({ maybeSingle: () => Promise.resolve({ data: state.workspaces.find((w) => w.slug === slug) ?? null, error: null }) }) }) };
      }
      if (table === "qualifier_exemplars") {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: state.exemplars, error: null }) }) }),
          update: (patch) => ({ eq: (_c, id) => { calls.updates.push({ patch, id }); return Promise.resolve({ error: null }); } }),
          delete: () => ({ eq: (_c, id) => { calls.deletes.push(id); return Promise.resolve({ error: null }); } }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function makeReqRes(method, { query } = {}) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return [{ method, body: { pinned: true }, query: query ?? {} }, res];
}

let handler;
beforeEach(async () => {
  state.exemplars = [{ id: "e1", verdict: "GO", company: "ShopCo", pinned: false }];
  calls.updates.length = 0;
  calls.deletes.length = 0;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  handler = (await import("../api/qualifier-exemplars.js")).default;
});

describe("api/qualifier-exemplars", () => {
  it("GET returns the list and a count", async () => {
    const [req, res] = makeReqRes("GET", { query: { workspace: "actuals" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.exemplars[0].id).toBe("e1");
  });

  it("PATCH toggles pinned", async () => {
    const [req, res] = makeReqRes("PATCH", { query: { id: "e1" } });
    await handler(req, res);
    expect(calls.updates[0]).toEqual({ patch: { pinned: true }, id: "e1" });
  });

  it("DELETE removes a row", async () => {
    const [req, res] = makeReqRes("DELETE", { query: { id: "e1" } });
    await handler(req, res);
    expect(calls.deletes).toContain("e1");
  });
});
